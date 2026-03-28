// pages/history/history.ts - 历史记录页面
Page({
  data: {
    loading: true,
    inspections: [] as any[],
    filteredInspections: [] as any[],
    // 筛选
    searchKeyword: '',
    selectedDate: '',
    // 详情
    selectedInspection: null as any,
    showDetail: false,
    // 导出
    exporting: false,
    // 满分标准
    scoringMaxScores: {
      '地面': 20,
      '桌面摆放': 20,
      '文件资料': 10,
      '电器设备': 20,
      '办公椅': 10,
      '窗台': 10,
      '整体印象': 10,
    } as Record<string, number>,
  },

  onLoad(options: any) {
    // 如果传入搜索关键词或日期，则设置
    const searchKeyword = options.searchKeyword || '';
    const selectedDate = options.selectedDate || '';
    
    this.setData({ 
      selectedDate,
      searchKeyword,
    });
    this.loadHistory();
  },

  onShow() {
    this.loadHistory();
  },

  // 加载历史记录
  async loadHistory() {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const res = await db.collection('inspections')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      this.setData({
        inspections: res.data,
        loading: false,
      });
      
      // 如果没有选择日期，默认筛选最新日期
      if (!this.data.selectedDate && res.data.length > 0) {
        const latestDate = res.data[0].date;
        this.setData({ selectedDate: latestDate });
      }
      
      this.applyFilter();
    } catch (err) {
      console.error('加载历史记录失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  // 应用筛选
  applyFilter() {
    const { inspections, searchKeyword, selectedDate } = this.data;
    const keyword = searchKeyword.toLowerCase().trim();

    const filtered = inspections.filter((item: any) => {
      // 日期筛选（精确匹配）
      if (selectedDate && item.date !== selectedDate) {
        return false;
      }
      // 关键词筛选
      if (keyword) {
        const detailsMatched = Array.isArray(item.details)
          ? item.details.some((d: any) => {
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
  onSearchInput(e: any) {
    this.setData({ searchKeyword: e.detail.value });
    this.applyFilter();
  },

  // 日期选择
  onDateChange(e: any) {
    const newDate = e.detail.value;
    this.setData({ selectedDate: newDate });
    this.applyFilter();
    // 如果日期被清空，显示提示
    if (!newDate) {
      wx.showToast({ title: '已显示全部日期数据', icon: 'none', duration: 1500 });
    }
  },

  // 查看详情
  viewDetail(e: any) {
    const { id } = e.currentTarget.dataset;
    console.log('点击列表项，data-id:', id);
    
    if (!id) {
      console.error('data-id 为空，检查 wxml 绑定');
      wx.showToast({ title: '数据异常，缺少ID', icon: 'none' });
      return;
    }
    
    const inspection = this.data.filteredInspections.find((item: any) => item._id === id);
    console.log('找到的记录:', inspection);
    
    if (inspection) {
      this.setData({
        selectedInspection: inspection,
        showDetail: true,
      });
      console.log('弹窗已显示，showDetail:', true);
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
  previewImage(e: any) {
    const { url, urls } = e.currentTarget.dataset;
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
          month: this.data.selectedMonth,
          keyword: this.data.searchKeyword,
          format: 'xlsx',
          returnContent: true,
        }
      }) as any;

      wx.hideLoading();

      if (!res.result?.success || !res.result?.xlsxBase64) {
        wx.showToast({ title: res.result?.message || '导出失败', icon: 'error' });
        return;
      }

      // 使用时间戳生成唯一文件名
      const timestamp = Date.now();
      const fileName = `7S联查评分表_${this.data.selectedDate || '全部'}_${timestamp}.xlsx`;
      const tempPath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      const fs = wx.getFileSystemManager();
      const buffer = wx.base64ToArrayBuffer(res.result.xlsxBase64);
      fs.writeFileSync(tempPath, buffer);

      // 使用文件保存对话框让用户选择保存位置
      if (wx.showSaveFileDialog) {
        wx.showSaveFileDialog({
          title: '选择保存位置',
          fileName: fileName,
          success: (saveRes: any) => {
            // 将文件保存到用户选择的位置
            try {
              fs.saveFileSync(saveRes.savedFilePath, tempPath);
              wx.showToast({ title: '保存成功', icon: 'success' });
              
              // 询问是否打开文件
              wx.showModal({
                title: '保存成功',
                content: '文件已保存，是否立即打开？',
                success: (modalRes: any) => {
                  if (modalRes.confirm) {
                    wx.openDocument({
                      filePath: saveRes.savedFilePath,
                      fileType: 'xlsx',
                      showMenu: true,
                      fail: (err: any) => {
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
          fail: (err: any) => {
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
          success: () => {
            console.log('打开文档成功', tempPath);
          },
          fail: (err: any) => {
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
    this.loadHistory().then(() => {
      wx.stopPullDownRefresh();
    });
  },
});
