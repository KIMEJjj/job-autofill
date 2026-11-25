// 이력서 내보내기 시험: 설정 화면에서 가짜 프로필로 Word를 만들고, 인쇄 화면을 PDF로 저장 → test/docfill/out/
// 사용: node test/headless/resume-test.mjs <확장폴더> [포트=9365]   (로컬 서버 8765 필요)
import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, port = '9365'] = process.argv; const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/cdpprof${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) } : r.result.result.value; };
await send('Page.navigate', { url: 'http://127.0.0.1:8765/options.html' }); await sleep(1500);
const out = dir + '/test/docfill/out'; fs.mkdirSync(out, { recursive: true });
const r = await ev(`(async () => {
  const s = document.createElement('script'); s.src = '/test/sample.js'; document.head.appendChild(s); await new Promise(z => s.onload = z);
  // 자격증이 많은 경우: 가짜 자격증 4개 추가
  const P = JSON.parse(JSON.stringify(window.SAMPLE));
  P.certificates.push({ name: '시험자격A 2급', issuer: '시험기관', date: '2022-01-01' }, { name: '시험자격B', issuer: '시험기관', date: '2022-02-02' }, { name: '시험자격C 1급', issuer: '시험기관', date: '2022-03-03' }, { name: '시험자격D', issuer: '시험기관', date: '2022-04-04' });
  { const c = document.createElement('canvas'); c.width = 450; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#9aa3ad'; x.fillRect(0, 0, 450, 600); x.fillStyle = '#fff'; x.font = 'bold 90px sans-serif'; x.fillText('사진', 130, 330); P.photo = c.toDataURL('image/jpeg', 0.9); }
  render(P);
  let blob, name; const orig = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return orig(b); };
  HTMLAnchorElement.prototype.click = function () { name = this.download; };
  document.getElementById('cvDocx').click(); await new Promise(z => setTimeout(z, 300));
  // 고르기: 시험자격B 해제, 컴퓨터 활용능력 구역 해제
  const labs = [...document.querySelectorAll('#cvList label')];
  labs.find(l => l.textContent.startsWith('시험자격B')).querySelector('input').click();
  labs.find(l => l.textContent.startsWith('컴퓨터 활용능력')).querySelector('input').click();
  window.__pick = [...document.querySelectorAll('#cvList .cv-sec > label')].map(l => (l.querySelector('input').checked ? '[v] ' : '[ ] ') + l.textContent);
  document.getElementById('cvGoDocx').click(); await new Promise(z => setTimeout(z, 1500));
  const u8 = new Uint8Array(await blob.arrayBuffer()); let b = ''; for (let i = 0; i < u8.length; i += 0x8000) b += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  const sel = { off: new Set(['skills']), offItems: new Set(['certificates:시험자격B · 2022.02.02']) };
  const en = await PubResume.toDocx(collect(), { lang: 'en' }); const u8e = new Uint8Array(await en.blob.arrayBuffer()); let be = ''; for (let i = 0; i < u8e.length; i += 0x8000) be += String.fromCharCode(...u8e.subarray(i, i + 0x8000));
  window.__en = { name: en.name, b64: btoa(be), html: PubResume.toHtml(collect(), { lang: 'en' }) };
  const tw = m => (m.personal.find(x => x[0] === 'Twitter / X') || [])[1] || '';
  return { en: window.__en, name, b64: btoa(b), html: PubResume.toHtml(collect(), sel), status: document.getElementById('cvStatus').textContent, pick: window.__pick, twitter: tw(PubResume.model(P, {})), twitterEn: tw(PubResume.model(P, { lang: 'en' })) };
})()`);
if (r.error) { console.log(r.error); process.exit(1); }
fs.writeFileSync(out + '/cv.docx', Buffer.from(r.b64, 'base64')); fs.writeFileSync(out + '/cv.html', r.html);
fs.writeFileSync(out + '/cv_en.docx', Buffer.from(r.en.b64, 'base64')); fs.writeFileSync(out + '/cv_en.html', r.en.html);
for (const f of ['cv', 'cv_en']) {
  await send('Page.navigate', { url: `http://127.0.0.1:8765/test/docfill/out/${f}.html` }); await sleep(1200);
  const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(`${out}/${f}.pdf`, Buffer.from(pdf.result.data, 'base64'));
}
console.log(JSON.stringify({ name: r.name, enName: r.en.name, status: r.status, pick: r.pick, twitter: r.twitter, twitterEn: r.twitterEn }));
if (process.env.SHOT) { await send('Page.navigate', { url: 'http://127.0.0.1:8765/options.html' }); }
ws.close(); chrome.kill(); process.exit(0);
