// 양식 채우기 시험: test/docfill/의 양식을 가짜 프로필로 채워 test/docfill/out/에 저장
// 사용: node test/headless/docfill-test.mjs <확장폴더> [포트=9361]   (로컬 서버 8765 필요)
import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, port = '9361'] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/cdpprof${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) } : r.result.result.value; };
await send('Page.navigate', { url: 'http://127.0.0.1:8765/test/docfill.html' }); await sleep(1500);
const names = (process.env.FILES || 'resume.docx,resume.pptx,resume.hwpx,resume.hwp').split(',');
fs.mkdirSync(dir + '/test/docfill/out', { recursive: true });
for (const n of names) {
  const r = await ev(`runDoc(${JSON.stringify(n)})`);
  if (r.b64) { fs.writeFileSync(dir + '/test/docfill/out/' + r.name.split('/').pop(), Buffer.from(r.b64, 'base64')); delete r.b64; }
  console.log(n, JSON.stringify(r));
}
ws.close(); chrome.kill(); process.exit(0);
