// 云数据库操作封装

/**
 * 初始化数据库
 */
const db = wx.cloud.database();

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
  where?: any;
  orderBy?: { field: string; order: 'asc' | 'desc' };
  limit?: number;
} = {}): Promise<T[]> {
  let query = db.collection(collectionName);
  
  if (options.where) {
    query = query.where(options.where) as any;
  }
  
  if (options.orderBy) {
    query = query.orderBy(options.orderBy.field, options.orderBy.order) as any;
  }
  
  if (options.limit) {
    query = query.limit(options.limit) as any;
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
export async function update(collectionName: string, id: string, data: any): Promise<boolean> {
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

/**
 * 统计记录数
 */
export async function count(collectionName: string, where?: any): Promise<number> {
  let query = db.collection(collectionName);
  if (where) {
    query = query.where(where) as any;
  }
  const res = await query.count();
  return res.total;
}
