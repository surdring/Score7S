# 代码审查报告 - T1: Score7S 全仓库全面审查

## 审查概要
- 审查时间：2026-03-31 10:xx (UTC+08)
- 任务编号：[T1]
- 审查范围：
  - `miniprogram/`（小程序端页面/工具/配置）
  - `miniprogram/cloudfunctions/`（云函数与 shared 同步机制）
  - `scripts/`（shared 同步脚本）
  - `7s联查评分系统/`（React + Firebase Web 端）
- 审查结论：**拒绝并重构（存在多处 🔴 阻断性问题，含安全与配置红线问题）**

## 验收/运行日志核验（强制）
- **结论：验证缺失**
- 说明：当前仓库未提供 CI 记录或“验收日志（Acceptance Logs）”，因此：
  - **无法确认** TypeScript 类型检查、Lint、构建、云函数真实调用是否通过。
  - 按审查规则：验收日志缺失 => **直接判定为未通过自动化验证**。

## 问题清单

### 🔴 阻断性问题（Blocker）
1. **云开发环境 ID 硬编码（违反配置外部化）**
   - **位置**：`miniprogram/app.ts`：`wx.cloud.init({ env: 'cloudbase-2g1teb5c0c67c6d5' })`
   - **原因**：违反项目规则“配置外部化”；切换环境/多人协作会直接出错；可能误连生产环境。
   - **建议修复方案**：
     - 将 envId 外部化（例如写入 `miniprogram/project.private.config.json` 或独立配置文件并在发布时注入）。
     - 若必须依赖默认环境，请显式说明并删除硬编码（但仍建议可配置）。

2. **管理员权限验证存在“失效即放行”的危险降级（越权风险）**
   - **位置**：
     - `miniprogram/cloudfunctions/clearAllData/index.js`：`require('./shared/auth')` 失败时直接 `return { isAdmin: true }`
     - `miniprogram/cloudfunctions/manageRooms/index.js`：同上
     - `miniprogram/cloudfunctions/manageDepartments/index.js`：同上
     - `miniprogram/cloudfunctions/shared/auth.js`：当 `config/admin.adminOpenIds` 缺失时进入 compat 模式，**默认允许所有用户**
   - **原因**：
     - `clearAllData` 属于敏感操作（清库），降级放行会导致任意用户可清库。
     - “shared 未同步即放行”属于严重安全设计缺陷。
   - **建议修复方案**：
     - shared 模块缺失时：**必须拒绝请求**，返回结构化错误（`code: 'SHARED_MODULE_MISSING'`）。
     - `auth.js` 中 compat 模式必须移除或至少在生产环境强制严格校验（缺少管理员列表 => 拒绝访问）。
     - 所有敏感云函数（clear/import/update/delete/clear）必须强制走严格鉴权。

3. **管理密码存在硬编码默认值（敏感信息/弱口令风险）**
   - **位置**：`miniprogram/cloudfunctions/verifyAdminPassword/index.js`
     - `const defaultPassword = '7S123456';`
   - **原因**：
     - 默认口令属于高风险；即便使用 SHA256 哈希，也会在首次初始化时把弱口令落库。
     - 违反“配置外部化”，也不满足管理员安全要求。
   - **建议修复方案**：
     - 默认密码必须从环境变量/配置读取；若未配置则直接返回错误提示“系统未初始化”。
     - 密码存储建议使用带盐哈希（如 bcrypt），至少不要固定明文默认值。

4. **云函数错误处理不一致且存在直接 `throw err`（契约破坏/前端不可控异常）**
   - **位置**：`miniprogram/cloudfunctions/getAnalytics/index.js`：catch 中 `throw err`
   - **原因**：
     - 其他云函数多为 `{ success: false, message }` 返回，getAnalytics 直接抛错会导致前端 `callFunction` 进入异常分支且缺少统一错误码/结构。
   - **建议修复方案**：
     - 统一云函数响应契约：`{ success: boolean, code?: string, message?: string, data?: ... , requestId?: string }`。
     - 顶层捕获必须返回结构化错误，不允许抛出未包装异常。

5. **大量 `any` / `as any`，违反“禁止 any”的项目红线**
   - **位置（示例）**：
     - `miniprogram/pages/home/home.ts`：`callFunction(...) as any`
     - `miniprogram/pages/score/score.ts`：多处 `as any` / `submittedData: null as any`
     - `miniprogram/pages/history/history.ts`：`inspections: [] as any[]` 等
     - `miniprogram/utils/util.ts`：`debounce(fn: Function): Function` + `this: any, ...args: any[]`
     - Web 端：`7s联查评分系统/src/pages/*` 多处 `any`（例如 `const initial: any = {}`、`details: any[]`）
   - **原因**：
     - 直接绕过类型系统，易引入线上运行时错误。
   - **建议修复方案**：
     - 为云函数结果定义明确的 TS 类型（例如 `CallFunctionResult<T>`）。
     - 页面 data、云函数 event/result、工具函数返回值全部补齐类型。
     - `debounce/throttle` 使用泛型保持签名。

### 🟠 严重问题（Critical）
1. **吞错导致数据导入/更新悄悄失败（可观测性缺失）**
   - **位置**：`miniprogram/cloudfunctions/manageRooms/index.js`
     - `...update(...).then(() => { updated++; }).catch(() => {})`
     - `...add(...).then(() => { inserted++; }).catch(() => {})`
   - **原因**：导入过程中失败被静默吞掉，最终返回的 `inserted/updated` 也可能不可信，排障困难。
   - **建议修复方案**：
     - 收集失败明细并返回（至少返回失败数量与样例）。
     - 记录结构化日志（包含 roomKey/departmentId）。

2. **N+1 查询与低效批处理（云数据库性能/配额风险）**
   - **位置**：`miniprogram/cloudfunctions/manageDepartments/index.js`：`batchUpsertDepartments` 循环内 `await db.collection('departments').where({ name }).limit(1).get()`
   - **原因**：每个部门一次查询，规模扩大后性能差、耗费调用配额。
   - **建议修复方案**：
     - 预先一次性拉取部门列表建立 Map，再在内存判断 insert/update。

3. **评分项配置“前后端不一致”风险（契约一致性）**
   - **位置**：
     - 前端权威：`miniprogram/config/scoring.ts`（含 `SCORING_ITEMS/SCORING_MAX_SCORES/LOW_THRESHOLDS`）
     - 云函数：`miniprogram/cloudfunctions/getAnalytics/index.js` 内部又硬编码 `SCORING_MAX_SCORES`，且 item 名称必须严格一致
     - Web 端：`7s联查评分系统/src/pages/Score.tsx` 的 `SCORING_ITEMS` 与小程序配置不一致（如“电脑设备” vs 小程序“电器设备”）
   - **原因**：item 名称不一致会导致统计、导出、排行榜计算出现缺项或错误。
   - **建议修复方案**：
     - 云函数严格使用 `shared/constants` 同源配置，禁止自定义硬编码。
     - Web 端如果继续保留，应明确其与小程序是否同一业务/同一数据源；若是同一业务，必须共用同一套 scoring 常量。

4. **调试日志/console.log 大量存在（发布质量/隐私风险）**
   - **位置（示例）**：
     - `miniprogram/pages/score/score.ts`：`console.log('当天已评分办公室数量', ...)`
     - `miniprogram/pages/history/history.ts`：多处 `console.log` 输出数据对象
     - `miniprogram/pages/analytics/analytics.ts`：大量 `console.log`（ECharts 初始化/渲染）
   - **原因**：
     - 容易泄露数据、污染日志；且违反“清理僵尸/调试代码”的审查要求。
   - **建议修复方案**：
     - 发布版禁用或降级日志；保留必要 INFO/WARN/ERROR 且不打印敏感字段。

### 🟡 一般问题（Major）
1. **`utils/db.ts` 与项目规则不一致（any/错误处理过于宽松）**
   - **位置**：`miniprogram/utils/db.ts`
   - **问题点**：
     - `where?: any`、`update(data: any)` 直接放宽类型
     - `getById/update/remove` catch 后返回 `null/false`，但不返回错误原因，影响排障

2. **前端提交成功后本地 `createdAt: new Date()` 与服务端时间不一致**
   - **位置**：`miniprogram/pages/score/score.ts`：`submittedData.createdAt: new Date()`
   - **原因**：服务端实际写入 `db.serverDate()`，本地展示时间可能与真实记录不一致。

3. **Web 端存在“自动 seed 部门数据”行为（数据污染风险）**
   - **位置**：`7s联查评分系统/src/pages/Score.tsx`
   - **问题点**：当 `departments` 为空时自动 `addDoc` 写入默认部门，容易污染正式库。

### 🟢 优化建议（Minor）
1. **历史页/首页缓存与刷新策略建议补充一致性策略**
   - **位置**：`miniprogram/pages/home/home.ts`、`miniprogram/pages/analytics/analytics.ts`
   - **建议**：缓存 key/version 设计已存在，但应明确缓存失效条件（日期切换、数据提交后主动清缓存等）。

2. **云函数返回结构建议统一包含 requestId**
   - **建议**：使用 `cloud.getWXContext()` 获取 `requestId`（如可用）或自生成，便于排障。

## 维度检查详情（仅列出重点）
- **[A. 强类型]**：大量 `any/as any/Function`，与“禁止 any”冲突，属于阻断。
- **[A. 错误处理]**：`getAnalytics` 直接 throw；部分云函数吞错；错误返回结构不统一。
- **[A. 安全性]**：鉴权降级放行、默认弱口令硬编码，均为严重安全问题。
- **[B. 契约一致性]**：评分项配置在多处硬编码且名称不一致，统计/导出可能错误。
- **[H. 验收日志]**：未提供类型检查/构建/云函数真实调用日志 => 验证缺失。

## 最终验收结论
- [ ] 允许合并/标记任务完成
- [x] **被阻断**：必须修复 🔴 阻断性问题，并补齐完整验收日志后方可验收。

---
*注：本次审查基于仓库静态代码阅读得出。审查者未在真实环境中执行构建/测试命令，且未看到 CI/验收日志。*
