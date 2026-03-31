// 云函数入口文件
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 引入公共模块
const { calculateLeaderboard, groupByDepartmentAndRoom } = require('./shared/ranking');
const { SCORING_ITEMS: SCORING_ITEM_NAMES, SCORING_MAX_SCORES, TOTAL_MAX_SCORE } = require('./shared/constants');

// 评分项完整配置（用于导出表头）
const SCORING_ITEMS = SCORING_ITEM_NAMES.map(name => ({
  name,
  maxScore: SCORING_MAX_SCORES[name],
  desc: {
    '地面': '地面干净整洁，无垃圾、污渍、水渍',
    '桌面摆放': '物品摆放整齐，无私人物品，无杂物堆积',
    '文件资料': '文件资料分类明确，标识清晰，易于查找',
    '电器设备': '电器设备摆放整齐，无积尘，电线不杂乱',
    '办公椅': '办公椅摆放整齐，无损坏，无污渍',
    '窗台': '窗台无灰尘、无杂物摆放，玻璃明亮',
    '整体印象': '办公室整体整洁有序，环境优美'
  }[name]
}));

// 固定部门与办公室顺序（已从代码中移除硬编码模板，现从实际数据中提取）
// 注意：DEPARTMENTS_TEMPLATE 常量已废弃，导出时直接从检查记录中提取部门/办公室

// 生成Excel内容（使用exceljs支持完整样式）
async function generateExcelBuffer(inspections, departments, month, selectedDate) {
  const dateStr = month || new Date().toISOString().slice(0, 7);

  // 创建workbook和worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('7S评分表');

  // 定义边框样式
  const thinBorder = {
    top: { style: 'thin', color: { argb: '000000' } },
    bottom: { style: 'thin', color: { argb: '000000' } },
    left: { style: 'thin', color: { argb: '000000' } },
    right: { style: 'thin', color: { argb: '000000' } }
  };

  // 定义基础对齐样式
  const centerAlignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // 定义字体
  const defaultFont = { name: '等线', size: 10 };

  // ==================== 从数据库查询全部部门/办公室 ====================
  let allDepartments = [];
  let allRooms = [];
  try {
    const deptBatchSize = 100;
    for (let offset = 0; ; offset += deptBatchSize) {
      const deptsRes = await db.collection('departments')
        .orderBy('order', 'asc')
        .skip(offset)
        .limit(deptBatchSize)
        .field({ name: true, order: true })
        .get();
      const batch = deptsRes.data || [];
      if (batch.length === 0) break;
      allDepartments.push(...batch);
      if (batch.length < deptBatchSize) break;
    }

    const roomBatchSize = 200;
    for (let offset = 0; ; offset += roomBatchSize) {
      const roomsRes = await db.collection('rooms')
        .orderBy('order', 'asc')
        .skip(offset)
        .limit(roomBatchSize)
        .field({ departmentId: true, name: true, order: true })
        .get();
      const batch = roomsRes.data || [];
      if (batch.length === 0) break;
      allRooms.push(...batch);
      if (batch.length < roomBatchSize) break;
    }
  } catch (err) {
    console.error('查询部门/办公室失败', err);
    // 如果查询失败，退回到从检查记录中提取
  }

  // 构建部门-办公室映射（从数据库数据）
  const dbDeptRoomsMap = new Map(); // deptName -> Array of roomNames
  if (allDepartments.length > 0 && allRooms.length > 0) {
    // 建立部门ID到名称的映射
    const deptIdToName = new Map();
    allDepartments.forEach(d => deptIdToName.set(d._id, d.name));
    
    // 按部门分组办公室
    allDepartments.forEach(dept => {
      dbDeptRoomsMap.set(dept.name, []);
    });
    
    allRooms.forEach(room => {
      const deptName = deptIdToName.get(room.departmentId);
      if (deptName && dbDeptRoomsMap.has(deptName)) {
        dbDeptRoomsMap.get(deptName).push(room.name);
      }
    });
  }

  // 第1行：标题（合并列：2列固定 + 7个评分项 + 1列总评分 = 10列）
  worksheet.mergeCells('A1:J1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = '职能部室（办公室）7S联查评分表';
  titleCell.font = { name: '等线', size: 14, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  // 彻底去掉第一行的所有边框线
  titleCell.border = {
    top: { style: 'none' },
    left: { style: 'none' },
    bottom: { style: 'none' },
    right: { style: 'none' }
  };
  worksheet.getRow(1).height = 40;

  // 第2行：日期
  worksheet.mergeCells('A2:J2');
  let formattedDate;
  
  // 优先使用传入的 selectedDate，其次从数据中推断，最后使用当前日期
  if (selectedDate) {
    // 将 2026-03-25 格式转换为 2026年03月25日
    const [year, monthNum, day] = selectedDate.split('-');
    formattedDate = `${year}年${monthNum}月${day}日`;
  } else if (inspections.length > 0 && inspections[0].date) {
    // 从第一条记录推断日期
    const recordDate = inspections[0].date;
    if (recordDate.includes('-')) {
      const [year, monthNum, day] = recordDate.split('-');
      formattedDate = `${year}年${monthNum}月${day}日`;
    } else if (recordDate.includes('年')) {
      formattedDate = recordDate;
    } else {
      formattedDate = recordDate;
    }
  } else {
    // 使用当前日期
    const today = new Date();
    const year = today.getFullYear();
    const monthNum = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    formattedDate = `${year}年${monthNum}月${day}日`;
  }
  
  // 根据 date 参数筛选 inspections
  if (selectedDate) {
    inspections = inspections.filter(record => record.date === selectedDate);
  }
  
  const dateCell = worksheet.getCell('A2');
  dateCell.value = `日期：${formattedDate}`;
  dateCell.font = defaultFont;
  dateCell.alignment = { horizontal: 'left', vertical: 'middle' };
  // 彻底去掉第二行的所有边框线
  dateCell.border = {
    top: { style: 'none' },
    left: { style: 'none' },
    bottom: { style: 'none' },
    right: { style: 'none' }
  };
  worksheet.getRow(2).height = 25;

  // 第3, 4, 5行：表头层级处理
  // 合并 A3:A5 (部门名称), B3:B5 (办公室位置)
  worksheet.mergeCells('A3:A5');
  const deptHeaderCell = worksheet.getCell('A3');
  deptHeaderCell.value = '部门名称';
  deptHeaderCell.font = { name: '等线', size: 10, bold: true };
  deptHeaderCell.alignment = centerAlignment;
  
  worksheet.mergeCells('B3:B5');
  const roomHeaderCell = worksheet.getCell('B3');
  roomHeaderCell.value = '办公室位置';
  roomHeaderCell.font = { name: '等线', size: 10, bold: true };
  roomHeaderCell.alignment = centerAlignment;

  // 显式为表头区域所有单元格添加边框（解决exceljs合并单元格边框丢失问题）
  for (let r = 3; r <= 5; r++) {
    for (let c = 1; c <= 10; c++) {
      worksheet.getCell(r, c).border = thinBorder;
    }
  }

  // 第3行：大项名称
  const headerRow3 = worksheet.getRow(3);
  headerRow3.height = 30; // 统一高度
  for (let i = 0; i < SCORING_ITEMS.length; i++) {
    const col = 3 + i;
    const cell = headerRow3.getCell(col);
    cell.value = SCORING_ITEMS[i].name;
    cell.font = { name: '等线', size: 10, bold: true };
    cell.alignment = centerAlignment;
  }

  // 第4行：描述行
  const headerRow4 = worksheet.getRow(4);
  headerRow4.height = 30; // 降低高度，因为减少了换行
  for (let i = 0; i < SCORING_ITEMS.length; i++) {
    const col = 3 + i;
    const cell = headerRow4.getCell(col);
    cell.value = SCORING_ITEMS[i].desc;
    cell.font = { name: '等线', size: 9 };
    // 修正对齐方式：居中且换行（作为兜底）
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  // 第5行：最高分
  const headerRow5 = worksheet.getRow(5);
  headerRow5.height = 20;
  for (let i = 0; i < SCORING_ITEMS.length; i++) {
    const col = 3 + i;
    const cell = headerRow5.getCell(col);
    cell.value = SCORING_ITEMS[i].maxScore + '分';
    cell.font = { name: '等线', size: 9 };
    cell.alignment = centerAlignment;
  }

  // 合并总评分 J3:J5 (第10列)
  worksheet.mergeCells('J3:J5');
  const totalScoreHeaderCell = worksheet.getCell('J3');
  totalScoreHeaderCell.value = '总评分';
  totalScoreHeaderCell.font = { name: '等线', size: 10, bold: true };
  totalScoreHeaderCell.alignment = centerAlignment;
  totalScoreHeaderCell.border = thinBorder;
  // 确保合并区域的每一格都有边框
  ['J3', 'J4', 'J5'].forEach(ref => {
    worksheet.getCell(ref).border = thinBorder;
  });

  // 按部门、办公室分组（不包含日期，与首页保持一致）
  const groupedMap = new Map();
  inspections.forEach(record => {
    const key = `${record.department}-${record.room}`;
    // 只保留该办公室的最高分记录
    if (!groupedMap.has(key) || groupedMap.get(key).totalScore < record.totalScore) {
      groupedMap.set(key, record);
    }
  });

  // 收集所有日期
  const dateSet = new Set();
  groupedMap.forEach((data) => {
    if (data.date) dateSet.add(data.date);
  });
  const sortedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  if (sortedDates.length === 0) {
    const today = new Date();
    sortedDates.push(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  }

  // 数据行：使用数据库中的全部部门/办公室，不依赖硬编码模板
  let currentRow = 6;
  
  // 确定部门/办公室列表优先级：数据库 > 检查记录
  let deptRoomsMap;
  
  if (dbDeptRoomsMap.size > 0) {
    // 使用从数据库查询的部门/办公室
    deptRoomsMap = dbDeptRoomsMap;
  } else {
    const deptRoomsSetMap = new Map();
    groupedMap.forEach((record, key) => {
      const parts = String(key).split('-');
      const deptName = parts[0];
      const room = parts.slice(1).join('-');

      if (!deptRoomsSetMap.has(deptName)) {
        deptRoomsSetMap.set(deptName, new Set());
      }
      deptRoomsSetMap.get(deptName).add(room);
    });
    deptRoomsMap = new Map();
    deptRoomsSetMap.forEach((roomsSet, deptName) => {
      deptRoomsMap.set(deptName, Array.from(roomsSet));
    });
  }
  
  // 按日期、部门输出数据
  sortedDates.forEach(date => {
    const deptRowMap = new Map(); // deptName -> { startRow, endRow }
    
    // 按部门名称排序输出
    const sortedDepts = Array.from(deptRoomsMap.keys()).sort();
    
    sortedDepts.forEach(deptName => {
      const deptStartRow = currentRow;
      const rooms = deptRoomsMap.get(deptName).sort();
      
      rooms.forEach(room => {
        // key 格式现在是 "部门-房间"，不包含日期
        const dataKey = `${deptName}-${room}`;
        const record = groupedMap.get(dataKey);
        
        // 即使该办公室当天无记录，也输出一行（显示为空）
        const row = worksheet.getRow(currentRow);
        const rowValues = [deptName, room];
        
        if (record) {
          // 直接使用record中的totalScore
          const totalScore = record.totalScore || 0;
          // 从details数组中获取各评分项分数
          const detailsMap = new Map((record.details || []).map(d => [d.item, d.score]));
          SCORING_ITEMS.forEach(item => {
            const score = detailsMap.get(item.name) || 0;
            rowValues.push(score > 0 ? score : '');
          });
          rowValues.push(totalScore > 0 ? totalScore : '');
        } else {
          // 无记录时，评分项和总分都为空
          SCORING_ITEMS.forEach(() => {
            rowValues.push('');
          });
          rowValues.push('');
        }
        
        row.values = rowValues;
        row.font = defaultFont;
        row.alignment = centerAlignment;
        row.height = 20;
        for (let i = 1; i <= 10; i++) {
          row.getCell(i).border = thinBorder;
        }
        
        currentRow++;
      });
      
      // 记录部门的行范围（用于合并单元格）
      const deptEndRow = currentRow - 1;
      if (deptStartRow <= deptEndRow && rooms.length > 1) {
        deptRowMap.set(deptName, { startRow: deptStartRow, endRow: deptEndRow });
      }
    });

    // 合并部门列（A列）
    deptRowMap.forEach((range, deptName) => {
      if (range.endRow > range.startRow) {
        worksheet.mergeCells(range.startRow, 1, range.endRow, 1);
        // 为合并后的单元格设置边框和对齐
        const mergedCell = worksheet.getCell(range.startRow, 1);
        mergedCell.border = thinBorder;
        // 显式设置垂直居中
        mergedCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      } else {
        // 单行部门也要确保居中
        const cell = worksheet.getCell(range.startRow, 1);
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
    });
  });

  // 设置列宽
  worksheet.getColumn(1).width = 12; // 部门名称：再窄一点
  worksheet.getColumn(2).width = 40; // 办公室位置：再宽一点
  // 每个评分项1列
  for (let i = 3; i <= 9; i++) {
    worksheet.getColumn(i).width = 30; // 检查项：再宽一点（减少换行）
  }
  worksheet.getColumn(10).width = 10; // 总评分 J列

  // 冻结窗格：冻结前5行与前2列

  // ==================== 添加红黑榜工作表 ====================
  const rankSheet = workbook.addWorksheet('红黑榜排名');

  // 计算每个办公室的最新评分（基于实际记录，避免模板与数据库名称不一致导致空榜）
  const officeLatestMap = new Map();
  groupedMap.forEach((record, dataKey) => {
    // 从record对象中获取部门和办公室信息
    const dept = record.department;
    const room = record.room;
    const recordDate = record.date || '';
    // 直接使用record中的totalScore
    const totalScore = record.totalScore || 0;

    const key = `${dept}|${room}`;
    const prev = officeLatestMap.get(key);
    // 如果没有前一个记录，则添加
    if (!prev) {
      officeLatestMap.set(key, { department: dept, room, score: totalScore, date: recordDate });
    }
  });

  const officeScores = Array.from(officeLatestMap.values());

  // 按分数排序
  officeScores.sort((a, b) => b.score - a.score);

  // 计算红榜并列排名（密集排名：1,1,2,2,3...）并取Top3（含并列）
  const rankedForRed = officeScores
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  let currentRank = 0;
  let lastScore = null;
  rankedForRed.forEach((item) => {
    if (lastScore === null || item.score !== lastScore) {
      currentRank += 1;
      lastScore = item.score;
    }
    item.rank = currentRank;
  });
  const redList = rankedForRed.filter(item => item.rank <= 3);

  // 黑榜候选：从不在红榜且非满分的记录中选取（严格排除，无兜底）
  const redKeySet = new Set(redList.map(i => `${i.department}|${i.room}`));
  const blackCandidates = officeScores.filter(item => 
    item.score > 0 && item.score < 100 && !redKeySet.has(`${item.department}|${item.room}`)
  );
  // 注意：如果所有非满分记录都在红榜中，blackCandidates为空，黑榜即为空

  // 计算黑榜并列倒数排名并取Bottom3（含并列）
  const rankedForBlack = blackCandidates.sort((a, b) => a.score - b.score);
  let currentReverseRank = 0;
  let lastReverseScore = null;
  rankedForBlack.forEach((item) => {
    if (lastReverseScore === null || item.score !== lastReverseScore) {
      currentReverseRank += 1;
      lastReverseScore = item.score;
    }
    item.reverseRank = currentReverseRank;
  });
  const blackList = rankedForBlack.filter(item => item.reverseRank <= 3);

  // 红黑榜标题
  rankSheet.mergeCells('A1:D1');
  const rankTitleCell = rankSheet.getCell('A1');
  rankTitleCell.value = `${formattedDate} 7S检查红黑榜`;
  rankTitleCell.font = { name: '等线', size: 14, bold: true };
  rankTitleCell.alignment = { horizontal: 'center', vertical: 'center' };
  rankTitleCell.border = thinBorder;
  rankSheet.getRow(1).height = 30;

  // 红榜标题
  rankSheet.mergeCells('A2:D2');
  const redTitleCell = rankSheet.getCell('A2');
  redTitleCell.value = '红榜（得分最高）';
  redTitleCell.font = { name: '等线', size: 12, bold: true, color: { argb: 'FF0000' } };
  redTitleCell.alignment = { horizontal: 'center', vertical: 'center' };
  redTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6' } };
  redTitleCell.border = thinBorder;
  rankSheet.getRow(2).height = 28;

  // 红榜表头
  const redHeaderRow = rankSheet.getRow(3);
  ['排名', '部门', '办公室', '得分'].forEach((val, idx) => {
    const cell = redHeaderRow.getCell(idx + 1);
    cell.value = val;
    cell.font = { name: '等线', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'center' };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2' } };
  });
  redHeaderRow.height = 24;

  // 红榜数据
  let rankRow = 4;
  redList.forEach((item, index) => {
    const row = rankSheet.getRow(rankRow);
    [item.rank || (index + 1), item.department, item.room, item.score].forEach((val, idx) => {
      const cell = row.getCell(idx + 1);
      cell.value = val;
      cell.font = defaultFont;
      cell.alignment = { horizontal: 'center', vertical: 'center' };
      cell.border = thinBorder;
    });
    row.height = 22;
    rankRow++;
  });

  // 黑榜标题（空一行后）
  rankRow++;
  rankSheet.mergeCells(`A${rankRow}:D${rankRow}`);
  const blackTitleCell = rankSheet.getCell(`A${rankRow}`);
  blackTitleCell.value = '黑榜（得分最低）';
  blackTitleCell.font = { name: '等线', size: 12, bold: true };
  blackTitleCell.alignment = { horizontal: 'center', vertical: 'center' };
  blackTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '333333' } };
  blackTitleCell.font = { name: '等线', size: 12, bold: true, color: { argb: 'FFFFFF' } };
  blackTitleCell.border = thinBorder;
  rankSheet.getRow(rankRow).height = 28;
  rankRow++;

  // 黑榜表头
  const blackHeaderRow = rankSheet.getRow(rankRow);
  ['排名', '部门', '办公室', '得分'].forEach((val, idx) => {
    const cell = blackHeaderRow.getCell(idx + 1);
    cell.value = val;
    cell.font = { name: '等线', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'center' };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '666666' } };
    cell.font = { name: '等线', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  });
  blackHeaderRow.height = 24;
  rankRow++;

  // 黑榜数据
  blackList.forEach((item, index) => {
    const row = rankSheet.getRow(rankRow);
    [item.reverseRank || (index + 1), item.department, item.room, item.score].forEach((val, idx) => {
      const cell = row.getCell(idx + 1);
      cell.value = val;
      cell.font = defaultFont;
      cell.alignment = { horizontal: 'center', vertical: 'center' };
      cell.border = thinBorder;
    });
    row.height = 22;
    rankRow++;
  });

  // 黑榜少于3个时的备注说明
  if (blackList.length < 3) {
    rankRow++;
    rankSheet.mergeCells(`A${rankRow}:D${rankRow}`);
    const hintCell = rankSheet.getCell(`A${rankRow}`);
    hintCell.value = `ℹ️ 本期满分或与红榜同分的部门较多，黑榜仅显示${blackList.length}个`;
    hintCell.font = { name: '等线', size: 9, color: { argb: '666666' } };
    hintCell.alignment = { horizontal: 'left', vertical: 'center' };
    rankSheet.getRow(rankRow).height = 20;
  }

  // 设置红黑榜列宽
  rankSheet.getColumn(1).width = 10; // 排名
  rankSheet.getColumn(2).width = 20; // 部门
  rankSheet.getColumn(3).width = 40; // 办公室
  rankSheet.getColumn(4).width = 10; // 得分


  // ==================== 红黑榜工作表结束 ====================

  // ==================== 公示榜工作表开始 ====================
  const bulletinSheet = workbook.addWorksheet('评比结果公示');

  // 公示榜日期：直接复用评分表已推断出的 formattedDate，避免 YYYY-MM 被错误补成 01 日
  let bulletinDate = formattedDate;
  if (!bulletinDate) {
    const today = new Date();
    bulletinDate = `${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, '0')}月${String(today.getDate()).padStart(2, '0')}日`;
  }

  // 样式定义：白底黑字
  const noBorder = {
    top: { style: 'none' },
    bottom: { style: 'none' },
    left: { style: 'none' },
    right: { style: 'none' }
  };
  const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const leftAlign = { horizontal: 'left', vertical: 'middle', wrapText: true };

  let bRow = 1;

  // 标题
  bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
  const bulletinTitleCell = bulletinSheet.getCell(`A${bRow}`);
  bulletinTitleCell.value = '职能部室办公环境卫生联查评比结果公示';
  bulletinTitleCell.font = { name: '宋体', size: 18, bold: true };
  bulletinTitleCell.alignment = centerAlign;
  bulletinTitleCell.border = noBorder;
  bulletinSheet.getRow(bRow).height = 35;
  bRow++;

  // 空行
  bRow++;

  // 引言
  bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
  const introCell = bulletinSheet.getCell(`A${bRow}`);
  // 使用空格模拟首行缩进
  introCell.value = `    根据公司 7S 工作推进要求，促进各部门提高办公环境卫生水平，增强团队凝聚力，现将 ${bulletinDate} 后勤部室办公室卫生联查评比结果公示如下：`;
  introCell.font = { name: '宋体', size: 12 };
  introCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 2 };
  introCell.border = noBorder;
  bulletinSheet.getRow(bRow).height = 45;
  bRow++;

  // 空行
  bRow++;

  // 一、评比标准
  bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
  const stdTitleCell = bulletinSheet.getCell(`A${bRow}`);
  stdTitleCell.value = '一、评比标准';
  stdTitleCell.font = { name: '宋体', size: 12, bold: true };
  stdTitleCell.alignment = leftAlign;
  stdTitleCell.border = noBorder;
  bulletinSheet.getRow(bRow).height = 25;
  bRow++;

  // 7条标准
  const standards = [
    '1、桌面摆放：物品摆放整齐，无私人物品，无杂物堆积。',
    '2、地面：地面干净整洁，无垃圾、污渍、水渍。',
    '3、窗台：窗台无灰尘、无杂物摆放，玻璃明亮。',
    '4、文件资料：文件资料分类明确，标识清晰，易于查找。',
    '5、电器设备：电器设备摆放整齐，无积尘，电线不杂乱。',
    '6、办公椅：办公椅摆放整齐，无损坏，无污渍。',
    '7、整体印象：办公室整体整洁有序，环境优美。'
  ];
  standards.forEach(std => {
    bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
    const cell = bulletinSheet.getCell(`A${bRow}`);
    cell.value = std;
    cell.font = { name: '宋体', size: 12 };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    cell.border = noBorder;
    // 根据内容长度动态调整行高
    const lineCount = Math.ceil(cell.value.length / 40);
    bulletinSheet.getRow(bRow).height = Math.max(22, lineCount * 20);
    bRow++;
  });

  // 空行
  bRow++;

  // 二、评比结果
  bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
  const resultTitleCell = bulletinSheet.getCell(`A${bRow}`);
  resultTitleCell.value = '二、评比结果';
  resultTitleCell.font = { name: '宋体', size: 12, bold: true };
  resultTitleCell.alignment = leftAlign;
  resultTitleCell.border = noBorder;
  bulletinSheet.getRow(bRow).height = 25;
  bRow++;

  // 红榜标题
  bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
  const bulletinRedTitleCell = bulletinSheet.getCell(`A${bRow}`);
  bulletinRedTitleCell.value = `最优秀的${redList.length}个部门办公室：`;
  bulletinRedTitleCell.font = { name: '宋体', size: 12, bold: true };
  bulletinRedTitleCell.alignment = leftAlign;
  bulletinRedTitleCell.border = noBorder;
  bulletinSheet.getRow(bRow).height = 25;
  bRow++;

  // 红榜内容（处理并列）
  const redGroups = new Map();
  redList.forEach(item => {
    const rk = item.rank || 1;
    if (!redGroups.has(rk)) redGroups.set(rk, []);
    redGroups.get(rk).push(item);
  });
  [1, 2, 3].forEach((rank) => {
    if (!redGroups.has(rank)) return;
    const items = redGroups.get(rank);
    bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
    const cell = bulletinSheet.getCell(`A${bRow}`);
    const content = items.map(it => `${it.department}（${it.room} 负责人：${it.manager || '待定'}）`).join('、');
    cell.value = `${rank}、${content}`;
    cell.font = { name: '宋体', size: 12 };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    cell.border = noBorder;
    const lineCount = Math.ceil(cell.value.length / 48);
    bulletinSheet.getRow(bRow).height = Math.max(22, lineCount * 20);
    bRow++;
  });

  // 空行
  bRow++;

  // 黑榜标题
  bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
  const bulletinBlackTitleCell = bulletinSheet.getCell(`A${bRow}`);
  bulletinBlackTitleCell.value = `待改进的${blackList.length}个部门办公室：`;
  bulletinBlackTitleCell.font = { name: '宋体', size: 12, bold: true };
  bulletinBlackTitleCell.alignment = leftAlign;
  bulletinBlackTitleCell.border = noBorder;
  bulletinSheet.getRow(bRow).height = 25;
  bRow++;

  // 黑榜内容（处理并列）
  const blackGroups = new Map();
  blackList.forEach(item => {
    const rk = item.reverseRank || 1;
    if (!blackGroups.has(rk)) blackGroups.set(rk, []);
    blackGroups.get(rk).push(item);
  });
  [1, 2, 3].forEach((rank) => {
    if (!blackGroups.has(rank)) return;
    const items = blackGroups.get(rank);
    bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
    const cell = bulletinSheet.getCell(`A${bRow}`);
    const content = items.map(it => `${it.department}（${it.room} 负责人：${it.manager || '待定'}）`).join('、');
    cell.value = `${rank}、${content}`;
    cell.font = { name: '宋体', size: 12 };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    cell.border = noBorder;
    const lineCount = Math.ceil(cell.value.length / 48);
    bulletinSheet.getRow(bRow).height = Math.max(22, lineCount * 20);
    bRow++;
  });

  // 空行
  bRow++;

  // 三、后续工作
  bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
  const workTitleCell = bulletinSheet.getCell(`A${bRow}`);
  workTitleCell.value = '三、后续工作';
  workTitleCell.font = { name: '宋体', size: 12, bold: true };
  workTitleCell.alignment = leftAlign;
  workTitleCell.border = noBorder;
  bulletinSheet.getRow(bRow).height = 25;
  bRow++;

  // 后续工作内容
  const workItems = [
    '1、请各相关部门根据本次评比结果，针对存在的问题制定改进措施，并在下一次评比前落实到位。',
    '2、后续会对联合检查小组组成部门进行轮换，确保每个部门都会参与其中。',
    '3、按照 7S 管理标准，对连续三次待改进的办公室负责人落实考核，并连带考核所在部门负责人。'
  ];
  workItems.forEach(wi => {
    bulletinSheet.mergeCells(`A${bRow}:G${bRow}`);
    const cell = bulletinSheet.getCell(`A${bRow}`);
    cell.value = wi;
    cell.font = { name: '宋体', size: 12 };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    cell.border = noBorder;
    // 根据内容长度动态调整行高
    const lineCount = Math.ceil(cell.value.length / 40);
    bulletinSheet.getRow(bRow).height = Math.max(22, lineCount * 20);
    bRow++;
  });

  // 空行
  bRow++;
  bRow++;

  // 落款
  bulletinSheet.mergeCells(`D${bRow}:G${bRow}`);
  const signCell = bulletinSheet.getCell(`D${bRow}`);
  signCell.value = '7S联合检查小组';
  signCell.font = { name: '宋体', size: 12 };
  signCell.alignment = { horizontal: 'right', vertical: 'middle' };
  signCell.border = noBorder;
  bulletinSheet.getRow(bRow).height = 22;
  bRow++;

  bulletinSheet.mergeCells(`D${bRow}:G${bRow}`);
  const bulletinDateCell = bulletinSheet.getCell(`D${bRow}`);
  bulletinDateCell.value = bulletinDate;
  bulletinDateCell.font = { name: '宋体', size: 12 };
  bulletinDateCell.alignment = { horizontal: 'right', vertical: 'middle' };
  bulletinDateCell.border = noBorder;
  bulletinSheet.getRow(bRow).height = 22;

  // 设置公示榜列宽（优化：适当加大列宽，减少右侧留白，总宽控制在 85 左右）
  bulletinSheet.getColumn(1).width = 8;
  bulletinSheet.getColumn(2).width = 15;
  bulletinSheet.getColumn(3).width = 25;
  bulletinSheet.getColumn(4).width = 12;
  bulletinSheet.getColumn(5).width = 12;
  bulletinSheet.getColumn(6).width = 12;
  bulletinSheet.getColumn(7).width = 8;

  // 设置打印选项，确保不超出页面
  bulletinSheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5, right: 0.5,
      top: 0.75, bottom: 0.75,
      header: 0.3, footer: 0.3
    }
  };

  // ==================== 公示榜工作表结束 ====================

  // 生成buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// 生成公示榜Excel（白底黑字，模拟Word格式）
async function generateBulletinBuffer(inspections, selectedDate) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('评比结果公示');

  // 定义样式：白底黑字
  const thinBorder = {
    top: { style: 'thin', color: { argb: '000000' } },
    bottom: { style: 'thin', color: { argb: '000000' } },
    left: { style: 'thin', color: { argb: '000000' } },
    right: { style: 'thin', color: { argb: '000000' } }
  };
  const noBorder = {
    top: { style: 'none' },
    bottom: { style: 'none' },
    left: { style: 'none' },
    right: { style: 'none' }
  };
  const centerAlignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const leftAlignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  const defaultFont = { name: '宋体', size: 12 };
  const boldFont = { name: '宋体', size: 12, bold: true };

  // 格式化日期
  let formattedDate = '';
  if (selectedDate) {
    const [year, monthNum, day] = selectedDate.split('-');
    formattedDate = `${year}年${monthNum}月${day}日`;
  } else if (inspections.length > 0 && inspections[0].date) {
    const recordDate = inspections[0].date;
    if (recordDate.includes('-')) {
      const [year, monthNum, day] = recordDate.split('-');
      formattedDate = `${year}年${monthNum}月${day}日`;
    } else {
      formattedDate = recordDate;
    }
  } else {
    const today = new Date();
    formattedDate = `${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, '0')}月${String(today.getDate()).padStart(2, '0')}日`;
  }

  // 筛选指定日期的数据
  let filteredInspections = selectedDate 
    ? inspections.filter(r => r.date === selectedDate)
    : inspections;

  // 计算红黑榜（使用公共模块）
  const groupedRecords = groupByDepartmentAndRoom(filteredInspections);
  const { redList, blackList } = calculateLeaderboard(groupedRecords, TOTAL_MAX_SCORE);

  let row = 1;

  // ==================== 标题区 ====================
  worksheet.mergeCells(`A${row}:F${row}`);
  const titleCell = worksheet.getCell(`A${row}`);
  titleCell.value = '职能部室办公环境卫生联查评比结果公示';
  titleCell.font = { name: '宋体', size: 18, bold: true };
  titleCell.alignment = centerAlignment;
  titleCell.border = noBorder;
  worksheet.getRow(row).height = 35;
  row++;

  // 空行
  row++;

  // ==================== 引言区 ====================
  worksheet.mergeCells(`A${row}:F${row}`);
  const introCell = worksheet.getCell(`A${row}`);
  introCell.value = `根据公司7S工作推进要求，公司7S联合检查小组于${formattedDate}对职能部室各办公室进行了环境卫生联查评比，现将评比结果公示如下：`;
  introCell.font = defaultFont;
  introCell.alignment = leftAlignment;
  introCell.border = noBorder;
  worksheet.getRow(row).height = 40;
  row++;

  // 空行
  row++;

  // ==================== 一、评比标准 ====================
  worksheet.mergeCells(`A${row}:F${row}`);
  const standardTitleCell = worksheet.getCell(`A${row}`);
  standardTitleCell.value = '一、评比标准';
  standardTitleCell.font = boldFont;
  standardTitleCell.alignment = leftAlignment;
  standardTitleCell.border = noBorder;
  worksheet.getRow(row).height = 25;
  row++;

  // 7条评比标准
  const standards = [
    '1、桌面摆放：物品摆放整齐，无私人物品，无杂物堆积；',
    '2、地面：地面干净整洁，无垃圾、污渍、水渍；',
    '3、窗台：窗台无灰尘、无杂物摆放，玻璃明亮；',
    '4、文件资料：文件资料分类明确，标识清晰，易于查找；',
    '5、电器设备：电器设备摆放整齐，无积尘，电线不杂乱；',
    '6、办公椅：办公椅摆放整齐，无损坏，无污渍；',
    '7、整体印象：办公室整体整洁有序，环境优美。'
  ];

  standards.forEach(standard => {
    worksheet.mergeCells(`A${row}:F${row}`);
    const cell = worksheet.getCell(`A${row}`);
    cell.value = standard;
    cell.font = defaultFont;
    cell.alignment = leftAlignment;
    cell.border = noBorder;
    worksheet.getRow(row).height = 22;
    row++;
  });

  // 空行
  row++;

  // ==================== 二、评比结果 ====================
  worksheet.mergeCells(`A${row}:F${row}`);
  const resultTitleCell = worksheet.getCell(`A${row}`);
  resultTitleCell.value = '二、评比结果';
  resultTitleCell.font = boldFont;
  resultTitleCell.alignment = leftAlignment;
  resultTitleCell.border = noBorder;
  worksheet.getRow(row).height = 25;
  row++;

  // 红榜标题
  worksheet.mergeCells(`A${row}:F${row}`);
  const redTitleCell = worksheet.getCell(`A${row}`);
  redTitleCell.value = '【红榜】最优秀的部门办公室：';
  redTitleCell.font = boldFont;
  redTitleCell.alignment = leftAlignment;
  redTitleCell.border = noBorder;
  worksheet.getRow(row).height = 25;
  row++;

  // 红榜内容
  redList.forEach((item, index) => {
    worksheet.mergeCells(`A${row}:F${row}`);
    const cell = worksheet.getCell(`A${row}`);
    const rankText = item.rank === 1 ? '第1名' : item.rank === 2 ? '第2名' : '第3名';
    cell.value = `${index + 1}、${item.department}（${item.room}） ${rankText} 得分：${item.totalScore}分`;
    cell.font = defaultFont;
    cell.alignment = leftAlignment;
    cell.border = noBorder;
    worksheet.getRow(row).height = 22;
    row++;
  });

  // 空行
  row++;

  // 黑榜标题
  worksheet.mergeCells(`A${row}:F${row}`);
  const blackTitleCell = worksheet.getCell(`A${row}`);
  blackTitleCell.value = '【黑榜】待改进的部门办公室：';
  blackTitleCell.font = boldFont;
  blackTitleCell.alignment = leftAlignment;
  blackTitleCell.border = noBorder;
  worksheet.getRow(row).height = 25;
  row++;

  // 黑榜内容
  blackList.forEach((item, index) => {
    worksheet.mergeCells(`A${row}:F${row}`);
    const cell = worksheet.getCell(`A${row}`);
    const rankText = item.reverseRank === 1 ? '倒数第1名' : item.reverseRank === 2 ? '倒数第2名' : '倒数第3名';
    cell.value = `${index + 1}、${item.department}（${item.room}） ${rankText} 得分：${item.totalScore}分`;
    cell.font = defaultFont;
    cell.alignment = leftAlignment;
    cell.border = noBorder;
    worksheet.getRow(row).height = 22;
    row++;
  });

  // 空行
  row++;

  // ==================== 三、后续工作 ====================
  worksheet.mergeCells(`A${row}:F${row}`);
  const workTitleCell = worksheet.getCell(`A${row}`);
  workTitleCell.value = '三、后续工作';
  workTitleCell.font = boldFont;
  workTitleCell.alignment = leftAlignment;
  workTitleCell.border = noBorder;
  worksheet.getRow(row).height = 25;
  row++;

  // 后续工作内容
  const workItems = [
    '1、请各相关部门对照评比标准，认真查找不足，及时整改；',
    '2、黑榜部门需在3日内完成整改，并提交整改报告及照片；',
    '3、公司7S联合检查小组将不定期进行复查，确保整改落实到位。'
  ];

  workItems.forEach(item => {
    worksheet.mergeCells(`A${row}:F${row}`);
    const cell = worksheet.getCell(`A${row}`);
    cell.value = item;
    cell.font = defaultFont;
    cell.alignment = leftAlignment;
    cell.border = noBorder;
    worksheet.getRow(row).height = 22;
    row++;
  });

  // 空行
  row++;
  row++;

  // ==================== 落款 ====================
  worksheet.mergeCells(`D${row}:F${row}`);
  const signCell = worksheet.getCell(`D${row}`);
  signCell.value = '7S联合检查小组';
  signCell.font = defaultFont;
  signCell.alignment = { horizontal: 'right', vertical: 'middle' };
  signCell.border = noBorder;
  worksheet.getRow(row).height = 22;
  row++;

  worksheet.mergeCells(`D${row}:F${row}`);
  const dateCell = worksheet.getCell(`D${row}`);
  dateCell.value = formattedDate;
  dateCell.font = defaultFont;
  dateCell.alignment = { horizontal: 'right', vertical: 'middle' };
  dateCell.border = noBorder;
  worksheet.getRow(row).height = 22;

  // 设置列宽
  worksheet.getColumn(1).width = 5;
  worksheet.getColumn(2).width = 15;
  worksheet.getColumn(3).width = 20;
  worksheet.getColumn(4).width = 15;
  worksheet.getColumn(5).width = 15;
  worksheet.getColumn(6).width = 15;

  // 生成buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { month, date, keyword, format = 'both', returnContent = false } = event;

  try {
    // 分批获取数据，避免内存溢出
    const inspections = [];
    const batchSize = 100;
    let offset = 0;
    
    // 构建基础查询条件
    const buildQuery = () => {
      let query = db.collection('inspections');
      
      if (month) {
        query = query.where({
          date: db.RegExp({
            regexp: `^${month}`,
            options: 'i'
          })
        });
      }
      return query;
    };
    
    // 分批获取数据
    while (true) {
      const batch = await buildQuery()
        .orderBy('date', 'desc')
        .orderBy('createdAt', 'desc')
        .skip(offset)
        .limit(batchSize)
        .get();
      
      if (batch.data.length === 0) break;
      
      inspections.push(...batch.data);
      offset += batchSize;
      
      // 安全限制：最多导出 2000 条记录
      if (inspections.length >= 2000) {
        console.warn('导出数据达到上限 2000 条');
        break;
      }
    }

    if (inspections.length === 0) {
      return {
        success: false,
        message: '没有可导出的数据'
      };
    }

    // 部门列表：直接从检查记录中提取（保持出现顺序），不依赖 departments 集合
    const deptMap = new Map();
    inspections.forEach(record => {
      if (!deptMap.has(record.department)) {
        deptMap.set(record.department, { name: record.department, rooms: [] });
      }
      const dept = deptMap.get(record.department);
      if (record.room && !dept.rooms.includes(record.room)) {
        dept.rooms.push(record.room);
      }
    });
    const departments = Array.from(deptMap.values());

    const dateStr = month || new Date().toISOString().slice(0, 7);
    const files = [];

    // 直接返回内容（不依赖云存储）
    if (returnContent) {
      const result = { success: true, dateStr, totalRecords: inspections.length };

      // 只生成Excel格式
      const excelBuffer = await generateExcelBuffer(inspections, departments, month, date);
      result.xlsxFileName = `7S联查评分表_${dateStr}.xlsx`;
      result.xlsxBase64 = Buffer.from(excelBuffer).toString('base64');

      // 公示榜格式
      if (format === 'bulletin') {
        const bulletinBuffer = await generateBulletinBuffer(inspections, date);
        const bulletinDate = date || (inspections.length > 0 ? inspections[0].date : dateStr);
        result.xlsxFileName = `7S评比结果公示_${bulletinDate}.xlsx`;
        result.xlsxBase64 = Buffer.from(bulletinBuffer).toString('base64');
      }

      return result;
    }

    // 只生成Excel文件（使用exceljs生成带样式的xlsx）
    const excelContent = await generateExcelBuffer(inspections, departments, month, date);
    const excelFileName = `7S联查评分表_${dateStr}.xlsx`;
    
    // 上传到云存储
    const excelUploadRes = await cloud.uploadFile({
      cloudPath: `exports/${excelFileName}`,
      fileContent: Buffer.from(excelContent)
    });

    files.push({
      fileID: excelUploadRes.fileID,
      fileName: excelFileName,
      fileType: 'xlsx'
    });

    // 生成公示榜Excel文件
    if (format === 'bulletin') {
      const bulletinContent = await generateBulletinBuffer(inspections, date);
      const bulletinDate = date || (inspections.length > 0 ? inspections[0].date : dateStr);
      const bulletinFileName = `7S评比结果公示_${bulletinDate}.xlsx`;
      
      // 上传到云存储
      const bulletinUploadRes = await cloud.uploadFile({
        cloudPath: `exports/${bulletinFileName}`,
        fileContent: Buffer.from(bulletinContent, 'utf8')
      });

      files.push({
        fileID: bulletinUploadRes.fileID,
        fileName: bulletinFileName,
        fileType: 'xlsx'
      });
    }

    return {
      success: true,
      files,
      totalRecords: inspections.length
    };
  } catch (err) {
    console.error('导出报告失败', err);
    return {
      success: false,
      message: err.message || '导出失败'
    };
  }
};
