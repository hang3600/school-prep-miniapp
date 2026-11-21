// 搜一搜 SEO：config-driven 单源注入，拒绝散落硬编码
// 加权规则：名称 > 简介 > 后台关键词 > 正文（正文即页面静态文案）
// 用法：由 app.js 顶层统一 require 本模块并挂到 globalData.applyPageMeta，
//       页面 onLoad 里通过 getApp().globalData.applyPageMeta('pages/xxx/xxx') 调用。
//       页面不要各自 require 本文件——新文件若未被编译器收录会 module not defined 直接白屏。
// 注意：setPageMeta 为异步 webview meta 注入，不读 storage，不会触发体验分门禁。
// 词根策略：「开学准备」为小程序名核心词，贯通全部页面的 keywords / title / description。
const PAGE_SEO = {
  'pages/home/home': {
    title: '开学准备清单',
    keywords: '开学,开学准备,开学准备清单,大学入学物品清单,大学入学物品,开学物品清单,开学要带什么,开学必备物品,开学清单小程序,新生开学准备,大学生必备清单,住校用品清单,军训用品清单,新生清单,大学新生,开学清单,大学开学清单,新生开学准备清单,开学物品准备清单,幼儿园入园准备,开学采购清单,新生开学必备',
    description: '开学准备清单按学段一键生成大学入学物品清单，大学/高中/初中/小学全覆盖，走读·住校·军训逐条勾选。'
  },
  'pages/category/category': {
    title: '开学物品分类',
    keywords: '开学,开学准备,开学准备清单,开学物品分类,开学物品清单,开学要带什么分类,住校用品分类,军训用品清单,小学开学用品,幼儿园入园物品,大学生必备清单,开学必备东西清单,新生入学物品分类,新生清单,大学新生,新生必备物品,开学物品准备清单',
    description: '开学物品按证件、学习、床品、洗漱、军训分类整理，照着勾选不漏带。'
  },
  'pages/progress/progress': {
    title: '开学准备进度',
    keywords: '开学,开学准备,开学准备清单,开学准备进度,开学清单进度,开学打卡,开学倒计时,开学物品完成度,开学前准备,准备完成百分比,新生清单,新生开学准备',
    description: '实时查看开学准备进度与开学倒计时，每日打卡，开学前心中有数。'
  },
  'pages/profile/profile': {
    title: '开学清单设置',
    keywords: '开学,开学准备,开学准备清单,开学清单设置,我的开学清单,学段切换,开学日期设置,开学清单管理,开学准备清单小程序,新生清单,大学新生',
    description: '管理我的开学清单，切换学段与开学日期，查看反馈渠道与隐私说明。'
  },
  'pages/checklist/checklist': {
    title: '开学物品清单',
    keywords: '开学,开学准备,开学准备清单,开学物品清单,开学要带什么,开学文具清单,住校带什么,军训要准备什么,开学购物清单,新生入学物品,学生开学用品,开学必备物品,新生清单,大学新生,新生必备物品',
    description: '开学物品清单逐条勾选，实时看准备进度，支持自定义添加与一键生成分享海报。'
  },
  'pages/privacy/privacy': {
    title: '开学清单隐私',
    keywords: '开学,开学准备,开学准备清单,开学清单隐私,隐私保护指引,开学清单数据安全,开学清单隐私设置,新生清单',
    description: '开学清单数据仅保存在本机，不上传服务器，不收集昵称头像等个人信息。'
  },
  'pages/reminder/reminder': {
    title: '开学打卡提醒',
    keywords: '开学,开学准备,开学准备清单,开学打卡,开学提醒,开学准备打卡,开学倒计时提醒,开学前打卡,每日打卡,新生清单,新生开学准备',
    description: '设置开学打卡提醒，每天一分钟勾选进度，把开学准备拆成可执行的小步。'
  },
  'pages/help/help': {
    title: '开学清单怎么用',
    keywords: '开学,开学准备,开学准备清单,开学清单怎么用,开学准备清单帮助,开学清单常见问题,清单使用教程,开学清单切换学段,新生清单',
    description: '开学准备清单使用帮助：切换学段、添加自定义物品、生成分享海报、管理隐私设置。'
  },
  'pages/about/about': {
    title: '开学必备清单工具',
    keywords: '开学,开学准备,开学准备清单,大学入学物品清单,大学入学物品,开学清单小程序,关于开学清单,开学必备清单工具,新生清单,大学新生,新生入学物品清单,大学入学清单小程序',
    description: '大学入学物品清单 · 开学准备清单，按学段整理开学必备物品，逐条勾选追踪进度。'
  }
};

function applyPageMeta(route) {
  const m = PAGE_SEO[route];
  if (!m) return;
  if (typeof wx === 'undefined' || typeof wx.setPageMeta !== 'function') return;
  wx.setPageMeta({
    title: m.title,
    keywords: m.keywords,
    description: m.description,
    success: function () {},
    fail: function () {}
  });
}

module.exports = { PAGE_SEO, applyPageMeta };
