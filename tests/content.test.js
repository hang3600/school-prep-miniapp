/**
 * 竞品内容落地回归：内容数据模块 + 决策三态 + 清单页提醒/说明卡渲染
 * --------------------------------------------------
 * 覆盖：
 * ① 内容模块：10 类 172 件、7 类说明卡、94 件种子提醒全覆盖
 * ② decision 决策 API：三态循环、与 status 隔离、持久化、老数据补 0
 * ③ 清单页：分类说明卡注入、提醒小字、决策标签、图例按需显示
 */

const { assert, makeState, makeEnv, loadPage, instantiate } = require('./harness.js');

function run() {
  // ===== ① 内容数据模块 =====
  const state0 = makeState();
  const env0 = makeEnv(state0);
  const ce = env0.load('utils/content-enrich.js');

  const st = ce.stats();
  assert('竞品 10 大类', st.categories === 10, st.categories);
  assert('竞品 172 件物品', st.items === 172, st.items);
  assert('竞品提醒文案非空', st.tips > 0, st.tips);
  assert('种子提醒 90 条', st.seedTips === 90, st.seedTips);

  // 7 个我们自己的分类都有说明卡
  const cats = ['id', 'soap', 'book', 'bed', 'laptop', 'shirt', 'mil'];
  cats.forEach((c) => {
    const a = ce.getCatAdvice(c);
    assert('分类 ' + c + ' 有说明卡', !!a && !!a.subtitle && !!a.note);
  });
  assert('未知分类无说明卡', ce.getCatAdvice('nope') === null);

  // 94 件种子物品逐条有提醒（从 store 源码提取名字，与内容模块交叉验证）
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'utils', 'store.js'), 'utf8');
  const names = [...new Set([...src.matchAll(/\{ name: '([^']+)'/g)].map((m) => m[1]))]
    .filter((n) => n !== '必带' && n !== '选带');
  const noTip = names.filter((n) => !ce.getTip(n));
  assert('94 件种子提醒全覆盖', names.length === 94 && noTip.length === 0,
    '种子' + names.length + ' 缺' + noTip.length + ':' + noTip.join('/'));
  assert('单件提醒文案正确（身份证）', ce.getTip('身份证').indexOf('复印件') !== -1, ce.getTip('身份证'));
  assert('到校买类提醒（插线板合规）', ce.getTip('插线板').indexOf('合规') !== -1, ce.getTip('插线板'));

  // ===== ② decision 决策 API =====
  const state = makeState();
  const env = makeEnv(state);
  const store = env.load('utils/store.js');
  const id = store.getChecklist('college', 'id')[0].id;

  assert('种子默认 decision=0（从家带）', store.getChecklist('college', 'id')[0].decision === 0);

  store.cycleDecision('college', 'id', id);
  assert('一击 → 到校买(1)', store.getChecklist('college', 'id')[0].decision === 1);
  store.cycleDecision('college', 'id', id);
  assert('二击 → 到校再定(2)', store.getChecklist('college', 'id')[0].decision === 2);
  store.cycleDecision('college', 'id', id);
  assert('三击 → 回从家带(0)', store.getChecklist('college', 'id')[0].decision === 0);

  // 与 status 完全解耦：切决策不改进度状态
  const it0 = store.getChecklist('college', 'id')[0];
  const st0 = it0.status;
  store.cycleDecision('college', 'id', id);
  const it1 = store.getChecklist('college', 'id')[0];
  assert('切决策不影响 status', it1.status === st0, it1.status + ' vs ' + st0);
  assert('切决策不影响进度统计', store.computeStageProgress('college').done === 0);

  // 不存在 id 无副作用
  store.cycleDecision('college', 'id', 'not_exist');
  assert('cycleDecision 不存在 id 无副作用', store.getChecklist('college', 'id').length === 13);

  // 老数据缺 decision 自动补 0（不破坏 status）
  const state2 = makeState({
    storage: {
      schoolprep_v1: {
        stage: 'college', stageExcludeV1: true,
        lists: { college: { id: [
          { id: 's_college_id_0', name: '身份证', must: true, status: 2 }
        ] } }
      }
    }
  });
  const env2 = makeEnv(state2);
  const store2 = env2.load('utils/store.js');
  assert('老数据缺 decision → 补 0', store2.getChecklist('college', 'id')[0].decision === 0);
  assert('老数据 status 不受影响', store2.getChecklist('college', 'id')[0].status === 2);

  // ===== ③ 清单页渲染增强 =====
  const state3 = makeState();
  const env3 = makeEnv(state3);
  const store3 = env3.load('utils/store.js');
  const page = instantiate(loadPage(env3, 'pages/checklist/checklist.js'));
  page.onLoad({ cat: 'id' });
  page.onReady();

  assert('说明卡副标题注入', page.data.adviceSubtitle.indexOf('复印件') !== -1, page.data.adviceSubtitle);
  assert('说明卡详细文案注入', !!page.data.adviceNote);
  assert('初始无决策 → 图例隐藏', page.data.showDecisionLegend === false);

  // 物品渲染副本带提醒文案
  const firstGroup = page.data.groups[0];
  const firstItem = firstGroup.items[0];
  assert('物品渲染带 tip 提醒', !!firstItem.tip, firstItem.tip);
  assert('物品渲染带 decisionLabel', typeof firstItem.decisionLabel === 'string');
  assert('默认 decisionLabel 为空', firstItem.decisionLabel === '', firstItem.decisionLabel);

  // 切决策 → 图例出现 + 标签文案更新
  page.onCycleDecision({ currentTarget: { dataset: { id: firstItem.id } } });
  const updated = page.data.groups[0].items[0];
  assert('切决策后图例显示', page.data.showDecisionLegend === true);
  assert('切决策后标签=到校买', updated.decisionLabel === '到校买', updated.decisionLabel);

  // 搜索命中仍生效（内容增强不破坏原搜索高亮）
  page.onClearKw();
  page.setData({ kw: '身份证' });
  page.loadList();
  const hitItem = page.data.groups.flatMap((g) => g.items).find((it) => it.name.indexOf('身份证') !== -1);
  assert('内容增强后搜索命中仍生效', !!hitItem && hitItem.hit === true);

  // 复制到剪贴板仍用纯物品名（提醒文案不混入）
  page.copyListText(store3.getChecklist('college', 'id'));
  const copied = state3.clipboard || '';
  assert('复制清单不含提醒文案', copied.indexOf('报到当天必带') === -1 && copied.indexOf('录取通知书') !== -1, copied.slice(0, 80));
}

module.exports = { run, name: 'content' };
