// pages/score-success/score-success.ts - 评分提交成功页（备用，评分页已内置成功状态）
Page({
  data: {
    inspection: null as any,
  },

  onLoad() {
    const detail = wx.getStorageSync('inspectionDetail');
    if (detail) {
      this.setData({ inspection: detail });
      wx.removeStorageSync('inspectionDetail');
    }
  },

  viewDetail() {
    wx.navigateTo({ url: '/pages/inspection-detail/inspection-detail' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  continueScore() {
    wx.switchTab({ url: '/pages/score/score' });
  },
});
