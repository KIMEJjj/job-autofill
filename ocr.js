// 자격증 사진 읽기: 사진 속 글자를 Mac 안에서 인식(tesseract.js)하고,
// 한 장에 자격증이 여러 개 있으면 자격증명 위치를 기준으로 나눠 순서대로 돌려줍니다.
// 네트워크 요청 없음: 인식 프로그램과 글자 데이터는 확장 폴더(lib/)에서 불러옵니다.
(function (root) {
  const ALIAS = (root.PUBFILL_ALIAS || []);
  const LANG = new Set(root.PUBFILL_LANG || []);
  const norm = s => (s || '').toLowerCase().replace(/[\s*:：·※()\[\]{}\-_/&+.,'"“”​-‍﻿]/g, '');
  const AL = ALIAS.flatMap(([canon, al, issuer]) => al.map(a => ({ canon, a: norm(a), issuer })))
    .filter(x => x.a.length >= 2).sort((x, y) => y.a.length - x.a.length);
  const ISSUER = Object.fromEntries(ALIAS.filter(x => x[2]).map(x => [x[0], x[2]]));
  // Q-Net 국가자격 종목 (한국산업인력공단 시행) — 공식 명칭 기준
  const QNET = (root.PUBFILL_QNET || []).map(([n, k]) => ({ n, a: norm(n), k }));
  const QSET = new Set(QNET.map(x => x.n));
  for (const x of QNET) if (x.a.length >= 5 && !AL.some(y => y.a === x.a)) AL.push({ canon: x.n, a: x.a });
  AL.sort((x, y) => y.a.length - x.a.length);
  for (const x of QNET) if (!ISSUER[x.n]) ISSUER[x.n] = '한국산업인력공단';
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  // 공식 명칭 찾기: 정확히 같음 → 포함 → (사진 인식 오타) 한두 글자 차이
  function qnetMatch(t) {
    if (!t) return '';
    const ex = QNET.find(x => x.a === t); if (ex) return ex.n;
    let best = null;
    for (const x of QNET) if (x.a.length >= 4 && t.includes(x.a) && (!best || x.a.length > best.a.length)) best = x;
    if (best) return best.n;
    if (t.length >= 5) {
      let bd = 99, bn = '';
      for (const x of QNET) { if (Math.abs(x.a.length - t.length) > 2) continue; const dd = lev(x.a, t); if (dd < bd) { bd = dd; bn = x.n; } }
      if (bd <= (t.length >= 9 ? 2 : 1)) return bn;
    }
    return '';
  }

  // ── 1. 인식 결과를 줄 단위로 정리 ──
  function toLines(data) {
    const lines = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
      const words = (l.words || []).filter(w => w.text && w.text.trim()).map(w => ({ text: w.text, bbox: w.bbox }));
      words.forEach(w => { w.text = w.text.replace(/×/g, 'X'); });
      if (words.length) lines.push({ text: words.map(w => w.text).join(' '), bbox: l.bbox, words });
    }
    return lines;
  }

  // ── 2. 자격증명 위치(기준점) 찾기 ──
  function findAnchors(lines) {
    const anchors = [];
    for (const ln of lines) {
      // 단어별 정규화 글자를 이어 붙이고, 글자 위치 → 단어 대응표를 만든다
      let s = '', map = [];
      ln.words.forEach((w, i) => { const t = norm(w.text); s += t; for (let k = 0; k < t.length; k++) map.push(i); });
      const used = new Array(s.length).fill(false);
      for (const { canon, a } of AL) {
        let from = 0, idx;
        while ((idx = s.indexOf(a, from)) !== -1) {
          from = idx + 1;
          if (used.slice(idx, idx + a.length).some(Boolean)) continue;
          for (let k = idx; k < idx + a.length; k++) used[k] = true;
          const w0 = ln.words[map[idx]], w1 = ln.words[map[idx + a.length - 1]];
          // 바로 뒤 등급 (1급, 심화 2급, N2 등)
          const tail = s.slice(idx + a.length, idx + a.length + 8);
          const head = s.slice(Math.max(0, idx - 4), idx);
          const gm = tail.match(/^(?:심화|기본)?([1-9])급/) || tail.match(/^(n[1-5])/) || head.match(/(심화|기본)$/);
          let grade = '';
          if (gm) grade = gm[1] ? (/^n/.test(gm[1]) ? gm[1].toUpperCase() : (gm[1] === '심화' || gm[1] === '기본' ? gm[1] : gm[1] + '급')) : '';
          anchors.push({ canon, grade, x0: w0.bbox.x0, x1: w1.bbox.x1, y0: ln.bbox.y0, y1: ln.bbox.y1, h: ln.bbox.y1 - ln.bbox.y0 });
        }
      }
    }
    // 같은 자격증이 제목·본문에 두 번 나오면 하나로 (세로로 가깝고 가로로 겹칠 때)
    anchors.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const out = [];
    for (const a of anchors) {
      const dup = out.find(o => o.canon === a.canon && (!o.grade || !a.grade || o.grade === a.grade) && Math.abs(o.y0 - a.y0) < Math.max(o.h, a.h) * 4 && a.x0 < o.x1 + o.h * 6 && o.x0 < a.x1 + o.h * 6);
      if (dup) { if (!dup.grade && a.grade) dup.grade = a.grade; continue; }
      out.push(a);
    }
    return out;
  }

  // ── 3. 날짜·번호·점수·기관 조각 찾기 ──
  const DATE = /((?:19|20)\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g;
  // DataQ 자격번호: 종목별 접두어 뒤에 숫자 9자리.
  // OCR이 접두어·하이픈·숫자 사이에 공백을 끼워도 한 번호로 복원합니다.
  function dataqNumber(text) {
    const m = String(text || '').match(/\b(B\s*A\s*E|S\s*Q\s*L\s*D|S\s*Q\s*L\s*P|A\s*D\s*S\s*P|A\s*D\s*P|D\s*A\s*S\s*P|D\s*A\s*P)\s*[-‐‑‒–—]?\s*(\d(?:[\s-]*\d){8})\b/i);
    if (!m) return null;
    const prefix = m[1].replace(/\s/g, '').toUpperCase();
    return { raw: m[0], value: prefix + '-' + m[2].replace(/\D/g, '') };
  }
  function numberMatch(text) {
    const dataq = dataqNumber(text);
    if (dataq) return dataq;
    const m = String(text || '').match(/\b([0-9]{2}[0-9A-Z\-]{6,}[A-Z]?)\b/);
    return m ? { raw: m[0], value: m[1] } : null;
  }
  function findTokens(lines) {
    const toks = [];
    lines.forEach((ln, li) => {
      const t = ln.text;
      const prev = li > 0 ? lines[li - 1].text : '';
      const wordAt = s => ln.words.find(w => w.text.includes(s)) || ln.words[0];
      let m;
      DATE.lastIndex = 0;
      while ((m = DATE.exec(t))) {
        const ctx = t + ' ' + prev;
        const pr = /합격|취득|자격취득|인증일|등록일/.test(ctx) ? 3 : /시험일|응시일|test\s*date/i.test(ctx) ? 2 : /발급|발행|issue/i.test(ctx) ? 1 : 0;
        const w = wordAt(m[1]);
        toks.push({ kind: 'date', v: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, pr, x: (w.bbox.x0 + w.bbox.x1) / 2, y: (ln.bbox.y0 + ln.bbox.y1) / 2 });
      }
      const dq = dataqNumber(t);
      if (dq) {
        const w = wordAt(dq.value.slice(0, 3));
        toks.push({ kind: 'number', v: dq.value, nearestAnchor: true, x: (w.bbox.x0 + w.bbox.x1) / 2, y: (ln.bbox.y0 + ln.bbox.y1) / 2 });
      }
      // 한 줄에 카드 여러 장이 합쳐져 읽힐 수 있어 모두 찾음
      for (const nm of (dq ? [] : t.matchAll(/(?:번\s*호|No\.?|Registration\s*No\.?)\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9×\-]{4,})/gi))) {
        const w = wordAt(nm[1].slice(0, 3));
        toks.push({ kind: 'number', v: nm[1].replace(/×/g, 'X'), x: (w.bbox.x0 + w.bbox.x1) / 2, y: (ln.bbox.y0 + ln.bbox.y1) / 2 });
      }
      for (const gm of t.matchAll(/(?:^|\s)(심\s*화|기\s*본)?\s*([1-9])\s*급(?=\s|$)/g)) {
        const w = ln.words.slice().reverse().find(x => x.text.includes(gm[2])) || ln.words[0];
        toks.push({ kind: 'grade', v: gm[2] + '급', x: (w.bbox.x0 + w.bbox.x1) / 2, y: (ln.bbox.y0 + ln.bbox.y1) / 2 });
      }
      const sm = t.match(/(?:total|총\s*점|점\s*수|score|성\s*적)\s*[:：]?\s*(\d{2,3})\b/i) || t.match(/\b(IH|IM[1-3]?|IL|AL|AM|NH)\b/);
      if (sm) { const w = wordAt(sm[1]); toks.push({ kind: 'score', v: sm[1], x: (w.bbox.x0 + w.bbox.x1) / 2, y: (ln.bbox.y0 + ln.bbox.y1) / 2 }); }
      const om = t.replace(/\s+/g, '').match(/[가-힣A-Za-z]{2,}(?:위원회|공단|협회|상공회의소|진흥원|재단|연구원|본부|세무사회|교류기금)/);
      if (om) toks.push({ kind: 'issuer', v: om[0], x: (ln.bbox.x0 + ln.bbox.x1) / 2, y: (ln.bbox.y0 + ln.bbox.y1) / 2 });
    });
    return toks;
  }

  // ── 4. 조각을 가장 가까운 자격증에 붙이기 ──
  function assign(anchors, toks, width) {
    // 자격증명 x 위치로 세로 열을 나눔 (나란히 놓인 카드 구분)
    const xs = [...new Set(anchors.map(a => a.x0))].sort((a, b) => a - b);
    const cols = [];
    for (const x of xs) { if (!cols.length || x - cols[cols.length - 1] > width * 0.22) cols.push(x); }
    const colOf = x => { let c = 0; cols.forEach((cx, i) => { if (x >= cx - width * 0.05) c = i; }); return c; };
    anchors.forEach(a => { a.col = colOf(a.x0); a.toks = []; });
    for (const t of toks) {
      // DataQ 카드에서는 BAE 번호가 자격증명보다 위에 인쇄되기도 합니다.
      // 해당 열에서 세로로 가장 가까운 자격증명에 붙입니다.
      if (t.kind === 'number' && t.nearestAnchor) {
        const c = colOf(t.x), nearby = anchors.filter(a => a.col === c);
        if (nearby.length) {
          const a = nearby.reduce((p, q) =>
            Math.abs(t.y - (q.y0 + q.y1) / 2) < Math.abs(t.y - (p.y0 + p.y1) / 2) ? q : p
          );
          if (Math.abs(t.y - (a.y0 + a.y1) / 2) <= Math.max(a.h * 8, width * 0.08)) {
            a.toks.push(t);
            continue;
          }
        }
      }
      // 목록·표처럼 자격증명과 같은 줄에 있으면 그 줄에서 왼쪽에 가장 가까운 자격증으로
      const same = anchors.filter(a => Math.abs(t.y - (a.y0 + a.y1) / 2) < a.h * 0.8);
      if (same.length) {
        const left = same.filter(a => a.x0 <= t.x);
        const a = left.length ? left.reduce((p, q) => (q.x0 > p.x0 ? q : p)) : same.reduce((p, q) => (q.x0 < p.x0 ? q : p));
        a.toks.push(t); continue;
      }
      const c = colOf(t.x);
      const cand = anchors.filter(a => a.col === c && a.y0 <= t.y + a.h * 0.6);
      if (!cand.length) continue;
      const a = cand.reduce((p, q) => (q.y0 > p.y0 ? q : p));
      a.toks.push(t);
    }
  }

  // ── 표 형식 (Q-Net 마이페이지처럼 머리글 + 한 줄에 자격증 하나) ──
  const NATIONAL = /(기술사|기능장|산업기사|기사|기능사)$/;
  function canonLoose(name) {
    const t = norm(name);
    const ex = AL.find(x => x.a === t); if (ex) return ex.canon;
    const inc = AL.find(x => x.a.length >= 3 && t.includes(x.a));
    return inc ? inc.canon : qnetMatch(t);
  }
  function tableItemFromName(name, it) {
    name = name.replace(/(?<=[가-힣])\s+(?=[가-힣0-9(])/g, '').replace(/\((검정형|과정평가형|외부평가형)\)/g, '').replace(/[|]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const g = name.match(/([1-9])\s*급/);
    const base = name.replace(/\s*[1-9]\s*급/, '').trim();
    const official = canonLoose(base) || base;
    it.type = LANG.has(official) ? 'lang' : 'cert';
    it.name = official;
    it.grade = g ? g[1] + '급' : '';
    it.issuer = ISSUER[official] || (NATIONAL.test(official) ? '한국산업인력공단' : it.issuer || '');
    return it;
  }
  function parseTable(lines) {
    const hi = lines.findIndex(l => {
      const t = l.text.replace(/\s+/g, '');
      return /(자격|종목|시험)(증)?(명|번호)/.test(t) && /(합격|취득|발급|등록)(일|일자|년월일)?/.test(t);
    });
    if (hi < 0) return null;
    const head = lines[hi].text.replace(/\s+/g, '');
    // 머리글에서 날짜 열 위치 찾기: 최종/취득/합격 열 x, 필기 열 x
    const hw = lines[hi].words, colX = k => { const i = hw.findIndex((w, j) => (w.text + (hw[j + 1] ? hw[j + 1].text : '')).replace(/\s/g, '').startsWith(k)); return i < 0 ? null : (hw[i].bbox.x0 + hw[i].bbox.x1) / 2; };
    const finalX = colX('최종') ?? colX('취득') ?? colX('발급');
    const writtenX = colX('필기');
    const items = [];
    for (const ln of lines.slice(hi + 1)) {
      let t = ln.text;
      const dates = [...t.matchAll(new RegExp(DATE.source, 'g'))];
      const numM = numberMatch(t.replace(new RegExp(DATE.source, 'g'), ' '));
      if (!dates.length && !numM) continue;
      let rest = t.replace(new RegExp(DATE.source, 'g'), ' ');
      if (numM) rest = rest.replace(numM.raw, ' ');
      // 자격증명 칸 위치: 날짜·번호가 아닌 단어들의 범위
      const nameWords = ln.words.filter(w => !/\d{4}[.\-/]\d{1,2}/.test(w.text) && !(numM && w.text.includes(numM.raw.slice(0, 6))) && !/^\d{2,}[A-Z]?$/.test(w.text));
      const rect = nameWords.length ? { left: Math.min(...nameWords.map(w => w.bbox.x0)), top: ln.bbox.y0, right: Math.max(...nameWords.map(w => w.bbox.x1)), bottom: ln.bbox.y1 } : null;
      // 한글 낱글자 사이 띄어쓰기 제거, (검정형)·(과정평가형) 같은 꼬리표 제거
      const name = rest.trim();
      if (!/[가-힣A-Za-z]{2,}/.test(name.replace(/\s+/g, ''))) continue;
      const usedW = new Set();
      const ds = dates.map(m => {
        // 같은 해가 두 번 나올 수 있어, 날짜 전체로 단어를 찾고 이미 쓴 단어는 건너뜀
        const key = (m[2].padStart(2, '0') + '.' + m[3].padStart(2, '0'));
        const w = ln.words.find(x => !usedW.has(x) && x.text.includes(m[1]) && x.text.replace(/\s/g, '').includes(key))
          || ln.words.find(x => !usedW.has(x) && x.text.includes(m[1])) || ln.words[0];
        usedW.add(w);
        return { v: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, x: (w.bbox.x0 + w.bbox.x1) / 2 };
      });
      // 취득일 = 최종(또는 취득·발급) 열의 날짜. 필기 열 날짜만 읽혔으면 비워 둠(잘못된 날짜보다 빈칸)
      let date = '';
      if (finalX != null && ds.length) {
        const near = ds.reduce((p, q) => (Math.abs(q.x - finalX) < Math.abs(p.x - finalX) ? q : p));
        const isWritten = writtenX != null && Math.abs(near.x - writtenX) < Math.abs(near.x - finalX);
        date = isWritten ? '' : near.v;
      } else if (ds.length) date = ds[ds.length - 1].v;
      const sc = t.match(/(?:total|총\s*점|점\s*수|score)\s*[:：]?\s*(\d{2,3})\b/i);
      items.push(tableItemFromName(name, {
         number: numM ? numM.value : '',
        date: date || '',
        score: sc ? sc[1] : '',
        _rect: rect,
      }));
    }
    return items.length ? items : null;
  }

  const NOISE = /(한\s*글\s*확\s*인\s*서|영\s*문\s*확\s*인\s*서|상\s*장\s*형\s*자\s*격\s*증|자\s*격\s*증?\s*번\s*호|인\s*증\s*번\s*호|등\s*록\s*번\s*호|합\s*격\s*일\s*자?|취\s*득\s*일\s*자?|발\s*급\s*일\s*자?|출\s*력|보\s*기|발\s*급|신\s*청)/g;
  function fixNumber(num, issuer) {
    if (issuer === '대한상공회의소') {
      const m = num.match(/^(\d{2})-?([0-9A-Z])([0-9A-Z])-?(\d{6})$/);
      if (m) { const L = { '1': 'I', '0': 'O', '8': 'B', '5': 'S', '2': 'Z' }[m[2]] || m[2]; return `${m[1]}-${L}${m[3]}-${m[4]}`; }
    }
    return num;
  }
  function parseRows(lines) {
    const rows = [];
    for (const ln of lines) {
      const t = ln.text;
      const dates = [...t.matchAll(new RegExp(DATE.source, 'g'))];
      if (!dates.length) continue;
      const noDate = t.replace(new RegExp(DATE.source, 'g'), ' ');
      // YY-문자숫자-6자리(대한상공회의소 형식)는 가운데 글자가 깨져도 잡고, 못 읽은 글자는 ?로 표시
      const kc = noDate.match(/(\d{2}-\S{2}-\d{6})/);
      const numM = kc
        ? { raw: kc[1], value: kc[1], kcci: true }
        : numberMatch(noDate);
      if (!numM) continue;
      if (kc) numM.value = kc[1].replace(/^(\d{2}-)(\S{2})/, (m0, a1, b1) => a1 + b1.replace(/[^0-9A-Z]/g, '?'));
      const name = noDate.replace(numM.raw, ' ').replace(NOISE, ' ').replace(/[:：|]/g, ' ').trim();
      if (!/[가-힣A-Za-z]{2,}/.test(name.replace(/\s+/g, ''))) continue;
      const d = dates[0];
      const it = tableItemFromName(name, { number: numM.value, date: `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`, score: '', _rect: null });
      it.number = fixNumber(it.number, it.issuer);
      rows.push({ y: (ln.bbox.y0 + ln.bbox.y1) / 2, h: ln.bbox.y1 - ln.bbox.y0, x: ln.bbox.x0, it });
    }
    return rows;
  }

  function parse(data, width) {
    const lines = toLines(data);
    const table = parseTable(lines);
    if (table) return table;
    const rows = parseRows(lines);
    const anchors = findAnchors(lines);
    if (!anchors.length && !rows.length) return [];
    if (!anchors.length) return rows.map(r => r.it);
    assign(anchors, findTokens(lines), width || 1000);
    // 위 → 아래, 같은 줄(높이 차이 작음)이면 왼쪽 → 오른쪽
    anchors.sort((a, b) => (Math.abs(a.y0 - b.y0) < Math.max(a.h, b.h) * 1.5 ? a.x0 - b.x0 : a.y0 - b.y0));
    const cardItems = anchors.map(a => {
      const pick = k => a.toks.filter(t => t.kind === k);
      const dates = pick('date').sort((p, q) => q.pr - p.pr || p.y - q.y);
      const isLang = LANG.has(a.canon);
      if ((!a.grade || a.grade === '심화' || a.grade === '기본') && pick('grade')[0]) a.grade = pick('grade')[0].v;
      const grade = a.grade === '심화' ? '' : a.grade === '기본' ? '' : a.grade;
      return {
        type: isLang ? 'lang' : 'cert',
        name: a.canon,
        grade: grade || a.grade || '',
        number: (pick('number')[0] || {}).v || '',
        date: (dates[0] || {}).v || '',
        issuer: ISSUER[a.canon] || (pick('issuer')[0] || {}).v || '',
        score: (pick('score')[0] || {}).v || '',
      };
    });
    // 같은 줄에 기준점이 있으면 줄 내용(번호·날짜가 한 줄에 다 있음)을 쓰고, 기준점 없는 줄도 추가
    const out = [];
    const onRow = a => rows.find(r => Math.abs(r.y - (a.y0 + a.y1) / 2) < Math.max(r.h, a.h) * 0.7);
    anchors.forEach((a, i) => { if (!onRow(a)) out.push({ y: a.y0, x: a.x0, it: cardItems[i] }); });
    rows.forEach(r => out.push({ y: r.y, x: r.x, it: r.it }));
    out.sort((p, q) => (Math.abs(p.y - q.y) < 20 ? p.x - q.x : p.y - q.y));
    return out.map(o => o.it);
  }

  // ── 5. 사진 읽기 (여러 장 차례로) ──
  let worker = null;
  const base = (root.chrome && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('') : (root.PUBOCR_BASE || './');
  async function getWorker(onProgress) {
    if (worker) return worker;
    worker = await Tesseract.createWorker(['kor', 'eng'], 1, {
      workerPath: base + 'lib/worker.min.js',
      corePath: base + 'lib/tesseract-core-simd-lstm.wasm.js',
      langPath: base + 'lib/lang',
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none',
      logger: m => onProgress && m.status && onProgress({ stage: m.status, p: m.progress }),
    });
    return worker;
  }
  // 투명 배경은 흰색으로, 작은 이미지는 키워서(가로 2000px 기준, 최대 3배) 글자 인식률을 높임
  async function prepare(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(3, Math.max(1, 2000 / bmp.width));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, w, h);
    const blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' }) : await new Promise(r => c.toBlob(r, 'image/png'));
    return { blob, width: w };
  }
  let korWorker = null;
  async function getKorWorker() {
    if (korWorker) return korWorker;
    korWorker = await Tesseract.createWorker('kor', 1, {
      workerPath: base + 'lib/worker.min.js', corePath: base + 'lib/tesseract-core-simd-lstm.wasm.js',
      langPath: base + 'lib/lang', workerBlobURL: false, gzip: true, cacheMethod: 'none',
    });
    return korWorker;
  }
  async function readImages(files, onProgress) {
    const w = await getWorker(onProgress);
    const out = [];
    for (let i = 0; i < files.length; i++) {
      onProgress && onProgress({ file: i + 1, total: files.length });
      try {
        const img = await prepare(files[i]);
        const { data } = await w.recognize(img.blob, {}, { blocks: true });
        const items = parse(data, img.width);
        for (const it of items) {
          if (!it._rect || (/[가-힣]/.test(it.name) && !root.PUBOCR_FORCE_REREAD)) continue; // 시험용 강제 플래그
          const kw = await getKorWorker();
          const r = it._rect, pad = 8;
          const rect = { left: Math.max(0, r.left - pad), top: Math.max(0, r.top - pad), width: r.right - r.left + pad * 2, height: r.bottom - r.top + pad * 2 };
          const { data: d2 } = await kw.recognize(img.blob, { rectangle: rect });
          const txt = (d2.text || '').replace(/\n/g, ' ').trim();
          if (/[가-힣]{2,}/.test(txt)) tableItemFromName(txt, it);
        }
        items.forEach(it => delete it._rect);
        out.push({ file: files[i].name || `사진 ${i + 1}`, items });
      } catch (e) {
        out.push({ file: files[i].name || `사진 ${i + 1}`, items: [], error: String(e && e.message || e) });
      }
    }
    return out;
  }

  // 이름을 공식 명칭으로 (같은 자격증인지 비교할 때 사용)
  function canonOf(text) {
    const t = norm(String(text || '').replace(/(심화|기본)?\s*[1-9]\s*급|\bN[1-5]\b/gi, ''));
    if (!t) return '';
    const ex = AL.find(x => x.a === t); if (ex) return ex.canon;
    const inc = AL.find(x => x.a.length >= 3 && t.includes(x.a));
    return inc ? inc.canon : (qnetMatch(t) || t);
  }
  root.PubOCR = { readImages, parse, canonOf, _internals: { toLines, findAnchors, findTokens } };
})(typeof window !== 'undefined' ? window : globalThis);
