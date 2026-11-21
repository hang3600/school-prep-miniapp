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
}

module.exports = { run, name: 'store' };
