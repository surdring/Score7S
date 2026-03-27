// 云函数入口文件 - 办公室管理
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function normalizeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\r/g, '').trim();
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, room, roomId, departmentId } = event;

  try {
    // 添加办公室
    if (action === 'add' && room && departmentId) {
      const name = normalizeText(room.name);
      const manager = normalizeText(room.manager) || '';
      
      if (!name) {
        return { success: false, message: '办公室名称不能为空' };
      }
      
      // 检查部门是否存在
      const deptRes = await db.collection('departments').doc(departmentId).get();
      if (!deptRes.data) {
        return { success: false, message: '部门不存在' };
      }
      
      // 检查该部门下是否已存在同名办公室
      const existed = await db.collection('rooms')
        .where({ departmentId, name })
        .limit(1)
        .get();
      if (existed.data && existed.data.length > 0) {
        return { success: false, message: '该部门下已存在同名办公室' };
      }
      
      // 获取最大order值
      const allRooms = await db.collection('rooms')
        .where({ departmentId })
        .orderBy('order', 'desc')
        .limit(1)
        .get();
      const maxOrder = allRooms.data && allRooms.data.length > 0 ? allRooms.data[0].order : 0;
      
      const res = await db.collection('rooms').add({
        data: {
          departmentId,
          name,
          manager,
          order: (room.order || maxOrder + 1),
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        }
      });
      
      return { success: true, _id: res._id };
    }

    // 更新办公室
    if (action === 'update' && roomId && room) {
      const name = normalizeText(room.name);
      const manager = normalizeText(room.manager) || '';
      
      if (!name) {
        return { success: false, message: '办公室名称不能为空' };
      }
      
      await db.collection('rooms').doc(roomId).update({
        data: {
          name,
          manager,
          order: room.order,
          updatedAt: db.serverDate(),
        }
      });
      
      return { success: true };
    }

    // 删除办公室
    if (action === 'delete' && roomId) {
      await db.collection('rooms').doc(roomId).remove();
      return { success: true };
    }

    // 获取指定部门下的办公室列表
    if (action === 'list' && departmentId) {
      const res = await db.collection('rooms')
        .where({ departmentId })
        .orderBy('order', 'asc')
        .get();
      
      return {
        success: true,
        rooms: res.data
      };
    }

    // 获取单个办公室详情
    if (action === 'get' && roomId) {
      const res = await db.collection('rooms').doc(roomId).get();
      if (!res.data) {
        return { success: false, message: '办公室不存在' };
      }
      
      return {
        success: true,
        room: res.data
      };
    }

    // 获取所有办公室（带部门信息）
    if (action === 'listAll') {
      const roomsRes = await db.collection('rooms')
        .orderBy('order', 'asc')
        .get();
      
      const deptsRes = await db.collection('departments').get();
      const deptMap = new Map(deptsRes.data.map(d => [d._id, d.name]));
      
      const roomsWithDept = roomsRes.data.map(r => ({
        ...r,
        departmentName: deptMap.get(r.departmentId) || '未知部门'
      }));
      
      return {
        success: true,
        rooms: roomsWithDept
      };
    }

    // 批量导入办公室（优化版：并行处理）
    if (action === 'batchImport' && event.rooms && Array.isArray(event.rooms)) {
      let inserted = 0;
      let updated = 0;
      
      // 先批量查询已存在的办公室
      const allRooms = await db.collection('rooms').get();
      const existMap = new Map();
      allRooms.data.forEach(r => {
        const key = `${r.departmentId}|${r.name}`;
        existMap.set(key, r);
      });
      
      // 分批并行写入（每批20个）
      const chunkSize = 20;
      const rooms = event.rooms;
      
      for (let i = 0; i < rooms.length; i += chunkSize) {
        const chunk = rooms.slice(i, i + chunkSize);
        const promises = [];
        
        for (const roomData of chunk) {
          const { departmentId: deptId, name, manager, order } = roomData;
          if (!deptId || !name) continue;
          
          const normalizedName = normalizeText(name);
          const key = `${deptId}|${normalizedName}`;
          const existed = existMap.get(key);
          
          if (existed) {
            // 更新
            promises.push(
              db.collection('rooms').doc(existed._id).update({
                data: {
                  manager: manager || '',
                  order: order || existed.order,
                  updatedAt: db.serverDate(),
                }
              }).then(() => { updated++; }).catch(() => {})
            );
          } else {
            // 新增
            promises.push(
              db.collection('rooms').add({
                data: {
                  departmentId: deptId,
                  name: normalizedName,
                  manager: manager || '',
                  order: order || 1,
                  createdAt: db.serverDate(),
                  updatedAt: db.serverDate(),
                }
              }).then(() => { inserted++; }).catch(() => {})
            );
          }
        }
        
        await Promise.all(promises);
      }
      
      return { success: true, inserted, updated };
    }

    return {
      success: false,
      message: '未知的操作类型'
    };
  } catch (err) {
    console.error('办公室数据操作失败', err);
    return {
      success: false,
      message: err.message || '操作失败'
    };
  }
};
