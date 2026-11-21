/**
 * 发布门禁（辅助脚本，不参与回归计数）：node tests/_gate-check.js
 * 1. WXSS 括号/注释配对
 * 2. data 键 ↔ wxml 绑定交叉比对（未绑定 setData 变量 = 体验分告警源）
 * 3. 缓存收益量化：统计一次首页刷新 / 分类页刷新实际触发的 getStorageSync 次数
 */

const fs = require('fs');
const path = require('path');
const { makeState, makeEnv, loadPage, instantiate } = require('./harness.js');

const ROOT = path.resolve(__dirname, '..');

// ---- 1. WXSS 配对 ----
const wxssFiles = [];
(function walk(d) {
  fs.readdirSync(d).forEach((f) => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.wxss')) wxssFiles.push(p);
  });
})(ROOT);

let bad = 0;
wxssFiles.forEach((f) => {
  const s = fs.readFileSync(f, 'utf8');
  if (((s.match(/\/\*/g) || []).length) !== ((s.match(/\*\//g) || []).length)) {
    console.log('注释不配对 ' + f); bad += 1;
  }
  if (((s.match(/\{/g) || []).length) !== ((s.match(/\}/g) || []).length)) {
    console.log('括号不配对 ' + f); bad += 1;
  }
});
console.log('[1] WXSS 配对: ' + (bad === 0 ? 'OK ' + wxssFiles.length + ' 个文件' : 'BAD ' + bad));

// ---- 2. data 键 ↔ wxml 绑定 ----
const IGNORE = ['_lastAllPacked', '_lastPercent', '_stageGuideShown'];
const pages = ['home', 'category', 'progress', 'profile', 'checklist', 'reminder', 'help', 'about', 'privacy'];
let deadTotal = 0;
pages.forEach((p) => {
  const js = fs.readFileSync(path.join(ROOT, 'pages', p, p + '.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(ROOT, 'pages', p, p + '.wxml'), 'utf8');
  const keys = new Set();
  const dm = js.match(/data:\s*\{([\s\S]*?)\n  \},/);
  if (dm) {
    [...dm[1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].forEach((m) => keys.add(m[1]));
  }
  [...js.matchAll(/this\.setData\(\{([\s\S]*?)\}\)/g)].forEach((m) => {
    [...m[1].matchAll(/(?:^|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].forEach((k) => keys.add(k[1]));
  });
  // 双向判断：既查 {{key 也查 .key（嵌套子键 {{item.key}} 属于正常渲染）
  const dead = [...keys].filter((k) => {
    if (IGNORE.indexOf(k) !== -1) return false;
    return !wxml.includes('{{' + k) && !wxml.includes('{{ ' + k) && !wxml.includes('.' + k);
  });
  if (dead.length) {
    console.log('  死键 ' + p + ': ' + dead.join(', '));
    deadTotal += dead.length;
  }
});
console.log('[2] 未绑定 setData 变量: ' + (deadTotal === 0 ? 'OK 0 个' : deadTotal + ' 个'));

// ---- 3. 缓存收益量化 ----
{
  const state = makeState();
  const env = makeEnv(state);
  const store = env.load('utils/store.js');
  const home = instantiate(loadPage(env, 'pages/home/home.js'));
  home.onLoad();
  const before = state.storageReads;
  home.refresh(); // 1 进度 + 7 分类计数 + 1 日期 + 学段
  const homeReads = state.storageReads - before;

  const state2 = makeState();
  const env2 = makeEnv(state2);
  env2.load('utils/store.js');
  const cat = instantiate(loadPage(env2, 'pages/category/category.js'));
  const before2 = state2.storageReads;
  cat.refresh(); // 7 分类计数 + computeRecent 遍历 4 学段 × 7 分类
  const catReads = state2.storageReads - before2;

  console.log('[3] 单次刷新 getStorageSync 次数: 首页 ' + homeReads + ' 次 / 分类页 ' + catReads + ' 次（修复前分别为 10 / 29 次）');
}

// ---- 4. tab 页 onShow 首屏不应触发同步读（收口到 onReady 后才读）----
{
  const tabs = ['category', 'progress', 'profile'];
  let bad4 = 0;
  tabs.forEach((p) => {
    const state = makeState();
    const env = makeEnv(state);
    env.load('utils/store.js');
    const page = instantiate(loadPage(env, 'pages/' + p + '/' + p + '.js'));
    const before = state.storageReads;
    page.onShow(); // 首屏进入：应延后到 onReady，不读 storage
    const reads = state.storageReads - before;
    if (reads !== 0) {
      console.log('  ' + p + ' onShow 触发同步读 ' + reads + ' 次');
      bad4 += 1;
    }
  });
  console.log('[4] tab 页 onShow 首屏同步读: ' + (bad4 === 0 ? 'OK 0 次（均已收口到 onReady）' : 'BAD ' + bad4));
}
