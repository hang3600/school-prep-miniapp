/**
 * 页面功能回归：home / checklist / profile / reminder
 * 覆盖：开学倒计时分阶段、宫格计数、三态勾选、长按删除、复制清单、清除数据、打卡
 */

const fs = require('fs');
const path = require('path');
const { assert, makeState, makeEnv, loadPage, instantiate, ROOT } = require('./harness.js');

// 生成相对今天的日期字符串
function fmt(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function run() {
  // ---------- 1. 首页：开学倒计时分阶段 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const home = instantiate(loadPage(env, 'pages/home/home.js'));
    home.onLoad();
    home.onShow();

    assert('未设置日期 → 引导文案', home.data.countdownText === '设置开学日期' && home.data.cdEdit === '去设置',
      home.data.countdownText);

    store.setSchoolDate(fmt(30));
    home.refresh();
    assert('30 天 → 从容期', home.data.countdownText === '距开学还有 30 天' && home.data.advice.indexOf('从容期') !== -1,
      home.data.advice);
    assert('30 天 → 时间带第 0 段高亮 + 大数字 30', home.data.activePhase === 0 && home.data.daysLeft === 30,
      'activePhase=' + home.data.activePhase + ' daysLeft=' + home.data.daysLeft);

    store.setSchoolDate(fmt(10));
    home.refresh();
    assert('10 天 → 采购期', home.data.advice.indexOf('采购期') !== -1, home.data.advice);
    assert('10 天 → 时间带第 1 段高亮', home.data.activePhase === 1, home.data.activePhase);

    store.setSchoolDate(fmt(5));
    home.refresh();
    assert('5 天 → 打包期', home.data.advice.indexOf('打包期') !== -1, home.data.advice);
    assert('5 天 → 时间带第 2 段高亮', home.data.activePhase === 2, home.data.activePhase);

    store.setSchoolDate(fmt(1));
    home.refresh();
    assert('1 天 → 出发前', home.data.advice.indexOf('出发前') !== -1, home.data.advice);
    assert('1 天 → 时间带第 3 段高亮', home.data.activePhase === 3 && home.data.daysLeft === 1, home.data.activePhase);

    store.setSchoolDate(fmt(0));
    home.refresh();
    assert('当天 → 今天开学', home.data.countdownText === '今天开学', home.data.countdownText);

    store.setSchoolDate(fmt(-2));
    home.refresh();
    assert('已过 2 天 → 已开学', home.data.countdownText === '已开学 2 天' && home.data.cdEdit === '修改',
      home.data.countdownText);

    // picker 修改往返
    home.onDateChange({ detail: { value: fmt(15) } });
    assert('picker 修改生效', store.getSchoolDate() === fmt(15) && home.data.countdownText === '距开学还有 15 天',
      home.data.countdownText);

    // 宫格计数（8 类 4+4 两行直显）
    assert('宫格 8 个分类', home.data.categories.length === 8);
    assert('宫格计数含军训 16 件', home.data.categories.find((c) => c.key === 'mil').count === 16);
    assert('宫格含新增药品健康 16 件', home.data.categories.find((c) => c.key === 'med').count === 16);
    assert('宫格件数合计 172', home.data.categories.reduce((s, c) => s + c.count, 0) === 172);
    assert('今日小贴士非空', typeof home.data.tip === 'string' && home.data.tip.length > 0);
  }

  // ---------- 2. 首页：学段切换 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const home = instantiate(loadPage(env, 'pages/home/home.js'));
    home.onLoad();

    home.onStageTap({ currentTarget: { dataset: { key: 'high' } } });
    assert('切换学段生效', store.getStage() === 'high' && home.data.stageLabel === '高中');

    home.onCategoryTap({ currentTarget: { dataset: { key: 'mil' } } });
    assert('宫格跳转清单页带 cat 参数', state.nav.some((u) => u.indexOf('checklist?cat=mil') !== -1), state.nav);
  }

  // ---------- 3. 清单页：三态勾选 + 长按删除 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const page = instantiate(loadPage(env, 'pages/checklist/checklist.js'));
    page.onLoad({ cat: 'mil' });
    page.onReady(); // 首屏渲染完成后才加载清单（对齐 onLoad→onReady 生命周期）

    assert('导航标题 = 分类名', state.title === '军训用品', state.title);
    assert('军训分类 16 条', page.data.totalCount === 16, page.data.totalCount);

    const it = page.data.groups[0].items[0];
    page.toggleItem({ currentTarget: { dataset: { id: it.id, name: it.name } } });
    assert('一击 → 已备好计数 +1', page.data.readyCount === 1 && page.data.packedCount === 0,
      { r: page.data.readyCount, p: page.data.packedCount });

    page.toggleItem({ currentTarget: { dataset: { id: it.id, name: it.name } } });
    assert('两击 → 已装包计数 +1', page.data.packedCount === 1, page.data.packedCount);

    // 长按删除（modalConfirm 默认 true）
    page.onItemLongPress({ currentTarget: { dataset: { id: it.id, name: it.name } } });
    assert('长按删除 → 总数 -1', page.data.totalCount === 15, page.data.totalCount);
    assert('删除弹窗含物品名', state.modals.some((m) => m.content.indexOf(it.name) !== -1));
    assert('删除后 store 同步', store.getChecklist('college', 'mil').length === 15);
  }

  // ---------- 4. 清单页：全部分组完成庆祝 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const page = instantiate(loadPage(env, 'pages/checklist/checklist.js'));
    page.onLoad({ cat: 'med' }); // 药品健康 16 条，装包循环验证
    page.onReady(); // 首屏渲染完成后才加载清单（对齐 onLoad→onReady 生命周期）

    const all = [];
    page.data.groups.forEach((g) => g.items.forEach((x) => all.push(x.id)));
    all.forEach((id) => {
      page.toggleItem({ currentTarget: { dataset: { id, name: 'x' } } });
      page.toggleItem({ currentTarget: { dataset: { id, name: 'x' } } }); // →2 已装包
    });
    assert('全部装包 → 进度 100%', page.data.totalPercent === 100, page.data.totalPercent);
    assert('全部装包 → 庆祝 toast', state.toasts.some((t) => t && t.indexOf('都备齐了') !== -1), state.toasts);
  }

  // ---------- 5. 清单页：复制清单 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const page = instantiate(loadPage(env, 'pages/checklist/checklist.js'));
    page.onLoad({ cat: 'id' });
    page.onReady(); // 首屏渲染完成后才加载清单（对齐 onLoad→onReady 生命周期）
    page.onCopyList();

    assert('复制内容含分类标题', state.clipboard && state.clipboard.indexOf('证件材料') !== -1);
    assert('复制内容含必带分组', state.clipboard && state.clipboard.indexOf('【必带】') !== -1);
  }

  // ---------- 6. 我的页：统计 + 清除数据（缓存一致性关键断言）----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const profile = instantiate(loadPage(env, 'pages/profile/profile.js'));
    profile.onLoad();
    profile.onShow();
    profile.onReady();

    assert('profile 统计总件数 172', profile.data.stats[0].trend === '共 172 件', profile.data.stats[0].trend);

    // 先制造一些用户数据：勾选一件
    const id = store.getChecklist('college', 'id')[0].id;
    store.cycleItem('college', 'id', id);
    assert('清除前存在已勾选物品', store.getChecklist('college', 'id')[0].status === 1);

    // 清除本机数据（确认弹窗）
    profile.onLogout();
    assert('清除后数据恢复种子（缓存已同步清空）', store.getChecklist('college', 'id')[0].status === 0,
      store.getChecklist('college', 'id')[0].status);
    assert('清除后给出提示', state.toasts.some((t) => t && t.indexOf('已清除') !== -1), state.toasts);
  }

  // ---------- 7. 打卡页 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const page = instantiate(loadPage(env, 'pages/reminder/reminder.js'));
    page.onShow();

    assert('初始未打卡', page.data.checkedInToday === false);
    page.onCheckIn();
    assert('打卡后今日已打卡', page.data.checkedInToday === true);
    assert('打卡后连续天数 1', page.data.streak === 1, page.data.streak);
    assert('打卡有触感反馈', state.vibrate.length > 0);

    // 幂等：重复打卡不叠加
    page.onCheckIn();
    assert('重复打卡不叠加连续天数', page.data.streak === 1, page.data.streak);
    assert('重复打卡给出提示', state.toasts.some((t) => t && t.indexOf('已经打过卡') !== -1));
  }

  // ---------- 8. 关于页版本号 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const page = instantiate(loadPage(env, 'pages/about/about.js'));
    page.onLoad();
    assert('版本号取自线上账号信息', page.data.version === '1.0.0', page.data.version);
  }

  // ---------- 9. 时间带单源（评审第 4 条：首页母题向内页延伸）----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const phase = env.load('utils/phase.js');

    // countdownState 与首页历史行为逐字一致
    assert('单源 未设置日期 → 引导态全字段', (function () {
      const s = phase.countdownState(null);
      return s.countdownText === '设置开学日期' && s.activePhase === -1 && s.daysLeft === null && s.cdEdit === '去设置';
    })());

    store.setSchoolDate(fmt(30));
    const c30 = phase.countdownState(store.daysUntilSchool());
    assert('单源 30 天 → 从容期第 0 段', c30.activePhase === 0 && c30.daysLeft === 30 && c30.advice.indexOf('从容期') !== -1,
      c30);
    store.setSchoolDate(fmt(5));
    assert('单源 5 天 → 打包期第 2 段', phase.countdownState(store.daysUntilSchool()).activePhase === 2);
    store.setSchoolDate(fmt(0));
    assert('单源 当天 → 今天开学第 3 段', phase.countdownState(store.daysUntilSchool()).countdownText === '今天开学');

    // miniStrip 与首页共用同一分段口径（activePhase 必须对齐）
    store.setSchoolDate(fmt(30));
    const m30 = phase.miniStrip(store.daysUntilSchool());
    assert('迷你带 30 天 → 与首页同段 + 从容期文案', m30.activePhase === 0 && m30.phaseLabel === '从容期' && m30.dayText === '30 天后开学', m30);
    store.setSchoolDate(fmt(5));
    assert('迷你带 5 天 → 第 2 段', phase.miniStrip(store.daysUntilSchool()).activePhase === 2);
    assert('迷你带 未设置 → 全灰 -1 + 引导语', phase.miniStrip(null).activePhase === -1 && phase.miniStrip(null).dayText.indexOf('开学日期') !== -1);
  }

  // ---------- 10. 内页携带迷你时间带数据（分类页 / 进度页）----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    store.setSchoolDate(fmt(10));

    const cat = instantiate(loadPage(env, 'pages/category/category.js'));
    cat.onReady();
    assert('分类页迷你带 10 天 → 采购期第 1 段', cat.data.activePhase === 1 && cat.data.phaseLabel === '采购期' && cat.data.dayText === '10 天后开学',
      { phase: cat.data.activePhase, label: cat.data.phaseLabel, day: cat.data.dayText });

    const prog = instantiate(loadPage(env, 'pages/progress/progress.js'));
    prog.onReady();
    assert('进度页迷你带与分类页同段（单源一致）', prog.data.activePhase === cat.data.activePhase && prog.data.phaseLabel === cat.data.phaseLabel,
      { prog: prog.data.activePhase, cat: cat.data.activePhase });
  }
}

module.exports = { run, name: 'features' };
