const share = require('../../utils/share.js');

// 常见问题（内容与本小程序真实能力一致，不做虚假承诺）
const FAQS = [
  {
    q: '怎么生成我的开学清单？',
    a: '在「清单」页顶部选择你的学段（大学 / 高中 / 初中 / 小学），下方会展示 7 大分类。点进任意分类即可看到该学段的推荐物品，勾选已整理好的即可。'
  },
  {
    q: '数据存在哪里？会上传服务器吗？',
    a: '所有清单和打卡记录都保存在你的手机本地，不会上传到任何服务器，也不会同步到云端。换手机、卸载小程序或清理微信缓存后数据会丢失，请留意。'
  },
  {
    q: '可以添加自己的物品吗？',
    a: '可以。进入任意分类页，点底部「添加自定义物品」，输入名称和数量即可，添加后的物品同样可以勾选。'
  },
  {
    q: '怎么切换到别的学段？',
    a: '在「清单」页点击顶部的学段标签（大学 / 高中 / 初中 / 小学）即可切换，各学段的清单和进度是分开保存的。'
  },
  {
    q: '打卡提醒是怎么工作的？',
    a: '在「我的 → 打卡提醒」里开启提醒并设定时间。本小程序没有服务器，无法在后台主动推送通知，因此提醒会在你设定时间之后打开小程序时出现。'
  },
  {
    q: '为什么我收不到提醒通知？',
    a: '请确认：① 已在「打卡提醒」页开启开关；② 当前时间已超过你设定的提醒时间；③ 今天还没有打过卡。满足以上三点，下次打开小程序时就会提示。'
  },
  {
    q: '误删了清单怎么办？',
    a: '目前没有回收站，删除后无法恢复。建议重要清单不要删除，只需取消勾选即可保留条目。'
  },
  {
    q: '有问题或建议去哪里反馈？',
    a: '点击本页底部「在线客服」按钮可直接在线咨询；也可以在小程序右上角「…」→「反馈与投诉」提交，我们都会认真查看。'
  }
];

Page({
  data: {
    faqs: FAQS.map((f, i) => ({ ...f, open: i === 0 }))
  },

  onLoad() {
    const seoApp = (typeof getApp === 'function') ? getApp() : null;
    if (seoApp && seoApp.globalData && typeof seoApp.globalData.applyPageMeta === 'function') {
      seoApp.globalData.applyPageMeta('pages/help/help');
    }
  },

  onToggle(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const key = 'faqs[' + idx + '].open';
    this.setData({ [key]: !this.data.faqs[idx].open });
  },

  onShareAppMessage() {
    return share.shareApp('help');
  },

  onShareTimeline() {
    return share.shareTimeline('help');
  }

});
