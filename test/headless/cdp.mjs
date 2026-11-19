import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, url, port='9333'] = process.argv;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/cdpprof${Date.now()}`, '--window-size=1280,2000', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? 'ERR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400) : r.result.result.value; };
await send('Page.navigate', { url }); await sleep(process.env.NOINJECT ? 1500 : 6000);
if (process.env.BLUR) { await send('Target.createTarget', { url: 'about:blank', background: false }); await sleep(800); }
if (!process.env.NOINJECT) for (const f of ['schema.js', 'alias.js', 'qnet.js', 'test/sample.js', 'fill.js']) await ev(fs.readFileSync(dir + '/' + f, 'utf8'));
console.log(await ev(fs.readFileSync(process.argv[5] || '/dev/stdin', 'utf8')));
ws.close(); chrome.kill();
