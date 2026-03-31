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

function pbkdf2Hex(password, saltHex, iterations, keylen) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.pbkdf2Sync(password, salt, iterations, keylen, 'sha256').toString('hex');
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

    if (!configRes.data) {
      return {
        success: false,
        code: 'ADMIN_NOT_INITIALIZED',
        message: '系统未初始化，请联系管理员'
      };
    }

    const adminConfig = configRes.data;
    const passwordScheme = adminConfig.adminPasswordScheme;

    // 新方案：PBKDF2（推荐）
    if (passwordScheme === 'PBKDF2') {
      const saltHex = adminConfig.adminPasswordSalt;
      const iterations = adminConfig.adminPasswordIterations;
      const keylen = adminConfig.adminPasswordKeylen;
      const stored = adminConfig.adminPasswordHash;

      if (!saltHex || !iterations || !keylen || !stored) {
        return {
          success: false,
          code: 'ADMIN_NOT_INITIALIZED',
          message: '系统未初始化，请联系管理员'
        };
      }

      const computed = pbkdf2Hex(password, saltHex, iterations, keylen);
      const isValid = computed === stored;
      return {
        success: isValid,
        message: isValid ? '' : '密码错误'
      };
    }

    // 兼容旧方案：SHA256 / 明文（仅校验，不再自动初始化默认密码）
    const storedHash = adminConfig.adminPasswordHash;
    const storedPassword = adminConfig.adminPassword;
    if (!storedHash && !storedPassword) {
      return {
        success: false,
        code: 'ADMIN_NOT_INITIALIZED',
        message: '系统未初始化，请联系管理员'
      };
    }

    const inputHash = sha256(password);
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
