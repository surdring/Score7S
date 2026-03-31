# 代码性能与冗余审查报告 - T2: Score7S 静态性能审查（小程序 + 云函数）

## 审查概要
- 审查时间：2026-03-31 11:11
- 任务编号：[T2]
- 审查重点：核心云函数（排行榜/分析/导出/部门办公室管理）的数据库 I/O、全量读取风险、并发模型；小程序端历史页分页与筛选策略
- 审查结论：**需修复严重瓶颈后通过**

## 性能与冗余问题清单

### 🔴 阻断性性能灾难（2 处）
1. **分析云函数存在“跨周期全量拉取”与重复全量读取，极易触发超时/内存爆炸**
   - **位置**：`miniprogram/cloudfunctions/getAnalytics/index.js`，`exports.main`
   - **成因与推演**：
     - 先做 3 次聚合（trend/dept/issue），随后又执行两次 `.where(...).get()`：
       - `currentPeriodRes = inspections.where(date >= startDateStr).get()`
       - `prevPeriodRes = inspections.where(date in [prevStartDateStr, startDateStr)).get()`
     - 这两次 `.get()` **没有分页/上限/字段投影**，在数据量增长后会变成：
       - **时间复杂度**：O(N) 扫描 + 传输（N 为周期内记录数）
       - **空间复杂度**：O(N) 结果集一次性驻留内存（Node 云函数内存有限）
     - 同时该逻辑与前面聚合结果存在明显“重复计算/重复取数”（聚合已能提供均值、计数等指标）。
   - **证明**：纯静态推演即可成立：周期 30 天若每个办公室每日多次检查，`N` 可线性增长，`.get()` 会将所有记录拉回云函数内存。
   - **强制修复方案**：
     - **禁止全量 `.get()`**：用聚合替代均值/计数/达标率等指标计算，必要时仅投影字段：`.field({ totalScore:true, department:true, room:true, date:true })`。
     - **未达标办公室列表**：增加上限（例如 Top K 最低分），通过聚合 `sort + limit` 实现，避免全量 filter/sort：
       - match 本周期
       - sort totalScore asc
       - limit K
       - project 必要字段
     - **环比**：使用两段聚合分别输出 `avg(totalScore)`，避免拉取 `prevRecords` 全量。

2. **榜单云函数按日期拉取 inspections 全量记录且未限制上限，存在单次查询结果超限/内存风险**
   - **位置**：`miniprogram/cloudfunctions/getLeaderboard/index.js`，`exports.main`
   - **成因与推演**：
     - 逻辑为：`inspections.where({date}).orderBy(totalScore).get()`，未 `.limit()`，也未做分页聚合。
     - 微信云数据库单次 `get()` 结果存在数量/体积限制（超限会报错或导致函数超时），当同日期记录增长（重复提交、多人多次检查）时风险陡增。
     - 后续 `groupByDepartmentAndRoom(allRecords)` 需要在内存里遍历全量记录。
   - **证明**：静态推演：单日期数据规模未知且可增长，“无上限全量取”是硬风险。
   - **强制修复方案**：
     - 用聚合在数据库侧“按 department+room 分组取最高分”后再计算榜单（把 O(N) 传输降到 O(G)；G 为办公室数量上限）。
     - 若必须在应用侧处理：至少加分页循环 + 字段投影，并设置绝对上限（例如 2000 条）+ 明确错误码提示。

### 🟠 严重性能瓶颈（4 处）
1. **导出云函数在生成 Excel 时仍可能触发多次全量读取（部门/办公室集合），且在内存中构建超大 Workbook Buffer**
   - **位置**：
     - `miniprogram/cloudfunctions/exportReport/index.js`：`exports.main` 批量拉取 inspections（最多 2000）
     - `generateExcelBuffer()` 内部：`db.collection('departments').get()` + `db.collection('rooms').get()`（均无上限/投影）
   - **成因与推演**：
     - `exports.main` 虽然对 inspections 采用了分页 + 上限 2000，是正确方向；但 `generateExcelBuffer()` 内部又去拉取 `departments/rooms` 全量。
     - ExcelJS `workbook.xlsx.writeBuffer()` 会将整个文件一次性放进内存（空间复杂度 O(size_of_xlsx)）。
     - 如果后续扩展为“导出整月”且 2000 上限仍较大，Buffer 可能接近/超过云函数可用内存，或触发 GC 频繁回收导致超时。
   - **强制修复方案**：
     - `generateExcelBuffer()` 的部门/办公室读取必须：
       - `.field({ name:true, order:true, departmentId:true })` 投影
       - 添加数量上限或分页（即使理论上只有几十条，也要遵守规范，避免未来数据膨胀成为隐患）。
     - 对“整月导出”建议：
       - 保持严格上限并在返回值中提示“已达导出上限”，或者
       - 拆分为按日期/按部门分文件导出（避免单文件过大）。

2. **办公室管理云函数 listAll 存在“全量 rooms + 全量 departments”并在内存 Join，缺乏分页/字段投影**
   - **位置**：`miniprogram/cloudfunctions/manageRooms/index.js`，`action === 'listAll'`
   - **成因与推演**：
     - `roomsRes = rooms.orderBy(order).get()`、`deptsRes = departments.get()`，均无 `.field()`。
     - 在 rooms 数量增长（未来不止 35 个办公室）时，该接口会变成一次性传输大结果集。
   - **强制修复方案**：
     - 立即加 `.field()` 投影。
     - 如确实存在增长可能：分页返回或按 departmentId 分段拉取。

3. **部门管理云函数存在“删除/清空”路径的无并发上限 Promise.all，规模增大时会耗尽资源/触发限流**
   - **位置**：`miniprogram/cloudfunctions/manageDepartments/index.js`
     - `action === 'delete'`：对 rooms 的逐条 remove 使用 `Promise.all`
     - `action === 'clear'`：对 departments 的逐条 remove 使用 `Promise.all`
   - **成因与推演**：
     - 这类操作本质是批量写入/删除，`Promise.all` 会在同一时间创建大量并发请求。
     - 在数据规模增长或云端限流下，会出现：
       - 失败率增高（部分失败）
       - 云函数整体耗时上升甚至超时
   - **强制修复方案**：
     - 严格使用“分批删除”（chunk）或数据库批量能力（如果平台支持）。
     - 每批固定并发数（例如 10~20），并对失败条目回收重试（需有最大重试次数）。

4. **小程序评分页 loadScoredOffices 对单日 inspections 使用 limit(1000) 固定上限，存在“数据被截断导致重复检测不准”与额外前端计算开销**
   - **位置**：`miniprogram/pages/score/score.ts`，`loadScoredOffices(date)`
   - **成因与推演**：
     - 固定 `limit(1000)` 并假定单日不会超过 1000。
     - 一旦超过，将导致“已评分办公室集合不完整”，重复确认逻辑可能失效（虽是正确性问题，但会引起额外重复提交/覆盖，间接增加数据库写入压力）。
   - **强制修复方案**：
     - 云端提供“按 date 聚合返回唯一 officeKey 列表”的云函数（数据库侧去重），前端直接消费。
     - 或前端分页拉取直到不足一页为止（并限制最大条数，超限则提示）。

### 🟡 冗余代码与一般损耗（5 处）
1. **历史页筛选在前端对当前已加载页数据做全量 filter + details.some，输入频繁变化时有明显 CPU 额外开销**
   - **位置**：`miniprogram/pages/history/history.ts`，`applyFilter()` + `onSearchInput()`
   - **影响**：
     - 对已加载 `inspections` 数组每次输入都 O(P) 扫描；每条还可能对 `details` 做 `some`，最坏 O(P * D)。
     - 虽有分页，但在连续上拉加载后 P 会增长。
   - **修复建议**：
     - 对 `onSearchInput` 增加轻量 debounce（例如 200~300ms）以减少重复筛选。
     - 若搜索为核心功能：改为云端查询（索引支持），前端仅渲染结果。

2. **导出云函数 generateExcelBuffer 内部对 `deptRoomsMap.get(deptName).includes(room)` 做去重，理论上会退化为 O(N^2) 去重**
   - **位置**：`miniprogram/cloudfunctions/exportReport/index.js`，`generateExcelBuffer()` 的回退分支（从检查记录提取部门/办公室）
   - **影响**：rooms 去重若用 `includes`，每次是 O(R)；累积 R 次可达 O(R^2)。
   - **修复建议**：
     - 使用 `Map<string, Set<string>>` 或在构建时用 `Set`，最终再 `Array.from(set)`。

3. **getInspectionDates 聚合后又在代码层进行二次 sort，存在重复排序成本**
   - **位置**：`miniprogram/cloudfunctions/getInspectionDates/index.js`
   - **影响**：聚合阶段已 sort，后续 `.sort((a,b)=>...)` 是冗余 O(K log K)。
   - **修复建议**：
     - 只保留一种排序（建议以聚合 sort 为准，后端不再二次 sort）。

4. **manageRooms 批量导入在函数内累计 failures 数组，规模大时会增加内存占用**
   - **位置**：`miniprogram/cloudfunctions/manageRooms/index.js`，`action === 'batchImport'`
   - **影响**：失败条目越多，数组越大；虽然最终 slice(0,20) 返回，但内存已经占用了。
   - **修复建议**：
     - 失败仅保留前 20 条即可（超过后只计数）。

5. **日志在批量失败路径中可能输出包含较大对象（error 序列化），在高频失败时 I/O 开销显著**
   - **位置**：`miniprogram/cloudfunctions/manageRooms/index.js`，批量导入 catch 中 `console.error(...)`
   - **影响**：云端日志 I/O 是昂贵操作，会放大耗时。
   - **修复建议**：
     - 日志仅输出必要字段（id/name/message），避免输出完整对象。

### 🟢 微优化与架构建议（4 处）
1. **榜单/分析结果可以增加“按日期范围的云端缓存”以降低重复计算**
   - **位置**：`getLeaderboard`、`getAnalytics`
   - **建议**：
     - 以 `date` 或 `dateRange` 为 key 写入缓存集合（例如 `analytics_cache`），并设置 TTL 字段；前端优先读缓存。
     - 注意：缓存需要失效策略（同日数据被提交/覆盖时要更新）。

2. **导出建议改为“云存储文件直链 + 前端下载”，避免 base64 传输开销**
   - **位置**：历史页 `exportData()` 使用 `returnContent: true` 收到 `xlsxBase64`
   - **建议**：
     - base64 会膨胀体积约 33%，且前端要做解码与同步写文件。
     - 若业务允许：优先云函数上传云存储返回 `fileID`，前端用下载接口获取。

3. **对 inspections 集合的查询建议统一使用字段投影，避免隐式携带 details/images 大字段**
   - **位置**：多处 `inspections.get()`
   - **建议**：
     - 榜单：只要 `department/room/totalScore/date`。
     - 日期列表：只要 `date`。

4. **数据库索引命中风险提示**
   - **位置**：涉及 `inspections` 的 where/orderBy：
     - `getLeaderboard`：`where(date) + orderBy(totalScore)`
     - `history`：`orderBy(createdAt)` + 可选 `where(date)`
     - `getAnalytics`：`where(date>=)`
   - **建议**：
     - 确认 `inspections.date`、`inspections.createdAt`、`inspections.totalScore` 以及必要复合索引已建立，否则会出现扫描型慢查询。

## 维度检查详情
*仅列出存在风险或值得关注的维度*
- **[A. 算法与计算]**：
  - `exportReport` 回退构建部门/办公室时使用 `includes` 去重，存在潜在 O(N^2) 退化。
  - `history.applyFilter` 在输入变化下高频 O(P*D) 扫描，建议 debounce 或云端搜索。
- **[B. 内存与空间]**：
  - `getAnalytics` 两次全量 `.get()` 将周期内记录全部拉回内存，是明确的 O(N) 空间风险。
  - `exportReport` 的 `writeBuffer()` 构建完整 xlsx buffer，文件越大越容易触顶。
- **[D. 数据库与 I/O]**：
  - 多处 `.get()` 缺少 `.field()` 投影（过度获取）。
  - `getLeaderboard` 对单日 inspections 全量读取，缺少数据库侧聚合分组。
- **[E. 并发与异步]**：
  - 部门删除/清空路径使用 `Promise.all` 对大量 remove 并发，缺乏并发度控制。

## 优化验收结论
- [ ] 性能达标，冗余代码已清理，允许合并。
- [x] **被阻断**：必须修复 🔴 阻断性性能灾难（`getAnalytics` 全量 `.get()` 与 `getLeaderboard` 无上限全量读取）并补齐关键查询的字段投影/聚合后，方可验收。

---
*注：本次审查基于提供的代码静态分析（Big O 推演）得出。*
