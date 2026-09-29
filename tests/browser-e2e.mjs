import fs from 'node:fs';

const src = process.argv[2];
const out = process.argv[3];
let h = fs.readFileSync(src, 'utf8');

const e2e = `
<script>
(async () => {
  const log = [];
  const ok = (n, c, x) => log.push((c ? '\\u2713 ' : '\\u2717 ') + n + (x ? '  ' + x : ''));
  try {
    const w = 64, hh = 48;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const id = ctx.createImageData(w, hh);
    for (let i = 0; i < id.data.length; i += 4) {
      id.data[i] = (i * 37) % 256;
      id.data[i + 1] = (i * 53) % 256;
      id.data[i + 2] = (i * 97) % 256;
      id.data[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    const decodeViaCanvas = async (imageData, mime, q) => {
      const c = document.createElement('canvas'); c.width = imageData.width; c.height = imageData.height;
      c.getContext('2d', { willReadFrequently: true }).putImageData(imageData, 0, 0);
      const blob = await canvasToBlob(c, mime, q);
      const img = await loadImage(URL.createObjectURL(blob));
      return imageToImageData(img);
    };
    const md = (a, b) => { let d = 0; for (let i = 0; i < a.data.length; i++) d = Math.max(d, Math.abs(a.data[i] - b.data[i])); return d; };

    /* 1. 小番茄 */
    const enc = tomatoProcess(id, 1, false);
    const decPng = tomatoProcess(await decodeViaCanvas(enc, 'image/png'), 1, true);
    ok('[小番茄] 经 canvas+PNG 往返无损', md(decPng, id) === 0, 'maxDiff=' + md(decPng, id));
    const decJpg = tomatoProcess(await decodeViaCanvas(enc, 'image/jpeg', 0.95), 1, true);
    let sumJ = 0, nJ = 0;
    for (let i = 0; i < decJpg.data.length; i++) { sumJ += Math.abs(decJpg.data[i] - id.data[i]); nJ++; }
    const meanJ = sumJ / nJ;
    ok('[小番茄] JPEG 有损且明显劣于 PNG（故工具默认 PNG）', meanJ > 0,
       'meanDiff=' + meanJ.toFixed(2) + ' maxDiff=' + md(decJpg, id));
    ok('[小番茄] 混淆图与原图差异巨大', md(enc, id) > 100, 'maxDiff=' + md(enc, id));

    /* 2. 光棱坦克 */
    const Ti = 24, Tc = 42;
    const mk = (seed, base) => {
      const d = ctx.createImageData(w, hh);
      for (let i = 0; i < d.data.length; i += 4) {
        d.data[i] = (i * seed + base) % 256;
        d.data[i + 1] = (i * seed + base * 2) % 256;
        d.data[i + 2] = (i * seed + base * 3) % 256;
        d.data[i + 3] = 255;
      }
      return d;
    };
    const inner = mk(11, 5), cover = mk(7, 60);
    const comp = prismEncode(inner, cover, { innerThreshold: Ti, coverThreshold: Tc, slope: 1, gap: 1, isRow: true, isReverse: false });
    const compBack = await decodeViaCanvas(comp, 'image/png');
    ok('[光棱] PNG 保存后逐像素无损', md(compBack, comp) === 0, 'maxDiff=' + md(compBack, comp));
    const di = prismDecode(compBack, { lowerThreshold: 0, higherThreshold: Ti, method: 'ltavg' });
    let ei = 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      if (encodeIsCover(x, y, 1, 1, true)) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) ei = Math.max(ei, Math.abs(di.data[i + c] - inner.data[i + c]));
    }
    ok('[光棱] 解码阈值 0~Ti 还原里图', ei <= 11, 'maxErr=' + ei);
    const dc = prismDecode(compBack, { lowerThreshold: Tc, higherThreshold: 255, method: 'ltavg' });
    let ec = 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      if (!encodeIsCover(x, y, 1, 1, true)) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) ec = Math.max(ec, Math.abs(dc.data[i + c] - cover.data[i + c]));
    }
    ok('[光棱] 解码阈值 Tc~255 还原表图', ec <= 2, 'maxErr=' + ec);
    const dGray = toGrayID(inner);
    const compG = prismEncode(dGray, toGrayID(cover), { innerThreshold: Ti, coverThreshold: Tc, slope: 1, gap: 1, isRow: true, isReverse: false });
    ok('[光棱] 灰度+交错合成尺寸正确', compG.width === w && compG.height === hh);

    /* 3. 其他算法经 canvas 往返 */
    const cases = [['PicEncrypt行', picEncryptRow, 0.114514], ['PicEncrypt行列', picEncryptRowColumn, 0.114514],
                   ['RowPixel', rowPixelObfuscate, '114514'], ['PerPixel', perPixelObfuscate, '114514']];
    for (const [nm, fn, k] of cases) {
      const e = fn(id, k, false);
      const back = fn(await decodeViaCanvas(e, 'image/png'), k, true);
      ok('[更多] ' + nm + ' 经 canvas+PNG 往返无损', md(back, id) === 0, 'maxDiff=' + md(back, id));
    }

    /* 4. ZIP / 下载链路 */
    const zip = await buildZip([{ name: 'a.png', data: new Uint8Array([1, 2, 3]) }, { name: '混淆_测试图.png', data: new Uint8Array([4, 5]) }]);
    ok('[ZIP] 生成成功', zip.size > 0, 'size=' + zip.size + 'B');

    /* 4b. 半透明像素的已知限制（浏览器 canvas alpha 预乘） */
    const semi = ctx.createImageData(w, hh);
    for (let i = 0; i < semi.data.length; i += 4) {
      semi.data[i] = 200; semi.data[i + 1] = 100; semi.data[i + 2] = 50; semi.data[i + 3] = 60;
    }
    const semiBack = await decodeViaCanvas(tomatoProcess(semi, 1, false), 'image/png');
    const semiDec = tomatoProcess(semiBack, 1, true);
    let semiDiff = 0;
    for (let i = 0; i < semiDec.data.length; i++) semiDiff = Math.max(semiDiff, Math.abs(semiDec.data[i] - semi.data[i]));
    ok('[限制] 半透明像素经 canvas 往返会损失精度（已知浏览器行为）', semiDiff > 0, 'maxDiff=' + semiDiff);

    /* 5. 界面结构 */
    ok('[UI] 标签页 = 4', document.querySelectorAll('nav.tabs button').length === 4, document.querySelectorAll('nav.tabs button').length + '');
    ok('[UI] 四个面板均存在', ['pane-tomato', 'pane-prism', 'pane-more', 'pane-theory'].every(i => !!document.getElementById(i)));
    ok('[UI] 关键控件齐全', ['tm-dz', 'tm-enc', 'tm-dec', 'tm-zip', 'tm-grid', 'in-dz', 'cv-dz', 'out-cvs', 'out-test',
        'dc-dz', 'dc-cvs', 'dc-lo', 'dc-hi', 'dc-method', 'mr-dz', 'mr-alg', 'mr-enc'].every(i => !!document.getElementById(i)));
    ok('[UI] 无 emoji 装饰字符', !/[\\u{1F300}-\\u{1FAFF}]/u.test(document.body.innerText));
    ok('[UI] 页面无残留占位文字', document.body.innerText.indexOf('undefined') < 0 && document.body.innerText.indexOf('NaN') < 0);
    ok('[UI] 拖放区默认提示正确', document.querySelector('#tm-dz').innerText.indexOf('点击选择') >= 0);
    ok('[UI] 解码面板默认隐藏', document.querySelector('#pr-dec').style.display === 'none' || getComputedStyle(document.querySelector('#pr-dec')).display === 'none');
  } catch (e) {
    log.push('\\u2717 EXCEPTION: ' + (e && (e.stack || e.message) || e));
  }
  document.title = 'E2E-DONE';
  const pre = document.createElement('pre');
  pre.id = 'e2e-result';
  pre.textContent = 'E2E-RESULT\\n' + log.join('\\n') + '\\nE2E-END';
  document.body.appendChild(pre);
})();
</scr` + `ipt>
`;

h = h.replace('</body>', e2e + '</body>');
fs.writeFileSync(out, h, 'utf8');
console.log('written ' + out);
