/**
 * 分类元数据单一数据源（8 大分类，竞品 10 类拆解合并后）
 * --------------------------------------------------
 * 此前 app.js / home.js / category.js / add-item-sheet.js 各自维护一份分类定义，
 * 且 app.js 漏掉 mil 导致分类定义不完整。现统一收敛到这里：
 * - 首页宫格 / 分类页列表 / 清单导航标题 / 添加弹窗分类 chips 全部引用本文件。
 * key 与 store.CAT_KEYS、content-enrich.EIGHT_CATEGORIES、checklist 页 cat 参数一致；
 * label 用于展示；tint 用于类目底色；desc 用于分类页副标题与搜索。
 *
 * 2026-11-22 从 7 类扩到 8 类（竞品 10 类拆解合并）：
 *   宿舍生活+床上用品 → 住宿寝室；洗漱清洁+护肤理容 → 洗漱护理；药品健康为新增类。
 * 顺序与 EIGHT_CATEGORIES / store.CAT_KEYS 严格一致，「下一步」跳转才与宫格视觉同序。
 */

const CATEGORIES = [
  { key: 'id', label: '证件材料', tint: '#E7F3ED', desc: '身份证 · 录取通知书 · 户口本' },
  { key: 'bed', label: '住宿寝室', tint: '#F0EBFF', desc: '床品 · 收纳 · 宿舍日用' },
  { key: 'shirt', label: '衣物鞋饰', tint: '#FFEAF1', desc: '当季衣物 · 鞋帽配饰' },
  { key: 'soap', label: '洗漱护理', tint: '#E6F7EE', desc: '洗漱 · 护肤 · 洗衣' },
  { key: 'book', label: '学习用品', tint: '#FFF4DC', desc: '文具 · 书籍 · 笔记本' },
  { key: 'laptop', label: '数码电子', tint: '#FDF1E5', desc: '电脑 · 充电 · 配件' },
  { key: 'med', label: '药品健康', tint: '#E3F4F1', desc: '常用药 · 外伤消毒 · 长期用药' },
  { key: 'mil', label: '军训用品', tint: '#FFE4E1', desc: '防晒 · 防暑 · 鞋垫' }
];

// key → label 映射（checklist 导航标题 / toast 等场景用）
const CAT_MAP = {};
CATEGORIES.forEach((c) => { CAT_MAP[c.key] = c.label; });

module.exports = { CATEGORIES, CAT_MAP };
