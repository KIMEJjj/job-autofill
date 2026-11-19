// GIF 검사: 크롬 ImageDecoder로 모든 장면을 풀어 보고, 지정한 장면들을 PNG로 저장
// 사용: node test/headless/gifcheck.mjs <gif 경로(서버 기준, 예: /demo/a.gif)> <출력 폴더> [장면 번호들]
import fs from 'fs'; import { spawn } from 'child_process';
const [,, gif, out, pick = ''] = process.argv; const port = 9381; const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/cdpprof${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/test/headless/gifenc.html' }); await sleep(800);
const r = await send('Runtime.evaluate', { expression: `(async () => {
  const buf = await (await fetch(${JSON.stringify(encodeURI(gif))})).arrayBuffer();
  const dec = new ImageDecoder({ data: buf, type: 'image/gif' }); await dec.tracks.ready;
  const n = dec.tracks.selectedTrack.frameCount, pick = ${JSON.stringify(pick)}.split(',').filter(Boolean).map(Number), shots = {};
  for (let i = 0; i < n; i++) { const { image } = await dec.decode({ frameIndex: i }); if (pick.includes(i) || (!pick.length && i === n - 1)) { const c = new OffscreenCanvas(image.displayWidth, image.displayHeight); c.getContext('2d').drawImage(image, 0, 0); const b = await c.convertToBlob(); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode(...u.subarray(k, k + 0x8000)); shots[i] = btoa(s); } image.close(); }
  return { n, w: dec.tracks.selectedTrack ? 0 : 0, shots };
})()`, awaitPromise: true, returnByValue: true });
if (r.result.exceptionDetails) { console.log('ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 300)); process.exit(1); }
const v = r.result.result.value; fs.mkdirSync(out, { recursive: true });
for (const [i, b] of Object.entries(v.shots)) fs.writeFileSync(`${out}/frame-${i}.png`, Buffer.from(b, 'base64'));
console.log('장면', v.n, '저장', Object.keys(v.shots).join(','));
ws.close(); chrome.kill(); process.exit(0);
