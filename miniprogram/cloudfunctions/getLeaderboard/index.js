// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const $ = db.command.aggregate;

// 引入公共模块
const { calculateLeaderboard, groupByDepartmentAndRoom } = require('./shared/ranking');
const { TOTAL_MAX_SCORE } = require('./shared/constants');

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { date } = event;
    let targetDate = date;

    // 如果未传入日期，则获取最新一期的检查记录
    if (!targetDate) {
      const latestDateRes = await db.collection('inspections')
        .orderBy('date', 'desc')
        .limit(1)
        .field({ date: true })
        .get();

      if (latestDateRes.data.length === 0) {
        return {
          redList: [],
          blackList: []
        };
      }

      targetDate = latestDateRes.data[0].date;
    }

    // 获取该日期的所有记录
    const allRecordsRes = await db.collection('inspections')
      .where({
        date: targetDate
      })
      .orderBy('totalScore', 'desc')
      .get();

    const allRecords = allRecordsRes.data;

    // 按部门+办公室分组，取每组的最高分
    const groupedRecords = groupByDepartmentAndRoom(allRecords);

    // 计算红黑榜
    const { redList, blackList } = calculateLeaderboard(groupedRecords, TOTAL_MAX_SCORE);

    return {
      success: true,
      redList,
      blackList,
      date: targetDate
    };
  } catch (err) {
    console.error('获取排行榜失败', err);
    return {
      success: false,
      message: err.message || '获取排行榜失败',
      redList: [],
      blackList: []
    };
  }
};
