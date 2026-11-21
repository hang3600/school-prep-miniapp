/**
 * 统一分享出口（单源）
 * --------------------------------------------------
 * 所有页面的 onShareAppMessage / onShareTimeline 都从这里取值：
 * 标题文案、落地路径只在本文维护，页面零散硬编码为 0。
 *
 * SEO 关键词分层（按微信搜一搜权重）：
 *   核心词：开学准备清单 / 开学打包清单 / 开学必备
 *   学段词：大学 / 高中 / 初中 / 小学（标题中 {stage} 占位符，分享时按当前学段动态替换）
 *   场景词：军训必备 / 宿舍用品 / 新生必备
 *   长尾词：开学要带什么 / 照着勾不漏带
 *
 * 注意：
 * - path 必须是绝对路径；tab 页分享路径打开时走 tab 还原，可直接用。
 * - 带参数的路径（如 checklist?cat=）参数值必须 encodeURIComponent。
 * - 未传 imageUrl 时微信默认用页面截图，无需占位资源。
 */

const store = require('./store.js');

const APP_TITLE = '开学准备清单';

// 学段中文标签（与 store.STAGE_KEYS 对应），用于分享标题动态化学段词
const STAGE_LABEL = { college: '大学', high: '高中', middle: '初中', primary: '小学' };

function currentStageLabel() {
  return STAGE_LABEL[store.getStage()] || '大学';
}

// 标题模板渲染：
//   {stage}    → 当前学段（大学/高中/初中/小学）
//   {freshman} → 大学时显示「大一」，其余学段显示学段名，命中「大一新生」长尾词
function renderTitle(tpl) {
  const stage = currentStageLabel();
  const freshman = stage === '大学' ? '大一' : stage;
  return tpl.replace('{stage}', stage).replace('{freshman}', freshman);
}

// 学段分享封面（本地路径；5:4 显示最佳，微信会居中裁切）
// 按学段分发不同标题的封面：大学/高中/初中/小学各一张，分享时匹配当前学段，命中对应「X学入学物品清单」关键词
const SHARE_IMAGES = {
  college: '/images/share-cover-uni.jpg',
  high: '/images/share-cover-senior.jpg',
  middle: '/images/share-cover-junior.jpg',
  primary: '/images/share-cover-primary.jpg'
};

function currentStageImage() {
  return SHARE_IMAGES[store.getStage()] || SHARE_IMAGES.college;
}

const PAGES = {
  home: {
    // 命中：真实最大流量词「大学入学物品清单」（学段动态）+ 核心词「开学必备」+ 长尾「不漏带」
    title: '{stage}入学物品清单｜开学必备不漏带',
    path: '/pages/home/home'
  },
  category: {
    // 命中：长尾「大一新生需要带什么」（大学时完整）+ 场景「军训必备/宿舍用品」
    title: '{freshman}新生需要带什么？军训宿舍用品必备',
    path: '/pages/category/category'
  },
  progress: {
    // 命中：场景词「开学行李箱」+ 核心词「清单」+ 长尾「照着装不漏带」
    title: '开学行李箱清单｜照着收不漏带，家长放心',
    path: '/pages/progress/progress'
  },
  profile: {
    // 命中：核心词 APP_TITLE + 长尾「开学不慌」
    title: APP_TITLE + '｜打卡整理开学不慌',
    path: '/pages/profile/profile'
  },
  checklist: {
    // 命中：场景词「大学宿舍用品清单」（大学时完整）+「住校必备」
    title: '{stage}宿舍用品清单｜住校必备逐项勾',
    // cat 参数由调用方拼好 encodeURIComponent 后的完整路径
    path: '/pages/checklist/checklist'
  },
  reminder: {
    // 命中：核心词 APP_TITLE + 「每日打卡」
    title: APP_TITLE + '｜每日打卡不遗漏',
    path: '/pages/reminder/reminder'
  },
  help: {
    // 命中：长尾「开学要带什么」——用户把 FAQ 转给同学/家长时天然带这句疑问
    title: '开学要带什么？常见问题一次说清',
    path: '/pages/help/help'
  }
  // 注：about / privacy 不设分享——关于页与隐私页转发给他人无使用场景，
  // 且隐私页被大量转发容易在审核侧引入不必要的关注。
};

// 好友/群聊转发（右上角菜单 / button open-type="share"）
function shareApp(key, extraPath) {
  const conf = PAGES[key] || PAGES.home;
  return { title: renderTitle(conf.title), path: extraPath || conf.path, imageUrl: currentStageImage() };
}

// 朋友圈转发（仅单页模式展示，query 不带首字符 ?，参数值需已 encodeURIComponent）
function shareTimeline(key, query) {
  const conf = PAGES[key] || PAGES.home;
  return { title: renderTitle(conf.title), query: query || '', imageUrl: currentStageImage() };
}

module.exports = { shareApp, shareTimeline, PAGES, APP_TITLE };
