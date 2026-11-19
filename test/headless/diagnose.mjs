// 공개 지원서 일괄 진단: 여러 회사 채용 사이트에서 지원서를 열어 가짜 정보로 채워 보고,
// 인식한 칸·모르는 칸·로그인 필요 여부를 정리합니다. 제출 버튼은 누르지 않습니다.
// 사용: node test/headless/diagnose.mjs <확장폴더> <사이트목록.txt> <결과폴더> [회사당 공고 수=1]
//   사이트목록: 줄마다 그리팅 하위 주소(예: cesco) 또는 지원서 전체 주소(https://...)
import fs from 'fs'; import { spawn } from 'child_process';
const [,, dir, listFile, outDir, perSite = '1'] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = +(process.env.PORT || 9350); // 동시에 여러 진단을 돌릴 때는 PORT를 다르게(같은 크롬을 나눠 쓰면 send-timeout·0/0이 남)
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/private/tmp/claude-501/diagprof${Date.now()}`, '--window-size=1280,2000', 'about:blank'], { stdio: 'ignore' });
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}, ms = 30000) => Promise.race([new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); }), sleep(ms).then(() => ({ result: { exceptionDetails: { text: 'send-timeout ' + method } } }))]);
const ev = async (e, ms = 60000) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, ms); return r.result && r.result.exceptionDetails ? { error: JSON.stringify(r.result.exceptionDetails).slice(0, 200) } : r.result.result.value; };
const go = async (url, wait = 5000) => { await send('Page.navigate', { url }); await sleep(wait); };
const files = ['schema.js', 'alias.js', 'qnet.js', 'test/sample.js', 'fill.js'].map(f => fs.readFileSync(dir + '/' + f, 'utf8'));

const lines = fs.readFileSync(listFile, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const results = [];
const limit = +perSite || 1;
async function listingUrls(line) {
  if (!/^https?:/.test(line)) {
    // 그리팅: 공고 목록에서 공고 번호를 모아 지원서 주소로
    // 회사마다 공고 목록 주소가 달라(/ko/apply, /ko/recruit, /ko/career, /ko/home …) 차례로 시도
    for (const path of ['/ko/apply', '/ko/recruit', '/ko/career', '/ko/home', '/ko/openings', '/en/r/openings']) {
      await go(`https://${line}.career.greetinghr.com${path}`, 7000);
      const got = await ev(`[...new Set([...document.querySelectorAll('a[href*="/o/"]')].map(a => (a.href.match(/\\/o\\/(\\d+)/) || [])[1]).filter(Boolean))]`);
      if (Array.isArray(got) && got.length) return got.slice(0, limit).map(n => `https://${line}.career.greetinghr.com/ko/o/${n}/apply`);
    }
    return [];
  }
  await go(line, 7000);
  const host = (() => { try { return new URL(line).host; } catch { return ''; } })();
  if (/ninehire\.site$/.test(host) && !/job_posting\/[A-Za-z0-9]+/.test(line)) {
    const got = await ev(`(() => {
      const urls = [...new Set([...document.querySelectorAll('a[href*="job_posting/"]')].map(a => a.href.split('?')[0]))];
      return urls.filter(u => /\\/job_posting\\/[^/]+(?:\\/apply)?$/.test(new URL(u).pathname))
        .slice(0, ${limit}).map(u => u.replace(/\\/apply\\/?$/, '') + '/apply');
    })()`);
    return Array.isArray(got) ? got : [];
  }
  if (/greenhouse\.io$/.test(host) && !/\/jobs\/\d+/.test(line)) {
    const got = await ev(`(() => {
      const rows = [...document.querySelectorAll('a[href*="/jobs/"]')].map(a => ({ href: a.href.split('?')[0], text: ((a.closest('tr') || a.parentElement || a).innerText || '') }));
      const kr = rows.filter(r => /서울|Korea|Seoul/i.test(r.text));
      return [...new Set((kr.length ? kr : rows).map(r => r.href))].slice(0, ${limit});
    })()`);
    return Array.isArray(got) ? got : [];
  }
  if (/jobs\.lever\.co$/i.test(host)) {
    const path = new URL(line).pathname.split('/').filter(Boolean);
    if (path.length >= 2) {
      const jobPath = path.slice(0, 2);
      const base = `https://jobs.lever.co/${jobPath.map(encodeURIComponent).join('/')}`;
      return [base + '/apply'];
    }
    const got = await ev(`(() => {
      const rows = [...document.querySelectorAll('a[href]')].map(a => {
        try {
          const u = new URL(a.href, location.href);
          if (u.hostname !== 'jobs.lever.co') return null;
          const p = u.pathname.split('/').filter(Boolean);
          if (p.at(-1) === 'apply') p.pop();
          if (p.length < 2) return null;
          const row = a.closest('.posting') || a.closest('[class*="posting"]') || a.parentElement?.parentElement?.parentElement || a;
          return { href: 'https://jobs.lever.co/' + p.slice(0, 2).map(encodeURIComponent).join('/'), text: row.innerText || a.innerText || '' };
        } catch { return null; }
      }).filter(Boolean);
      const unique = [...new Map(rows.map(r => [r.href, r])).values()];
      const score = r => /seoul|서울/i.test(r.text) ? 3 : /south korea|korea|한국/i.test(r.text) ? 2 : 0;
      return unique.sort((a, b) => score(b) - score(a)).slice(0, ${limit}).map(r => r.href + '/apply');
    })()`);
    return Array.isArray(got) ? got : [];
  }
  if (/jobs\.ashbyhq\.com$/i.test(host)) {
    const url = new URL(line);
    const path = url.pathname.split('/').filter(Boolean);
    if (path.length >= 2) {
      const base = `https://jobs.ashbyhq.com/${path.slice(0, 2).map(encodeURIComponent).join('/')}`;
      return [base + '/application'];
    }
    const got = await ev(`(() => {
      const slug = location.pathname.split('/').filter(Boolean)[0];
      const posts = window.__appData?.jobBoard?.jobPostings || [];
      if (posts.length && slug) {
        const rows = posts.map(p => ({
          href: 'https://jobs.ashbyhq.com/' + encodeURIComponent(slug) + '/' + encodeURIComponent(p.id),
          text: [p.title, p.locationName, ...(p.secondaryLocations || []).map(x => x.locationName)].filter(Boolean).join(' ')
        }));
        const score = r => /seoul|서울/i.test(r.text) ? 3 : /south korea|korea|한국/i.test(r.text) ? 2 : 0;
        return rows.sort((a, b) => score(b) - score(a)).slice(0, ${limit}).map(r => r.href + '/application');
      }
      const rows = [...document.querySelectorAll('a[href]')].map(a => {
        try {
          const u = new URL(a.href, location.href);
          if (u.hostname !== 'jobs.ashbyhq.com') return null;
          const p = u.pathname.split('/').filter(Boolean);
          if (p.length < 2) return null;
          const row = a.closest('li,article') || a.parentElement?.parentElement?.parentElement || a;
          return { href: 'https://jobs.ashbyhq.com/' + p.slice(0, 2).map(encodeURIComponent).join('/'), text: row.innerText || a.innerText || '' };
        } catch { return null; }
      }).filter(Boolean);
      const unique = [...new Map(rows.map(r => [r.href, r])).values()];
      const score = r => /seoul|서울/i.test(r.text) ? 3 : /south korea|korea|한국/i.test(r.text) ? 2 : 0;
      return unique.sort((a, b) => score(b) - score(a)).slice(0, ${limit}).map(r => r.href + '/application');
    })()`);
    return Array.isArray(got) ? got : [];
  }
  if (/ninehire\.site$/.test(host) && /job_posting\/[^/]+$/.test(line)) return [line.replace(/\/$/, '') + '/apply'];
  return [line];
}
function writeReport() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outDir + '/diagnose.json', JSON.stringify(results, null, 2));
  // 모르는 칸 이름 빈도
  const freq = {};
  for (const r of results) for (const u of (r.unknown || [])) { const k = u.split(' [')[0].split(' | ').pop().trim() || u; freq[k] = (freq[k] || 0) + 1; }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  let md = '# 공개 지원서 일괄 진단\n\n| 사이트 | 상태 | 채움 | 인식/전체 | 모르는 칸 |\n|---|---|---|---|---|\n';
  for (const r of results) md += `| ${r.site} | ${r.status} | ${r.filled ?? ''} | ${r.recognized ?? ''}/${r.total ?? ''} | ${(r.unknown || []).length} |\n`;
  const fl = results.filter(r => r.files && r.files.length);
  if (fl.length) md += '\n## 파일 첨부 칸(사진 첨부 판별)\n\n' + fl.map(r => `- ${r.site}: ` + r.files.join(' · ')).join('\n') + '\n';
  md += '\n## 자주 나오는 모르는 칸 이름\n\n' + top.slice(0, 80).map(([k, n]) => `- ${n}회: ${k}`).join('\n') + '\n';
  fs.writeFileSync(outDir + '/diagnose.md', md);
}
async function processSite(line) {
  const urls = await listingUrls(line);
  if (!urls.length) { results.push({ site: line, url: '', status: '공고 없음' }); return; }
  for (const url of urls) {
    await go(url, 6000);
    const pre = await ev(`({ login: !!document.querySelector('input[type=password]') || /이메일 로그인|비밀번호를 잊/.test(document.body.innerText), inputs: document.querySelectorAll('input,select,textarea').length, title: document.title })`);
    if (!pre || pre.error) { results.push({ site: line, url, status: '열기 실패' }); continue; }
    if (pre.login) { results.push({ site: line, url, status: '로그인 필요', title: pre.title }); continue; }
    for (const f of files) await ev(f);
    const out = await ev(`(async () => {
      // 가짜 증명사진(회색 사각형)으로 사진 첨부 칸 판별도 진단
      if (!window.SAMPLE.photo) { const cv = document.createElement('canvas'); cv.width = 45; cv.height = 60; cv.getContext('2d').fillRect(0, 0, 45, 60); window.SAMPLE.photo = cv.toDataURL('image/jpeg', 0.9); }
      const r1 = await window.__pubFill(window.SAMPLE, {}); await new Promise(z => setTimeout(z, 700));
      const r2 = await window.__pubFill(window.SAMPLE, {});
      const sc = window.__pubScan();
      const unknown = sc.filter(x => x.인식 === '-' && !/^textarea/.test(x.종류)).map(x => (x.칸설명 || '').replace(/\\s+/g, ' ').slice(0, 60) + ' [' + x.종류 + '] ' + (x.name || '').split('.').slice(-2).join('.'));
      const near = el => { let n = el.parentElement, t = ''; for (let k = 0; n && k < 4; k++, n = n.parentElement) { if (n.querySelectorAll('input,select,textarea').length > 1) break; t = n.innerText || t; } return t.replace(/\\s+/g, ' ').trim().slice(0, 40); };
      const files = [...document.querySelectorAll('input[type=file]')].map(el => (el.files.length ? '[첨부] ' : '[ ] ') + (near(el) || el.name || el.id || '(설명 없음)') + (el.accept ? ' {' + el.accept + '}' : ''));
      return { files, photo: (r1.photo || 0) + (r2.photo || 0), filled: (r1.filled || 0) + (r2.filled || 0), check: r2.check, total: sc.length, recognized: sc.filter(x => x.인식 !== '-' && x.인식 !== '(제외)').length, excluded: sc.filter(x => x.인식 === '(제외)').length, unknown };
    })()`, 120000);
    results.push({ site: line, url, status: out && !out.error ? '진단' : '오류', title: pre.title, ...(out || {}) });
  }
}
// 사이트 하나가 멈춰도 전체가 멈추지 않도록 사이트마다 최대 4분. 끝날 때마다 보고서를 다시 씀(중간에 꺼도 결과 남음)
for (const line of lines) {
  const before = results.length;
  const done = await Promise.race([processSite(line).then(() => true), sleep(240000).then(() => false)]);
  if (!done) { results.splice(before); results.push({ site: line, url: '', status: '시간 초과' }); await send('Page.navigate', { url: 'about:blank' }).catch(() => {}); await sleep(1000); }
  writeReport();
  console.log(line, results.slice(before).map(r => r.status).join(','));
}
console.log(fs.readFileSync(outDir + '/diagnose.md', 'utf8').slice(0, 6000));
ws.close(); chrome.kill();
