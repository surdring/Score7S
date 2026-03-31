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
      data?: unknown;
      success?: (res: unknown) => void;
      fail?: (res: unknown) => void;
      complete?: () => void;
    }): Promise<{ result: unknown } & Record<string, unknown>>;
    database(): CloudDatabase;
    uploadFile(option: {
      cloudPath: string;
      filePath: string;
      success?: (res: { fileID: string }) => void;
      fail?: (res: unknown) => void;
    }): Promise<{ fileID: string }>;
    downloadFile(option: {
      fileID: string;
      success?: (res: { tempFilePath: string }) => void;
      fail?: (res: unknown) => void;
    }): Promise<{ tempFilePath: string }>;
    deleteFile(option: {
      fileList: string[];
      success?: (res: unknown) => void;
      fail?: (res: unknown) => void;
    }): Promise<unknown>;
    getTempFileURL(option: {
      fileList: string[];
      success?: (res: { fileList: { fileID: string; tempFileURL: string }[] }) => void;
      fail?: (res: unknown) => void;
    }): Promise<{ fileList: { fileID: string; tempFileURL: string }[] }>;
  }

  interface CloudDatabaseCommand {
    in(list: unknown[]): unknown;
  }

  interface CloudDatabase {
    collection(name: string): CloudCollection;
    command: CloudDatabaseCommand;
    serverDate(): unknown;
  }

  interface CloudCollection {
    where(condition: Record<string, unknown>): CloudCollection;
    field(fields: Record<string, boolean>): CloudCollection;
    orderBy(field: string, order: 'asc' | 'desc'): CloudCollection;
    skip(n: number): CloudCollection;
    limit(n: number): CloudCollection;
    get(): Promise<{ data: Array<Record<string, unknown>> }>;
    add(option: { data: Record<string, unknown> }): Promise<{ _id: string }>;
    doc(id: string): CloudDocument;
    update(option: { data: Record<string, unknown> }): Promise<unknown>;
    remove(): Promise<unknown>;
    count(): Promise<{ total: number }>;
  }

  interface CloudDocument {
    get(): Promise<{ data: Record<string, unknown> }>;
    update(option: { data: Record<string, unknown> }): Promise<unknown>;
    remove(): Promise<unknown>;
  }

  interface Wx {
    cloud: Cloud;
    showSaveFileDialog?: (option: {
      title?: string;
      fileName?: string;
      success?: (res: { filePath?: string; savedFilePath?: string } & Record<string, unknown>) => void;
      fail?: (res: unknown) => void;
      complete?: () => void;
    }) => void;
    getUserProfile(option: GetUserProfileOption): Promise<{ userInfo: UserInfo }>;
    getStorageSync(key: string): unknown;
    setStorageSync(key: string, data: unknown): void;
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
    navigateTo(option: { url: string; success?: () => void; fail?: (res: unknown) => void }): void;
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
      fail?: (res: unknown) => void;
    }): Promise<{ tempFilePaths: string[]; tempFiles: { path: string; size: number }[] }>;
    previewImage(option: { urls: string[]; current?: string }): void;
    saveFile(option: { tempFilePath: string; success?: (res: { savedFilePath: string }) => void }): Promise<{ savedFilePath: string }>;
    openDocument(option: {
      filePath: string;
      fileType?: 'doc' | 'docx' | 'xls' | 'xlsx' | 'ppt' | 'pptx' | 'pdf';
      success?: () => void;
      fail?: (res: unknown) => void;
    }): void;
    getSystemInfo(): { safeArea: { bottom: number } };
    getSystemInfoSync(): { safeArea: { bottom: number }; screenHeight: number; screenWidth: number };
  }

  interface SelectorQuery {
    select(selector: string): NodesRef;
    selectAll(selector: string): NodesRef;
    selectViewport(): NodesRef;
    exec(callback: (res: unknown[]) => void): SelectorQuery;
  }

  interface NodesRef {
    boundingClientRect(callback?: (res: unknown) => void): SelectorQuery;
    scrollOffset(callback?: (res: unknown) => void): SelectorQuery;
    fields(fields: Record<string, unknown>, callback?: (res: unknown) => void): SelectorQuery;
  }
}

type MiniProgramSetData<TData extends Record<string, unknown>> = (
  data: Partial<TData>,
  callback?: () => void
) => void;

type MiniProgramPageInstance<TData extends Record<string, unknown>, TMethods extends Record<string, unknown>> = {
  data: TData;
  setData: MiniProgramSetData<TData>;
  selectComponent: (selector: string) => unknown;
  createSelectorQuery: () => WechatMiniprogram.SelectorQuery;
} & TMethods;

declare function App<T extends Record<string, unknown>>(options: T & ThisType<T>): void;

declare function Page<
  TData extends Record<string, unknown>,
  TMethods extends Record<string, unknown>
>(
  options: {
    data: TData;
    onLoad?: (options: Record<string, string | undefined>) => void;
    onShow?: () => void;
    onPullDownRefresh?: () => void;
    onReachBottom?: () => void;
    onShareAppMessage?: () => unknown;
  } &
    TMethods &
    ThisType<MiniProgramPageInstance<TData, TMethods>>
): void;

declare function Component<
  TData extends Record<string, unknown>,
  TMethods extends Record<string, unknown>
>(
  options: {
    properties?: Record<string, unknown>;
    data?: TData;
    lifetimes?: Record<string, unknown>;
    methods?: TMethods & ThisType<{ data: TData } & TMethods>;
  } & ThisType<{ data: TData } & TMethods>
): void;

declare function getApp<T = unknown>(): T;
declare function getCurrentPages<T = unknown>(): T[];
