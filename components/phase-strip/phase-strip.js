/**
 * 迷你时间带（分类页 / 进度页共用）
 * --------------------------------------------------
 * 把首页「开学时间带」母题压成一条细带延伸到内页：四段等宽刻度 + 当前阶段 + 剩余天数。
 * 纯展示组件：不读 storage、不算日期——数据由页面在 onReady 后调用 phase.miniStrip() 算好传入，
 * 守住「首屏渲染前零同步 API」的体验分底线。点击整条回首页设置开学日期。
 */
const phase = require('../../utils/phase.js');

Component({
  properties: {
    // 当前阶段标签（从容期/采购期/打包期/出发…）
    phaseLabel: { type: String, value: '开学倒计时' },
    // 剩余天数文案（N 天后开学 / 今天开学 / 已开学 N 天 / 引导语）
    dayText: { type: String, value: '设个开学日期，跟着节奏走' },
    // 当前高亮段索引，-1 表示未设置日期（四段全灰）
    activePhase: { type: Number, value: -1 }
  },

  data: {
    bands: phase.PHASE_BANDS
  },

  methods: {
    onTap() {
      // 首页是 tabBar 页，必须 switchTab；跳过去后用户点倒计时即可改日期
      wx.switchTab({ url: '/pages/home/home' });
    }
  }
});
