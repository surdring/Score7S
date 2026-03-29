/**
 * ECharts 微信小程序组件
 * 基于 echarts-for-weixin 封装
 * 使用 require 方式引入 echarts 避免类型问题
 */

// 声明 echarts 类型
type EChartsType = {
  init: (canvas: any, theme?: string | null, opts?: { width?: number; height?: number; devicePixelRatio?: number }) => any;
};

// 声明组件实例类型
interface EcComponentInstance {
  data: {
    isUseNewCanvas: boolean;
    forceUseOldCanvas: boolean;
    canvasId: string;
    ec: { onInit?: (chart: any) => void } | null;
  };
  setData: (data: Partial<{ isUseNewCanvas: boolean }>) => void;
  createSelectorQuery: () => WechatMiniprogram.SelectorQuery;
  chart: any;
  oldCanvasCtx: any;
  initNewCanvas: () => void;
  initOldCanvas: () => void;
  getChart: () => any;
  setOption: (option: any) => void;
  clear: () => void;
  dispose: () => void;
}

// 延迟加载 echarts（避免编译时类型检查）
let echarts: EChartsType | null = null;
function getEcharts(): EChartsType {
  if (!echarts) {
    // @ts-ignore - 动态加载 echarts
    try {
      // 优先加载本地 components 目录下的 echarts.js
      echarts = require('./echarts.js');
    } catch (e) {
      console.error('Failed to load local echarts.js, trying node_modules...', e);
      // @ts-ignore
      echarts = require('echarts');
    }
  }
  return echarts!;
}

Component({
  properties: {
    canvasId: {
      type: String,
      value: 'ec-canvas'
    },
    ec: {
      type: Object,
      value: null
    },
    forceUseOldCanvas: {
      type: Boolean,
      value: false
    }
  },

  data: {
    isUseNewCanvas: false
  } as EcComponentInstance['data'],

  lifetimes: {
    ready() {
      const self = this as unknown as EcComponentInstance;
      if (!self.data.forceUseOldCanvas) {
        // 使用 2D Canvas
        self.setData({ isUseNewCanvas: true });
        self.initNewCanvas();
      } else {
        // 使用旧版 Canvas
        self.initOldCanvas();
      }
    }
  },

  methods: {
    // 初始化新版 Canvas（2D 模式）
    initNewCanvas(this: EcComponentInstance & WechatMiniprogram.Component.TrivialInstance) {
      const query = this.createSelectorQuery();
      query
        .select('.ec-canvas')
        .fields({ node: true, size: true }, (res: any) => {
          if (!res || !res[0] || !res[0].node) return;
          
          const canvasNode = res[0].node;
          const canvas = canvasNode;
          const ctx = canvas.getContext('2d');
          
          const dpr = wx.getSystemInfoSync().pixelRatio;
          canvas.width = res[0].width * dpr;
          canvas.height = res[0].height * dpr;
          ctx.scale(dpr, dpr);

          const echartsLib = getEcharts();
          this.chart = echartsLib.init(canvas, null, {
            width: res[0].width,
            height: res[0].height,
            devicePixelRatio: dpr
          });

          // 如果有待初始化的 ec.onInit，则执行
          const ec = (this.data as any).ec;
          if (ec && ec.onInit) {
            ec.onInit(this.chart);
          }
        })
        .exec();
    },

    // 暴露一个 init 方法供外部手动调用 (用于 lazyLoad 模式)
    init(this: EcComponentInstance & WechatMiniprogram.Component.TrivialInstance, callback: (canvas: any, width: number, height: number, dpr: number) => any) {
      console.log('[ec-canvas] 外部 init 被调用');
      const query = this.createSelectorQuery();
      query
        .select('.ec-canvas')
        .fields({ node: true, size: true }, (res: any) => {
          console.log('[ec-canvas] SelectorQuery 结果:', res);
          
          // 修正判空逻辑：即使 res[0] 存在，也需要判断其内容
          if (!res || !res[0]) {
            console.error('[ec-canvas] 未找到 .ec-canvas 节点');
            return;
          }

          const dpr = wx.getSystemInfoSync().pixelRatio;
          const { width, height, node } = res[0];

          if (node) {
            console.log(`[ec-canvas] 使用 2D Canvas 模式, size: ${width}x${height}`);
            node.width = width * dpr;
            node.height = height * dpr;
            const chart = callback(node, width, height, dpr);
            this.chart = chart;
          } else {
            // Windows 模拟器或某些环境下 node 为 null，回退到旧版 Canvas
            console.log(`[ec-canvas] node 为 null，尝试回退到旧版 Canvas 模式, size: ${width}x${height}`);
            const canvasId = (this.data as any).canvasId;
            // 此时 callback 传入的第一个参数应为 ctx 兼容对象，但 echarts 微信版通常需要通过 wx.createCanvasContext 包装
            const ctx = wx.createCanvasContext(canvasId, this);
            
            // 适配旧版 canvas 回调参数
            const chart = callback(ctx, width, height, dpr);
            this.chart = chart;
          }
        })
        .exec();
    },

    // 初始化旧版 Canvas
    initOldCanvas(this: EcComponentInstance) {
      const ctx = wx.createCanvasContext(this.data.canvasId, this as any);
      const query = this.createSelectorQuery();
      query
        .select('.ec-canvas')
        .boundingClientRect((res: any) => {
          if (typeof res === 'undefined') {
            return;
          }
          const echartsLib = getEcharts();
          this.chart = echartsLib.init(ctx, null, {
            width: res.width,
            height: res.height,
            devicePixelRatio: wx.getSystemInfoSync().pixelRatio
          });

          if (this.data.ec && this.data.ec.onInit) {
            this.data.ec.onInit(this.chart);
          }

          // 旧版 Canvas 需要手动触发渲染
          this.oldCanvasCtx = ctx;
        })
        .exec();
    },

    // 获取图表实例
    getChart(this: EcComponentInstance) {
      return this.chart;
    },

    // 设置图表选项
    setOption(this: EcComponentInstance, option: any) {
      if (this.chart) {
        this.chart.setOption(option);
      }
    },

    // 清空图表
    clear(this: EcComponentInstance) {
      if (this.chart) {
        this.chart.clear();
      }
    },

    // 销毁图表
    dispose(this: EcComponentInstance) {
      if (this.chart) {
        this.chart.dispose();
      }
    }
  }
});
