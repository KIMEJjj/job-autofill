// 팝업·설정 화면 열림 검사: chrome-stub.js를 페이지 스크립트보다 먼저 넣고
// popup.html·options.html을 열어 콘솔 오류 0, 팝업 버튼 6개를 확인합니다.
// 사용: node test/headless/ui-check.mjs <확장폴더> [포트=9366]   (로컬 서버 8765 필요)
import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, port = '9366'] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/cdpprof${Date.now()}`, '--window-size=1280,1200', 'about:blank'],
  { stdio: 'ignore' });
let tabs;
for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
if (!tabs) { console.log(JSON.stringify({ ok: false, error: 'chrome-not-ready' })); process.exit(1); }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = {};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails || {};
    errs.push({ page: current, kind: 'exception', text: (d.exception && d.exception.description) || d.text || 'exception' });
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errs.push({ page: current, kind: 'console', text: m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300) });
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    const url = m.params.entry.url || '';
    if (!/\/favicon\.ico$/.test(url)) errs.push({ page: current, kind: 'log', url, text: (m.params.entry.text || '').slice(0, 300) });
  }
};
const errs = [];
let current = '';
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result.exceptionDetails ? { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) } : r.result.result.value;
};
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(dir + '/test/chrome-stub.js', 'utf8') });

const result = { ok: false, popup: null, options: null, errors: errs };
try {
  current = 'popup';
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/popup.html' });
  await sleep(1800);
  const popup = await ev(`({
    buttons: document.querySelectorAll('button').length,
    hasFill: !!document.getElementById('fill'),
    hasTeach: !!document.getElementById('teach'),
    hasOpts: !!document.getElementById('opts'),
    out: (document.getElementById('out') || {}).textContent || ''
  })`);
  result.popup = popup;
  if (!popup || popup.error) throw new Error('popup evaluate: ' + JSON.stringify(popup));

  current = 'options';
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/options.html' });
  await sleep(3200);
  const options = await ev(`({
    title: document.title,
    sections: document.querySelectorAll('section').length,
    hasForm: !!document.getElementById('form'),
    status: (document.getElementById('status') || {}).textContent || ''
  })`);
  result.options = options;
  if (!options || options.error) throw new Error('options evaluate: ' + JSON.stringify(options));

  const popupOk = popup.buttons === 6 && popup.hasFill && popup.hasTeach && popup.hasOpts;
  const optionsOk = /내 정보 설정/.test(options.title || '') && options.hasForm && options.sections > 0;
  result.ok = popupOk && optionsOk && errs.length === 0;
  if (!popupOk) result.reason = 'popup buttons/fields mismatch';
  else if (!optionsOk) result.reason = 'options did not render';
  else if (errs.length) result.reason = 'console errors: ' + errs.map(e => `${e.page}/${e.kind}: ${e.text}`).join(' | ');
} catch (e) {
  result.ok = false; result.reason = String(e && e.message || e);
}
console.log(JSON.stringify(result));
ws.close(); chrome.kill();
process.exit(result.ok ? 0 : 1);
