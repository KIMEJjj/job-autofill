const { SCALAR, LISTS } = window.PUBFILL_SCHEMA;
const formEl = document.getElementById('form');
const statusEl = document.getElementById('status');

function inputFor(f, value) {
  let el;
  if (f.type === 'select') {
    el = document.createElement('select');
    for (const c of f.choices) {
      const o = document.createElement('option');
      o.value = c; o.textContent = c || '(선택 안 함)';
      el.appendChild(o);
    }
  } else {
    el = document.createElement('input');
    el.type = f.type === 'date' ? 'date' : f.type === 'month' ? 'month' : f.type === 'email' ? 'email' : 'text';
    if (f.placeholder) el.placeholder = f.placeholder;
  }
  el.dataset.key = f.key;
  el.value = value || '';
  if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0; // 빈 선택지가 없는 목록(주민등록지)은 첫 선택지가 기본
  const lab = document.createElement('label');
  lab.append(f.label, el);
  // showWhen: [항목, 값] — 그 항목이 이 값일 때만 보임(주민등록지 '다른 주소')
  if (f.showWhen) lab.dataset.showWhen = f.showWhen.join('\u0001');
  return lab;
}

function listRow(list, item) {
  const row = document.createElement('div');
  row.className = 'row';
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const f of list.fields) if (!f.hidden) grid.appendChild(inputFor(f, item[f.key]));
  const del = document.createElement('button');
  del.className = 'small del'; del.textContent = '삭제';
  del.onclick = () => row.remove();
  row.append(grid, del);
  return row;
}

function render(profile) {
  formEl.innerHTML = '';
  for (const g of SCALAR) {
    const sec = document.createElement('section');
    sec.innerHTML = `<h2>${g.group}</h2>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const f of g.fields) if (!f.hidden) grid.appendChild(inputFor(f, profile[f.key]));
    // showWhen 칸: 기준 항목 값이 바뀔 때마다 보이기·숨기기
    const conds = [...grid.querySelectorAll('label[data-show-when]')];
    const sync = () => conds.forEach(l => { const [k, v] = l.dataset.showWhen.split('\u0001'); const src = grid.querySelector(`[data-key="${k}"]`); l.style.display = src && src.value === v ? '' : 'none'; });
    if (conds.length) { grid.addEventListener('change', sync); sync(); }
    sec.appendChild(grid);
    sec.dataset.scalar = '1';
    formEl.appendChild(sec);
  }
  formEl.appendChild(photoSection(profile.photo));
  for (const list of LISTS) {
    const sec = document.createElement('section');
    sec.dataset.list = list.key;
    const h = document.createElement('h2');
    h.textContent = list.label + ' (화면 위쪽 줄부터 순서대로 채웁니다)';
    const add = document.createElement('button');
    add.className = 'small'; add.textContent = '+ 추가';
    const rows = document.createElement('div');
    rows.className = 'rowsbox';
    add.onclick = () => rows.appendChild(listRow(list, {}));
    h.appendChild(add);
    sec.append(h, rows);
    if (list.key === 'certificates') {
      sec.insertBefore(makeDropZone(), rows);
      const st = document.createElement('p');
      st.id = 'ocrStatus'; st.className = 'note'; st.style.margin = '0 0 12px';
      sec.insertBefore(st, rows);
    }
    const items = profile[list.key] && profile[list.key].length ? profile[list.key] : [{}];
    for (const it of items) rows.appendChild(listRow(list, it));
    formEl.appendChild(sec);
  }
}

// 증명사진: 3:4로 잘라 450×600 JPEG로 줄여 내 정보에 함께 암호화 저장(숨은 칸 data-key="photo")
function photoSection(value) {
  const sec = document.createElement('section'); sec.dataset.scalar = '1';
  sec.innerHTML = `<h2>증명사진 <span class="note" style="font-weight:400;margin:0">이력서 내보내기·Word 양식 사진 칸에 넣습니다(한글 양식은 직접 넣기). 내 정보와 함께 암호화 저장</span></h2>
    <div style="display:flex;gap:14px;align-items:center"><div id="photoBox" style="width:90px;height:120px;border:1px dashed #b8c2d6;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#888;font-size:12px;overflow:hidden;background:#fafbff">사진 없음</div>
    <div><button type="button" class="small" id="photoPick">사진 고르기</button> <button type="button" class="small" id="photoDel">지우기</button><div class="note" style="margin:6px 0 0">가운데를 3:4로 잘라 씁니다. 고른 뒤 상단 저장을 눌러 주세요.</div></div></div>
    <input type="hidden" data-key="photo"><input type="file" id="photoFile" accept="image/*" hidden>`;
  const hid = sec.querySelector('[data-key="photo"]'), box = sec.querySelector('#photoBox'), file = sec.querySelector('#photoFile');
  // 사진 값은 이 화면이 만든 JPEG 데이터 주소 형식만 받음(백업 파일 등에서 온 다른 값은 버림)
  const show = v => {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v || '')) v = '';
    hid.value = v; box.textContent = '';
    if (!v) { box.textContent = '사진 없음'; return; }
    const img = document.createElement('img'); img.src = v; img.style.cssText = 'width:100%;height:100%;object-fit:cover'; box.appendChild(img);
  };
  show(value);
  sec.querySelector('#photoPick').onclick = () => file.click();
  sec.querySelector('#photoDel').onclick = () => show('');
  file.onchange = async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    const img = await createImageBitmap(f);
    const W = 450, H = 600, r = Math.min(img.width / 3, img.height / 4);
    const sw = r * 3, sh = r * 4, sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    show(c.toDataURL('image/jpeg', 0.9));
  };
  return sec;
}

// 저장. 지원 기록 기능은 사용자 결정(2026-11-20)으로 뺌: 예전 버전이 남긴 기록(applications)은 이 저장 때 함께 지워짐
async function saveProfile() {
  await PubVault.save(collect());
}

function collect() {
  const p = {};
  document.querySelectorAll('section[data-scalar] [data-key]').forEach(el => { if (el.value.trim()) p[el.dataset.key] = el.value.trim(); });
  document.querySelectorAll('section[data-list]').forEach(sec => {
    const items = [];
    sec.querySelectorAll('.row').forEach(row => {
      const it = {};
      row.querySelectorAll('[data-key]').forEach(el => { if (el.value.trim()) it[el.dataset.key] = el.value.trim(); });
      if (Object.keys(it).length) items.push(it);
    });
    p[sec.dataset.list] = items;
  });
  return p;
}

function flash(msg) { statusEl.textContent = msg; setTimeout(() => { statusEl.textContent = ''; }, 2500); }

const $ = id => document.getElementById(id);
let gateMode = null; // 'create' | 'unlock' | 'change'

function showGate(mode) {
  gateMode = mode;
  $('app').classList.add('hidden');
  $('gate').classList.remove('hidden');
  $('pass1').value = ''; $('pass2').value = ''; $('gateMsg').textContent = '';
  const two = mode !== 'unlock';
  $('pass2').classList.toggle('hidden', !two);
  $('gateTitle').textContent = mode === 'unlock' ? '잠금 해제' : mode === 'change' ? '새 잠금 암호 정하기' : '잠금 암호 정하기';
  $('gateDesc').textContent = mode === 'unlock'
    ? '내 정보는 암호화되어 있습니다. 잠금 암호를 입력해 주세요.'
    : '내 정보 전체를 이 암호로 암호화합니다. 8자 이상으로 정해 주세요. 잊어버리면 복구할 수 없습니다.';
  $('pass1').focus();
  $('gateKc').classList.add('hidden');
  if (mode === 'unlock' && window.chrome && chrome.runtime && chrome.runtime.sendNativeMessage) PubVault.keychainStatus().then(k => { if (k.ok && k.hasKey) $('gateKc').classList.remove('hidden'); });
}
$('gateKc').onclick = async () => {
  $('gateMsg').textContent = 'Touch ID 또는 Mac 암호를 확인해 주세요…';
  const r = await chrome.runtime.sendMessage({ type: 'keychainUnlock' });
  if (r && r.ok) return showApp();
  $('gateMsg').textContent = '키체인 잠금 해제 실패: ' + ((r && r.error) || '알 수 없음');
};
// 머리글 키체인 버튼: 저장 ↔ 해제
async function refreshKc() {
  const b = $('kcToggle');
  // 배포판(키체인 도우미 없음)에서는 버튼 자체를 숨김
  if (!(window.chrome && chrome.runtime && chrome.runtime.sendNativeMessage)) { b.style.display = 'none'; return; }
  const k = await PubVault.keychainStatus();
  if (!k.ok && k.missing) { b.textContent = '🔑 키체인 (도우미 미설치)'; b.disabled = true; b.title = 'pubfill/native/install.sh 를 실행해 도우미를 등록해 주세요'; return; }
  b.disabled = false;
  b.textContent = k.hasKey ? '🔑 키체인 사용 중 · 끄기' : '🔑 키체인에 저장';
  b.dataset.on = k.hasKey ? '1' : '';
}
$('kcToggle').onclick = async () => {
  const b = $('kcToggle');
  if (b.dataset.on) {
    if (!confirm('키체인에 보관한 잠금 열쇠를 지울까요? 다음부터는 잠금 암호를 입력해야 합니다.')) return;
    await PubVault.keychainForget(); flash('키체인에서 지웠습니다');
  } else {
    statusEl.textContent = 'Touch ID 또는 Mac 암호를 확인해 주세요…';
    const r = await PubVault.keychainSave();
    // 결과 문구는 사라지지 않게 그대로 둠
    statusEl.textContent = r.ok ? '키체인에 저장했습니다. 다음부터 Touch ID로 열 수 있습니다' : '키체인 저장 실패: ' + (r.error || '알 수 없음');
    statusEl.style.color = r.ok ? '#0a7a3c' : '#c0392b';
  }
  refreshKc();
};
async function showApp() {
  $('gate').classList.add('hidden');
  $('app').classList.remove('hidden');
  refreshKc();
  render(await PubVault.load());
}

$('gateBtn').onclick = async () => {
  const p1 = $('pass1').value, p2 = $('pass2').value;
  $('gateMsg').textContent = '';
  if (gateMode === 'unlock') {
    $('gateMsg').textContent = '확인 중...';
    if (await PubVault.unlock(p1)) return showApp();
    $('gateMsg').textContent = '잠금 암호가 맞지 않습니다.';
    return;
  }
  if (p1.length < 8) { $('gateMsg').textContent = '8자 이상으로 정해 주세요.'; return; }
  if (p1 !== p2) { $('gateMsg').textContent = '두 번 입력한 암호가 다릅니다.'; return; }
  $('gateMsg').textContent = '암호화하는 중...';
  if (gateMode === 'change') {
    await PubVault.changePass(p1);
    const k = await PubVault.keychainStatus();
    if (k.ok && k.hasKey) { $('gateMsg').textContent = '키체인 열쇠도 새로 저장합니다. Touch ID를 확인해 주세요…'; await PubVault.keychainSave(); }
  }
  else await PubVault.create(p1);
  showApp();
  flash(gateMode === 'change' ? '암호를 바꿨습니다' : '암호화했습니다');
};
['pass1', 'pass2'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('gateBtn').click(); }));

$('save').onclick = async () => {
  try { await saveProfile(); flash('암호화해 저장했습니다'); }
  catch { showGate('unlock'); }
};
$('lock').onclick = async () => { await PubVault.lock(); formEl.innerHTML = ''; showGate('unlock'); };
$('changePass').onclick = async () => { await saveProfile(); showGate('change'); };

$('export').onclick = async () => {
  await saveProfile();
  const v = await PubVault.exportVault();
  const blob = new Blob([JSON.stringify(v, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my_info_backup_encrypted.json';
  a.click();
  flash('암호화된 백업을 저장했습니다');
};

$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { flash('파일 형식이 맞지 않습니다'); return; }
  if (PubVault.isVault(data)) {
    if (!confirm('지금 저장된 정보를 이 백업으로 바꿉니다. 백업을 만들 때의 잠금 암호가 필요합니다. 계속할까요?')) return;
    await PubVault.importVault(data);
    formEl.innerHTML = '';
    showGate('unlock');
  } else {
    // 암호화 전 옛 백업: 화면에 불러온 뒤 저장하면 암호화됨
    render(data);
    flash('불러왔습니다. 저장을 누르면 암호화됩니다. 옛 백업 파일은 지워 주세요');
  }
};

// ── 자격증 사진 불러오기 (Mac 안에서 글자 인식, 외부 전송 없음) ──
function fillRow(row, values) {
  let n = 0;
  for (const [k, v] of Object.entries(values)) {
    if (!v) continue;
    const el = row.querySelector(`[data-key="${k}"]`);
    if (el && !el.value.trim()) { el.value = v; n++; }
  }
  if (n) { row.style.background = '#FFF8E1'; row.title = '사진에서 읽은 값 · 확인 필요'; }
  return n;
}
function placeItem(listKey, values, nameKey) {
  const list = LISTS.find(l => l.key === listKey);
  const box = document.querySelector(`section[data-list="${listKey}"] .rowsbox`);
  const rows = [...box.querySelectorAll('.row')];
  const want = PubOCR.canonOf(values[nameKey]);
  const val = (r, k) => (r.querySelector(`[data-key="${k}"]`) || {}).value || '';
  // 같은 자격증(번호가 비었거나 같음) → 빈 칸만 채움 / 완전히 빈 줄 → 사용 / 없으면 새 줄
  let row = rows.find(r => val(r, nameKey) && PubOCR.canonOf(val(r, nameKey)) === want && (!val(r, 'number') || !values.number || val(r, 'number') === values.number) && (!val(r, 'grade') || !values.grade || val(r, 'grade') === values.grade));
  if (!row) row = rows.find(r => [...r.querySelectorAll('[data-key]')].every(e => !e.value.trim()));
  if (!row) { row = listRow(list, {}); box.appendChild(row); }
  return fillRow(row, values);
}
document.body.insertAdjacentHTML('beforeend', '<input type="file" id="photoFile" accept="image/*" multiple hidden>');
document.getElementById('photoFile').onchange = async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) processPhotos(files);
};
// ── 이미지 올리기 상자: 끌어다 놓기 · 클릭 후 ⌘+V · 파일 선택 ──
function makeDropZone() {
  const z = document.createElement('div');
  z.id = 'dropZone'; z.className = 'drop'; z.tabIndex = 0;
  z.innerHTML = `<div class="drop-ic">🖼</div>
    <div class="drop-t">자격증 이미지 올리기</div>
    <div class="drop-s" id="dropHint">여기에 이미지를 끌어다 놓거나, 클릭 후 ⌘ + V로 붙여넣기</div>
    <button type="button" class="small" id="dropPick">파일 선택</button><span class="drop-m">여러 장 가능 · 한 장에 여러 자격증도 가능</span>
    <div class="drop-thumbs" id="dropThumbs"></div>`;
  const hint = () => z.querySelector('#dropHint');
  z.addEventListener('click', () => z.focus());
  z.addEventListener('focus', () => { hint().textContent = '지금 ⌘ + V를 누르면 붙여넣은 이미지를 읽습니다'; });
  z.addEventListener('blur', () => { hint().textContent = '여기에 이미지를 끌어다 놓거나, 클릭 후 ⌘ + V로 붙여넣기'; });
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); hint().textContent = '놓으면 읽기 시작'; });
  z.addEventListener('dragleave', () => { z.classList.remove('over'); hint().textContent = '여기에 이미지를 끌어다 놓거나, 클릭 후 ⌘ + V로 붙여넣기'; });
  z.addEventListener('drop', e => {
    e.preventDefault(); z.classList.remove('over'); hint().textContent = '여기에 이미지를 끌어다 놓거나, 클릭 후 ⌘ + V로 붙여넣기';
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length) processPhotos(files);
    else document.getElementById('ocrStatus').textContent = '이미지 파일(jpg, png 등)만 올릴 수 있습니다.';
  });
  z.querySelector('#dropPick').onclick = (e) => { e.stopPropagation(); document.getElementById('photoFile').click(); };
  return z;
}
// 붙여넣기: 상자가 선택돼 있거나 입력칸이 아닌 곳에서 이미지일 때만. 입력칸의 글자 붙여넣기는 그대로
document.addEventListener('paste', (e) => {
  if (document.getElementById('app').classList.contains('hidden')) return;
  const ae = document.activeElement;
  if (ae && ae.id !== 'dropZone' && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
  const imgs = [...(e.clipboardData && e.clipboardData.items || [])]
    .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i, n) => { const f = i.getAsFile(); return new File([f], `붙여넣은 이미지 ${n + 1}`, { type: f.type }); });
  if (!imgs.length) return;
  e.preventDefault();
  processPhotos(imgs);
});
function showThumbs(files) {
  const box = document.getElementById('dropThumbs');
  if (!box) return;
  box.innerHTML = '';
  for (const f of files) { const im = document.createElement('img'); im.src = URL.createObjectURL(f); im.alt = f.name; im.title = f.name; box.appendChild(im); }
}
async function processPhotos(files) {
  const st = document.getElementById('ocrStatus');
  showThumbs(files);
  document.getElementById('dropZone').classList.add('busy');
  st.textContent = '글자 인식 프로그램을 불러오는 중…';
  try {
    const res = await PubOCR.readImages(files, p => {
      if (p.file) st.textContent = `사진 읽는 중 ${p.file}/${p.total}…`;
      else if (p.stage && /loading/.test(p.stage)) st.textContent = '글자 인식 프로그램을 불러오는 중…';
    });
    let certs = 0, langs = 0; const empty = [], errs = [];
    for (const r of res) {
      if (r.error) { errs.push(r.file); continue; }
      if (!r.items.length) empty.push(r.file);
      for (const it of r.items) {
        if (it.type === 'lang') { placeItem('languages', { test: it.name, score: it.score || it.grade, date: it.date, number: it.number }, 'test'); langs++; }
        else { placeItem('certificates', { name: it.name, grade: it.grade, issuer: it.issuer, date: it.date, number: it.number }, 'name'); certs++; }
      }
    }
    let msg = `사진 ${files.length}장에서 자격증 ${certs}개, 어학 ${langs}개를 읽었습니다. 노란 줄을 확인하고 틀린 곳을 고친 뒤 저장을 눌러 주세요.`;
    if (empty.length) msg += ` 자격증을 찾지 못한 사진: ${empty.join(', ')}.`;
    if (errs.length) msg += ` 읽지 못한 사진: ${errs.join(', ')}.`;
    st.textContent = msg;
  } catch (err) {
    st.textContent = '사진을 읽지 못했습니다: ' + (err && err.message || err);
  }
  document.getElementById('dropZone').classList.remove('busy');
  // 읽기가 끝나면 미리보기는 지움 (결과는 아래 줄과 안내 문구로 확인)
  const tb = document.getElementById('dropThumbs');
  if (tb) { tb.querySelectorAll('img').forEach(im => URL.revokeObjectURL(im.src)); tb.innerHTML = ''; }
}

// ── 회사 양식 파일 채우기 (docfill.js, 크롬 안에서만 처리) ──
// 지금 화면에 보이는 내 정보(저장 전 고친 값 포함)로 채운 새 파일을 내려받습니다.
(() => {
  const z = $('docDrop'), pick = $('docFile'), st = $('docStatus');
  if (!z || !window.PubDoc) return;
  const HINT = '여기에 양식 파일을 끌어다 놓거나 파일 선택';
  $('docPick').onclick = e => { e.stopPropagation(); pick.click(); };
  z.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); } });
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); $('docHint').textContent = '놓으면 채우기 시작'; });
  z.addEventListener('dragleave', () => { z.classList.remove('over'); $('docHint').textContent = HINT; });
  z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('over'); $('docHint').textContent = HINT; run([...e.dataTransfer.files]); });
  pick.onchange = () => { const fs = [...pick.files]; pick.value = ''; run(fs); };
  const line = (cls, text) => { const d = document.createElement('div'); d.className = 'msg'; d.textContent = text; if (cls) d.style.color = cls; return d; };
  // 양식 칸 알려 주기: { 칸 이름(공백 무시): 내 정보 항목 열쇠 } — 값은 저장하지 않음(chrome.storage.local 'docMap')
  let docMap = {};
  const store = (() => { try { return chrome.storage.local; } catch { return null; } })();
  const mapReady = store ? store.get('docMap').then(o => { docMap = (o && o.docMap) || {}; }).catch(() => {}) : Promise.resolve();
  const saveMap = () => (store ? store.set({ docMap }).catch(() => {}) : Promise.resolve());
  const fieldName = k => { const f = PubDoc.scalarFields().find(x => x.key === k); return f ? f.label : k; };
  function renderMapList() {
    const box = $('docMapList'); if (!box) return;
    box.innerHTML = '';
    const ents = Object.entries(docMap);
    if (!ents.length) { box.textContent = '아직 알려 준 연결이 없습니다. 미리보기의 노란 점선 칸을 누르면 연결할 수 있습니다.'; return; }
    for (const [lab, key] of ents) {
      const row = document.createElement('div'); row.style.margin = '2px 0';
      const del = document.createElement('button'); del.className = 'small'; del.textContent = '지우기';
      del.onclick = async () => { delete docMap[lab]; await saveMap(); renderMapList(); };
      row.append(`"${lab}" 칸 → ${fieldName(key)}  `, del); box.appendChild(row);
    }
  }
  mapReady.then(renderMapList);
  // 노란 점선 칸을 누르면 내 정보 항목 고르기 → 연결 저장 → 그 파일 다시 채우기
  function askField(cellEl, label, redo) {
    if (cellEl.querySelector('select')) return;
    const sel = document.createElement('select');
    // 양식에서 읽은 칸 이름은 글자로만 넣음(화면 코드로 해석하지 않음)
    sel.appendChild(new Option(`"${label}" 칸에 넣을 항목 고르기`, ''));
    for (const f of PubDoc.scalarFields()) sel.appendChild(new Option(f.label, f.key));
    sel.onchange = async () => { if (!sel.value) return; docMap[PubDoc.normLabel(label)] = sel.value; await saveMap(); renderMapList(); redo(); };
    sel.onclick = e => e.stopPropagation();
    cellEl.textContent = ''; cellEl.appendChild(sel); sel.focus();
  }
  // 채운 결과 표 미리보기: 칸 병합까지 같은 격자로 그리고 새로 채운 칸은 초록색, 알아보지 못한 칸은 노란 점선
  function previewTable(t, redo) {
    const g = document.createElement('div'); g.className = 'pv';
    g.style.gridTemplateColumns = `repeat(${t.cols}, minmax(36px, auto))`;
    for (const c of t.cells) {
      const d = document.createElement('div');
      d.style.gridColumn = `${c.c + 1} / span ${c.cs}`; d.style.gridRow = `${c.r + 1} / span ${c.rs}`;
      d.textContent = c.t; if (c.f) d.className = 'f';
      if (c.u) { d.className = 'u'; d.title = `"${c.u}" 칸: 눌러서 넣을 내 정보 항목을 알려 주세요`; d.onclick = () => askField(d, c.u, redo); }
      g.appendChild(d);
    }
    const w = document.createElement('div'); w.className = 'pv-wrap'; w.appendChild(g); return w;
  }
  async function fillCard(f, card, profile) {
    card.innerHTML = '';
    try {
      await mapReady;
      const r = await PubDoc.fillFile(f, profile, { map: docMap });
      const s = PubDoc.summary(r.filled);
      const lists = Object.entries(s.lists).map(([k, n]) => `${k} ${n}줄`);
      if (!r.filled.length) { card.appendChild(line('#c0392b', `${f.name}: 채울 칸을 찾지 못했습니다. 표 안에 '성명', '생년월일' 같은 칸 이름과 빈 칸이 있는 양식만 채울 수 있습니다.`)); return; }
      const head = document.createElement('div'); head.className = 'head';
      const title = document.createElement('b'); title.textContent = r.name;
      const btn = document.createElement('button'); btn.className = 'primary'; btn.textContent = '내려받기';
      const url = URL.createObjectURL(r.blob);
      btn.onclick = () => { const a = document.createElement('a'); a.href = url; a.download = r.name; a.click(); btn.textContent = '다시 내려받기'; };
      head.append(title, btn); card.appendChild(head);
      card.appendChild(line('#0a7a3c', `채운 칸: ${[...s.one, ...lists].join(', ')}.`));
      if (r.missing.length) card.appendChild(line('#b26a00', `양식에 적혀 있지만 내 정보에 없는 항목(이름만 남김): ${r.missing.join(', ')}.`));
      if (r.left.length) card.appendChild(line('#b26a00', `표 칸이 모자라 넣지 못한 항목: ${r.left.join(', ')}. 넣고 싶은 것만 양식의 이름 칸에 미리 적어 두면 그 항목만 채웁니다.`));
      if (r.unknown.length) card.appendChild(line('#66707a', `알아보지 못한 칸 이름: ${r.unknown.slice(0, 12).join(', ')}. 미리보기의 노란 점선 칸을 누르면 넣을 항목을 알려 줄 수 있습니다(다음부터 자동).`));
      card.appendChild(line('#66707a', '아래는 칸 배치만 보여 주는 미리보기입니다(글꼴·칸 너비는 실제 문서와 다름). 확인 후 내려받기를 눌러 주세요. 사진·자기소개서는 파일에서 직접 채웁니다.'));
      const lg = document.createElement('div'); lg.className = 'pv-legend'; lg.innerHTML = '<i></i>새로 채운 칸 &nbsp; <i class="u"></i>알아보지 못한 칸(눌러서 알려 주기)'; card.appendChild(lg);
      const redo = () => fillCard(f, card, collect());
      r.preview.forEach(t => card.appendChild(previewTable(t, redo)));
    } catch (err) {
      card.appendChild(line('#c0392b', `${f.name}: ${err && err.message || err}`));
    }
  }
  async function run(files) {
    if (!files.length) return;
    st.innerHTML = '';
    z.classList.add('busy');
    const profile = collect();
    for (const f of files) {
      const card = document.createElement('div'); card.className = 'doc-card'; st.appendChild(card);
      await fillCard(f, card, profile);
    }
    z.classList.remove('busy');
  }
})();

// ── 내 이력서 내보내기 (resume.js, 크롬 안에서만 만듦) ──
(() => {
  if (!$('cvDocx') || !window.PubResume) return;
  const st = $('cvStatus');
  // 고른 결과: 뺀 구역·뺀 줄만 기억(새로 추가한 항목은 기본 포함). 크롬을 닫기 전까지만 기억(chrome.storage.session)
  const sel = { off: new Set(), offItems: new Set() };
  const ss = (() => { try { return chrome.storage.session; } catch { return null; } })();
  if (ss) ss.get('cvSel').then(o => { if (o && o.cvSel) { o.cvSel.off.forEach(x => sel.off.add(x)); o.cvSel.offItems.forEach(x => sel.offItems.add(x)); } }).catch(() => {});
  const keep = () => { if (ss) ss.set({ cvSel: { off: [...sel.off], offItems: [...sel.offItems] } }).catch(() => {}); };
  const box = (checked, text, onchange) => { const l = document.createElement('label'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = checked; c.onchange = () => onchange(c.checked); l.append(c, text); return l; };
  function openPick() {
    const list = $('cvList'); list.innerHTML = '';
    for (const s of PubResume.sections(collect())) {
      const sec = document.createElement('div'); sec.className = 'cv-sec';
      const items = document.createElement('div'); items.className = 'cv-items' + (sel.off.has(s.key) ? ' off' : '');
      sec.appendChild(box(!sel.off.has(s.key), `${s.title}${s.items ? ` (${s.items.filter(i => !sel.offItems.has(i.id)).length}/${s.items.length})` : ''}`, on => { on ? sel.off.delete(s.key) : sel.off.add(s.key); items.classList.toggle('off', !on); keep(); }));
      if (s.items && s.items.length > 1) {
        const head = sec.querySelector('label');
        const count = () => { head.lastChild.textContent = `${s.title} (${s.items.filter(i => !sel.offItems.has(i.id)).length}/${s.items.length})`; };
        for (const it of s.items) items.appendChild(box(!sel.offItems.has(it.id), it.label, on => { on ? sel.offItems.delete(it.id) : sel.offItems.add(it.id); count(); keep(); }));
        sec.appendChild(items);
      }
      list.appendChild(sec);
    }
    $('cvPick').classList.remove('hidden');
    $('cvPick').scrollIntoView({ block: 'nearest' });
  }
  const setAll = on => { const secs = PubResume.sections(collect()); sel.off.clear(); sel.offItems.clear(); if (!on) secs.forEach(s => s.items && s.items.length > 1 ? s.items.forEach(i => sel.offItems.add(i.id)) : sel.off.add(s.key)); keep(); openPick(); };
  $('cvAll').onclick = () => setAll(true);
  $('cvNone').onclick = () => setAll(false);
  $('cvClose').onclick = () => $('cvPick').classList.add('hidden');
  $('cvDocx').onclick = openPick;
  $('cvPdf').onclick = openPick;
  $('cvGoDocx').onclick = async () => {
    try {
      sel.lang = $('cvLang').value;
      const r = await PubResume.toDocx(collect(), sel);
      const a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = r.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      st.textContent = `${r.name} 를 내려받았습니다. Word·한글·Polaris Office에서 열어 사진과 서명을 넣어 주세요.`;
    } catch (err) { st.textContent = '만들지 못했습니다: ' + (err && err.message || err); }
  };
  $('cvGoPdf').onclick = () => { sel.lang = $('cvLang').value; PubResume.print(collect(), sel); st.textContent = '인쇄 창의 대상에서 "PDF로 저장"을 고르면 PDF 파일로 저장됩니다.'; };
})();

(async () => {
  const st = await PubVault.state();
  if (st === 'unlocked') showApp();
  else if (st === 'locked') showGate('unlock');
  else showGate('create'); // empty 또는 legacy(평문) → 암호 정하면 평문을 암호화해 옮기고 삭제
})();
