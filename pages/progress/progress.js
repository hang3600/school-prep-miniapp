const store = require('../../utils/store.js');
const checkin = require('../../utils/checkin.js');
const share = require('../../utils/share.js');
const { CATEGORIES } = require('../../utils/categories.js');

const STAGES = [
  { key: 'college', label: '大学' },
  { key: 'high', label: '高中' },
  { key: 'middle', label: '初中' },
  { key: 'primary', label: '小学' }
];

Page({
  data: {
    streakDays: 0,
    badges: [],
    stage: 'college',
    stageLabel: '大学',
    stageChips: [],
    cats: [],
    overallPercent: 0
  },

  onLoad() {
    const seoApp = (typeof getApp === 'function') ? getApp() : null;
    if (seoApp && seoApp.globalData && typeof seoApp.globalData.applyPageMeta === 'function') {
      seoApp.globalData.applyPageMeta('pages/progress/progress');
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // 首屏渲染前不读 storage：首次加载延后到 onReady，切回 tab 时 _ready 已为真才刷新
    if (this._ready) this.refresh();
  },

  onReady() {
    this._ready = true;
    this.refresh();
  },

  refresh() {
    // 学段单一真源 = store：首页/进度页切学段后，切回本页始终读全局当前学段，
    // 避免 this.data.stage 缓存旧值导致「首页已切高中、进度页仍显示大学」。
    const stageKey = store.getStage();
    const stageLabel = (STAGES.find((s) => s.key === stageKey) || STAGES[0]).label;

    // 顶部学段切换 chips
    const stageChips = STAGES.map((s) => ({
      key: s.key,
      label: s.label,
      active: s.key === stageKey
    }));

    // 本学段 7 个分类各自完成度（可点导航到对应清单）
    const coreOnly = store.getCoreMode();
    const cats = CATEGORIES.map((c) => {
      const p = store.computeCatProgress(stageKey, c.key, coreOnly);
      return {
        key: c.key,
        label: c.label,
        desc: c.desc,
        tint: c.tint,
        percent: p.readyPercent,
        packed: p.packed,
        total: p.total,
        complete: p.complete
      };
    });

    // 顶部连续打卡 / 成就（沿用真实数据）
    const overall = store.computeStageProgress(stageKey, coreOnly);
    const st = checkin.stats();
    const totalDone = STAGES.reduce((sum, s) => sum + store.computeStageProgress(s.key, coreOnly).done, 0);
    const anyFull = STAGES.some((s) => store.computeStageProgress(s.key, coreOnly).percent >= 100);

    this.setData({
      stage: stageKey,
      stageLabel,
      stageChips,
      cats,
      overallPercent: overall.percent,
      streakDays: st.streak,
      badges: [
        { name: '收纳达人', unlocked: totalDone >= 10 },
        { name: '清单高手', unlocked: anyFull },
        { name: '打卡新星', unlocked: st.streak >= 3 }
      ]
    });
  },

  // 切换学段：只刷新本页分类列表，不跳转（点分类行才进清单）
  onStageChip(e) {
    const key = e.currentTarget.dataset.key;
    if (!STAGES.some((s) => s.key === key)) return;
    store.setStage(key);
    this.setData({ stage: key });
    this.refresh();
  },

  // 点分类行 → 进入该分类清单（redirectTo：进度页是 tab，从 tab 进非 tab 页用 navigateTo）
  onCatTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!CATEGORIES.some((c) => c.key === key)) return;
    wx.navigateTo({ url: '/pages/checklist/checklist?cat=' + key });
  },

  onShareAppMessage() {
    return share.shareApp('progress');
  },

  onShareTimeline() {
    return share.shareTimeline('progress');
  }
});
