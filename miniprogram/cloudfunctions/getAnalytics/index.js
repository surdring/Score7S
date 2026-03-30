// 云函数入口文件 - getAnalytics 7S管理分析仪表盘
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

// 评分项满分配置（与前端 config/scoring.ts 保持一致）
const SCORING_MAX_SCORES = {
  '地面': 20,
  '桌面摆放': 20,
  '文件资料': 10,
  '电器设备': 20,
  '办公椅': 10,
  '窗台': 10,
  '整体印象': 10,
};
const TOTAL_MAX_SCORE = 100;
const PASS_THRESHOLD = 60; // 达标阈值（得分率60%）

// 云函数入口函数
exports.main = async (event, context) => {
  try {
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

    // ========== 1. 趋势数据：按日期分组 ==========
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

    const trendData = trendPipeline.list
      .map(item => ({
        date: item._id,
        averageScore: Math.round(item.averageScore * 10) / 10
      }))
      .slice(-10); // 最近10天

    // ========== 2. 部门数据：按部门分组（含检查频次）==========
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

    const deptData = deptPipeline.list.map(item => ({
      department: item._id,
      averageScore: Math.round(item.averageScore * 10) / 10,
      inspectionCount: item.inspectionCount
    }));

    // ========== 2.1 办公室数据：按办公室分组（部门+房间）==========
    // ~~已删除：办公室表现分布图功能已移除~~

    // ========== 3. 问题项数据：按评分项分组 ==========
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

    const issueData = issuePipeline.list.map(item => ({
      item: item._id,
      averageScore: Math.round(item.averageScore * 10) / 10
    }));

    // ========== 4. 全局健康概览 ==========
    // 获取本周期所有记录
    const currentPeriodRes = await db.collection('inspections')
      .where({
        date: _.gte(startDateStr)
      })
      .get();

    const currentRecords = currentPeriodRes.data;
    
    // 计算本周期综合平均分
    const overallAverage = currentRecords.length > 0
      ? Math.round(currentRecords.reduce((sum, r) => sum + r.totalScore, 0) / currentRecords.length * 10) / 10
      : 0;

    // 计算环比涨跌幅
    const prevPeriodRes = await db.collection('inspections')
      .where({
        date: _.and(_.gte(prevStartDateStr), _.lt(startDateStr))
      })
      .get();

    const prevRecords = prevPeriodRes.data;
    const prevAverage = prevRecords.length > 0
      ? prevRecords.reduce((sum, r) => sum + r.totalScore, 0) / prevRecords.length
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
    const unqualifiedOffices = currentRecords
      .filter(r => r.totalScore < PASS_THRESHOLD)
      .map(r => ({
        department: r.department,
        room: r.room,
        totalScore: r.totalScore,
        date: r.date
      }))
      .sort((a, b) => a.totalScore - b.totalScore);

    return {
      // 原有数据（兼容）
      trendData,
      deptData,
      issueData,
      // 新增数据
      healthOverview,
      paretoData: fullParetoData.map(d => ({
        ...d,
        deductionPercent: totalDeduction > 0 ? Math.round(d.deductionTotal / totalDeduction * 1000) / 10 : 0
      })),
      // ~~roomDistribution 已删除~~
      unqualifiedOffices
    };
  } catch (err) {
    console.error('获取分析数据失败', err);
    throw err;
  }
};
