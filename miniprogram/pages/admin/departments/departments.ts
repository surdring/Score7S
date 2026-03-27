// 部门管理页面
const DEPARTMENTS_DATA = [
  { name: '经营管控中心', rooms: ['经营管控中心（南面）1楼', '经营管控中心（北面）2楼'] },
  { name: '供应二部', rooms: ['原料科（南屋）（1楼）', '原料科（北屋）（1楼）', '钢后科（1楼）'] },
  { name: '供应一部', rooms: ['业务员大办公室（2楼）', '业务员小办公室（2楼）'] },
  { name: '销售部', rooms: ['业务员办公室（3楼）', '合同管理员（3楼）', '副产品（3楼）'] },
  { name: '人力资源部', rooms: ['招聘配置科（3楼）', '薪酬科（3楼）'] },
  { name: '企管部', rooms: ['办公室（靠北）（4楼）'] },
  { name: '审计监察部', rooms: ['办公室（中间与靠南）（4楼）'] },
  { name: '财务部', rooms: ['资产科（4楼）', '结算中心（4楼）', '成本科（5楼)'] },
  { name: '法务部', rooms: ['办公室（5楼）'] },
  { name: '总经办', rooms: ['办公室（5楼）'] },
  { name: '监察部', rooms: ['办公室（5楼）'] },
  { name: '外矿部', rooms: ['办公室(5楼）'] },
  { name: '财务部（工程楼）', rooms: ['三级账（工程部2楼）', '质计部-磅单计量（工程部2楼）', '资产科-合同租（工程部2楼）', '经营核算科北屋（工程部3楼）'] },
  { name: '预算部（工程楼）', rooms: ['预算1（工程部2楼）', '预算2（工程部2楼）', '预算3（工程部2楼）'] },
  { name: '公司办公室（工程楼）', rooms: ['办公室（工程部2楼）', '司机办公室（工程部2楼）', '资料室（工程部3楼东）', '文印室（工程楼1楼）'] },
  { name: '工程审计', rooms: ['工程楼(3楼)'] },
  { name: '工程部', rooms: ['工程部办公室（工程楼2楼）'] },
];

Page({
  data: {
    loading: false,
    departments: [] as any[],
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
      }) as any;

      if (res.result?.success) {
        const departments = res.result.departments || [];
        
        // 加载每个部门的办公室数量
        const roomsRes = await wx.cloud.callFunction({
          name: 'manageRooms',
          data: { action: 'listAll' }
        }) as any;
        
        const rooms = roomsRes.result?.rooms || [];
        const roomCountMap = new Map<string, number>();
        rooms.forEach((r: any) => {
          const count = roomCountMap.get(r.departmentId) || 0;
          roomCountMap.set(r.departmentId, count + 1);
        });
        
        const departmentsWithCount = departments.map((d: any) => ({
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
      content: '将从本地配置导入17个部门及其办公室，是否继续？',
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
            }) as any;

            if (!deptRes.result?.success) {
              throw new Error(deptRes.result?.message || '导入部门失败');
            }

            // 获取部门列表以获取ID
            const listRes = await wx.cloud.callFunction({
              name: 'manageDepartments',
              data: { action: 'list' }
            }) as any;

            const deptMap = new Map((listRes.result?.departments || []).map((d: any) => [d.name, d._id]));

            // 导入办公室
            const roomsData: any[] = [];
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
          } catch (err: any) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '导入失败', icon: 'error' });
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
  showEditDialog(e: any) {
    const { id, name, order } = e.currentTarget.dataset;
    this.setData({
      showModal: true,
      isEdit: true,
      editId: id,
      formName: name,
      formOrder: String(order)
    });
  },

  // 关闭弹窗
  closeModal() {
    this.setData({ showModal: false });
  },

  // 输入部门名称
  onNameInput(e: any) {
    this.setData({ formName: e.detail.value });
  },

  // 输入排序
  onOrderInput(e: any) {
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
      }) as any;

      wx.hideLoading();

      if (res.result?.success) {
        wx.showToast({ title: isEdit ? '更新成功' : '添加成功', icon: 'success' });
        this.setData({ showModal: false });
        this.loadDepartments();
      } else {
        wx.showToast({ title: res.result?.message || '操作失败', icon: 'error' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'error' });
    }
  },

  // 删除部门
  deleteDept(e: any) {
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
            }) as any;

            wx.hideLoading();

            if (result.result?.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.loadDepartments();
            } else {
              wx.showToast({ title: result.result?.message || '删除失败', icon: 'error' });
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
  viewRooms(e: any) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/rooms/rooms?departmentId=${id}`
    });
  }
});
