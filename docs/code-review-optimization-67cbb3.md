# miniprogram 云函数及前端代码检查与性能优化计划

对 Score7S 小程序的 9 个云函数和 6 个前端页面进行全面代码检查和性能优化，解决代码重复、性能瓶颈、安全隐患等问题。

---

## 一、云函数优化

### 1. submitInspection - 提交评分
**问题：**
- `createdAt: new Date()` 使用客户端时间而非服务器时间
- 缺少输入参数校验（date、department、room 可能为空）
- 覆盖逻辑先查询再删除再插入，可优化为单一事务操作

**优化方案：**
- 使用 `db.serverDate()` 替代 `new Date()`
- 添加参数校验，返回结构化错误信息
- 考虑使用 `update` with `upsert` 简化逻辑

### 2. getLeaderboard - 获取排行榜
**问题：**
- 错误时直接 `throw err`，与其他云函数返回格式不一致
- 排名计算函数可提取为公共模块

**优化方案：**
- 统一错误返回格式 `{ success: false, message, redList: [], blackList: [] }`
- 提取排名计算为独立函数模块

### 3. getAnalytics - 获取分析数据
**问题：**
- `limit(1000)` 硬编码，数据量大时可能不够
- 全量数据加载到内存计算，数据增长后性能下降
- 错误处理不统一

**优化方案：**
- 使用聚合查询在数据库层面计算平均值
- 添加分页或时间范围参数
- 统一错误返回格式

### 4. exportReport - 导出报告（1175行）
**问题：**
- 文件过长，职责过多（评分表+红黑榜+公示榜三种格式）
- `generateExcelBuffer` 和 `generateBulletinBuffer` 存在大量重复代码
- 红黑榜计算逻辑与 `getLeaderboard` 重复
- `generateBulletinBuffer` 中 `blackCandidates` 变量未使用（第855行）

**优化方案：**
- 拆分为独立模块：`excel-generator.js`、`ranking-calculator.js`
- 提取公共 Excel 样式配置
- 复用 `getLeaderboard` 的排名逻辑
- 清理未使用变量

### 5. clearAllData - 清空数据
**问题：**
- 缺少管理员权限校验
- 批量删除循环效率可优化

**优化方案：**
- 添加管理员权限校验（调用前验证）
- 使用 `db.command` 批量删除 API（如支持）

### 6. manageDepartments - 部门管理
**问题：**
- `batchUpsertDepartments` 中每个部门单独查询是否存在，N+1 问题
- CSV 解析器可提取为公共模块

**优化方案：**
- 批量查询已存在部门，减少数据库调用
- 提取 CSV 解析器到 `utils/csv-parser.js`

### 7. manageRooms - 办公室管理
**问题：**
- `batchImport` 中 `catch(() => {})` 静默吞掉错误
- `listAll` 先获取全部再处理，数据量大时内存问题

**优化方案：**
- 记录错误日志，返回失败详情
- 添加分页参数

### 8. verifyAdminPassword - 密码验证
**问题：**
- 密码明文存储/对比
- 默认密码硬编码在代码中
- 缺少密码强度校验

**优化方案：**
- 使用 bcrypt 或 SHA256 哈希对比
- 默认密码移至环境配置
- 添加密码复杂度提示（前端）

---

## 二、前端代码优化

### 1. 常量重复定义问题（高优先级）
**问题：**
- `SCORING_ITEMS`、`SCORING_MAX_SCORES`、`SCORING_LOW_THRESHOLDS` 在 `score.ts`、`home.ts`、`history.ts`、`analytics.ts`、`exportReport/index.js` 中重复定义

**优化方案：**
- 创建 `miniprogram/config/scoring.ts` 统一管理评分配置
- 所有文件从配置文件导入

### 2. score.ts - 评分页面
**问题：**
- `loadDepartments` 调用两次云函数（manageDepartments + manageRooms），可合并
- 图片上传使用 `sizeType: ['compressed']` 但未做实际压缩处理
- `setData` 频繁调用，可合并更新

**优化方案：**
- 创建新云函数 `getScoringData` 合并获取部门+办公室
- 添加图片压缩逻辑（wx.compressImage）
- 合并相关 `setData` 调用

### 3. home.ts - 首页
**问题：**
- `loadAvailableDates` 和 `loadRankings` 串行调用，可并行
- `HOME_SCORING_MAX_SCORES` 重复定义

**优化方案：**
- 使用 `Promise.all` 并行加载
- 引入统一配置文件

### 4. analytics.ts - 分析页
**问题：**
- `onLoad` 和 `onShow` 都调用 `loadAnalytics`，页面首次加载时重复请求
- `getTopDept`、`getWorstItem` 方法定义但未使用

**优化方案：**
- `onLoad` 加载数据，`onShow` 仅在数据为空时加载
- 移除未使用方法或改为计算属性

### 5. history.ts - 历史页
**问题：**
- `loadHistory` 使用 `limit(100)`，数据量大时不够
- `exportData` 中 `this.data.selectedMonth` 未定义（第182行）
- `onLoad` 和 `onShow` 都调用 `loadHistory`

**优化方案：**
- 添加分页加载或增大 limit
- 修复 `selectedMonth` 变量引用错误
- 优化加载时机

### 6. departments.ts - 部门管理
**问题：**
- `DEPARTMENTS_DATA` 硬编码在代码中，应移至配置文件
- 初始化流程可简化

**优化方案：**
- 移动初始数据到 `miniprogram/data/departments.json`
- 优化导入流程

### 7. app.ts - 应用入口
**问题：**
- 云开发环境 ID 硬编码：`env: 'cloudbase-2g1teb5c0c67c6d5'`

**优化方案：**
- 从 `project.config.json` 或环境变量读取

### 8. utils/util.ts - 工具函数
**问题：**
- `getScoreColor` 阈值（8/6）与 100 分制不匹配
- `debounce`/`throttle` 返回类型为 `Function`，类型不精确

**优化方案：**
- 修改阈值为百分比或动态计算
- 改进类型定义

---

## 三、公共问题与优化

### 1. 类型安全
**问题：** 大量 `as any` 类型断言，降低类型安全性

**优化方案：**
- 定义云函数返回类型接口
- 使用泛型约束云函数调用

### 2. 错误处理统一
**问题：** 云函数返回格式不统一

**优化方案：**
- 统一返回格式：`{ success: boolean, message?: string, data?: any, requestId?: string }`
- 创建错误处理中间件

### 3. 性能优化
| 问题 | 优化方案 |
|------|----------|
| 频繁 setData | 合并数据更新，使用 `Object.assign` |
| 重复云函数调用 | 合并接口，减少网络请求 |
| 图片未压缩 | 添加 `wx.compressImage` 处理 |
| 常量重复定义 | 提取公共配置文件 |

---

## 四、实施步骤

1. **创建公共配置模块** - `config/scoring.ts`
2. **优化云函数错误处理** - 统一返回格式
3. **重构 exportReport** - 拆分模块，消除重复
4. **优化前端数据加载** - 合并请求，减少重复
5. **修复已知 Bug** - `selectedMonth`、`getScoreColor` 等
6. **类型定义完善** - 减少 `as any`
7. **安全加固** - 密码哈希、配置外部化

---

## 五、预期收益

- **代码质量**：消除重复代码约 200+ 行
- **性能提升**：减少 30% 云函数调用次数
- **可维护性**：配置统一管理，修改一处生效全局
- **安全性**：密码哈希存储，敏感配置外部化
