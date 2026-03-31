// 微信小程序类型定义

/// <reference path="./types/index.d.ts" />

// 扩展 App 类型
interface IAppOption {
  globalData: {
    userInfo: WechatMiniprogram.UserInfo | null;
    hasLogin: boolean;
    cloudEnvId: string | null;
    adminAuthed: boolean; // 管理入口密码验证状态（会话内有效）
  };
  onLaunch(): void;
  checkLoginStatus(): void;
  doLogin(): Promise<boolean>;
  logout(): void;
}

// 评分项数据结构
interface ScoreDetail {
  item: string;
  score: number;
  images: string[];
  remark: string;
}

// 检查记录数据结构
interface Inspection {
  _id: string;
  date: string;
  checkerId: string;
  checkerName: string;
  department: string;
  room: string;
  totalScore: number;
  details: ScoreDetail[];
  createdAt: Date;
}

// 部门数据结构
interface Department {
  _id: string;
  name: string;
  rooms: string[];
}

// 云函数返回类型
interface CloudFunctionResult<T = unknown> {
  errMsg: string;
  result: T;
}

// 排行榜数据
interface RankingData {
  redList: Inspection[];
  blackList: Inspection[];
}

// 分析数据
interface AnalyticsData {
  trendData: { date: string; averageScore: number }[];
  deptData: { department: string; averageScore: number }[];
  issueData: { item: string; averageScore: number }[];
}

// 导出结果
interface ExportResult {
  fileID: string;
  fileName: string;
  fileSize: number;
}
