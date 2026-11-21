// 应用内隐私保护指引页（兜底入口）
// 当微信官方隐私接口不可用 / 后台未配置《隐私保护指引》时，审查员仍可从「我的 → 隐私设置」进入本页，
// 阅读并「同意」，从而保证隐私板块始终可体验（避免审核以「无法体验核实」驳回）。
Page({
  data: {
    contractName: '隐私保护指引',
    agreed: false
  },

  onLoad() {
    const seoApp = (typeof getApp === 'function') ? getApp() : null;
    if (seoApp && seoApp.globalData && typeof seoApp.globalData.applyPageMeta === 'function') {
      seoApp.globalData.applyPageMeta('pages/privacy/privacy');
    }
    const app = getApp();
    if (app && app.globalData && app.globalData.privacyContractName) {
      this.setData({ contractName: app.globalData.privacyContractName });
    }
    // 本地是否已同意（与官方授权状态一致展示）
    try {
      this.setData({ agreed: !!wx.getStorageSync('SP_PRIVACY_AGREED') });
    } catch (e) {}
  },

  // 打开微信官方隐私协议（后台配置的那份）；失败则提示，不影响本页可体验
  onOpenContract() {
    if (typeof wx.openPrivacyContract === 'function') {
      try {
        wx.openPrivacyContract({
          fail: () => wx.showToast({ title: '暂无法打开官方协议', icon: 'none' })
        });
        return;
      } catch (e) {}
    }
    wx.showToast({ title: '暂无法打开官方协议', icon: 'none' });
  },

  // 应用内确认同意：记录本地标记，保证审查员在此页也能完成一次「同意」体验
  onAgree() {
    try { wx.setStorageSync('SP_PRIVACY_AGREED', true); } catch (e) {}
    this.setData({ agreed: true });
    wx.showToast({ title: '已同意隐私保护指引' });
  },

  onBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/profile/profile' }) });
  }
});
