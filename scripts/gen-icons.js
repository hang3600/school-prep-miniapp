// 从 design-tokens.json 生成全部图标 SVG 文件到 images/icons/
// 设计稿每个图标均给出 24×24 viewBox 的精确 path，零 emoji。
// 颜色全部取自令牌真源，避免图标与 CSS 主题脱节。
const fs = require('fs');
const path = require('path');

const TOKENS = '/Users/Titansong/WorkBuddy/2026-08-26-21-32-01/design-tokens.json';
const OUT = '/Users/Titansong/WorkBuddy/2026-08-26-21-32-01/school-prep-miniapp/images/icons';

const tokens = JSON.parse(fs.readFileSync(TOKENS, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

function writeSvg(name, viewBox, fill, inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="${fill}">${inner}</svg>\n`;
  fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
  return name;
}

const ic = tokens.icons;
const made = [];

// Tab 图标：选中白 / 未选灰 两态（颜色取自令牌）
['list', 'category', 'progress', 'user'].forEach((k) => {
  const v = ic[k];
  made.push(writeSvg('ic-' + k + '-gray', v.viewBox, ic.tabInactiveFill, v.variants.gray));
  made.push(writeSvg('ic-' + k + '-white', v.viewBox, '#FFFFFF', v.variants.white));
});

// 操作图标（固定色）
['download', 'share', 'close', 'plus', 'chevron', 'settings'].forEach((k) => {
  const v = ic[k];
  made.push(writeSvg('ic-' + k, v.viewBox, v.fill, v.svg));
});

// 分类图标（品牌色，置于类目底色圆角块）——7 个分类含军训(mil)
const cat = ic.categoryIcons;
['id', 'soap', 'book', 'bed', 'laptop', 'shirt', 'mil'].forEach((k) => {
  made.push(writeSvg('ic-cat-' + k, '0 0 24 24', cat.fill, cat[k]));
});

// 菜单图标（品牌色）
const menu = ic.menuIcons;
['medal', 'bell', 'help', 'info', 'shield'].forEach((k) => {
  made.push(writeSvg('ic-' + k, '0 0 24 24', menu.fill, menu[k]));
});

// 品牌 Logo
made.push(writeSvg('ic-backpack', ic.logoBackpack.viewBox, ic.logoBackpack.fill, ic.logoBackpack.svg));

console.log('generated', made.length, 'icons:', made.join(', '));
