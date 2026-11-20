// 실제 확장 검사: 진짜 크롬(헤드리스)에 확장을 올리고 가짜 정보(test/sample.js)로
//  ① 설정 화면: 잠금 암호 정하기 → 증명사진 저장 → 잠갔다 다시 열어도 남는지
//  ② 팝업: '칸 알려 주기'가 시작되는지(파란 표시), '이 페이지 채우기'가 채우는지(지원 기록은 2026-11-20에 기능을 빼서 남기지 않아야 함)
// 사용: node test/headless/real-ext.mjs <확장폴더> [실제 Greenhouse 지원서 주소...]   (로컬 서버 8765 필요)
//  ③ 주소를 주면: 실제 공개 지원서에서 팝업 채우기 → 선택 목록(chrome.debugger 경로)이 골라졌는지. 제출은 누르지 않습니다.
// 확장은 고치지 않은 그대로 올리고(배포 제외 파일만 뺀 복사본), 팝업은 CDP Extensions.triggerAction으로
// 실제 툴바 버튼을 눌러 엽니다(activeTab 권한도 실제와 같게 생김).
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn, execFileSync } from 'child_process';
const [,, dir, ...ghUrls] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'realext-'));
const ext = path.join(tmp, 'ext');
const SKIP = new Set(['test', 'native', 'dist', 'guide', 'demo', '발표자료', '.git', '.github', 'node_modules']);
fs.cpSync(dir, ext, { recursive: true, filter: src => { const rel = path.relative(dir, src); return !rel || !SKIP.has(rel.split(path.sep)[0]) && !/\.(md|sh)$/.test(rel); } });
// 사진: 안내서 그림 하나를 JPEG로(가짜 그림)
const jpg = path.join(tmp, 'photo.jpg');
execFileSync('sips', ['-s', 'format', 'jpeg', path.join(dir, 'guide/images/01-extensions.png'), '--out', jpg], { stdio: 'ignore' });

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${path.join(tmp, 'prof')}`, '--window-size=1280,1200', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const pipeOut = chrome.stdio[3], pipeIn = chrome.stdio[4];
let buf = '', id = 0; const pend = {}; const errs = [];
const names = {};
pipeIn.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; continue; }
    const who = names[m.sessionId] || '?';
    if (m.method === 'Runtime.exceptionThrown') { const x = m.params.exceptionDetails || {}; errs.push(`${who}: ${(x.exception && x.exception.description) || x.text}`.slice(0, 300)); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(`${who}: ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
  }
});
const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend[i] = r; pipeOut.write(JSON.stringify({ id: i, method, params, sessionId }) + '\0'); });
async function open(url, name) {
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  names[sessionId] = name;
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId); await send('DOM.enable', {}, sessionId);
  await send('Page.navigate', { url }, sessionId);
  return { sessionId, targetId };
}
const ev = async (s, expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }, s);
  if (r.error) return { error: r.error.message };
  return r.result.exceptionDetails ? { error: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text } : r.result.result.value;
};
async function waitFor(s, expr, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await ev(s, expr); if (v && !v.error) return v; await sleep(250); } return null; }

let EXTID = '';
// 실제 툴바 버튼 누르기 → 열린 팝업에 붙기
async function popupFor(pageUrl) {
  const tabs = (await send('Target.getTargets', { filter: [{ type: 'tab' }] })).result.targetInfos;
  const tab = tabs.find(x => x.url.startsWith(pageUrl));
  if (!tab) throw new Error('탭 없음: ' + pageUrl);
  const before = new Set((await send('Target.getTargets')).result.targetInfos.map(x => x.targetId));
  const tr = await send('Extensions.triggerAction', { id: EXTID, targetId: tab.targetId });
  if (tr.error) throw new Error('툴바 버튼 실패: ' + tr.error.message);
  let info; for (let i = 0; i < 40 && !info; i++) { await sleep(150); info = (await send('Target.getTargets')).result.targetInfos.find(x => !before.has(x.targetId) && x.url.endsWith('/popup.html')); }
  if (!info) throw new Error('팝업이 열리지 않음');
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId: info.targetId, flatten: true });
  names[sessionId] = 'popup'; await send('Runtime.enable', {}, sessionId);
  await waitFor(sessionId, `document.readyState === 'complete' && !!window.PubVault`);
  return { s: sessionId, close: () => send('Target.closeTarget', { targetId: info.targetId }) };
}
const R = { ok: false, steps: {} };
try {
  const load = await send('Extensions.loadUnpacked', { path: ext });
  if (load.error) throw new Error('확장 올리기 실패: ' + load.error.message);
  EXTID = load.result.id; const EXT = `chrome-extension://${EXTID}`;
  const PASS = 'fake-pass-' + Date.now(); // 시험용 임시 잠금 암호(저장하지 않음)

  // ① 설정 화면: 잠금 암호 정하기
  const o = (await open(`${EXT}/options.html`, 'options')).sessionId;
  await waitFor(o, `!document.getElementById('gate').classList.contains('hidden')`);
  await ev(o, `pass1.value = pass2.value = ${JSON.stringify(PASS)}; gateBtn.click(); true`);
  R.steps.create = !!(await waitFor(o, `!document.getElementById('app').classList.contains('hidden') && document.querySelectorAll('section').length > 2`, 30000));
  // 가짜 정보 넣기(시험용 sample.js)
  await ev(o, fs.readFileSync(path.join(dir, 'test/sample.js'), 'utf8') + '\n;true');
  await ev(o, `PubVault.save(window.SAMPLE).then(() => location.reload(), e => String(e))`);
  await sleep(1500);
  await waitFor(o, `!document.getElementById('app').classList.contains('hidden') && !!document.querySelector('#photoBox')`, 20000);
  // 증명사진 고르기(파일 칸에 그림 넣기 → 화면이 450×600 JPEG로 만듦)
  const { result: { root } } = await send('DOM.getDocument', { depth: -1 }, o);
  const q = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'section input#photoFile' }, o);
  await send('DOM.setFileInputFiles', { files: [jpg], nodeId: q.result.nodeId }, o);
  R.steps.photoPicked = !!(await waitFor(o, `/^data:image\\/jpeg;base64,/.test(document.querySelector('[data-key="photo"]').value)`));
  // 저장
  await ev(o, `save.click(); true`);
  await sleep(1500);
  // 잠갔다가 설정 화면을 새로 열어 잠금 해제 → 남아 있는지
  await ev(o, `lock.click(); true`); await sleep(500);
  await send('Page.navigate', { url: `${EXT}/options.html` }, o);
  await waitFor(o, `!document.getElementById('gate').classList.contains('hidden') && document.getElementById('gateTitle').textContent === '잠금 해제'`);
  await ev(o, `pass1.value = ${JSON.stringify(PASS)}; gateBtn.click(); true`);
  const kept = await waitFor(o, `(() => { if (document.getElementById('app').classList.contains('hidden')) return null; const img = document.querySelector('#photoBox img'); return img ? { photo: true } : null; })()`, 30000);
  R.steps.reopen = kept;
  R.steps.photoKept = !!(kept && kept.photo);

  // ② 팝업: 칸 알려 주기, 채우기
  const page = (await open('http://127.0.0.1:8765/test/form.html', 'form')).sessionId;
  await waitFor(page, `document.readyState === 'complete'`);
  let pp = await popupFor('http://127.0.0.1:8765/test/form.html'); const pop = pp.s;
  await ev(pop, `document.getElementById('teach').click(); true`);
  const teachMsg = await waitFor(pop, `/파란 테두리|찾지 못했습니다|실행할 수 없습니다/.test(out.textContent) ? out.textContent : null`);
  const marked = await ev(page, `[...document.querySelectorAll('input,select,textarea,td,dd,li,div,button')].filter(e => /31, 94, 255/.test(e.style.boxShadow)).length`);
  R.steps.teach = { started: /파란 테두리/.test(teachMsg || ''), marked };
  await pp.close();
  // 칸 알려 주기 끝내기(Esc) → 팝업 다시 열어 채우기
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
  await sleep(300);
  pp = await popupFor('http://127.0.0.1:8765/test/form.html');
  await ev(pp.s, `out.textContent = ''; document.getElementById('fill').click(); true`);
  const fillMsg = await waitFor(pp.s, `/채운 칸|실행할 수 없습니다/.test(out.textContent) ? out.textContent : null`, 30000);
  const filled = await ev(page, `[...document.querySelectorAll('input:not([type=hidden]):not([type=file]),select,textarea')].filter(e => e.type === 'checkbox' || e.type === 'radio' ? e.checked : !!e.value).length`);
  await sleep(800);
  const rec = await ev(pp.s, `PubVault.load().then(p => !!p.applications)`);
  R.steps.fill = { message: (fillMsg || '').split('\n')[0], filled, noRecord: rec === false };
  await pp.close();

  // ③ 실제 Greenhouse 지원서: 팝업 채우기(선택 목록은 background.js가 chrome.debugger로 고름). 제출은 누르지 않음
  R.steps.greenhouse = [];
  for (const u of ghUrls) {
    const g = await open(u, 'greenhouse'); const gh = g.sessionId;
    await waitFor(gh, `document.readyState === 'complete' && document.querySelectorAll('input').length > 5`, 30000); await sleep(3000);
    const gp = await popupFor(u);
    await ev(gp.s, `out.textContent = ''; document.getElementById('fill').click(); true`);
    const msg = await waitFor(gp.s, `/채운 칸|실행할 수 없습니다/.test(out.textContent) ? out.textContent : null`, 120000);
    await sleep(1500);
    const sel = await ev(gh, `[...document.querySelectorAll('[class*="select__control"]')].map(c => ({ id: (c.querySelector('input') || {}).id || '', v: (c.querySelector('[class*="single-value"]') || {}).textContent || '' }))`);
    const picked = Array.isArray(sel) ? sel.filter(x => x.v) : [];
    R.steps.greenhouse.push({ url: u, message: (msg || '').replace(/\n+/g, ' / ').slice(0, 240), selects: Array.isArray(sel) ? sel.length : sel, picked: picked.map(x => x.id + '=' + x.v) });
    await gp.close(); await send('Target.closeTarget', { targetId: g.targetId });
  }

  R.siteErrors = errs.filter(e => e.startsWith('greenhouse:')).length;
  R.errors = errs.filter(e => !e.startsWith('greenhouse:'));
  R.ok = R.errors.length === 0 && (!ghUrls.length || R.steps.greenhouse.every(g => g.picked.length > 0)) && R.steps.create && R.steps.photoPicked && R.steps.photoKept
    && R.steps.teach.started && R.steps.teach.marked > 0
    && R.steps.fill.filled > 10 && R.steps.fill.noRecord;
} catch (e) { R.reason = String(e && e.message || e); R.errors = errs; }
console.log(JSON.stringify(R));
chrome.kill(); await new Promise(r => { chrome.on('exit', r); setTimeout(r, 3000); });
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(R.ok ? 0 : 1);
