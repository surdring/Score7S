# 7S联查评分小程序

基于微信小程序原生开发 + 云开发的7S联查评分系统。

## 项目结构

```
miniprogram/
├── app.ts                  # 小程序入口
├── app.json                # 小程序配置
├── app.wxss                # 全局样式
├── pages/                  # 页面目录
│   ├── home/               # 首页（红黑榜）
│   ├── score/              # 评分页面
│   ├── analytics/          # 数据分析
│   ├── history/            # 历史记录
│   ├── inspection-detail/  # 记录详情
│   └── score-success/      # 提交成功
├── cloudfunctions/         # 云函数目录
│   ├── getLeaderboard/     # 获取排行榜
│   ├── getAnalytics/       # 获取分析数据
│   ├── exportReport/       # 导出报告（CSV/Excel）
│   └── manageDepartments/  # 部门数据管理
├── data/                   # 初始数据
│   └── departments.json    # 部门列表
├── utils/                  # 工具函数
│   ├── util.ts             # 通用工具
│   └── db.ts               # 数据库封装
├── types/                  # 类型定义
│   └── index.d.ts          # 微信API类型
└── assets/                 # 资源文件
    └── icons/              # TabBar图标
```

## 功能特性

### 核心功能
- **评分提交**：支持7个评分项（桌面摆放、地面、窗台、文件资料、电器设备、办公椅、整体印象），每项4个分数选项（10/8/4/2分）
- **照片上传**：低分项（≤4分）必须上传照片或填写备注
- **红黑榜**：展示最新一期检查的高分前3名和低分后3名
- **历史查询**：按月份和关键词筛选历史记录
- **数据分析**：趋势图、部门对比、扣分重灾区分析
- **数据导出**：支持CSV和Excel格式导出，符合模板规范

### 技术特性
- 微信云开发（CloudBase）后端
- 云数据库存储
- 云存储图片托管
- 云函数业务逻辑

## 快速开始

### 1. 配置AppID
编辑 `project.config.json`，填写你的小程序AppID：
```json
{
  "appid": "你的小程序AppID"
}
```

### 2. 配置云环境
编辑 `app.ts`，填写你的云开发环境ID：
```typescript
wx.cloud.init({
  env: '你的云开发环境ID',
  traceUser: true,
});
```

### 3. 创建数据库集合
在云开发控制台创建以下集合：
- `departments`：部门数据
- `inspections`：检查记录

### 4. 导入部门数据
调用云函数 `manageDepartments` 导入初始数据：
```javascript
wx.cloud.callFunction({
  name: 'manageDepartments',
  data: {
    action: 'import',
    departments: [...] // 从 data/departments.json 获取
  }
});
```

### 5. 上传云函数
在微信开发者工具中，右键每个云函数目录，选择"上传并部署：云端安装依赖"。

### 6. 添加TabBar图标
在 `assets/icons/` 目录下添加以下图标文件（建议尺寸81x81px）：
- `home.png` / `home-active.png`
- `score.png` / `score-active.png`
- `analytics.png` / `analytics-active.png`
- `history.png` / `history-active.png`

## 导出功能说明

导出的CSV/Excel文件格式严格按照 `docs/7S联查6人评分表.csv` 模板：
- 包含标题行、日期行、表头行、描述行、分数选项行
- 数据行按部门顺序排列
- 分数用"✓"标记在对应列
- CSV文件包含UTF-8 BOM确保Excel兼容

## 数据模型

### departments 集合
```typescript
{
  _id: string;
  name: string;        // 部门名称
  rooms: string[];     // 办公室列表
  createdAt: Date;
}
```

### inspections 集合
```typescript
{
  _id: string;
  date: string;                    // 检查日期 YYYY-MM-DD
  checkerId: string;               // 检查员ID
  checkerName: string;             // 检查员姓名
  department: string;              // 部门名称
  room: string;                    // 办公室位置
  totalScore: number;              // 总分
  details: Array<{                 // 评分明细
    item: string;                  // 评分项名称
    score: number;                 // 分数
    images: string[];              // 图片fileID列表
    remark: string;                // 备注说明
  }>;
  createdAt: Date;
}
```

## 开发说明

- 所有代码注释使用中文
- 使用TypeScript开发
- 样式使用WXSS
- 遵循微信小程序开发规范

## License

MIT
