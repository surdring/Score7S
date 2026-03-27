// 云函数入口文件
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 评分项配置
const SCORING_ITEMS = [
  { name: '桌面摆放', desc: '物品摆放整齐，无私人物品，无杂物堆积' },
  { name: '地面', desc: '地面干净整洁，无垃圾、污渍、水渍' },
  { name: '窗台', desc: '窗台无灰尘、无杂物摆放，玻璃明亮' },
  { name: '文件资料', desc: '文件资料分类明确，标识清晰，易于查找' },
  { name: '电器设备', desc: '电器设备摆放整齐，无积尘，电线不杂乱' },
  { name: '办公椅', desc: '办公椅摆放整齐，无损坏，无污渍' },
  { name: '整体印象', desc: '办公室整体整洁有序，环境优美' }
];

const SCORE_OPTIONS = [10, 8, 4, 2];

// 固定部门与办公室顺序（与模板一致）
const DEPARTMENTS_TEMPLATE = [
  { name: '经营管控中心', rooms: ['经营管控中心（南面）1楼', '经营管控中心（北面）2楼'] },
  { name: '供应二部', rooms: ['原料科（南屋）（1楼）', '原料科（北屋）（1楼）', '钢后科（1楼）'] },
  { name: '供应一部', rooms: ['业务员大办公室（2楼）', '业务员小办公室（2楼）'] },
  { name: '销售部', rooms: ['业务员办公室（3楼）', '合同管理员（3楼）', '副产品（3楼）'] },
  { name: '人力资源部', rooms: ['招聘配置科（3楼）', '薪酬科（3楼）'] },
  { name: '企管部', rooms: ['办公室（靠北）（4楼）'] },
  { name: '审计监察部', rooms: ['办公室（中间与靠南）（4楼）'] },
  { name: '财务部', rooms: ['资产科（4楼）', '结算中心（4楼）', '成本科（5楼)'] },
  { name: '法务部', rooms: ['办公室（5楼）'] },
  { name: '总经办', rooms: ['办公室（5楼）'] },
  { name: '监察部', rooms: ['办公室（5楼）'] },
  { name: '外矿部', rooms: ['办公室(5楼）'] },
  { name: '财务部（工程楼）', rooms: ['三级账（工程部2楼）', '质计部-磅单计量（工程部2楼）', '资产科-合同租（工程部2楼）', '经营核算科北屋（工程部3楼）'] },
  { name: '预算部（工程楼）', rooms: ['预算1（工程部2楼）', '预算2（工程部2楼）', '预算3（工程部2楼）'] },
  { name: '公司办公室（工程楼）', rooms: ['办公室（工程部2楼）', '司机办公室（工程部2楼）', '资料室（工程部3楼东）', '文印室（工程楼1楼）'] },
  { name: '工程审计', rooms: ['工程楼(3楼)'] },
  { name: '工程部', rooms: ['工程部办公室（工程楼2楼）'] },
];

// 生成CSV内容（按照模板格式）
function generateCSVContent(inspections, departments, month) {
  // 按部门、办公室、日期分组（每个办公室每天只取一条记录）
  const groupedMap = new Map();
  
  inspections.forEach(record => {
    // record.date 格式如 "2024-01-15" 或 "2024年01月15日"
    const recordDate = record.date || '';
    const key = `${record.department}-${record.room}-${recordDate}`;
    
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        department: record.department,
        room: record.room,
        date: recordDate,
        details: {},
        createdAt: record.createdAt || null,
      });
    }

    const group = groupedMap.get(key);
    // 同一天有多条记录时，取 createdAt 最新的一条
    const toMillis = (v) => {
      if (!v) return 0;
      if (typeof v === 'number') return v;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'object' && v.$date) return new Date(v.$date).getTime();
      if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
      return 0;
    };
    
    const shouldReplace = toMillis(record.createdAt) >= toMillis(group.createdAt);
    if (shouldReplace) {
      group.createdAt = record.createdAt || null;
      group.details = {};
      (record.details || []).forEach(detail => {
        group.details[detail.item] = detail.score;
      });
    }
  });

  // 构建CSV行
  const rows = [];
  
  // 第一行：标题（与模板列数对齐：33列）
  rows.push('职能部室（办公室）7S联查评分表' + ','.repeat(32));
  
  // 第二行：日期
  const dateStr = month || new Date().toISOString().slice(0, 7);
  rows.push(`日期：${dateStr}` + ','.repeat(32));
  
  // 第三行：表头 - 部门名称、办公室位置、7个大项标题
  let headerRow = ['部门名称', '办公室位置'];
  SCORING_ITEMS.forEach(item => {
    headerRow.push(item.name, '', '', '');
  });
  headerRow.push('总评分', '');
  rows.push(headerRow.join(','));
  
  // 第四行：描述行
  let descRow = ['', ''];
  SCORING_ITEMS.forEach(item => {
    descRow.push(item.desc, '', '', '');
  });
  descRow.push('', '');
  rows.push(descRow.join(','));
  
  // 第五行：分数选项行
  let scoreRow = ['', ''];
  SCORING_ITEMS.forEach(() => {
    scoreRow.push('10分', '8分', '4分', '2分');
  });
  scoreRow.push('', '');
  rows.push(scoreRow.join(','));

  // 数据行：按日期分组，每个办公室每天一行
  // 先收集所有日期并排序
  const dateSet = new Set();
  groupedMap.forEach((data, key) => {
    if (data.date) dateSet.add(data.date);
  });
  const sortedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));

  // 按日期顺序输出
  const deptList = (departments && departments.length > 0) ? departments : DEPARTMENTS_TEMPLATE;
  sortedDates.forEach(date => {
    deptList.forEach(dept => {
      dept.rooms.forEach(room => {
        const key = `${dept.name}-${room}-${date}`;
        const data = groupedMap.get(key);
        if (!data) return; // 该办公室当天无记录则跳过

        let dataRow = [dept.name, room];
        let totalScore = 0;

        SCORING_ITEMS.forEach(item => {
          const score = data.details[item.name] || 0;
          totalScore += score;

          // 在对应分数列打勾（用"✓"表示）
          SCORE_OPTIONS.forEach(opt => {
            if (score === opt) {
              dataRow.push('✓');
            } else {
              dataRow.push('');
            }
          });
        });

        dataRow.push(totalScore > 0 ? totalScore.toString() : '');
        dataRow.push('');
        rows.push(dataRow.join(','));
      });
    });
  });

  // 添加UTF-8 BOM以确保Excel正确识别中文
  return '\uFEFF' + rows.join('\n');
}

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

  // 第1行：标题（合并31列）
  worksheet.mergeCells('A1:AE1');
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
  worksheet.mergeCells('A2:AE2');
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
    for (let c = 1; c <= 31; c++) {
      worksheet.getCell(r, c).border = thinBorder;
    }
  }

  // 第3行：大项名称
  const headerRow3 = worksheet.getRow(3);
  headerRow3.height = 30; // 统一高度
  for (let i = 0; i < SCORING_ITEMS.length; i++) {
    const startCol = 3 + i * 4;
    const endCol = startCol + 3;
    const cell = headerRow3.getCell(startCol);
    cell.value = SCORING_ITEMS[i].name;
    cell.font = { name: '等线', size: 10, bold: true };
    cell.alignment = centerAlignment;
    worksheet.mergeCells(3, startCol, 3, endCol);
  }

  // 第4行：描述行
  const headerRow4 = worksheet.getRow(4);
  headerRow4.height = 30; // 修正高度，与第3行保持一致
  for (let i = 0; i < SCORING_ITEMS.length; i++) {
    const startCol = 3 + i * 4;
    const endCol = startCol + 3;
    const cell = headerRow4.getCell(startCol);
    cell.value = SCORING_ITEMS[i].desc;
    cell.font = { name: '等线', size: 9 };
    // 修正对齐方式：改为居中对齐
    cell.alignment = centerAlignment;
    worksheet.mergeCells(4, startCol, 4, endCol);
  }

  // 第5行：分数档位
  const headerRow5 = worksheet.getRow(5);
  headerRow5.height = 20;
  for (let i = 0; i < SCORING_ITEMS.length; i++) {
    const startCol = 3 + i * 4;
    ['10分', '8分', '4分', '2分'].forEach((val, idx) => {
      const cell = headerRow5.getCell(startCol + idx);
      cell.value = val;
      cell.font = { name: '等线', size: 9 };
      cell.alignment = centerAlignment;
    });
  }

  // 合并总评分 AE3:AE5 (仅AE列)
  worksheet.mergeCells('AE3:AE5');
  const totalScoreHeaderCell = worksheet.getCell('AE3');
  totalScoreHeaderCell.value = '总评分';
  totalScoreHeaderCell.font = { name: '等线', size: 10, bold: true };
  totalScoreHeaderCell.alignment = centerAlignment;
  totalScoreHeaderCell.border = thinBorder;
  // 确保合并区域的每一格都有边框
  ['AE3', 'AE4', 'AE5'].forEach(ref => {
    worksheet.getCell(ref).border = thinBorder;
  });

  // 按部门、办公室、日期分组
  const groupedMap = new Map();
  inspections.forEach(record => {
    const recordDate = record.date || '';
    const key = `${record.department}-${record.room}-${recordDate}`;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, { details: {}, date: recordDate, createdAt: record.createdAt || null });
    }
    const group = groupedMap.get(key);
    const toMillis = (v) => {
      if (!v) return 0;
      if (typeof v === 'number') return v;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'object' && v.$date) return new Date(v.$date).getTime();
      if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
      return 0;
    };
    const shouldReplace = toMillis(record.createdAt) >= toMillis(group.createdAt);
    if (shouldReplace) {
      group.createdAt = record.createdAt || null;
      group.details = {};
      (record.details || []).forEach(d => {
        group.details[d.item] = d.score;
      });
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

  // 数据行
  let currentRow = 6;
  sortedDates.forEach(date => {
    // 记录每个部门的起始行，用于后续合并
    const deptRowMap = new Map(); // deptName -> { startRow, endRow }
    
    DEPARTMENTS_TEMPLATE.forEach(dept => {
      const deptStartRow = currentRow;
      
      dept.rooms.forEach(room => {
        const dataKey = `${dept.name}-${room}-${date}`;
        const data = groupedMap.get(dataKey);

        const row = worksheet.getRow(currentRow);
        const rowValues = [dept.name, room];
        let totalScore = 0;
        
        SCORING_ITEMS.forEach(item => {
          const score = data?.details?.[item.name] || 0;
          totalScore += score;
          if (score === 10) rowValues.push('✓', '', '', '');
          else if (score === 8) rowValues.push('', '✓', '', '');
          else if (score === 4) rowValues.push('', '', '✓', '');
          else if (score === 2) rowValues.push('', '', '', '✓');
          else rowValues.push('', '', '', '');
        });
        rowValues.push(totalScore > 0 ? totalScore : '');
        
        row.values = rowValues;
        row.font = defaultFont;
        row.alignment = centerAlignment;
        row.height = 20; // 调小数据行高
        for (let i = 1; i <= 31; i++) {
          row.getCell(i).border = thinBorder;
        }
        
        currentRow++;
      });
      
      // 记录部门的行范围
      const deptEndRow = currentRow - 1;
      if (deptStartRow <= deptEndRow && dept.rooms.length > 1) {
        deptRowMap.set(dept.name, { startRow: deptStartRow, endRow: deptEndRow });
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

  // 设置列宽（与原模板对齐）
  worksheet.getColumn(1).width = 20; // 部门名称
  worksheet.getColumn(2).width = 30; // 办公室位置
  // 每个大项4列（10分/8分/4分/2分）
  for (let i = 3; i <= 30; i++) {
    worksheet.getColumn(i).width = 7; // 分数列调整
  }
  worksheet.getColumn(31).width = 12; // 总评分 AE列

  // 冻结窗格：冻结前5行与前2列
  // worksheet.views = [
  //   { state: 'frozen', xSplit: 2, ySplit: 5 }
  // ];

  // ==================== 添加红黑榜工作表 ====================
  const rankSheet = workbook.addWorksheet('红黑榜排名');

  // 计算每个办公室的最新评分（按日期取最新）
  const officeScores = [];
  DEPARTMENTS_TEMPLATE.forEach(dept => {
    dept.rooms.forEach(room => {
      // 查找该办公室的所有记录，取最新日期的
      const records = [];
      sortedDates.forEach(date => {
        const dataKey = `${dept.name}-${room}-${date}`;
        const data = groupedMap.get(dataKey);
        if (data && data.date) {
          let totalScore = 0;
          SCORING_ITEMS.forEach(item => {
            totalScore += data.details?.[item.name] || 0;
          });
          records.push({ date: data.date, score: totalScore });
        }
      });
      // 取最新日期的分数
      if (records.length > 0) {
        records.sort((a, b) => b.date.localeCompare(a.date));
        officeScores.push({
          department: dept.name,
          room: room,
          score: records[0].score,
          date: records[0].date
        });
      } else {
        // 无评分记录，分数为0
        officeScores.push({
          department: dept.name,
          room: room,
          score: 0,
          date: '-'
        });
      }
    });
  });

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
    item.score > 0 && item.score < 70 && !redKeySet.has(`${item.department}|${item.room}`)
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
  rankSheet.mergeCells('A1:E1');
  const rankTitleCell = rankSheet.getCell('A1');
  rankTitleCell.value = `${formattedDate} 7S检查红黑榜`;
  rankTitleCell.font = { name: '等线', size: 14, bold: true };
  rankTitleCell.alignment = { horizontal: 'center', vertical: 'center' };
  rankTitleCell.border = thinBorder;
  rankSheet.getRow(1).height = 30;

  // 红榜标题
  rankSheet.mergeCells('A2:E2');
  const redTitleCell = rankSheet.getCell('A2');
  redTitleCell.value = '红榜（得分最高）';
  redTitleCell.font = { name: '等线', size: 12, bold: true, color: { argb: 'FF0000' } };
  redTitleCell.alignment = { horizontal: 'center', vertical: 'center' };
  redTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6' } };
  redTitleCell.border = thinBorder;
  rankSheet.getRow(2).height = 28;

  // 红榜表头
  const redHeaderRow = rankSheet.getRow(3);
  ['排名', '部门', '办公室', '得分', '检查日期'].forEach((val, idx) => {
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
    [item.rank || (index + 1), item.department, item.room, item.score, item.date].forEach((val, idx) => {
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
  rankSheet.mergeCells(`A${rankRow}:E${rankRow}`);
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
  ['排名', '部门', '办公室', '得分', '检查日期'].forEach((val, idx) => {
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
    [item.reverseRank || (index + 1), item.department, item.room, item.score, item.date].forEach((val, idx) => {
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
    rankSheet.mergeCells(`A${rankRow}:E${rankRow}`);
    const hintCell = rankSheet.getCell(`A${rankRow}`);
    hintCell.value = `ℹ️ 本期满分或与红榜同分的部门较多，黑榜仅显示${blackList.length}个`;
    hintCell.font = { name: '等线', size: 9, color: { argb: '666666' } };
    hintCell.alignment = { horizontal: 'left', vertical: 'center' };
    rankSheet.getRow(rankRow).height = 20;
  }

  // 设置红黑榜列宽
  rankSheet.getColumn(1).width = 10; // 排名
  rankSheet.getColumn(2).width = 20; // 部门
  rankSheet.getColumn(3).width = 30; // 办公室
  rankSheet.getColumn(4).width = 10; // 得分
  rankSheet.getColumn(5).width = 15; // 检查日期

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

  // 计算红黑榜（使用并列排名逻辑）
  const groupedMap = new Map();
  filteredInspections.forEach(record => {
    const key = `${record.department}-${record.room}`;
    if (!groupedMap.has(key) || groupedMap.get(key).totalScore < record.totalScore) {
      groupedMap.set(key, record);
    }
  });
  const groupedRecords = Array.from(groupedMap.values());
  groupedRecords.sort((a, b) => b.totalScore - a.totalScore);

  // 计算并列排名
  const rankedRecords = [];
  let currentRank = 1;
  groupedRecords.forEach((record, index) => {
    if (index > 0 && record.totalScore !== groupedRecords[index - 1].totalScore) {
      currentRank = index + 1;
    }
    rankedRecords.push({ ...record, rank: currentRank });
  });

  // 红榜：取前3个排名的所有记录（无论是否存在第3名）
  const redList = rankedRecords.filter(r => r.rank <= 3);

  // 黑榜：从不在红榜且非满分的记录中选取（严格排除，无兜底）
  const redIds = new Set(redList.map(r => r._id));
  const blackCandidates = rankedRecords.filter(r => 
    r.totalScore < 70 && !redIds.has(r._id)
  );
  // 注意：如果所有非满分记录都在红榜中，blackCandidates为空，黑榜即为空

  // 计算倒数排名并取倒数前3名
  const reverseRankedRecords = [];
  let currentReverseRank = 1;
  blackCandidates.forEach((record, index) => {
    if (index > 0 && record.totalScore !== blackCandidates[index - 1].totalScore) {
      currentReverseRank = index + 1;
    }
    reverseRankedRecords.push({ ...record, reverseRank: currentReverseRank });
  });
  const blackList = reverseRankedRecords.filter(r => r.reverseRank <= 3);

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
    // 构建查询条件
    let query = db.collection('inspections');
    
    if (month) {
      query = query.where({
        date: db.RegExp({
          regexp: `^${month}`,
          options: 'i'
        })
      });
    }

    const inspectionsRes = await query
      .orderBy('date', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();

    const inspections = inspectionsRes.data;

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

      if (format === 'csv' || format === 'both') {
        result.csvFileName = `7S联查评分表_${dateStr}.csv`;
        result.csvContent = generateCSVContent(inspections, departments, month);
      }

      if (format === 'xlsx' || format === 'both') {
        const excelBuffer = await generateExcelBuffer(inspections, departments, month, date);
        result.xlsxFileName = `7S联查评分表_${dateStr}.xlsx`;
        result.xlsxBase64 = Buffer.from(excelBuffer).toString('base64');
      }

      // 公示榜格式
      if (format === 'bulletin') {
        const bulletinBuffer = await generateBulletinBuffer(inspections, date);
        const bulletinDate = date || (inspections.length > 0 ? inspections[0].date : dateStr);
        result.xlsxFileName = `7S评比结果公示_${bulletinDate}.xlsx`;
        result.xlsxBase64 = Buffer.from(bulletinBuffer).toString('base64');
      }

      return result;
    }

    // 生成CSV文件
    if (format === 'csv' || format === 'both') {
      const csvContent = generateCSVContent(inspections, departments, month);
      const csvFileName = `7S联查评分表_${dateStr}.csv`;
      
      // 上传到云存储
      const csvUploadRes = await cloud.uploadFile({
        cloudPath: `exports/${csvFileName}`,
        fileContent: Buffer.from(csvContent, 'utf8')
      });

      files.push({
        fileID: csvUploadRes.fileID,
        fileName: csvFileName,
        fileType: 'csv'
      });
    }

    // 生成Excel文件（使用exceljs生成带样式的xlsx）
    if (format === 'xlsx' || format === 'both') {
      const excelContent = await generateExcelBuffer(inspections, departments, month);
      const excelFileName = `7S联查评分表_${dateStr}.xlsx`;
      
      // 上传到云存储
      const excelUploadRes = await cloud.uploadFile({
        cloudPath: `exports/${excelFileName}`,
        fileContent: Buffer.from(excelContent, 'utf8')
      });

      files.push({
        fileID: excelUploadRes.fileID,
        fileName: excelFileName,
        fileType: 'xlsx'
      });
    }

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
