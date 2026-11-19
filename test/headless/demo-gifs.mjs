// 기능별 시연 GIF 녹화(가짜 정보만 사용): 헤드리스 크롬에서 2배 해상도로 장면을 찍고 test/headless/gifenc.html로 GIF를 만듭니다.
// 사용: node test/headless/demo-gifs.mjs <확장폴더> [만들 번호들, 예: 1,4]   (로컬 서버 8765 필요) → demo/*.gif
import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, only = ''] = process.argv; const port = 9380;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8765';
const VW = 1100, VH = 720;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/cdpprof${Date.now()}`, `--window-size=${VW},${VH}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: false });

// ---------- 녹화 도구 ----------
let frames = [], fdir = '';
async function frame(delay = 100) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const f = `${fdir}/${String(frames.length).padStart(3, '0')}.png`; fs.writeFileSync(f, Buffer.from(s.result.data, 'base64'));
  frames.push({ file: f, delay });
}
const hold = ms => frame(ms);
// 화면 위 자막·커서(장면에만 보이는 안내, 실제 확장 화면에는 없음)
const OVERLAY = `(() => { if (window.__demo) return;
  const st = document.createElement('style'); st.textContent = '#__cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:88%;background:rgba(17,24,39,.88);color:#fff;font:600 17px/1.45 -apple-system,"Apple SD Gothic Neo",sans-serif;padding:10px 18px;border-radius:12px;z-index:2147483646;box-shadow:0 6px 20px rgba(0,0,0,.25);text-align:center;word-break:keep-all}#__cap:empty{display:none}#__cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;transition:transform .5s cubic-bezier(.4,.1,.2,1);pointer-events:none}#__rip{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(31,94,255,.35);z-index:2147483645;pointer-events:none;transform:scale(.2);opacity:0}#__rip.on{animation:__r .45s ease-out}@keyframes __r{from{transform:scale(.2);opacity:1}to{transform:scale(1.4);opacity:0}}';
  document.head.appendChild(st);
  const cap = document.createElement('div'); cap.id = '__cap'; document.body.appendChild(cap);
  const cur = document.createElement('div'); cur.id = '__cur'; cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l16 9-7 2-3 7z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'; document.body.appendChild(cur);
  const rip = document.createElement('div'); rip.id = '__rip'; document.body.appendChild(rip);
  window.__demo = { x: ${VW - 120}, y: ${VH - 140},
    cap(t) { cap.textContent = t; },
    move(x, y) { this.x = x; this.y = y; cur.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; },
    ripple() { rip.style.left = this.x + 'px'; rip.style.top = this.y + 'px'; rip.classList.remove('on'); void rip.offsetWidth; rip.classList.add('on'); } };
  window.__demo.move(window.__demo.x, window.__demo.y);
})()`;
const overlay = () => ev(OVERLAY);
const cap = async (t, ms = 1600) => { await ev(`window.__demo.cap(${JSON.stringify(t)})`); await hold(ms); };
async function center(sel) { return ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 60), r.top + r.height / 2]; })()`); }
async function moveTo(sel) { const [x, y] = await center(sel); await ev(`window.__demo.move(${x}, ${y})`); for (let i = 0; i < 5; i++) { await sleep(100); await frame(100); } }
async function click(sel, action) { await moveTo(sel); await ev('window.__demo.ripple()'); await sleep(120); await frame(120); await ev(action || `document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(250); await frame(150); }
async function scrollTo(y, steps = 10) {
  const y0 = await ev('scrollY');
  for (let i = 1; i <= steps; i++) { const t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await ev(`scrollTo(0, ${Math.round(y0 + (y - y0) * e)})`); await frame(70); }
}
async function scrollToEl(sel, offset = 90) { const y = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.top + scrollY - ${offset}; })()`); if (y == null) { console.log('없음', sel); return; } await scrollTo(Math.max(0, y)); }
async function typeInto(sel, text) { await moveTo(sel); for (let i = 1; i <= text.length; i++) { await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(text)}.slice(0, ${i}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await frame(90); } }
async function go(url) { await send('Page.navigate', { url }); await sleep(1600); await overlay(); }
// 가짜 정보 + 가짜 증명사진(실루엣)
const PROFILE = `(async () => {
  if (!window.SAMPLE) { const s = document.createElement('script'); s.src = '/test/sample.js'; document.head.appendChild(s); await new Promise(z => s.onload = z); }
  const c = document.createElement('canvas'); c.width = 450; c.height = 600; const x = c.getContext('2d');
  x.fillStyle = '#dfe4ea'; x.fillRect(0, 0, 450, 600); x.fillStyle = '#8a95a3'; x.beginPath(); x.arc(225, 230, 95, 0, 7); x.fill(); x.beginPath(); x.ellipse(225, 560, 190, 170, 0, 0, 7); x.fill();
  window.FAKE_PHOTO = c.toDataURL('image/jpeg', 0.9);
  window.P = JSON.parse(JSON.stringify(window.SAMPLE)); P.photo = FAKE_PHOTO; P.nationality = '대한민국';
  P.certificates.push({ name: '정보처리기사', issuer: '한국산업인력공단', date: '2024-06-12' }, { name: '사회조사분석사 2급', issuer: '한국산업인력공단', date: '2023-11-30' });
  return 'ok';
})()`;
async function optionsPage(withPhoto = true) {
  await go(`${BASE}/options.html`);
  await ev(PROFILE);
  await ev(`(() => { ${withPhoto ? '' : 'delete P.photo;'} render(P); document.getElementById('gate').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); document.querySelector('header').style.position = 'static'; HTMLAnchorElement.prototype.click = function () {}; window.print = () => {}; return 1; })()`);
}
const POPUP = n => `(() => { const im = document.createElement('img'); im.id = '__pop'; im.src = '/guide/images/${n}.png'; im.style.cssText = 'position:fixed;right:24px;top:16px;width:300px;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.28);z-index:2147483640'; document.body.appendChild(im); return new Promise(z => im.onload = () => z(1)); })()`;
const dropFile = (path, name) => `(async () => { const dt = new DataTransfer(); dt.items.add(new File([await (await fetch(${JSON.stringify(path)})).arrayBuffer()], ${JSON.stringify(name)})); document.getElementById('docDrop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); await new Promise(z => setTimeout(z, 1500)); return 1; })()`;
// 파일 아이콘이 끌려와 놓이는 장면
async function dragFileAnim(label) {
  const [x, y] = await center('#docDrop');
  await ev(`(() => { const d = document.createElement('div'); d.id = '__file'; d.textContent = '📄 ' + ${JSON.stringify(label)}; d.style.cssText = 'position:fixed;left:${VW - 330}px;top:${VH - 200}px;background:#fff;border:1px solid #c9d1dc;border-radius:8px;padding:8px 12px;font:600 14px -apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:2147483644;transition:all .8s cubic-bezier(.4,.1,.2,1)'; document.body.appendChild(d); window.__demo.move(${VW - 300}, ${VH - 185}); return 1; })()`);
  await frame(300);
  await ev(`(() => { const d = document.getElementById('__file'); d.style.left = '${x - 70}px'; d.style.top = '${y - 18}px'; window.__demo.move(${x - 40}, ${y}); document.getElementById('docDrop').classList.add('over'); return 1; })()`);
  for (let i = 0; i < 8; i++) { await sleep(100); await frame(100); }
  await ev(`(() => { document.getElementById('__file').remove(); document.getElementById('docDrop').classList.remove('over'); window.__demo.ripple(); return 1; })()`);
  await frame(150);
}

// ---------- 장면들 ----------
const DEMOS = {
  1: ['01-웹지원서-채우기', async () => {
    await go(`${BASE}/test/form.html`);
    for (const f of ['schema.js', 'alias.js', 'qnet.js', 'test/sample.js', 'fill.js']) await ev(fs.readFileSync(dir + '/' + f, 'utf8'));
    await ev(PROFILE);
    await cap('공공기관·기업 지원서 페이지를 엽니다', 1800);
    // 확장 팝업(안내서 그림)을 오른쪽 위에 띄움
    await ev(`(() => { const im = document.createElement('img'); im.id = '__pop'; im.src = '/guide/images/06-popup.png'; im.style.cssText = 'position:fixed;right:24px;top:16px;width:300px;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.28);z-index:2147483640'; document.body.appendChild(im); return new Promise(z => im.onload = () => z(1)); })()`);
    await cap('주소창 옆 확장 아이콘 → 잠금 해제 → "이 페이지 채우기"', 1800);
    await click('#__pop', `(() => { document.getElementById('__pop').remove(); return 1; })()`);
    await ev(`(async () => { await window.__pubFill(P, {}); await new Promise(z => setTimeout(z, 700)); await window.__pubFill(P, { keepMarks: true }); return 1; })()`);
    await cap('저장해 둔 내 정보가 칸 이름을 보고 들어갑니다(초록: 채움, 노랑: 직접 확인)', 2200);
    await scrollTo(0, 4); await hold(1200);
    const H = await ev('document.documentElement.scrollHeight');
    const maxY = Math.max(0, H - VH);
    for (const y of [Math.round(maxY / 2), maxY].filter(v => v > 40)) { await scrollTo(y, 14); await hold(1300); }
    await ev(`(() => { const im = document.createElement('img'); im.src = '/guide/images/07-popup-done.png'; im.style.cssText = 'position:fixed;right:24px;top:16px;width:300px;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.28);z-index:2147483640'; document.body.appendChild(im); return new Promise(z => im.onload = () => z(1)); })()`);
    await cap('팝업에 채운 칸 수와 직접 확인할 칸이 나옵니다. 제출은 직접 합니다', 2600);
  }],
  2: ['02-증명사진-등록', async () => {
    await optionsPage(false);
    await scrollToEl('#photoBox', 160);
    await cap('내 정보 설정 화면 → 증명사진 구역', 1600);
    await click('#photoPick', `(async () => { const b = await (await fetch(FAKE_PHOTO)).blob(); const dt = new DataTransfer(); dt.items.add(new File([b], 'photo.jpg', { type: 'image/jpeg' })); const f = document.getElementById('photoFile'); f.files = dt.files; f.dispatchEvent(new Event('change')); await new Promise(z => setTimeout(z, 400)); return 1; })()`);
    await cap('사진을 고르면 가운데를 3:4로 잘라 보여 줍니다', 1800);
    await click('#save', `1`);
    await scrollToEl('#photoBox', 160);
    await cap('저장하면 내 정보와 함께 암호화되어 이 크롬 안에만 저장됩니다', 2400);
  }],
  3: ['03-웹지원서-사진첨부', async () => {
    await go(`${BASE}/test/photo.html`);
    for (const f of ['schema.js', 'alias.js', 'qnet.js', 'test/sample.js', 'fill.js']) await ev(fs.readFileSync(dir + '/' + f, 'utf8'));
    await ev(PROFILE);
    await cap('증명사진 칸과 서류 첨부 칸이 함께 있는 지원서(시험 페이지)', 1800);
    await ev(POPUP('06-popup'));
    await cap('확장 아이콘 → "이 페이지 채우기"', 1400);
    await click('#__pop', `(() => { document.getElementById('__pop').remove(); return 1; })()`);
    await ev(`(async () => { await window.__pubFill(P, {}); await new Promise(z => setTimeout(z, 400)); return 1; })()`);
    await frame(300);
    await cap('"이 페이지 채우기"를 누르면 사진 칸에만 증명사진(photo.jpg)이 올라갑니다', 2400);
    await cap('자격증 사본·증명서·포트폴리오 같은 서류 칸은 그대로 둡니다', 2400);
  }],
  4: ['04-양식파일-채우기', async () => {
    await optionsPage();
    await scrollToEl('#docSec', 20);
    await cap('회사가 준 이력서 양식(.hwp·.hwpx·.docx·.pptx)을 끌어다 놓습니다', 1600);
    await dragFileAnim('테스트공사_입사지원서.docx');
    await ev(dropFile('/test/docfill/resume_photo.docx', '테스트공사_입사지원서.docx'));
    await frame(400);
    await cap('표의 칸 이름을 보고 채운 결과를 먼저 미리 보여 줍니다(초록: 새로 채운 칸)', 2000);
    await scrollToEl('.doc-card', 20);
    await hold(1200);
    await scrollToEl('.doc-card .pv-wrap', -200);
    const y = await ev('scrollY'); await scrollTo(y + 420, 12); await hold(1400);
    await scrollToEl('.doc-card', 20);
    await click('.doc-card .head button');
    await cap('내려받기를 누르면 원본은 그대로 두고 "_채움" 파일이 저장됩니다', 2400);
  }],
  5: ['05-양식칸-알려주기', async () => {
    await optionsPage();
    await ev(dropFile('/test/docfill/resume_teach.docx', '테스트공사_입사지원서.docx'));
    await scrollToEl('.doc-card', 20);
    await cap('알아보지 못한 칸은 노란 점선으로 표시됩니다', 2000);
    await click('.pv > div.u');
    await cap('눌러서 이 칸에 넣을 내 정보 항목을 고릅니다', 1400);
    await ev(`(() => { const s = document.querySelector('.pv > div.u select'); s.size = 8; s.style.height = 'auto'; return 1; })()`);
    await frame(900);
    await ev(`(() => { const s = document.querySelector('.pv > div.u select'); s.value = 'nationality'; return 1; })()`);
    await frame(700);
    await ev(`(async () => { const s = document.querySelector('.pv > div.u select'); s.dispatchEvent(new Event('change')); await new Promise(z => setTimeout(z, 1200)); return 1; })()`);
    await scrollToEl('.doc-card', 20);
    await cap('바로 다시 채워지고, 다음부터는 다른 양식에서도 같은 칸 이름이면 자동입니다', 2600);
  }],
  6: ['06-이력서-내보내기', async () => {
    await optionsPage();
    await scrollToEl('#cvSec', 20);
    await cap('회사 양식이 없으면 내 정보로 이력서를 만듭니다', 1600);
    await click('#cvPdf');
    await cap('넣을 구역과 자격증을 체크로 고릅니다', 1400);
    await click('#cvList .cv-items label:nth-child(4) input');
    await click('#cvList .cv-items label:nth-child(3) input');
    await hold(900);
    await click('#cvGoPdf');
    // 인쇄 창 대신 만들어질 이력서 화면을 보여 줌
    const sel = `{ off: new Set(), offItems: new Set([...document.querySelectorAll('#cvList .cv-items input')].filter(i => !i.checked).map(i => 'certificates:' + i.parentElement.textContent)) }`;
    const html = await ev(`PubResume.toHtml(collect(), ${sel})`);
    fs.writeFileSync(dir + '/test/docfill/out/demo_cv.html', html);
    await go(`${BASE}/test/docfill/out/demo_cv.html`);
    await ev(`document.body.style.cssText += ';max-width:820px;margin:24px auto;background:#fff'; document.documentElement.style.background = '#e9edf2'`);
    await cap('인쇄 창에서 "PDF로 저장"을 고르면 이런 이력서가 PDF로 저장됩니다', 2000);
    await scrollTo(520, 14); await hold(1400);
    await scrollTo(0, 8);
    const en = await (async () => { await go(`${BASE}/options.html`); await ev(PROFILE); await ev(`render(P)`); return ev(`(() => { const p = collect(); p.schoolEn = ''; return PubResume.toHtml(p, { lang: 'en' }); })()`); })();
    fs.writeFileSync(dir + '/test/docfill/out/demo_cv_en.html', en);
    await go(`${BASE}/test/docfill/out/demo_cv_en.html`);
    await ev(`document.body.style.cssText += ';max-width:820px;margin:24px auto;background:#fff'; document.documentElement.style.background = '#e9edf2'`);
    await cap('언어를 "영문 이력서"로 바꾸면 영어 이력서(Word·PDF)도 만듭니다', 2600);
  }],
  7: ['07-지원-기록', async () => {
    await optionsPage();
    await ev(dropFile('/test/docfill/resume_photo.docx', '테스트공사_입사지원서.docx'));
    await scrollToEl('.doc-card', 20);
    await click('.doc-card .head button');
    await cap('양식을 내려받거나 이력서를 내보내면 지원 기록에 한 줄이 자동으로 생깁니다', 1600);
    await scrollToEl('#applySec', 120);
    await hold(1200);
    await typeInto('#applyRows .grid input:nth-child(3)', '사무행정');
    await moveTo('#applyRows .grid select');
    await ev(`(() => { const s = document.querySelector('#applyRows .grid select'); s.value = '서류 합격'; s.dispatchEvent(new Event('change')); return 1; })()`);
    await frame(600);
    await typeInto('#applyRows .grid input:nth-child(6)', '면접 11/25 오후 2시');
    await cap('진행 상태·메모를 적고 저장하면 내 정보와 함께 암호화 저장됩니다', 2600);
  }],
};

// 화면 좌표로 커서 이동·누르기
async function moveXY(x, y) { await ev(`window.__demo.move(${x}, ${y})`); for (let i = 0; i < 5; i++) { await sleep(100); await frame(100); } }
async function tapXY(x, y, action) { await moveXY(x, y); await ev('window.__demo.ripple()'); await sleep(120); await frame(120); if (action) await ev(action); await sleep(250); await frame(150); }
// 지금 팝업 그림(13-popup-now)을 오른쪽 위에 띄우기. 버튼 위치: 칸 알려 주기 y≈114, 칸 목록 복사 y≈224
const POPNOW = `(() => { const im = document.createElement('img'); im.id = '__pop'; im.src = '/guide/images/13-popup-now.png'; im.style.cssText = 'position:fixed;right:24px;top:16px;width:300px;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.28);z-index:2147483640;background:#fff'; document.body.appendChild(im); return new Promise(z => im.onload = () => z(1)); })()`;
const POP_X = VW - 24 - 150;
async function teachPage() {
  await go(`${BASE}/test/teach-demo.html`);
  // 녹화용: 닫힌 선택 창을 열어 볼 수 있게(확장 코드는 그대로), 연결 저장은 흉내
  await ev(`(() => { const o = Element.prototype.attachShadow; Element.prototype.attachShadow = function (x) { return o.call(this, { ...x, mode: 'open' }); }; window.chrome = { runtime: { sendMessage: async m => { window.__saved = m; return { ok: true }; } } }; return 1; })()`);
  for (const f of ['schema.js', 'alias.js', 'qnet.js', 'test/sample.js', 'fill.js']) await ev(fs.readFileSync(dir + '/' + f, 'utf8'));
  await ev(PROFILE);
}
DEMOS[8] = ['08-칸-알려주기(웹)', async () => {
  await teachPage();
  await ev(`(async () => { await __pubFill(P, {}); await new Promise(z => setTimeout(z, 500)); await __pubFill(P, { keepMarks: true }); return 1; })()`);
  await cap('채우기를 했는데 "출신 국가" 칸은 알아보지 못해 노란 테두리', 2000);
  await ev(POPNOW);
  await cap('팝업에서 "칸 알려 주기"', 1200);
  await tapXY(POP_X, 114, `(() => { document.getElementById('__pop').remove(); __pubTeachStart({}); return 1; })()`);
  await cap('고를 수 있는 칸에 파란 점선 → 노란 칸을 누릅니다', 1600);
  await click('#a5');
  await sleep(300); await frame(500);
  // 선택 창에서 '국적' 고르기 → 저장 → 끝내기
  const root = `[...document.querySelectorAll('div')].map(d => d.shadowRoot).find(r => r && r.querySelector('select'))`;
  const rectOf = async q => ev(`(() => { const r = ${root}; const e = r.querySelector(${JSON.stringify(q)}); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  await cap('넣을 내 정보 항목을 고릅니다(예: 국적)', 800);
  let [sx, sy] = await rectOf('select');
  await tapXY(sx, sy, `(() => { const r = ${root}; const s = r.querySelector('select'); s.value = 'nationality'; s.dispatchEvent(new Event('change')); return 1; })()`);
  await frame(700);
  const btns = await ev(`(() => { const r = ${root}; return [...r.querySelectorAll('button')].map(b => { const x = b.getBoundingClientRect(); return [b.textContent, x.left + x.width / 2, x.top + x.height / 2]; }); })()`);
  const save = btns.find(b => b[0] === '저장');
  await tapXY(save[1], save[2], `(() => { const r = ${root}; [...r.querySelectorAll('button')].find(b => b.textContent === '저장').click(); return 1; })()`);
  await sleep(400); await frame(600);
  const done = await ev(`(() => { const r = ${root}; if (!r) return null; const b = [...r.querySelectorAll('button')].find(b => b.textContent === '끝내기'); if (!b) return null; const x = b.getBoundingClientRect(); return [x.left + x.width / 2, x.top + x.height / 2]; })()`);
  if (done) await tapXY(done[0], done[1], `(() => { const r = ${root}; [...r.querySelectorAll('button')].find(b => b.textContent === '끝내기').click(); return 1; })()`);
  await cap('저장되는 것은 "이 사이트의 이 칸 = 국적" 연결뿐, 값은 저장하지 않습니다', 2000);
  // 다음 채우기: 알려 준 연결로 자동
  await ev(`(async () => { document.querySelectorAll('input').forEach(i => { i.value = ''; }); const m = { [location.host]: { [window.__saved.fingerprint]: window.__saved.item } }; await __pubFill(P, { fieldMappings: m }); return 1; })()`);
  await frame(400);
  await cap('다음부터는 같은 칸이 자동으로 채워집니다', 2400);
}];
DEMOS[9] = ['09-새사이트-고치는-과정', async () => {
  await teachPage();
  await ev(`(async () => { await __pubFill(P, {}); return 1; })()`);
  await cap('새 사이트에서 알아보지 못한 칸(노란 테두리)을 발견', 1800);
  await ev(POPNOW);
  await tapXY(POP_X, 224, `(() => { document.getElementById('__pop').remove();
    const rows = __pubScan().slice(0, 8);
    const box = document.createElement('div'); box.id = '__scan';
    box.style.cssText = 'position:fixed;right:24px;top:16px;width:520px;background:#111418;color:#d7dde5;border-radius:12px;padding:16px 18px;font:13px/1.6 Menlo,monospace;z-index:2147483640;box-shadow:0 12px 32px rgba(0,0,0,.3);white-space:pre';
    box.textContent = '페이지: ' + location.host + ' · 확장 0.5.84\\n인식\\t종류\\t이름\\t칸 설명\\n' + rows.map(r => [r.인식, r.종류, r.name || '', (r.칸설명 || '').slice(0, 14)].join('\\t')).join('\\n');
    document.body.appendChild(box); return 1; })()`);
  await cap('"칸 목록 복사": 칸 이름·구조만 복사하고 입력값은 빠집니다', 2600);
  // 터미널 화면(실제 회귀 시험 결과 재생)
  const reg = 'form 54/0,recruiter 6/0,choices 6/0,toggles 4/1,questions 5/1,mui 3/0,mui2 2/0,period 8/0,kei 9/0,edu 8/0,emailcheck 6/0,trinity 9/1,kli-address 2/0,cj 24/0,ninehire 12/0'.split(',');
  fs.writeFileSync(dir + '/test/docfill/out/term.html', `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#0f1216;color:#c9d1d9;font:17px/1.65 Menlo,monospace;padding:34px 44px}b{color:#7ee787}.d{color:#8b949e}.y{color:#e3b341}</style><body><div id="t"></div><script>window.L=${JSON.stringify([
    '<span class="d">$</span> 칸 목록으로 시험 페이지 재현 <span class="d">(가짜 정보)</span>', '  test/teach-demo.html  <span class="y">출신 국가 → 알아보지 못함</span>',
    '<span class="d">$</span> 엔진 수정 후 회귀 시험 15종', ...reg.map(r => '  ' + r.split(' ')[0].padEnd(14) + ' <b>' + r.split(' ')[1] + '  통과</b>'), '', '<b>15/15 통과</b>  → 버전 올리고 확장 새로고침'])};<\/script>`);
  await go(`${BASE}/test/docfill/out/term.html`);
  for (let i = 1; i <= 21; i++) { await ev(`document.getElementById('t').innerHTML = L.slice(0, ${i}).join('<br>')`); await frame(i < 3 ? 600 : 160); }
  await cap('가짜 정보 시험 페이지로 재현해 고치고, 기존 사이트 15종이 그대로인지 확인', 2600);
  await teachPage();
  await ev(`(async () => { const m = { [location.host]: {} }; await __pubFill(P, {}); return 1; })()`);
  await ev(`(async () => { const el = document.getElementById('a5'); el.value = '대한민국'; el.dispatchEvent(new Event('input', { bubbles: true })); el.style.outline = '2px solid #22a35a'; el.style.outlineOffset = '1px'; return 1; })()`);
  await frame(400);
  await cap('새 버전에서는 같은 칸도 초록으로 채워집니다', 2400);
}];

// ---------- 실행 ----------
const enc = (await send('Target.createTarget', { url: `${BASE}/test/headless/gifenc.html` })).result.targetId;
const want = only ? only.split(',').map(Number) : Object.keys(DEMOS).map(Number);
fs.mkdirSync(dir + '/demo', { recursive: true });
for (const n of want) {
  const [name, run] = DEMOS[n];
  fdir = `${dir}/test/demo-frames/${name}`; fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true }); frames = [];
  await run();
  // 인코더 탭에서 GIF 만들기(장면 파일은 로컬 서버로 읽음)
  const encWs = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.id === enc).webSocketDebuggerUrl);
  await new Promise(r => encWs.onopen = r);
  const out = await new Promise(res => { encWs.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) res(m); }; encWs.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `makeGif(${JSON.stringify(frames.map(f => ({ src: f.file.replace(dir, ''), delay: f.delay })))}, ${VW})`, awaitPromise: true, returnByValue: true } })); });
  encWs.close();
  if (out.result.exceptionDetails) { console.log(name, 'ERR', JSON.stringify(out.result.exceptionDetails).slice(0, 300)); continue; }
  const gif = Buffer.from(out.result.result.value, 'base64');
  fs.writeFileSync(`${dir}/demo/${name}.gif`, gif);
  console.log(name, frames.length + '장', (gif.length / 1024 / 1024).toFixed(2) + 'MB', Math.round(frames.reduce((a, f) => a + f.delay, 0) / 1000) + '초');
}
ws.close(); chrome.kill(); process.exit(0);
