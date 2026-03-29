// pages/home/home.ts - 首页（红黑榜）
import { SCORING_MAX_SCORES } from '../../config/scoring';

interface Inspection {
  _id: string;
  date: string;
  checkerName: string;
  department: string;
  room: string;
  totalScore: number;
  details: Array<{
    item: string;
    score: number;
    images: string[];
    remark: string;
  }>;
}

type DeductionItem = {
  item: string;
  score: number;
  maxScore: number;
  diff: number;
  level: 'critical' | 'warning' | 'perfect';
  images: string[];
  remark: string;
};

function buildDeductionItems(details: Inspection['details']): DeductionItem[] {
  return details
    .map((d) => {
      const maxScore = SCORING_MAX_SCORES[d.item] ?? 10;
      const safeScore = typeof d.score === 'number' ? d.score : Number(d.score);
      const diff = Math.max(0, maxScore - safeScore);

      const ratio = maxScore > 0 ? safeScore / maxScore : 1;
      const level: DeductionItem['level'] = ratio <= 0.4 ? 'critical' : ratio < 1 ? 'warning' : 'perfect';

      return {
        item: d.item,
        score: safeScore,
        maxScore,
        diff,
        level,
        images: d.images || [],
        remark: d.remark || '',
      };
    })
    .filter((d) => d.score < d.maxScore)
    // 扣分多的排前面；扣分一样时，得分率低的更靠前
    .sort((a, b) => {
      if (b.diff !== a.diff) return b.diff - a.diff;
      const ar = a.maxScore > 0 ? a.score / a.maxScore : 1;
      const br = b.maxScore > 0 ? b.score / b.maxScore : 1;
      return ar - br;
    });
}

Page({
  data: {
    loading: true,
    redList: [] as Inspection[],
    blackList: [] as Inspection[],
    selectedInspection: null as Inspection | null,
    showDetail: false,
    // 扣分项详情
    deductionItems: [] as DeductionItem[],
    // 最新更新时间
    lastUpdateTime: '' as string,
    // 日期选择相关
    selectedDate: '' as string,
    availableDates: [] as string[],
    latestDate: '' as string,
    // 密码弹窗相关
    showPasswordModal: false,
    passwordInput: '' as string,
    passwordInputFocus: false,
    passwordVerifying: false,
    // 缓存相关
    cacheKey: 'home_leaderboard_cache',
    cacheDuration: 5 * 60 * 1000, // 5 分钟缓存
  },

  onLoad() {
    this.loadAvailableDates();
  },

  onShow() {
    // 检查缓存是否有效
    this.checkCacheAndLoad();
  },

  // 检查缓存并加载数据
  checkCacheAndLoad() {
    const now = Date.now();
    const cache = wx.getStorageSync(this.data.cacheKey);
    const selectedDate = this.data.selectedDate;
    
    // 检查缓存是否有效（有数据、未过期、日期匹配）
    if (cache && cache.data && (now - cache.timestamp) < this.data.cacheDuration && cache.date === selectedDate) {
      // 使用缓存数据
      this.setData({
        redList: cache.data.redList,
        blackList: cache.data.blackList,
        lastUpdateTime: cache.data.lastUpdateTime,
        loading: false
      });
      
      // 后台静默刷新（不显示 loading）
      this.loadAvailableDates(false);
    } else {
      // 缓存失效或不存在，重新加载
      this.loadAvailableDates(true);
    }
  },

  // 加载可用日期列表
  async loadAvailableDates(showLoading = true) {
    if (showLoading) {
      this.setData({ loading: true });
    }
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'getInspectionDates',
        data: { limit: 50 }
      }) as any;

      if (res.result?.success && res.result.dates?.length > 0) {
        const dates = res.result.dates;
        const latestDate = dates[0];
        this.setData({
          availableDates: dates,
          latestDate,
          selectedDate: latestDate,
        });
        this.loadRankings(latestDate, showLoading);
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('获取日期列表失败', err);
      this.setData({ loading: false });
      if (showLoading) {
        wx.showToast({ title: '加载日期失败', icon: 'error' });
      }
    }
  },

  // 加载红黑榜数据
  async loadRankings(date?: string, showLoading = true) {
    if (showLoading) {
      this.setData({ loading: true });
    }

    const targetDate = date || this.data.selectedDate;

    try {
      // 调用云函数获取排行榜
      const res = await wx.cloud.callFunction({
        name: 'getLeaderboard',
        data: { date: targetDate }
      }) as any;

      if (res.result) {
        const queryDate = res.result.date || targetDate;
        const cacheData = {
          redList: res.result.redList || [],
          blackList: res.result.blackList || [],
          lastUpdateTime: queryDate,
        };
        
        // 更新缓存
        wx.setStorageSync(this.data.cacheKey, {
          data: cacheData,
          date: queryDate,
          timestamp: Date.now()
        });
        
        this.setData({
          redList: cacheData.redList,
          blackList: cacheData.blackList,
          lastUpdateTime: cacheData.lastUpdateTime,
          selectedDate: queryDate,
          loading: false,
        });
      }
    } catch (err) {
      console.error('获取排行榜失败', err);
      this.setData({ loading: false });
      
      // 如果有缓存，降级使用缓存
      const cache = wx.getStorageSync(this.data.cacheKey);
      if (cache && cache.data) {
        this.setData({
          redList: cache.data.redList,
          blackList: cache.data.blackList,
          lastUpdateTime: cache.data.lastUpdateTime
        });
      }
      
      if (showLoading) {
        wx.showToast({ title: '加载失败', icon: 'error' });
      }
    }
  },

  // 日期选择变化
  onDateChange(e: any) {
    const date = e.detail.value;
    this.setData({ selectedDate: date });
    this.loadRankings(date);
  },

  // 点击管理入口
  async goToAdmin() {
    const app = getApp() as any;

    // 已验证过，直接进入
    if (app.globalData.adminAuthed) {
      wx.navigateTo({ url: '/pages/admin/departments/departments' });
      return;
    }

    // 显示密码弹窗（延迟聚焦，避免渲染冲突）
    this.setData({ showPasswordModal: true, passwordInput: '', passwordInputFocus: false });
    setTimeout(() => {
      this.setData({ passwordInputFocus: true });
    }, 100);
  },

  // 阻止滚动穿透
  preventTouchMove() {},

  // 阻止事件冒泡
  preventBubble() {},

  // 拦截输入框点击事件
  onInputTap() {},

  // 密码输入
  onPasswordInput(e: any) {
    this.setData({ passwordInput: e.detail.value });
  },

  // 取消密码弹窗
  cancelPasswordModal() {
    this.setData({ showPasswordModal: false, passwordInput: '', passwordInputFocus: false });
  },

  // 确认密码
  async confirmPassword() {
    const password = this.data.passwordInput.trim();
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    this.setData({ passwordVerifying: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'verifyAdminPassword',
        data: { password }
      }) as any;

      if (res.result?.success) {
        const app = getApp() as any;
        app.globalData.adminAuthed = true;
        this.setData({ showPasswordModal: false, passwordInput: '', passwordVerifying: false });
        wx.navigateTo({ url: '/pages/admin/departments/departments' });
      } else {
        wx.showToast({ title: res.result?.message || '密码错误', icon: 'error' });
        this.setData({ passwordVerifying: false });
      }
    } catch (err) {
      console.error('验证密码失败', err);
      wx.showToast({ title: '验证失败', icon: 'error' });
      this.setData({ passwordVerifying: false });
    }
  },

  // 查看黑榜扣分项详情
  viewBlackDetail(e: any) {
    const { id } = e.currentTarget.dataset;
    const inspection = this.data.blackList.find(item => item._id === id);
    
    if (inspection) {
      const deductionItems = buildDeductionItems(inspection.details);
      
      this.setData({
        selectedInspection: inspection,
        deductionItems,
        showDetail: true,
      });
    }
  },

  // 查看红榜详情（显示所有评分明细）
  viewDetail(e: any) {
    const { id } = e.currentTarget.dataset;
    const inspection = this.data.redList.find(item => item._id === id);
    
    if (inspection) {
      const deductionItems = buildDeductionItems(inspection.details);
      
      this.setData({
        selectedInspection: inspection,
        deductionItems,
        showDetail: true,
      });
    }
  },

  // 关闭详情弹窗
  closeDetail() {
    this.setData({
      showDetail: false,
      selectedInspection: null,
      deductionItems: [],
    });
  },

  // 预览图片
  previewImage(e: any) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({
      current: url,
      urls: urls,
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadRankings().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '7S联查看板',
      path: '/pages/home/home',
    };
  },
});
