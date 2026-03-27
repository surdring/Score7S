// app.ts - 小程序入口文件
App({
  globalData: {
    userInfo: null,
    hasLogin: false,
    cloudEnvId: null, // 云开发环境ID，在onLaunch中初始化
    adminAuthed: false, // 管理入口密码验证状态（会话内有效）
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        // env 参数说明：
        //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
        //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
        //   如不填则使用默认环境（第一个创建的环境）
        env: 'cloudbase-2g1teb5c0c67c6d5', // 云开发环境ID
        traceUser: true,
      });
    }

    // 检查登录状态
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.globalData.userInfo = userInfo;
      this.globalData.hasLogin = true;
    }
  },

  // 用户登录
  async doLogin(): Promise<boolean> {
    try {
      // 获取用户信息
      const { userInfo } = await wx.getUserProfile({
        desc: '用于完善用户资料',
      });
      
      this.globalData.userInfo = userInfo;
      this.globalData.hasLogin = true;
      wx.setStorageSync('userInfo', userInfo);
      
      return true;
    } catch (err) {
      console.error('登录失败', err);
      return false;
    }
  },

  // 退出登录
  logout() {
    this.globalData.userInfo = null;
    this.globalData.hasLogin = false;
    wx.removeStorageSync('userInfo');
  },
});
