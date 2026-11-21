/**
 * 分类页回归：搜索过滤（分类名 / 描述 / 物品名）+ 最近添加
 */

const { assert, makeState, makeEnv, loadPage, instantiate } = require('./harness.js');

function run() {
  const state = makeState();
  const env = makeEnv(state);
  const store = env.load('utils/store.js');
  const page = instantiate(loadPage(env, 'pages/category/category.js'));
  page.onShow();
  page.onReady();

  // ---------- 1. 无关键词 ----------
  assert('无关键词 → 7 个分类', page.data.categories.length === 7, page.data.categories.length);

  // ---------- 2. 按分类名过滤 ----------
  page.onSearch({ detail: { value: '军训' } });
  assert('搜「军训」→ 命中军训分类', page.data.categories.length === 1 && page.data.categories[0].key === 'mil',
    page.data.categories.map((c) => c.key));

  // ---------- 3. 按物品名过滤（跨分类命中）----------
  page.onSearch({ detail: { value: '防晒' } });
  const keys = page.data.categories.map((c) => c.key).sort();
  assert('搜「防晒」→ 跨分类命中（生活 + 军训）', keys.length === 2 && keys[0] === 'mil' && keys[1] === 'soap', keys);

  // ---------- 4. 按描述过滤 ----------
  page.onSearch({ detail: { value: '文具' } });
  assert('搜描述「文具」→ 命中学习用品', page.data.categories.length === 1 && page.data.categories[0].key === 'book',
    page.data.categories.map((c) => c.key));

  // ---------- 5. 无命中 ----------
  page.onSearch({ detail: { value: '不存在的东西xyz' } });
  assert('无命中 → 空列表', page.data.categories.length === 0);

  // ---------- 6. 清空恢复 ----------
  page.onSearch({ detail: { value: '' } });
  assert('清空关键词 → 恢复 7 分类', page.data.categories.length === 7, page.data.categories.length);

  // ---------- 7. 最近添加 ----------
  assert('初始无自定义物品', page.data.recent.length === 0);
  store.addItem('college', 'book', { name: '马克笔', must: false, qty: 2 });
  page.onShow();
  page.onReady();
  assert('最近添加出现自定义物品', page.data.recent.length === 1 && page.data.recent[0].name === '马克笔 ×2',
    page.data.recent);

  page.onRecentTap({ currentTarget: { dataset: { key: 'book' } } });
  assert('点击最近添加跳对应分类', page.data.recent[0].catKey === 'book');

  // ---------- 8. 分类计数随自定义物品更新 ----------
  const bookCat = page.data.categories.find((c) => c.key === 'book');
  assert('分类计数含自定义物品（11 + 1）', bookCat.count === 12, bookCat.count);
}

module.exports = { run, name: 'category' };
