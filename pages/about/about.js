const { CATEGORIES } = require('../../utils/categories.js');

Page({
  data: {
    version: '1.0.0',
    year: new Date().getFullYear(),
    features: [
      { icon: 'ic-list-gray', title: '分学段清单', desc: '按学段生成清单，孩子要带什么一目了然' },
      // 分类名取自 utils/categories.js 单一数据源，避免文案漂移
      { icon: 'ic-category-gray', title: '8 大分类', desc: CATEGORIES.map((c) => c.label).join('、') },
      { icon: 'ic-progress-gray', title: '进度追踪', desc: '实时统计已整理与待整理，临行前一眼核对' },
      { icon: 'ic-medal', title: '每日打卡', desc: '每天勾一点，开学前刚好收完' },
      { icon: 'ic-shield', title: '数据留在本机', desc: '不上传服务器，不收集个人信息' }
    ]
  },

  onLoad() {
    const seoApp = (typeof getApp === 'function') ? getApp() : null;
    if (seoApp && seoApp.globalData && typeof seoApp.globalData.applyPageMeta === 'function') {
      seoApp.globalData.applyPageMeta('pages/about/about');
    }
    // 版本号自动取线上真实值；开发/体验版无 version 字段时回落 1.0.0
    try {
      const info = wx.getAccountInfoSync();
      const ver = info && info.miniProgram && info.miniProgram.version;
      if (ver) this.setData({ version: ver });
    } catch (e) { /* 保持默认 1.0.0 */ }
  },

  onGoPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  onGoHelp() {
    wx.navigateTo({ url: '/pages/help/help' });
  },

});
