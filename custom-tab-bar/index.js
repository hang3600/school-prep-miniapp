Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/home', text: '清单', icon: 'ic-list' },
      { pagePath: '/pages/category/category', text: '分类', icon: 'ic-category' },
      { pagePath: '/pages/progress/progress', text: '进度', icon: 'ic-progress' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: 'ic-user' }
    ]
  },
  methods: {
    switchTab(e) {
      const idx = e.currentTarget.dataset.index;
      // 切 tab 轻震动（仅真实点击触发，页面 onShow 的 setData 同步不经过这里）
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' });
      const url = this.data.list[idx].pagePath;
      wx.switchTab({ url });
    }
  }
});
