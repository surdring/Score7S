// 云函数入口文件 - 验证管理密码
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { password } = event;
    
    if (!password) {
      return { success: false, message: '请输入密码' };
    }
    
    // 从 config 集合获取管理密码配置
    const configRes = await db.collection('config')
      .doc('admin')
      .get()
      .catch(() => ({ data: null }));
    
    if (!configRes.data) {
      // 配置不存在，使用默认密码
      const defaultPassword = '7S123456';
      return {
        success: password === defaultPassword,
        message: password === defaultPassword ? '' : '密码错误'
      };
    }
    
    // 对比密码（支持明文或哈希）
    const storedPassword = configRes.data.adminPassword || configRes.data.adminPasswordHash;
    
    if (!storedPassword) {
      // 字段不存在，使用默认密码
      const defaultPassword = '7S123456';
      return {
        success: password === defaultPassword,
        message: password === defaultPassword ? '' : '密码错误'
      };
    }
    
    // 简单对比（如需哈希可在此扩展）
    const isValid = password === storedPassword;
    
    return {
      success: isValid,
      message: isValid ? '' : '密码错误'
    };
  } catch (err) {
    console.error('验证密码失败', err);
    return {
      success: false,
      message: '验证失败，请重试'
    };
  }
};
