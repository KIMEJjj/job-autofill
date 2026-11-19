// 회사 이력서 양식(Word .docx, PowerPoint .pptx, 한글 .hwpx · .hwp) 채우기.
// 파일은 이 크롬 안에서만 열고 고쳐서 내려받습니다(외부 전송 없음). 압축 풀기·묶기는 크롬 내장 기능만 씁니다.
// 방식: 표에서 '성명', '생년월일' 같은 칸 이름을 찾아 오른쪽(없으면 아래) 빈 칸에 내 정보를 넣고,
//       '학교명·전공·기간'처럼 여러 칸 이름이 한 줄에 있으면 그 아래 빈 줄에 학력·자격증·경력을 차례로 넣습니다.
// 사진·자기소개서·서명·가족사항 칸은 비워 둡니다.
(function (root) {
  const { SCALAR, LISTS } = root.PUBFILL_SCHEMA;
  const SCALAR_FIELDS = SCALAR.flatMap(g => g.fields);
  const norm = s => (s || '').toLowerCase().replace(/[\s*:：·※​-‍﻿ ]/g, '').replace(/필수|선택입력/g, '');
  function scoreField(f, d) {
    if (f.ex && f.ex.some(x => d.includes(norm(x)))) return 0;
    if (f.needWith && !d.includes(norm(f.needWith))) return 0;
    let best = 0;
    for (const k of f.kw) { const nk = norm(k); if (d.includes(nk)) best = Math.max(best, nk.length); }
    return best;
  }
  const MAX_LABEL = 24; // 이보다 긴 글은 칸 이름이 아니라 안내문으로 봄
  // 비워 둘 표: 가족·추천인·보증인·자기소개 관련
  const SKIP_CTX = /가족|추천인|보증인|자기소개|성장과정|지원동기|입사후포부|서명|날인/;
  // '성명 | 한글 | __' 처럼 앞 칸 이름을 꾸미는 말
  const QUAL = /^(한글|국문|한국어|한자|한문|영문|영어|english|korean)$/;
  // 양식에 미리 적힌 안내 글자만 있는 칸: (만   ), (우편번호), ~, /4.5, 년 월, (ex.만기제대)
  function isPlaceholder(s) {
    const t = (s || '').replace(/[\s ]/g, '');
    if (!t || /^\d+$/.test(t) || /\((서명|날인|직인)\)/.test(t)) return false;
    if (/^(19|20)[.\-/]*$/.test(t)) return true; // '20 . . .'처럼 연도 앞자리만 적힌 날짜 안내
    return /^[~()\[\]\/.\-_:,년월일만세점개]*[\d.]*[~()\[\]\/.\-_:,년월일만세점개]*$/.test(t) && /[~()\[\]\/년월일만세점]/.test(t)
      || /^\((ex|예|e\.g)/i.test(t) || /^\([^()]{1,12}\)$/.test(t);
  }

  // ---------- zip 읽기·쓰기 ----------
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const through = async (u8, stream) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
  function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('압축 파일 형식이 아닙니다');
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const out = []; const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('압축 목록이 손상되었습니다');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), time = dv.getUint16(p + 12, true), date = dv.getUint16(p + 14, true);
      const crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      out.push({ name, flags, method, time, date, crc, usize, raw: u8.subarray(start, start + csize) });
      p += 46 + nlen + elen + clen;
    }
    return out;
  }
  async function entryData(e) {
    if (e.method === 0) return e.raw;
    if (e.method === 8) return through(e.raw, new DecompressionStream('deflate-raw'));
    throw new Error('지원하지 않는 압축 방식입니다');
  }
  async function zip(entries) {
    const enc = new TextEncoder(); const parts = [], cds = []; let off = 0;
    for (const e of entries) {
      let { method, crc, usize, raw } = e;
      if (e.newData) {
        usize = e.newData.length; crc = crc32(e.newData);
        if (e.name === 'mimetype') { method = 0; raw = e.newData; } else { method = 8; raw = await through(e.newData, new CompressionStream('deflate-raw')); }
      }
      const nb = enc.encode(e.name); const flags = /[^\x00-\x7f]/.test(e.name) ? 0x0800 : 0;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, flags, true); lh.setUint16(8, method, true);
      lh.setUint16(10, e.time, true); lh.setUint16(12, e.date, true); lh.setUint32(14, crc, true); lh.setUint32(18, raw.length, true); lh.setUint32(22, usize, true);
      lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, flags, true); ch.setUint16(10, method, true);
      ch.setUint16(12, e.time, true); ch.setUint16(14, e.date, true); ch.setUint32(16, crc, true); ch.setUint32(20, raw.length, true); ch.setUint32(24, usize, true);
      ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      parts.push(new Uint8Array(lh.buffer), nb, raw); cds.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + raw.length;
    }
    const cdSize = cds.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cds, new Uint8Array(end.buffer)]);
  }

  // ---------- OLE 복합 문서(.hwp 묶음) 읽기·쓰기 ----------
  const ENDCHAIN = 0xFFFFFFFE, FREESECT = 0xFFFFFFFF, FATSECT = 0xFFFFFFFD, NOSTREAM = 0xFFFFFFFF;
  function cfbRead(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0xE011CFD0 || dv.getUint32(4, true) !== 0xE11AB1A1) throw new Error('한글(.hwp) 파일 형식이 아닙니다');
    const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
    const nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true), cut = dv.getUint32(56, true);
    const mfStart = dv.getUint32(60, true), nMf = dv.getUint32(64, true), difStart = dv.getUint32(68, true), nDif = dv.getUint32(72, true);
    const off = s => (s + 1) * ss;
    const difat = [];
    for (let i = 0; i < 109; i++) { const v = dv.getUint32(76 + i * 4, true); if (v < 0xFFFFFFFA) difat.push(v); }
    for (let d = difStart, k = 0; k < nDif && d < 0xFFFFFFFA; k++) {
      for (let i = 0; i < ss / 4 - 1; i++) { const v = dv.getUint32(off(d) + i * 4, true); if (v < 0xFFFFFFFA) difat.push(v); }
      d = dv.getUint32(off(d) + ss - 4, true);
    }
    const fat = [];
    for (const s of difat.slice(0, nFat)) for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(off(s) + i * 4, true));
    const chain = (s, f) => { const out = []; while (s < 0xFFFFFFFA) { if (out.length > f.length) throw new Error('한글 파일 구조가 손상되었습니다'); out.push(s); s = f[s]; } return out; };
    const readChain = s => { const c = chain(s, fat); const o = new Uint8Array(c.length * ss); c.forEach((x, i) => o.set(u8.subarray(off(x), off(x) + ss), i * ss)); return o; };
    const dir = readChain(dirStart); const ddv = new DataView(dir.buffer);
    const entries = [];
    for (let i = 0; i + 128 <= dir.length; i += 128) {
      const raw = dir.slice(i, i + 128); const nl = ddv.getUint16(i + 64, true);
      let name = ''; for (let k = 0; k < nl - 2 && k < 64; k += 2) { const c = raw[k] | (raw[k + 1] << 8); if (!c) break; name += String.fromCharCode(c); }
      entries.push({ raw, name, type: raw[66], left: ddv.getUint32(i + 68, true), right: ddv.getUint32(i + 72, true), child: ddv.getUint32(i + 76, true), start: ddv.getUint32(i + 116, true), size: ddv.getUint32(i + 120, true) });
    }
    let mf = [];
    if (nMf && mfStart < 0xFFFFFFFA) { const b = readChain(mfStart); const v = new DataView(b.buffer); for (let i = 0; i + 4 <= b.length; i += 4) mf.push(v.getUint32(i, true)); }
    const rootE = entries[0];
    const ms = rootE && rootE.start < 0xFFFFFFFA ? readChain(rootE.start) : new Uint8Array(0);
    for (const e of entries) {
      if (e.type !== 2) continue;
      if (e.size < cut) { const c = chain(e.start, mf); const o = new Uint8Array(c.length * mss); c.forEach((x, i) => o.set(ms.subarray(x * mss, x * mss + mss), i * mss)); e.data = o.slice(0, e.size); }
      else e.data = readChain(e.start).slice(0, e.size);
    }
    // 경로 이름(예: BodyText/Section0)
    const walk = (id, pre, depth) => {
      if (id === NOSTREAM || id >= entries.length || depth > 64) return;
      const e = entries[id]; walk(e.left, pre, depth + 1); walk(e.right, pre, depth + 1);
      e.path = pre + e.name; if (e.type === 1) walk(e.child, e.path + '/', depth + 1);
    };
    if (rootE) walk(rootE.child, '', 0);
    return entries;
  }
  function cfbWrite(entries) {
    const SS = 512, MSS = 64, CUT = 4096;
    const pad = (u8, n) => { const len = Math.ceil(u8.length / n) * n; if (len === u8.length) return u8; const o = new Uint8Array(len); o.set(u8); return o; };
    const minifat = [], mini = []; let miniSectors = 0;
    for (const e of entries) {
      if (e.type !== 2) continue;
      e.outSize = e.data.length;
      if (!e.data.length) { e.outStart = ENDCHAIN; continue; }
      if (e.data.length < CUT) {
        const n = Math.ceil(e.data.length / MSS); e.outStart = miniSectors;
        for (let i = 0; i < n; i++) minifat.push(i < n - 1 ? miniSectors + i + 1 : ENDCHAIN);
        miniSectors += n; mini.push(pad(e.data, MSS)); e.isMini = true;
      }
    }
    const sectors = [], fat = []; let count = 0;
    const alloc = u8 => {
      if (!u8.length) return ENDCHAIN;
      const n = Math.ceil(u8.length / SS), start = count;
      for (let i = 0; i < n; i++) fat[start + i] = i < n - 1 ? start + i + 1 : ENDCHAIN;
      sectors.push(pad(u8, SS)); count += n; return start;
    };
    for (const e of entries) if (e.type === 2 && e.data.length && !e.isMini) e.outStart = alloc(e.data);
    const msLen = mini.reduce((a, b) => a + b.length, 0); const msBuf = new Uint8Array(msLen); { let p = 0; for (const m of mini) { msBuf.set(m, p); p += m.length; } }
    const rootE = entries[0]; rootE.outStart = alloc(msBuf); rootE.outSize = msLen;
    let mfStart = ENDCHAIN, nMf = 0;
    if (minifat.length) {
      const b = new Uint8Array(Math.ceil(minifat.length * 4 / SS) * SS).fill(0xFF); const v = new DataView(b.buffer);
      minifat.forEach((x, i) => v.setUint32(i * 4, x, true)); mfStart = alloc(b); nMf = b.length / SS;
    }
    const dirBuf = new Uint8Array(Math.ceil(entries.length * 128 / SS) * SS);
    for (let i = 0; i < dirBuf.length / 128; i++) {
      const e = entries[i]; const v = new DataView(dirBuf.buffer, i * 128, 128);
      if (!e) { v.setUint32(68, NOSTREAM, true); v.setUint32(72, NOSTREAM, true); v.setUint32(76, NOSTREAM, true); continue; }
      dirBuf.set(e.raw, i * 128);
      if (e.type === 2 || e.type === 5) { v.setUint32(116, e.outStart === undefined ? ENDCHAIN : e.outStart, true); v.setUint32(120, e.outSize || 0, true); v.setUint32(124, 0, true); }
    }
    const dirStart = alloc(dirBuf);
    let nf = 1; while (nf * (SS / 4) < count + nf) nf++;
    if (nf > 109) throw new Error('파일이 너무 커서 처리할 수 없습니다');
    const fatStart = count;
    for (let i = 0; i < nf; i++) fat[fatStart + i] = FATSECT;
    const fatBuf = new Uint8Array(nf * SS).fill(0xFF); const fv = new DataView(fatBuf.buffer);
    for (let i = 0; i < count + nf; i++) fv.setUint32(i * 4, fat[i] === undefined ? FREESECT : fat[i], true);
    const head = new Uint8Array(SS); const hv = new DataView(head.buffer);
    hv.setUint32(0, 0xE011CFD0, true); hv.setUint32(4, 0xE11AB1A1, true);
    hv.setUint16(24, 0x3E, true); hv.setUint16(26, 3, true); hv.setUint16(28, 0xFFFE, true); hv.setUint16(30, 9, true); hv.setUint16(32, 6, true);
    hv.setUint32(44, nf, true); hv.setUint32(48, dirStart, true); hv.setUint32(56, CUT, true);
    hv.setUint32(60, mfStart, true); hv.setUint32(64, nMf, true); hv.setUint32(68, ENDCHAIN, true); hv.setUint32(72, 0, true);
    for (let i = 0; i < 109; i++) hv.setUint32(76 + i * 4, i < nf ? fatStart + i : FREESECT, true);
    return new Blob([head, ...sectors, fatBuf]);
  }

  // ---------- HWP 본문(레코드) ----------
  const T_PARA = 66, T_TEXT = 67, T_CSHAPE = 68, T_LSEG = 69, T_RANGE = 70, T_CTRL = 71, T_LIST = 72;
  function parseRecords(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const recs = []; let p = 0;
    while (p + 4 <= u8.length) {
      const h = dv.getUint32(p, true); p += 4;
      let size = h >>> 20; if (size === 0xFFF) { size = dv.getUint32(p, true); p += 4; }
      recs.push({ tag: h & 0x3FF, level: (h >>> 10) & 0x3FF, data: u8.slice(p, p + size) }); p += size;
    }
    return recs;
  }
  function serRecords(recs) {
    const list = []; for (const r of recs) { if (!r.drop) list.push(r); if (r.after) list.push(...r.after); }
    let total = 0; for (const r of list) total += 4 + (r.data.length >= 0xFFF ? 4 : 0) + r.data.length;
    const out = new Uint8Array(total), dv = new DataView(out.buffer); let p = 0;
    for (const r of list) {
      const big = r.data.length >= 0xFFF;
      dv.setUint32(p, (r.tag & 0x3FF) | ((r.level & 0x3FF) << 10) | ((big ? 0xFFF : r.data.length) << 20) >>> 0, true); p += 4;
      if (big) { dv.setUint32(p, r.data.length, true); p += 4; }
      out.set(r.data, p); p += r.data.length;
    }
    return out;
  }
  // 글자 1칸짜리 조판 부호: 0 10 13 24~31, 나머지(1~9, 11~12, 14~23)는 8칸짜리 개체
  const ONE = c => c === 0 || c === 10 || c === 13 || (c >= 24 && c <= 31);
  function hwpText(d) {
    let s = '', ctrl = false;
    for (let i = 0; i + 1 < d.length;) {
      const c = d[i] | (d[i + 1] << 8);
      if (c < 32) { if (ONE(c)) { if (c === 10 || c === 30 || c === 31) s += ' '; i += 2; } else { ctrl = true; i += 16; } }
      else { s += String.fromCharCode(c); i += 2; }
    }
    return { s, ctrl };
  }
  function paraKids(recs, pi) {
    const L = recs[pi].level, out = {};
    for (let k = pi + 1; k < recs.length && recs[k].level > L; k++) {
      const r = recs[k]; if (r.level !== L + 1) continue;
      if (r.tag === T_TEXT) out.text = r; else if (r.tag === T_CSHAPE) out.cs = r; else if (r.tag === T_LSEG) out.ls = r; else if (r.tag === T_RANGE) out.rt = r;
    }
    return out;
  }
  function setParaText(recs, pi, text, shape) {
    const ph = recs[pi], k = paraKids(recs, pi);
    if (k.text && hwpText(k.text.data).ctrl) return false;
    const n = text.length + 1;
    const dv = new DataView(ph.data.buffer, ph.data.byteOffset, ph.data.byteLength);
    dv.setUint32(0, ((dv.getUint32(0, true) & 0x80000000) | n) >>> 0, true);
    if (text) {
      const u = new Uint8Array(n * 2);
      for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); u[i * 2] = c & 255; u[i * 2 + 1] = c >> 8; }
      u[(n - 1) * 2] = 13;
      if (k.text) k.text.data = u; else ph.after = [{ tag: T_TEXT, level: ph.level + 1, data: u }];
    } else if (k.text) k.text.drop = true;
    if (k.cs) {
      if (k.cs.data.length > 8) k.cs.data = k.cs.data.slice(0, 8);
      if (shape != null) new DataView(k.cs.data.buffer, k.cs.data.byteOffset, 8).setUint32(4, shape, true); // 빈 칸에 숨은 글자 모양 대신 표 본문 모양
      dv.setUint16(12, k.cs.data.length / 8, true);
    }
    if (k.ls) { if (k.ls.data.length > 36) k.ls.data = k.ls.data.slice(0, 36); dv.setUint16(16, k.ls.data.length / 36, true); }
    if (k.rt) { k.rt.drop = true; dv.setUint16(14, 0, true); }
    return true;
  }
  // 맺음말·동의서 줄: '지원자 :          (서명)'의 공백에 이름(서명은 비움), '20   년   월   일'에 오늘 날짜
  const signRun = (n, name) => ' ' + name + ' '.repeat(Math.max(1, n - 1 - 2 * name.length));
  function lineRules(profile, map) {
    const rules = [];
    const one = (field, re, make) => ({ find: vis => { const m = re.exec(vis); return m ? { field, ...make(m) } : null; } });
    if (profile.name) rules.push(one('서명란 이름', /((?:지원자|신청인|동의인|작성자|서약자)\s*(?:성명)?\s*[:：])( {2,})/, m => ({ from: m.index + m[1].length, to: m.index + m[0].length, text: signRun(m[2].length, profile.name) })));
    const d = new Date();
    rules.push(one('작성 날짜', /20 *년 +월 +일/, m => ({ from: m.index, to: m.index + m[0].length, text: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일` })));
    // 줄글형 양식: '성명 : ______', '주   소 :          ' — 콜론 앞 글자를 칸 이름으로 읽어 밑줄·공백 자리에 내 정보
    rules.push({ find: vis => {
      const re = /([가-힣A-Za-z][가-힣A-Za-z()\- ]{0,16}?)\s*[:：]([ 　]*_{3,}|[ 　]{4,})/g; let m;
      while ((m = re.exec(vis))) {
        const words = m[1].trim().split(/\s+/); let f = null;
        for (let k = 1; !f && k <= Math.min(words.length, 4); k++) { const cand = words.slice(-k).join(' '); f = taught(map, cand) || matchScalar(cand); }
        if (!f || f.key === 'name' && /지원자|신청인|동의인|작성자|서약자/.test(m[1])) continue;
        let v = valueOf(f, profile);
        if (f.key === 'address1' && v && profile.address2) v += ' ' + profile.address2;
        if (!v) continue;
        const run = m[2], from = m.index + m[0].length - run.length;
        return { field: f.label, from, to: m.index + m[0].length, text: /_/.test(run) ? ` ${v} ` : ' ' + v + ' '.repeat(Math.max(1, run.length - 1 - 2 * v.length)) };
      }
      return null;
    } });
    return rules;
  }
  function hwpLines(recs, rules) {
    const done = new Set();
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i]; if (r.tag !== T_TEXT) continue;
      for (const rule of rules) for (let rep = 0; rep < 12; rep++) {
        const units = []; for (let k = 0; k + 1 < r.data.length; k += 2) units.push(r.data[k] | (r.data[k + 1] << 8));
        let vis = ''; const map = [];
        for (let k = 0; k < units.length;) { const c = units[k]; if (c < 32) { k += ONE(c) ? 1 : 8; vis += '\u0001'; map.push(-1); continue; } vis += String.fromCharCode(c); map.push(k); k++; }
        const e = rule.find(vis); if (!e) break;
        const start = map[e.from], n = e.to - e.from;
        let ok = start >= 0; for (let q = 0; ok && q < n; q++) if (map[e.from + q] !== start + q) ok = false;
        if (!ok) break;
        let pi = i - 1; while (pi >= 0 && !(recs[pi].tag === T_PARA && recs[pi].level === r.level - 1)) pi--;
        if (pi < 0) break;
        const delta = e.text.length - n;
        const out = units.slice(0, start).concat([...e.text].map(ch => ch.charCodeAt(0)), units.slice(start + n));
        const u8 = new Uint8Array(out.length * 2); out.forEach((c, k) => { u8[k * 2] = c & 255; u8[k * 2 + 1] = c >> 8; });
        r.data = u8;
        // 문단 머리 글자 수와 글자 모양·줄 배치·범위 태그 위치를 바뀐 길이만큼 옮김
        const hv = new DataView(recs[pi].data.buffer, recs[pi].data.byteOffset, recs[pi].data.byteLength);
        hv.setUint32(0, ((hv.getUint32(0, true) & 0x80000000) | out.length) >>> 0, true);
        const k2 = paraKids(recs, pi);
        const shift = (rec, size, offs) => { if (!rec) return; const dv = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength); for (let o = 0; o + size <= rec.data.length; o += size) for (const f of offs) { const v = dv.getUint32(o + f, true); if (v > start) dv.setUint32(o + f, Math.max(start, v + delta), true); } };
        shift(k2.cs, 8, [0]); shift(k2.ls, 36, [0]); shift(k2.rt, 12, [0, 4]);
        done.add(e.field);
      }
    }
    return [...done];
  }
  function xmlLines(doc, rules) {
    const done = new Set();
    for (const t of desc(doc, 't')) for (const rule of rules) for (let rep = 0; rep < 12; rep++) {
      const e = rule.find(t.textContent); if (!e) break;
      const s0 = t.textContent;
      t.textContent = s0.slice(0, e.from) + e.text + s0.slice(e.to);
      if (t.namespaceURI && /wordprocessingml/.test(t.namespaceURI)) t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      done.add(e.field);
    }
    return [...done];
  }
  function hwpTables(recs) {
    const tables = [], ctxTexts = [];
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r.tag === T_TEXT && r.level === 1) { const t = hwpText(r.data).s.trim(); if (t) { ctxTexts.push(t); if (ctxTexts.length > 3) ctxTexts.shift(); } }
      if (r.tag !== T_CTRL || r.data.length < 4) continue;
      const id = new DataView(r.data.buffer, r.data.byteOffset, 4).getUint32(0, true);
      if (String.fromCharCode(id >>> 24, (id >>> 16) & 255, (id >>> 8) & 255, id & 255) !== 'tbl ') continue;
      const L = r.level, cells = [];
      let j = i + 1;
      while (j < recs.length && recs[j].level > L) {
        const x = recs[j];
        if (x.tag === T_LIST && x.level === L + 1 && x.data.length >= 16) {
          const v = new DataView(x.data.buffer, x.data.byteOffset, x.data.byteLength);
          const c = { col: v.getUint16(8, true), row: v.getUint16(10, true), colSpan: v.getUint16(12, true) || 1, rowSpan: v.getUint16(14, true) || 1, paras: [], text: '', ctrl: false };
          let k = j + 1; const texts = [];
          while (k < recs.length && recs[k].level > L && !(recs[k].level === L + 1 && recs[k].tag === T_LIST)) {
            const y = recs[k];
            if (y.tag === T_PARA && y.level === L + 1) c.paras.push(k);
            if (y.tag === T_TEXT && y.level === L + 2) { const t = hwpText(y.data); texts.push(t.s); if (t.ctrl) c.ctrl = true; }
            if (y.tag === T_CSHAPE && y.level === L + 2 && c.shape == null && y.data.length >= 8) c.shape = new DataView(y.data.buffer, y.data.byteOffset, 8).getUint32(4, true);
            if (y.tag === T_CTRL && y.level === L + 2) c.ctrl = true; // 칸 안의 그림·표 등
            k++;
          }
          c.text = texts.join(' ');
          cells.push(c); j = k; continue;
        }
        j++;
      }
      // 표 본문 글자 모양: 글자가 있는 칸에서 가장 많이 쓰인 모양(빈 칸에는 제목용 굵은 모양이 숨어 있기도 함)
      const freq = {}; for (const c of cells) if (c.text.trim() && c.shape != null) freq[c.shape] = (freq[c.shape] || 0) + 1;
      const body = Object.keys(freq).length ? +Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0] : null;
      tables.push({
        cells, ctx: ctxTexts.join(' '),
        write(c, text) {
          if (!c.paras.length || !setParaText(recs, c.paras[0], text, c.blank ? body : null)) return false;
          for (const pi of c.paras.slice(1)) setParaText(recs, pi, ''); // 둘째 문단의 안내 글자 지움
          return true;
        },
      });
    }
    return tables;
  }

  // ---------- XML 도우미 ----------
  const kids = (el, local) => el ? [...el.children].filter(c => c.localName === local) : [];
  const desc = (el, local) => [...el.getElementsByTagNameNS('*', local)];
  const attr = (el, local) => { if (!el) return null; for (const a of el.attributes) if (a.localName === local) return a.value; return null; };
  const mk = (ref, local) => ref.ownerDocument.createElementNS(ref.namespaceURI, (ref.prefix ? ref.prefix + ':' : '') + local);
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';

  // 형식별 차이: 표·줄·칸 이름, 칸 병합 정보, 글 넣는 방법
  const FMT = {
    docx: {
      parts: /^word\/(document|header\d*|footer\d*)\.xml$/,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      cells(tbl) {
        const out = [];
        kids(tbl, 'tr').forEach((tr, r) => {
          const gb = kids(kids(tr, 'trPr')[0], 'gridBefore')[0];
          let col = gb ? (+attr(gb, 'val') || 0) : 0;
          for (const tc of kids(tr, 'tc')) {
            const pr = kids(tc, 'tcPr')[0]; const g = kids(pr, 'gridSpan')[0]; const vm = kids(pr, 'vMerge')[0];
            const colSpan = g ? (+attr(g, 'val') || 1) : 1;
            out.push({ el: tc, row: r, col, colSpan, rowSpan: 1, cont: !!vm && attr(vm, 'val') !== 'restart' ? 'up' : null, ctrl: desc(tc, 'drawing').length > 0 || desc(tc, 'pict').length > 0 || kids(tc, 'tbl').length > 0 });
            col += colSpan;
          }
        });
        return out;
      },
      write(c, text) {
        const tc = c.el; let p = kids(tc, 'p')[0];
        if (!p) { p = mk(tc, 'p'); tc.appendChild(p); }
        desc(tc, 't').forEach(t => { t.textContent = ''; }); // 밑줄(____)·(만  ) 같은 안내 글자 지움
        const runs = kids(p, 'r');
        const srcPr = (runs.map(r => kids(r, 'rPr')[0]).find(Boolean)) || kids(kids(p, 'pPr')[0], 'rPr')[0];
        const r = mk(p, 'r');
        if (srcPr) { const rp = mk(p, 'rPr'); [...srcPr.children].forEach(ch => { if (!/^(ins|del|moveFrom|moveTo|rPrChange)$/.test(ch.localName)) rp.appendChild(ch.cloneNode(true)); }); r.appendChild(rp); }
        const t = mk(p, 't'); t.setAttributeNS(XML_NS, 'xml:space', 'preserve'); t.textContent = text; r.appendChild(t);
        p.appendChild(r);
        return true;
      },
      context(tbl) { return prevText(tbl, 'p'); },
      // 사진 칸: 칸 너비에 맞춰 3:4 그림(최대 3cm×4cm)
      photo(c, ex) {
        const tc = c.el; const w = +(attr(kids(kids(tc, 'tcPr')[0], 'tcW')[0], 'w') || 1700);
        const cx = Math.min(1080000, Math.max(540000, (w - 160) * 635)), cy = Math.round(cx * 4 / 3);
        desc(tc, 't').forEach(t => { t.textContent = ''; });
        let p = kids(tc, 'p')[0]; if (!p) { p = mk(tc, 'p'); tc.appendChild(p); }
        const frag = new DOMParser().parseFromString(docxPicRun(ex.rid, cx, cy, 4000 + (ex.n++)), 'application/xml').documentElement;
        p.appendChild(tc.ownerDocument.importNode(frag, true));
        ex.used = true; return true;
      },
    },
    pptx: {
      parts: /^ppt\/slides\/slide\d+\.xml$/,
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      cells(tbl) {
        const out = [];
        kids(tbl, 'tr').forEach((tr, r) => {
          kids(tr, 'tc').forEach((tc, col) => {
            const cont = tc.getAttribute('hMerge') === '1' ? 'left' : tc.getAttribute('vMerge') === '1' ? 'up' : null;
            out.push({ el: tc, row: r, col, colSpan: +(tc.getAttribute('gridSpan') || 1), rowSpan: +(tc.getAttribute('rowSpan') || 1), cont });
          });
        });
        return out;
      },
      write(c, text, label) {
        const tc = c.el; let body = kids(tc, 'txBody')[0];
        if (!body) { body = mk(tc, 'txBody'); body.appendChild(mk(tc, 'bodyPr')); body.appendChild(mk(tc, 'p')); tc.insertBefore(body, tc.firstChild); }
        let p = kids(body, 'p')[0]; if (!p) { p = mk(body, 'p'); body.appendChild(p); }
        desc(tc, 't').forEach(t => { t.textContent = ''; });
        const end = kids(p, 'endParaRPr')[0];
        const src = end || (label && label.el && desc(label.el, 'rPr')[0]);
        const r = mk(p, 'r');
        const rp = mk(p, 'rPr');
        if (src) { for (const a of src.attributes) rp.setAttribute(a.name, a.value); [...src.children].forEach(ch => rp.appendChild(ch.cloneNode(true))); }
        if (!rp.getAttribute('lang')) rp.setAttribute('lang', 'ko-KR');
        rp.removeAttribute('dirty');
        r.appendChild(rp);
        const t = mk(p, 't'); t.textContent = text; r.appendChild(t);
        p.insertBefore(r, end || null);
        return true;
      },
      context() { return ''; },
    },
    hwpx: {
      parts: /^Contents\/section\d+\.xml$/i,
      mime: 'application/hwp+zip',
      cells(tbl) {
        const out = [];
        kids(tbl, 'tr').forEach((tr, r) => {
          kids(tr, 'tc').forEach((tc, i) => {
            const a = kids(tc, 'cellAddr')[0], s = kids(tc, 'cellSpan')[0];
            const sub = kids(tc, 'subList')[0];
            out.push({ el: tc, row: a ? +attr(a, 'rowAddr') : r, col: a ? +attr(a, 'colAddr') : i, colSpan: +(attr(s, 'colSpan') || 1), rowSpan: +(attr(s, 'rowSpan') || 1), cont: null, ctrl: !!sub && ['tbl', 'pic', 'rect', 'container', 'ole', 'equation'].some(n => desc(sub, n).length) });
          });
        });
        return out;
      },
      write(c, text, label) {
        const tc = c.el; const sub = kids(tc, 'subList')[0] || tc;
        desc(sub, 't').forEach(t => { t.textContent = ''; });
        let p = kids(sub, 'p')[0]; if (!p) { p = mk(sub, 'p'); ['id', 'paraPrIDRef', 'styleIDRef'].forEach(a => p.setAttribute(a, '0')); sub.appendChild(p); }
        let run = kids(p, 'run')[0];
        if (!run) {
          run = mk(p, 'run');
          const lr = label && label.el && desc(label.el, 'run')[0];
          run.setAttribute('charPrIDRef', (lr && lr.getAttribute('charPrIDRef')) || '0');
          p.insertBefore(run, p.firstChild);
        }
        if (c.blank && c.body) run.setAttribute('charPrIDRef', c.body); // 빈 칸에 숨은 글자 모양 대신 표 본문 모양
        let t = kids(run, 't')[0]; if (!t) { t = mk(run, 't'); run.appendChild(t); }
        t.textContent = text;
        kids(sub, 'p').forEach(x => kids(x, 'linesegarray').forEach(y => y.remove())); // 줄 배치 정보는 한글이 다시 계산
        return true;
      },
      context(tbl) { const p = tbl.closest ? tbl.closest('p') : null; return prevText(p || tbl, 'p'); },
    },
  };
  function prevText(el, local) {
    let s = ''; let n = el && el.previousElementSibling; let k = 0;
    while (n && k < 3) { if (n.localName === local) { const t = desc(n, 't').map(x => x.textContent).join(''); if (t.trim()) { s = t + ' ' + s; k++; } } n = n.previousElementSibling; }
    return s;
  }
  function xmlTables(doc, F, ex) {
    return desc(doc, 'tbl').map(tbl => {
      const cells = F.cells(tbl);
      cells.forEach(c => { c.text = desc(c.el, 't').map(x => x.textContent).join(''); });
      if (F === FMT.hwpx) {
        const freq = {};
        for (const c of cells) for (const r of desc(c.el, 'run')) if (desc(r, 't').some(t => t.textContent.trim())) { const id = r.getAttribute('charPrIDRef'); freq[id] = (freq[id] || 0) + 1; }
        const body = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        if (body) cells.forEach(c => { c.body = body[0]; });
      }
      return { cells, ctx: F.context(tbl), write: (c, v, label) => F.write(c, v, label), photo: F.photo && ex ? c => F.photo(c, ex) : null };
    });
  }

  // ---------- 증명사진 ----------
  const PHOTO_RE = /^\(?(증명|반명함)?사진\)?[\dx×.cm()\/]*$/;
  const dataUrlBytes = u => { const m = /^data:image\/jpeg;base64,(.+)$/.exec(u || ''); if (!m) return null; const b = atob(m[1]); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
  const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  // Word 그림 한 개(인라인). cx·cy: EMU
  const docxPicRun = (rid, cx, cy, id) => `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="${NS_WP}" xmlns:r="${NS_R}"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="증명사진"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="photo.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

  // ---------- 표 하나를 격자로 ----------
  function buildGrid(cells) {
    const grid = [];
    const put = (r, c, cell) => { (grid[r] = grid[r] || [])[c] = cell; };
    for (const c of cells) {
      c.blank = /^[\s_ .]*$/.test(c.text);
      c.seal = /^\(인\)$/.test(c.text.trim());
      c.ph = !c.blank && isPlaceholder(c.text);
      c.empty = !c.ctrl && (c.blank || c.ph);
      if (c.cont) continue;
      for (let r = c.row; r < c.row + c.rowSpan; r++) for (let k = c.col; k < c.col + c.colSpan; k++) put(r, k, c);
    }
    for (const c of cells) if (c.cont) {
      const origin = c.cont === 'up' ? (grid[c.row - 1] || [])[c.col] : (grid[c.row] || [])[c.col - 1];
      c.covered = true;
      if (origin) for (let k = c.col; k < c.col + c.colSpan; k++) if (!(grid[c.row] || [])[k]) put(c.row, k, origin);
    }
    const live = cells.filter(c => !c.covered).sort((a, b) => a.row - b.row || a.col - b.col);
    return { cells: live, grid, nRows: grid.length };
  }
  const at = (g, r, c) => (g.grid[r] || [])[c];

  // ---------- 값 만들기 ----------
  const fmtDate = (v, type) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v || ''); if (!m) return v || ''; return m[3] && type !== 'month' ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`; };
  function valueOf(f, src) {
    if (f.type === 'period') { const a = fmtDate(src[f.from]), b = fmtDate(src[f.to]); return a || b ? `${a} ~ ${b}`.trim() : ''; }
    if (f.type === 'duration') {
      const a = Date.parse(src.start), b = Date.parse(src.end); if (!a || !b || b < a) return '';
      const m = Math.round((b - a) / 86400000 / 30.44); return `${Math.floor(m / 12)}년 ${m % 12}월`;
    }
    const v = src[f.key]; if (v == null || v === '') return '';
    if (f.type === 'date' || f.type === 'month') return fmtDate(String(v), f.type);
    return String(v);
  }
  function age(birth) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth || ''); if (!m) return null;
    const d = new Date(); let a = d.getFullYear() - +m[1];
    if (d.getMonth() + 1 < +m[2] || (d.getMonth() + 1 === +m[2] && d.getDate() < +m[3])) a--;
    return a;
  }
  function matchScalar(text) {
    const d = norm(text); if (!d || d.length > MAX_LABEL) return null;
    let best = null, bs = 0;
    for (const f of SCALAR_FIELDS) { const s = scoreField(f, d); if (s > bs) { bs = s; best = f; } }
    return best;
  }
  const PERIOD_RE = /^(기간|재학기간|학업기간|근무기간|재직기간|경력기간|교육기간|이수기간|활동기간|수상기간|연수기간|기간\(년월\)|기간\(년월일\))$/;
  function matchListHeader(L, text) {
    const d = norm(text); if (!d || d.length > MAX_LABEL) return null;
    let best = null, bs = 0;
    for (const f of L.fields) { const s = scoreField(f, d); if (s > bs) { bs = s; best = f; } }
    // '학과/(세부전공)'처럼 괄호 속 보충 설명이 제외 단어에 걸리면 괄호를 빼고 다시 봄
    const d2 = d.replace(/[/]?\([^)]*\)/g, '');
    if (!best && d2 && d2 !== d) for (const f of L.fields) { const s = scoreField(f, d2); if (s > bs) { bs = s; best = f; } }
    if (!best && L.key === 'career' && /^(근무|재직|근속|경력)(년수|연수|개월수)$/.test(d)) best = { key: 'duration', label: '근무년수', type: 'duration' };
    if (!best && PERIOD_RE.test(d)) {
      best = L.fields.find(f => f.type === 'period') || (L.fields.some(f => f.key === 'start') && L.fields.some(f => f.key === 'end') ? { key: 'period', label: '기간', type: 'period', from: 'start', to: 'end' } : null);
    }
    return best;
  }
  // 학력 줄 이름(학사·석사·박사 등)과 맞는 학력 고르기
  const DEGREE_ROWS = [
    [/고등|고교/, it => /고등/.test(it.level || '')],
    [/전문/, it => /전문/.test(it.level || '') || it.degree === '전문학사'],
    [/석사/, it => /석사/.test(it.level || '') || it.degree === '석사'],
    [/박사/, it => /박사/.test(it.level || '') || it.degree === '박사'],
    [/학사|대학교|대졸/, it => it.level === '대학교' || it.degree === '학사'],
  ];

  // 양식에 미리 적힌 이름과 내 정보 항목 맞추기: 띄어쓰기·괄호 무시, 별칭(컴활=컴퓨터활용능력), 급수 비교
  const NAMEKEY = { certificates: 'name', languages: 'test', awards: 'name', trainings: 'name' };
  const cn = s => String(s || '').toLowerCase().replace(/[\s()\[\]·.\-_/,]/g, '');
  const gradeOf = s => { const m = /([1-9])\s*급|\bN([1-5])\b|level\s*([1-9])/i.exec(s || ''); return m ? (m[1] || m[2] || m[3]) : ''; };
  function canon(s) {
    const t = cn(String(s || '').replace(/(심화|기본)?\s*[1-9]\s*급|\bN[1-5]\b|level\s*[1-9]/gi, '')); if (!t) return '';
    const AL = root.PUBFILL_ALIAS || [];
    for (const [off, alts] of AL) if (cn(off) === t || alts.some(a => cn(a) === t)) return cn(off);
    for (const [off, alts] of AL) if ([off, ...alts].some(a => cn(a).length >= 3 && t.includes(cn(a)))) return cn(off);
    return t;
  }
  function sameItem(written, it, key) {
    const name = it[key]; if (!name || canon(written) !== canon(name)) return false;
    const ga = gradeOf(written), gb = gradeOf(name) || gradeOf(it.grade);
    return !ga || !gb || ga === gb;
  }

  // ---------- 표 목록 채우기(형식 공통) ----------
  // map: 사용자가 알려 준 연결 { 칸 이름(공백 무시): 내 정보 항목 열쇠 } — 자동 판단보다 먼저 씀
  const taught = (map, text) => { const k = map && map[norm(text)]; return k ? SCALAR_FIELDS.find(x => x.key === k) || null : null; };
  function fillTables(tables, profile, map) {
    const filled = [], unknown = [], missing = [], left = [], preview = [];
    const grids = tables.map(T => ({ T, g: buildGrid(T.cells) }));
    const hasAddr2 = grids.some(({ g }) => g.cells.some(c => { const f = matchScalar(c.text); return f && f.key === 'address2'; }));
    for (const { T, g } of grids) {
      const ctx = T.ctx || '';
      const skipTable = SKIP_CTX.test(norm(ctx));
      // 1) 여러 줄 항목(학력·자격증·경력 등): 칸 이름이 2개 이상 한 줄에 있고 그 아래가 빈 줄
      for (let r = 0; r < g.nRows; r++) {
        const row = [...new Set((g.grid[r] || []).filter(Boolean))].filter(c => c.row === r && !c.empty && !c.used).sort((a, b) => a.col - b.col);
        if (row.length < 2) continue;
        const rowHead = at(g, r, 0);
        const hint = norm(ctx + ' ' + (rowHead ? rowHead.text : '') + ' ' + row.map(c => c.text).join(' '));
        if (SKIP_CTX.test(hint)) continue;
        let best = null;
        for (const L of LISTS) {
          const cols = [];
          for (const c of row) { const f = matchListHeader(L, c.text); if (f) cols.push({ c, field: f }); }
          // 같은 칸 이름이 다시 나오면 옆 묶음(예: 자격증 표가 좌우 두 묶음)
          const groups = []; let cur = [];
          for (const x of cols) { if (cur.some(y => y.field.key === x.field.key)) { groups.push(cur); cur = []; } cur.push(x); }
          if (cur.length) groups.push(cur);
          const useful = groups.filter(gr => gr.length >= 2);
          if (!useful.length) continue;
          const sec = L.section.some(s => hint.includes(norm(s))) ? 1.5 : 0;
          const score = useful[0].length + sec;
          if (!best || score > best.score) best = { L, groups: useful, score };
        }
        if (!best) continue;
        const pool = (profile[best.L.key] || []).filter(it => it && Object.keys(it).length);
        const nk = NAMEKEY[best.L.key];
        // 빈 줄(또는 이름만 미리 적힌 줄) 모으기
        const slots = [];
        for (let rr = r + 1; rr < g.nRows; rr++) {
          const rowCells = best.groups.map(gr => gr.map(x => at(g, rr, x.c.col)));
          const states = rowCells.map((cs, gi) => {
            if (!cs.every(c => c && c.row === rr && !c.used) || new Set(cs).size !== cs.length) return null;
            if (cs.every(c => c.empty)) return { named: null };
            const ni = nk ? best.groups[gi].findIndex(x => x.field.key === nk) : -1;
            // 양식에 자격증 이름만 미리 적어 둔 줄: 그 자격증의 나머지 칸만 채움
            if (ni >= 0 && cs.length > 1 && cs.every((c, i) => i === ni || c.empty)) return { named: cs[ni].text.trim(), ni };
            return null;
          });
          if (!states.some(Boolean)) break;
          const head = at(g, rr, 0);
          const inGroups = rowCells.some(cs => cs.includes(head));
          const lab = head && !inGroups && !head.empty ? norm(head.text) : '';
          const degRow = best.L.key === 'education' && lab && DEGREE_ROWS.some(([re]) => re.test(lab));
          const deg = degRow ? DEGREE_ROWS.find(([re]) => re.test(lab)) : null;
          states.forEach((s, gi) => { if (s) slots.push({ ...s, gi, cs: rowCells[gi], deg, degRow }); });
        }
        // 이름이 적힌 줄 먼저 → 남은 빈 줄에 나머지를 차례로
        for (const s of slots) s.cs.forEach(c => { c.used = true; });
        for (const s of slots.filter(s => s.named)) {
          const i = pool.findIndex(it => sameItem(s.named, it, nk));
          if (i < 0) { missing.push(`${best.L.label} ${s.named}`); continue; }
          s.it = pool.splice(i, 1)[0];
        }
        for (const s of slots.filter(s => !s.named)) {
          if (s.deg) { const i = pool.findIndex(s.deg[1]); s.it = i >= 0 ? pool.splice(i, 1)[0] : null; }
          else if (!s.degRow) s.it = pool.shift();
        }
        for (const s of slots) {
          if (!s.it) continue;
          const gr = best.groups[s.gi];
          gr.forEach((x, i) => {
            if (i === s.ni) return;
            let v = valueOf(x.field, s.it);
            if (x.field.key === 'gpa' && v && s.it.gpaMax && !gr.some(y => y.field.key === 'gpaMax')) v += ' / ' + s.it.gpaMax;
            if (v && T.write(s.cs[i], v, x.c) !== false) { s.cs[i].out = v; filled.push({ list: best.L.label, field: x.field.label, row: s.cs[0] }); }
          });
        }
        if (nk && slots.length) for (const it of pool) if (it[nk]) left.push(`${best.L.label} ${it[nk]}`);
        if (slots.length) best.groups.forEach(gr => gr.forEach(x => { x.c.used = true; }));
      }
      // 1-b) 세로형 목록: '학교명 | __'처럼 칸 이름과 빈 칸이 한 줄씩 세로로 이어지는 학력·경력 표
      if (!skipTable) {
        const lineAt = rr => [...new Set((g.grid[rr] || []).filter(Boolean))].filter(c => c.row === rr && !c.used).sort((a, b) => a.col - b.col);
        const listLine = (rr, only) => {
          const cs = lineAt(rr);
          if (cs.length !== 2 || cs[0].empty || !cs[1].empty) return null;
          for (const L of LISTS) {
            if (only && L.key !== only) continue;
            const f = matchListHeader(L, cs[0].text);
            if (f) return { L, f, cs };
          }
          return null;
        };
        for (let r = 0; r < g.nRows; r++) {
          const first = listLine(r);
          if (!first || (r > 0 && listLine(r - 1))) continue;
          const seq = [];
          for (let rr = r; rr < g.nRows; rr++) {
            const x = listLine(rr, first.L.key);
            if (!x) break;
            seq.push(x);
          }
          if (seq.length < 2) continue;
          // 같은 칸 이름이 다시 나오면 다음 항목(사람)으로
          const blocks = [];
          for (const x of seq) {
            if (!blocks.length || blocks[blocks.length - 1].some(y => y.f.key === x.f.key)) blocks.push([]);
            blocks[blocks.length - 1].push(x);
          }
          const pool = (profile[first.L.key] || []).filter(it => it && Object.keys(it).length);
          blocks.forEach((bl, i) => {
            const it = pool[i];
            if (!it) return;
            for (const x of bl) {
              const v = valueOf(x.f, it);
              x.cs[0].used = true; x.cs[1].used = true;
              if (v && T.write(x.cs[1], v, x.cs[0]) !== false) {
                x.cs[1].out = v;
                filled.push({ list: first.L.label, field: x.f.label, row: x.cs[0] });
              }
            }
          });
        }
      }
      if (skipTable) continue;
      // 2) 한 칸 항목: 빈 칸의 왼쪽(없으면 위) 칸 이름으로 판단
      for (const c of g.cells) {
        if (!c.empty || c.used) continue;
        const rowHead = at(g, c.row, 0);
        if (rowHead && SKIP_CTX.test(norm(rowHead.text))) continue;
        let f = null, label = null;
        const left = c.col > 0 ? at(g, c.row, c.col - 1) : null;
        const up = c.row > 0 ? at(g, c.row - 1, c.col) : null;
        const down = at(g, c.row + c.rowSpan, c.col);
        const leftOk = left && left !== c && !left.empty && !left.used;
        const upOk = up && up !== c && !up.empty && !up.used && !(down && down !== c && down.empty);
        // '(인)'만 적힌 칸: 바로 왼쪽이 성명 칸 이름일 때만 이름 뒤에 붙여 씀(옆 빈 칸에 이미 쓴 이름을 또 쓰지 않게)
        if (c.seal && !(leftOk && /^(성명|이름|name|성함)$/.test(norm(left.text)))) continue;
        // 왼쪽 칸이 위에서부터 세로로 이어진 묶음 제목(예: 병역)이고 위 칸에 칸 이름이 있으면 위 칸으로 판단
        if (leftOk && !(left.row < c.row && upOk)) {
          label = left;
          const lf = taught(map, left.text) || matchScalar(left.text);
          const accept = (fc, other) => fc && (fc !== matchScalar(other.text) || QUAL.test(norm(left.text)) || lf);
          const combo = e => matchScalar(e.text + left.text) || matchScalar(left.text + e.text);
          const headRight = rowHead && at(g, c.row, rowHead.col + rowHead.colSpan);
          const groupHead = rowHead && rowHead !== left && rowHead !== c && !rowHead.empty && headRight && !headRight.empty;
          if (groupHead) { const fc = combo(rowHead); if (accept(fc, rowHead)) f = fc; }
          if (!f) f = lf;
          // '한글'·'영문'처럼 혼자로는 모르는 칸 이름이면 같은 줄 앞쪽 칸 이름과 합쳐 읽음
          for (let k = left.col - 1; !f && k >= 0; k--) {
            const e = at(g, c.row, k); if (!e || e === left || e.empty) continue;
            const fc = combo(e); if (accept(fc, e)) f = fc;
          }
          // '전화번호' 칸: 같은 표에 휴대폰 칸이 따로 있으면 자택전화, 없으면 휴대폰
          if (!f && /^(전화번호|전화|연락전화|tel|telephone)$/.test(norm(left.text))) {
            const hasMobile = g.cells.some(x => x !== left && /휴대|핸드폰|mobile|cell/.test(norm(x.text)));
            f = SCALAR_FIELDS.find(x => x.key === (hasMobile ? 'tel' : 'phone'));
          }
          // 'TOEIC | (점)'처럼 칸 이름이 어학 시험 이름이면 그 시험 점수
          if (!f) {
            const lt = norm(left.text);
            const lang = (profile.languages || []).find(x => x && x.test && x.score && norm(x.test) === lt);
            if (lang) {
              const v = c.ph && /점/.test(c.text) && /^\d+$/.test(lang.score) ? lang.score + '점' : lang.score;
              if (T.write(c, v, label) !== false) { c.used = true; c.out = v; filled.push({ list: '어학', field: '점수', row: c }); }
              continue;
            }
          }
          if (!f && norm(left.text).length <= MAX_LABEL) { unknown.push(left.text.trim()); c.unk = left.text.trim(); }
        } else if (upOk) { label = up; f = taught(map, up.text) || matchScalar(up.text); if (!f && norm(up.text).length <= MAX_LABEL) c.unk = up.text.trim(); }
        if (!f) continue;
        let v = valueOf(f, profile);
        if (f.key === 'address1' && v) {
          if (!hasAddr2 && profile.address2) v += ' ' + profile.address2;
          if (c.ph && /우편/.test(c.text) && profile.zip) v = `(${profile.zip}) ${v}`;
        }
        if (f.key === 'birth' && v && c.ph && /만/.test(c.text)) { const a = age(profile.birth); if (a != null) v += ` (만 ${a}세)`; }
        if (!v) continue;
        if (c.seal) v += ' (인)'; // 성명 칸에 '(인)'이 함께 적힌 양식은 이름 뒤에 그대로 둠
        if (T.write(c, v, label) === false) continue;
        c.used = true; c.out = v;
        filled.push({ field: f.label });
      }
    }
    // 증명사진 칸: '사진', '사진 3*4', '(증명사진)' 같은 칸
    for (const { T, g } of grids) for (const c of g.cells) {
      if (c.used || c.out != null || !PHOTO_RE.test(norm(c.text))) continue;
      if (!profile.photo) continue;
      if (T.photo && T.photo(c) !== false) { c.out = '[증명사진]'; c.used = true; filled.push({ field: '증명사진' }); }
      else missing.push('증명사진(이 양식 형식은 직접 넣기)');
    }
    // 미리보기: 채운 칸이 있는 표만, 칸 병합까지 같은 격자로(채운 칸 표시)
    for (const { g } of grids) {
      if (!g.cells.some(c => c.out != null)) continue;
      const cells = g.cells.map(c => {
        let rs = 0; while (at(g, c.row + rs, c.col) === c) rs++;
        return { r: c.row, c: c.col, cs: c.colSpan, rs: Math.max(rs, 1), t: c.out != null ? c.out : c.text.trim(), f: c.out != null, u: c.out == null && c.unk ? c.unk : undefined };
      });
      preview.push({ cols: Math.max(...cells.map(x => x.c + x.cs)), cells });
    }
    return { filled, unknown, missing, left, preview };
  }

  function serialize(doc, orig) {
    let s = new XMLSerializer().serializeToString(doc);
    const decl = /^\s*(<\?xml[^>]*\?>)(\r?\n)?/.exec(orig);
    if (decl && !/^<\?xml/.test(s)) s = decl[1] + (decl[2] || '') + s;
    return s;
  }

  // 한글 본문 압축은 끝에 여분 바이트가 붙는 경우가 있어, 풀린 데까지 받아 씀
  async function inflateLoose(u8) {
    const rd = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts = []; let n = 0;
    try { for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; } }
    catch (err) { if (!n) throw new Error('한글 본문 압축을 풀지 못했습니다'); }
    const out = new Uint8Array(n); let p = 0; for (const x of parts) { out.set(x, p); p += x.length; }
    return out;
  }
  async function fillHwp(buf, profile, map) {
    const entries = cfbRead(buf);
    const fh = entries.find(e => e.path === 'FileHeader');
    if (!fh || !/^HWP Document File/.test(new TextDecoder().decode(fh.data.subarray(0, 17)))) throw new Error('한글(.hwp) 문서가 아닙니다');
    const flags = new DataView(fh.data.buffer, fh.data.byteOffset, fh.data.byteLength).getUint32(36, true);
    if (flags & 2) throw new Error('암호가 걸린 한글 문서는 채울 수 없습니다. 한글에서 암호를 푼 뒤 넣어 주세요.');
    if (flags & 4) throw new Error('배포용 한글 문서는 고칠 수 없게 잠겨 있어 채울 수 없습니다.');
    const compressed = !!(flags & 1);
    const acc = newAcc();
    const sections = entries.filter(e => e.type === 2 && /^BodyText\/Section\d+$/.test(e.path || '')).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    for (const e of sections) {
      const raw = compressed ? await inflateLoose(e.data) : e.data;
      const recs = parseRecords(raw);
      const lines = hwpLines(recs, lineRules(profile, map));
      const r = fillTables(hwpTables(recs), profile, map);
      lines.forEach(f => r.filled.push({ field: f }));
      if (r.filled.length) { const out = serRecords(recs); e.data = compressed ? await through(out, new CompressionStream('deflate-raw')) : out; }
      addAcc(acc, r);
    }
    return { blob: cfbWrite(entries), ...acc };
  }

  const MSG = {
    doc: '옛 Word(.doc) 파일입니다. Word에서 "다른 이름으로 저장" → "Word 문서(.docx)"로 저장한 뒤 넣어 주세요.',
    ppt: '옛 PowerPoint(.ppt) 파일입니다. PowerPoint에서 ".pptx"로 저장한 뒤 넣어 주세요.',
  };
  const newAcc = () => ({ filled: [], unknown: [], missing: [], left: [], preview: [] });
  const addAcc = (a, r) => { for (const k of ['filled', 'unknown', 'missing', 'left', 'preview']) a[k].push(...(r[k] || [])); };
  const doneAcc = a => ({ ...a, unknown: [...new Set(a.unknown)], missing: [...new Set(a.missing)], left: [...new Set(a.left)] });
  async function fillFile(file, profile, opts) {
    const map = (opts && opts.map) || {};
    const kind = (((file.name || '').match(/\.([^.]+)$/) || [])[1] || '').toLowerCase();
    if (MSG[kind]) throw new Error(MSG[kind]);
    const outName = file.name.replace(/(\.[^.]+)$/, '_채움$1');
    if (kind === 'hwp') {
      const r = await fillHwp(await file.arrayBuffer(), profile || {}, map);
      return { ...doneAcc(r), blob: new Blob([r.blob], { type: 'application/x-hwp' }), name: outName };
    }
    const F = FMT[kind];
    if (!F) throw new Error('Word(.docx), PowerPoint(.pptx), 한글(.hwp · .hwpx) 파일만 채울 수 있습니다.');
    const entries = unzip(await file.arrayBuffer());
    const acc = newAcc();
    const photoBytes = kind === 'docx' && profile && dataUrlBytes(profile.photo);
    const ex = photoBytes ? { rid: 'rIdPubfillPhoto', n: 0, used: false } : null;
    for (const e of entries) {
      if (!F.parts.test(e.name)) continue;
      const xml = new TextDecoder().decode(await entryData(e));
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) continue;
      const lines = xmlLines(doc, lineRules(profile || {}, map));
      const r = fillTables(xmlTables(doc, F, e.name === 'word/document.xml' ? ex : null), profile || {}, map);
      lines.forEach(f => r.filled.push({ field: f }));
      if (r.filled.length) e.newData = new TextEncoder().encode(serialize(doc, xml));
      addAcc(acc, r);
    }
    if (ex && ex.used) {
      // 그림 파일 추가, 문서 관계·파일 형식 등록
      const now = entries[0] || { time: 0, date: 0 };
      entries.push({ name: 'word/media/pubfill_photo.jpeg', time: now.time, date: now.date, newData: photoBytes });
      const getText = async n => { const e = entries.find(x => x.name === n); return e ? { e, t: new TextDecoder().decode(e.newData || await entryData(e)) } : null; };
      const rels = await getText('word/_rels/document.xml.rels');
      const relLine = `<Relationship Id="${ex.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pubfill_photo.jpeg"/>`;
      if (rels) rels.e.newData = new TextEncoder().encode(rels.t.replace('</Relationships>', relLine + '</Relationships>'));
      else entries.push({ name: 'word/_rels/document.xml.rels', time: now.time, date: now.date, newData: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relLine}</Relationships>`) });
      const ct = await getText('[Content_Types].xml');
      if (ct && !/Extension="jpeg"/i.test(ct.t)) ct.e.newData = new TextEncoder().encode(ct.t.replace('<Default ', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default '));
    }
    const blob = await zip(entries);
    return { ...doneAcc(acc), blob: new Blob([blob], { type: F.mime }), name: outName };
  }
  // 채운 결과 요약(값은 넣지 않음): "성명(한글), 생년월일 … / 학력 2줄"
  function summary(filled) {
    const one = [...new Set(filled.filter(x => !x.list).map(x => x.field))];
    const rows = {}; filled.filter(x => x.list).forEach(x => { (rows[x.list] = rows[x.list] || new Set()).add(x.row); });
    const lists = {}; for (const k in rows) lists[k] = rows[k].size;
    return { one, lists };
  }

  // 새 zip 만들기(이력서 내보내기용): files = { 경로: 문자열 }
  async function makeZip(files) {
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const enc = new TextEncoder();
    return zip(Object.entries(files).map(([name, data]) => ({ name, time, date, newData: typeof data === 'string' ? enc.encode(data) : data })));
  }
  root.PubDoc = { fillFile, summary, makeZip, docxPicRun, dataUrlBytes, normLabel: norm, scalarFields: () => SCALAR_FIELDS.filter(f => !f.hidden), _cfbRead: cfbRead, _cfbWrite: cfbWrite };
})(typeof window !== 'undefined' ? window : globalThis);
