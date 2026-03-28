# 提取全局常量计划（前端）

将前端页面中重复定义的常量提取到独立的常量文件中，云函数保持现状。

---

## 发现的重复常量（前端）

### 1. 评分项名称数组 `SCORING_ITEMS`
**出现位置：**
- `miniprogram/pages/score/score.ts:5`
- `miniprogram/pages/analytics/analytics.ts:13`

**值：** `['地面', '桌面摆放', '文件资料', '电器设备', '办公椅', '窗台', '整体印象']`

---

### 2. 评分项最高分配置 `SCORING_MAX_SCORES`
**出现位置：**
- `miniprogram/pages/score/score.ts:8-16`
- `miniprogram/pages/home/home.ts:19-27`
- `miniprogram/pages/history/history.ts:16-24`

**值：**
```typescript
{
  '地面': 20,
  '桌面摆放': 20,
  '文件资料': 10,
  '电器设备': 20,
  '办公椅': 10,
  '窗台': 10,
  '整体印象': 10,
}
```

---

### 3. 评分标准描述 `SCORING_STANDARDS`
**出现位置：**
- `miniprogram/pages/score/score.ts:41-49`

---

### 4. 快捷标签配置 `QUICK_TAGS`
**出现位置：**
- `miniprogram/pages/score/score.ts:25-38`

---

## 解决方案

### 实施步骤

1. **创建常量文件** `miniprogram/constants/scoring.ts`
   ```typescript
   // 评分项名称
   export const SCORING_ITEMS = ['地面', '桌面摆放', '文件资料', '电器设备', '办公椅', '窗台', '整体印象'];
   
   // 评分项最高分
   export const SCORING_MAX_SCORES: Record<string, number> = {
     '地面': 20,
     '桌面摆放': 20,
     '文件资料': 10,
     '电器设备': 20,
     '办公椅': 10,
     '窗台': 10,
     '整体印象': 10,
   };
   
   // 评分标准描述
   export const SCORING_STANDARDS: Record<string, string> = {
     '地面': '地面干净整洁，无垃圾、污渍、水渍',
     '桌面摆放': '物品摆放整齐，无私人物品，无杂物堆积',
     '文件资料': '文件资料分类明确，标识清晰，易于查找',
     '电器设备': '电器设备摆放整齐，无积尘，电线不杂乱',
     '办公椅': '办公椅摆放整齐，无损坏，无污渍',
     '窗台': '窗台无灰尘、无杂物摆放，玻璃明亮',
     '整体印象': '办公室整体整洁有序，环境优美',
   };
   
   // 低分阈值（最高分的40%）
   export const SCORING_LOW_THRESHOLDS: Record<string, number> = {};
   SCORING_ITEMS.forEach(item => {
     SCORING_LOW_THRESHOLDS[item] = Math.floor(SCORING_MAX_SCORES[item] * 0.4);
   });
   
   // 快捷标签配置
   export const QUICK_TAGS: Record<number, Array<{ label: string; value: number }>> = {
     20: [
       { label: '满分', value: 20 },
       { label: '16良好', value: 16 },
       { label: '12一般', value: 12 },
       { label: '8较差', value: 8 },
     ],
     10: [
       { label: '满分', value: 10 },
       { label: '8良好', value: 8 },
       { label: '6一般', value: 6 },
       { label: '4较差', value: 4 },
     ],
   };
   ```

2. **修改前端页面文件**
   - `pages/score/score.ts` - 导入常量，删除本地定义
   - `pages/home/home.ts` - 导入常量，删除本地定义
   - `pages/history/history.ts` - 导入常量，删除本地定义
   - `pages/analytics/analytics.ts` - 导入常量，删除本地定义

---

## 云函数说明

云函数保持现状，原因：
1. 云函数独立部署，无法直接引用前端常量文件
2. 云函数修改频率低，维护成本可控
3. 避免引入复杂的共享机制

---

## 涉及文件清单

**需要修改的文件：**
- `miniprogram/pages/score/score.ts`
- `miniprogram/pages/home/home.ts`
- `miniprogram/pages/history/history.ts`
- `miniprogram/pages/analytics/analytics.ts`

**需要新建的文件：**
- `miniprogram/constants/scoring.ts`
