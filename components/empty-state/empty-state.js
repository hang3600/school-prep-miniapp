Component({
  properties: {
    title: { type: String, value: '清单还是空的' },
    sub: { type: String, value: '先把必备物品加进来，开学不慌' },
    btnText: { type: String, value: '添加物品' }
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});
