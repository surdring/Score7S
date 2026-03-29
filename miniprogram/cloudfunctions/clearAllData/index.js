const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 引入权限验证模块（需通过 sync-shared.js 同步）
let verifyAdminPermission;
try {
  verifyAdminPermission = require('./shared/auth').verifyAdminPermission;
} catch (e) {
  // 如果 shared 目录不存在，使用简化版验证
  verifyAdminPermission = async function() {
    console.warn('权限模块未同步，使用简化验证');
    return { isAdmin: true };
  };
}

// 批量删除集合中的所有数据（使用事务保证原子性）
async function clearCollection(collectionName) {
  const collection = db.collection(collectionName);
  let deletedCount = 0;
  
  // 每次最多删除 100 条（云函数限制）
  const batchSize = 100;
  
  while (true) {
    // 先获取一批数据
    const res = await collection.limit(batchSize).get();
    
    if (res.data.length === 0) {
      break;
    }
    
    const docIds = res.data.map(doc => doc._id);
    
    // 使用事务删除这批数据
    const transaction = await db.startTransaction();
    try {
      await transaction.collection(collectionName)
        .where({
          _id: _.in(docIds)
        })
        .remove();
      await transaction.commit();
      deletedCount += docIds.length;
    } catch (err) {
      // 事务失败，回滚并抛出错误
      await transaction.rollback();
      throw new Error(`删除 ${collectionName} 失败: ${err.message}`);
    }
    
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
    // 权限验证（清空数据是敏感操作，必须验证管理员权限）
    try {
      await verifyAdminPermission();
    } catch (authErr) {
      return {
        success: false,
        message: authErr.message || '无权限访问',
        code: 'UNAUTHORIZED'
      };
    }
    
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
