// 백그라운드: 키체인 잠금 해제를 여기서 처리 (Touch ID 창이 뜨면 팝업이 닫혀도 끝까지 진행되도록)
importScripts('vault.js');
importScripts('schema.js');

const FIELD_PATHS = new Set([
  ...globalThis.PUBFILL_SCHEMA.SCALAR.flatMap(g => g.fields.map(f => f.key)),
  ...globalThis.PUBFILL_SCHEMA.LISTS.flatMap(l => l.fields.map(f => l.key + '.' + f.key))
]);

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg && msg.type === 'keychainUnlock') reply(await PubVault.keychainUnlock());
    else if (msg && msg.type === 'keychainStatus') reply(await PubVault.keychainStatus());
    else if (msg && msg.type === 'saveFieldMapping') {
      let page = null;
      try { page = new URL(sender.url || ''); } catch {}
      if (!page || !/^https?:$/.test(page.protocol)) {
        try { page = new URL((sender.tab && sender.tab.url) || ''); } catch { page = null; }
      }
      if (!page || !/^https?:$/.test(page.protocol) || page.host !== msg.host ||
          typeof msg.fingerprint !== 'string' || !msg.fingerprint || msg.fingerprint.length > 4000 ||
          typeof msg.item !== 'string' || !(FIELD_PATHS.has(msg.item) || msg.item === '__skip__' || msg.item === '__clear__')) {
        reply({ ok: false }); return;
      }
      const { fieldMappings = {} } = await chrome.storage.local.get('fieldMappings');
      const site = fieldMappings[msg.host] && typeof fieldMappings[msg.host] === 'object' ? fieldMappings[msg.host] : {};
      if (!Object.prototype.hasOwnProperty.call(site, msg.fingerprint) && Object.keys(site).length >= 500) {
        reply({ ok: false }); return;
      }
      const nextSite = { ...site };
      if (msg.item === '__clear__') delete nextSite[msg.fingerprint]; else nextSite[msg.fingerprint] = msg.item;
      await chrome.storage.local.set({ fieldMappings: { ...fieldMappings, [msg.host]: nextSite } });
      reply({ ok: true });
    }
    else if (msg && msg.type === 'reactSelect') {
      // 팝업(확장 페이지)에서 온 요청만 받음. 페이지 스크립트·콘텐츠 스크립트 요청은 거절
      if (sender.id !== chrome.runtime.id || sender.tab || !Number.isInteger(msg.tabId) || !Array.isArray(msg.targets)) { reply({ ok: false }); return; }
      reply(await reactSelectFill(msg.tabId, msg.targets.slice(0, 20)));
    }
    else reply({ ok: false, error: '알 수 없는 요청' });
  })().catch(() => reply({ ok: false, error: '요청 처리 실패' }));
  return true; // 비동기 응답
});

// React 선택 목록(Greenhouse 등) 고르기: 합성 이벤트로는 목록이 열리지 않아, 크롬 디버거로 실제 키 입력을 보냄.
// 붙어 있는 동안 크롬 위에 '디버깅 중' 띠가 뜨고, 끝나면 바로 뗌. 제출 버튼은 누르지 않음.
async function reactSelectFill(tabId, targets) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const t = { tabId };
  const cmd = (method, params = {}) => chrome.debugger.sendCommand(t, method, params);
  const ev = async expr => { const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r && r.result ? r.result.value : undefined; };
  const key = async (k, code, vk) => { await cmd('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  const done = [], failed = [];
  try { await chrome.debugger.attach(t, '1.3'); } catch (e) { return { ok: false, error: '디버거 연결 실패: ' + e.message }; }
  try {
    await cmd('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    for (const x of targets) {
      if (!x || typeof x.key !== 'string' || !/^rs\d+$/.test(x.key) || typeof x.value !== 'string') continue;
      const sel = JSON.stringify(`[data-pubfill-rs="${x.key}"]`);
      const words = [...new Set([x.value, ...(Array.isArray(x.alts) ? x.alts : [])].filter(w => typeof w === 'string' && w).slice(0, 6))];
      const wantJ = JSON.stringify(words.map(w => w.toLowerCase().replace(/\s+/g, '')));
      // 후보 고르기: 내 값(동의어)으로 시작 → 포함 → 내 값이 '비대상·없음' 같은 부정이면 '않음·아니·없음' 후보
      const pick = `(() => {
        const want = ${wantJ}; const n = s => (s || '').toLowerCase().replace(/\\s+/g, '');
        const neg = /^(비|미|무|불|해당없|아니|없|no$|n$)/.test(want[0]);
        const i = document.querySelector(${sel}); const lb = i && i.getAttribute('aria-controls') && document.getElementById(i.getAttribute('aria-controls'));
        const opts = [...(lb || document).querySelectorAll('[id*="-option-"], [role="option"]')].filter(o => !o.closest('.iti__country-list'));
        const t = o => n(o.textContent);
        const o = opts.find(o => want.some(w => t(o) === w)) || opts.find(o => want.some(w => t(o).startsWith(w))) || opts.find(o => want.some(w => w.length > 1 && t(o).includes(w)))
          || (neg ? (opts.find(o => /않|아니|없음|비해당|미해당/.test(t(o))) || opts.find(o => /^no\\b|notapplicable/.test(t(o)) && !/foreign/.test(t(o)))) : null);
        if (!o) return opts.length ? 'none' : 'empty'; o.click(); return 'ok';
      })()`;
      const focus = () => ev(`(() => { const i = document.querySelector(${sel}); if (!i) return false; i.scrollIntoView({ block: 'center' }); i.focus(); return document.activeElement === i; })()`);
      let ok = false;
      if (await focus()) {
        // 1) 목록을 열어 보이는 후보 중에서 고르기 (고정 목록)
        await key('ArrowDown', 'ArrowDown', 40); await sleep(500);
        ok = (await ev(pick)) === 'ok';
        // 2) 못 찾으면 글자를 입력해 후보를 불러온 뒤 고르기 (도시처럼 검색해야 나오는 목록)
        for (const w of ok ? [] : words) {
          await focus();
          await cmd('Input.insertText', { text: w });
          for (let k = 0; k < 24 && !ok; k++) { await sleep(250); const pr = await ev(pick); ok = pr === 'ok'; if (globalThis.__rsDebug) console.log('pick', w, k, pr, await ev(`(() => { const i = document.querySelector(${sel}); return i && (i.value + '|' + i.getAttribute('aria-expanded') + '|' + (document.activeElement === i)); })()`)); }
          if (ok) break;
          for (let k = 0; k < w.length; k++) await key('Backspace', 'Backspace', 8);
        }
        if (!ok) await key('Escape', 'Escape', 27);
      }
      const color = ok ? '#2e7d32' : '#f9a825';
      await ev(`(() => { const i = document.querySelector(${sel}); if (i) { i.removeAttribute('data-pubfill-rs'); const c = i.closest('[class*="control"]'); if (c) c.style.outline = '2px solid ${color}'; } })()`);
      (ok ? done : failed).push(x.value);
    }
  } finally { await chrome.debugger.detach(t).catch(() => {}); }
  return { ok: true, done: done.length, failed };
}
