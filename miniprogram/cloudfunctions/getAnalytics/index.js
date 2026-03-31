// 云函数入口文件 - getAnalytics 7S管理分析仪表盘
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

let sharedConstants;
try {
  sharedConstants = require('./shared/constants');
} catch (e) {
  sharedConstants = null;
}

const SCORING_MAX_SCORES = sharedConstants?.SCORING_MAX_SCORES;
const TOTAL_MAX_SCORE = sharedConstants?.TOTAL_MAX_SCORE;
const PASS_THRESHOLD = 60; // 达标阈值（得分率60%）

function makeRequestId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// 云函数入口函数
exports.main = async (event, context) => {
  const requestId = makeRequestId();
  try {
    const perf = {
      cached: false,
      cacheGetMs: 0,
      trendMs: 0,
      deptMs: 0,
      issueMs: 0,
      currentAvgMs: 0,
      prevAvgMs: 0,
      unqualifiedMs: 0,
      totalMs: 0,
    };
    const totalStart = Date.now();

    if (!SCORING_MAX_SCORES || !TOTAL_MAX_SCORE) {
      return {
        success: false,
        code: 'SHARED_MODULE_MISSING',
        message: '评分常量模块未同步，无法获取分析数据',
        requestId
      };
    }
    // 支持自定义日期范围，默认最近 30 天
    const { dateRange = 30 } = event;

    // 计算起始日期
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dateRange);
    const startDateStr = startDate.toISOString().slice(0, 10);

    // 计算上一周期起始日期（用于环比）
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - dateRange);
    const prevStartDateStr = prevStartDate.toISOString().slice(0, 10);

    // 缓存命中：按 dateRange + startDateStr 缓存分析结果，避免重复聚合计算
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const cacheKey = `${String(dateRange)}_${String(startDateStr)}`;
    try {
      const cacheGetStart = Date.now();
      const cacheRes = await db.collection('analytics_cache').doc(cacheKey).get();
      perf.cacheGetMs = Date.now() - cacheGetStart;
      const cacheData = cacheRes && cacheRes.data ? cacheRes.data : null;
      if (cacheData && typeof cacheData.expiresAt === 'number' && cacheData.expiresAt > Date.now()) {
        perf.cached = true;
        perf.totalMs = Date.now() - totalStart;
        return {
          success: true,
          requestId,
          cached: true,
          perf,
          trendData: Array.isArray(cacheData.trendData) ? cacheData.trendData : [],
          deptData: Array.isArray(cacheData.deptData) ? cacheData.deptData : [],
          issueData: Array.isArray(cacheData.issueData) ? cacheData.issueData : [],
          healthOverview: cacheData.healthOverview || { overallAverage: 0, weekOverWeekChange: 0 },
          paretoData: Array.isArray(cacheData.paretoData) ? cacheData.paretoData : [],
          unqualifiedOffices: Array.isArray(cacheData.unqualifiedOffices) ? cacheData.unqualifiedOffices : [],
        };
      }
    } catch (e) {
      // 缓存读取失败不阻断主流程
    }

    // ========== 1. 趋势数据：按日期分组 ==========
    const trendStart = Date.now();
    const trendPipeline = await db.collection('inspections')
      .aggregate()
      .match({
        date: _.gte(startDateStr)
      })
      .group({
        _id: '$date',
        averageScore: $.avg('$totalScore'),
        count: $.sum(1)
      })
      .sort({
        _id: 1
      })
      .limit(30)
      .end();
    perf.trendMs = Date.now() - trendStart;

    const trendData = trendPipeline.list
      .map(item => ({
        date: item._id,
        averageScore: Math.round(item.averageScore * 10) / 10
      }))
      .slice(-10); // 最近10天

    // ========== 2. 部门数据：按部门分组（含检查频次）==========
    const deptStart = Date.now();
    const deptPipeline = await db.collection('inspections')
      .aggregate()
      .match({
        date: _.gte(startDateStr)
      })
      .group({
        _id: '$department',
        averageScore: $.avg('$totalScore'),
        inspectionCount: $.sum(1)
      })
      .sort({
        averageScore: -1
      })
      .end();
    perf.deptMs = Date.now() - deptStart;

    const deptData = deptPipeline.list.map(item => ({
      department: item._id,
      averageScore: Math.round(item.averageScore * 10) / 10,
      inspectionCount: item.inspectionCount
    }));

    // ========== 2.1 办公室数据：按办公室分组（部门+房间）==========
    // ~~已删除：办公室表现分布图功能已移除~~

    // ========== 3. 问题项数据：按评分项分组 ==========
    const issueStart = Date.now();
    const issuePipeline = await db.collection('inspections')
      .aggregate()
      .match({
        date: _.gte(startDateStr),
        details: _.exists(true)
      })
      .unwind('$details')
      .group({
        _id: '$details.item',
        averageScore: $.avg('$details.score'),
        totalScore: $.sum('$details.score'),
        count: $.sum(1)
      })
      .sort({
        averageScore: 1
      })
      .end();
    perf.issueMs = Date.now() - issueStart;

    const issueData = issuePipeline.list.map(item => ({
      item: item._id,
      averageScore: Math.round(item.averageScore * 10) / 10
    }));

    // ========== 4. 全局健康概览 ==========
    // 使用聚合计算平均分，避免全量拉取记录
    const currentAvgStart = Date.now();
    const currentAvgAgg = await db.collection('inspections')
      .aggregate()
      .match({
        date: _.gte(startDateStr)
      })
      .group({
        _id: null,
        averageScore: $.avg('$totalScore'),
        count: $.sum(1)
      })
      .end();
    perf.currentAvgMs = Date.now() - currentAvgStart;

    const currentAvgItem = (currentAvgAgg.list && currentAvgAgg.list[0]) ? currentAvgAgg.list[0] : null;
    const overallAverage = currentAvgItem && typeof currentAvgItem.averageScore === 'number'
      ? Math.round(currentAvgItem.averageScore * 10) / 10
      : 0;

    const prevAvgStart = Date.now();
    const prevAvgAgg = await db.collection('inspections')
      .aggregate()
      .match({
        date: _.and(_.gte(prevStartDateStr), _.lt(startDateStr))
      })
      .group({
        _id: null,
        averageScore: $.avg('$totalScore'),
        count: $.sum(1)
      })
      .end();
    perf.prevAvgMs = Date.now() - prevAvgStart;

    const prevAvgItem = (prevAvgAgg.list && prevAvgAgg.list[0]) ? prevAvgAgg.list[0] : null;
    const prevAverage = prevAvgItem && typeof prevAvgItem.averageScore === 'number'
      ? prevAvgItem.averageScore
      : 0;

    const weekOverWeekChange = prevAverage > 0
      ? Math.round((overallAverage - prevAverage) / prevAverage * 1000) / 10
      : 0;

    const healthOverview = {
      overallAverage,
      weekOverWeekChange
    };

    // ========== 5. 帕累托分析：扣分总额排序 ==========
    // 计算每项的理论满分和实际扣分
    const itemDeductions = {};
    const itemMaxTotals = {};
    
    // 聚合扣分明细以便前端绘制帕累托图
    issuePipeline.list.forEach(item => {
      const maxScore = SCORING_MAX_SCORES[item._id] || 10;
      const theoreticalMax = maxScore * item.count; 
      const actualScore = item.totalScore; 
      const deduction = theoreticalMax - actualScore; 
      
      itemDeductions[item._id] = Math.round(deduction * 10) / 10;
      itemMaxTotals[item._id] = theoreticalMax;
    });

    // 按扣分总额降序排列，用于帕累托图
    const fullParetoData = Object.entries(itemDeductions)
      .map(([item, deduction]) => ({
        item,
        deductionTotal: deduction
      }))
      .sort((a, b) => b.deductionTotal - a.deductionTotal);

    const totalDeduction = fullParetoData.reduce((sum, d) => sum + d.deductionTotal, 0);

    // ========== 6. 办公室分布数据（九宫格）==========
    // ~~已删除：办公室表现分布图功能已移除~~

    // ========== 8. 异常穿透：未达标办公室列表 ==========
    // 未达标办公室列表：数据库侧过滤 + 排序 + 限制数量，避免全量拉取
    const UNQUALIFIED_LIMIT = 50;
    const unqualifiedStart = Date.now();
    const unqualifiedAgg = await db.collection('inspections')
      .aggregate()
      .match({
        date: _.gte(startDateStr),
        totalScore: _.lt(PASS_THRESHOLD)
      })
      .sort({
        totalScore: 1
      })
      .limit(UNQUALIFIED_LIMIT)
      .project({
        department: 1,
        room: 1,
        totalScore: 1,
        date: 1
      })
      .end();
    perf.unqualifiedMs = Date.now() - unqualifiedStart;

    const unqualifiedOffices = (unqualifiedAgg.list || []).map(r => ({
      department: r.department,
      room: r.room,
      totalScore: r.totalScore,
      date: r.date
    }));

    const paretoData = fullParetoData.map(d => ({
      ...d,
      deductionPercent: totalDeduction > 0 ? Math.round(d.deductionTotal / totalDeduction * 1000) / 10 : 0
    }));

    // 写入缓存（失败不阻断返回）
    try {
      await db.collection('analytics_cache').doc(cacheKey).set({
        data: {
          trendData,
          deptData,
          issueData,
          healthOverview,
          paretoData,
          unqualifiedOffices,
          expiresAt: Date.now() + CACHE_TTL_MS,
          updatedAt: db.serverDate()
        }
      });
    } catch (e) {
      // ignore
    }

    perf.totalMs = Date.now() - totalStart;
    console.log('[getAnalytics][perf]', { requestId, cacheKey, ...perf });

    return {
      success: true,
      requestId,
      perf,
      // 原有数据（兼容）
      trendData,
      deptData,
      issueData,
      // 新增数据
      healthOverview,
      paretoData,
      // ~~roomDistribution 已删除~~
      unqualifiedOffices
    };
  } catch (err) {
    console.error('获取分析数据失败', err);
    return {
      success: false,
      code: 'ANALYTICS_FAILED',
      message: err && err.message ? err.message : '获取分析数据失败',
      requestId
    };
  }
};
