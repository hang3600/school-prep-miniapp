const store = require('../../utils/store.js');
const checkin = require('../../utils/checkin.js');
const share = require('../../utils/share.js');
const phase = require('../../utils/phase.js');
const { CATEGORIES } = require('../../utils/categories.js');

const STAGES = [
  { key: 'college', label: '大学', short: '大', desc: '住校用品齐全', color: '#2F8F6B' },
  { key: 'high', label: '高中', short: '高', desc: '走读 / 住校', color: '#FAAD14' },
  { key: 'middle', label: '初中', short: '初', desc: '日常走读', color: '#52C41A' },
  { key: 'primary', label: '小学', short: '小', desc: '家长代劳', color: '#EAA7B2' }
];

// 今日整理小贴士：按日期轮换（纯本地、零成本），填充宫格下方留白
const TIPS = [
  '证件类建议用透明文件袋分类装好，报到当天抽拿最方便。',
  '先把重物放进箱子底层，鞋子塞进空隙里，能省下不少空间。',
  '常用药品单独放一个小包，别托运到箱底急着用找不到。',
  '数据线和充电头用一个收纳盒装齐，到校后不用满箱翻找。',
  '换洗衣物按「上装 / 下装 / 贴身」分层卷起来放，抗皱又省地。',
  '报到当天人多排队，录取通知书和身份证放在随手能拿的口袋里。',
  '宿舍空间有限，先带一学期用量就够，缺什么本地再补。',
  '贵重电子设备随身背，行李箱里只放耐磕碰的东西。',
  '提前列一张「到校补买清单」，到校后按单采购不遗漏。',
  '箱子贴一张物品清单照片在群里，万一落家里家人好帮你找。',
  '军训鞋一般偏硬，提前备一双软鞋垫，站军姿会舒服很多。',
  '被褥可以提前寄到学校，人轻装出发，到校直接取。',
  '把「要带」和「别带」分开列：宿舍限电就别带大功率电器。',
  '充电宝、雨伞、纸巾放随身包侧袋，路上随时能用。',
  '开学前一周开始每天收拾一点，别攒到最后一天突击打包。'
];

// 分阶段建议 / 时间带分段已收口到 utils/phase.js（首页与内页迷你时间带共用单源）

// 首页清单预览：取前若干「必带」物品（跨分类），不足补「选带」，让用户首屏就看到真实清单内容
function buildPreview(stage) {
  const items = [];
  for (const c of CATEGORIES) {
    for (const it of store.getChecklist(stage, c.key)) {
      if (it.must) {
        items.push(it);
        if (items.length >= 5) return items;
      }
    }
  }
  for (const c of CATEGORIES) {
    for (const it of store.getChecklist(stage, c.key)) {
      if (!it.must) {
        items.push(it);
        if (items.length >= 5) return items;
      }
    }
  }
  return items;
}

Page({
  data: {
    stage: 'college',
    stageLabel: '大学',
    ctaLabel: '开始整理',
    previewItems: [],
    previewCount: 0,
    // 首页清单预览卡：首屏直接展示真实必带物品，证明「替你想到了」。
    // 开启后 preview-card 进入首屏；如需 A/B 对比可临时改回 false。
    showPreview: true,
    // 快速模式：只显示 20 件核心必带物品（关闭则显示全部 172 件）
    coreMode: false,
    totalPercent: 0,
    totalCount: 0,
    // 是否已开始整理：一件没勾时不展示空 0%，改讲价值主张
    started: false,
    heroSub: '',
    heroDesc: '',
    stages: STAGES,
    categories: [],
    tip: '',
    countdownText: '设置开学日期',
    advice: '设置后按剩余天数给你分阶段准备建议',
    cdEdit: '去设置',
    daysLeft: null,
    schoolDateText: '',
    // 时间带：四段等宽，当前段按下表高亮（由 refreshCountdown 计算）
    phaseBands: phase.PHASE_BANDS,
    activePhase: -1,
    // 日期选择范围（D2 修复：end 随当前年份动态 +2，不再硬编码 2026–2027 导致跨年失效）
    dateStart: '2020-01-01',
    dateEnd: '',
    // 首次学段引导弹层（自定义半屏 2×2 卡片）
    stageGuideVisible: false
  },

  onLoad() {
    const seoApp = (typeof getApp === 'function') ? getApp() : null;
    if (seoApp && seoApp.globalData && typeof seoApp.globalData.applyPageMeta === 'function') {
      seoApp.globalData.applyPageMeta('pages/home/home');
    }
    // 今日小贴士：按「自 1970-01-01 起的天数」轮换，同一天所有用户看到同一条
    const now = new Date();
    this.setData({
      tip: TIPS[Math.floor(Date.now() / 86400000) % TIPS.length],
      dateEnd: (now.getFullYear() + 2) + '-12-31'
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    // 隐私授权：页面已渲染后主动触发一次（每个会话一次），异步，不阻塞首屏。
    this.ensurePrivacyOnce();
    // 首屏渲染前不读 storage（体验分硬指标）：首次进入由 onReady 统一加载；
    // 之后切回首页时 onReady 已就绪，此处直接刷新（此时缓存已热，读取不再触发同步 IO）。
    if (this._ready) {
      this.loadData();
    }
  },

  onReady() {
    // 首屏已渲染完成，此刻再读 storage 不计入「首屏渲染前同步 API」。
    this._ready = true;
    this.loadData();
  },

  // 首页数据加载（涉及同步存储读取）：进度刷新、打卡提醒、学段引导。
  // 统一收口到 onReady / 返回首页的 onShow，确保首屏渲染前零同步存储调用。
  loadData() {
    this.refresh();
    this.maybeRemind();
    this.maybeGuideStage();
  },

  // 主动触发微信隐私授权流程（合规要求：审核员必须能体验到授权入口）
  ensurePrivacyOnce() {
    try {
      const app = getApp();
      if (app && typeof app.ensurePrivacy === 'function') app.ensurePrivacy();
    } catch (e) {
      // 取不到 app 实例时不阻断首屏
    }
  },

  // 首次学段引导：自定义半屏 2×2 卡片弹层（替换原生 ActionSheet）。
  // 触发条件：未选过学段 + 未点过「稍后再说」+ 当前仍默认大学 + 本会话未弹过。
  // 延迟 500ms 弹出，避免打断首屏。微信隐私弹窗为系统级、会盖在最上层，
  // 用户处理完隐私后学段引导自然可见，无需在此手动排队（此前强依赖 SP_PRIVACY_AGREED
  // 标记导致引导被误拦截——该标记仅在用户主动进隐私页同意时才写入，组件授权不写）。
  maybeGuideStage() {
    if (this._stageGuideShown) return;
    if (store.hasChosenStage()) return;
    try { if (wx.getStorageSync('schoolprep_guide_stage_shown')) return; } catch (e) {}
    // 兼容老用户：学段已非默认值，视为已选过，只补标记不打扰
    if (store.getStage() !== 'college') {
      store.markStageChosen();
      return;
    }
    this._stageGuideShown = true;
    setTimeout(() => {
      this.setData({ stageGuideVisible: true });
    }, 500);
  },

  // 引导弹层：选中学段
  onStageGuidePick(e) {
    const key = e.currentTarget.dataset.key;
    const picked = STAGES.find((s) => s.key === key);
    if (!picked) return;
    store.setStage(key);
    this.setData({ stageGuideVisible: false });
    this.refresh();
    if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '已切换到' + picked.label, icon: 'none' });
  },

  // 引导弹层：稍后再说（记录已看过，不再反复弹；用户仍可在首页顶部手动切换）
  onStageGuideLater() {
    try { wx.setStorageSync('schoolprep_guide_stage_shown', true); } catch (e) {}
    this.setData({ stageGuideVisible: false });
  },

  // 阻止弹层内容区点击冒泡到遮罩
  noop() {},

  // 打卡提醒：开启提醒 + 已过设定时间 + 今天未打卡时，每天提示一次
  // （小程序无后台推送能力，故在用户打开时提示，避免打扰仅提示一次）
  maybeRemind() {
    try {
      if (!checkin.shouldRemind()) return;
      checkin.markTipped();
      wx.showToast({ title: '今天还没打卡整理哦～', icon: 'none', duration: 2000 });
    } catch (e) {
      // 提醒失败不影响主流程
    }
  },

  // 从本地存储刷新首页进度 + 宫格数量 + 开学倒计时
  refresh() {
    const stage = store.getStage();
    const label = (STAGES.find((s) => s.key === stage) || STAGES[0]).label;
    const coreMode = store.getCoreMode();
    const prog = store.computeStageProgress(stage, coreMode);
    const categories = CATEGORIES.map((c) => ({
      ...c,
      count: store.getChecklist(stage, c.key, coreMode).length
    }));
    // Hero 文案三态：未开始 / 进行中 / 全部准备好
    // 未开始时不展示空 0%，改讲清「已经替你列好了什么」——首屏第一印象
    let heroSub;
    let heroDesc;
    if (prog.total === 0) {
      heroSub = '添加物品后开始整理';
      heroDesc = label + '入学物品清单';
    } else if (prog.done >= prog.total) {
      heroSub = '全部准备好了 · 共 ' + prog.total + ' 件';
      heroDesc = '照着清单一件件核对，开学不慌';
    } else if (prog.done > 0) {
      heroSub = '已整理 ' + prog.done + ' 件 · 待准备 ' + (prog.total - prog.done) + ' 件';
      heroDesc = '照着清单核对，开学不慌';
    } else {
      // 未开始：大字已是「N 件」，副标题补一句价值主张——这 N 件是替用户按学段精挑的，
      // 不是空数字；同时给出「必带/选带分好」的确定性，降低整理前的心理门槛。
      heroSub = label + '必备清单已按必带/选带分好';
      heroDesc = '照着勾，不漏带、不多带';
    }
    const ctaLabel = prog.done > 0 ? '继续整理' : '开始整理';
    const previewItems = buildPreview(stage).map((it) => ({
      id: it.id,
      name: it.name,
      must: it.must,
      statusClass: 'st' + (it.status || 0)
    }));
    this.setData({
      stage,
      stageLabel: label,
      coreMode,
      totalPercent: prog.percent,
      totalCount: prog.total,
      started: prog.done > 0,
      heroSub,
      heroDesc,
      categories,
      ctaLabel,
      previewItems,
      previewCount: prog.total
    });
    this.refreshCountdown();
  },

  // 开学倒计时：剩余天数 + 分阶段建议 + 时间带当前段。
  // 计算与文案收口在 utils/phase.js，首页与内页迷你时间带共用，行为与原实现逐字一致。
  refreshCountdown() {
    const diff = store.daysUntilSchool();
    this.setData(phase.countdownState(diff));
  },

  // 首页 Hero 倒计时行点击 → 原生日期 picker 修改开学日期
  onDateChange(e) {
    store.setSchoolDate(e.detail.value);
    this.refreshCountdown();
    wx.showToast({ title: '已设置开学日期', icon: 'none' });
  },

  // 首页承接主入口：直接进入清单（默认跳到下一个待整理分类，全部完成则回首个分类）
  onStartTap() {
    const cat = store.nextIncompleteCat(store.getStage(), null, store.getCoreMode()) || 'id';
    wx.navigateTo({ url: '/pages/checklist/checklist?cat=' + cat });
  },

  // 核心/完整清单切换：只改视图筛选，不动物品数据；进度口径同步跟随
  onCoreModeTap(e) {
    const next = e.currentTarget.dataset.core === 'true';
    if (next === store.getCoreMode()) return; // 点已选中项不动作
    store.setCoreMode(next);
    this.refresh();
    wx.showToast({ title: next ? '已切到核心 20 件' : '已显示全部物品', icon: 'none' });
  },

  onStageTap(e) {
    store.setStage(e.currentTarget.dataset.key);
    this.refresh();
  },

  onCategoryTap(e) {
    const key = e.currentTarget.dataset.key;
    wx.navigateTo({ url: '/pages/checklist/checklist?cat=' + key });
  },

  // 转发（好友/群聊）：标题与路径单源在 utils/share.js
  onShareAppMessage() {
    return share.shareApp('home');
  },

  onShareTimeline() {
    return share.shareTimeline('home');
  }
});
