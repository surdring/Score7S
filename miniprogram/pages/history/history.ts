// pages/history/history.ts - 历史记录页面（分页优化版）
import { SCORING_MAX_SCORES } from '../../config/scoring';

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
    loading: true,
    inspections: [] as InspectionRecord[],
    filteredInspections: [] as InspectionRecord[],
    // 筛选
    searchKeyword: '',
    selectedDate: '',
    // 详情
    selectedInspection: null as InspectionRecord | null,
    showDetail: false,
    // 导出
    exporting: false,
    // 满分标准（从配置文件导入）
    scoringMaxScores: SCORING_MAX_SCORES,
    // 防止重复加载标记
    _initialized: false,
    // 分页相关
    pageSize: 20,
    currentPage: 1,
    hasMore: true,
    loadingMore: false,
  },

  onLoad(options: { searchKeyword?: string; selectedDate?: string }) {
    // 如果传入搜索关键词或日期，则设置
    const searchKeyword = options.searchKeyword || '';
    const selectedDate = options.selectedDate || '';
    
    this.setData({ 
      selectedDate,
      searchKeyword,
    });
    this.loadHistory(true);
  },

  onShow() {
    // 仅在首次加载后才触发 onShow 重新加载
    if (this.data._initialized) {
      this.loadHistory(true);
    }
  },

  // 加载历史记录（支持分页）
  async loadHistory(refresh = false) {
    // 防止重复加载
    if (this.data.loadingMore || (!refresh && !this.data.hasMore)) {
      return;
    }

    this.setData({ 
      loading: refresh,
      loadingMore: !refresh
    });

    try {
      const { pageSize, currentPage, selectedDate } = this.data;
      const db = wx.cloud.database();
      let query = db.collection('inspections');

      // 构建查询条件
      if (selectedDate) {
        query = query.where({
          date: selectedDate
        } as unknown as Record<string, unknown>);
      }

      // 分页查询
      const skip = (refresh ? 1 : currentPage) - 1;
      const res = await query
        .orderBy('createdAt', 'desc')
        .skip(skip * pageSize)
        .limit(pageSize)
        .get();

      const newInspections = res.data as unknown as InspectionRecord[];
      
      this.setData({
        inspections: refresh ? newInspections : [...this.data.inspections, ...newInspections],
        hasMore: newInspections.length === pageSize,
        currentPage: refresh ? 1 : currentPage + 1,
        loading: false,
        loadingMore: false,
        _initialized: true,
      });
      
      // 如果没有选择日期，默认筛选最新日期
      if (!this.data.selectedDate && newInspections.length > 0) {
        const latestDate = newInspections[0].date;
        this.setData({ selectedDate: latestDate });
      }
      
      this.applyFilter();
    } catch (err) {
      console.error('加载历史记录失败', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  // 应用筛选
  applyFilter() {
    const { inspections, searchKeyword, selectedDate } = this.data;
    const keyword = searchKeyword.toLowerCase().trim();

    const filtered = inspections.filter((item: InspectionRecord) => {
      // 日期筛选（精确匹配）
      if (selectedDate && item.date !== selectedDate) {
        return false;
      }
      // 关键词筛选
      if (keyword) {
        const detailsMatched = Array.isArray(item.details)
          ? item.details.some((d: InspectionDetail) => {
            const detailItem = (d?.item || '').toLowerCase();
            const detailRemark = (d?.remark || '').toLowerCase();
            return detailItem.includes(keyword) || detailRemark.includes(keyword);
          })
          : false;

        return (
          item.department.toLowerCase().includes(keyword) ||
          (item.checkerName && item.checkerName.toLowerCase().includes(keyword)) ||
          item.room.toLowerCase().includes(keyword) ||
          (item.date && String(item.date).includes(keyword)) ||
          detailsMatched
        );
      }
      return true;
    });

    this.setData({ filteredInspections: filtered });
  },

  // 搜索输入
  onSearchInput(e: { detail: { value: string } }) {
    this.setData({ searchKeyword: e.detail.value });
    this.applyFilter();
  },

  // 日期选择
  onDateChange(e: { detail: { value: string } }) {
    const newDate = e.detail.value;
    this.setData({ selectedDate: newDate });
    this.applyFilter();
    // 如果日期被清空，显示提示
    if (!newDate) {
      wx.showToast({ title: '已显示全部日期数据', icon: 'none', duration: 1500 });
    }
  },

  // 查看详情
  viewDetail(e: { currentTarget: { dataset: { id?: string } } }) {
    const { id } = e.currentTarget.dataset;
    
    if (!id) {
      console.error('data-id 为空，检查 wxml 绑定');
      wx.showToast({ title: '数据异常，缺少ID', icon: 'none' });
      return;
    }
    
    const inspection = this.data.filteredInspections.find((item: InspectionRecord) => item._id === id);
    
    if (inspection) {
      this.setData({
        selectedInspection: inspection,
        showDetail: true,
      });
    } else {
      console.error('未找到对应记录，id:', id);
      wx.showToast({ title: '未找到记录', icon: 'none' });
    }
  },

  // 关闭详情
  closeDetail() {
    this.setData({
      showDetail: false,
      selectedInspection: null,
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

  // 导出数据
  async exportData() {
    if (this.data.filteredInspections.length === 0) {
      wx.showToast({ title: '没有可导出的数据', icon: 'none' });
      return;
    }

    this.setData({ exporting: true });
    wx.showLoading({ title: '生成中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'exportReport',
        data: {
          date: this.data.selectedDate,
          keyword: this.data.searchKeyword,
          format: 'xlsx',
          returnContent: true,
        }
      });

      wx.hideLoading();

      const result = res.result as unknown as { success?: boolean; xlsxBase64?: string; message?: string };

      if (!result?.success || !result?.xlsxBase64) {
        wx.showToast({ title: result?.message || '导出失败', icon: 'error' });
        return;
      }

      // 使用时间戳生成唯一文件名
      const timestamp = Date.now();
      const fileName = `7S联查评分表_${this.data.selectedDate || '全部'}_${timestamp}.xlsx`;
      const tempPath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      const fs = wx.getFileSystemManager();
      const buffer = wx.base64ToArrayBuffer(result.xlsxBase64);
      fs.writeFileSync(tempPath, buffer);

      // 使用文件保存对话框让用户选择保存位置
      if (wx.showSaveFileDialog) {
        wx.showSaveFileDialog({
          title: '选择保存位置',
          fileName: fileName,
          success: (saveRes: { savedFilePath?: string; filePath?: string }) => {
            // 将文件保存到用户选择的位置
            try {
              const savedPath = saveRes.savedFilePath || saveRes.filePath;
              if (!savedPath) {
                throw new Error('未获取到保存路径');
              }
              fs.saveFileSync(savedPath, tempPath);
              wx.showToast({ title: '保存成功', icon: 'success' });
              
              // 询问是否打开文件
              wx.showModal({
                title: '保存成功',
                content: '文件已保存，是否立即打开？',
                success: (modalRes: { confirm: boolean; cancel: boolean }) => {
                  if (modalRes.confirm) {
                    wx.openDocument({
                      filePath: savedPath,
                      fileType: 'xlsx',
                      showMenu: true,
                      fail: (err: unknown) => {
                        console.error('打开文档失败', err);
                        wx.showToast({ title: '打开失败', icon: 'none' });
                      }
                    });
                  }
                }
              });
            } catch (err) {
              console.error('保存文件失败', err);
              wx.showToast({ title: '保存失败', icon: 'error' });
            }
          },
          fail: (err: unknown) => {
            console.error('选择保存路径失败', err);
            // 用户取消或失败，尝试直接打开临时文件
            wx.openDocument({
              filePath: tempPath,
              fileType: 'xlsx',
              showMenu: true
            });
          }
        });
      } else {
        // 基础库版本过低，直接打开临时文件
        wx.openDocument({
          filePath: tempPath,
          fileType: 'xlsx',
          showMenu: true,
          fail: (err: unknown) => {
            console.error('打开文档失败', err);
            wx.showToast({ title: '打开失败，可在右上角菜单分享/另存', icon: 'none' });
          }
        });
      }
    } catch (err) {
      console.error('导出失败', err);
      wx.hideLoading();
      wx.showToast({ title: '导出失败', icon: 'error' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadHistory(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadHistory(false);
    }
  },
});
