// pages/analytics/analytics.ts - 数据分析页面
Page({
  data: {
    loading: true,
    hasData: false,
    // 趋势数据
    trendData: [] as Array<{ date: string; averageScore: number }>,
    // 部门数据
    deptData: [] as Array<{ department: string; averageScore: number }>,
    // 问题项数据
    issueData: [] as Array<{ item: string; averageScore: number }>,
    // 评分项
    scoringItems: ['地面', '桌面摆放', '文件资料', '电器设备', '办公椅', '窗台', '整体印象'],
  },

  onLoad() {
    this.loadAnalytics();
  },

  onShow() {
    this.loadAnalytics();
  },

  // 加载分析数据
  async loadAnalytics() {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'getAnalytics',
        data: {}
      }) as any;

      if (res.result && res.result.trendData && res.result.trendData.length > 0) {
        this.setData({
          trendData: res.result.trendData,
          deptData: res.result.deptData || [],
          issueData: res.result.issueData || [],
          hasData: true,
          loading: false,
        });
      } else {
        this.setData({
          hasData: false,
          loading: false,
        });
      }
    } catch (err) {
      console.error('获取分析数据失败', err);
      this.setData({ loading: false, hasData: false });
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadAnalytics().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 获取最高分部门
  getTopDept(): string {
    if (this.data.deptData.length === 0) return '-';
    return this.data.deptData[0].department;
  },

  // 获取最低平均分项
  getWorstItem(): string {
    if (this.data.issueData.length === 0) return '-';
    return this.data.issueData[0].item;
  },
});
