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

    store.setSchoolDate(fmt(10));
    home.refresh();
    assert('10 天 → 采购期', home.data.advice.indexOf('采购期') !== -1, home.data.advice);

    store.setSchoolDate(fmt(5));
    home.refresh();
    assert('5 天 → 打包期', home.data.advice.indexOf('打包期') !== -1, home.data.advice);

    store.setSchoolDate(fmt(1));
    home.refresh();
    assert('1 天 → 出发前', home.data.advice.indexOf('出发前') !== -1, home.data.advice);

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

    // 宫格计数
    assert('宫格 7 个分类', home.data.categories.length === 7);
    assert('宫格计数含军训 10 件', home.data.categories.find((c) => c.key === 'mil').count === 10);
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
    assert('军训分类 10 条', page.data.totalCount === 10, page.data.totalCount);

    const it = page.data.groups[0].items[0];
    page.toggleItem({ currentTarget: { dataset: { id: it.id, name: it.name } } });
    assert('一击 → 已备好计数 +1', page.data.readyCount === 1 && page.data.packedCount === 0,
      { r: page.data.readyCount, p: page.data.packedCount });

    page.toggleItem({ currentTarget: { dataset: { id: it.id, name: it.name } } });
    assert('两击 → 已装包计数 +1', page.data.packedCount === 1, page.data.packedCount);

    // 长按删除（modalConfirm 默认 true）
    page.onItemLongPress({ currentTarget: { dataset: { id: it.id, name: it.name } } });
    assert('长按删除 → 总数 -1', page.data.totalCount === 9, page.data.totalCount);
    assert('删除弹窗含物品名', state.modals.some((m) => m.content.indexOf(it.name) !== -1));
    assert('删除后 store 同步', store.getChecklist('college', 'mil').length === 9);
  }

  // ---------- 4. 清单页：全部分组完成庆祝 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const page = instantiate(loadPage(env, 'pages/checklist/checklist.js'));
    page.onLoad({ cat: 'bed' }); // 床品 8 条，较少
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

    assert('profile 统计总件数 75', profile.data.stats[0].trend === '共 75 件', profile.data.stats[0].trend);

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
}

module.exports = { run, name: 'features' };
