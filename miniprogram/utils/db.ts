// 云数据库操作封装

/**
 * 初始化数据库
 */
const db = wx.cloud.database();

type DbErrorCode = 'DB_GET_FAILED' | 'DB_UPDATE_FAILED' | 'DB_REMOVE_FAILED';

export type DbResult<T> =
  | { success: true; data: T }
  | { success: false; code: DbErrorCode; message: string };

/**
 * 请求队列类 - 控制并发请求数，避免触发云开发频率限制
 */
class RequestQueue {
  private queue: Array<{
    request: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];
  private processing = 0;
  private maxConcurrent = 5; // 最大并发数

  /**
   * 添加请求到队列
   */
  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        request: request as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject: reject as (reason: unknown) => void,
      });
      this.process();
    });
  }

  /**
   * 处理队列中的请求
   */
  private async process() {
    // 如果已达到最大并发数或队列为空，则返回
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.processing++;
    const item = this.queue.shift()!;

    try {
      const result = await item.request();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.processing--;
      // 处理下一个请求
      this.process();
    }
  }

  /**
   * 获取当前队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 获取当前处理中的请求数
   */
  getProcessingCount(): number {
    return this.processing;
  }
}

// 全局请求队列实例
const requestQueue = new RequestQueue();

/**
 * 使用请求队列执行数据库操作
 */
export function withQueue<T>(request: () => Promise<T>): Promise<T> {
  return requestQueue.add(request);
}

/**
 * 获取集合引用
 */
export function collection(name: string) {
  return db.collection(name);
}

/**
 * 查询所有记录
 */
export async function getAll<T>(collectionName: string, options: {
  where?: Record<string, unknown>;
  orderBy?: { field: string; order: 'asc' | 'desc' };
  limit?: number;
} = {}): Promise<T[]> {
  let query = db.collection(collectionName);
  
  if (options.where) {
    query = query.where(options.where) as unknown as typeof query;
  }
  
  if (options.orderBy) {
    query = query.orderBy(options.orderBy.field, options.orderBy.order) as unknown as typeof query;
  }
  
  if (options.limit) {
    query = query.limit(options.limit) as unknown as typeof query;
  }
  
  const res = await query.get();
  return res.data as T[];
}

/**
 * 根据ID查询单条记录
 */
export async function getById<T>(collectionName: string, id: string): Promise<T | null> {
  try {
    const res = await db.collection(collectionName).doc(id).get();
    return res.data as T;
  } catch (err) {
    return null;
  }
}

export async function getByIdResult<T>(collectionName: string, id: string): Promise<DbResult<T>> {
  try {
    const res = await db.collection(collectionName).doc(id).get();
    return { success: true, data: res.data as T };
  } catch (err) {
    return {
      success: false,
      code: 'DB_GET_FAILED',
      message: err && (err as { message?: string }).message ? (err as { message?: string }).message! : '查询失败'
    };
  }
}

/**
 * 添加记录
 */
export async function add<T>(collectionName: string, data: Omit<T, '_id'>): Promise<string> {
  const res = await db.collection(collectionName).add({
    data: {
      ...data,
      createdAt: db.serverDate(),
    }
  });
  return res._id as unknown as string;
}

/**
 * 更新记录
 */
export async function update(
  collectionName: string,
  id: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    await db.collection(collectionName).doc(id).update({
      data: {
        ...data,
        updatedAt: db.serverDate(),
      }
    });
    return true;
  } catch (err) {
    return false;
  }
}

export async function updateResult(
  collectionName: string,
  id: string,
  data: Record<string, unknown>
): Promise<DbResult<true>> {
  try {
    await db.collection(collectionName).doc(id).update({
      data: {
        ...data,
        updatedAt: db.serverDate(),
      }
    });
    return { success: true, data: true };
  } catch (err) {
    return {
      success: false,
      code: 'DB_UPDATE_FAILED',
      message: err && (err as { message?: string }).message ? (err as { message?: string }).message! : '更新失败'
    };
  }
}

/**
 * 删除记录
 */
export async function remove(collectionName: string, id: string): Promise<boolean> {
  try {
    await db.collection(collectionName).doc(id).remove();
    return true;
  } catch (err) {
    return false;
  }
}

export async function removeResult(collectionName: string, id: string): Promise<DbResult<true>> {
  try {
    await db.collection(collectionName).doc(id).remove();
    return { success: true, data: true };
  } catch (err) {
    return {
      success: false,
      code: 'DB_REMOVE_FAILED',
      message: err && (err as { message?: string }).message ? (err as { message?: string }).message! : '删除失败'
    };
  }
}

/**
 * 统计记录数
 */
export async function count(collectionName: string, where?: Record<string, unknown>): Promise<number> {
  let query = db.collection(collectionName);
  if (where) {
    query = query.where(where) as unknown as typeof query;
  }
  const res = await query.count();
  return res.total;
}
