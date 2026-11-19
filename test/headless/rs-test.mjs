// React 선택 목록(Greenhouse) 시험: fill.js로 칸 표시 → background.js의 reactSelectFill을 CDP로 흉내 낸 chrome.debugger 위에서 실행
// 사용: node test/headless/rs-test.mjs <확장폴더> <지원서 주소>
import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, url] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms)); const port = 9363;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/cdpprof-rs${Date.now()}`, '--window-size=1280,2000', 'about:blank'], { stdio: 'ignore' });
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pend[i] = m => m.error ? j(new Error(m.error.message)) : r(m.result); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
await send('Page.navigate', { url }); await sleep(7000);
for (const f of ['schema.js', 'alias.js', 'qnet.js', 'test/sample.js', 'fill.js']) await ev(fs.readFileSync(dir + '/' + f, 'utf8'));
await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
const r = await ev(`window.__pubFill(Object.assign({}, window.SAMPLE, { nationality: '대한민국' }), {}).then(r => r)`);
console.log('fill', r.filled, 'rsTargets', JSON.stringify(r.rsTargets));
if (process.env.OPTS) for (const t of (process.env.ONLY ? r.rsTargets.filter(x => x.field === process.env.ONLY) : r.rsTargets)) {
  await ev(`document.querySelector('[data-pubfill-rs="${t.key}"]').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await sleep(600); console.log(t.key, t.field, await ev(`JSON.stringify([...document.querySelectorAll('[id*="-option-"]')].map(o => o.textContent.trim().slice(0, 50)).slice(0, 8))`));
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(200);
}
globalThis.chrome = { debugger: { attach: async () => {}, detach: async () => {}, sendCommand: (t, m, p) => send(m, p) } };
const bg = fs.readFileSync(dir + '/background.js', 'utf8');
const fn = new Function(bg.slice(bg.indexOf('async function reactSelectFill')) + '\nreturn reactSelectFill;')();
globalThis.__rsDebug = !!process.env.RSDEBUG;
const only = process.env.ONLY ? r.rsTargets.filter(t => t.field === process.env.ONLY) : r.rsTargets;
console.log('rs', JSON.stringify(await fn(1, only)));
console.log('after', await ev(`JSON.stringify([...document.querySelectorAll('[class*="select__control"]')].map(c => (c.querySelector('input')||{}).id + '=' + c.textContent.trim().slice(0, 40)))`));
ws.close(); chrome.kill();
