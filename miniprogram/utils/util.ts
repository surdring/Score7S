// 工具函数库

/**
 * 格式化日期
 */
export function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day);
}

/**
 * 格式化分数显示
 */
export function formatScore(score: number): string {
  return String(score);
}

/**
 * 获取分数对应的颜色类名
 */
export function getScoreColor(score: number): string {
  if (score >= 8) return 'success';
  if (score >= 6) return 'warning';
  return 'danger';
}

/**
 * 防抖函数
 */
export function debounce<TThis, TArgs extends unknown[]>(
  fn: (this: TThis, ...args: TArgs) => void,
  delay: number = 300
): (this: TThis, ...args: TArgs) => void {
  let timer: number | null = null;
  return function (this: TThis, ...args: TArgs) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay) as unknown as number;
  };
}

/**
 * 节流函数
 */
export function throttle<TThis, TArgs extends unknown[]>(
  fn: (this: TThis, ...args: TArgs) => void,
  delay: number = 300
): (this: TThis, ...args: TArgs) => void {
  let lastTime = 0;
  return function (this: TThis, ...args: TArgs) {
    const now = Date.now();
    if (now - lastTime >= delay) {
      fn.apply(this, args);
      lastTime = now;
    }
  };
}

/**
 * 深拷贝
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
