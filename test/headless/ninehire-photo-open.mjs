// 나인하이어 증명사진 칸 조사: 신뢰 클릭(CDP Input)으로 파일 선택 창이 열리는지 확인합니다.
// 사용: node test/headless/ninehire-photo-open.mjs <확장폴더> <지원서주소> [포트=9371]
import { spawn } from 'child_process';
const [,, dir, url, port = '9371'] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/cdpprof${Date.now()}`, '--window-size=1280,1600', 'about:blank'], { stdio: 'ignore' });
let tabs;
for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; const chooser = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; return; }
  if (m.method === 'Page.fileChooserOpened') chooser.push(m.params);
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: false });
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result.exceptionDetails ? { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) } : r.result.result.value;
};
await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable');
await send('Page.setInterceptFileChooserDialog', { enabled: true });
await send('Page.navigate', { url }); await sleep(6500);

const info = await ev(`(() => {
  const box = [...document.querySelectorAll('[class*="ImageUploadInput__Container"]')]
    .find(el => (el.closest('[class*="ApplicationFormInput__Layout"]') || document.body).innerText.includes('증명사진'));
  if (!box) return { found: false };
  box.scrollIntoView({ block: 'center' });
  const r = box.getBoundingClientRect();
  return { found: true, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height),
    files: document.querySelectorAll('input[type=file]').length };
})()`);
const out = { info, chooser: chooser.length };
if (info && info.found) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: info.x, y: info.y, button: 'left', clickCount: 1 });
    await sleep(120);
  }
  await sleep(1500);
  out.chooserAfter = chooser.length;
  if (chooser.length) {
    const c = chooser[chooser.length - 1];
    out.mode = c.mode;
    const d = await send('DOM.describeNode', { backendNodeId: c.backendNodeId });
    const n = d.result && d.result.node;
    out.node = n ? { nodeName: n.nodeName, attributes: n.attributes } : null;
  }
  out.after = await ev(`({ files: [...document.querySelectorAll('input[type=file]')].map(i => ({ accept: i.accept, id: i.id, name: i.name, cls: String(i.className).slice(0,40) })) })`);
}
console.log(JSON.stringify(out));
ws.close(); chrome.kill(); process.exit(0);
