// SEO 单源注入（搜一搜页面级 meta）。
// 为什么放在 app.js 顶层：页面各自 require 新文件时，若该文件未被编译器收录进包，
// 会抛 module not defined 直接白屏。这里改为由 app.js 统一 require 并挂到 globalData，
// 页面只从 getApp() 取；再包 try/catch，即使模块缺失也只是没有 SEO，主流程照常。
let seoApplyPageMeta = null;
try {
  const seo = require('./utils/seo.js');
  if (seo && typeof seo.applyPageMeta === 'function') seoApplyPageMeta = seo.applyPageMeta;
} catch (e) {
  // 模块未被编译进包时走这里：静默降级，仅打日志，不影响主流程。
  // 控制台若看到这行，说明 utils/seo.js 没进包（需重启开发者工具 / 在工具内编辑保存一次触发重新索引）。
  console.warn('[seo] utils/seo.js 未加载，页面 meta 注入已跳过：', e && e.message ? e.message : e);
  seoApplyPageMeta = null;
}

App({
  globalData: {
    // 学段顺序：大学 → 高中 → 初中 → 小学（默认大学选中，见设计稿 StageSeg 顺序）
    stage: 'college',
    stages: ['college', 'high', 'middle', 'primary'],
    stageLabels: { college: '大学', high: '高中', middle: '初中', primary: '小学' },
    // 分类元数据（8 大分类含药品健康与军训）单一数据源见 utils/categories.js，
    // 由 home / category / checklist / add-item-sheet 各自 require，此处不再维护副本。
    // 隐私合规相关（微信 2023 起强制）
    brand: '#2F8F6B',
    // SEO：由顶部 require 兜底注入，供各页面 onLoad 调用
    applyPageMeta: seoApplyPageMeta,
    // 由 privacy-popup 组件在 attached 时挂载自身，便于 onNeedPrivacyAuthorization 直接驱动
    privacyPopup: null,
    // 后台配置的隐私协议名，getPrivacySetting 回填
    privacyContractName: '隐私保护指引',
    // 防止同一次启动内重复触发授权弹窗
    _privacyTriggered: false,
    // 防止首页 attached 时重复补触发
    _privacyAttachTriggered: false,
    // 标记弹窗是否已呈现（用于规避 onLaunch 早于组件就绪的竞态）
    _privacyShown: false
  },

  onLaunch() {
    // 不在 onLaunch 预热清单数据。原因：store.read() 首调会同步 getStorageSync，
    // 首启还会 setStorageSync 写种子；放在 App 生命周期内会被体验分判定为
    // 「App 生命周期执行耗时过长 / 首屏渲染前多次调用同步 API」（鸿蒙等慢机尤为明显）。
    // store 模块持有内存缓存，首页 onReady（首屏渲染完成后）做首次读取即可热缓存，
    // 既不影响正确性，又让首屏不被同步存储阻塞。

    // 微信隐私合规初始化：注册 onNeedPrivacyAuthorization 监听，由自定义弹窗接管授权 UI。
    // 注：主动触发授权放在首页 onShow（见 triggerPrivacyAuthorize），
    // 不在此处——onLaunch 时页面尚未渲染，弹窗会盖在白屏上，观感很差。
    this.initPrivacy();

    // 强制更新：检测到新版本立即弹不可关闭的模态框
    this.initForceUpdate();
  },

  // 强制更新（wx.getUpdateManager）：新版本包下载就绪后，弹「无取消按钮」的模态框，
  // 用户唯一操作是「立即重启」→ applyUpdate() 应用新版本并重启。
  // 说明：微信没有平台级硬性强制更新能力，此为官方推荐的最强形式；
  // 仅在体验版/正式版生效，开发者工具与预览版不触发。
  initForceUpdate() {
    if (typeof wx.getUpdateManager !== 'function') return;
    const um = wx.getUpdateManager();
    um.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，需要重启小程序完成更新。',
        showCancel: false,
        confirmText: '立即重启',
        success: () => um.applyUpdate()
      });
    });
    um.onUpdateFailed(() => {
      // 新版本下载失败（如弱网）：提示用户手动获取最新版
      wx.showModal({
        title: '更新失败',
        content: '新版本下载失败，请检查网络后重试；也可以删除小程序后重新搜索打开，即可使用最新版本。',
        showCancel: false,
        confirmText: '知道了'
      });
    });
  },

  // 微信隐私合规：注册授权回调（2023 起强制要求）。
  // 系统需要在调用隐私相关接口前征得同意时，会触发该回调，我们在这里弹出可交互的隐私授权弹窗。
  initPrivacy() {
    if (typeof wx.onNeedPrivacyAuthorization !== 'function') return;

    // 回填协议名，供弹窗展示
    if (typeof wx.getPrivacySetting === 'function') {
      wx.getPrivacySetting({
        success: (res) => {
          if (res.privacyContractName) {
            this.globalData.privacyContractName = res.privacyContractName;
          }
        },
        fail: () => {}
      });
    }

    wx.onNeedPrivacyAuthorization((resolve) => {
      const popup = this.globalData.privacyPopup;
      const name = this.globalData.privacyContractName || '隐私保护指引';
      if (popup && typeof popup.show === 'function') {
        popup.show(resolve, name);
        return;
      }
      // 兜底：组件未挂载时（例如隐私接口在弹窗未就绪时被调用）用系统模态框保证授权流程不中断
      wx.showModal({
        title: '隐私授权提醒',
        content: '使用前请阅读并同意《' + name + '》。本小程序仅在本机保存你的清单，不会上传服务器。',
        confirmText: '同意并继续',
        cancelText: '暂不',
        success: (res) => {
          resolve({ event: res.confirm ? 'agree' : 'disagree' });
        }
      });
    });
  },

  // 主动触发隐私授权弹窗（官方流程）。
  // 触发时机：首页 onShow（页面已渲染，弹窗有上下文，不会盖在白屏上）。
  // 每个会话最多触发一次——needAuthorization=false（已同意 / 后台未配置）不再重复打扰，
  // 用户拒绝后仍可通过「我的 → 隐私设置」或复制清单功能重新触发。
  //
  // 为什么要主动触发：__usePrivacyCheck__ 开启后，若只有「用户调用隐私接口」才弹窗，
  // 审核员走查时很可能根本触发不到，判定为「隐私设置板块暂无法体验核实」（本项目此前的驳回原因）。
  // 后端「隐私保护指引」未配置时该接口不会真正弹窗，此时由「我的 → 隐私设置 / 应用内隐私页」兜底。
  triggerPrivacyAuthorize() {
    if (this.globalData._privacyTriggered) return;
    this.globalData._privacyTriggered = true;
    if (typeof wx.getPrivacySetting !== 'function') return;
    wx.getPrivacySetting({
      success: (res) => {
        if (!res.needAuthorization) return;
        if (typeof wx.requirePrivacyAuthorize === 'function') {
          wx.requirePrivacyAuthorize({ success: () => {}, fail: () => {} });
        }
      },
      fail: () => {}
    });
  },

  // 供页面主动调用（首页 onShow、隐私授权按钮等）
  ensurePrivacy() {
    this.triggerPrivacyAuthorize();
  }
})
