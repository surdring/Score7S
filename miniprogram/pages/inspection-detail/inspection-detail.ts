// pages/inspection-detail/inspection-detail.ts - 检查记录详情页
Page({
  data: {
    inspection: null as any,
    loading: true,
  },

  onLoad() {
    // 从缓存中获取详情数据
    const detail = wx.getStorageSync('inspectionDetail');
    if (detail) {
      this.setData({
        inspection: detail,
        loading: false,
      });
      wx.removeStorageSync('inspectionDetail');
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: '数据加载失败', icon: 'error' });
    }
  },

  // 预览图片
  previewImage(e: any) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({
      current: url,
      urls: urls,
    });
  },

  // 返回
  goBack() {
    wx.navigateBack();
  },

  // 返回首页
  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },
});
