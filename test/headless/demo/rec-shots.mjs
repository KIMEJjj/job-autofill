// 사용: node rec-shots.mjs <확장폴더> <URL> <출력폴더> <시나리오 js 파일>
// rec.mjs와 같은 준비를 하되, 화면이 바뀔 때만 오는 screencast 대신 일정 간격 스크린샷을 찍어
// 움직임이 적은 화면(주소 입력 등)도 부드러운 GIF로 만들 수 있게 합니다.
import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, url, outdir, scen] = process.argv;
const profile = '/private/var/folders/sp/c3z8grwn50g6vtdmksvvlp_80000gn/T/pubfill-rec' + Date.now();
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9342', `--user-data-dir=${profile}`, '--window-size=1280,860', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9342/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? 'ERR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400) : r.result.result.value; };
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url }); await sleep(6000);
for (const f of ['schema.js', 'alias.js', 'qnet.js', 'test/sample.js']) await ev(fs.readFileSync(dir + '/' + f, 'utf8'));
await ev(fs.readFileSync(dir + '/fill.js', 'utf8'));
await ev(`(() => { const d = document.createElement('div'); d.innerHTML = \`
<div style="position:fixed;top:12px;right:16px;width:260px;padding:13px;background:#fff;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.28);font:13px/1.5 -apple-system,'Apple SD Gothic Neo',sans-serif;color:#1d2329;z-index:2147483647">
<div style="font-size:14px;font-weight:700;margin-bottom:9px">지원서 자동입력</div>
<div id="pfbtn" style="padding:9px;border-radius:7px;background:#1f5eff;color:#fff;font-weight:600;text-align:center;margin-bottom:7px;transition:all .15s">이 페이지 채우기</div>
<div id="pfout" style="background:#f6f7f9;border-radius:7px;padding:7px 10px;white-space:pre-line">지원서 화면에서 눌러 주세요.</div></div>
<div id="pfcap" style="position:fixed;left:50%;transform:translateX(-50%);bottom:22px;background:rgba(17,20,24,.88);color:#fff;font:700 20px -apple-system,'Apple SD Gothic Neo',sans-serif;padding:12px 22px;border-radius:12px;z-index:2147483647;white-space:nowrap"></div>
<div style="position:fixed;left:14px;top:14px;background:rgba(17,20,24,.75);color:#fff;font:600 13px -apple-system,sans-serif;padding:5px 11px;border-radius:12px;z-index:2147483647">시연용 가짜 정보</div>\`; document.body.appendChild(d);
window.__cap = t => document.getElementById('pfcap').textContent = t;
window.__press = async () => { const b = document.getElementById('pfbtn'); b.style.background = '#1546c9'; b.style.transform = 'scale(.96)'; await new Promise(r => setTimeout(r, 350)); b.style.background = '#1f5eff'; b.style.transform = ''; };
window.__greens = new Set();
window.__keep = () => { document.querySelectorAll('[data-pubfill]').forEach(e => { if (/34, 163, 90|22a35a/.test(e.style.outline)) window.__greens.add(e); else e.style.outline = ''; }); window.__greens.forEach(e => { e.style.outline = '3px solid #22a35a'; e.style.outlineOffset = '1px'; }); };
window.__go = (sel, block = 'center') => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; if (e) e.scrollIntoView({ block, behavior: 'smooth' }); };
window.scrollTo(0, 0); })()`);
fs.mkdirSync(outdir, { recursive: true });
let done = false; let n = 0; const started = Date.now();
const scenario = ev(fs.readFileSync(scen, 'utf8')).then(v => { done = true; return v; });
const capture = (async () => {
  while (!done) {
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    if (shot && shot.result && shot.result.data) {
      fs.writeFileSync(`${outdir}/f-${String(n++).padStart(4, '0')}-${Date.now() - started}.jpg`, Buffer.from(shot.result.data, 'base64'));
    }
    await sleep(60);
  }
})();
const result = await scenario; await capture;
console.log(result); console.log('frames', n, 'ms', Date.now() - started);
ws.close(); chrome.kill();
