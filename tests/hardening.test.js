/**
 * 第二轮深度审计（2026-09-10 晚）修复项的专项断言
 * --------------------------------------------------
 * 覆盖：分类语义错配 / 添加物品输入校验 / 首屏同步 storage / checkin 缓存 /
 *       提醒文案诚实性 / 子页分享补全。
 * 目的：把本轮修复「锁住」，防止后续改动悄悄回退。
 */

const h = require('./harness.js');
const { assert, makeState, makeEnv, loadPage, instantiate } = h;

function run() {
  // ========== 1. 分类语义：bed 不得与 shirt（衣物鞋包）重叠 ==========
  {
    const { CATEGORIES, CAT_MAP } = require('../utils/categories.js');
    const bed = CATEGORIES.find((c) => c.key === 'bed');
    const shirt = CATEGORIES.find((c) => c.key === 'shirt');

    assert('bed 标签不再叫「宿舍衣物」', bed.label !== '宿舍衣物', bed.label);
    assert('bed 标签为「床品寝室」', bed.label === '床品寝室', bed.label);
    assert('bed desc 不再含「衣物 / 鞋包」（与 shirt 去重）',
      bed.desc.indexOf('衣物') === -1 && bed.desc.indexOf('鞋包') === -1, bed.desc);
    assert('shirt 保持「衣物鞋包」语义', shirt.label === '衣物鞋包', shirt.label);

    // 单源健康性：7 分类、key 无重复、CAT_MAP 与 CATEGORIES 一致
    assert('分类数 7', CATEGORIES.length === 7, CATEGORIES.length);
    const keys = CATEGORIES.map((c) => c.key);
    assert('分类 key 无重复', new Set(keys).size === keys.length);
    assert('CAT_MAP 与 CATEGORIES 对齐', CATEGORIES.every((c) => CAT_MAP[c.key] === c.label));
  }

  // ========== 2. about 页分类描述取自单源（不再硬编码）==========
  {
    const state = makeState();
    const env = makeEnv(state);
    const cfg = loadPage(env, 'pages/about/about.js');
    const page = instantiate(cfg);
    const feat = page.data.features.find((f) => f.title === '7 大分类');

    assert('about 分类描述含「床品寝室」', feat.desc.indexOf('床品寝室') !== -1, feat.desc);
    assert('about 分类描述已无旧词「宿舍衣物」', feat.desc.indexOf('宿舍衣物') === -1, feat.desc);
    assert('about 分类描述覆盖全部 7 个分类', feat.desc.split('、').length === 7, feat.desc);
  }

  // ========== 3. 添加物品输入校验 ==========
  {
    const state = makeState();
    const env = makeEnv(state);
    const cfg = loadPage(env, 'pages/checklist/checklist.js');
    const page = instantiate(cfg);
    const store = env.load('utils/store.js');

    page.onLoad.call(page, { cat: 'id' });
    const before = store.getChecklist('college', 'id').length;

    // 3-1 纯空格名称必须被拒（旧逻辑 !d.name 会被 3 个空格穿透）
    state.toasts.length = 0;
    page.onSave.call(page, { detail: { name: '   ', catKey: 'id', qty: 1, must: true } });
    assert('空格名被拒：未新增物品', store.getChecklist('college', 'id').length === before);
    assert('空格名被拒：给出提示', state.toasts.indexOf('请填写名称') !== -1, state.toasts);

    // 3-2 前后空格被 trim
    page.onSave.call(page, { detail: { name: '  充电宝  ', catKey: 'id', qty: 1, must: true } });
    const added = store.getChecklist('college', 'id').slice(-1)[0];
    assert('名称两端空格被 trim', added.name === '充电宝', added.name);

    // 3-3 超长名称截断到 20 字（防绕过 maxlength）
    const long = '充'.repeat(50);
    page.onSave.call(page, { detail: { name: long, catKey: 'id', qty: 1, must: true } });
    const added2 = store.getChecklist('college', 'id').slice(-1)[0];
    assert('超长名称截断到 20 字', added2.name.length === 20, added2.name.length);

    // 3-4 数量钳制到 99
    page.onSave.call(page, { detail: { name: '数据线', catKey: 'id', qty: 500, must: true } });
    const added3 = store.getChecklist('college', 'id').slice(-1)[0];
    assert('数量上限 99', added3.name === '数据线 ×99', added3.name);

    // 3-5 数量为 0 / 负数兜底为 1
    page.onSave.call(page, { detail: { name: '台灯', catKey: 'id', qty: -3, must: true } });
    const added4 = store.getChecklist('college', 'id').slice(-1)[0];
    assert('数量下限 1（负数不拼 ×N）', added4.name === '台灯', added4.name);
  }

  // ========== 4. 弹层数量上限（第一道防线）==========
  {
    const state = makeState();
    const env = makeEnv(state);
    const cfg = loadPage(env, 'components/add-item-sheet/add-item-sheet.js');
    // 小程序自定义组件的方法挂在 methods 下（Page 则是顶层），实例化时需合并
    const sheet = instantiate(Object.assign({}, cfg, cfg.methods || {}));

    sheet.data.qty = 99;
    sheet.inc.call(sheet);
    assert('数量到 99 后不再增长', sheet.data.qty === 99, sheet.data.qty);
    assert('数量到顶给出提示', state.toasts.length > 0, state.toasts);

    sheet.data.qty = 1;
    sheet.dec.call(sheet);
    assert('数量为 1 时不再减少（不出现 ×0）', sheet.data.qty === 1, sheet.data.qty);
  }

  // ========== 5. checkin 内存缓存 + clearCache ==========
  {
    const state = makeState();
    const env = makeEnv(state);
    const checkin = env.load('utils/checkin.js');

    checkin.getState();
    checkin.getState();
    checkin.isCheckedInToday();
    checkin.shouldRemind();
    assert('checkin 多次读取只走 1 次 storage（缓存生效）', state.storageReads === 1, state.storageReads);

    // 写操作后缓存同步
    checkin.setHour(9);
    assert('写入后读到的小时数为新值', checkin.getState().hour === 9, checkin.getState().hour);
    assert('写入后不再额外读 storage', state.storageReads === 1, state.storageReads);

    // 打卡幂等 + 缓存同步
    const total0 = checkin.stats().total;
    checkin.checkIn();
    checkin.checkIn();
    assert('打卡幂等（重复打卡只记 1 天）', checkin.stats().total === total0 + 1, checkin.stats().total);

    // clearCache 后必须重新读盘（模拟外部清了 storage）
    const readsBefore = state.storageReads;
    checkin.clearCache();
    checkin.getState();
    assert('clearCache 后重新读盘', state.storageReads === readsBefore + 1, state.storageReads);

    // reset 后读到的是空状态而非旧缓存
    checkin.reset();
    assert('reset 后为空状态', checkin.stats().total === 0 && checkin.getState().enabled === false);
  }

  // ========== 6. 首屏不再同步读写 storage（体验分）==========
  {
    const state = makeState();
    const env = makeEnv(state);
    env.load('app.js');
    const app = env.appConfigs.app;
    if (app && typeof app.onLaunch === 'function') {
      app.globalData = app.globalData || {};
      app.onLaunch.call(app);
      assert('onLaunch 阶段 0 次同步 storage 读（种子预热已延后）',
        state.storageReads === 0, state.storageReads);
    } else {
      assert('app.js 可加载并暴露 onLaunch', false);
    }
  }

  // ========== 7. 提醒文案诚实性（不宣称后台推送）==========
  {
    const state = makeState();
    const env = makeEnv(state);
    const cfg = loadPage(env, 'pages/reminder/reminder.js');
    const page = instantiate(cfg);

    state.toasts.length = 0;
    page.onToggleRemind.call(page, { detail: { value: true } });
    const t = state.toasts[state.toasts.length - 1] || '';
    assert('开启提醒文案不宣称「每日推送」', t.indexOf('每日提醒') === -1, t);
    assert('开启提醒文案说明「打开时提醒」', t.indexOf('打开时') !== -1, t);
    assert('开启后状态已持久化', env.load('utils/checkin.js').getState().enabled === true);
  }

  // ========== 8. 子页分享补全 ==========
  {
    const state = makeState();
    const env = makeEnv(state);
    const helpCfg = loadPage(env, 'pages/help/help.js');
    const help = instantiate(helpCfg);

    assert('help 页有 onShareAppMessage', typeof help.onShareAppMessage === 'function');
    assert('help 页有 onShareTimeline', typeof help.onShareTimeline === 'function');
    const msg = help.onShareAppMessage.call(help);
    assert('help 分享标题命中「开学要带什么」', msg.title.indexOf('开学要带什么') !== -1, msg.title);
    assert('help 分享带品牌封面', !!msg.imageUrl, msg.imageUrl);
    assert('help 分享路径正确', msg.path === '/pages/help/help', msg.path);

    // about / privacy 不设分享（无使用场景，避免审核侧多余关注）
    const share = env.load('utils/share.js');
    assert('share 未注册 about（有意不为）', !share.PAGES.about);
    assert('share 未注册 privacy（有意不为）', !share.PAGES.privacy);
    assert('未知 key 回落首页分享', share.shareApp('unknown').path === '/pages/home/home');
  }

  // ========== 9. UI 打磨项（2026-09-11 P0）==========
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    // 9-1 距开学天数单源（首页倒计时 / 清单页完成卡共用）
    assert('未设开学日期 → daysUntilSchool 为 null', store.daysUntilSchool() === null, store.daysUntilSchool());
    const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); };
    store.setSchoolDate(day(0));
    assert('今天开学 → 0', store.daysUntilSchool() === 0, store.daysUntilSchool());
    store.setSchoolDate(day(5));
    assert('5 天后开学 → 5', store.daysUntilSchool() === 5, store.daysUntilSchool());
    store.setSchoolDate(day(-3));
    assert('3 天前已开学 → -3', store.daysUntilSchool() === -3, store.daysUntilSchool());
    store.clearCache();
  }

  // 9-2 清单页：三态说明按需显示 + 全部分组装包自动收起 + 完成态
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const cfg = loadPage(env, 'pages/checklist/checklist.js');
    const page = instantiate(cfg);
    page.onLoad.call(page, { cat: 'id' });

    assert('一件没勾时显示三态说明', page.data.showCycleHint === true, page.data.showCycleHint);

    const items = store.getChecklist('college', 'id');
    store.cycleItem('college', 'id', items[0].id);
    page.loadList.call(page);
    assert('勾过一件后三态说明隐去', page.data.showCycleHint === false, page.data.showCycleHint);

    // 全部循环到「已装包(2）」：逐个循环直到 status === 2（幂等，避免受前面已勾过的影响）
    store.getChecklist('college', 'id').forEach((it) => {
      for (let i = 0; i < 3; i += 1) {
        const cur = store.getChecklist('college', 'id').find((x) => x.id === it.id);
        if (!cur || (cur.status || 0) === 2) break;
        store.cycleItem('college', 'id', it.id);
      }
    });
    page.loadList.call(page);
    const nonEmpty = page.data.groups.filter((g) => g.items.length > 0);
    assert('分组非空且存在', nonEmpty.length > 0, nonEmpty.length);
    assert('全部装包后分组自动收起', nonEmpty.every((g) => g.open === false));
    assert('全部装包触发完成态', page.data.allDone === true, page.data.allDone);
    assert('完成文案带件数', page.data.doneSummary.indexOf('共') !== -1, page.data.doneSummary);

    // 手动展开后不被自动接管（取第一个非空分组，避免空组干扰）
    const gi = page.data.groups.findIndex((g) => g.items.length > 0);
    page.toggleGroup.call(page, { currentTarget: { dataset: { idx: gi } } });
    assert('手动点击后分组展开', page.data.groups[gi].open === true);
    page.loadList.call(page);
    assert('用户手动展开后重算仍保持展开', page.data.groups[gi].open === true);
    store.clearCache();
  }

  // 9-3 添加弹层：打开自动聚焦、关闭复位（focus 需 false→true 翻转才能再次唤起键盘）
  {
    const state = makeState();
    const env = makeEnv(state);
    const cfg = loadPage(env, 'components/add-item-sheet/add-item-sheet.js');
    const sheet = instantiate(Object.assign({}, cfg, cfg.methods || {}));

    cfg.observers.visible.call(sheet, true);
    assert('弹层打开 → focus 为 true', sheet.data.focus === true, sheet.data.focus);
    cfg.observers.visible.call(sheet, false);
    assert('弹层关闭 → focus 复位 false', sheet.data.focus === false, sheet.data.focus);
    cfg.observers.visible.call(sheet, true);
    assert('再次打开 → focus 重新为 true', sheet.data.focus === true, sheet.data.focus);
  }
}

module.exports = { name: 'hardening', run };
