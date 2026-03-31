/**
 * 评分常量定义模块
 * 与前端 config/scoring.ts 保持一致
 */

// 评分项列表（顺序固定）
const SCORING_ITEMS = [
  '地面',
  '桌面摆放',
  '文件资料',
  '电器设备',
  '办公椅',
  '窗台',
  '整体印象',
];

// 每项最高分（100分制）
const SCORING_MAX_SCORES = {
  '地面': 20,
  '桌面摆放': 20,
  '文件资料': 10,
  '电器设备': 20,
  '办公椅': 10,
  '窗台': 10,
  '整体印象': 10,
};

// 低分阈值（最高分的40%，向下取整）
const SCORING_LOW_THRESHOLDS = {
  '地面': 8,        // 20 * 0.4 = 8
  '桌面摆放': 8,    // 20 * 0.4 = 8
  '文件资料': 4,    // 10 * 0.4 = 4
  '电器设备': 8,    // 20 * 0.4 = 8
  '办公椅': 4,      // 10 * 0.4 = 4
  '窗台': 4,        // 10 * 0.4 = 4
  '整体印象': 4,    // 10 * 0.4 = 4
};

// 总分上限
const TOTAL_MAX_SCORE = 100;

// 红榜排名数量
const RED_LIST_COUNT = 3;

// 黑榜排名数量
const BLACK_LIST_COUNT = 3;

/**
 * 判断是否为低分（需要备注或照片）
 */
function isLowScore(item, score) {
  return score <= SCORING_LOW_THRESHOLDS[item];
}

module.exports = {
  SCORING_ITEMS,
  SCORING_MAX_SCORES,
  SCORING_LOW_THRESHOLDS,
  TOTAL_MAX_SCORE,
  RED_LIST_COUNT,
  BLACK_LIST_COUNT,
  isLowScore
};
