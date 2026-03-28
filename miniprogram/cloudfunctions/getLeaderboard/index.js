// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const $ = db.command.aggregate;

// 计算并列排名的函数
function calculateRanks(records) {
  if (records.length === 0) return [];
  
  // 按分数降序排序
  const sorted = [...records].sort((a, b) => b.totalScore - a.totalScore);
  
  // 计算每个记录的排名
  const result = [];
  let currentRank = 1;
  let currentScore = sorted[0]?.totalScore;
  
  sorted.forEach((record, index) => {
    if (record.totalScore !== currentScore) {
      // 分数变化，使用密集排名（1,1,2,2,3...）
      currentRank += 1;
      currentScore = record.totalScore;
    }
    result.push({
      ...record,
      rank: currentRank
    });
  });
  
  return result;
}

// 计算倒数排名的函数
function calculateReverseRanks(records) {
  if (records.length === 0) return [];
  
  // 按分数升序排序（从低到高）
  const sorted = [...records].sort((a, b) => a.totalScore - b.totalScore);
  
  // 计算每个记录的倒数排名
  const result = [];
  let currentReverseRank = 1;
  let currentScore = sorted[0]?.totalScore;
  
  sorted.forEach((record, index) => {
    if (record.totalScore !== currentScore) {
      // 分数变化，使用密集排名
      currentReverseRank += 1;
      currentScore = record.totalScore;
    }
    result.push({
      ...record,
      reverseRank: currentReverseRank
    });
  });
  
  return result;
}

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
    const groupedMap = new Map();
    allRecords.forEach(record => {
      const key = `${record.department}-${record.room}`;
      if (!groupedMap.has(key) || groupedMap.get(key).totalScore < record.totalScore) {
        groupedMap.set(key, record);
      }
    });

    const groupedRecords = Array.from(groupedMap.values());

    // 计算并列排名
    const rankedRecords = calculateRanks(groupedRecords);

    // 红榜：取第1、2、3名及所有同分的部门
    // 无论是否存在第3名，只取排名<=3的记录
    const redList = rankedRecords.filter(r => r.rank <= 3);

    // 黑榜：从不在红榜中的记录里，取倒数前3名
    const redIds = new Set(redList.map(r => r._id));
    const blackCandidates = rankedRecords.filter(r => 
      r.totalScore < 100 && !redIds.has(r._id)
    );
    // 注意：如果所有非满分记录都在红榜中，blackCandidates为空，黑榜即为空
    
    // 黑榜：从候选记录中取倒数前3名及同分部门
    let blackList = [];
    if (blackCandidates.length > 0) {
      const reverseRankedRecords = calculateReverseRanks(blackCandidates);
      blackList = reverseRankedRecords.filter(r => r.reverseRank <= 3);
    }

    return {
      redList,
      blackList,
      date: targetDate
    };
  } catch (err) {
    console.error('获取排行榜失败', err);
    throw err;
  }
};
