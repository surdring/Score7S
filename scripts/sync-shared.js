/**
 * 云函数公共模块同步脚本
 * 将 cloudfunctions/shared/ 目录下的公共模块复制到各云函数目录
 * 
 * 使用方法：node scripts/sync-shared.js
 */

const fs = require('fs');
const path = require('path');

// 配置
const CLOUDFUNCTIONS_DIR = path.join(__dirname, '..', 'miniprogram', 'cloudfunctions');
const SHARED_DIR = path.join(CLOUDFUNCTIONS_DIR, 'shared');

// 需要使用公共模块的云函数列表
const TARGET_FUNCTIONS = [
  'getLeaderboard',
  'exportReport',
  'getAnalytics',
  'manageDepartments',
  'manageRooms',
  'clearAllData',
];

/**
 * 复制目录
 */
function copyDir(src, dest) {
  // 确保目标目录存在
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // 读取源目录
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  复制文件: ${entry.name}`);
    }
  }
}

/**
 * 同步公共模块到指定云函数
 */
function syncToFunction(functionName) {
  const functionDir = path.join(CLOUDFUNCTIONS_DIR, functionName);
  const targetSharedDir = path.join(functionDir, 'shared');

  // 检查云函数目录是否存在
  if (!fs.existsSync(functionDir)) {
    console.log(`⚠️  云函数目录不存在: ${functionName}`);
    return false;
  }

  // 检查公共模块目录是否存在
  if (!fs.existsSync(SHARED_DIR)) {
    console.log(`⚠️  公共模块目录不存在: ${SHARED_DIR}`);
    return false;
  }

  console.log(`\n📦 同步到 ${functionName}:`);
  copyDir(SHARED_DIR, targetSharedDir);
  console.log(`  ✅ 完成`);
  return true;
}

/**
 * 主函数
 */
function main() {
  console.log('========================================');
  console.log('  云函数公共模块同步工具');
  console.log('========================================');

  // 检查公共模块目录
  if (!fs.existsSync(SHARED_DIR)) {
    console.log(`\n❌ 公共模块目录不存在: ${SHARED_DIR}`);
    console.log('   请先创建 cloudfunctions/shared/ 目录并添加公共模块');
    process.exit(1);
  }

  // 统计
  let successCount = 0;
  let failCount = 0;

  // 同步到各云函数
  for (const funcName of TARGET_FUNCTIONS) {
    if (syncToFunction(funcName)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // 输出结果
  console.log('\n========================================');
  console.log(`  同步完成: 成功 ${successCount} 个，失败 ${failCount} 个`);
  console.log('========================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

// 执行
main();
