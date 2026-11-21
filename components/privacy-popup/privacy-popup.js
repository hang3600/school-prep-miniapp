// 隐私授权弹窗组件
// 由 app.js 的 onNeedPrivacyAuthorization 回调驱动：系统需要授权时调用本组件的 show(resolve)，
// 用户点击「同意」→ resolve({event:'agree'}) 告知系统，点「暂不使用」→ resolve({event:'disagree'})。
Component({
  data: {
    visible: false,
    contractName: '隐私保护指引'
  },

  lifetimes: {
    attached() {
      // 把实例挂到 globalData，便于 app.js 的 onNeedPrivacyAuthorization 直接驱动
      const app = getApp();
      if (app && app.globalData) app.globalData.privacyPopup = this;
    },
    detached() {
      const app = getApp();
      if (app && app.globalData && app.globalData.privacyPopup === this) {
        app.globalData.privacyPopup = null;
      }
    }
  },

  methods: {
    // resolve 为微信系统回调；contractName 为后台配置的协议名
    show(resolve, contractName) {
      this._resolve = resolve;
      const app = getApp();
      if (app && app.globalData) app.globalData._privacyShown = true;
      this.setData({
        visible: true,
        contractName: contractName || '隐私保护指引'
      });
    },

    // 主动显示弹窗：页面在调用隐私接口前发现 needAuthorization 时调用，
    // 用户点击「同意并继续」后执行 done 回调（如继续复制），实现一次点击完成授权+操作。
    showForCallback(done) {
      this._done = done;
      const app = getApp();
      if (app && app.globalData) app.globalData._privacyShown = true;
      this.setData({ visible: true, contractName: '隐私保护指引' });
    },

    onAgree() {
      const r = this._resolve;
      this._resolve = null;
      const done = this._done;
      this._done = null;
      this.setData({ visible: false });
      // 补写本地授权标记，与「隐私设置」页行为一致，便于其他页面判断授权状态
      try { wx.setStorageSync('SP_PRIVACY_AGREED', true); } catch (e) {}
      if (r) r({ event: 'agree' });
      if (done) done();
    },

    onDisagree() {
      const r = this._resolve;
      this._resolve = null;
      this._done = null;
      this.setData({ visible: false });
      if (r) r({ event: 'disagree' });
      wx.showToast({ title: '需同意后才能继续使用', icon: 'none' });
    },

    onOpenContract() {
      wx.openPrivacyContract({
        fail: () => wx.showToast({ title: '暂无法打开协议', icon: 'none' })
      });
    }
  }
});
