// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const { date, checkerId, checkerName, department, room, totalScore, details } = event;

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

    // 准备新数据
    const inspectionData = {
      date,
      checkerId: checkerId || '匿名检查员',
      checkerName: checkerName || '匿名检查员',
      department,
      room,
      totalScore,
      details,
      createdAt: new Date(),
    };

    // 如果已有评分记录，删除旧记录
    if (existingRecords.length > 0) {
      console.log(`发现 ${existingRecords.length} 条重复记录，准备覆盖`);
      
      // 删除所有旧记录（理论上应该只有一条，但为了保险删除所有）
      const deletePromises = existingRecords.map(record => {
        return db.collection('inspections').doc(record._id).remove();
      });
      await Promise.all(deletePromises);
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
