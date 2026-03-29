/**
 * 评分配置模块
 * 统一管理评分项、最高分、低分阈值等配置
 * 前端和云函数共用（云函数通过 shared/constants.js 同步）
 */

// 评分项列表（顺序固定）
export const SCORING_ITEMS = [
  '地面',
  '桌面摆放',
  '文件资料',
  '电器设备',
  '办公椅',
  '窗台',
  '整体印象',
] as const;

// 评分项类型
export type ScoringItem = (typeof SCORING_ITEMS)[number];

// 每项最高分（100分制）
export const SCORING_MAX_SCORES: Record<ScoringItem, number> = {
  '地面': 20,
  '桌面摆放': 20,
  '文件资料': 10,
  '电器设备': 20,
  '办公椅': 10,
  '窗台': 10,
  '整体印象': 10,
};

// 低分阈值（最高分的40%，向下取整）
export const SCORING_LOW_THRESHOLDS: Record<ScoringItem, number> = {
  '地面': 8,        // 20 * 0.4 = 8
  '桌面摆放': 8,    // 20 * 0.4 = 8
  '文件资料': 4,    // 10 * 0.4 = 4
  '电器设备': 8,    // 20 * 0.4 = 8
  '办公椅': 4,      // 10 * 0.4 = 4
  '窗台': 4,        // 10 * 0.4 = 4
  '整体印象': 4,    // 10 * 0.4 = 4
};

// 快捷标签配置（统一百分比标准：100%/80%/60%/40%）
export const QUICK_TAGS: Record<number, Array<{ label: string; value: number }>> = {
  20: [
    { label: '满分', value: 20 },      // 100%
    { label: '16良好', value: 16 },   // 80%
    { label: '12一般', value: 12 },   // 60%
    { label: '8较差', value: 8 },     // 40% - 等于低分阈值，触发备注
  ],
  10: [
    { label: '满分', value: 10 },     // 100%
    { label: '8良好', value: 8 },      // 80%
    { label: '6一般', value: 6 },      // 60%
    { label: '4较差', value: 4 },      // 40% - 等于低分阈值，触发备注
  ],
};

// 评分标准配置映射表（提示为最高分标准）
export const SCORING_STANDARDS: Record<ScoringItem, string> = {
  '地面': '地面干净整洁，无垃圾、污渍、水渍',
  '桌面摆放': '物品摆放整齐，无私人物品，无杂物堆积',
  '文件资料': '文件资料分类明确，标识清晰，易于查找',
  '电器设备': '电器设备摆放整齐，无积尘，电线不杂乱',
  '办公椅': '办公椅摆放整齐，无损坏，无污渍',
  '窗台': '窗台无灰尘、无杂物摆放，玻璃明亮',
  '整体印象': '办公室整体整洁有序，环境优美',
};

// 总分上限
export const TOTAL_MAX_SCORE = 100;

// 红榜排名数量
export const RED_LIST_COUNT = 3;

// 黑榜排名数量
export const BLACK_LIST_COUNT = 3;

/**
 * 判断是否为低分（需要备注或照片）
 */
export function isLowScore(item: ScoringItem, score: number): boolean {
  return score <= SCORING_LOW_THRESHOLDS[item];
}

/**
 * 获取评分项的快捷标签
 */
export function getQuickTags(item: ScoringItem): Array<{ label: string; value: number }> {
  const maxScore = SCORING_MAX_SCORES[item];
  return QUICK_TAGS[maxScore] || [];
}

/**
 * 计算总分
 */
export function calculateTotalScore(scores: Record<ScoringItem, number>): number {
  return SCORING_ITEMS.reduce((total, item) => total + (scores[item] || 0), 0);
}
