// 설정 화면: 칸 알려 주기로 저장한 연결 보기·지우기 (값은 없고 칸 모양 ↔ 항목 이름만 있음)
(function () {
  const { SCALAR, LISTS } = window.PUBFILL_SCHEMA;
  const box = document.getElementById('mapList');
  if (!box || !chrome.storage) return;
  const itemLabel = path => {
    if (path === '__skip__') return '건너뛰기 (채우지 않음)';
    const [a, b] = String(path).split('.');
    if (b) { const l = LISTS.find(x => x.key === a); const f = l && l.fields.find(x => x.key === b); return f ? l.label + ' · ' + f.label : path; }
    for (const g of SCALAR) { const f = g.fields.find(x => x.key === a); if (f) return f.label; }
    return path;
  };
  // 지문(JSON 배열)에서 사람이 알아볼 칸 설명만 뽑음
  const fieldLabel = fp => {
    try {
      const a = JSON.parse(fp); const inner = Array.isArray(a[0]) ? a[0] : a; const arr = typeof inner === 'string' && inner.startsWith('[') ? JSON.parse(inner) : inner;
      if (arr[0] === 'dropdown') return '목록 버튼: ' + (arr[1] || arr[2]);
      if (arr[0] === 'buttons') return '버튼 묶음: ' + (arr[2] || '') + ' (' + arr[1] + ')';
      const parts = arr.filter(x => typeof x === 'string' && x);
      return parts.slice(-3).join(' · ') || fp.slice(0, 60);
    } catch { return String(fp).slice(0, 60); }
  };
  const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  async function render() {
    const { fieldMappings = {} } = await chrome.storage.local.get('fieldMappings');
    box.textContent = '';
    const hosts = Object.keys(fieldMappings).filter(h => fieldMappings[h] && Object.keys(fieldMappings[h]).length);
    if (!hosts.length) { box.append(el('p', 'color:#66707a;font-size:13px', '아직 저장한 연결이 없습니다. 지원서 화면에서 팝업의 "칸 알려 주기"로 만들 수 있습니다.')); return; }
    for (const h of hosts) {
      const site = fieldMappings[h];
      const card = el('div', 'border:1px solid #dde1e6;border-radius:10px;padding:10px 12px;margin-bottom:10px;background:#fff');
      const head = el('div', 'display:flex;align-items:center;gap:8px;margin-bottom:6px');
      head.append(el('strong', 'flex:1;font-size:14px', h + ' (' + Object.keys(site).length + '개)'));
      const delAll = el('button', 'font-size:12px;padding:4px 8px', '이 사이트 연결 모두 지우기');
      delAll.onclick = async () => { if (!confirm(h + '의 연결을 모두 지울까요?')) return; const { fieldMappings: m = {} } = await chrome.storage.local.get('fieldMappings'); delete m[h]; await chrome.storage.local.set({ fieldMappings: m }); render(); };
      head.append(delAll); card.append(head);
      for (const [fp, item] of Object.entries(site)) {
        const row = el('div', 'display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0;border-top:1px solid #f0f2f4');
        row.append(el('span', 'flex:1;color:#444', fieldLabel(fp)), el('span', 'color:#1f5eff;font-weight:600', '→ ' + itemLabel(item)));
        const del = el('button', 'font-size:12px;padding:2px 8px', '지우기');
        del.onclick = async () => { const { fieldMappings: m = {} } = await chrome.storage.local.get('fieldMappings'); if (m[h]) { delete m[h][fp]; if (!Object.keys(m[h]).length) delete m[h]; } await chrome.storage.local.set({ fieldMappings: m }); render(); };
        row.append(del); card.append(row);
      }
      box.append(card);
    }
  }
  render();
  chrome.storage.onChanged.addListener(ch => { if (ch.fieldMappings) render(); });
})();
