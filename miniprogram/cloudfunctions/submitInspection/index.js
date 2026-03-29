// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const { date, checkerId, checkerName, department, room, totalScore, details } = event;

  // 参数校验
  if (!date || !department || !room) {
    return {
      success: false,
      message: '缺少必要参数：日期、部门或办公室'
    };
  }

  if (typeof totalScore !== 'number' || totalScore < 0) {
    return {
      success: false,
      message: '总分格式不正确'
    };
  }

  if (!Array.isArray(details) || details.length === 0) {
    return {
      success: false,
      message: '评分明细格式不正确'
    };
  }

  try {
    // 先查询同一天同一办公室是否已有评分
    const existingRes = await db.collection('inspections')
      .where({
        date,
        department,
        room
      })
      .get();

    const existingRecords = existingRes.data;

    // 准备新数据（使用服务器时间）
    const inspectionData = {
      date,
      checkerId: checkerId || '匿名检查员',
      checkerName: checkerName || '匿名检查员',
      department,
      room,
      totalScore,
      details,
      createdAt: db.serverDate(),
    };

    // 如果已有评分记录，删除旧记录
    if (existingRecords.length > 0) {
      console.log(`发现 ${existingRecords.length} 条重复记录，准备覆盖`);
      
      // 使用批量删除 API（避免 Promise.all 并发过多）
      const ids = existingRecords.map(r => r._id);
      await db.collection('inspections')
        .where({
          _id: db.command.in(ids)
        })
        .remove();
    }

    // 插入新记录
    const addRes = await db.collection('inspections').add({
      data: inspectionData
    });

    return {
      success: true,
      _id: addRes._id,
      isOverwrite: existingRecords.length > 0,
      message: existingRecords.length > 0 ? '评分已更新' : '评分提交成功'
    };

  } catch (err) {
    console.error('提交评分失败', err);
    return {
      success: false,
      message: err.message || '提交失败'
    };
  }
};
