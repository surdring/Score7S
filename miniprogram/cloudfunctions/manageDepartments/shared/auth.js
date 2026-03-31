/**
 * 权限验证工具模块
 * 用于验证云函数调用者是否有管理员权限
 */

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 验证管理员权限
 * 通过检查 config 集合中的 adminOpenIds 列表判断
 * 
 * @returns {Promise<{openId: string, isAdmin: boolean}>}
 * @throws {Error} 如果用户无权限则抛出异常
 */
async function verifyAdminPermission() {
  const { OPENID } = cloud.getWXContext();
  
  if (!OPENID) {
    throw new Error('获取用户信息失败');
  }
  
  try {
    // 从 config 集合获取管理员 OpenID 列表
    const configRes = await db.collection('config')
      .doc('admin')
      .get()
      .catch(() => ({ data: null }));
    
    // 安全要求：配置缺失不得放行（避免 shared 未同步/配置缺失导致越权）
    if (!configRes.data || !configRes.data.adminOpenIds) {
      throw new Error('未配置管理员列表');
    }
    
    const adminOpenIds = configRes.data.adminOpenIds;
    
    // 检查当前用户是否在管理员列表中
    const isAdmin = Array.isArray(adminOpenIds) && adminOpenIds.includes(OPENID);
    
    if (!isAdmin) {
      throw new Error('无权限访问');
    }
    
    return {
      openId: OPENID,
      isAdmin: true,
      mode: 'strict'
    };
  } catch (err) {
    // 如果是权限错误，直接抛出
    if (err.message === '无权限访问' || err.message === '未配置管理员列表') {
      throw err;
    }
    // 其他错误记录日志后抛出
    console.error('权限验证失败', err);
    throw new Error('权限验证失败');
  }
}

/**
 * 可选的权限验证（不抛出异常，返回布尔值）
 * @returns {Promise<boolean>}
 */
async function hasAdminPermission() {
  try {
    const result = await verifyAdminPermission();
    return result.isAdmin;
  } catch (err) {
    return false;
  }
}

/**
 * 初始化管理员 OpenID 到 config 集合
 * @param {string} openId - 管理员的 OpenID
 */
async function initAdminOpenId(openId) {
  try {
    await db.collection('config').doc('admin').set({
      data: {
        adminOpenIds: [openId],
        updatedAt: db.serverDate()
      }
    });
    console.log('管理员 OpenID 已初始化');
    return true;
  } catch (err) {
    console.error('初始化管理员失败', err);
    return false;
  }
}

module.exports = {
  verifyAdminPermission,
  hasAdminPermission,
  initAdminOpenId
};
