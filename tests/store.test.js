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

    assert('种子分类 8 个（含药品健康、军训）', store.CAT_KEYS.length === 8
      && store.CAT_KEYS.indexOf('med') !== -1 && store.CAT_KEYS.indexOf('mil') !== -1);
    assert('学段 4 个', store.STAGE_KEYS.length === 4);
    assert('军训种子 16 条', store.getChecklist('college', 'mil').length === 16);
    assert('药品健康种子 16 条', store.getChecklist('college', 'med').length === 16);

    let total = 0;
    store.CAT_KEYS.forEach((c) => {
      total += store.getChecklist('college', c).length;
    });
    assert('单学段种子共 172 件', total === 172, total);
    assert('八类件数 15/33/19/46/13/14/16/16',
      store.CAT_KEYS.map((c) => store.getChecklist('college', c).length).join('/') === '15/33/19/46/13/14/16/16');
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
    assert('跳过当前 id → bed（八类新顺序与宫格同序）', store.nextIncompleteCat(STAGE, 'id') === 'bed');

    // 装包 id：跳过 id 后第一个未完成是 bed
    pack('id');
    assert('id 装包后 nextIncompleteCat(id)=bed', store.nextIncompleteCat(STAGE, 'id') === 'bed');
    assert('id 装包后 nextIncompleteCat(null)=bed', store.nextIncompleteCat(STAGE, null) === 'bed');

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

    // 用户场景：证件装包，其余（含洗漱、军训）全未装，当前在「衣物鞋饰」
    store.resetStageProgress(STAGE);
    pack('id');
    // 旧逻辑：在 shirt 中扫描跳过自身后，最前未完成的分类会被误当下一步；新顺序下从 shirt 向前顺位是 soap
    assert('衣物中 下一步=洗漱护理(向前顺位，不再回跳证件)', store.nextIncompleteCat(STAGE, 'shirt') === 'soap');

    // 回绕：衣物之后全部装包、仅衣物自身未完成 → 自身排除，返回 null
    // id 已在上方装包，这里不再重复 pack（重复会 2→0→1，反而变回"未装包"）
    ['bed', 'soap', 'book', 'laptop', 'med', 'mil'].forEach(pack);
    const shirt = store.getChecklist(STAGE, 'shirt');
    store.cycleItem(STAGE, 'shirt', shirt[0].id);
    store.cycleItem(STAGE, 'shirt', shirt[0].id); // 衣物只装第一件，其余未装
    assert('仅衣物未完成时 衣物出发=null', store.nextIncompleteCat(STAGE, 'shirt') === null);

    // 中部分类向前：在「住宿寝室」中、其后「衣物鞋饰」未完成 → 返回 shirt（非回跳证件）
    store.resetStageProgress(STAGE);
    pack('id');
    assert('住宿寝室中 下一步=衣物鞋饰(向前)', store.nextIncompleteCat(STAGE, 'bed') === 'shirt');
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

    // 模拟首页 refresh() 的调用规模：1 次 getStage + 1 次进度 + 8 次分类计数 + 1 次日期
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
    assert('cycleItem 不存在 id 无副作用', store.getChecklist('college', 'id').length === 15);
  }

  // ---------- 4. 进度口径 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const store = env.load('utils/store.js');

    const p0 = store.computeStageProgress('college');
    assert('初始进度 0%', p0.percent === 0 && p0.total === 172, JSON.stringify(p0));

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
    assert('缺分类全量补种（mil 16 条）', store.getChecklist('college', 'mil').length === 16);
    // 已有分类增量补种：id 原有 2 条自定义 + 序号 ≥ LEGACY_SEED_COUNTS.id(7) 的 8 条新种子 = 10
    // （序号 0-6 的老种子不补，避免用户已删除的物品复活——这是设计意图）
    assert('已有分类增量补种（2 自定义 + 8 新种子）', store.getChecklist('college', 'id').length === 10,
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
    assert('总数 = 3 保留 + 8 新种子', arr.length === 11, arr.length);
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

    assert('大学基准仍为 172 件', college.length === 172, college.length);
    assert('四学段清单互不相同', college.join('|') !== high.join('|')
      && high.join('|') !== middle.join('|') && middle.join('|') !== primary.join('|'));
    assert('高中有专属物品（错题本）', high.indexOf('错题本 ×2') !== -1);
    assert('初中有专属校服', middle.indexOf('校服 ×2') !== -1);
    assert('小学有姓名贴', primary.indexOf('姓名贴 / 姓名章') !== -1);
    assert('小学已排除笔记本电脑', primary.indexOf('笔记本电脑') === -1);
    assert('小学已排除手机与军训鞋垫', primary.indexOf('手机') === -1 && primary.indexOf('军训鞋垫') === -1);
    // 身份证原件是大学专属（异地报到），低学段不带；共同物品是「少量现金」这类全学段项
    assert('身份证原件为大学专属', college.indexOf('身份证原件') !== -1
      && high.indexOf('身份证原件') === -1 && primary.indexOf('身份证原件') === -1);
    assert('全学段共用物品保留', primary.indexOf('少量现金') !== -1 && college.indexOf('少量现金') !== -1);

    // id 稳定性：同一物品在各学段 id 后缀（基础原始序号）保持一致，不因学段过滤而左移
    const cCash = store.getChecklist('college', 'id').find((x) => x.name === '少量现金');
    const pCash = store.getChecklist('primary', 'id').find((x) => x.name === '少量现金');
    // id 含学段前缀（college/primary），只需末尾序号一致即锚点稳定
    const suffix = (x) => x && x.id.split('_').pop();
    assert('学段间同物品 id 锚点一致', cCash && pCash && suffix(cCash) === suffix(pCash),
      cCash && pCash ? cCash.id + ' / ' + pCash.id : '缺失');
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
    assert('全量仍为 172 件', full.total === 172, full.total);
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
    assert('迁移后序号锚点不变（老数据保留原名）', idList[0].name === '身份证');
  }

  // ---------- 13. 一次性学段重建（stageTagsV2）----------
  {
    const oldState = {
      stage: 'primary',
      stageChosen: true,
      lists: {
        primary: {
          laptop: [
            { id: 's_primary_laptop_0', name: '笔记本电脑', must: true, status: 2 },
            { id: 's_primary_laptop_2', name: '多孔插排', must: true, status: 1 },
            { id: 's_primary_laptop_3', name: '充电宝', must: true, status: 2 },
            { id: 'c_12345_1', name: '笔记本电脑', must: false, status: 1 }
          ],
          mil: [
            { id: 's_primary_mil_1', name: '替换鞋垫', must: false, status: 2 },
            { id: 's_primary_mil_7', name: '纸巾和湿巾', must: true, status: 1 }
          ]
        }
      }
    };
    const base = makeState({ storage: { schoolprep_v1: oldState } });
    const env = makeEnv(base);
    const store = env.load('utils/store.js');

    const lap = store.getChecklist('primary', 'laptop');
    const mil = store.getChecklist('primary', 'mil');
    // 新模型：小学完全没有数码与军训用品（数码/军训标签均不含 P）
    assert('重建: 小学种子笔记本电脑已删', !lap.some((x) => x.id === 's_primary_laptop_0'));
    assert('重建: 小学种子多孔插排已删', !lap.some((x) => x.id === 's_primary_laptop_2'));
    assert('重建: 小学种子充电宝已删', !lap.some((x) => x.id === 's_primary_laptop_3'));
    assert('重建: 小学种子替换鞋垫已删', !mil.some((x) => x.id === 's_primary_mil_1'));
    assert('重建: 小学种子纸巾湿巾已删（军训属 MHC，小学无）', !mil.some((x) => x.id === 's_primary_mil_7'));
    assert('重建: 小学数码分类为空', lap.filter((x) => x.id.indexOf('s_') === 0).length === 0);
    assert('重建: 小学军训分类为空', mil.length === 0);
    assert('重建: 用户自定义同名物品保留', (lap.find((x) => x.id === 'c_12345_1') || {}).name === '笔记本电脑');
    assert('重建: 迁移标记已写入', base.storage.schoolprep_v1.stageTagsV2 === true);

    // 幂等：标记已打后，即使 storage 里再出现同名种子项也不再清理
    base.storage.schoolprep_v1.lists.primary.laptop.push(
      { id: 's_primary_laptop_0', name: '笔记本电脑', must: true, status: 0 }
    );
    store.clearCache();
    const env2 = makeEnv(base);
    const store2 = env2.load('utils/store.js');
    assert('重建幂等: 二次迁移不重复删除',
      store2.getChecklist('primary', 'laptop').some((x) => x.id === 's_primary_laptop_0'));
  }
}

module.exports = { run, name: 'store' };
