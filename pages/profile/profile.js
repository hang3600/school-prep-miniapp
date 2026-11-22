const store = require('../../utils/store.js');
const checkin = require('../../utils/checkin.js');
const share = require('../../utils/share.js');

const STAGE_LABELS = { college: '大学', high: '高中', middle: '初中', primary: '小学' };

// 徽章按当前学段打包进度解锁（0-4 枚）
function badgeOf(percent) {
  if (percent >= 100) return { count: 4, tip: '全部完成' };
  if (percent >= 80) return { count: 3, tip: '即将完成' };
  if (percent >= 50) return { count: 2, tip: '完成过半' };
  if (percent >= 25) return { count: 1, tip: '继续加油' };
  return { count: 0, tip: '刚开始' };
}

// 当前入学年级：按自然年，不按 9 月学年切分。
// 今年 = 当年级新生（如 2026 年任意时间都显示「2026 级新生」），
// 次年 1 月 1 日起自动滚到下一年（2027 年 → 「2027 级新生」）。
function currentGrade() {
  return new Date().getFullYear();
}

Page({
  data: {
    name: '新同学',
    stageLabel: '大学',
    grade: 2026,
    stats: [
      { key: 'done', value: 0, label: '已整理', trend: '暂无数据', trendType: 'mid' },
      { key: 'streak', value: 0, label: '连续天', trend: '累计 0 天', trendType: 'mid' },
      { key: 'badge', value: 0, label: '徽章', trend: '0/4 已解锁', trendType: 'mid' }
    ],
    groups: [
      {
        title: '常用',
        items: [
          { key: 'medal', icon: 'ic-medal', label: '我的成就' },
          { key: 'bell', icon: 'ic-bell', label: '打卡提醒' },
          { key: 'help', icon: 'ic-help', label: '使用帮助' }
        ]
      },
      {
        title: '其他',
        items: [
          { key: 'info', icon: 'ic-info', label: '关于我们' },
          { key: 'shield', icon: 'ic-shield', label: '隐私设置' },
          { key: 'reset', icon: 'ic-progress', label: '重置进度' }
        ]
      }
    ]
  },

  onLoad() {
    const seoApp = (typeof getApp === 'function') ? getApp() : null;
    if (seoApp && seoApp.globalData && typeof seoApp.globalData.applyPageMeta === 'function') {
      seoApp.globalData.applyPageMeta('pages/profile/profile');
    }
    // grade 改为自然年，在 onShow 中按当前日期刷新（切回页面即更新，跨年无需重启 App）
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    // 自然年年级：每次进入「我的」都按系统日期重算，保证 1 月 1 日自动滚到下一年（无 storage 读，安全）
    this.setData({ grade: currentGrade() });
    // 首屏渲染前不读 storage：首次加载延后到 onReady，切回 tab 时 _ready 已为真才刷新
    if (this._ready) this.refreshStats();
  },

  onReady() {
    this._ready = true;
    this.refreshStats();
  },

  // 用真实本地数据刷新顶部三卡（不再写死）
  refreshStats() {
    const stage = store.getStage();
    const stageLabel = STAGE_LABELS[stage] || '大学';
    const prog = store.computeStageProgress(stage, store.getCoreMode());
    const st = checkin.stats();
    const badge = badgeOf(prog.percent);

    this.setData({
      stageLabel,
      stats: [
        { key: 'done', value: prog.done, label: '已整理', trend: prog.total ? '共 ' + prog.total + ' 件' : '暂无数据', trendType: 'mid' },
        { key: 'streak', value: st.streak, label: '连续天', trend: '累计 ' + st.total + ' 天', trendType: 'mid' },
        { key: 'badge', value: badge.count, label: '徽章', trend: badge.count + '/4 已解锁', trendType: 'mid' }
      ]
    });
  },

  onMenuTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'medal') {
      wx.switchTab({ url: '/pages/progress/progress' });
    } else if (key === 'bell') {
      wx.navigateTo({ url: '/pages/reminder/reminder' });
    } else if (key === 'help') {
      wx.navigateTo({ url: '/pages/help/help' });
    } else if (key === 'info') {
      wx.navigateTo({ url: '/pages/about/about' });
    } else if (key === 'shield') {
      this.onOpenPrivacy();
    } else if (key === 'reset') {
      this.onResetProgress();
    } else {
      wx.showToast({ title: '功能开发中', icon: 'none' });
    }
  },

  // 重置当前学段进度（只清勾选状态，保留清单与自定义物品）
  onResetProgress() {
    const stage = store.getStage();
    const label = STAGE_LABELS[stage] || '当前学段';
    wx.showModal({
      title: '重置进度',
      content: '将「' + label + '」的所有物品恢复为「未备」，自定义物品会保留。确定重置吗？',
      confirmText: '重置',
      confirmColor: '#FF7A45',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        store.resetStageProgress(stage);
        this.refreshStats();
        wx.showToast({ title: '已重置' + label + '进度', icon: 'none' });
      }
    });
  },

  // 顶部数据卡可点击：已整理→清单 / 连续天→打卡 / 徽章→成就
  onStatTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'done') {
      wx.navigateTo({ url: '/pages/checklist/checklist?cat=id' });
    } else if (key === 'streak') {
      wx.navigateTo({ url: '/pages/reminder/reminder' });
    } else if (key === 'badge') {
      wx.switchTab({ url: '/pages/progress/progress' });
    }
  },

  // 打开隐私保护指引：优先微信官方协议；
  // 接口不可用 / 后台未配置时，兜底到应用内隐私页（保证审查员始终可体验隐私板块）
  onOpenPrivacy() {
    if (typeof wx.openPrivacyContract === 'function') {
      try {
        wx.openPrivacyContract({
          fail: () => wx.navigateTo({ url: '/pages/privacy/privacy' })
        });
        return;
      } catch (e) {
        wx.navigateTo({ url: '/pages/privacy/privacy' });
        return;
      }
    }
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  // 清除本机数据：本小程序无账号系统，清除 = 删除本机清单与打卡记录并恢复默认清单
  onLogout() {
    wx.showModal({
      title: '清除本机数据',
      content: '本小程序没有账号系统，清除将删除本机的清单与打卡记录，并恢复默认清单，清除后无法恢复。确定清除吗？',
      confirmText: '确定清除',
      confirmColor: '#FF7A45',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        try {
          wx.removeStorageSync(store.STORAGE_KEY);
          wx.removeStorageSync(checkin.STORAGE_KEY);
          wx.removeStorageSync('SP_PRIVACY_AGREED');
        } catch (e) {
          // 清除失败不阻断后续重置
        }
        // 必须同步清掉两个模块的内存缓存：否则 getState() 会直接返回被删前的旧对象，
        // 表现为「点了清除，清单/打卡却原封不动」（缓存层引入的一致性陷阱）
        store.clearCache();
        checkin.clearCache();
        // 重新写入种子数据，保证各页首屏仍有内容
        store.getState();
        this.refreshStats();
        wx.showToast({ title: '已清除并重置', icon: 'none' });
        setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 800);
      }
    });
  },

  onShareAppMessage() {
    return share.shareApp('profile');
  },

  onShareTimeline() {
    return share.shareTimeline('profile');
  }
});
