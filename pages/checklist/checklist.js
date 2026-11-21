const store = require('../../utils/store.js');
const share = require('../../utils/share.js');
const { CAT_MAP } = require('../../utils/categories.js');

Page({
  data: {
    cat: 'id',
    sheetVisible: false,
    totalPercent: 0,
    readyCount: 0,
    packedCount: 0,
    totalCount: 0,
    groups: [],
    // 三态说明：仅在「一件都还没勾」时显示，勾第一件后自动隐去（首次进入另有弹窗引导）
    showCycleHint: true,
    // 全部装包完成态
    allDone: false,
    doneSummary: '',
    // 下一个未完成分类（用于「下一步」引导；空串表示已无更多分类）
    nextCat: '',
    nextCatLabel: '',
    // 从分类页搜索跳转过来时的关键词：命中物品高亮 + 自动展开其分组（无关键词为空串）
    kw: ''
  },

  onLoad(q) {
    const seoApp = (typeof getApp === 'function') ? getApp() : null;
    if (seoApp && seoApp.globalData && typeof seoApp.globalData.applyPageMeta === 'function') {
      seoApp.globalData.applyPageMeta('pages/checklist/checklist');
    }
    const cat = q.cat || 'id';
    // 搜索定位：decodeURIComponent 兜底，防止畸形编码抛异常中断 onLoad
    let kw = '';
    try { kw = q.kw ? decodeURIComponent(q.kw) : ''; } catch (e) { kw = q.kw || ''; }
    this.setData({ cat: cat, kw: kw });
    // 原生导航栏：标题动态设为当前分类名
    wx.setNavigationBarTitle({ title: CAT_MAP[cat] || '开学准备清单' });
    // 首屏渲染前不读写 storage：清单加载与引导弹窗延后到 onReady（首屏渲染完成后），
    // 避免命中体验分「首屏渲染前多次调用同步 API」告警（iOS / 鸿蒙慢机尤甚）。
  },

  onReady() {
    this.loadList();
    this._lastCore = store.getCoreMode();
    this._ready = true;
    this.maybeGuide();
  },

  // 从其他 tab 回来时若核心模式变了（如首页切换），同步刷新列表
  onShow() {
    if (this._ready !== true) return;
    const core = store.getCoreMode();
    if (this._lastCore !== core) {
      this._lastCore = core;
      this.loadList();
    }
  },

  // 三态操作引导：改为「页内提示」而非模态弹窗，避免与首页隐私弹窗、学段引导形成三层打断。
  // 说明文字由进度卡的 cycle-hint 常驻承担（未勾任何件时一直显示，勾第一件后自动隐去），
  // 这里只保留首次标记，供将来需要 A/B 或埋点使用，不再 showModal。
  maybeGuide() {
    try {
      if (wx.getStorageSync('schoolprep_guide_cycle')) return;
    } catch (e) {
      return; // 存储异常时跳过，不影响正常使用
    }
    // 异步写盘，消除首屏同步 setStorageSync（体验分告警源）
    try { wx.setStorage({ key: 'schoolprep_guide_cycle', data: true }); } catch (e) { /* ignore */ }
  },

  // 复制当前分类清单为纯文本，方便发给家人/舍友照着准备（P1-6）
  // 剪贴板是微信隐私接口：首次使用需用户同意隐私协议。
  // 先查 needAuthorization——需要授权就先弹隐私窗，同意后立即复制，一次点击完成，避免「首次失败、二次成功」。
  onCopyList() {
    const stage = store.getStage();
    const items = store.getChecklist(stage, this.data.cat, store.getCoreMode());
    if (!items.length) {
      wx.showToast({ title: '这个分类还没有物品', icon: 'none' });
      return;
    }
    const doCopy = () => this.copyListText(items);
    if (typeof wx.getPrivacySetting === 'function') {
      wx.getPrivacySetting({
        success: (res) => {
          if (res.needAuthorization) {
            const popup = this.selectComponent('#privacyPopup');
            if (popup && typeof popup.showForCallback === 'function') {
              popup.showForCallback(doCopy);
              return;
            }
          }
          doCopy();
        },
        fail: () => doCopy()
      });
    } else {
      doCopy();
    }
  },

  copyListText(items) {
    const label = CAT_MAP[this.data.cat] || '清单';
    let text = '【' + label + '·开学准备清单】\n';
    const must = items.filter((i) => i.must);
    const opt = items.filter((i) => !i.must);
    if (must.length) {
      text += '\n【必带】\n';
      must.forEach((i) => { text += '- ' + i.name + '\n'; });
    }
    if (opt.length) {
      text += '\n【选带】\n';
      opt.forEach((i) => { text += '- ' + i.name + '\n'; });
    }
    try {
      wx.setClipboardData({
        data: text,
        success: () => {
          wx.vibrateShort({ type: 'light' });
          wx.showToast({ title: '已复制，去发给家人吧', icon: 'success' });
        },
        fail: (err) => {
          const msg = (err && err.errMsg) || '未知错误';
          if (msg.indexOf('scope is not declared') !== -1) {
            wx.showModal({
              title: '需要开通剪贴板权限',
              content: '请在微信公众平台后台「用户隐私保护指引」中声明剪贴板接口，审核通过后即可正常复制。',
              showCancel: false,
              confirmText: '知道了'
            });
          } else {
            wx.showToast({ title: '复制失败：' + msg, icon: 'none', duration: 4000 });
          }
        }
      });
    } catch (e) {
      wx.showToast({ title: '复制异常，请重试', icon: 'none' });
    }
  },

  // 从本地存储读取当前分类清单并拆成「必带 / 选带」分组
  loadList() {
    const stage = store.getStage();
    const items = store.getChecklist(stage, this.data.cat, store.getCoreMode());
    const groups = store.groupByMust(items);
    // 保留用户手动切换过的折叠状态：勾选/删除物品会触发本方法重算，
    // 若不保留，每次操作都会把分组重置回「必带展开、选带收起」，导致组意外收起/展开。
    const prev = {};
    (this.data.groups || []).forEach((g) => {
      prev[g.name] = { open: g.open, userToggled: g.userToggled };
    });
    const kw = this.data.kw || '';
    groups.forEach((g) => {
      // 搜索定位：给命中物品打 hit 标记，命中分组强制展开（搜索意图优先于折叠记忆/自动收起）
      if (kw) {
        g.items.forEach((it) => { it.hit = (it.name || '').indexOf(kw) !== -1; });
        if (g.items.some((it) => it.hit)) {
          g.open = true;
          return;
        }
      }
      const p = prev[g.name];
      // 用户手动展开/收起过的分组：尊重用户意图，不再自动接管
      if (p && p.userToggled) {
        g.open = p.open;
        g.userToggled = true;
        return;
      }
      // 该组全部装包 → 自动收起，让用户一眼看到还剩什么
      const allPacked = g.items.length > 0 && g.items.every((it) => (it.status || 0) === 2);
      g.open = !allPacked;
      g.userToggled = false;
    });
    this.setData({ groups });
    this.recalc();
  },

  // 清除搜索高亮，恢复清单常规展示（不跳页，仅重置 kw 并重算分组 open 状态）
  onClearKw() {
    this.setData({ kw: '' });
    this.loadList();
  },

  // 本分类的装包进度（P0 修复：进度条口径与首页统一 = 已备好 + 已装包「准备好了」，
  // 此前只按「已装包」算，导致同一物品在首页涨了、清单页不动，用户误以为 bug）
  recalc() {
    let ready = 0;
    let packed = 0;
    let total = 0;
    this.data.groups.forEach((g) => {
      total += g.items.length;
      g.items.forEach((it) => {
        const st = it.status || 0;
        if (st >= 1) ready += 1;
        if (st === 2) packed += 1;
      });
    });
    const percent = total === 0 ? 0 : Math.round((ready / total) * 100);

    // 全部装包完成：总结文案带上「距开学天数」，把完成感落到具体日期上
    const allPacked = total > 0 && packed === total;
    let doneSummary = '共 ' + total + ' 件都准备好了，开学更省心';
    const days = store.daysUntilSchool();
    if (days === null) {
      doneSummary += '，去首页设置开学日期看看还剩几天';
    } else if (days > 0) {
      doneSummary += '，距开学还有 ' + days + ' 天';
    } else if (days === 0) {
      doneSummary += '，今天开学，祝你报到顺利';
    } else {
      doneSummary += '，已开学 ' + -days + ' 天';
    }

    // 下一步引导：recalc 不持有 stage，需从 store 取当前学段；找当前分类之外第一个未装包分类
    const stage = store.getStage();
    const next = store.nextIncompleteCat(stage, this.data.cat);
    this.setData({
      readyCount: ready,
      packedCount: packed,
      totalCount: total,
      totalPercent: percent,
      // 三态说明只在「一件没勾」时出现，避免常驻说明书
      showCycleHint: total > 0 && ready === 0,
      allDone: allPacked,
      doneSummary: allPacked ? doneSummary : '',
      nextCat: next || '',
      nextCatLabel: next ? (CAT_MAP[next] || '') : ''
    });

    // 「全部装包」庆祝时刻：仅当所有物品都装包（packed === total）时触发一次成功反馈，
    // 与进度条口径解耦——只「已备好」不会误触「装包完成」庆祝
    if (allPacked && !this._lastAllPacked) {
      if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'heavy' });
      wx.showToast({ title: '都备齐了，开学更从容！', icon: 'success', duration: 2500 });
    }
    this._lastAllPacked = allPacked;
  },

  // 轻点物品行：三态循环 未备(0) → 已备(1) → 已装包(2) → 未备(0)
  toggleItem(e) {
    const id = e.currentTarget.dataset.id;
    // 轻触感反馈：勾选是最高频动作，触觉反馈显著提升「产品感」
    if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' });
    store.cycleItem(store.getStage(), this.data.cat, id);
    this.loadList();
  },

  // 长按物品行：移除物品（种子与自定义均可移除，带确认弹窗防误删）
  onItemLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '移除物品',
      content: '确定把「' + name + '」从清单中移除吗？',
      confirmText: '移除',
      confirmColor: '#E5484D',
      success: (res) => {
        if (!res.confirm) return;
        store.removeItem(store.getStage(), this.data.cat, id);
        this.loadList();
        wx.showToast({ title: '已移除', icon: 'none' });
      }
    });
  },

  toggleGroup(e) {
    const idx = e.currentTarget.dataset.idx;
    const groups = this.data.groups;
    groups[idx].open = !groups[idx].open;
    // 标记用户手动操作过，后续重算不再自动接管该分组的展开状态
    groups[idx].userToggled = true;
    this.setData({ groups });
  },

  onAdd() {
    this.setData({ sheetVisible: true });
  },

  closeSheet() {
    this.setData({ sheetVisible: false });
  },

  onSave(e) {
    const d = e.detail;
    // 名称清洗：trim 后再判空——否则输入 3 个空格就能建出一条空物品（旧逻辑只判 !d.name）；
    // 同时截断到 20 字，防止绕过 maxlength 的长文本撑破行布局。
    const name = String(d.name || '').trim().slice(0, 20);
    if (!name) {
      wx.showToast({ title: '请填写名称', icon: 'none' });
      return;
    }
    // 数量钳制到 1-99（弹层已限制，这里兜住其它调用路径）
    let qty = Number(d.qty) || 1;
    if (qty < 1) qty = 1;
    if (qty > 99) qty = 99;
    // 以弹窗内选择的分类为准（B1 修复：分类 chips 选择真实生效）
    const targetCat = d.catKey || this.data.cat;
    store.addItem(store.getStage(), targetCat, {
      name,
      must: d.must,
      qty
    });
    this.setData({ sheetVisible: false });
    if (targetCat !== this.data.cat) {
      // 添加到其他分类：跳转到目标分类页让用户看到添加结果
      wx.showToast({ title: '已添加到' + (CAT_MAP[targetCat] || '分类'), icon: 'none' });
      wx.redirectTo({ url: '/pages/checklist/checklist?cat=' + targetCat });
      return;
    }
    this.loadList();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  // 空态按钮：非法分类等场景下直接回首页
  onGoHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  // 「下一步」引导：从当前分类跳到下一个未完成分类。
  // 用 redirectTo 替换当前页而非压栈，避免「证件→衣物→军训」连续跳转把页面栈顶爆。
  onGoCat(e) {
    const cat = e.currentTarget.dataset.cat;
    if (!cat || cat === this.data.cat) return;
    wx.redirectTo({ url: '/pages/checklist/checklist?cat=' + cat });
  },

  // 转发当前分类清单：cat 参数 encodeURIComponent，防分类 key 注入路径
  onShareAppMessage() {
    return share.shareApp('checklist', '/pages/checklist/checklist?cat=' + encodeURIComponent(this.data.cat));
  },

  onShareTimeline() {
    return share.shareTimeline('checklist', 'cat=' + encodeURIComponent(this.data.cat));
  }
});
