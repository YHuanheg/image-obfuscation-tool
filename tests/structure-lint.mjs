import fs from 'node:fs';
const p = process.argv[2];
const h = fs.readFileSync(p, 'utf8');

const ents = [...h.matchAll(/&#(\d+);/g)];
console.log('剩余数字实体：', ents.length ? ents.map(m => m[0] + ' U+' + Number(m[1]).toString(16).toUpperCase()).join('  ') : '无');

const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu;
const bad = [...h.matchAll(emojiRe)];
console.log('直写 emoji 字符：', bad.length ? [...new Set(bad.map(m => m[0]))].join(' ') : '无');

const open = (h.match(/<div\b/g) || []).length;
const close = (h.match(/<\/div>/g) || []).length;
console.log('div 配对：<div ' + open + '  </div> ' + close + '  -> ' + (open === close ? 'OK' : '不匹配!'));

const so = (h.match(/<section\b/g) || []).length, sc = (h.match(/<\/section>/g) || []).length;
console.log('section 配对：' + so + ' / ' + sc + ' -> ' + (so === sc ? 'OK' : '不匹配!'));

const sc2 = (h.match(/<script\b/g) || []).length, sc2c = (h.match(/<\/script>/g) || []).length;
console.log('script 配对：' + sc2 + ' / ' + sc2c);

console.log('文件大小：' + (h.length / 1024).toFixed(1) + ' KB');
console.log('总行数：' + h.split('\n').length);
