// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 获取所有检查记录
    const res = await db.collection('inspections')
      .orderBy('date', 'desc')
      .limit(1000)
      .get();

    const inspections = res.data;

    if (inspections.length === 0) {
      return {
        trendData: [],
        deptData: [],
        issueData: []
      };
    }

    // 1. 趋势数据：按日期分组计算平均分
    const dateMap = new Map();
    inspections.forEach(record => {
      if (!dateMap.has(record.date)) {
        dateMap.set(record.date, []);
      }
      dateMap.get(record.date).push(record.totalScore);
    });

    const trendData = Array.from(dateMap.entries())
      .map(([date, scores]) => ({
        date,
        averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10); // 最近10天

    // 2. 部门数据：按部门分组计算平均分
    const deptMap = new Map();
    inspections.forEach(record => {
      if (!deptMap.has(record.department)) {
        deptMap.set(record.department, []);
      }
      deptMap.get(record.department).push(record.totalScore);
    });

    const deptData = Array.from(deptMap.entries())
      .map(([department, scores]) => ({
        department,
        averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
      }))
      .sort((a, b) => b.averageScore - a.averageScore);

    // 3. 问题项数据：按评分项计算平均分（越低表示扣分越严重）
    const scoringItems = ['桌面摆放', '地面', '窗台', '文件资料', '电器设备', '办公椅', '整体印象'];
    const itemScores = {};
    scoringItems.forEach(item => {
      itemScores[item] = [];
    });

    inspections.forEach(record => {
      if (record.details && Array.isArray(record.details)) {
        record.details.forEach(detail => {
          if (itemScores[detail.item]) {
            itemScores[detail.item].push(detail.score);
          }
        });
      }
    });

    const issueData = Object.entries(itemScores)
      .filter(([item, scores]) => scores.length > 0)
      .map(([item, scores]) => ({
        item,
        averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
      }))
      .sort((a, b) => a.averageScore - b.averageScore); // 分数低的排前面

    return {
      trendData,
      deptData,
      issueData
    };
  } catch (err) {
    console.error('获取分析数据失败', err);
    throw err;
  }
};
