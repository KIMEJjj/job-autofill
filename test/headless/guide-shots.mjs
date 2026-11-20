// 안내서 그림(새 기능): 설정 화면에 가짜 정보를 넣고 구역별로 찍어 guide/images/에 저장
// 사용: node test/headless/guide-shots.mjs <확장폴더> [포트=9373]   (로컬 서버 8765 필요)
import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, port = '9373'] = process.argv; const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/cdpprof${Date.now()}`, '--window-size=1000,1400', '--force-device-scale-factor=2', 'about:blank'], { stdio: 'ignore' });
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) } : r.result.result.value; };
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1400, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/options.html' }); await sleep(1500);
const prep = await ev(`(async () => {
  const s = document.createElement('script'); s.src = '/test/sample.js'; document.head.appendChild(s); await new Promise(z => s.onload = z);
  // 가짜 증명사진(회색 바탕 실루엣)
  const c = document.createElement('canvas'); c.width = 450; c.height = 600; const x = c.getContext('2d');
  x.fillStyle = '#dfe4ea'; x.fillRect(0, 0, 450, 600); x.fillStyle = '#9aa3ad'; x.beginPath(); x.arc(225, 230, 95, 0, 7); x.fill(); x.beginPath(); x.ellipse(225, 560, 190, 170, 0, 0, 7); x.fill();
  const P = JSON.parse(JSON.stringify(window.SAMPLE)); P.photo = c.toDataURL('image/jpeg', 0.9);
  P.certificates.push({ name: '정보처리기사', issuer: '한국산업인력공단', date: '2024-06-12' }, { name: '사회조사분석사 2급', issuer: '한국산업인력공단', date: '2023-11-30' });
  render(P); document.getElementById('gate').classList.add('hidden'); document.getElementById('app').classList.remove('hidden');
  HTMLAnchorElement.prototype.click = function () {};
  const dt = new DataTransfer(); dt.items.add(new File([await (await fetch('/test/docfill/resume_photo.docx')).arrayBuffer()], '테스트공사_입사지원서.docx'));
  document.getElementById('docDrop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await new Promise(z => setTimeout(z, 1500));
  document.getElementById('cvDocx').click();
  return 'ok';
})()`);
if (prep !== 'ok') { console.log(prep); process.exit(1); }
const shot = async (sel, file, maxH = 1300) => {
  const rect = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: rect.x - 8, y: rect.y - 8, width: rect.w + 16, height: Math.min(rect.h + 16, maxH), scale: 1 } });
  fs.writeFileSync(`${dir}/guide/images/${file}`, Buffer.from(s.result.data, 'base64')); console.log(file, Math.round(rect.w), Math.round(rect.h));
};
await ev(`document.querySelector('header').style.position = 'static'`);
await shot('#docSec', '09-docfill.png', 1500);
await shot('#cvSec', '10-resume-pick.png');
await shot('#photoBox', '11-photo-box.png');
// 증명사진 구역 전체
await ev(`(() => { const b = document.getElementById('photoBox'); b.closest('section').id = 'photoSec'; return 1; })()`);
await shot('#photoSec', '11-photo.png');
fs.unlinkSync(`${dir}/guide/images/11-photo-box.png`);
ws.close(); chrome.kill(); process.exit(0);
