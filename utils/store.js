/**
 * 本地存储数据层（新生清单小程序）
 * --------------------------------------------------
 * 所有清单数据存于 wx.storage 单一 key，结构：
 * {
 *   stage: 'college',
 *   lists: {
 *     college: { id:[item], soap:[item], ... },
 *     high:    { ... },
 *     middle:  { ... },
 *     primary: { ... }
 *   }
 * }
 * item = { id, name, must:Boolean, status:Number, decision:Number }
 *   status 三态（进度）：0 未准备 / 1 已备好 / 2 已装包
 *     （老数据 done:Boolean 在 read() 时自动迁移：done=true → status=2）
 *   decision 三态（决策，与 status 解耦）：0 从家带 / 1 到校买 / 2 到校再定
 *     借鉴竞品「四态勾选」里「到校买 / 到校再定」两个真实决策，
 *     与 status 组合成事实四态（进度圈 + 决策标签两个维度），不影响原有进度统计。
 *     提醒文案（tip）为静态内容，不入库，渲染时由 content-enrich 按名称动态查。
 * 首次启动自动写入种子清单；勾选 / 添加自定义物品都会持久化。
 *
 * 2026-11-22 八大分类重排：竞品 10 类拆解合并为 8 类（172 件），
 * 分类 / 物品 / 必带 / 核心白名单的单源在 content-enrich.EIGHT_CATEGORIES，
 * 本文件只做数据层编排（学段裁剪、迁移、进度统计）。
 */

// 八大分类 / 172 件物品 / 必带与核心白名单的唯一来源
const content = require('./content-enrich.js');

const KEY = 'schoolprep_v1';

const STAGE_KEYS = ['college', 'high', 'middle', 'primary'];
// 顺序与 categories.js / EIGHT_CATEGORIES 严格一致，保证「下一步」与宫格视觉同序
const CAT_KEYS = content.EIGHT_CATEGORIES.map((c) => c.key);

// 各分类默认种子：从 EIGHT_CATEGORIES 派生（竞品 172 件，一件不丢）。
// names 顺序即种子序号（id 后缀），前 must 条为必带，其余选带。
// 大学为默认基准（172 件）；学段差异由下方 STAGE_EXTRA_ITEMS / STAGE_EXCLUDE 裁剪。
const SEED_ITEMS = {};
content.EIGHT_CATEGORIES.forEach((c) => {
  SEED_ITEMS[c.key] = c.names.map((name, i) => ({ name, must: i < c.must }));
});

// ===== 学段专属物品（共用 172 件之外，按学段追加）=====
// 设计原则：
// ① 大学学段不动（保持 172 件，作为默认基准与迁移锚点）
// ② 序号从共用清单长度之后连续编排，天然 ≥ LEGACY_SEED_COUNTS，
//    老用户 migrate() 会自动追加这些新种子（已勾选项不受影响）
// ③ 只追加不删除：老用户已有清单不会被裁剪，避免丢失勾选进度
// ④ 八大分类后按语义归位：雨衣 / 保温杯 / 小雨伞归住宿寝室（竞品宿舍类），
//    提神饮品归药品健康，避免塞进「洗漱护理」造成语义错配。
const STAGE_EXTRA_ITEMS = {
  high: {
    // 高中：走读/住校，学业压力大，强调复习资料与作息用品
    book: [
      { name: '错题本 ×2', must: true },
      { name: '高考真题卷', must: false },
      { name: '充电台灯', must: true },
      { name: '计时器', must: false }
    ],
    id: [{ name: '学籍档案', must: true }],
    med: [{ name: '咖啡 / 提神饮品', must: false }],
    laptop: [{ name: '学习平板（选带）', must: false }]
  },
  middle: {
    // 初中：日常走读，物品更轻，强调校服与练习
    book: [
      { name: '练习册', must: true },
      { name: '字帖', must: false },
      { name: '书包（轻便款）', must: false }
    ],
    shirt: [{ name: '校服 ×2', must: true }],
    bed: [{ name: '雨衣', must: false }],
    id: [{ name: '学生卡', must: true }]
  },
  primary: {
    // 小学：家长代劳，强调姓名标识、低龄友好餐具与文具
    id: [{ name: '姓名贴 / 姓名章', must: true }],
    bed: [
      { name: '儿童保温杯', must: true },
      { name: '小雨伞（儿童款）', must: false }
    ],
    book: [
      { name: '铅笔套装', must: true },
      { name: '橡皮 + 直尺', must: true },
      { name: '拼音练习本', must: false }
    ],
    shirt: [{ name: '校服 ×2', must: true }],
    laptop: [] // 小学不带电脑，共用清单里的电脑类由「快速模式」过滤掉
  }
};

// 学段排除表：从共用清单里剔除明显不适合该学段的物品（按竞品新名字）。
// 小学：不带手机/电脑/插排与床帘等住校装备（多为走读、家长代劳）
// 初中：不含床帘与平板/移动硬盘（部分走读），但保留军训主体
const STAGE_EXCLUDE = {
  primary: {
    laptop: ['手机', '手机充电器', '笔记本电脑', '电脑充电器和电脑包', 'U盘', '多孔插排'],
    mil: ['高倍防晒霜或防晒喷雾', '军训鞋垫', '替换鞋垫', '防磨脚贴', '芦荟胶或晒后修护用品'],
    bed: ['床帘（按宿舍规定）', '凉席（按季节）', '床垫或褥子']
  },
  middle: {
    bed: ['床帘（按宿舍规定）'],
    laptop: ['平板和手写笔（按需）', '移动硬盘（按需）']
  }
};

// 核心物品白名单（快速模式）：从 172 件里挑最高频的 20 件。
// 与 EIGHT_CATEGORIES.core 单源对齐（5+3+2+3+3+4=20），用户自定义物品不参与核心模式。
const CORE_ITEM_NAMES = content.EIGHT_CATEGORIES.reduce((out, c) => out.concat(c.core), []);
const CORE_SET = CORE_ITEM_NAMES.reduce((m, n) => { m[n] = true; return m; }, {});

// 老物品名 → 竞品新名别名：8 类重排时我们旧种子名被竞品名替换，
// 老用户 storage 里仍是旧名，migrate 按别名命中核心白名单，
// 否则升级后 core 标记全丢、核心模式看不到自己勾过的物品。
const LEGACY_NAME_ALIASES = {
  '身份证': '身份证原件',
  '户口本复印件': '户口本主页和本人页复印件',
  '一寸证件照（红底·蓝底）': '一寸和二寸证件照',
  '二寸证件照': '一寸和二寸证件照',
  '银行卡': '学校指定银行卡',
  '牙刷 + 牙膏': '牙刷、牙膏和漱口杯',
  '毛巾 ×2': '毛巾',
  '洗发水 + 沐浴露': '洗发水',
  '床单 + 被套': '床单',
  '枕头': '枕头和枕套',
  '插线板': '多孔插排',
  '充电器': '手机充电器',
  'T恤 ×5': '应季上衣',
  '中性笔': '黑色、蓝色和红色签字笔',
  '双肩书包': '日常书包',
  '常用药包（感冒药·创可贴）': '常用感冒药'
};
function isCoreName(name) {
  return !!CORE_SET[name] || !!CORE_SET[LEGACY_NAME_ALIASES[name] || ''];
}

// 老版本种子分界：7 分类时代各分类的种子条数。
// 迁移时只给老用户追加「序号 ≥ 分界」的新种子，已删除的旧种子不复活。
// med 为新分类（老数据不存在），走「缺分类全量补种」分支，这里记 0 仅作兜底。
const LEGACY_SEED_COUNTS = { id: 7, soap: 8, book: 6, bed: 5, laptop: 6, shirt: 6, mil: 10, med: 0 };

// 生成某学段某分类的种子物品数组（id 唯一：s_学段_分类_序号）
function seedItems(stage, cat) {
  const excl = (STAGE_EXCLUDE[stage] && STAGE_EXCLUDE[stage][cat]) || [];
  const baseAll = SEED_ITEMS[cat] || [];
  const extra = (STAGE_EXTRA_ITEMS[stage] && STAGE_EXTRA_ITEMS[stage][cat]) || [];
  // 关键：先固定原始序号再过滤。若 filter 后才编序号，排除项会让后续 id 左移，
  // 老用户数据里 id_0 指向的物品会与新种子含义错位，migrate 的 exists 判定失效。
  const combined = baseAll
    .map((it, i) => ({ it, idx: i }))
    .filter(({ it }) => excl.indexOf(it.name) === -1)
    .concat(extra.map((it, j) => ({ it, idx: baseAll.length + j })));
  return combined.map(({ it, idx }) => ({
    id: 's_' + stage + '_' + cat + '_' + idx,
    name: it.name,
    must: !!it.must,
    core: isCoreName(it.name),
    status: 0,
    decision: 0 // 默认从家带；竞品四态里的「到校买/到校再定」由用户自行切换
  }));
}

function buildSeed() {
  const lists = {};
  STAGE_KEYS.forEach((stage) => {
    lists[stage] = {};
    CAT_KEYS.forEach((cat) => {
      lists[stage][cat] = seedItems(stage, cat);
    });
  });
  // 新用户种子已按 STAGE_EXCLUDE 过滤，直接带迁移标记，避免多一次空跑写盘
  return { stage: 'college', stageExcludeV1: true, lists };
}

// 老版本数据迁移（有变更返回 true，由 read() 决定回写）：
// ① item.done:Boolean → item.status（true → 2 已装包）
// ② 种子增量补全：缺整个分类（如老数据的军训）全量补种；已有分类只追加
//    「序号 ≥ LEGACY_SEED_COUNTS」的新种子——用户删过的旧种子不会复活。
// ③ 一次性学段清单清理（stageExcludeV1）：剔除老用户清单里不适合该学段的
//    种子物品（如小学的笔记本电脑、军训腰带）。带版本标记，只跑一次；
//    只删种子项（s_ 前缀），用户自定义的同名物品（c_ 前缀）永远保留。
//    取舍：会丢失这些物品的勾选状态——换取「分学段」卖点对老用户也成立。
function migrate(state) {
  let touched = false;

  // ③ 一次性学段清理：只执行一次，执行后打标记永久跳过
  if (!state.stageExcludeV1) {
    STAGE_KEYS.forEach((stage) => {
      const list = state.lists[stage];
      if (!list) return;
      const exclude = STAGE_EXCLUDE[stage] || {};
      CAT_KEYS.forEach((cat) => {
        const names = exclude[cat];
        const arr = list[cat];
        if (!names || !names.length || !arr) return;
        const kept = arr.filter((it) =>
          !((typeof it.id === 'string' && it.id.indexOf('s_') === 0) && names.indexOf(it.name) !== -1)
        );
        if (kept.length !== arr.length) {
          list[cat] = kept; // 只删种子项，自定义同名物品（c_ 前缀）保留
          touched = true;
        }
      });
    });
    state.stageExcludeV1 = true;
    touched = true;
  }

  STAGE_KEYS.forEach((stage) => {
    const list = state.lists[stage];
    if (!list) return;
    CAT_KEYS.forEach((cat) => {
      const arr = list[cat];
      if (!arr) {
        // 老数据缺整个分类：全量补种
        list[cat] = seedItems(stage, cat);
        touched = true;
        return;
      }
      // 增量补种：仅追加新序号种子（已删除的旧序号不复活）
      const exists = {};
      arr.forEach((x) => { exists[x.id] = true; });
      const fresh = seedItems(stage, cat).filter((it) => {
        const idx = Number(it.id.split('_').pop());
        return idx >= (LEGACY_SEED_COUNTS[cat] || 0) && !exists[it.id];
      });
      if (fresh.length) {
        fresh.forEach((it) => arr.push(it));
        touched = true;
      }
      // 状态字段迁移
      arr.forEach((it) => {
        if (typeof it.status !== 'number') {
          it.status = it.done ? 2 : 0;
          touched = true;
        }
        if ('done' in it) delete it.done;
        // core 快速模式标记：老数据无此字段，按名称白名单补标（不影响勾选状态）
        if (typeof it.core !== 'boolean') {
          const c = isCoreName(it.name);
          it.core = c;
          if (c) touched = true; // 仅 true 时回写，false 用默认值即可，减少写盘
        }
        // decision 决策字段：老数据无此字段，内存补默认 0（从家带），不触发写盘
        // （缺省值与默认一致，无需持久化；用户切换决策时 cycleDecision 会正常写盘）
        if (typeof it.decision !== 'number') it.decision = 0;
      });
    });
  });
  return touched;
}

// 内存缓存：state 对象在模块级持有，避免「一次页面刷新 = 十次 getStorageSync」。
// 背景：getStorageSync 是同步 IO，会阻塞 JS 线程；而本层每个 API 都调 read()，
// 首页 refresh() 一次就是 10 次读 + 10 次全量 migrate 遍历（体验分「重复 storage 读取」告警源）。
// 小程序 JS 单线程、store 模块单实例，所有写操作都走 write()，缓存一致性可保证。
// 唯一例外：外部直接 wx.removeStorageSync(KEY)（退出登录/重置）时必须一并调 clearCache()。
let _cache = null;

function read() {
  if (_cache) return _cache;
  try {
    const raw = wx.getStorageSync(KEY);
    if (raw && raw.lists) {
      if (migrate(raw)) write(raw);
      _cache = raw;
      return _cache;
    }
  } catch (e) {
    // ignore
  }
  // 首启：内存里建好种子即可满足渲染，写盘延后到异步 wx.setStorage，
  // 避免同步 setStorageSync（4 学段 × 172 项）阻塞首屏。写盘失败仅影响持久化，
  // 下次启动重新建种（幂等、无副作用），不影响本次会话内存展示。
  const seed = buildSeed();
  _cache = seed;
  try { wx.setStorage(KEY, seed); } catch (e) { /* 写盘失败不影响使用 */ }
  return _cache;
}

function write(state) {
  _cache = state;
  try {
    wx.setStorageSync(KEY, state);
  } catch (e) {
    // 存储失败（极少数机型/隐私限制）时静默，不影响本次会话内存中的展示
  }
}

// 清空内存缓存（配合外部 wx.removeStorageSync(KEY) 使用，避免重置后仍返回旧数据）
function clearCache() {
  _cache = null;
}

// ===== 对外 API =====

function getState() {
  return read();
}

function getStage() {
  return read().stage || 'college';
}

function setStage(stage) {
  if (STAGE_KEYS.indexOf(stage) === -1) return;
  const s = read();
  s.stage = stage;
  // 用户主动选择过学段后置标记，用于首页「首次学段引导」只出现一次
  s.stageChosen = true;
  write(s);
}

// 是否已明确选择过学段（未选择则首页首次进入弹学段引导）
function hasChosenStage() {
  return !!read().stageChosen;
}

// 仅标记已选择（不改变学段），用于兼容老用户：已改过学段的无须再引导
function markStageChosen() {
  const s = read();
  if (!s.stageChosen) {
    s.stageChosen = true;
    write(s);
  }
}

// 某学段某分类的物品数组（返回副本，避免外部直接改存储对象）
function getChecklist(stage, cat, coreOnly) {
  const s = read();
  const arr = (s.lists[stage] && s.lists[stage][cat]) || [];
  const list = coreOnly ? arr.filter((it) => it.core) : arr;
  return list.map((it) => ({ ...it }));
}

// 快速模式开关：持久化在 state.coreMode（默认 false = 完整清单）
function getCoreMode() { return !!read().coreMode; }
function setCoreMode(on) {
  const s = read();
  s.coreMode = !!on;
  write(s);
}

// 下一个仍有未装包物品的分类 key（按 CAT_KEYS 固定顺序，从「当前分类之后」向前顺位查找，到末尾回绕到最前）。
// 这样用户在一个分类里整理时，「下一个待整理」指向其后顺位的未完成分类（如 衣物→军训），
// 而不是像旧逻辑那样永远回跳到数组最前的「生活用品」。
// 当前分类自身永不作为「下一步」返回；全部完成、或仅当前分类有未完成时返回 null，调用方据此决定是否展示「下一步」。
function nextIncompleteCat(stage, currentCat, coreOnly) {
  const idx = CAT_KEYS.indexOf(currentCat);
  const n = CAT_KEYS.length;
  const start = idx < 0 ? 0 : idx + 1; // 从「当前分类之后」开始，不原地打转
  for (let k = 0; k < n; k++) {
    const cat = CAT_KEYS[(start + k) % n];
    if (cat === currentCat) continue; // 排除自身
    const items = getChecklist(stage, cat, coreOnly);
    if (items.some((it) => (it.status || 0) !== 2)) return cat;
  }
  return null;
}

// 单分类进度 { total, ready, packed, readyPercent, packedPercent, complete }
// ready = 已备好 + 已装包（status>=1），与首页/清单页头条「准备好了」口径一致；
// packedPercent / complete 用于进度页「分类完成度」与「下一步」判定（complete 当且仅当全部装包）。
function computeCatProgress(stage, cat, coreOnly) {
  const items = getChecklist(stage, cat, coreOnly);
  const total = items.length;
  let ready = 0;
  let packed = 0;
  items.forEach((it) => {
    const st = it.status || 0;
    if (st >= 1) ready += 1;
    if (st === 2) packed += 1;
  });
  return {
    total,
    ready,
    packed,
    readyPercent: total === 0 ? 0 : Math.round((ready / total) * 100),
    packedPercent: total === 0 ? 0 : Math.round((packed / total) * 100),
    complete: total > 0 && packed === total
  };
}

// 三态循环：未备(0) → 已备(1) → 已装包(2) → 未备(0)
function cycleItem(stage, cat, id) {
  const s = read();
  const arr = s.lists[stage] && s.lists[stage][cat];
  if (!arr) return;
  const it = arr.find((x) => x.id === id);
  if (it) {
    it.status = ((it.status || 0) + 1) % 3;
    write(s);
  }
}

// 决策三态循环：从家带(0) → 到校买(1) → 到校再定(2) → 从家带(0)
// 借鉴竞品「到校买 / 到校再定」两个真实决策，与 status 进度解耦：
// 「到校买」= 不用从家背，到学校再买；「到校再定」= 等学校通知再决定。
function cycleDecision(stage, cat, id) {
  const s = read();
  const arr = s.lists[stage] && s.lists[stage][cat];
  if (!arr) return;
  const it = arr.find((x) => x.id === id);
  if (it) {
    it.decision = ((typeof it.decision === 'number' ? it.decision : 0) + 1) % 3;
    write(s);
  }
}

// 从清单中移除一个物品（长按删除；种子与自定义物品均可移除）
function removeItem(stage, cat, id) {
  const s = read();
  const arr = s.lists[stage] && s.lists[stage][cat];
  if (!arr) return;
  const i = arr.findIndex((x) => x.id === id);
  if (i > -1) {
    arr.splice(i, 1);
    write(s);
  }
}

function addItem(stage, cat, payload) {
  const s = read();
  if (!s.lists[stage]) s.lists[stage] = {};
  if (!s.lists[stage][cat]) s.lists[stage][cat] = [];
  const name = payload.qty > 1 ? payload.name + ' ×' + payload.qty : payload.name;
  s.lists[stage][cat].push({
    id: 'c_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name,
    must: !!payload.must,
    core: getCoreMode(),
    status: 0,
    decision: 0
  });
  write(s);
}

// 单学段总进度 { done, total, percent }（done = 已备好 + 已装包，即「准备好了」）
function computeStageProgress(stage, coreOnly) {
  const s = read();
  let done = 0;
  let total = 0;
  CAT_KEYS.forEach((cat) => {
    const arr = (s.lists[stage] && s.lists[stage][cat]) || [];
    arr.forEach((it) => {
      if (coreOnly && !it.core) return;
      total += 1;
      if ((it.status || 0) >= 1) done += 1;
    });
  });
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

// 全部学段进度数组（供进度中心页）
function computeAllStages(coreOnly) {
  return STAGE_KEYS.map((stage) => ({
    key: stage,
    percent: computeStageProgress(stage, coreOnly).percent
  }));
}

// 开学日期（'YYYY-MM-DD'，未设置返回空串）：倒计时 + 分阶段建议的数据源
function getSchoolDate() {
  return read().schoolDate || '';
}

function setSchoolDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
  const s = read();
  s.schoolDate = date;
  write(s);
}

// 距开学天数：未设置返回 null；0 = 今天开学；负数 = 已开学 N 天。
// 单源给首页倒计时与清单页完成卡共用（时区安全：手动解析 YYYY-MM-DD，不用 Date(str)）。
function daysUntilSchool() {
  const p = (getSchoolDate() || '').split('-').map(Number);
  if (p.length !== 3 || p.some(isNaN)) return null;
  const target = new Date(p[0], p[1] - 1, p[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

// 仅重置某学段所有物品状态为「未备(0)」，自定义物品与清单结构保留
function resetStageProgress(stage) {
  if (STAGE_KEYS.indexOf(stage) === -1) return;
  const s = read();
  const list = s.lists[stage];
  if (!list) return;
  CAT_KEYS.forEach((cat) => {
    (list[cat] || []).forEach((it) => { it.status = 0; });
  });
  write(s);
}

// 把物品数组拆成「必带 / 选带」两个分组，供清单详情页渲染
function groupByMust(items) {
  const must = items.filter((it) => it.must).map((it) => ({ ...it }));
  const optional = items.filter((it) => !it.must).map((it) => ({ ...it }));
  const groups = [];
  if (must.length) groups.push({ name: '必带', open: true, items: must });
  if (optional.length) groups.push({ name: '选带', open: false, items: optional });
  return groups;
}

module.exports = {
  STAGE_KEYS,
  CAT_KEYS,
  STORAGE_KEY: KEY,
  getState,
  getStage,
  setStage,
  getCoreMode,
  setCoreMode,
  hasChosenStage,
  markStageChosen,
  getChecklist,
  cycleItem,
  cycleDecision,
  removeItem,
  addItem,
  computeStageProgress,
  computeCatProgress,
  computeAllStages,
  getSchoolDate,
  setSchoolDate,
  daysUntilSchool,
  resetStageProgress,
  groupByMust,
  nextIncompleteCat,
  clearCache
};
