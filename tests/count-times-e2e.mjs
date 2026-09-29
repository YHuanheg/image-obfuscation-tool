import fs from 'node:fs';
const src = process.argv[2], out = process.argv[3];
let h = fs.readFileSync(src, 'utf8');

const e2e = `
<script>
(async () => {
  const log = [];
  const ok = (n, c, x) => log.push((c ? '\\u2713 ' : '\\u2717 ') + n + (x ? '  ' + x : ''));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    /* ---- 造一张 64x64 测试图，作为 File 喂给文件输入框 ---- */
    const W = 64, H = 64;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const c0 = mk(); const x0 = c0.getContext('2d', {willReadFrequently:true});
    const srcData = x0.createImageData(W, H);
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const i=(y*W+x)*4;
      srcData.data[i]=(x*3+(((x/8|0)+((y/8|0)))%2?70:130))%256;
      srcData.data[i+1]=(y*4+80)%256; srcData.data[i+2]=(((x/8|0)+((y/8|0)))%2?60:200);
      srcData.data[i+3]=255; }
    x0.putImageData(srcData,0,0);
    const blob = await canvasToBlob(c0, 'image/png');
    const file = new File([blob], 'e2e-test.png', { type: 'image/png' });

    /* ---- 界面元素存在性 ---- */
    ok('[UI] 处理次数输入框存在', !!document.getElementById('tm-times'));
    ok('[UI] 次数提示条存在', !!document.getElementById('tm-times-note'));

    /* ---- 靠 input.files 喂图 ---- */
    const fi = document.getElementById('tm-file');
    const dt = new DataTransfer(); dt.items.add(file);
    fi.files = dt.files;
    fi.dispatchEvent(new Event('change'));

    // 等图片解码进 data
    let card = null;
    for (let i=0;i<80;i++){ await sleep(100);
      card = document.querySelector('#tm-grid .item');
      if (card && card.querySelector('.dim').textContent.includes('×')) break; }
    ok('[流程] 图片已被读入并渲染出卡片', !!card && card.querySelector('.dim').textContent.includes('64'));
    ok('[流程] 卡片尺寸行显示 64 × 64', card && card.querySelector('.dim').textContent.includes('64 × 64'),
       card ? card.querySelector('.dim').textContent : '-');

    /* ---- 设定次数 = 3，检查按钮文案联动 ---- */
    const ti = document.getElementById('tm-times');
    ti.value = '3'; ti.dispatchEvent(new Event('input'));
    ok('[UI] 按钮文案随次数联动为「混淆 3 次」',
       document.getElementById('tm-enc').textContent.trim() === '混淆 3 次',
       document.getElementById('tm-enc').textContent.trim());
    ok('[UI] 次数提示条已显示', document.getElementById('tm-times-note').style.display !== 'none');

    /* ---- 点「混淆 3 次」 ---- */
    document.getElementById('tm-enc').click();
    for (let i=0;i<120;i++){ await sleep(100);
      const st = card.querySelector('.st').textContent;
      if (st === '完成' || st.indexOf('失败') === 0) break; }
    ok('[流程] 处理完成（未失败）', card.querySelector('.st').textContent === '完成',
       card.querySelector('.st').textContent);
    ok('[UI] 卡片上出现周期/偏移信息',
       card.querySelector('.xinfo').textContent.indexOf('可见周期') >= 0,
       JSON.stringify(card.querySelector('.xinfo').textContent));

    /* ---- 把界面产出的图拿回来，与「老老实实循环 3 次」对拍 ---- */
    const thumbImg = card.querySelector('.thumb img');
    const back = imageToImageData(await loadImage(thumbImg.src));
    let ref = srcData;
    for (let k=0;k<3;k++) ref = tomatoProcess(ref, 1, false);
    let md = 0;
    for (let i=0;i<back.data.length;i++) md = Math.max(md, Math.abs(back.data[i]-ref.data[i]));
    ok('[核心] 界面输出 == 逐次混淆 3 次（逐像素）', md === 0, 'maxDiff=' + md);

    /* ---- 次数 = 可见周期 m(64x64)=4096 → 应该等于"什么都没做" ---- */
    ti.value = '4096'; ti.dispatchEvent(new Event('input'));
    ok('[UI] 按钮文案联动为「混淆 4096 次」',
       document.getElementById('tm-enc').textContent.trim() === '混淆 4096 次');
    document.getElementById('tm-enc').click();
    for (let i=0;i<120;i++){ await sleep(100);
      const st = card.querySelector('.st').textContent;
      if (st === '完成') break; }
    const back2 = imageToImageData(await loadImage(card.querySelector('.thumb img').src));
    let md2 = 0;
    for (let i=0;i<back2.data.length;i++) md2 = Math.max(md2, Math.abs(back2.data[i]-srcData.data[i]));
    ok('[核心] 混淆 m=4096 次 == 原图（逐像素）', md2 === 0, 'maxDiff=' + md2);
    ok('[UI] 已提示「等于没做」',
       card.querySelector('.xinfo').textContent.indexOf('完全相同') >= 0,
       JSON.stringify(card.querySelector('.xinfo').textContent));
    ok('[UI] 该提示被标为警告色', card.querySelector('.xinfo').style.color.indexOf('warn') >= 0 ||
       card.querySelector('.xinfo').style.color !== '', card.querySelector('.xinfo').style.color);

    /* ---- 回到 1 次，验证按钮文案复原 ---- */
    ti.value = '1'; ti.dispatchEvent(new Event('input'));
    ok('[UI] 次数=1 时按钮文案复原为「混淆」',
       document.getElementById('tm-enc').textContent.trim() === '混淆');

    /* ---- 解混淆方向也走一遍 ---- */
    ti.value = '3'; ti.dispatchEvent(new Event('input'));
    document.getElementById('tm-dec').click();
    for (let i=0;i<120;i++){ await sleep(100); if (card.querySelector('.st').textContent === '完成') break; }
    const back3 = imageToImageData(await loadImage(card.querySelector('.thumb img').src));
    let refD = srcData;
    for (let k=0;k<3;k++) refD = tomatoProcess(refD, 1, true);
    let md3 = 0;
    for (let i=0;i<back3.data.length;i++) md3 = Math.max(md3, Math.abs(back3.data[i]-refD.data[i]));
    ok('[核心] 界面输出 == 逐次解混淆 3 次（逐像素）', md3 === 0, 'maxDiff=' + md3);
  } catch (e) { log.push('\\u2717 EXCEPTION: ' + (e && (e.stack || e.message) || e)); }
  document.title = 'E2E-DONE';
  const pre = document.createElement('pre'); pre.id = 'e2e-result';
  pre.textContent = 'E2E-RESULT\\n' + log.join('\\n') + '\\nE2E-END';
  document.body.appendChild(pre);
})();
</scr` + `ipt>
`;
h = h.replace('</body>', e2e + '</body>');
fs.writeFileSync(out, h, 'utf8');
console.log('written ' + out);
