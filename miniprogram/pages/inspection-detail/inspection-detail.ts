// pages/inspection-detail/inspection-detail.ts - 检查记录详情页

interface InspectionDetail {
  item: string;
  score: number;
  images: string[];
  remark: string;
}

interface InspectionRecord {
  _id: string;
  date: string;
  checkerName?: string;
  department: string;
  room: string;
  totalScore: number;
  details?: InspectionDetail[];
  createdAt?: unknown;
}

Page({
  data: {
    inspection: null as InspectionRecord | null,
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

  // 返回
  goBack() {
    wx.navigateBack();
  },

  // 返回首页
  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },
});
