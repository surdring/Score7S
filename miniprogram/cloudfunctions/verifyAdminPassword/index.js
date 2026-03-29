// 云函数入口文件 - 验证管理密码（安全优化版）
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 生成 SHA256 哈希
 */
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * 初始化默认密码到 config 集合
 * 仅在配置不存在时调用一次
 */
async function initDefaultPassword() {
  const defaultPassword = '7S123456';
  const passwordHash = sha256(defaultPassword);
  
  try {
    await db.collection('config').doc('admin').set({
      data: {
        adminPasswordHash: passwordHash,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    console.log('默认密码已初始化');
    return passwordHash;
  } catch (err) {
    console.error('初始化密码失败', err);
    return null;
  }
}

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
    
    // 计算输入密码的哈希
    const inputHash = sha256(password);
    
    if (!configRes.data) {
      // 配置不存在，初始化默认密码
      const defaultHash = await initDefaultPassword();
      
      if (defaultHash) {
        // 使用刚初始化的默认密码对比
        return {
          success: inputHash === defaultHash,
          message: inputHash === defaultHash ? '' : '密码错误'
        };
      } else {
        return {
          success: false,
          message: '系统未初始化，请联系管理员'
        };
      }
    }
    
    // 获取存储的密码哈希
    const storedHash = configRes.data.adminPasswordHash;
    const storedPassword = configRes.data.adminPassword; // 兼容旧数据
    
    if (!storedHash && !storedPassword) {
      // 字段不存在，重新初始化
      const defaultHash = await initDefaultPassword();
      return {
        success: inputHash === defaultHash,
        message: inputHash === defaultHash ? '' : '密码错误'
      };
    }
    
    // 优先使用哈希对比，其次明文对比（向后兼容）
    let isValid = false;
    if (storedHash) {
      isValid = inputHash === storedHash;
    } else if (storedPassword) {
      isValid = password === storedPassword;
    }
    
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
