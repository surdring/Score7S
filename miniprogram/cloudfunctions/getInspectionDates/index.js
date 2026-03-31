// 云函数入口文件 - 获取检查日期列表（最近50期）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const $ = db.command.aggregate;

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { limit = 50 } = event;
    
    // 聚合查询：按日期分组，取最近N个日期
    const res = await db.collection('inspections')
      .aggregate()
      .group({
        _id: '$date',
        date: $.first('$date'),
        count: $.sum(1)
      })
      .sort({
        date: -1
      })
      .limit(limit)
      .end();

    // 提取日期列表
    const dates = res.list
      .map(item => item.date)
      .filter(d => d);

    return {
      success: true,
      dates,
      total: dates.length
    };
  } catch (err) {
    console.error('获取日期列表失败', err);
    return {
      success: false,
      message: err.message || '获取日期列表失败',
      dates: []
    };
  }
};
