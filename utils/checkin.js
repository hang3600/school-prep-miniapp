/**
 * 打卡提醒数据层（纯本地，无后端）
 * --------------------------------------------------
 * 存储 key：schoolprep_checkin_v1
 * 结构：{ enabled: Boolean, hour: Number(0-23), records: ['2026-09-03', ...], lastTipDate: 'YYYY-MM-DD' }
 *
 * 说明：微信小程序无后台定时推送能力（订阅消息需服务端），
 * 因此「提醒」落地为：记录偏好 + 用户下次打开小程序时提示（见 shouldRemind）。
 */

const KEY = 'schoolprep_checkin_v1';

function pad(n) { return n < 10 ? '0' + n : '' + n; }

// 本地日期 key（YYYY-MM-DD），按自然日而非 UTC，避免跨时区算错
function dateKey(d) {
  const dt = d || new Date();
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
}

// 内存缓存：与 utils/store.js 同构。本模块每个 API 都调 read()，
// 而 reminder.refresh() 一次要读 2 次、首页 maybeRemind() 再读 1 次，加缓存后收敛为 1 次。
// 唯一例外：外部直接 wx.removeStorageSync(KEY)（重置/退出）时必须一并调 clearCache()。
let _cache = null;

function read() {
  if (_cache) return _cache;
  let state = null;
  try {
    const raw = wx.getStorageSync(KEY);
    if (raw && Array.isArray(raw.records)) {
      state = {
        enabled: !!raw.enabled,
        hour: typeof raw.hour === 'number' ? raw.hour : 20,
        records: raw.records.slice(),
        lastTipDate: raw.lastTipDate || ''
      };
    }
  } catch (e) {
    // ignore
  }
  if (!state) state = { enabled: false, hour: 20, records: [], lastTipDate: '' };
  _cache = state;
  return _cache;
}

function write(state) {
  _cache = state;
  try {
    wx.setStorageSync(KEY, state);
  } catch (e) {
    // 存储失败时静默，不影响本次会话展示
  }
}

// 外部直接清了 storage 时调用，避免下次 read() 返回已删除的旧对象
function clearCache() {
  _cache = null;
}

// ===== 对外 API =====

function getState() { return read(); }

function setEnabled(enabled) {
  const s = read();
  s.enabled = !!enabled;
  write(s);
  return s;
}

function setHour(hour) {
  const h = Math.max(0, Math.min(23, Number(hour) || 0));
  const s = read();
  s.hour = h;
  write(s);
  return s;
}

function isCheckedInToday() {
  return read().records.indexOf(dateKey()) !== -1;
}

// 打卡：写入今天（幂等，重复调用不产生重复记录）
function checkIn() {
  const s = read();
  const today = dateKey();
  if (s.records.indexOf(today) === -1) {
    s.records.push(today);
    s.records.sort();
    write(s);
  }
  return s;
}

// 统计：连续天数 / 累计天数 / 近 7 天（旧→新）
function stats() {
  const s = read();
  const set = {};
  s.records.forEach((d) => { set[d] = true; });

  // 连续天数：以今天为终点向前回溯；今天没打卡则从昨天起算（不中断已有连击）
  let cursor = new Date();
  if (!set[dateKey(cursor)]) {
    cursor = new Date(cursor.getTime() - 86400000);
  }
  let streak = 0;
  while (set[dateKey(cursor)]) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }

  // 近 7 天（含今天，旧→新）
  const week = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    week.push({ key: dateKey(d), label: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()], checked: !!set[dateKey(d)], today: i === 0 });
  }

  return { streak, total: s.records.length, week, checkedInToday: !!set[dateKey()] };
}

// 是否该提醒：开启提醒 + 到点（当前小时 >= 设定小时）+ 今天未打卡 + 今天未提示过
function shouldRemind() {
  const s = read();
  if (!s.enabled) return false;
  if (isCheckedInToday()) return false;
  if (s.lastTipDate === dateKey()) return false;
  return new Date().getHours() >= s.hour;
}

// 标记今天已提示，避免同日重复打扰
function markTipped() {
  const s = read();
  s.lastTipDate = dateKey();
  write(s);
}

// 退出登录 / 重置：清空打卡数据（含内存缓存，否则读到的还是被删前的旧对象）
function reset() {
  _cache = null;
  try { wx.removeStorageSync(KEY); } catch (e) {}
}

module.exports = {
  STORAGE_KEY: KEY,
  dateKey,
  getState,
  setEnabled,
  setHour,
  isCheckedInToday,
  checkIn,
  stats,
  shouldRemind,
  markTipped,
  reset,
  clearCache
};
