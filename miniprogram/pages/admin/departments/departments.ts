// 部门管理页面
const DEPARTMENTS_DATA = [
  { name: '经营管控中心', rooms: ['经营管控中心-行政办公楼1楼', '经营管控中心-行政办公楼2楼'] },
  { name: '供应二部', rooms: ['钢后科-行政办公楼1楼', '燃料科2-行政办公楼1楼', '燃料科3-行政办公楼1楼', '辅料科-行政办公楼2楼第一排和第二排'] },
  { name: '供应一部', rooms: ['业务员大办公室-行政办公楼2楼第三排和第四排', '业务员小办公室-行政办公楼2楼'] },
  { name: '销售部', rooms: ['业务员办公室-行政办公楼3楼', '合同管理员-行政办公楼3楼', '销售副产品-行政办公楼3楼和精益推进办公室在一间'] },
  { name: '人力资源部', rooms: ['招聘配置科-行政办公楼3楼', '薪酬科-行政办公楼3楼'] },
  { name: '企管部', rooms: ['办公室-行政办公楼4楼最北边', '精益推进办公室-行政办公楼3楼和销售副产品在一间'] },
  { name: '审计监察部', rooms: ['办公室-行政办公楼4楼中间和最靠南位置'] },
  { name: '财务部', rooms: ['资产科/财务二-行政办公楼4楼', '结算中心/财务三-行政办公楼4楼', '成本科/财务办公室-行政办公楼5楼'] },
  { name: '法务部', rooms: ['办公室-行政办公楼5楼'] },
  { name: '总经办', rooms: ['办公室-行政办公楼5楼'] },
  { name: '监察部', rooms: ['办公室-行政办公楼5楼'] },
  { name: '外矿部', rooms: ['办公室-行政办公楼5楼'] },
  { name: '财务部', rooms: ['三级账2-工程部办公楼2楼', '计量科理票室-工程部办公楼2楼', '票据审核室-工程部办公楼2楼', '经营核算科-工程部办公楼3楼'] },
  { name: '预算部', rooms: ['预算1-工程部办公楼2楼', '预算2-工程部办公楼2楼', '预算3-工程部办公楼2楼'] },
  { name: '公司办公室', rooms: ['文印室-工程部办公楼1楼', '办公室-工程部办公楼2楼', '资料室-工程部办公楼3楼'] },
  { name: '工程审计', rooms: ['科长办公室-工程部办公楼3楼', '科员办公室-工程部办公楼3楼'] },
];

interface DepartmentsPageDepartment {
  _id: string;
  name: string;
  order?: number;
  roomCount?: number;
}

interface DepartmentsPageRoom {
  _id?: string;
  departmentId: string;
  name: string;
  order?: number;
  manager?: string;
}

Page({
  data: {
    loading: false,
    departments: [] as DepartmentsPageDepartment[],
    showModal: false,
    isEdit: false,
    editId: '',
    formName: '',
    formOrder: '',
  },

  onLoad() {
    this.loadDepartments();
  },

  onShow() {
    this.loadDepartments();
  },

  // 加载部门列表
  async loadDepartments() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDepartments',
        data: { action: 'list' }
      });

      const result = res.result as unknown as { success?: boolean; departments?: DepartmentsPageDepartment[] };

      if (result?.success) {
        const departments = Array.isArray(result.departments) ? result.departments : [];
        
        // 加载每个部门的办公室数量
        const roomsRes = await wx.cloud.callFunction({
          name: 'manageRooms',
          data: { action: 'listAll' }
        });

        const roomsResult = roomsRes.result as unknown as { rooms?: DepartmentsPageRoom[] };
        
        const rooms = Array.isArray(roomsResult.rooms) ? roomsResult.rooms : [];
        const roomCountMap = new Map<string, number>();
        rooms.forEach((r: DepartmentsPageRoom) => {
          const count = roomCountMap.get(r.departmentId) || 0;
          roomCountMap.set(r.departmentId, count + 1);
        });
        
        const departmentsWithCount = departments.map((d: DepartmentsPageDepartment) => ({
          ...d,
          roomCount: roomCountMap.get(d._id) || 0
        }));
        
        this.setData({ departments: departmentsWithCount });
      }
    } catch (err) {
      console.error('加载部门失败', err);
      wx.showToast({ title: '加载失败', icon: 'error' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 从本地数据初始化
  async initFromLocal() {
    wx.showModal({
      title: '确认初始化',
      content: '将从本地配置导入16个部门35个办公室，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '导入中...' });
          try {
            // 导入部门
            const deptRes = await wx.cloud.callFunction({
              name: 'manageDepartments',
              data: {
                action: 'import',
                departments: DEPARTMENTS_DATA.map((d, i) => ({
                  name: d.name,
                  order: i + 1
                }))
              }
            });

            const deptResult = deptRes.result as unknown as { success?: boolean; message?: string };

            if (!deptResult?.success) {
              throw new Error(deptResult?.message || '导入部门失败');
            }

            // 获取部门列表以获取ID
            const listRes = await wx.cloud.callFunction({
              name: 'manageDepartments',
              data: { action: 'list' }
            });

            const listResult = listRes.result as unknown as { departments?: DepartmentsPageDepartment[] };
            const deptList = Array.isArray(listResult.departments) ? listResult.departments : [];
            const deptMap = new Map(deptList.map((d: DepartmentsPageDepartment) => [d.name, d._id]));

            // 导入办公室
            const roomsData: DepartmentsPageRoom[] = [];
            DEPARTMENTS_DATA.forEach((dept, deptIndex) => {
              const deptId = deptMap.get(dept.name);
              if (deptId) {
                dept.rooms.forEach((room, roomIndex) => {
                  roomsData.push({
                    departmentId: deptId,
                    name: room,
                    order: roomIndex + 1,
                    manager: ''
                  });
                });
              }
            });

            if (roomsData.length > 0) {
              await wx.cloud.callFunction({
                name: 'manageRooms',
                data: {
                  action: 'batchImport',
                  rooms: roomsData
                }
              });
            }

            wx.hideLoading();
            wx.showToast({ title: '导入成功', icon: 'success' });
            this.loadDepartments();
          } catch (err: unknown) {
            wx.hideLoading();
            const message = err && (err as { message?: string }).message ? (err as { message?: string }).message! : '导入失败';
            wx.showToast({ title: message, icon: 'error' });
          }
        }
      }
    });
  },

  // 显示添加弹窗
  showAddDialog() {
    this.setData({
      showModal: true,
      isEdit: false,
      editId: '',
      formName: '',
      formOrder: String(this.data.departments.length + 1)
    });
  },

  // 显示编辑弹窗
  showEditDialog(e: { currentTarget: { dataset: { id?: string; name?: string; order?: string | number } } }) {
    const { id, name, order } = e.currentTarget.dataset;
    this.setData({
      showModal: true,
      isEdit: true,
      editId: id || '',
      formName: name || '',
      formOrder: String(order ?? '')
    });
  },

  // 关闭弹窗
  closeModal() {
    this.setData({ showModal: false });
  },

  // 输入部门名称
  onNameInput(e: { detail: { value: string } }) {
    this.setData({ formName: e.detail.value });
  },

  // 输入排序
  onOrderInput(e: { detail: { value: string } }) {
    this.setData({ formOrder: e.detail.value });
  },

  // 提交表单
  async submitForm() {
    const { isEdit, editId, formName, formOrder } = this.data;

    if (!formName.trim()) {
      wx.showToast({ title: '请输入部门名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: isEdit ? '更新中...' : '添加中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDepartments',
        data: {
          action: isEdit ? 'update' : 'add',
          departmentId: editId,
          department: {
            name: formName.trim(),
            order: parseInt(formOrder) || 1
          }
        }
      });

      const result = res.result as unknown as { success?: boolean; message?: string };

      wx.hideLoading();

      if (result?.success) {
        wx.showToast({ title: isEdit ? '更新成功' : '添加成功', icon: 'success' });
        this.setData({ showModal: false });
        this.loadDepartments();
      } else {
        wx.showToast({ title: result?.message || '操作失败', icon: 'error' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'error' });
    }
  },

  // 删除部门
  deleteDept(e: { currentTarget: { dataset: { id?: string; name?: string } } }) {
    const { id, name } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除部门"${name}"吗？该部门下的所有办公室也会被删除。`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            const result = await wx.cloud.callFunction({
              name: 'manageDepartments',
              data: {
                action: 'delete',
                departmentId: id
              }
            });

            const callResult = result.result as unknown as { success?: boolean; message?: string };

            wx.hideLoading();

            if (callResult?.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.loadDepartments();
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
  },

  // 查看部门下的办公室
  viewRooms(e: { currentTarget: { dataset: { id?: string } } }) {
    const { id: deptId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/rooms/rooms?departmentId=${deptId}`
    });
  },

  // 清空评分数据（仅删除inspections集合，保留部门和办公室）
  async clearInspectionsOnly() {
    wx.showModal({
      title: '⚠️ 确认清空',
      content: '将删除所有评分记录（inspections），部门和办公室数据将保留。此操作不可恢复！',
      confirmColor: '#ff9800',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在清空...', mask: true });
          try {
            const result = await wx.cloud.callFunction({
              name: 'clearAllData',
              data: { type: 'inspections' }
            });

            const callResult = result.result as unknown as {
              success?: boolean;
              message?: string;
              data?: { inspections?: number };
            };

            wx.hideLoading();

            if (callResult?.success && callResult.data) {
              const inspections = callResult.data.inspections || 0;
              wx.showModal({
                title: '清空完成',
                content: `已删除 ${inspections} 条评分记录`,
                showCancel: false
              });
            } else {
              throw new Error(callResult?.message || '清空失败');
            }
          } catch (err: unknown) {
            wx.hideLoading();
            const message = err && (err as { message?: string }).message ? (err as { message?: string }).message! : '清空失败';
            wx.showToast({ title: message, icon: 'error' });
          }
        }
      }
    });
  },

  // 清理云端所有数据
  async clearAllCloudData() {
    wx.showModal({
      title: '⚠️ 危险操作',
      content: '将删除云上所有部门、办公室和评分数据，不可恢复！确定继续？',
      confirmColor: '#ff4444',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在清理...', mask: true });
          try {
            const result = await wx.cloud.callFunction({
              name: 'clearAllData',
              data: { type: 'all' }
            });

            const callResult = result.result as unknown as {
              success?: boolean;
              message?: string;
              data?: { departments?: number; rooms?: number; inspections?: number };
            };

            wx.hideLoading();

            if (callResult?.success && callResult.data) {
              const departments = callResult.data.departments || 0;
              const rooms = callResult.data.rooms || 0;
              const inspections = callResult.data.inspections || 0;
              wx.showModal({
                title: '清理完成',
                content: `已删除：\n• ${departments} 个部门\n• ${rooms} 个办公室\n• ${inspections} 条评分记录\n\n请点击"从本地配置初始化"导入新数据。`,
                showCancel: false,
                success: () => {
                  this.loadDepartments();
                }
              });
            } else {
              throw new Error(callResult?.message || '清理失败');
            }
          } catch (err: unknown) {
            wx.hideLoading();
            const message = err && (err as { message?: string }).message ? (err as { message?: string }).message! : '清理失败';
            wx.showToast({ title: message, icon: 'error' });
          }
        }
      }
    });
  }
});
