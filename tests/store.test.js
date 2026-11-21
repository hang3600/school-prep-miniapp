/**
 * 数据层回归：store.js
 * 覆盖：种子清单 / 内存缓存 / 三态勾选 / 删除 / 老数据迁移 / 开学日期 / 进度口径
 */

const { assert, makeState, makeEnv } = require('./harness.js');

function run() {
  // ---------- 1. 种子清单 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    assert('种子分类 7 个（含军训）', store.CAT_KEYS.length === 7 && store.CAT_KEYS.indexOf('mil') !== -1);
    assert('学段 4 个', store.STAGE_KEYS.length === 4);
    assert('军训种子 10 条', store.getChecklist('college', 'mil').length === 10);

    let total = 0;
    store.CAT_KEYS.forEach((c) => {
      total += store.getChecklist('college', c).length;
    });
    assert('单学段种子共 75 件', total === 75, total);
    assert('种子默认 status=0', store.getChecklist('college', 'id').every((it) => it.status === 0));
  }

  // ---------- 1.5 下一步引导（进度导航衔接）----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const STAGE = 'college';
    const pack = (c) => store.getChecklist(STAGE, c).forEach((it) => { store.cycleItem(STAGE, c, it.id); store.cycleItem(STAGE, c, it.id); });

    // 初始：全未装包 → 第一个未完成是 id
    assert('初始 nextIncompleteCat(null)=id', store.nextIncompleteCat(STAGE, null) === 'id');
    assert('跳过当前 id → soap', store.nextIncompleteCat(STAGE, 'id') === 'soap');

    // 装包 id：跳过 id 后第一个未完成是 soap
    pack('id');
    assert('id 装包后 nextIncompleteCat(id)=soap', store.nextIncompleteCat(STAGE, 'id') === 'soap');
    assert('id 装包后 nextIncompleteCat(null)=soap', store.nextIncompleteCat(STAGE, null) === 'soap');

    // 仅保留 id 未完成：重置后只装「除 id 外」的分类（id 此刻归 0，其余装包）
    store.resetStageProgress(STAGE);
    store.CAT_KEYS.filter((c) => c !== 'id').forEach(pack);
    assert('仅 id 未完成时 nextIncompleteCat(id)=null', store.nextIncompleteCat(STAGE, 'id') === null);

    // 全部装包：reset 后所有分类装包（避免重复 cycle 把 status 又转走）
    store.resetStageProgress(STAGE);
    store.CAT_KEYS.forEach(pack);
    assert('全部装包 nextIncompleteCat(null)=null', store.nextIncompleteCat(STAGE, null) === null);
    assert('全部装包 nextIncompleteCat(mil)=null', store.nextIncompleteCat(STAGE, 'mil') === null);
  }

  // ---------- 1.5 向前顺位（修复：曾总回跳到最前未完成项，导致在「衣物」总显示「生活用品」）----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const STAGE = 'college';
    const pack = (c) => store.getChecklist(STAGE, c).forEach((it) => { store.cycleItem(STAGE, c, it.id); store.cycleItem(STAGE, c, it.id); });

    // 用户场景：证件装包，其余（含生活用品、军训）全未装，当前在「衣物」
    store.resetStageProgress(STAGE);
    pack('id');
    // 旧逻辑：在 shirt 中扫描跳过自身后，最前未完成的「生活用品」会被误当下一步
    assert('衣物中 下一步=军训(向前顺位，不再回跳生活用品)', store.nextIncompleteCat(STAGE, 'shirt') === 'mil');

    // 回绕：衣物之后全部装包、仅衣物自身未完成 → 自身排除，返回 null
    ['soap', 'book', 'bed', 'laptop', 'mil'].forEach(pack);
    const shirt = store.getChecklist(STAGE, 'shirt');
    store.cycleItem(STAGE, 'shirt', shirt[0].id);
    store.cycleItem(STAGE, 'shirt', shirt[0].id); // 衣物只装第一件，其余未装
    assert('仅衣物未完成时 衣物出发=null', store.nextIncompleteCat(STAGE, 'shirt') === null);

    // 中部分类向前：在「床品」中、其后「数码」未完成 → 返回 数码（非回跳证件）
    store.resetStageProgress(STAGE);
    pack('id');
    assert('床品中 下一步=数码(向前)', store.nextIncompleteCat(STAGE, 'bed') === 'laptop');
  }

  // ---------- 2. 内存缓存（本次审计修复项）----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    // 首次读取：1 次 getStorageSync（未命中 → 播种）
    store.getStage();
    const afterFirst = state.storageReads;
    assert('首次读取触发 1 次 getStorageSync', afterFirst === 1, afterFirst);

    // 模拟首页 refresh() 的调用规模：1 次 getStage + 1 次进度 + 7 次分类计数 + 1 次日期
    store.getStage();
    store.computeStageProgress('college');
    store.CAT_KEYS.forEach((c) => store.getChecklist('college', c));
    store.getSchoolDate();
    assert('10 次 API 调用后仍只 1 次 getStorageSync（缓存生效）', state.storageReads === 1, state.storageReads);

    // 缓存一致性：写入后读必须立刻可见
    const first = store.getChecklist('college', 'id')[0];
    store.cycleItem('college', 'id', first.id);
    assert('写入后读可见（缓存一致性）', store.getChecklist('college', 'id')[0].status === 1);

    // clearCache：配合外部 removeStorageSync 使用
    store.clearCache();
    store.getState();
    assert('clearCache 后重新读 storage', state.storageReads === 2, state.storageReads);
  }

  // ---------- 3. 三态循环 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    const id = store.getChecklist('college', 'id')[0].id;
    store.cycleItem('college', 'id', id);
    assert('一击 → 已备好(1)', store.getChecklist('college', 'id')[0].status === 1);
    store.cycleItem('college', 'id', id);
    assert('两击 → 已装包(2)', store.getChecklist('college', 'id')[0].status === 2);
    store.cycleItem('college', 'id', id);
    assert('三击 → 回到未备(0)', store.getChecklist('college', 'id')[0].status === 0);

    store.cycleItem('college', 'id', 'not_exist');
    assert('cycleItem 不存在 id 无副作用', store.getChecklist('college', 'id').length === 13);
  }

  // ---------- 4. 进度口径 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    const p0 = store.computeStageProgress('college');
    assert('初始进度 0%', p0.percent === 0 && p0.total === 75, JSON.stringify(p0));

    const id = store.getChecklist('college', 'id')[0].id;
    store.cycleItem('college', 'id', id); // →1 已备好
    const p1 = store.computeStageProgress('college');
    assert('已备好计入进度', p1.done === 1, JSON.stringify(p1));

    store.cycleItem('college', 'id', id); // →2 已装包
    assert('已装包仍计入进度（口径=准备好了）', store.computeStageProgress('college').done === 1);

    const all = store.computeAllStages();
    assert('computeAllStages 返回 4 学段', all.length === 4 && all[0].key === 'college');
  }

  // ---------- 5. 删除 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    const cnt = store.getChecklist('college', 'mil').length;
    store.removeItem('college', 'mil', store.getChecklist('college', 'mil')[0].id);
    assert('removeItem 删除一条', store.getChecklist('college', 'mil').length === cnt - 1);
    store.removeItem('college', 'mil', 'not_exist');
    assert('removeItem 不存在 id 无副作用', store.getChecklist('college', 'mil').length === cnt - 1);
  }

  // ---------- 6. 老数据迁移 ----------
  {
    const state = makeState({
      storage: {
        schoolprep_v1: {
          stage: 'college',
          lists: {
            college: {
              id: [
                { id: 'x1', name: '身份证', must: true, done: true },
                { id: 'x2', name: '银行卡', must: false, done: false }
              ]
            }
          }
        }
      }
    });
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    const migrated = store.getChecklist('college', 'id');
    assert('迁移 done=true → status=2', migrated[0].status === 2);
    assert('迁移 done=false → status=0', migrated[1].status === 0);
    assert('迁移后移除旧 done 字段', !('done' in migrated[0]));
    assert('缺分类全量补种（mil 10 条）', store.getChecklist('college', 'mil').length === 10);
    // 已有分类增量补种：id 原有 2 条自定义 + 序号 ≥ LEGACY_SEED_COUNTS.id(7) 的 6 条新种子 = 8
    // （序号 0-6 的老种子不补，避免用户已删除的物品复活——这是设计意图）
    assert('已有分类增量补种（2 自定义 + 6 新种子）', store.getChecklist('college', 'id').length === 8,
      store.getChecklist('college', 'id').length);
    const ids = store.getChecklist('college', 'id').map((x) => x.id);
    assert('老种子序号 0-6 不补种', !ids.includes('s_college_id_0') && !ids.includes('s_college_id_6'));
    assert('新种子序号 7+ 已补种', ids.includes('s_college_id_7') && ids.includes('s_college_id_12'));
  }

  // ---------- 7. 增量补种不复活已删种子 ----------
  {
    const state = makeState({
      storage: {
        schoolprep_v1: {
          stage: 'college',
          lists: {
            college: {
              // 模拟老用户：id 分类只剩 3 条旧种子（删掉了 4 条）
              id: [
                { id: 's_college_id_0', name: '身份证', must: true, status: 2 },
                { id: 's_college_id_1', name: '录取通知书', must: true, status: 2 },
                { id: 's_college_id_2', name: '户口本复印件', must: true, status: 0 }
              ]
            }
          }
        }
      }
    });
    const env = makeEnv(state);
    const store = env.load('utils/store.js');
    const arr = store.getChecklist('college', 'id');
    const ids = arr.map((x) => x.id);
    // 老分界 id=7：序号 0-6 是老种子（不复活），7-12 是新种子（应补种）
    assert('已删旧种子序号 3-6 不复活', !ids.includes('s_college_id_3') && !ids.includes('s_college_id_6'));
    assert('新种子序号 7+ 已补种', ids.includes('s_college_id_7') && ids.includes('s_college_id_12'));
    assert('总数 = 3 保留 + 6 新种子', arr.length === 9, arr.length);
  }

  // ---------- 8. 开学日期 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    assert('未设置日期返回空串', store.getSchoolDate() === '');
    store.setSchoolDate('2026-09-07');
    assert('设置合法日期', store.getSchoolDate() === '2026-09-07');
    store.setSchoolDate('bad-format');
    assert('非法格式被拒', store.getSchoolDate() === '2026-09-07');
    store.setSchoolDate('');
    assert('空串被拒', store.getSchoolDate() === '2026-09-07');
  }

  // ---------- 9. 学段切换与重置 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    assert('默认学段 college', store.getStage() === 'college');
    assert('未选过学段', store.hasChosenStage() === false);
    store.setStage('high');
    assert('切换学段生效', store.getStage() === 'high');
    assert('切换后标记已选', store.hasChosenStage() === true);
    store.setStage('bad_stage');
    assert('非法学段被拒', store.getStage() === 'high');

    const id = store.getChecklist('high', 'id')[0].id;
    store.cycleItem('high', 'id', id);
    store.resetStageProgress('high');
    assert('重置学段进度', store.getChecklist('high', 'id')[0].status === 0);
  }

  // ---------- 10. 学段差异化清单（竞品调研后新增）----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    const namesOf = (st) => {
      const out = [];
      store.CAT_KEYS.forEach((c) => store.getChecklist(st, c).forEach((it) => out.push(it.name)));
      return out;
    };
    const college = namesOf('college');
    const high = namesOf('high');
    const middle = namesOf('middle');
    const primary = namesOf('primary');

    assert('大学基准仍为 75 件', college.length === 75, college.length);
    assert('四学段清单互不相同', college.join('|') !== high.join('|')
      && high.join('|') !== middle.join('|') && middle.join('|') !== primary.join('|'));
    assert('高中有专属物品（错题本）', high.indexOf('错题本 ×2') !== -1);
    assert('初中有专属校服', middle.indexOf('校服 ×2') !== -1);
    assert('小学有姓名贴', primary.indexOf('姓名贴 / 姓名章') !== -1);
    assert('小学已排除笔记本电脑', primary.indexOf('笔记本电脑') === -1);
    assert('小学已排除军训腰带', primary.indexOf('腰带（配军训服）') === -1);
    assert('共用物品在各学段保留', high.indexOf('身份证') !== -1 && primary.indexOf('身份证') !== -1);

    // id 稳定性：同一分类同一序号在不同学段指向同名物品（迁移锚点不能错位）
    const c0 = store.getChecklist('college', 'id')[0];
    const p0 = store.getChecklist('primary', 'id')[0];
    assert('学段间 id 序号锚点名称一致', c0.name === p0.name && c0.name === '身份证');
  }

  // ---------- 11. 核心 20 件快速模式 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    assert('核心模式默认关闭', store.getCoreMode() === false);
    const full = store.computeStageProgress('college');
    const core = store.computeStageProgress('college', true);
    assert('核心模式 20 件', core.total === 20, core.total);
    assert('核心清单少于全量', core.total < full.total);
    assert('全量仍为 75 件', full.total === 75, full.total);
    assert('核心物品均带 core 标记', store.getChecklist('college', 'id', true).every((it) => it.core === true));
    assert('核心模式过滤非核心', store.getChecklist('college', 'id', true).length < store.getChecklist('college', 'id').length);

    store.setCoreMode(true);
    assert('核心模式开关持久化', store.getCoreMode() === true);
    const id = store.getChecklist('college', 'id', true)[0].id;
    store.cycleItem('college', 'id', id);
    assert('核心模式下仍可勾选', store.getChecklist('college', 'id', true)[0].status === 1);
    // 自定义物品在核心模式下加入时带 core 标记（用户主动加的必然可见）
    store.addItem('college', 'id', { name: '临时证件', qty: 1, must: true });
    assert('核心模式新增物品带 core', store.getChecklist('college', 'id')[store.getChecklist('college', 'id').length - 1].core === true);

    store.setCoreMode(false);
    assert('可切回完整模式', store.getCoreMode() === false);
  }

  // ---------- 12. 老用户迁移：core 字段补全 + 不破坏已勾选 ----------
  {
    const oldState = {
      stage: 'college',
      stageChosen: true,
      lists: { college: { id: [
        { id: 's_college_id_0', name: '身份证', must: true, status: 2 },
        { id: 's_college_id_1', name: '录取通知书', must: true, status: 1 }
      ] } }
    };
    const env = makeEnv(makeState({ storage: { schoolprep_v1: oldState } }));
    const store = env.load('utils/store.js');
    const idList = store.getChecklist('college', 'id');
    const a0 = idList.find((x) => x.id === 's_college_id_0');
    assert('老用户已装包状态保留', a0 && a0.status === 2);
    assert('老用户核心标记按名称补全', a0 && a0.core === true);
    assert('老用户自动补全新种子', idList.length > 2);
    assert('迁移后序号锚点不变', idList[0].name === '身份证');
  }

  // ---------- 13. 一次性学段清理（stageExcludeV1）----------
  {
    const oldState = {
      stage: 'primary',
      stageChosen: true,
      lists: {
        primary: {
          laptop: [
            { id: 's_primary_laptop_0', name: '笔记本电脑', must: true, status: 2 },
            { id: 's_primary_laptop_2', name: '插线板', must: true, status: 1 },
            { id: 's_primary_laptop_3', name: '充电宝', must: true, status: 2 },
            { id: 'c_12345_1', name: '笔记本电脑', must: false, status: 1 }
          ],
          mil: [
            { id: 's_primary_mil_8', name: '腰带（配军训服）', must: false, status: 2 },
            { id: 's_primary_mil_0', name: '防晒霜（SPF50+）', must: true, status: 1 }
          ]
        }
      }
    };
    const base = makeState({ storage: { schoolprep_v1: oldState } });
    const env = makeEnv(base);
    const store = env.load('utils/store.js');

    const lap = store.getChecklist('primary', 'laptop');
    const mil = store.getChecklist('primary', 'mil');
    assert('清理: 小学种子笔记本电脑已删', !lap.some((x) => x.id === 's_primary_laptop_0'));
    assert('清理: 小学种子插线板已删', !lap.some((x) => x.id === 's_primary_laptop_2'));
    assert('清理: 小学种子军训腰带已删', !mil.some((x) => x.id === 's_primary_mil_8'));
    assert('清理: 非排除种子保留且勾选不变', (lap.find((x) => x.id === 's_primary_laptop_3') || {}).status === 2);
    assert('清理: 未排除的军训物品保留', (mil.find((x) => x.id === 's_primary_mil_0') || {}).status === 1);
    assert('清理: 用户自定义同名物品保留', (lap.find((x) => x.id === 'c_12345_1') || {}).name === '笔记本电脑');
    assert('清理: 被删项未被增量补种回灌', !lap.some((x) => x.name === '插线板' && x.id.indexOf('s_') === 0));
    assert('清理: 迁移标记已写入', base.storage.schoolprep_v1.stageExcludeV1 === true);

    // 幂等：标记已打后，即使 storage 里再出现同名种子项也不再清理
    base.storage.schoolprep_v1.lists.primary.laptop.push(
      { id: 's_primary_laptop_0', name: '笔记本电脑', must: true, status: 0 }
    );
    store.clearCache();
    const env2 = makeEnv(base);
    const store2 = env2.load('utils/store.js');
    assert('清理幂等: 二次迁移不重复删除',
      store2.getChecklist('primary', 'laptop').some((x) => x.id === 's_primary_laptop_0'));
  }
}

module.exports = { run, name: 'store' };
