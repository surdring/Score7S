# 7S首页按日期筛选榜单 + 管理入口密码

本计划将首页红/黑榜支持按日期筛选展示，并在首页“管理”入口进入部门管理前增加密码校验（会话内记住）。

## 目标一：首页看板支持选择日期查看榜单

### 现状梳理
- 首页 `miniprogram/pages/home/home.ts` 调用云函数 `getLeaderboard`，云函数当前固定取 `inspections` 表中最新 `date` 作为榜单日期。

### 方案
- **首页新增日期选择器**（`picker mode="date"`）。
- 首页增加状态：
  - `selectedDate`: 当前选择的日期（默认最新一期）。
  - `availableDates`: 可选日期列表（用于限制/提示，具体实现见下）。
- 首页加载流程调整：
  - 页面进入先拉取“最新日期/可选日期列表”。
  - 用户切换日期时重新拉取榜单。

### 后端/云函数改造
- 改造 `getLeaderboard`：
  - 入参支持 `date`（可选）。
  - 若传入 `date`：按该日期查询榜单；否则维持原逻辑（取最新日期）。
  - 返回值继续包含 `redList` / `blackList` / `date`。
- 新增一个轻量云函数（或复用已有接口）用于获取可选日期：
  - 例如 `getInspectionDates`：从 `inspections` 聚合/去重获得最近 N 个日期（按降序），返回 `dates` 数组。
  - 首页用于展示“当前选择日期”和可用日期范围（避免选到无数据日期）。

### UI/交互细节
- 顶部“最新更新：yyyy-mm-dd”改为：
  - 显示“当前查看：yyyy-mm-dd”（默认最新）。
  - 保留“最新更新”信息可选（如同时展示最新一期日期）。
- 选择到无数据日期：
  - 红/黑榜显示空态，并 toast 提示“该日期暂无数据”。

## 目标二：首页“管理”入口增加密码校验（会话内记住）

### 需求确认
- 触发点：点击首页 `home.wxml` 顶部“⚙️ 管理”按钮。
- 存储方式：密码存放云数据库配置（你后续手动在数据库修改）。
- 记住策略：记住到本次小程序关闭前（不落本地缓存）。

### 方案
- 将首页 `navigator` 改为 `bindtap` 事件（或拦截点击）：
  - 若已在会话内通过校验：直接进入 `/pages/admin/departments/departments`。
  - 否则弹出密码输入框（`wx.showModal` + `editable` 或自定义弹窗输入框）。
- 新增云数据库配置：
  - 新集合：`config`。
  - 固定文档：如 `_id: 'admin'`，字段：`adminPasswordHash`（推荐存哈希）或 `adminPassword`（不推荐明文）。
  - 默认值：提供一个初始密码（由你确认后我写入/或由你手动写库）。
- 新增云函数：`verifyAdminPassword`
  - 入参：`password`。
  - 读取 `config/admin`，对比密码（如使用哈希则对比哈希）。
  - 返回：`success: true/false`。
- 会话态保存：
  - `app.globalData.adminAuthed = true`（小程序关闭后自然失效）。

### 安全与约束
- 不在前端写死密码。
- 不把正确密码下发到前端，只返回校验结果。

## 需要你确认的点（实现前最后确认）
- **榜单可选日期**：最近 50 期。
- **初始管理密码**：`7S123456`。

## 影响范围（预计改动文件）
- 小程序：
  - `miniprogram/pages/home/home.wxml`、`home.ts`、必要时 `home.wxss`
- 云函数：
  - `miniprogram/cloudfunctions/getLeaderboard/index.js`（支持按 date 查询）
  - 新增 `miniprogram/cloudfunctions/getInspectionDates/*`（如采用）
  - 新增 `miniprogram/cloudfunctions/verifyAdminPassword/*`
- 云数据库：
  - 新建 `config` 集合与 `admin` 文档（存管理密码配置）

## 验收标准
- 首页可通过日期选择查看对应日期的红/黑榜，切换日期后榜单与标题同步更新。
- 点击首页“管理”：
  - 未验证时必须输入密码，密码正确才可进入部门管理。
  - 会话内再次点击无需重复输入；关闭小程序后需重新输入。
