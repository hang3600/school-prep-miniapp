const store = require('../../utils/store.js');
const share = require('../../utils/share.js');
const { CATEGORIES } = require('../../utils/categories.js');

Page({
  data: {
    keyword: '',
    recent: [],
    categories: []
  },

  onLoad() {
    const seoApp = (typeof getApp === 'function') ? getApp() : null;
    if (seoApp && seoApp.globalData && typeof seoApp.globalData.applyPageMeta === 'function') {
      seoApp.globalData.applyPageMeta('pages/category/category');
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    // 首屏渲染前不读 storage：首次加载延后到 onReady，切回 tab 时 _ready 已为真才刷新
    if (this._ready) this.refresh();
  },

  onReady() {
    this._ready = true;
    this.refresh();
  },

  refresh() {
    const stage = store.getStage();
    const kw = (this.data.keyword || '').trim();
    const coreOnly = store.getCoreMode();
    // 搜索框真实过滤：分类名 / 描述 / 该分类下任一物品名，命中即保留
    const categories = CATEGORIES
      .filter((c) => {
        if (!kw) return true;
        if (c.label.indexOf(kw) !== -1 || c.desc.indexOf(kw) !== -1) return true;
        return store.getChecklist(stage, c.key, coreOnly).some((it) => (it.name || '').indexOf(kw) !== -1);
      })
      .map((c) => ({
        ...c,
        count: store.getChecklist(stage, c.key, coreOnly).length
      }));
    this.setData({ categories, recent: this.computeRecent() });
  },

  // 最近添加：收集全学段用户自定义物品（id 以 c_ 开头），按添加时间戳降序取最新 4 个
  // （B2 修复：id 形如 c_<时间戳>_<随机>，取第二段时间戳排序，保证「最近添加」名符其实；
  //   P1-9：返回 {name, catKey, id}，chip 可点击跳转到所在分类）
  computeRecent() {
    const customs = [];
    // 「最近添加」展示所有自定义物品，不受核心模式筛选——用户刚加的必然想看到
    store.STAGE_KEYS.forEach((stg) => {
      store.CAT_KEYS.forEach((cat) => {
        store.getChecklist(stg, cat).forEach((it) => {
          const id = String(it.id);
          if (id.indexOf('c_') === 0) {
            const ts = Number(id.split('_')[1]) || 0;
            customs.push({ ts, name: it.name, catKey: cat, id });
          }
        });
      });
    });
    customs.sort((a, b) => b.ts - a.ts);
    return customs.slice(0, 4).map((x) => ({ name: x.name, catKey: x.catKey, id: x.id }));
  },

  // 搜索态下点击分类 → 把关键词透传给清单页，落地后高亮命中物品并自动展开其分组。
  // 无关键词时保持原行为。kw 用 encodeURIComponent 防止 &/= 等破坏 query 结构。
  buildNavUrl(key) {
    const kw = (this.data.keyword || '').trim();
    return '/pages/checklist/checklist?cat=' + key + (kw ? '&kw=' + encodeURIComponent(kw) : '');
  },

  // 最近添加 chip 点击 → 跳到该分类清单
  onRecentTap(e) {
    const key = e.currentTarget.dataset.key;
    wx.navigateTo({ url: this.buildNavUrl(key) });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this.refresh();
  },

  onCatTap(e) {
    const key = e.currentTarget.dataset.key;
    wx.navigateTo({ url: this.buildNavUrl(key) });
  },

  onShareAppMessage() {
    return share.shareApp('category');
  },

  onShareTimeline() {
    return share.shareTimeline('category');
  }
});
