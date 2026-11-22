/**
 * 开学时间带 · 单源
 * --------------------------------------------------
 * 首页大时间带 + 分类/进度页迷你时间带共用同一套分段口径、倒计时文案与日期解析。
 * 纯逻辑层：只经 store 的读取接口取开学日期，不碰 UI。
 * 抽出原因：评审第 4 条「首页时间带母题向内页延伸」——内页若各写一套分段，
 * 口径会漂移；收口到此，首页改分段时内页自动跟随。
 */
const store = require('./store.js');

// 时间带四段：22+/8+/3+/0（与 COUNTDOWN_ADVICE 分段口径一致）
const PHASE_BANDS = [
  { key: 'calm', label: '从容期', min: 22 },
  { key: 'buy', label: '采购期', min: 8 },
  { key: 'pack', label: '打包期', min: 3 },
  { key: 'go', label: '出发', min: 0 }
];

// 分阶段准备建议：按「距开学剩余天数」给当下最该做的事
const COUNTDOWN_ADVICE = [
  { min: 22, text: '从容期：先把证件照、复印件这些要跑腿的办掉，行李慢慢置办。' },
  { min: 8, text: '采购期：大件和网购的这周下单，留足发货时间。' },
  { min: 3, text: '打包期：开始装箱，先装不常用的，证件放随身包。' },
  { min: 1, text: '出发前：过一遍必带清单，充电宝充满电。' },
  { min: 0, text: '今天开学，祝你报到顺利！' },
  { min: -Infinity, text: '已开学：缺什么照着清单补齐就好。' }
];

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// 日历日期文本：'9 月 1 日 · 星期二'（时区安全：手动解析 YYYY-MM-DD，不用 Date(str)）
function schoolDateText() {
  try {
    const raw = store.getSchoolDate();
    if (!raw) return '';
    const parts = raw.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return Number(parts[1]) + ' 月 ' + Number(parts[2]) + ' 日 · ' + WEEKDAYS[d.getDay()];
  } catch (e) {
    return '';
  }
}

// 首页倒计时全量状态。
// 字段与旧 home.refreshCountdown 逐字一致，首页改为调用本函数后行为不变。
function countdownState(diff) {
  if (diff === null) {
    return {
      countdownText: '设置开学日期',
      advice: '设置后按剩余天数给你分阶段准备建议',
      activePhase: -1,
      daysLeft: null,
      schoolDateText: '',
      cdEdit: '去设置'
    };
  }

  let countdownText;
  let advice;
  let activePhase;
  if (diff > 0) {
    countdownText = '距开学还有 ' + diff + ' 天';
    advice = COUNTDOWN_ADVICE.find((a) => diff >= a.min).text;
    activePhase = PHASE_BANDS.findIndex((b) => diff >= b.min);
  } else if (diff === 0) {
    countdownText = '今天开学';
    advice = COUNTDOWN_ADVICE[4].text;
    activePhase = 3;
  } else {
    countdownText = '已开学 ' + -diff + ' 天';
    advice = COUNTDOWN_ADVICE[5].text;
    activePhase = 3;
  }

  return {
    countdownText,
    advice,
    activePhase,
    daysLeft: Math.abs(diff),
    schoolDateText: schoolDateText(),
    cdEdit: '修改'
  };
}

// 内页迷你时间带数据：把首页「刻度」母题压成一条细带，只报阶段 + 天数，不抢内页主角。
// 未设置日期时给一句轻声引导，activePhase=-1 让四段全灰（与首页未设置态一致）。
function miniStrip(diff) {
  if (diff === null) {
    return {
      phaseLabel: '开学倒计时',
      dayText: '设个开学日期，跟着节奏走',
      activePhase: -1
    };
  }
  let phaseLabel;
  let dayText;
  let activePhase;
  if (diff > 0) {
    activePhase = PHASE_BANDS.findIndex((b) => diff >= b.min);
    phaseLabel = PHASE_BANDS[activePhase].label;
    dayText = diff + ' 天后开学';
  } else if (diff === 0) {
    activePhase = 3;
    phaseLabel = '今天开学';
    dayText = '今天开学';
  } else {
    activePhase = 3;
    phaseLabel = '出发';
    dayText = '已开学 ' + -diff + ' 天';
  }
  return { phaseLabel, dayText, activePhase };
}

module.exports = {
  PHASE_BANDS,
  COUNTDOWN_ADVICE,
  schoolDateText,
  countdownState,
  miniStrip
};
