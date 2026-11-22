/**
 * 测试桩（headless Node 环境跑小程序页面逻辑）
 * --------------------------------------------------
 * 用法：各 test 文件 require 本模块，用 makeEnv() 造出带 wx 桩的沙箱，
 * 再用 loadPage() 加载页面 JS、instantiate() 实例化可调用 this.setData 的页面对象。
 *
 * 为什么放在工程内而非 /tmp：此前四套回归脚本写在 /tmp，被系统清理后全部丢失，
 * 导致项目一度处于零回归保护状态。现随工程保存，并已在 project.config.json
 * 的 packOptions.ignore 中排除，不会打进小程序包。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ---- 断言收集器 ----
let _passed = 0;
let _failed = 0;
const _failures = [];

function assert(name, cond, detail) {
  if (cond) {
    _passed += 1;
  } else {
    _failed += 1;
    _failures.push(name + (detail !== undefined ? ' → ' + JSON.stringify(detail) : ''));
    console.log('  ✗ ' + name + (detail !== undefined ? ' → ' + JSON.stringify(detail) : ''));
  }
}

function summary() {
  return { passed: _passed, failed: _failed, failures: _failures };
}

function resetCounters() {
  _passed = 0;
  _failed = 0;
  _failures.length = 0;
}

// ---- 状态容器 ----
function makeState(opts) {
  const s = {
    storage: Object.assign({}, opts && opts.storage),
    toasts: [],
    modals: [],
    nav: [],
    modalConfirm: (opts && opts.modalConfirm) !== false,
    vibrate: [],
    clipboard: null,
    applied: false,          // applyUpdate 是否被调用
    privacyAuthorize: 0,     // requirePrivacyAuthorize 调用次数
    privacySettingCalls: 0,  // getPrivacySetting 调用次数
    needAuthorization: !!(opts && opts.needAuthorization),
    storageReads: 0,         // getStorageSync 次数（用于缓存断言）
    storageWrites: 0,
    _umReady: null
  };
  return s;
}

// ---- wx 桩 ----
// 注意：getStorageSync 返回深拷贝，模拟微信「每次读都是新对象」的真实语义，
// 这样 store 的内存缓存是否生效可以直接用对象引用/读取次数断言出来。
function makeWx(state) {
  return {
    getStorageSync(k) {
      state.storageReads += 1;
      const v = state.storage[k];
      if (v === undefined || v === '') return '';
      try {
        return typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
      } catch (e) {
        return v;
      }
    },
    setStorageSync(k, v) {
      state.storageWrites += 1;
      state.storage[k] = v;
    },
    removeStorageSync(k) {
      delete state.storage[k];
    },
    showToast(o) { state.toasts.push(o && o.title); },
    showModal(o) {
      state.modals.push(o);
      if (o && o.success) o.success({ confirm: state.modalConfirm });
    },
    navigateTo(o) { state.nav.push(o && o.url); },
    redirectTo(o) { state.nav.push(o && o.url); },
    switchTab(o) { state.nav.push(o && o.url); },
    navigateBack() { state.nav.push('BACK'); },
    setNavigationBarTitle(o) { state.title = o && o.title; },
    vibrateShort(o) { state.vibrate.push(o && o.type); },
    setClipboardData(o) {
      state.clipboard = o && o.data;
      if (o && o.success) o.success();
    },
    getPrivacySetting(o) {
      state.privacySettingCalls += 1;
      if (o && o.success) {
        o.success({ needAuthorization: state.needAuthorization, privacyContractName: '隐私保护指引' });
      }
    },
    requirePrivacyAuthorize(o) {
      state.privacyAuthorize += 1;
      if (o && o.success) o.success();
    },
    onNeedPrivacyAuthorization(cb) { state._privacyCb = cb; },
    openPrivacyContract(o) { if (o && o.success) o.success(); },
    getUpdateManager() {
      return {
        onUpdateReady(cb) { state._umReady = cb; },
        onUpdateFailed(cb) { state._umFailed = cb; },
        applyUpdate() { state.applied = true; }
      };
    },
    getAccountInfoSync() {
      return { miniProgram: { version: '1.0.0', envVersion: 'release' } };
    },
    getWindowInfo() {
      return { statusBarHeight: 44, windowWidth: 390, windowHeight: 844 };
    },
    setPageMeta(o) {
      state.pageMeta = o;
      if (o && o.success) o.success();
    }
  };
}

// ---- 模块环境（带模块缓存，保证 store 单实例 = 缓存可生效）----
function makeEnv(state) {
  const wx = makeWx(state);
  const cache = {};
  const pageConfigs = {};
  const appConfigs = {};

  function load(rel) {
    if (cache[rel]) return cache[rel];
    const ctx = {
      wx,
      module: { exports: {} },
      exports: {},
      console,
      setTimeout,
      clearTimeout,
      getApp: () => (appConfigs.app ? appConfigs.app.__app : undefined)
    };
    ctx.exports = ctx.module.exports;
    ctx.require = (p) => {
      const norm = p.replace(/^\.\.\//, '').replace(/^\.\//, '');
      if (norm.indexOf('store') !== -1) return load('utils/store.js');
      if (norm.indexOf('phase') !== -1) return load('utils/phase.js');
      if (norm.indexOf('checkin') !== -1) return load('utils/checkin.js');
      if (norm.indexOf('share') !== -1) return load('utils/share.js');
      if (norm.indexOf('categories') !== -1) return load('utils/categories.js');
      if (norm.indexOf('seo') !== -1) return load('utils/seo.js');
      return {};
    };
    ctx.Page = (cfg) => { pageConfigs[rel] = cfg; };
    ctx.App = (cfg) => {
      cfg.__app = cfg;
      appConfigs.app = cfg;
    };
    ctx.Component = (cfg) => { pageConfigs[rel] = cfg; };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
    cache[rel] = ctx.module.exports;
    return ctx.module.exports;
  }

  return { wx, load, pageConfigs, appConfigs, state };
}

// ---- 页面加载 + 实例化 ----
function loadPage(env, rel) {
  env.load(rel);
  return env.pageConfigs[rel];
}

// 把 Page 配置变成可调用的对象：注入 data 副本与可用的 setData
function instantiate(cfg) {
  const page = Object.assign({}, cfg);
  page.data = JSON.parse(JSON.stringify(cfg.data || {}));
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => { this.data[k] = obj[k]; });
  };
  page.selectComponent = () => null;
  page.getTabBar = () => null;
  return page;
}

module.exports = {
  ROOT,
  assert,
  summary,
  resetCounters,
  makeState,
  makeWx,
  makeEnv,
  loadPage,
  instantiate
};
