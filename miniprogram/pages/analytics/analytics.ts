// pages/analytics/analytics.ts - 7S管理分析仪表盘
import { SCORING_ITEMS, SCORING_MAX_SCORES } from '../../config/scoring';

// ECharts 图表配置类型
interface EChartOption {
  onInit: (chart: any) => void;
}

// 声明 echarts 库变量（用于内部引用）
let echartsLib: any = null;
function getEchartsLib() {
  if (!echartsLib) {
    // @ts-ignore
    echartsLib = require('../../components/ec-canvas/echarts');
  }
  if (!echartsLib || !echartsLib.graphic) {
    // 如果没有 graphic，尝试从全局引入或使用简化的颜色字符串
    // 这里我们先假定组件内包含完整的 echarts
  }
  return echartsLib;
}

Page({
  data: {
    loading: true,
    hasData: false,
    
    // ========== 原有数据 ==========
    trendData: [] as Array<{ date: string; averageScore: number }>,
    deptData: [] as Array<{ department: string; averageScore: number; inspectionCount?: number }>,
    issueData: [] as Array<{ item: string; averageScore: number }>,
    scoringItems: SCORING_ITEMS,
    
    // ========== 新增数据 ==========
    healthOverview: {
      overallAverage: 0,
      weekOverWeekChange: 0
    },
    paretoData: [] as Array<{ item: string; deductionTotal: number; deductionPercent: number }>,
    unqualifiedOffices: [] as Array<{ department: string; room: string; totalScore: number; date: string }>,
    
    // ========== 时间筛选 ==========
    timeRange: 7, // 默认最近7天
    timeRangeText: '最近7天',
    timeRangeOptions: [
      { value: 7, label: '最近7天' },
      { value: 30, label: '本月' },
      { value: 90, label: '本季度' }
    ],
    
    // ========== 洞察提示 ==========
    paretoInsight: '',
    trendInsight: '',
    
    // ========== UI 状态 ==========
    showExceptionList: false,
    _initialized: false,
    cacheKey: 'analytics_data_cache_v3',
    cacheDuration: 5 * 60 * 1000,
    
    // ========== ECharts 配置 ==========
    scatterEc: {} as EChartOption,
    lineEc: {} as EChartOption,
    paretoEc: {} as EChartOption,
  },

  // 显示时间筛选器
  showTimeFilter() {
    const { timeRangeOptions, timeRange } = this.data;
    const itemList = timeRangeOptions.map((opt: { value: number; label: string }) => opt.label);
    
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const selected = timeRangeOptions[res.tapIndex];
        if (selected.value !== timeRange) {
          this.setData({
            timeRange: selected.value,
            timeRangeText: selected.label
          }, () => {
            // 清除缓存并重新加载
            wx.removeStorageSync(this.data.cacheKey);
            this.loadAnalytics(true);
          });
        }
      }
    });
  },

  // 生成趋势解读
  generateTrendInsight(trendData: any[], healthOverview: any): string {
    if (!Array.isArray(trendData) || trendData.length < 2) return '';

    const scores = trendData.map((t: any) => t.averageScore);
    const current = scores[scores.length - 1];
    const previous = scores[scores.length - 2];
    const change = Math.round((current - previous) * 10) / 10;

    // 检测波动（锯齿状）- 标准差较大
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const isVolatile = stdDev > 10; // 标准差大于10分认为波动大

    // 检测连续下滑
    let declineCount = 0;
    for (let i = scores.length - 1; i > 0; i--) {
      if (scores[i] < scores[i - 1]) declineCount++;
      else break;
    }

    // 检测连续上升
    let riseCount = 0;
    for (let i = scores.length - 1; i > 0; i--) {
      if (scores[i] > scores[i - 1]) riseCount++;
      else break;
    }

    // 判断是否稳定在高位（80分以上）
    const isHighAndStable = avg >= 80 && stdDev < 8;

    // 计算增长率（针对 87.4 → 92.6 这种变化）
    const growthRate = previous > 0 ? ((current - previous) / previous * 100).toFixed(1) : '0';

    // 针对近期只有两个数据点的情况（如 87.4 → 92.6）
    if (scores.length === 2 && current > previous && current >= 90) {
      return `整体表现大幅跃升。本期综合分突破 90 分大关，较上期增长了 ${growthRate}%。这说明全公司近期开展的专项治理效果显著，请继续保持这一势头，并开始关注长效维持机制。`;
    }

    if (isVolatile) {
      return `近期分数呈现明显的波动，说明存在"突击应付检查"现象，7S 尚未形成日常习惯，建议本周增加突击盲查频次。`;
    }

    if (declineCount >= 3) {
      return `全公司 7S 管理水平已连续 ${declineCount} 个周期下降，整体呈现松懈态势，建议立即召开专项会议敲响警钟。`;
    }

    if (riseCount >= 2 && current >= 80) {
      return `近期得分已连续 ${riseCount} 个周期上升，当前达到 ${current} 分，7S 管理成效显著，建议继续保持当前标准并考虑树立标杆。`;
    }

    if (isHighAndStable) {
      return `近期得分稳定在 ${avg.toFixed(1)} 分以上，说明全公司已基本建立 7S 维持机制，建议将管理重心从"检查扣分"转移到"评优奖励"。`;
    }

    if (current < 60) {
      return `当前平均分仅 ${current} 分，远低于 60 分达标线，7S 管理已处于失控边缘，需立即启动全面整改。`;
    }

    // 默认情况
    if (change > 0) {
      return `对比上个周期，整体得分上升 ${Math.abs(change)} 分。当前处于${current >= 80 ? '良好' : '待提升'}阶段，${current >= 80 ? '请继续保持当前标准' : '建议加强日常巡检力度'}。`;
    } else if (change < 0) {
      return `对比上个周期，整体得分下降 ${Math.abs(change)} 分。${current >= 60 ? '虽仍达标但需关注下滑趋势' : '已低于达标线，需要重点整改'}。`;
    }

    return `与上个周期持平，维持在 ${current} 分。建议持续关注各办公室的日常维持情况。`;
  },

  onLoad() {
    // 初始化 ECharts 配置
    this.initECharts();
    this.checkCacheAndLoad();
  },

  onShow() {
    // 页面重新显示时，强制检查并重新初始化图表
    if (this.data._initialized) {
      // 延迟检查，确保 Canvas 节点已准备就绪
      setTimeout(() => {
        const needReinit = !this.lineChart || !this.paretoChart;
        if (needReinit) {
          console.log('[Analytics] 页面重新显示，图表实例缺失，重新初始化');
          this.initECharts();
          // 延迟更新图表
          setTimeout(() => {
            this.updateCharts();
          }, 400);
        } else {
          // 图表实例存在，正常更新
          this.checkCacheAndLoad();
        }
      }, 100);
    }
  },

  // 初始化 ECharts 图表配置
  initECharts() {
    this.setData({
      lineEc: { lazyLoad: true },
      paretoEc: { lazyLoad: true }
    });
  },

  // 手动初始化单个图表
  initChart(id: string, option: any) {
    const component = this.selectComponent(`#${id}`);
    if (!component) {
      console.warn(`未找到组件: #${id}，尝试延迟初始化`);
      setTimeout(() => {
        const retryComponent = this.selectComponent(`#${id}`);
        if (retryComponent) {
          this.doInitChart(retryComponent, id, option);
        }
      }, 300);
      return;
    }
    this.doInitChart(component, id, option);
  },

    // 执行初始化逻辑
    doInitChart(component: any, id: string, option: any) {
      console.log(`[ECharts] 开始初始化图表: ${id}`);
      component.init((canvas: any, width: number, height: number, dpr: number) => {
        console.log(`[ECharts] 组件 init 回调触发: ${id}, size: ${width}x${height}, dpr: ${dpr}`);
        // @ts-ignore
        try {
          const echarts = require('../../components/ec-canvas/echarts');
          if (!echarts) {
            console.error(`[ECharts] 未找到 echarts 库: ${id}`);
            return null;
          }
          
          console.log(`[ECharts] 正在调用 echarts.init: ${id}`);
          // 适配旧版 Canvas：如果 canvas 上没有 addEventListener（即它是 ctx），则需要特殊处理
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr,
            renderer: canvas.getContext ? 'canvas' : 'svg' // 尝试自适应渲染器
          });
          
          console.log(`[ECharts] 正在调用 setOption: ${id}`);
          chart.setOption(option);
          
          // 保存引用以备后续更新
          if (id === 'lineChart') this.lineChart = chart;
          else if (id === 'paretoChart') this.paretoChart = chart;
          
          console.log(`[ECharts] 图表渲染成功: ${id}`);
          return chart;
        } catch (e) {
          console.error(`[ECharts] 初始化图表发生异常: ${id}`, e);
          return null;
        }
      });
    },

  // 直接初始化原生 Canvas 上的 ECharts
  initNativeChart(id: string, option: any) {
    console.log(`[ECharts] 尝试初始化原生 Canvas: ${id}`);
    const query = this.createSelectorQuery();
    query.select(`#${id}`)
      .fields({ node: true, size: true })
      .exec((res: any) => {
        if (!res[0] || !res[0].node) {
          console.error(`[ECharts] 获取原生 Canvas 节点失败: ${id}`, res);
          return;
        }

        const canvas = res[0].node;
        // 浏览器版 ECharts 依赖 DOM EventTarget 接口，小程序 canvas 节点缺失会导致 addEventListener 报错。
        // 这里注入最小 shim，保证至少能完成静态渲染；交互能力（tooltip/点击/缩放）可能受限。
        if (typeof canvas.addEventListener !== 'function') {
          canvas.addEventListener = () => {};
        }
        if (typeof canvas.removeEventListener !== 'function') {
          canvas.removeEventListener = () => {};
        }
        if (typeof canvas.dispatchEvent !== 'function') {
          canvas.dispatchEvent = () => false;
        }
        if (!canvas.style) {
          canvas.style = {};
        }
        if (typeof canvas.getBoundingClientRect !== 'function') {
          canvas.getBoundingClientRect = () => ({
            left: 0,
            top: 0,
            width: res[0].width,
            height: res[0].height,
            right: res[0].width,
            bottom: res[0].height
          });
        }
        if (typeof canvas.setAttribute !== 'function') {
          canvas.setAttribute = () => {};
        }
        if (typeof canvas.getAttribute !== 'function') {
          canvas.getAttribute = () => null;
        }
        if (typeof canvas.clientWidth !== 'number') {
          canvas.clientWidth = res[0].width;
        }
        if (typeof canvas.clientHeight !== 'number') {
          canvas.clientHeight = res[0].height;
        }
        const ctx = canvas.getContext('2d');
        const systemInfo = wx.getWindowInfo();
        const dpr = systemInfo.pixelRatio;
        
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        try {
          // @ts-ignore
          const echarts = require('../../components/ec-canvas/echarts');
          const chart = echarts.init(canvas, null, {
            width: res[0].width,
            height: res[0].height,
            devicePixelRatio: dpr
          });
          chart.setOption(option);
          
          // 保存引用
          if (id === 'lineChart') this.lineChart = chart;
          else if (id === 'paretoChart') this.paretoChart = chart;
          
          console.log(`[ECharts] 原生 Canvas 渲染成功: ${id}`);
        } catch (e) {
          console.error(`[ECharts] 原生 Canvas 初始化异常: ${id}`, e);
        }
      });
  },

  // 更新所有图表
  updateCharts() {
    // 检查图表实例，如果不存在需要重新初始化原生 Canvas
    if (!this.lineChart || !this.paretoChart) {
      console.log('[Analytics] 图表实例不存在，准备重新初始化原生 Canvas');
      // 延迟执行，确保 WXML 已渲染
      setTimeout(() => {
        this.updateLineChart();
        this.updateParetoChart();
      }, 300);
      return;
    }
    this.updateLineChart();
    this.updateParetoChart();
  },

  // 检查缓存并加载数据
  checkCacheAndLoad() {
    const now = Date.now();
    const cache = wx.getStorageSync(this.data.cacheKey);
    
    // 检查图表实例是否存在，如果不存在需要重新初始化
    const needReinit = !this.lineChart || !this.paretoChart;
    
    if (cache && cache.data && (now - cache.timestamp) < this.data.cacheDuration) {
      this.setData({
        ...cache.data,
        loading: false,
        _initialized: true,
      }, () => {
        // 如果需要重新初始化，延迟执行以确保WXML已更新
        setTimeout(() => {
          if (needReinit) {
            console.log('[Analytics] 图表实例缺失，重新初始化');
            this.initECharts();
          }
          this.updateCharts();
        }, needReinit ? 500 : 300);
      });
      
      // 后台静默刷新（不触发图表重绘）
      if (!needReinit) {
        this.loadAnalytics(false);
      }
    } else {
      this.loadAnalytics(true);
    }
  },

  // 加载分析数据
  async loadAnalytics(showLoading = true) {
    if (showLoading) {
      this.setData({ loading: true });
    }

    // 销毁旧图表实例，确保切换时间范围后重新初始化
    if (this.lineChart) {
      this.lineChart.dispose();
      this.lineChart = null;
    }
    if (this.paretoChart) {
      this.paretoChart.dispose();
      this.paretoChart = null;
    }

    try {
      const { timeRange } = this.data;
      const res = await wx.cloud.callFunction({
        name: 'getAnalytics',
        data: { dateRange: timeRange }
      }) as any;

      if (res.result && res.result.trendData && res.result.trendData.length > 0) {
        const result = res.result;
        
        // 生成洞察提示
        const paretoInsight = this.generateParetoInsight(result.paretoData);
        const trendInsight = this.generateTrendInsight(result.trendData, result.healthOverview);

        const cacheData = {
          trendData: result.trendData,
          deptData: result.deptData || [],
          issueData: result.issueData || [],
          healthOverview: result.healthOverview || {},
          paretoData: result.paretoData || [],
          unqualifiedOffices: result.unqualifiedOffices || [],
          paretoInsight,
          trendInsight,
          hasData: true,
        };
        
        // 更新缓存
        wx.setStorageSync(this.data.cacheKey, {
          data: cacheData,
          timestamp: Date.now()
        });
        
        this.setData({
          ...cacheData,
          loading: false,
          _initialized: true,
        }, () => {
          // 在 setData 回调中执行图表渲染
          setTimeout(() => {
            this.updateCharts();
          }, 300);
        });
      } else {
        this.setData({
          hasData: false,
          loading: false,
          _initialized: true,
        });
      }
    } catch (err) {
      console.error('获取分析数据失败', err);
      this.setData({ loading: false, hasData: false });
      
      const cache = wx.getStorageSync(this.data.cacheKey);
      if (cache && cache.data) {
        this.setData({
          ...cache.data,
        }, () => {
          setTimeout(() => {
            this.updateCharts();
          }, 300);
        });
      }
      
      if (showLoading) {
        wx.showToast({ title: '加载失败', icon: 'error' });
      }
    }
  },


  // 辅助方法：生成帕累托洞察
  generateParetoInsight(paretoData: any): string {
    if (!Array.isArray(paretoData) || paretoData.length === 0) return '';

    const top3Count = Math.min(3, paretoData.length);
    const top3Items = paretoData.slice(0, top3Count);
    const top3Names = top3Items.map((item: any) => item.item);
    const top3Sum = top3Items.reduce((acc: number, cur: any) => acc + (cur.deductionTotal || 0), 0);
    const totalSum = paretoData.reduce((acc: number, cur: any) => acc + (cur.deductionTotal || 0), 0);
    const top3Percent = totalSum > 0 ? Math.round((top3Sum / totalSum) * 100) : 0;

    if (top3Percent >= 60) {
      // 列出前3项（或实际有的项数）
      const displayCount = Math.min(3, top3Names.length);
      const displayNames = top3Names.slice(0, displayCount);
      const itemNames = displayNames.join('】、【');
      const suffix = top3Count > displayCount ? `等${top3Count}项` : `${top3Count}项`;
      return `本周扣分严重集中在【${itemNames}】${suffix}。下周请重点针对这几项进行专项整改，即可解决 ${top3Percent}% 的问题。`;
    }
    return `当前扣分项较为分散，其中“${paretoData[0].item}”扣分最多，建议优先整改。`;
  },

  // 切换异常列表展开/收起
  toggleExceptionList() {
    this.setData({
      showExceptionList: !this.data.showExceptionList
    });
  },

  // 图表实例引用
  lineChart: null as any,
  paretoChart: null as any,

  // 更新帕累托图
  updateParetoChart() {
    const { paretoData } = this.data;
    if (!paretoData || paretoData.length === 0) return;

    // 引入 echarts 用于创建渐变
    // @ts-ignore
    const echarts = require('../../components/ec-canvas/echarts');

    const items = paretoData.map((d: any) => d.item);
    const deductions = paretoData.map((d: any) => d.deductionTotal);
    
    let sum = 0;
    const totalDeduction = deductions.reduce((a: number, b: number) => a + b, 0);
    const accumulatedPercents = deductions.map((d: number) => {
      sum += d;
      return totalDeduction > 0 ? Math.round((sum / totalDeduction) * 100) : 0;
    });

    const option = {
      backgroundColor: 'transparent',
      grid: {
        top: '8%',
        left: '22%',
        right: '8%',
        bottom: '12%',
        containLabel: false
      },
      xAxis: {
        type: 'value',
        name: '',
        show: false,
        splitLine: { show: false }
      },
      yAxis: {
        type: 'category',
        data: items,
        axisLabel: {
          interval: 0,
          fontSize: 10,
          color: '#374151',
          fontWeight: 500
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#E9ECEF' } }
      },
      series: [
        {
          name: '扣分额',
          type: 'bar',
          barWidth: 12,
          data: deductions.map((value: number, index: number) => ({
            value,
            itemStyle: {
              color: index < 3 
                ? new (echarts as any).graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#3B82F6' },
                    { offset: 1, color: '#6366F1' }
                  ])
                : '#E9ECEF',
              borderRadius: [0, 6, 6, 0]
            },
            label: {
              show: true,
              position: 'insideRight',
              formatter: '{c}分',
              fontSize: 10,
              color: index < 3 ? '#FFFFFF' : '#6B7280',
              fontWeight: index < 3 ? 'bold' : 'normal',
              offset: [-8, 0]
            }
          }))
        },
        {
          name: '累计占比',
          type: 'line',
          symbol: 'circle',
          symbolSize: 5,
          data: accumulatedPercents.map((p: number, index: number) => {
            const isLast = index === accumulatedPercents.length - 1;
            const prevP = index > 0 ? accumulatedPercents[index - 1] : 0;
            const isThresholdCrossed = prevP < 66 && p >= 66;
            const showLabel = isThresholdCrossed || (isLast && !accumulatedPercents.some((val: number, i: number) => {
              const prev = i > 0 ? accumulatedPercents[i - 1] : 0;
              return prev < 66 && val >= 66;
            }));
            return {
              value: [p, index],
              label: {
                show: showLabel,
                formatter: '累计' + p + '%',
                position: 'right',
                fontSize: 10,
                color: '#F59E0B',
                fontWeight: 'bold',
                distance: 8
              }
            };
          }),
          lineStyle: { 
            color: '#F59E0B', 
            width: 1.5,
            type: 'solid'
          },
          itemStyle: { 
            color: '#F59E0B',
            borderWidth: 1,
            borderColor: '#FFF'
          },
          z: 10
        }
      ]
    };
    
    if (this.paretoChart) {
      this.paretoChart.setOption(option);
    } else {
      this.initNativeChart('paretoChart', option);
    }
  },

  // 更新折线图
  updateLineChart() {
    const { trendData } = this.data;
    if (!trendData || trendData.length === 0) return;

    // 引入 echarts 用于创建渐变
    // @ts-ignore
    const echarts = require('../../components/ec-canvas/echarts');

    const isLowDensity = trendData.length <= 2;
    const scores = trendData.map((t: any) => t.averageScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    
    // Y轴动态起始点：最小值减10（不低于50），最大值加10
    const yMin = Math.max(50, Math.floor(minScore / 10) * 10 - 10);
    const yMax = Math.min(100, Math.ceil(maxScore / 10) * 10 + 10);

    // 警戒线配置：在红线右侧标注"60分达标线"
    const markLineConfig = {
      silent: true,
      symbol: ['none', 'none'],
      lineStyle: { type: 'dashed', color: '#EF4444', width: 1 },
      label: {
        show: true,
        position: 'end',
        formatter: '60分达标线',
        fontSize: 9,
        color: '#EF4444',
        distance: 5
      },
      data: [
        {
          yAxis: 60,
          lineStyle: { type: 'dashed', color: '#EF4444', width: 1 }
        }
      ]
    };

    // VisualMap 配置：实现语义色填充
    const visualMapConfig = {
      show: false,
      dimension: 1,
      pieces: [
        { gt: 60, lte: 100, color: 'rgba(59, 130, 246, 0.15)' }, // >60 浅蓝色
        { gte: 0, lte: 60, color: 'rgba(239, 68, 68, 0.15)' }   // <=60 浅红色
      ],
      outOfRange: { color: 'rgba(59, 130, 246, 0.15)' }
    };

    if (isLowDensity) {
      const option = {
        backgroundColor: 'transparent',
        grid: {
          top: '15%',
          left: '12%',
          right: '12%',
          bottom: '12%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: trendData.map((t: any) => t.date.slice(5)),
          axisLine: { lineStyle: { color: '#E9ECEF' } },
          axisTick: { show: false },
          axisLabel: { color: '#9CA3AF', fontSize: 10 }
        },
        yAxis: {
          type: 'value',
          min: 70,
          max: 100,
          interval: 10,
          splitLine: { lineStyle: { type: 'dashed', color: '#F3F4F6' } },
          axisLine: { show: false },
          axisLabel: { 
            color: '#9CA3AF', 
            fontSize: 10,
            formatter: (value: number) => value % 20 === 0 || value === 70 || value === 100 ? value : ''
          }
        },
        series: [
          {
            type: 'line',
            data: scores.map((score: number, index: number) => ({
              value: score,
              itemStyle: index === scores.length - 1 ? {
                color: '#3B82F6',
                borderWidth: 2,
                borderColor: '#FFF',
                shadowBlur: 10,
                shadowColor: 'rgba(59, 130, 246, 0.5)'
              } : {
                color: '#3B82F6',
                borderWidth: 1,
                borderColor: '#FFF'
              }
            })),
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { color: '#3B82F6', width: 2.5 },
            areaStyle: {
              color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0.02)' }
              ])
            },
            label: {
              show: true,
              position: 'top',
              fontSize: 11,
              color: '#374151',
              fontWeight: 500,
              fontFamily: 'DIN Alternate, SF Pro Display, -apple-system'
            },
            markLine: markLineConfig
          }
        ]
      };

      if (this.lineChart) {
        this.lineChart.setOption(option);
      } else {
        this.initNativeChart('lineChart', option);
      }
      return;
    }

    const option = {
      backgroundColor: 'transparent',
      grid: {
        top: '15%',
        left: '12%',
        right: '12%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: trendData.map((t: any) => t.date.slice(5)),
        axisLine: { lineStyle: { color: '#E9ECEF' } },
        axisTick: { show: false },
        axisLabel: { color: '#9CA3AF', fontSize: 10, rotate: 30 }
      },
      yAxis: {
        type: 'value',
        min: 70,
        max: 100,
        interval: 10,
        splitLine: { lineStyle: { type: 'dashed', color: '#F3F4F6' } },
        axisLine: { show: false },
        axisLabel: { 
          color: '#9CA3AF', 
          fontSize: 10,
          formatter: (value: number) => value % 20 === 0 || value === 70 || value === 100 ? value : ''
        }
      },
      series: [{
        type: 'line',
        data: scores.map((score: number, index: number) => ({
          value: score,
          itemStyle: index === scores.length - 1 ? {
            color: '#3B82F6',
            borderWidth: 2,
            borderColor: '#FFF',
            shadowBlur: 12,
            shadowColor: 'rgba(59, 130, 246, 0.6)'
          } : {
            color: '#3B82F6',
            borderWidth: 1,
            borderColor: '#FFF'
          }
        })),
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: (data: any, params: any) => params.dataIndex === scores.length - 1 ? 8 : 4,
        lineStyle: { color: '#3B82F6', width: 2.5 },
        areaStyle: {
          color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.02)' }
          ])
        },
        markPoint: {
          symbol: 'circle',
          symbolSize: 10,
          label: { fontSize: 9, color: '#374151', fontWeight: 'bold' },
          data: [
            { type: 'max', name: '最高', itemStyle: { color: '#3B82F6' } },
            { type: 'min', name: '最低', itemStyle: { color: '#6B7280' } }
          ]
        },
        markLine: markLineConfig
      }]
    };

    if (this.lineChart) {
      this.lineChart.setOption(option);
    } else {
      this.initNativeChart('lineChart', option);
    }
  },

  onPullDownRefresh() {
    this.loadAnalytics(false).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onShareAppMessage() {
    return {
      title: '职能部室 7S 联查分析报告',
      path: '/pages/analytics/analytics'
    };
  }
});
