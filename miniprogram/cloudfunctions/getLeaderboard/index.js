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

    // 缓存命中：按日期缓存红黑榜，避免重复聚合计算
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const cacheKey = String(targetDate);
    try {
      const cacheRes = await db.collection('leaderboard_cache').doc(cacheKey).get();
      const cacheData = cacheRes && cacheRes.data ? cacheRes.data : null;
      if (cacheData && typeof cacheData.expiresAt === 'number' && cacheData.expiresAt > Date.now()) {
        return {
          success: true,
          redList: Array.isArray(cacheData.redList) ? cacheData.redList : [],
          blackList: Array.isArray(cacheData.blackList) ? cacheData.blackList : [],
          date: targetDate,
          cached: true
        };
      }
    } catch (e) {
      // 缓存读取失败不阻断主流程
    }

    // 数据库侧按“部门+办公室”分组取最高分，避免单日期全量拉取
    // 先按 totalScore 降序排序，再 group 取 first，可得到每组最高分记录
    const groupedAgg = await db.collection('inspections')
      .aggregate()
      .match({
        date: targetDate
      })
      .sort({
        totalScore: -1
      })
      .group({
        _id: {
          department: '$department',
          room: '$room'
        },
        totalScore: $.first('$totalScore'),
        date: $.first('$date')
      })
      .project({
        _id: 0,
        department: '$_id.department',
        room: '$_id.room',
        totalScore: 1,
        date: 1
      })
      .end();

    const groupedRecords = (groupedAgg.list || []).map((r) => ({
      ...r,
      _id: `${r.department}-${r.room}`
    }));

    // 计算红黑榜
    const { redList, blackList } = calculateLeaderboard(groupedRecords, TOTAL_MAX_SCORE);

    // 写入缓存（失败不阻断返回）
    try {
      await db.collection('leaderboard_cache').doc(cacheKey).set({
        data: {
          redList,
          blackList,
          date: targetDate,
          expiresAt: Date.now() + CACHE_TTL_MS,
          updatedAt: db.serverDate()
        }
      });
    } catch (e) {
      // ignore
    }

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
