// pages/home/home.ts - 首页（红黑榜）
import { SCORING_MAX_SCORES } from '../../config/scoring';

type ScoringItem = keyof typeof SCORING_MAX_SCORES;

interface Inspection {
  _id: string;
  date: string;
  checkerName: string;
  department: string;
  room: string;
  totalScore: number;
  details: Array<{
    item: ScoringItem;
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
    // 今日管理速报（办公室粒度）
    insightData: {
      perfectCount: 0,
      topScore: 0,
      topOfficeNames: '',
      topOfficeIds: [] as string[],
      topOfficeCount: 0,
      blackScore: 0,
      blackOfficeNames: '',
      blackOfficeIds: [] as string[],
      blackOfficeCount: 0,
    } as {
      perfectCount: number;
      topScore: number;
      topOfficeNames: string;
      topOfficeIds: string[];
      topOfficeCount: number;
      blackScore: number;
      blackOfficeNames: string;
      blackOfficeIds: string[];
      blackOfficeCount: number;
    },
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
      const insightData = this.generateInsightData(cache.data.redList || [], cache.data.blackList || []);
      // 使用缓存数据
      this.setData({
        redList: cache.data.redList,
        blackList: cache.data.blackList,
        lastUpdateTime: cache.data.lastUpdateTime,
        insightData,
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
      });

      const result = res.result as unknown as { success?: boolean; dates?: string[] };

      if (result?.success && Array.isArray(result.dates) && result.dates.length > 0) {
        const dates = result.dates;
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
      });

      const result = res.result as unknown as {
        date?: string;
        redList?: Inspection[];
        blackList?: Inspection[];
      };

      if (result) {
        const queryDate = result.date || targetDate;
        const redList = Array.isArray(result.redList) ? result.redList : [];
        const blackList = Array.isArray(result.blackList) ? result.blackList : [];
        
        // 生成今日管理速报数据
        const insightData = this.generateInsightData(redList, blackList);
        
        const cacheData = {
          redList,
          blackList,
          lastUpdateTime: queryDate,
        };
        
        // 更新缓存
        wx.setStorageSync(this.data.cacheKey, {
          data: cacheData,
          date: queryDate,
          timestamp: Date.now()
        });
        
        this.setData({
          redList,
          blackList,
          lastUpdateTime: cacheData.lastUpdateTime,
          selectedDate: queryDate,
          loading: false,
          insightData,
        });
      }
    } catch (err) {
      console.error('获取排行榜失败', err);
      this.setData({ loading: false });
      
      // 如果有缓存，降级使用缓存
      const cache = wx.getStorageSync(this.data.cacheKey);
      if (cache && cache.data) {
        const insightData = this.generateInsightData(cache.data.redList || [], cache.data.blackList || []);
        this.setData({
          redList: cache.data.redList,
          blackList: cache.data.blackList,
          lastUpdateTime: cache.data.lastUpdateTime,
          insightData
        });
      }
      
      if (showLoading) {
        wx.showToast({ title: '加载失败', icon: 'error' });
      }
    }
  },

  // 日期选择变化
  onDateChange(e: { detail: { value: string } }) {
    const date = e.detail.value;
    this.setData({ selectedDate: date });
    this.loadRankings(date);
  },

  // 点击管理入口
  async goToAdmin() {
    const app = getApp() as IAppOption;

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
  onPasswordInput(e: { detail: { value: string } }) {
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
      });

      const result = res.result as unknown as { success?: boolean; message?: string };

      if (result?.success) {
        const app = getApp() as IAppOption;
        app.globalData.adminAuthed = true;
        this.setData({ showPasswordModal: false, passwordInput: '', passwordVerifying: false });
        wx.navigateTo({ url: '/pages/admin/departments/departments' });
      } else {
        wx.showToast({ title: result?.message || '密码错误', icon: 'error' });
        this.setData({ passwordVerifying: false });
      }
    } catch (err) {
      console.error('验证密码失败', err);
      wx.showToast({ title: '验证失败', icon: 'error' });
      this.setData({ passwordVerifying: false });
    }
  },

  // 查看黑榜扣分项详情
  viewBlackDetail(e: { currentTarget: { dataset: { id?: string } } }) {
    const { id } = e.currentTarget.dataset;
    const inspection = this.data.blackList.find((item: Inspection) => item._id === id);
    
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
  viewDetail(e: { currentTarget: { dataset: { id?: string } } }) {
    const { id } = e.currentTarget.dataset;
    const inspection = this.data.redList.find((item: Inspection) => item._id === id);
    
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
  previewImage(e: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
    const { url, urls } = e.currentTarget.dataset;
    if (!url || !urls || !Array.isArray(urls) || urls.length === 0) {
      return;
    }
    wx.previewImage({
      current: url,
      urls: urls,
    });
  },

  // 生成今日管理速报数据（办公室粒度）
  generateInsightData(redList: Inspection[], blackList: Inspection[]) {
    const perfectCount = redList.filter(item => item.totalScore === 100).length;

    const topScore = redList.length > 0 ? redList[0].totalScore : 0;
    const topItems = redList.filter(item => item.totalScore === topScore);
    const topOfficeIds = topItems.map(item => item._id);
    const topOfficeNames = topItems.map(item => item.room).join('、');

    const blackScore = blackList.length > 0 ? blackList[0].totalScore : 0;
    const blackItems = blackList.filter(item => item.totalScore === blackScore);
    const blackOfficeIds = blackItems.map(item => item._id);
    const blackOfficeNames = blackItems.map(item => item.room).join('、');
    
    return {
      perfectCount,
      topScore,
      topOfficeNames,
      topOfficeIds,
      topOfficeCount: topItems.length,
      blackScore,
      blackOfficeNames,
      blackOfficeIds,
      blackOfficeCount: blackItems.length,
    };
  },

  // 点击查看榜首办公室详情
  viewTopOffice() {
    const { topOfficeIds } = this.data.insightData;
    if (!topOfficeIds || topOfficeIds.length === 0) return;

    if (topOfficeIds.length === 1) {
      const inspection = this.data.redList.find((item: Inspection) => item._id === topOfficeIds[0]);
      if (inspection) {
        const deductionItems = buildDeductionItems(inspection.details);
        this.setData({
          selectedInspection: inspection,
          deductionItems,
          showDetail: true,
        });
      }
      return;
    }

    const options = this.data.redList
      .filter((item: Inspection) => topOfficeIds.includes(item._id))
      .map((item: Inspection) => `${item.room}（${item.totalScore}分）`);

    wx.showActionSheet({
      itemList: options,
      success: (res) => {
        const index = res.tapIndex;
        const targetId = topOfficeIds[index];
        const inspection = this.data.redList.find((item: Inspection) => item._id === targetId);
        if (inspection) {
          const deductionItems = buildDeductionItems(inspection.details);
          this.setData({
            selectedInspection: inspection,
            deductionItems,
            showDetail: true,
          });
        }
      }
    });
  },

  // 点击查看黑榜首个办公室详情
  viewBlackFirst() {
    const { blackOfficeIds } = this.data.insightData;
    if (!blackOfficeIds || blackOfficeIds.length === 0) return;

    if (blackOfficeIds.length === 1) {
      const inspection = this.data.blackList.find((item: Inspection) => item._id === blackOfficeIds[0]);
      if (inspection) {
        const deductionItems = buildDeductionItems(inspection.details);
        this.setData({
          selectedInspection: inspection,
          deductionItems,
          showDetail: true,
        });
      }
      return;
    }

    const options = this.data.blackList
      .filter((item: Inspection) => blackOfficeIds.includes(item._id))
      .map((item: Inspection) => `${item.room}（${item.totalScore}分）`);

    wx.showActionSheet({
      itemList: options,
      success: (res) => {
        const index = res.tapIndex;
        const targetId = blackOfficeIds[index];
        const inspection = this.data.blackList.find((item: Inspection) => item._id === targetId);
        if (inspection) {
          const deductionItems = buildDeductionItems(inspection.details);
          this.setData({
            selectedInspection: inspection,
            deductionItems,
            showDetail: true,
          });
        }
      }
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
