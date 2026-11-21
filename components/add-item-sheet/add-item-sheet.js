// 分类 chips 数据源（key 与 store.CAT_KEYS / 页面 cat 参数一致，保证添加落库正确）
const { CATEGORIES } = require('../../utils/categories.js');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    // 当前所在分类 key，弹窗打开时默认选中它
    currentCat: { type: String, value: 'id' }
  },
  data: {
    name: '',
    cats: CATEGORIES,
    catIdx: 0,
    qty: 1,
    must: true,
    // focus 需 false → true 翻转才能再次唤起键盘，故关闭时必须置回 false
    focus: false
  },
  observers: {
    // 每次打开弹窗重置表单，并默认选中「当前所在分类」，避免残留上次输入
    visible(v) {
      if (!v) {
        if (this.data.focus) this.setData({ focus: false });
        return;
      }
      const idx = Math.max(0, CATEGORIES.findIndex((c) => c.key === this.data.currentCat));
      this.setData({ name: '', qty: 1, must: true, catIdx: idx, focus: true });
    }
  },
  methods: {
    noop() {},
    close() {
      this.setData({ focus: false });
      this.triggerEvent('close');
    },
    onName(e) {
      this.setData({ name: e.detail.value });
    },
    selCat(e) {
      this.setData({ catIdx: Number(e.currentTarget.dataset.i) || 0 });
    },
    dec() {
      if (this.data.qty > 1) this.setData({ qty: this.data.qty - 1 });
    },
  inc() {
    // 上限 99：避免误触把数量顶到三位数，清单里出现「充电宝 ×327」这种脏数据
    if (this.data.qty >= 99) {
      wx.showToast({ title: '最多 99 件', icon: 'none' });
      return;
    }
    this.setData({ qty: this.data.qty + 1 });
    },
    toggleMust() {
      this.setData({ must: !this.data.must });
    },
    save() {
      const cat = this.data.cats[this.data.catIdx];
      this.triggerEvent('save', {
        name: this.data.name,
        catKey: cat ? cat.key : 'id',
        qty: this.data.qty,
        must: this.data.must
      });
    }
  }
});
