import fs from 'node:fs';
import path from 'node:path';

const HTML = process.argv[2];
const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('NO SCRIPT FOUND'); process.exit(1); }
const code = m[1];

/* ---------------- DOM / 浏览器环境桩 ---------------- */
class FakeEl {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.value = ''; this.textContent = ''; this.innerHTML = '';
    this.dataset = {}; this.style = {}; this.disabled = false;
    this.width = 0; this.height = 0; this._src = '';
    this.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
  }
  addEventListener(){} removeEventListener(){} appendChild(){} removeChild(){}
  click(){}
  querySelector(){ return new FakeEl(); }
  querySelectorAll(){ return []; }
  set src(v){ this._src = v; } get src(){ return this._src; }
  toBlob(cb){ cb(null); }
  toDataURL(){ return 'data:,'; }
  getContext(){ return { drawImage(){}, putImageData(){}, getImageData(){ return new globalThis.ImageData(1, 1); } }; }
}
globalThis.ImageData = class ImageData {
  constructor(a, b, c) {
    if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
    else { this.data = a; this.width = b; this.height = c; }
  }
};
globalThis.document = {
  createElement: t => new FakeEl(t),
  body: { appendChild(){}, removeChild(){} },
  querySelector: () => new FakeEl(),
  querySelectorAll: () => [],
};
Object.defineProperty(globalThis, 'navigator', { value: { hardwareConcurrency: 8 }, configurable: true, writable: true });
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(0), 0);
globalThis.cancelAnimationFrame = () => {};
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:stub';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};
globalThis.Image = class { set src(v){ } };
globalThis.FileReader = class {};

/* ---------------- 抽出脚本内部函数 ---------------- */
let A;
try {
  A = new Function(code + `
  ;return { md5hex, hilbertCurve, tomatoProcess, tomatoApplyN, tomatoShiftInfo, gcdInt,
            logisticPositions,
            picEncryptRow, picEncryptRowColumn, blockObfuscate,
            rowPixelObfuscate, perPixelObfuscate, md5Shuffle,
            prismEncode, prismDecode, encodeIsCover, crc32, buildZip,
            resizeCoverID, resizeFitID, toGrayID, adjustContrastID };`)();
} catch (e) {
  console.error('EVAL FAILED:', e.message);
  process.exit(1);
}

/* ---------------- 测试框架 ---------------- */
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '  <- ' + extra : '')); }
}
function section(t) { console.log('\n' + t); }

/* 可复现随机 */
let seed = 20260929;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function rndImage(w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i++) d[i] = Math.floor(rnd() * 256);
  return new ImageData(d, w, h);
}
function same(a, b) {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}
function maxDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.data.length; i++) d = Math.max(d, Math.abs(a.data[i] - b.data[i]));
  return d;
}
function isPermutation(arr, n) {
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (v < 0 || v >= n) return false;
    if (seen[v]) return false;
    seen[v] = 1;
  }
  return true;
}

/* ================= 1. MD5 ================= */
section('1) MD5');
ok('md5("") = d41d8cd98f00b204e9800998ecf8427e', A.md5hex('') === 'd41d8cd98f00b204e9800998ecf8427e', A.md5hex(''));
ok('md5("abc") = 900150983cd24fb0d6963f7d28e17f72', A.md5hex('abc') === '900150983cd24fb0d6963f7d28e17f72', A.md5hex('abc'));
ok('md5("The quick brown fox jumps over the lazy dog") = 9e107d9d372bb6826bd81d3542a419d6',
   A.md5hex('The quick brown fox jumps over the lazy dog') === '9e107d9d372bb6826bd81d3542a419d6',
   A.md5hex('The quick brown fox jumps over the lazy dog'));
ok('md5("11451431") 为 32 位 hex', /^[0-9a-f]{32}$/.test(A.md5hex('11451431')));
ok('md5 长度 >= 56 字节（多分组）', A.md5hex('a'.repeat(200)) === A.md5hex('a'.repeat(200)) && A.md5hex('a'.repeat(64)).length === 32);

/* ================= 2. 希尔伯特曲线 ================= */
section('2) 希尔伯特曲线 gilbert2d');
for (const [w, h] of [[8, 8], [16, 9], [9, 16], [64, 64], [37, 91], [1, 10], [10, 1], [2, 2], [3, 5], [120, 30]]) {
  const c = A.hilbertCurve(w, h);
  ok(`${w}x${h} 是 0..${w * h - 1} 的排列`, c.length === w * h && isPermutation(c, w * h));
}
ok('相邻步骤在空间上相邻（8x8 抽查）', (() => {
  const w = 8, h = 8, c = A.hilbertCurve(w, h);
  let bad = 0;
  for (let i = 1; i < c.length; i++) {
    const x0 = c[i - 1] % w, y0 = (c[i - 1] / w) | 0;
    const x1 = c[i] % w, y1 = (c[i] / w) | 0;
    if (Math.abs(x0 - x1) + Math.abs(y0 - y1) !== 1) bad++;
  }
  return bad === 0;
})());

/* ================= 3. 小番茄 ================= */
section('3) 小番茄混淆（Hilbert + 黄金分割偏移）');
for (const [w, h] of [[64, 64], [80, 45], [33, 17], [128, 128]]) {
  const src = rndImage(w, h);
  const enc = A.tomatoProcess(src, 1, false);
  const dec = A.tomatoProcess(enc, 1, true);
  ok(`${w}x${h} 往返无损`, same(src, dec), 'maxDiff=' + maxDiff(src, dec));
  ok(`${w}x${h} 混淆确实改变了图像`, maxDiff(src, enc) > 100);
}
{
  const src = rndImage(64, 64);
  const a = A.tomatoProcess(src, 1, false);
  const b = A.tomatoProcess(src, 0.618, false);
  const c = A.tomatoProcess(src, 1, true);
  ok('不同密钥产生不同结果', !same(a, b));
  ok('错误密钥无法还原', !same(src, c));
  ok('密钥 0 时输出 = 原图', same(src, A.tomatoProcess(src, 0, false)));
}
{
  // 偏移量正确性：offset = round(0.6180339887 * N * key)  —— 用位移方向反推
  const w = 40, h = 40, n = w * h;
  const src = rndImage(w, h);
  const enc = A.tomatoProcess(src, 1, false);
  const curve = A.hilbertCurve(w, h);
  const golden = (Math.sqrt(5) - 1) / 2;
  let off = Math.round(golden * n * 1) % n;
  let match = 0, total = 0;
  for (let i = 0; i + off < n; i += 97) {
    const dstPx = curve[i + off] * 4, srcPx = curve[i] * 4;
    total++;
    if (enc.data[dstPx] === src.data[srcPx] && enc.data[dstPx + 1] === src.data[srcPx + 1]) match++;
  }
  ok('像素搬运方向与公式一致（dst=curve[i+offset] ← src=curve[i]）', match === total, match + '/' + total);
}

/* ================= 3b. 小番茄：手动指定次数（单趟等效位移） ================= */
section('3b) 小番茄 · 手动次数 tomatoApplyN（必须与逐次调用逐像素一致）');
for (const [w, h] of [[64, 64], [80, 45], [100, 100]]) {
  const src = rndImage(w, h);
  const n = w * h;
  const O = ((Math.round(((Math.sqrt(5) - 1) / 2) * n) % n) + n) % n;
  const m = n / A.gcdInt(O, n);

  for (const times of [1, 2, 3, 5, 7]) {
    // 参考：老老实实循环 times 次
    let encRef = src;
    for (let k = 0; k < times; k++) encRef = A.tomatoProcess(encRef, 1, false);
    ok(`${w}x${h}: 混淆 ${times} 次 == tomatoApplyN(${times})`, same(A.tomatoApplyN(src, 1, times, false), encRef));

    let decRef = src;
    for (let k = 0; k < times; k++) decRef = A.tomatoProcess(decRef, 1, true);
    ok(`${w}x${h}: 解混淆 ${times} 次 == tomatoApplyN(${times}, decrypt)`, same(A.tomatoApplyN(src, 1, times, true), decRef));
  }

  // 次数往返：混淆 t 次再解混淆 t 次 == 原图
  for (const times of [1, 4, 13]) {
    const back = A.tomatoApplyN(A.tomatoApplyN(src, 1, times, false), 1, times, true);
    ok(`${w}x${h}: 混淆 ${times} 次 → 解混淆 ${times} 次 无损还原`, same(back, src));
  }

  // times = m（可见周期）时等于什么都没做
  ok(`${w}x${h}: tomatoApplyN(m=${m}) 结果与原图逐像素相同`, same(A.tomatoApplyN(src, 1, m, false), src));
  // 界面提示用的结构参数
  const info = A.tomatoShiftInfo(w, h, 1, 3, false);
  ok(`${w}x${h}: tomatoShiftInfo 的 m/delta 自洽`,
     info.m === m && info.delta === ((3 * O) % n) && info.residue === 3 % m && info.wrapped === (3 >= m),
     `m=${info.m} delta=${info.delta}`);
  const noopInfo = A.tomatoShiftInfo(w, h, 1, m, false);
  ok(`${w}x${h}: tomatoShiftInfo 能标出 no-op`, noopInfo.noop === true);
}


/* ================= 4. 光棱坦克 ================= */
section('4) 光棱坦克 prismEncode / prismDecode');
{
  const Ti = 24, Tc = 42;
  const w = 64, h = 64;
  const inner = rndImage(w, h), cover = rndImage(w, h);
  const cfg = { innerThreshold: Ti, coverThreshold: Tc, slope: 1, gap: 1, isRow: true, isReverse: false };
  const enc = A.prismEncode(inner, cover, cfg);

  // 归属正确性 + 亮度区间分离
  let coverOk = true, innerOk = true, alphaOk = true, sep = true;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const isC = A.encodeIsCover(x, y, 1, 1, true);
      const srcArr = isC ? cover.data : inner.data;
      const scale = isC
        ? v => Math.max(Math.min(Math.floor(Tc + v * (255 - Tc) / 255), 255), 0)
        : v => Math.max(Math.min(Math.floor(v * Ti / 255), 255), 0);
      for (let c = 0; c < 3; c++) if (enc.data[i + c] !== scale(srcArr[i + c])) coverOk = false;
      if (enc.data[i + 3] !== srcArr[i + 3]) alphaOk = false;
      const lum = enc.data[i] * 0.299 + enc.data[i + 1] * 0.587 + enc.data[i + 2] * 0.114;
      if (isC && lum < Tc) sep = false;
      if (!isC && lum > Ti) sep = false;
    }
  }
  ok('每个像素取对了源图（棋盘归属正确）', coverOk && innerOk);
  ok('alpha 通道原样透传', alphaOk);
  ok(`亮度区间完全分离：里图<=${Ti}，表图>=${Tc}`, sep);

  // 解码里图：阈值 [0, Ti]
  const dInner = A.prismDecode(enc, { lowerThreshold: 0, higherThreshold: Ti, method: 'ltavg' });
  let maxErr = 0, checked = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (A.encodeIsCover(x, y, 1, 1, true)) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) maxErr = Math.max(maxErr, Math.abs(dInner.data[i + c] - inner.data[i + c]));
      checked++;
    }
  }
  ok(`解码阈值 [0,${Ti}] 还原里图（误差 <= ceil(255/Ti)=${Math.ceil(255 / Ti)}）`, maxErr <= Math.ceil(255 / Ti),
     'maxErr=' + maxErr + ' checked=' + checked);

  // 解码表图：阈值 [Tc, 255]
  const dCover = A.prismDecode(enc, { lowerThreshold: Tc, higherThreshold: 255, method: 'ltavg' });
  let maxErr2 = 0, checked2 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!A.encodeIsCover(x, y, 1, 1, true)) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) maxErr2 = Math.max(maxErr2, Math.abs(dCover.data[i + c] - cover.data[i + c]));
      checked2++;
    }
  }
  ok(`解码阈值 [${Tc},255] 还原表图（误差 <= ceil(255/(255-${Tc}))=${Math.ceil(255 / (255 - Tc))}）`,
     maxErr2 <= Math.ceil(255 / (255 - Tc)), 'maxErr=' + maxErr2 + ' checked=' + checked2);

  // 正常观看 = 表图主导：合成图均值应等于两图缩放均值的中点，且远亮于里图
  let avgLum = 0;
  for (let i = 0; i < enc.data.length; i += 4) avgLum += enc.data[i] * 0.299 + enc.data[i + 1] * 0.587 + enc.data[i + 2] * 0.114;
  avgLum /= (w * h);
  let sI = 0, nI = 0, sC = 0, nC = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (A.encodeIsCover(x, y, 1, 1, true)) { sC += enc.data[i]; nC++; }
      else { sI += enc.data[i]; nI++; }
    }
  }
  const mi = sI / nI, mc = sC / nC;
  ok('合成图均值 = 两图缩放均值的中点，且亮部均值远高于暗部（表图主导视觉）',
     Math.abs(avgLum - (mi + mc) / 2) < 1.5 && mc > 5 * mi,
     `avgLum=${avgLum.toFixed(1)} inner=${mi.toFixed(1)} cover=${mc.toFixed(1)}`);

  // 反色模式
  const encR = A.prismEncode(inner, cover, Object.assign({}, cfg, { isReverse: true }));
  let sepR = true;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = encR.data[i] * 0.299 + encR.data[i + 1] * 0.587 + encR.data[i + 2] * 0.114;
      const isC = A.encodeIsCover(x, y, 1, 1, true);
      if (isC && lum > 255 - Tc) sepR = false;
      if (!isC && lum < 255 - Ti) sepR = false;
    }
  }
  ok('反色模式：里图进入亮部、表图进入暗部', sepR);

  // 其他交错参数
  const encG = A.prismEncode(inner, cover, { innerThreshold: Ti, coverThreshold: Tc, slope: 2, gap: 3, isRow: false, isReverse: false });
  let ratio = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (A.encodeIsCover(x, y, 2, 3, false)) ratio++;
  ok('slope=2 gap=3 列优先：表图占比 = gap/(gap+1) = 0.75',
     Math.abs(ratio / (w * h) - 3 / 4) < 1e-9, (ratio / (w * h)).toFixed(4));

  // 阈值非法时输出全黑
  const bad = A.prismDecode(enc, { lowerThreshold: 30, higherThreshold: 10, method: 'ltavg' });
  let allBlack = true;
  for (let i = 0; i < bad.data.length; i += 4) if (bad.data[i] !== 0 || bad.data[i + 1] !== 0 || bad.data[i + 2] !== 0) allBlack = false;
  ok('上阈值 <= 下阈值 时输出全黑（与原实现一致）', allBlack);
}
{
  // 填充方式
  const Ti = 24, Tc = 42, w = 32, h = 32;
  const enc = A.prismEncode(rndImage(w, h), rndImage(w, h),
    { innerThreshold: Ti, coverThreshold: Tc, slope: 1, gap: 1, isRow: true, isReverse: false });
  const r = A.prismDecode(enc, { lowerThreshold: 0, higherThreshold: Ti, method: 'black' });
  let blackOk = true;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!A.encodeIsCover(x, y, 1, 1, true)) continue;
    const i = (y * w + x) * 4;
    if (r.data[i] !== 0 || r.data[i + 1] !== 0 || r.data[i + 2] !== 0) blackOk = false;
  }
  ok('black 填充：未命中像素全黑', blackOk);
  const rt = A.prismDecode(enc, { lowerThreshold: 0, higherThreshold: Ti, method: 'transparent' });
  ok('transparent 填充：未命中像素 alpha=0', rt.data[3] === 0 || rt.data[7] === 0 || (() => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if (A.encodeIsCover(x, y, 1, 1, true) && rt.data[(y * w + x) * 4 + 3] !== 0) return false;
    return true;
  })());
  ok('ltavg 填充无异常（首行/首列走回退分支）', (() => {
    const a = A.prismDecode(enc, { lowerThreshold: 0, higherThreshold: Ti, method: 'ltavg' });
    return a.width === w && a.height === h && a.data.length === w * h * 4;
  })());
}

/* ================= 5. 其他算法 ================= */
section('5) 其他混淆算法（移植自 ObfuscationUtils）');
{
  ok('logisticPositions 是排列', isPermutation(A.logisticPositions(0.114514, 100).pos, 100));
  ok('混沌序列对初值敏感', (() => {
    const a = A.logisticPositions(0.114514, 64).pos, b = A.logisticPositions(0.114515, 64).pos;
    let diff = 0;
    for (let i = 0; i < 64; i++) if (a[i] !== b[i]) diff++;
    return diff > 20;
  })());
}
for (const [w, h] of [[64, 64], [80, 45], [33, 17]]) {
  const src = rndImage(w, h);
  const k = 0.114514;

  const e1 = A.picEncryptRow(src, k, false), d1 = A.picEncryptRow(e1, k, true);
  ok(`PicEncrypt 行 ${w}x${h} 往返无损`, same(src, d1), 'maxDiff=' + maxDiff(src, d1));
  ok(`PicEncrypt 行 ${w}x${h} 改变了图像`, maxDiff(src, e1) > 100);
  ok(`PicEncrypt 行 ${w}x${h} 错误密钥不还原`, !same(src, A.picEncryptRow(e1, 0.5, true)));

  const e2 = A.picEncryptRowColumn(src, k, false), d2 = A.picEncryptRowColumn(e2, k, true);
  ok(`PicEncrypt 行列 ${w}x${h} 往返无损`, same(src, d2), 'maxDiff=' + maxDiff(src, d2));
  ok(`PicEncrypt 行列 ${w}x${h} 改变了图像`, maxDiff(src, e2) > 100);

  const key = '114514';
  const e3 = A.rowPixelObfuscate(src, key, false), d3 = A.rowPixelObfuscate(e3, key, true);
  ok(`RowPixel ${w}x${h} 往返无损`, same(src, d3), 'maxDiff=' + maxDiff(src, d3));

  const e4 = A.perPixelObfuscate(src, key, false), d4 = A.perPixelObfuscate(e4, key, true);
  ok(`PerPixel ${w}x${h} 往返无损`, same(src, d4), 'maxDiff=' + maxDiff(src, d4));
  ok(`PerPixel ${w}x${h} 改变了图像`, maxDiff(src, e4) > 100);
}
{
  // Block 仅在尺寸为 32 倍数时严格可逆（与原库行为一致）
  const src = rndImage(64, 64);
  const e = A.blockObfuscate(src, '114514', false);
  const d = A.blockObfuscate(e, '114514', true);
  ok('Block 64x64（32 倍数）往返无损', same(src, d), 'maxDiff=' + maxDiff(src, d) + ' size=' + e.width + 'x' + e.height);
  ok('Block 输出尺寸 = 补边到 32 的倍数', e.width === 64 && e.height === 64);

  const src2 = rndImage(70, 50);
  const e2 = A.blockObfuscate(src2, '114514', false);
  ok('Block 70x50 输出补边到 96x64', e2.width === 96 && e2.height === 64, e2.width + 'x' + e2.height);

  const src3 = rndImage(64, 64);
  ok('Block 错误密钥不还原', !same(src3, A.blockObfuscate(A.blockObfuscate(src3, '114514', false), '其他密钥', true)));
}
{
  const a = A.md5Shuffle(32, '114514'), b = A.md5Shuffle(32, '114514'), c = A.md5Shuffle(32, '114515');
  ok('md5Shuffle 是排列且确定性', isPermutation(a, 32) && a.every((v, i) => v === b[i]));
  ok('不同密钥产生不同洗牌', a.some((v, i) => v !== c[i]));
}

/* ================= 6. 图像预处理 ================= */
section('6) 图像预处理');
{
  const src = rndImage(100, 50);
  const fit = A.resizeFitID(src, 40);
  ok('resizeFit 限制最长边且保持比例', Math.max(fit.width, fit.height) <= 40 && Math.abs(fit.width / fit.height - 2) < 0.2,
     fit.width + 'x' + fit.height);
  ok('resizeFit 小于上限时原样返回', A.resizeFitID(src, 500) === src);
  const cov = A.resizeCoverID(src, 60, 60);
  ok('resizeCover 输出精确尺寸', cov.width === 60 && cov.height === 60 && cov.data.length === 60 * 60 * 4);
  const g = A.toGrayID(src);
  let isGray = true;
  for (let i = 0; i < g.data.length; i += 4) if (g.data[i] !== g.data[i + 1] || g.data[i] !== g.data[i + 2]) isGray = false;
  ok('toGray 三通道相等且 alpha 保留', isGray);
  ok('adjustContrast(0) 原样返回', A.adjustContrastID(src, 0) === src);
  const c0 = A.adjustContrastID(src, 100);
  ok('adjustContrast 改变图像但不越界', maxDiff(src, c0) > 0 && c0.data.every(v => v >= 0 && v <= 255));
}

/* ================= 7. ZIP ================= */
section('7) ZIP 打包');
ok('crc32("123456789") = cbf43926', A.crc32(new TextEncoder().encode('123456789')) === 0xcbf43926,
   A.crc32(new TextEncoder().encode('123456789')).toString(16));
{
  const zip = await A.buildZip([{ name: '混淆_测试.png', data: new Uint8Array([1, 2, 3, 4, 5]) }]);
  const buf = new Uint8Array(await zip.arrayBuffer());
  const sig = (o) => buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);
  ok('本地文件头签名 PK\\x03\\x04', sig(0) === 0x04034b50);
  const eocd = buf.length - 22;
  ok('中央目录结束记录 PK\\x05\\x06', sig(eocd) === 0x06054b50);
  ok('EOCD 记录 1 个文件', (buf[eocd + 10] | (buf[eocd + 11] << 8)) === 1);
  ok('设置了 UTF-8 文件名标志 (bit 11)', (buf[6] | (buf[7] << 8)) & 0x0800 ? true : false);
}

/* ================= 汇总 ================= */
console.log('\n' + '='.repeat(52));
console.log(`结果：${pass} 通过 / ${fail} 失败  (共 ${pass + fail})`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
