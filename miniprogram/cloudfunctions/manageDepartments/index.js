// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function normalizeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\r/g, '').trim();
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row.some((c) => c && String(c).trim())) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += ch;
  }

  // last field
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function batchUpsertDepartments(departments) {
  if (!departments || departments.length === 0) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;

  // 分批处理（云函数/数据库限制）
  const chunkSize = 50;
  for (let i = 0; i < departments.length; i += chunkSize) {
    const chunk = departments.slice(i, i + chunkSize);
    const promises = [];

    for (let idx = 0; idx < chunk.length; idx++) {
      const dept = chunk[idx];
      const name = normalizeText(dept.name);
      const order = typeof dept.order === 'number' ? dept.order : i + idx + 1;
      if (!name) continue;

      // 查询是否已存在
      const existed = await db.collection('departments').where({ name }).limit(1).get();
      if (existed.data && existed.data.length > 0) {
        const id = existed.data[0]._id;
        // 更新现有部门
        promises.push(
          db.collection('departments').doc(id).update({
            data: {
              name,
              order,
              updatedAt: db.serverDate(),
            }
          }).then(() => { updated++; })
        );
      } else {
        // 添加新部门
        promises.push(
          db.collection('departments').add({
            data: {
              name,
              order,
              createdAt: db.serverDate(),
              updatedAt: db.serverDate(),
            }
          }).then(() => { inserted++; })
        );
      }
    }

    // 并行执行当前批次
    await Promise.all(promises);
  }

  return { inserted, updated };
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, department, departmentId, departments, fileID } = event;

  try {
    // 添加部门
    if (action === 'add' && department) {
      const name = normalizeText(department.name);
      if (!name) {
        return { success: false, message: '部门名称不能为空' };
      }
      
      // 检查是否已存在
      const existed = await db.collection('departments').where({ name }).limit(1).get();
      if (existed.data && existed.data.length > 0) {
        return { success: false, message: '部门已存在' };
      }
      
      // 获取最大order值
      const allDepts = await db.collection('departments').orderBy('order', 'desc').limit(1).get();
      const maxOrder = allDepts.data && allDepts.data.length > 0 ? allDepts.data[0].order : 0;
      
      const res = await db.collection('departments').add({
        data: {
          name,
          order: (department.order || maxOrder + 1),
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        }
      });
      
      return { success: true, _id: res._id };
    }

    // 更新部门
    if (action === 'update' && departmentId && department) {
      const name = normalizeText(department.name);
      if (!name) {
        return { success: false, message: '部门名称不能为空' };
      }
      
      await db.collection('departments').doc(departmentId).update({
        data: {
          name,
          order: department.order,
          updatedAt: db.serverDate(),
        }
      });
      
      return { success: true };
    }

    // 删除部门
    if (action === 'delete' && departmentId) {
      // 同时删除该部门下的所有办公室
      const roomsRes = await db.collection('rooms').where({ departmentId }).get();
      const deleteRoomPromises = roomsRes.data.map(item => 
        db.collection('rooms').doc(item._id).remove()
      );
      await Promise.all(deleteRoomPromises);
      
      // 删除部门
      await db.collection('departments').doc(departmentId).remove();
      
      return { success: true, deletedRooms: roomsRes.data.length };
    }

    // 批量导入
    if (action === 'import' && departments && Array.isArray(departments)) {
      return {
        success: true,
        ...(await batchUpsertDepartments(departments))
      };
    }

    if (action === 'importFromCsv' && fileID) {
      // 从云存储读取CSV并解析为 departments
      const downloadRes = await cloud.downloadFile({ fileID });
      const content = downloadRes.fileContent.toString('utf8');
      const rows = parseCsv(content);

      // 按模板：前5行是表头/说明，从第6行开始数据
      let currentDept = '';
      const map = new Map();
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        if (!r || r.length < 2) continue;

        // 跳过标题行
        if (idx < 5) continue;

        const deptCell = normalizeText(r[0]);
        const roomCell = normalizeText(r[1]);

        if (deptCell) currentDept = deptCell;
        if (!currentDept || !roomCell) continue;

        if (!map.has(currentDept)) map.set(currentDept, new Set());
        map.get(currentDept).add(roomCell);
      }

      const parsed = Array.from(map.entries()).map(([name, roomsSet]) => ({
        name,
        rooms: Array.from(roomsSet)
      }));

      const result = await batchUpsertDepartments(parsed);
      return {
        success: true,
        parsedDepartments: parsed.length,
        ...result
      };
    }

    // 获取部门列表
    if (action === 'list') {
      const res = await db.collection('departments').orderBy('order', 'asc').get();
      return {
        success: true,
        departments: res.data
      };
    }

    // 获取单个部门详情（包含办公室列表）
    if (action === 'get' && departmentId) {
      const deptRes = await db.collection('departments').doc(departmentId).get();
      if (!deptRes.data) {
        return { success: false, message: '部门不存在' };
      }
      
      const roomsRes = await db.collection('rooms')
        .where({ departmentId })
        .orderBy('order', 'asc')
        .get();
      
      return {
        success: true,
        department: {
          ...deptRes.data,
          rooms: roomsRes.data
        }
      };
    }

    if (action === 'clear') {
      // 清空部门数据（谨慎使用）
      const res = await db.collection('departments').get();
      const deletePromises = res.data.map(item => 
        db.collection('departments').doc(item._id).remove()
      );
      await Promise.all(deletePromises);

      return {
        success: true,
        deleted: res.data.length
      };
    }

    return {
      success: false,
      message: '未知的操作类型'
    };
  } catch (err) {
    console.error('部门数据操作失败', err);
    return {
      success: false,
      message: err.message || '操作失败'
    };
  }
};
