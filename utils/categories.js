/**
 * 分类元数据单一数据源（7 大分类，含军训）
 * --------------------------------------------------
 * 此前 app.js / home.js / category.js / add-item-sheet.js 各自维护一份分类定义，
 * 且 app.js 漏掉 mil 导致分类定义不完整。现统一收敛到这里：
 * - 首页宫格 / 分类页列表 / 清单导航标题 / 添加弹窗分类 chips 全部引用本文件。
 * key 与 store.CAT_KEYS、checklist 页 cat 参数一致；label 用于展示；tint 用于类目底色。
 */

const CATEGORIES = [
  { key: 'id', label: '证件材料', tint: '#EAF0FF', desc: '身份证 · 录取通知书 · 户口本' },
  { key: 'soap', label: '生活用品', tint: '#E6F7EE', desc: '洗漱 · 收纳 · 日常' },
  { key: 'book', label: '学习用品', tint: '#FFF4DC', desc: '文具 · 书籍 · 笔记本' },
  // 注意语义边界：本分类只放床品 / 寝室用品（床单、被褥、蚊帐、凉席、床垫），
  // 「衣物鞋包」由 shirt 分类承载。旧文案「宿舍衣物 / 床品·衣物·鞋包」与 shirt 重叠，
  // 用户点进来发现全是床品会困惑，故改为语义无歧义的「床品寝室」。
  { key: 'bed', label: '床品寝室', tint: '#F0EBFF', desc: '被褥 · 蚊帐 · 凉席' },
  { key: 'laptop', label: '数码电子', tint: '#FFEDD9', desc: '电脑 · 充电 · 配件' },
  { key: 'shirt', label: '衣物鞋包', tint: '#FFEAF1', desc: '当季衣物 · 鞋帽' },
  { key: 'mil', label: '军训用品', tint: '#FFE4E1', desc: '防晒 · 防暑 · 鞋垫' }
];

// key → label 映射（checklist 导航标题 / toast 等场景用）
const CAT_MAP = {};
CATEGORIES.forEach((c) => { CAT_MAP[c.key] = c.label; });

module.exports = { CATEGORIES, CAT_MAP };
