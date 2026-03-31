/**
 * 红黑榜排名计算模块
 * 供 getLeaderboard、exportReport 等云函数使用
 */

/**
 * 计算并列排名（密集排名：1,1,2,2,3...）
 * @param {Array} records - 检查记录数组
 * @returns {Array} - 带排名的记录数组
 */
function calculateRanks(records) {
  if (records.length === 0) return [];

  // 按分数降序排序
  const sorted = [...records].sort((a, b) => b.totalScore - a.totalScore);

  // 计算每个记录的排名
  const result = [];
  let currentRank = 1;
  let currentScore = sorted[0]?.totalScore;

  sorted.forEach((record) => {
    if (record.totalScore !== currentScore) {
      // 分数变化，排名递增
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

/**
 * 计算倒数排名（密集排名）
 * @param {Array} records - 检查记录数组
 * @returns {Array} - 带倒数排名的记录数组
 */
function calculateReverseRanks(records) {
  if (records.length === 0) return [];

  // 按分数升序排序（从低到高）
  const sorted = [...records].sort((a, b) => a.totalScore - b.totalScore);

  // 计算每个记录的倒数排名
  const result = [];
  let currentReverseRank = 1;
  let currentScore = sorted[0]?.totalScore;

  sorted.forEach((record) => {
    if (record.totalScore !== currentScore) {
      // 分数变化，排名递增
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

/**
 * 计算红黑榜
 * @param {Array} records - 检查记录数组（已按部门+办公室分组取最高分）
 * @param {number} maxScore - 总分上限（默认100分）
 * @returns {Object} - { redList, blackList }
 */
function calculateLeaderboard(records, maxScore = 100) {
  if (records.length === 0) {
    return { redList: [], blackList: [] };
  }

  // 计算并列排名
  const rankedRecords = calculateRanks(records);

  // 红榜：取排名<=3的记录
  const redList = rankedRecords.filter(r => r.rank <= 3);

  // 黑榜候选：排除满分和已在红榜中的记录
  const redIds = new Set(redList.map(r => r._id));
  const blackCandidates = rankedRecords.filter(r =>
    r.totalScore < maxScore && !redIds.has(r._id)
  );

  // 黑榜：从候选记录中取倒数前3名
  let blackList = [];
  if (blackCandidates.length > 0) {
    const reverseRankedRecords = calculateReverseRanks(blackCandidates);
    blackList = reverseRankedRecords.filter(r => r.reverseRank <= 3);
  }

  return { redList, blackList };
}

/**
 * 按部门+办公室分组，取每组的最高分记录
 * @param {Array} records - 原始检查记录数组
 * @returns {Array} - 分组后的记录数组
 */
function groupByDepartmentAndRoom(records) {
  const groupedMap = new Map();

  records.forEach(record => {
    const key = `${record.department}-${record.room}`;
    if (!groupedMap.has(key) || groupedMap.get(key).totalScore < record.totalScore) {
      groupedMap.set(key, record);
    }
  });

  return Array.from(groupedMap.values());
}

module.exports = {
  calculateRanks,
  calculateReverseRanks,
  calculateLeaderboard,
  groupByDepartmentAndRoom
};
