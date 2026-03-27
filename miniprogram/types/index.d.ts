// 微信小程序 API 类型声明

declare const wx: WechatMiniprogram.Wx;

declare namespace WechatMiniprogram {
  interface UserInfo {
    nickName: string;
    avatarUrl: string;
    gender: number;
    city: string;
    province: string;
    country: string;
    language: string;
  }

  interface GetUserProfileOption {
    desc: string;
    success?: (res: { userInfo: UserInfo }) => void;
    fail?: (res: { errMsg: string }) => void;
    complete?: () => void;
  }

  interface CloudInitOption {
    env?: string;
    traceUser?: boolean;
  }

  interface Cloud {
    init(option?: CloudInitOption): void;
    callFunction(option: {
      name: string;
      data?: any;
      success?: (res: any) => void;
      fail?: (res: any) => void;
      complete?: () => void;
    }): Promise<any>;
    uploadFile(option: {
      cloudPath: string;
      filePath: string;
      success?: (res: { fileID: string }) => void;
      fail?: (res: any) => void;
    }): Promise<{ fileID: string }>;
    downloadFile(option: {
      fileID: string;
      success?: (res: { tempFilePath: string }) => void;
      fail?: (res: any) => void;
    }): Promise<{ tempFilePath: string }>;
    deleteFile(option: {
      fileList: string[];
      success?: (res: any) => void;
      fail?: (res: any) => void;
    }): Promise<any>;
    getTempFileURL(option: {
      fileList: string[];
      success?: (res: { fileList: { fileID: string; tempFileURL: string }[] }) => void;
      fail?: (res: any) => void;
    }): Promise<{ fileList: { fileID: string; tempFileURL: string }[] }>;
  }

  interface Wx {
    cloud: Cloud;
    getUserProfile(option: GetUserProfileOption): Promise<{ userInfo: UserInfo }>;
    getStorageSync(key: string): any;
    setStorageSync(key: string, data: any): void;
    removeStorageSync(key: string): void;
    showModal(option: {
      title?: string;
      content: string;
      showCancel?: boolean;
      cancelText?: string;
      confirmText?: string;
      success?: (res: { confirm: boolean; cancel: boolean }) => void;
    }): Promise<{ confirm: boolean; cancel: boolean }>;
    showToast(option: {
      title: string;
      icon?: 'success' | 'loading' | 'error' | 'none';
      duration?: number;
      mask?: boolean;
    }): void;
    showLoading(option: { title: string; mask?: boolean }): void;
    hideLoading(): void;
    navigateTo(option: { url: string; success?: () => void; fail?: (res: any) => void }): void;
    navigateBack(option?: { delta?: number }): void;
    redirectTo(option: { url: string }): void;
    reLaunch(option: { url: string }): void;
    switchTab(option: { url: string }): void;
    pageScrollTo(option: { scrollTop: number; duration?: number }): void;
    createSelectorQuery(): SelectorQuery;
    chooseImage(option: {
      count?: number;
      sizeType?: ('original' | 'compressed')[];
      sourceType?: ('album' | 'camera')[];
      success?: (res: { tempFilePaths: string[]; tempFiles: { path: string; size: number }[] }) => void;
      fail?: (res: any) => void;
    }): Promise<{ tempFilePaths: string[]; tempFiles: { path: string; size: number }[] }>;
    previewImage(option: { urls: string[]; current?: string }): void;
    saveFile(option: { tempFilePath: string; success?: (res: { savedFilePath: string }) => void }): Promise<{ savedFilePath: string }>;
    openDocument(option: {
      filePath: string;
      fileType?: 'doc' | 'docx' | 'xls' | 'xlsx' | 'ppt' | 'pptx' | 'pdf';
      success?: () => void;
      fail?: (res: any) => void;
    }): void;
    getSystemInfo(): { safeArea: { bottom: number } };
    getSystemInfoSync(): { safeArea: { bottom: number }; screenHeight: number; screenWidth: number };
  }

  interface SelectorQuery {
    select(selector: string): NodesRef;
    selectAll(selector: string): NodesRef;
    selectViewport(): NodesRef;
    exec(callback: (res: any[]) => void): SelectorQuery;
  }

  interface NodesRef {
    boundingClientRect(callback?: (res: any) => void): SelectorQuery;
    scrollOffset(callback?: (res: any) => void): SelectorQuery;
    fields(fields: any, callback?: (res: any) => void): SelectorQuery;
  }
}

declare function App(options: any): void;
declare function Page(options: any): void;
declare function Component(options: any): void;
declare function getApp(): any;
declare function getCurrentPages(): any[];
