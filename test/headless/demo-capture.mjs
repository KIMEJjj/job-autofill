import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, url, outdir] = process.argv;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9340', `--user-data-dir=/private/tmp/claude-501/capprof${Date.now()}`, '--window-size=1280,860', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9340/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? 'ERR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300) : r.result.result.value; };
let n = 0; const shot = async (label) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${outdir}/${String(++n).padStart(2, '0')}-${label}.png`, Buffer.from(r.result.data, 'base64')); };
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url }); await sleep(6000);
for (const f of ['schema.js', 'alias.js', 'qnet.js', 'test/sample.js']) await ev(fs.readFileSync(dir + '/' + f, 'utf8'));
let fj = fs.readFileSync(dir + '/fill.js', 'utf8').replace("const sleep = ms => new Promise(r => setTimeout(r, ms));", "const sleep = ms => new Promise(r => setTimeout(r, ms * 3));").split("btn.click(); await sleep(250);").join("btn.scrollIntoView({ block: 'center' }); await sleep(250); btn.click(); await sleep(250);");
await ev(fj);
await ev("window.SAMPLE.militaryType = '현역병'");
// 확장 팝업 모양(실제 popup.html과 같은 글자·배치)을 화면 오른쪽 위에 그림
await ev(`(() => { const d = document.createElement('div'); d.id = 'pfpop'; d.innerHTML = \`
<div style="position:fixed;top:12px;right:16px;width:280px;padding:14px;background:#fff;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.28);font:13px/1.5 -apple-system,'Apple SD Gothic Neo',sans-serif;color:#1d2329;z-index:2147483647">
<div style="font-size:14px;font-weight:700;margin-bottom:10px">지원서 자동입력</div>
<div id="pfbtn" style="padding:9px;border-radius:7px;background:#1f5eff;color:#fff;font-weight:600;text-align:center;margin-bottom:8px;transition:all .2s">이 페이지 채우기</div>
<div style="padding:9px;border-radius:7px;border:1px solid #dde1e6;text-align:center;margin-bottom:8px">✔ 동의 항목 모두 체크</div>
<div style="padding:9px;border-radius:7px;border:1px solid #dde1e6;text-align:center;margin-bottom:8px">칸 알려 주기</div>
<div id="pfout" style="background:#f6f7f9;border-radius:7px;padding:8px 10px;white-space:pre-line">지원서 화면을 연 상태에서 눌러 주세요.</div>
<div style="color:#66707a;font-size:12px;margin-top:8px">초록 테두리: 채운 칸 · 노란 테두리: 직접 확인할 빈 칸</div></div>
<div id="pfcur" style="position:fixed;top:66px;right:120px;width:22px;height:22px;z-index:2147483647;display:none;font-size:22px">👆</div>
<div style="position:fixed;left:16px;bottom:14px;background:rgba(17,20,24,.82);color:#fff;font:600 14px -apple-system,sans-serif;padding:6px 12px;border-radius:14px;z-index:2147483647">시연용 가짜 정보 (홍길동)</div>\`; document.body.appendChild(d); window.scrollTo(0, 0); })()`);
await sleep(300); await shot('empty');
await ev(`(() => { document.getElementById('pfcur').style.display = 'block'; const b = document.getElementById('pfbtn'); b.style.background = '#1546c9'; b.style.transform = 'scale(.97)'; })()`);
await sleep(200); await shot('click');
const frames = []; ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Page.screencastFrame') { frames.push({ t: Date.now(), d: m.params.data }); send('Page.screencastFrameAck', { sessionId: m.params.sessionId }); } });
await send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
const r = await ev(`(async () => { const r = await window.__pubFill(window.SAMPLE, {}); await new Promise(z => setTimeout(z, 700)); const r2 = await window.__pubFill(window.SAMPLE, {}); return { f: r.filled + r2.filled, c: r2.check }; })()`);
await sleep(500); await send('Page.stopScreencast');
frames.forEach((f, i) => fs.writeFileSync(`${outdir}/cast-${String(i).padStart(4, '0')}-${f.t}.jpg`, Buffer.from(f.d, 'base64')));
await ev(`(() => { const b = document.getElementById('pfbtn'); b.style.background = '#1f5eff'; b.style.transform = ''; document.getElementById('pfcur').style.display = 'none'; document.getElementById('pfout').textContent = '채운 칸: ${'${'}0}개'; window.scrollTo(0, 0); document.activeElement && document.activeElement.blur(); })()`);
await ev(`document.getElementById('pfout').textContent = '채운 칸: ' + ${JSON.stringify(0)}`);
console.log(JSON.stringify(r));
await ev(`document.getElementById('pfout').textContent = '채운 칸: ' + (${typeof r === 'object' ? r.f : 0}) + '개\\n제출은 직접 해 주세요.'`);
await sleep(300); await shot('filled');
ws.close(); chrome.kill();
