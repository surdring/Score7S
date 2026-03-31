// 办公室管理页面

interface RoomsPageRoom {
  _id: string;
  departmentId: string;
  name: string;
  manager?: string;
  order?: number;
}

interface RoomsPageDepartment {
  _id: string;
  name: string;
}

Page({
  data: {
    loading: false,
    departmentId: '',
    departmentName: '',
    rooms: [] as RoomsPageRoom[],
    showModal: false,
    isEdit: false,
    editId: '',
    formName: '',
    formManager: '',
    formOrder: '',
  },

  onLoad(options: { departmentId?: string }) {
    if (options.departmentId) {
      this.setData({ departmentId: options.departmentId });
      this.loadDepartmentInfo();
      this.loadRooms();
    }
  },

  // 加载部门信息
  async loadDepartmentInfo() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDepartments',
        data: {
          action: 'get',
          departmentId: this.data.departmentId
        }
      });

      const result = res.result as unknown as { success?: boolean; department?: RoomsPageDepartment };

      if (result?.success && result.department) {
        this.setData({ departmentName: result.department.name });
      }
    } catch (err) {
      console.error('加载部门信息失败', err);
    }
  },

  // 加载办公室列表
  async loadRooms() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageRooms',
        data: {
          action: 'list',
          departmentId: this.data.departmentId
        }
      });

      const result = res.result as unknown as { success?: boolean; rooms?: RoomsPageRoom[] };

      if (result?.success) {
        this.setData({ rooms: Array.isArray(result.rooms) ? result.rooms : [] });
      }
    } catch (err) {
      console.error('加载办公室失败', err);
      wx.showToast({ title: '加载失败', icon: 'error' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 显示添加弹窗
  showAddDialog() {
    this.setData({
      showModal: true,
      isEdit: false,
      editId: '',
      formName: '',
      formManager: '',
      formOrder: String(this.data.rooms.length + 1)
    });
  },

  // 显示编辑弹窗
  showEditDialog(e: { currentTarget: { dataset: { id?: string; name?: string; manager?: string; order?: string | number } } }) {
    const { id, name, manager, order } = e.currentTarget.dataset;
    this.setData({
      showModal: true,
      isEdit: true,
      editId: id || '',
      formName: name || '',
      formManager: manager || '',
      formOrder: String(order ?? '')
    });
  },

  // 关闭弹窗
  closeModal() {
    this.setData({ showModal: false });
  },

  // 输入办公室名称
  onNameInput(e: { detail: { value: string } }) {
    this.setData({ formName: e.detail.value });
  },

  // 输入负责人
  onManagerInput(e: { detail: { value: string } }) {
    this.setData({ formManager: e.detail.value });
  },

  // 输入排序
  onOrderInput(e: { detail: { value: string } }) {
    this.setData({ formOrder: e.detail.value });
  },

  // 提交表单
  async submitForm() {
    const { isEdit, editId, formName, formManager, formOrder, departmentId } = this.data;

    if (!formName.trim()) {
      wx.showToast({ title: '请输入办公室名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: isEdit ? '更新中...' : '添加中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageRooms',
        data: {
          action: isEdit ? 'update' : 'add',
          roomId: editId,
          departmentId: departmentId,
          room: {
            name: formName.trim(),
            manager: formManager.trim(),
            order: parseInt(formOrder) || 1
          }
        }
      });

      const result = res.result as unknown as { success?: boolean; message?: string };

      wx.hideLoading();

      if (result?.success) {
        wx.showToast({ title: isEdit ? '更新成功' : '添加成功', icon: 'success' });
        this.setData({ showModal: false });
        this.loadRooms();
      } else {
        wx.showToast({ title: result?.message || '操作失败', icon: 'error' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'error' });
    }
  },

  // 删除办公室
  deleteRoom(e: { currentTarget: { dataset: { id?: string; name?: string } } }) {
    const { id, name } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除办公室"${name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            const result = await wx.cloud.callFunction({
              name: 'manageRooms',
              data: {
                action: 'delete',
                roomId: id
              }
            });

            const callResult = result.result as unknown as { success?: boolean; message?: string };

            wx.hideLoading();

            if (callResult?.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.loadRooms();
            } else {
              wx.showToast({ title: callResult?.message || '删除失败', icon: 'error' });
            }
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'error' });
          }
        }
      }
    });
  }
});
