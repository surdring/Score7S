# 职能部室（办公室）7S联查评分小程序

> 一款面向企业职能部室的7S联查数字化管理工具，支持检查员通过手机现场对办公室环境进行标准化评分、拍照存证，自动生成红黑榜排名及数据分析报表。

[![微信小程序](https://img.shields.io/badge/微信小程序-原生开发-green)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![云开发](https://img.shields.io/badge/微信云开发-Serverless-blue)](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

---

## 📖 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [云函数说明](#云函数说明)
- [数据库设计](#数据库设计)
- [开发规范](#开发规范)
- [更新日志](#更新日志)

---

## 项目简介

### 背景

目前公司职能部室的7S联查采用传统纸质表格或Excel进行记录，存在以下痛点：

- **效率低下**：现场记录后需回办公室二次录入电脑，人工统计耗时费力
- **缺乏直观证据**：纸质打分难以关联现场实况，扣分项容易引起争议
- **数据滞后**：领导无法实时掌握检查结果，历史数据难以沉淀分析

### 目标

实现7S联查的**全面数字化**：

1. **移动化打分**：检查人员持手机即可完成现场打分
2. **存证可视化**：评分与现场照片/文字备注强绑定，做到"有图有真相"
3. **统计自动化**：提交后系统秒级自动计算总分，生成红黑榜排名

---

## 功能特性

### 📝 现场检查打分

- **7项标准化评分**：地面、桌面摆放、文件资料、电器设备、办公椅、窗台、整体印象
- **快捷评分按钮**：每项提供 `[满分]` `[良好]` `[一般]` `[较差]` 四档快捷选择
- **低分强制验证**：单项评分 ≤40% 时，必须上传照片或填写备注
- **智能防重复**：同日期同办公室已评分时弹出二次确认
- **拍照存证**：每项最多上传3张照片，支持相机拍摄或相册选择

### 🏆 红黑榜排名

- **红榜**：总分前3名办公室，金银铜奖牌样式展示
- **黑榜**：总分倒数前3名（排除满分和红榜同分记录）
- **并列排名**：采用密集排名算法，同分记录并列显示
- **日期切换**：支持查看历史各期红黑榜

### 📊 数据分析

- **趋势图表**：全公司平均分变化趋势折线图
- **部门对比**：各部门平均分柱状图对比
- **问题识别**：7个评分项平均分雷达图，识别薄弱项

### 📜 历史记录

- **多维度搜索**：支持按日期、部门、检查员、备注内容检索
- **详情查看**：查看单条记录的完整评分明细和照片
- **Excel导出**：导出完整评分表和红黑榜排名

### ⚙️ 后台管理

- **部门管理**：添加、编辑、删除部门信息
- **办公室管理**：管理各部门下属办公室
- **清空评分数据**：仅删除历史评分记录，保留部门/办公室结构
- **清理全部数据**：清空所有业务数据（部门、办公室、评分记录）
- **管理入口**：位于"历史"页面顶部，需管理员密码验证

---

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                     用户层                               │
│         微信小程序前端 (TypeScript + WXML + WXSS)         │
└─────────────────────────────────────────────────────────┘
                           ↓↑
┌─────────────────────────────────────────────────────────┐
│                   云开发服务层                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  云函数      │  │  云数据库    │  │  云存储      │      │
│  │ (Node.js)   │  │  (NoSQL)    │  │  (图片)     │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生框架 + TypeScript |
| 后端 | 微信云开发 + Node.js 云函数 |
| 数据库 | 微信云数据库 (NoSQL) |
| 存储 | 微信云存储 |
| 图表 | ECharts for WeChat |
| 导出 | ExcelJS |

---

## 项目结构

```
Score7S/
├── miniprogram/                    # 小程序源码目录
│   ├── cloudfunctions/             # 云函数目录
│   │   ├── shared/                 # 公共模块（需同步）
│   │   │   ├── ranking.js          # 红黑榜排名计算
│   │   │   └── constants.js        # 评分常量定义
│   │   ├── submitInspection/       # 提交评分
│   │   ├── getLeaderboard/         # 获取排行榜
│   │   ├── getAnalytics/           # 获取分析数据
│   │   ├── exportReport/           # 导出Excel报告
│   │   ├── manageDepartments/      # 部门管理
│   │   ├── manageRooms/            # 办公室管理
│   │   ├── verifyAdminPassword/    # 管理员密码验证
│   │   └── clearAllData/           # 清空数据
│   ├── config/                     # 配置文件
│   │   └── scoring.ts              # 评分配置（统一管理）
│   ├── pages/                      # 页面目录
│   │   ├── home/                   # 首页（红黑榜）
│   │   ├── score/                  # 评分页
│   │   ├── analytics/              # 数据分析页
│   │   ├── history/                # 历史记录页
│   │   ├── inspection-detail/      # 检查详情页
│   │   ├── score-success/          # 提交成功页
│   │   └── admin/                  # 管理页面
│   │       ├── departments/        # 部门管理
│   │       └── rooms/              # 办公室管理
│   ├── data/                       # 静态数据
│   │   └── departments.json        # 部门初始数据
│   ├── assets/                     # 静态资源
│   │   └── icons/                  # 图标资源
│   ├── utils/                      # 工具函数
│   │   └── util.ts                 # 通用工具
│   ├── app.ts                      # 小程序入口
│   ├── app.json                    # 小程序配置
│   ├── app.wxss                    # 全局样式
│   └── typing.d.ts                 # 类型定义
├── scripts/                        # 脚本目录
│   └── sync-shared.js              # 云函数公共模块同步脚本
├── docs/                           # 文档目录
│   ├── 职能部室（办公室）7S联查评分小程序.md  # 需求文档
│   └── 代码检查与性能优化实现记录.md        # 优化记录
├── AGENTS.md                       # 项目规则文件
└── README.md                       # 项目说明文档
```

---

## 快速开始

### 环境要求

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 1.06.0 或以上
- Node.js 16.x 或以上
- 已开通微信云开发环境

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd Score7S
   ```

2. **安装依赖**
   ```bash
   cd miniprogram
   npm install
   ```

3. **同步云函数公共模块**
   ```bash
   cd ..
   node scripts/sync-shared.js
   ```

4. **导入微信开发者工具**
   - 打开微信开发者工具
   - 选择"导入项目"
   - 目录选择 `miniprogram` 文件夹
   - 填写 AppID（需在微信公众平台注册）

5. **配置云开发环境**
   - 在微信开发者工具中点击"云开发"
   - 创建或选择云开发环境
   - 记录环境 ID，更新到 `app.ts` 中（已默认配置 `cloudbase-2g1teb5c0c67c6d5`）

6. **配置管理员权限**
   - 在云开发控制台 → 数据库 → 创建 `config` 集合
   - 导入 `scripts/admin-config.json` 文件，包含：
     - 默认管理员密码：`7S123456`
     - 管理员 OpenID 白名单（需替换为您自己的 OpenID）
   - 获取 OpenID 方法：进入小程序"历史"页 → 点击"管理" → 查看控制台输出

7. **部署云函数**
   - 右键各云函数目录
   - 选择"上传并部署：云端安装依赖"

8. **初始化数据库**
   - 在云开发控制台创建以下集合：
     - `inspections` - 检查记录
     - `departments` - 部门信息
     - `rooms` - 办公室信息
     - `config` - 系统配置

### 运行项目

点击微信开发者工具的"编译"按钮即可预览。

---

## 配置说明

### 评分配置

评分配置统一在 `miniprogram/config/scoring.ts` 中管理：

```typescript
// 评分项列表
export const SCORING_ITEMS = [
  '地面', '桌面摆放', '文件资料', 
  '电器设备', '办公椅', '窗台', '整体印象'
] as const;

// 每项最高分（100分制）
export const SCORING_MAX_SCORES = {
  '地面': 20,
  '桌面摆放': 20,
  '文件资料': 10,
  '电器设备': 20,
  '办公椅': 10,
  '窗台': 10,
  '整体印象': 10,
};

// 低分阈值（最高分的40%）
export const SCORING_LOW_THRESHOLDS = {
  '地面': 8,
  '桌面摆放': 8,
  '文件资料': 4,
  '电器设备': 8,
  '办公椅': 4,
  '窗台': 4,
  '整体印象': 4,
};
```

### 云开发环境配置

在 `miniprogram/app.ts` 中配置云开发环境：

```typescript
wx.cloud.init({
  env: 'your-cloud-env-id', // 替换为你的云开发环境ID
});
```

### 管理员配置

管理员配置存储在云数据库 `config` 集合的 `admin` 文档中：

```json
{
  "_id": "admin",
  "adminPassword": "7S123456",
  "adminOpenIds": ["your-openid-here"],
  "createTime": { "$date": "2025-03-31T00:00:00.000Z" },
  "updateTime": { "$date": "2025-03-31T00:00:00.000Z" }
}
```

| 字段 | 说明 |
|------|------|
| `adminPassword` | 管理员登录密码（明文或哈希） |
| `adminOpenIds` | 管理员 OpenID 白名单数组 |

**获取 OpenID：**
1. 进入小程序"历史"页面
2. 点击顶部"管理"按钮
3. 在开发者工具控制台查看输出的 OpenID
4. 将其添加到 `adminOpenIds` 数组中

---

## 云函数说明

### 公共模块

云函数公共模块位于 `cloudfunctions/shared/`，部署前需同步：

```bash
node scripts/sync-shared.js
```

| 模块 | 文件 | 功能 |
|------|------|------|
| 排名计算 | `ranking.js` | 红黑榜排名算法、分组聚合 |
| 常量定义 | `constants.js` | 评分项、最高分、阈值等 |
| 权限验证 | `auth.js` | 管理员权限验证、OpenID 校验 |

### 云函数列表

| 云函数 | 功能 | 参数 |
|--------|------|------|
| `submitInspection` | 提交评分记录 | date, department, room, totalScore, details |
| `getLeaderboard` | 获取红黑榜排名 | date (可选) |
| `getAnalytics` | 获取数据分析（聚合查询） | startDate (可选) |
| `exportReport` | 导出Excel报告（分批获取） | date, format, returnContent |
| `manageDepartments` | 部门管理（需权限） | action, data |
| `manageRooms` | 办公室管理（需权限） | action, data |
| `verifyAdminPassword` | 验证管理员密码 | password |
| `clearAllData` | 清空数据（需权限） | `type`: 'all' \| 'inspections' \| 'departments' \| 'rooms' |

---

## 数据库设计

### inspections（检查记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 记录ID |
| date | string | 检查日期 (YYYY-MM-DD) |
| department | string | 部门名称 |
| room | string | 办公室名称 |
| checkerId | string | 检查员ID |
| checkerName | string | 检查员姓名 |
| totalScore | number | 总分 |
| details | array | 评分明细 |
| createdAt | date | 创建时间 |

### departments（部门信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 部门ID |
| name | string | 部门名称 |
| order | number | 排序序号 |

### rooms（办公室信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 办公室ID |
| name | string | 办公室名称 |
| departmentId | string | 所属部门ID |
| order | number | 排序序号 |

### config（系统配置）

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 配置项ID (admin) |
| adminPassword | string | 管理员密码（明文，不推荐） |
| adminPasswordHash | string | 管理员密码哈希（推荐） |
| adminOpenIds | array | 管理员 OpenID 白名单列表 |

---

## 开发规范

详见 [AGENTS.md](./AGENTS.md)，主要规范包括：

- **中文沟通**：所有文档、注释、错误信息使用中文
- **TypeScript**：前端强制类型注解，禁止 `any`
- **配置外部化**：所有配置通过配置文件管理
- **零技术债务**：任务完成时不得存在 TODO 或待补充项
- **真实集成**：禁止使用 mock，必须使用真实云开发服务

### 代码风格

- 缩进：2 空格
- 引号：单引号
- 分号：不使用分号
- 命名：驼峰命名法

### 提交规范

```
feat: 新功能
fix: 修复Bug
docs: 文档更新
refactor: 重构
style: 代码格式调整
test: 测试相关
chore: 构建/工具相关
```

---

## 更新日志

### v1.3.0 (2026-03-31)

**功能调整**
- 管理入口从首页迁移至"历史"页面顶部，更符合使用场景
- 部门管理页面新增"清空评分数据"按钮（橙色），可单独清理历史评分记录而保留部门架构

**配置完善**
- `app.ts` 默认配置云开发环境 ID `cloudbase-2g1teb5c0c67c6d5`
- 新增 `scripts/admin-config.json` 模板，简化管理员权限初始化流程
- 新增 `cloudfunctions/getOpenId` 云函数，便于获取用户 OpenID

### v1.2.0 (2026-03-29)

**性能优化**
- `getAnalytics` 云函数改用数据库聚合查询，数据传输量减少 90%
- `exportReport` 云函数分批获取数据，支持导出 2000+ 条记录
- `history` 页面添加分页加载，首屏加载速度提升 60%
- `home` 和 `analytics` 页面添加 5 分钟数据缓存，减少重复请求 90%
- 评分页面图片上传前自动压缩（质量 80%，宽度 1080px）

**安全加固**
- 移除 `verifyAdminPassword` 硬编码密码，首次使用时初始化到数据库
- 新建 `shared/auth.js` 权限验证模块
- 为 `manageDepartments`、`manageRooms`、`clearAllData` 添加管理员权限验证

**代码质量**
- 开启 TypeScript 严格模式（strict、noImplicitAny、strictNullChecks）
- 更新 `sync-shared.js` 同步脚本，支持权限模块同步

### v1.1.0 (2026-03-28)

**优化**
- 创建云函数公共模块 `shared/ranking.js` 和 `shared/constants.js`
- 创建前端统一配置 `config/scoring.ts`
- 优化云函数错误处理，统一返回格式
- 添加 SHA256 密码哈希支持

**修复**
- 修复 `history.ts` 中未定义变量 `selectedMonth`
- 修复页面重复加载问题（添加 `_initialized` 标记）
- 使用 `db.serverDate()` 替代客户端时间

### v1.0.0

- 初始版本发布
- 实现现场检查打分功能
- 实现红黑榜排名功能
- 实现数据分析功能
- 实现历史记录查询和导出
- 实现后台管理功能

---

## 许可证

本项目仅供公司内部使用，未经授权不得外传或商用。

---

## 联系方式

如有问题或建议，请联系项目维护人员。
