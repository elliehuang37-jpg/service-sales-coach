// 以 headless Edge（CDP）測試銷售教練 PWA，並產生安裝截圖。
// node scripts/test/edge-test.js .          → 功能與 PWA 測試
// node scripts/test/edge-test.js . --shots  → 重新產生安裝截圖（之後記得 stamp-sw）
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.resolve(process.argv[2]); const SHOTS = process.argv.includes('--shots');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = `http://localhost:${srv.address().port}/`;
  const prof = fs.mkdtempSync(path.join(require('os').tmpdir(), 'edge-'));
  const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=9333', '--user-data-dir=' + prof, '--no-first-run', '--lang=zh-TW', 'about:blank'], { stdio: 'ignore' });
  let ver; for (let i = 0; i < 40; i++) { try { ver = await (await fetch('http://127.0.0.1:9333/json/version')).json(); break; } catch { await sleep(250); } }
  const tgt = (await (await fetch('http://127.0.0.1:9333/json/list')).json()).find(t => t.type === 'page');
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value).join(' ')); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(expr.slice(0, 80) + ' → ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const open = async url => { await send('Page.navigate', { url: base + url }); await sleep(900); };
  const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('no '+${JSON.stringify(sel)});e.click();return true})()`);
  const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) process.exitCode = 1; };

  await size(500, 1084);
  if (!SHOTS) {
    await open('');
    ok(await ev(`document.querySelector('#sheet').classList.contains('open') && document.querySelector('#sheetBody').innerText.includes('歡迎')`), '首次開啟出現歡迎畫面');
    await ev(`document.querySelector('#wName').value='測試員'`); await click('[data-act="w-role"][data-v="TM 電話"]'); await click('[data-act="welcome-go"]'); await sleep(300);
    ok(await ev(`location.hash.startsWith('#play/') && document.body.classList.contains('playing')`), '開始第一個練習（' + await ev('location.hash') + '）');
    // 每回合選最佳選項
    for (let i = 0; i < 6; i++) {
      const done = await ev(`!!document.querySelector('#result')`); if (done) break;
      await ev(`(()=>{const t=play.sc.turns[play.ti];const b=t.o.findIndex(o=>o.q===2);document.querySelector('[data-act="pick"][data-i="'+b+'"]').click()})()`); await sleep(150);
    }
    const r1 = await ev(`({score:play.result.score, mood:play.mood, saved:JSON.parse(localStorage.getItem('ssc-state')).sessions.length})`);
    ok(r1.score === 100 && r1.saved === 1, '全選最佳 → 100 分並存檔 ' + JSON.stringify(r1));
    // 自由作答＋合規
    await click('[data-act="replay"]'); await sleep(200);
    await click('[data-act="text-mode"]');
    await ev(`document.querySelector('#ans').value='保證有效，買一送一！'`); await click('[data-act="send"]'); await sleep(150);
    ok(await ev(`play.x===1 && document.querySelector('.msg.k.q0')!==null`), '自由作答：「保證有效」被標記合規風險');
    ok(await ev(`!!document.querySelector('#ans')`), '切到自由作答後下一回合維持打字模式');
    const neg = await ev(`[scoreText('膝蓋痛很辛苦，保健食品不能治療疾病，建議先給醫師檢查喔。',{focus:'EK',k:{}},SCENARIOS[5]), scoreText('我不敢跟您保證，效果因膚況而異，要不要先試用三天？',{focus:'EC',k:{}},SCENARIOS[0]), scoreText('吃了可以治療膝蓋痛',{focus:'K',k:{}},SCENARIOS[5])].map(r=>({q:r.q,x:r.x,s:r.s}))`);
    ok(neg[0].x === 0 && neg[0].q === 2, '否定語氣「不能治療」不算違規、且高分 ' + JSON.stringify(neg[0]));
    ok(neg[1].x === 0, '「不敢保證」不算違規 ' + JSON.stringify(neg[1]));
    ok(neg[2].x === 1, '「可以治療」算違規');
    // 返回鍵
    await click('#backBtn'); await sleep(300);
    ok(await ev(`location.hash==='#practice' && !document.body.classList.contains('playing') && play===null`), '返回鍵回到練習列表');
    // 篩選
    await click('[data-act="f-ch"][data-v="客服"]');
    ok(await ev(`document.querySelectorAll('.scen').length`) >= 1, '通路篩選：客服 ' + await ev(`document.querySelectorAll('#view > .scen').length`) + ' 個');
    // 快問快答
    await click('[data-act="drill"]'); await ev(`document.querySelector('#drillAns').value='我懂，保養要放在預算內。請問您每個月大概抓多少？換算一天約 20 元，也可以先試用旅行組。'`); await click('[data-act="drill-send"]');
    ok(await ev(`document.querySelector('#sheetBody').innerText.includes('教練示範') && JSON.parse(localStorage.getItem('ssc-state')).drills.length===1`), '快問快答評分並記錄');
    // AI 提示詞
    await click('[data-act="close-sheet"]'); await click('[data-act="ai-prompt"]');
    ok(await ev(`document.querySelector('#aiText').value.includes('【教練】')`), 'AI 自由對練提示詞產生');
    // 自訂情境
    await click('[data-act="close-sheet"]'); await click('[data-act="new-scen"]');
    await ev(`document.querySelector('#cTitle').value='贈品太少';document.querySelector('#cLines').value='這次贈品怎麼變這麼少？\\n我買三年耶\\n那你能幫我做什麼？'`); await click('[data-act="save-scen"]'); await sleep(200);
    const cid = await ev(`state.customScen[0].id`); await ev(`startPlay('${cid}')`); await sleep(300);
    await ev(`document.querySelector('#ans').value='真的很抱歉讓您失望，謝謝您告訴我。想請問您最在意的是哪一樣贈品呢？'`); await click('[data-act="send"]');
    await ev(`document.querySelector('#ans').value='我懂，三年的老顧客最重要。這款精華 1–2 滴就很保濕，平均一天不到 20 元'`); await click('[data-act="send"]');
    await ev(`document.querySelector('#ans').value='我幫您保留一份試用組，下次來直接拿，也加個 LINE 我提醒您好嗎？'`); await click('[data-act="send"]'); await sleep(200);
    ok(await ev(`!!document.querySelector('#result')`), '自訂情境可完整練習，分數 ' + await ev(`play.result.score`));
    // 各分頁
    for (const t of ['knowledge', 'flow', 'progress', 'more']) { await ev(`play=null;location.hash='${t}'`); await sleep(250); ok((await ev(`document.querySelector('#view').innerText.length`)) > 200, '分頁 ' + t + ' 正常顯示'); }
    await ev(`location.hash='knowledge'`); await sleep(200);
    await ev(`(()=>{const i=document.querySelector('#kq');i.value='防曬';i.dispatchEvent(new Event('input'))})()`);
    ok(await ev(`document.querySelectorAll('#plist .prod').length`) === 1, '商品搜尋「防曬」');
    await click('[data-act="prod"]'); ok(await ev(`document.querySelector('#sheetBody').innerText.includes('FAB')`), '商品卡顯示 FAB');
    await click('[data-act="quiz"]');
    for (let i = 0; i < 5; i++) { await click('[data-act="qans"]'); await click('[data-act="qnext"]'); }
    ok(await ev(`document.querySelector('#sheetBody').innerText.includes('測驗結果')`), '知識小測驗 5 題完成');
    // PWA
    await open('#practice'); await sleep(1500);
    const pwa = await ev(`(async()=>{const r=await navigator.serviceWorker.ready;const keys=await caches.keys();const m=await (await fetch('manifest.webmanifest')).json();return {sw:!!r.active,keys,icons:m.icons.length,shortcuts:m.shortcuts.length}})()`);
    ok(pwa.sw && pwa.keys.some(k => k.startsWith('ssc-')), 'Service Worker 啟用並建立快取 ' + JSON.stringify(pwa));
    const inst = await send('Page.getInstallabilityErrors'); ok(!(inst.result.installabilityErrors || []).length, '可安裝性檢查：' + JSON.stringify(inst.result.installabilityErrors));
    const man = await send('Page.getAppManifest'); ok(!(man.result.errors || []).length, 'manifest 無錯誤 ' + JSON.stringify(man.result.errors));
    // 離線
    await send('Network.enable'); await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await send('Page.reload'); await sleep(1200);
    ok(await ev(`document.querySelectorAll('.scen').length`) > 5, '離線重新整理仍可使用');
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    ok(!errors.length, 'Console 無錯誤 ' + errors.join(' | '));
  } else {
    const shot = async (name, url, w, h, prep) => {
      await size(w, h); await open(url); if (prep) { await ev(prep); await sleep(400); }
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(root, 'screenshots', name), Buffer.from(r.result.data, 'base64')); console.log('📸', name);
    };
    await shot('home.png', '?demo=home', 500, 1084);
    await shot('play.png', '?demo=play', 500, 1084, `scrollTo(0, document.body.scrollHeight)`);
    await shot('result.png', '?demo=result', 500, 1084, `document.querySelector('#result').scrollIntoView()`);
    await shot('progress.png', '?demo=progress', 500, 1084);
    await shot('wide.png', '?demo=result', 1280, 800, `scrollTo(0,0)`);
    ok(!errors.length, 'Console 無錯誤 ' + errors.join(' | '));
  }
  ws.close(); edge.kill(); srv.close(); setTimeout(() => process.exit(), 300);
})().catch(e => { console.error('💥', e.message); process.exit(1); });
