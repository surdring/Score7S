const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 批量删除集合中的所有数据
async function clearCollection(collectionName) {
  const collection = db.collection(collectionName);
  let deletedCount = 0;
  
  // 每次最多删除 100 条（云函数限制）
  const batchSize = 100;
  
  while (true) {
    const res = await collection.limit(batchSize).get();
    
    if (res.data.length === 0) {
      break;
    }
    
    // 使用事务批量删除
    const deletePromises = res.data.map(doc => {
      return collection.doc(doc._id).remove();
    });
    
    await Promise.all(deletePromises);
    deletedCount += res.data.length;
    
    // 如果本次获取的数据少于 batchSize，说明已经删除完毕
    if (res.data.length < batchSize) {
      break;
    }
  }
  
  return deletedCount;
}

exports.main = async (event, context) => {
  const { type = 'all' } = event;
  
  try {
    let result = {
      rooms: 0,
      departments: 0,
      inspections: 0
    };
    
    // 根据类型清理数据
    if (type === 'all' || type === 'rooms') {
      result.rooms = await clearCollection('rooms');
      console.log(`已删除 ${result.rooms} 个办公室`);
    }
    
    if (type === 'all' || type === 'departments') {
      result.departments = await clearCollection('departments');
      console.log(`已删除 ${result.departments} 个部门`);
    }
    
    if (type === 'all' || type === 'inspections') {
      result.inspections = await clearCollection('inspections');
      console.log(`已删除 ${result.inspections} 条评分记录`);
    }
    
    return {
      success: true,
      message: '数据清理完成',
      data: result
    };
    
  } catch (error) {
    console.error('清理数据失败:', error);
    return {
      success: false,
      message: `清理失败: ${error.message}`,
      error: error
    };
  }
};
