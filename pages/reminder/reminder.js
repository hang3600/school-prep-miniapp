const checkin = require('../../utils/checkin.js');
const share = require('../../utils/share.js');

const HOURS = [];
for (let i = 0; i <= 23; i += 1) HOURS.push(i);

Page({
  data: {
    hours: HOURS,
    hourIndex: 20,
    enabled: false,
    checkedInToday: false,
    streak: 0,
    total: 0,
    week: []
  },

  onLoad() {
    const seoApp = (typeof getApp === 'function') ? getApp() : null;
    if (seoApp && seoApp.globalData && typeof seoApp.globalData.applyPageMeta === 'function') {
      seoApp.globalData.applyPageMeta('pages/reminder/reminder');
    }
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const s = checkin.getState();
    const st = checkin.stats();
    this.setData({
      enabled: s.enabled,
      hourIndex: HOURS.indexOf(s.hour) === -1 ? 20 : HOURS.indexOf(s.hour),
      checkedInToday: st.checkedInToday,
      streak: st.streak,
      total: st.total,
      week: st.week
    });
  },

  // 今日打卡（幂等）
  onCheckIn() {
    if (this.data.checkedInToday) {
      wx.showToast({ title: '今天已经打过卡啦', icon: 'none' });
      return;
    }
    checkin.checkIn();
    this.refresh();
    if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' });
    // 里程碑激励（P1-10）：连续 7/14/21/30 天给更强反馈
    const s = this.data.streak;
    const milestone = [7, 14, 21, 30].indexOf(s) !== -1;
    wx.showToast({
      title: milestone ? '连续打卡 ' + s + ' 天，太棒了！' : '打卡成功，连续 ' + s + ' 天',
      icon: milestone ? 'success' : 'success',
      duration: 2500
    });
  },

  onToggleRemind(e) {
    checkin.setEnabled(e.detail.value);
    this.refresh();
    // 文案必须诚实：本小程序无后台推送能力（订阅消息需服务端），
    // 「提醒」只在用户打开小程序时提示（详见本页「关于提醒」说明），不能说成「每天推送」。
    wx.showToast({
      title: e.detail.value ? '已开启，打开时会提醒打卡' : '已关闭提醒',
      icon: 'none'
    });
  },

  onHourChange(e) {
    checkin.setHour(HOURS[Number(e.detail.value) || 0]);
    this.refresh();
  },

  onShareAppMessage() {
    return share.shareApp('reminder');
  },

  onShareTimeline() {
    return share.shareTimeline('reminder');
  }
});
