/* 一次性审计探针：把 utils/store.js 的种子内容按分类抽出来，核对分类文案是否与实际内容匹配 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'utils/store.js'), 'utf8');

// 截取 SEED_ITEMS 块
const blockStart = src.indexOf('const SEED_ITEMS');
const blockEnd = src.indexOf('\n};', blockStart);
const block = src.slice(blockStart, blockEnd);

const cats = {};
let cur = null;
block.split('\n').forEach((line) => {
  const cm = line.match(/^  ([a-z]+): \[/);
  if (cm) { cur = cm[1]; cats[cur] = []; return; }
  if (/^  \],?$/.test(line)) { cur = null; return; }
  if (cur) {
    const im = line.match(/name:\s*'([^']+)'/);
    const mm = line.match(/must:\s*(true|false)/);
    if (im) cats[cur].push({ name: im[1], must: mm && mm[1] === 'true' });
  }
});

const { CATEGORIES } = require(path.join(ROOT, 'utils/categories.js'));

let total = 0;
let mustTotal = 0;
console.log('分类文案 vs 实际种子内容核对：\n');
CATEGORIES.forEach((c) => {
  const items = cats[c.key] || [];
  const mustN = items.filter((i) => i.must).length;
  total += items.length;
  mustTotal += mustN;
  console.log(`【${c.key}】label=「${c.label}」  desc=「${c.desc}」  共 ${items.length} 条（必带 ${mustN}）`);
  console.log(`     ${items.map((i) => (i.must ? '*' + i.name : i.name)).join('、')}\n`);
});
console.log(`合计：${total} 条，必带 ${mustTotal} 条 / 选带 ${total - mustTotal} 条`);
