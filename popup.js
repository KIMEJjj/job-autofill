const out = document.getElementById('out');

async function inject(tabId) {
  // 모든 프레임에 엔진 주입 (다른 주소의 프레임은 크롬이 막을 수 있음)
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['schema.js', 'alias.js', 'qnet.js', 'fill.js'] });
}
async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }

const passEl = document.getElementById('pass');
const unlockBox = document.getElementById('unlockBox');

const kcBtn = document.getElementById('kcUnlock');
let kcReady = false;
(async () => {
  const st = await PubVault.state();
  if (st === 'locked') {
    unlockBox.style.display = 'block';
    const ks = (chrome.runtime.sendNativeMessage ? await PubVault.keychainStatus() : { ok: false });
    kcReady = !!(ks.ok && ks.hasKey);
    if (kcReady) { kcBtn.style.display = 'block'; out.textContent = 'Touch ID(또는 Mac 암호)로 잠금을 풀거나, 잠금 암호를 입력해 주세요.'; }
    else { out.textContent = '잠금 암호를 입력하고 채우기를 눌러 주세요.'; passEl.focus(); }
  }
  else if (st !== 'unlocked') out.textContent = '먼저 "내 정보 설정"에서 잠금 암호를 정하고 정보를 저장해 주세요.';
})();
// 키체인 잠금 해제는 백그라운드에서 처리 (Touch ID 창 때문에 팝업이 닫혀도 완료됨)
kcBtn.onclick = async () => {
  out.textContent = 'Touch ID 또는 Mac 암호를 확인해 주세요… (이 창이 닫히면 확인 후 다시 열어 주세요)';
  const r = await chrome.runtime.sendMessage({ type: 'keychainUnlock' });
  if (r && r.ok) { unlockBox.style.display = 'none'; kcBtn.style.display = 'none'; out.textContent = '잠금이 풀렸습니다. 이 페이지 채우기를 눌러 주세요.'; }
  else out.textContent = '키체인 잠금 해제 실패: ' + ((r && r.error) || '알 수 없음');
};
passEl.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('fill').click(); });

document.getElementById('fill').onclick = async () => {
  try {
    const st = await PubVault.state();
    if (st === 'empty' || st === 'legacy') { out.textContent = '먼저 "내 정보 설정"에서 잠금 암호를 정하고 정보를 저장해 주세요.'; return; }
    if (st === 'locked' && !passEl.value && kcReady) { kcBtn.click(); return; }
    if (st === 'locked') {
      out.textContent = '잠금 해제 중...';
      if (!(await PubVault.unlock(passEl.value))) { out.textContent = '잠금 암호가 맞지 않습니다.'; return; }
      passEl.value = ''; unlockBox.style.display = 'none';
    }
    out.textContent = '채우는 중...';
    const profile = await PubVault.load();
    if (!profile || !Object.keys(profile).length) { out.textContent = '먼저 "내 정보 설정"에서 정보를 저장해 주세요.'; return; }
    // 페이지에 보낼 정보: 지원 기록은 채우기에 필요 없어 뺌
    const pageProfile = { ...profile }; delete pageProfile.applications;
    const { fieldMappings = {} } = await chrome.storage.local.get('fieldMappings');
    const tab = await activeTab();
    await inject(tab.id);
    const overwrite = document.getElementById('overwrite').checked;
    let res = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (p, o) => (window.__pubFill ? window.__pubFill(p, o) : null),
      args: [pageProfile, { overwrite, fieldMappings }],
    });
    if (res.some(r => r.result && r.result.addressSearchOpenRequested)) {
      await new Promise(r => setTimeout(r, 300));
      await inject(tab.id);
      const addressOnlyProfile = { address1: profile.address1, zip: profile.zip, address2: profile.address2 };
      const addressResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: p => (window.__pubFill ? window.__pubFill(p, { addressOnly: true }) : null),
        args: [addressOnlyProfile],
      });
      res = [...res, ...addressResults];
      if (!res.some(r => r.result && r.result.addressSearchDone)) {
        const pending = res.find(r => r.result && r.result.addressSearchOpenRequested);
        if (pending) {
          pending.result.addrSearch = true;
          pending.result.check = (pending.result.check || 0) + 1;
          pending.result.addressSearchReason = '우편번호 탭을 눌렀지만 검색칸이 열리지 않았습니다.';
        }
      }
    }
    let filled = 0, check = 0; const missing = new Set(), nochoice = new Set();
    let addrSearch = false, addressSearchDone = false, schoolSearch = false, addressSearchReason = '';
    for (const r of res) if (r.result) { filled += r.result.filled; if (r.result.addrSearch) addrSearch = true; if (r.result.addressSearchDone) addressSearchDone = true; if (r.result.addressSearchReason) addressSearchReason = r.result.addressSearchReason; if (r.result.schoolSearch) schoolSearch = true; (r.result.missing || []).forEach(m => missing.add(m)); (r.result.nochoice || []).forEach(m => nochoice.add(m)); }
    // 선택 버튼을 고르면 새 칸이 나타나는 사이트를 위해 잠시 뒤 빈 칸만 한 번 더 채움
    let lastRes = res;
    if (filled) {
      await new Promise(r => setTimeout(r, 700));
      const res2 = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: (p, m, addressDone) => (window.__pubFill ? window.__pubFill(p, { overwrite: false, keepMarks: true, fieldMappings: m, skipKliAddress: true, kliAddressHandled: true, fillKliAddressDetail: addressDone }) : null), args: [pageProfile, fieldMappings, addressSearchDone] });
      for (const r of res2) if (r.result) { filled += r.result.filled; check += r.result.check; }
      lastRes = res2;
    } else for (const r of res) if (r.result) check += r.result.check;
    // React 선택 목록(Greenhouse 등): 마지막 채우기에서 표시한 칸을 백그라운드가 크롬 디버거로 고름 (최상위 화면만)
    const rsTargets = ((lastRes.find(r => r.frameId === 0) || {}).result || {}).rsTargets || [];
    let rsMsg = '';
    if (rsTargets.length) {
      out.textContent = '선택 목록 고르는 중... (크롬 위 "디버깅 중" 안내는 끝나면 사라집니다)';
      const rr = await chrome.runtime.sendMessage({ type: 'reactSelect', tabId: tab.id, targets: rsTargets });
      if (rr && rr.ok) { filled += rr.done; check += rr.failed.length; if (rr.failed.length) rsMsg = `\n\n목록에서 못 고른 값(노란 테두리):\n${rr.failed.join(', ')}`; }
      else { check += rsTargets.length; rsMsg = `\n\n선택 목록 ${rsTargets.length}칸은 직접 골라 주세요.` + (rr && rr.error ? ` (${rr.error})` : ''); }
    }
    let msg = `채운 칸: ${filled}개\n직접 확인할 빈 칸: ${check}개`;
    msg += rsMsg;
    // 증명사진 첨부(1·2차 채우기 합): 사이트에서 미리보기·자르기 창이 뜨면 직접 확인
    const photos = [...res, ...(lastRes !== res ? lastRes : [])].reduce((n, r) => n + ((r.result && r.result.photo) || 0), 0);
    if (photos) msg += `\n\n증명사진 ${photos}곳 첨부(사진이 맞게 올라갔는지 확인해 주세요)`;
    if (missing.size) msg += `\n\n내 정보에 비어 있어 건너뛴 항목:\n${[...missing].join(', ')}`;
    if (nochoice.size) msg += `\n\n선택지를 못 찾은 항목:\n${[...nochoice].join(', ')}`;
    if (schoolSearch) msg += `\n\n학교명은 검색 칸에 넣고 검색까지 했습니다. 검색 결과에서 학교를 클릭해 주세요.`;
    // 주소는 사이트의 검색 창에서 골라야 하는 경우: 내 주소를 클립보드에 복사
    if (addrSearch && !addressSearchDone && profile.address1) {
      if (addressSearchReason) msg += `\n\n자동 검색 상태: ${addressSearchReason}`;
      try { await navigator.clipboard.writeText(profile.address1); msg += `\n\n주소 검색이 자동으로 끝나지 않았습니다. 우편번호/주소 검색 창을 열고 검색 칸에 ⌘+V 한 뒤, 맞는 결과를 직접 골라 주세요. 주소는 클립보드에 복사해 두었습니다.`; }
      catch { msg += `\n\n주소는 사이트의 '우편번호 검색'에서 직접 골라 주세요.`; }
    }
    // 지원 기록 자동 추가: 채운 칸이 있을 때, 같은 날 같은 페이지는 한 번만(내 정보와 함께 암호화 저장)
    try {
      if (filled > 0 && /^https?:/.test(tab.url || '')) {
        const u = new URL(tab.url), host = u.hostname, seg = u.pathname.split('/').filter(Boolean);
        const company = /greetinghr\.com$|ninehire\.site$/.test(host) ? host.split('.')[0] : /greenhouse\.io$|lever\.co$|ashbyhq\.com$/.test(host) ? (seg[0] || host) : host.replace(/^www\./, '');
        const how = `웹 채우기: ${host}${u.pathname}`.slice(0, 120);
        const d = new Date(), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        let recs = []; try { recs = JSON.parse(profile.applications || '[]'); } catch {}
        if (!recs.some(x => x.date === date && x.how === how)) {
          recs.unshift({ date, company, position: (tab.title || '').slice(0, 80), how, status: '지원함' });
          await PubVault.save({ ...profile, applications: JSON.stringify(recs) });
          msg += '\n\n지원 기록에 추가했습니다(내 정보 설정 > 지원 기록).';
        }
      }
    } catch (e) { /* 기록 실패는 채우기 결과에 영향 없음 */ }
    out.textContent = msg;
  } catch (e) {
    out.textContent = '이 페이지에서는 실행할 수 없습니다.\n(' + e.message + ')';
  }
};

document.getElementById('teach').onclick = async () => {
  try {
    const tab = await activeTab();
    await inject(tab.id);
    const { fieldMappings = {} } = await chrome.storage.local.get('fieldMappings');
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (m) => (window.__pubTeachStart ? window.__pubTeachStart(m) : { ok: false }),
      args: [fieldMappings]
    });
    const started = res.some(r => r.result && r.result.ok);
    out.textContent = started
      ? '지원서 화면의 파란 테두리 칸을 눌러 넣을 항목을 고르세요.\n여러 칸을 이어서 알려 줄 수 있고, Esc로 마칩니다.\n이 팝업은 닫아도 됩니다.'
      : '이 화면에서 알려 줄 수 있는 칸을 찾지 못했습니다.';
  } catch (e) {
    out.textContent = '이 페이지에서는 실행할 수 없습니다.\n(' + e.message + ')';
  }
};

document.getElementById('scan').onclick = async () => {
  try {
    const tab = await activeTab();
    await inject(tab.id);
    const res = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => (window.__pubScan ? window.__pubScan() : []) });
    const rows = res.flatMap(r => r.result || []);
    const text = `페이지: ${new URL(tab.url).host} · 확장 ${chrome.runtime.getManifest().version}\n` + rows.map(r => [r.인식, r.구역 || '', r.종류, r.name, r.칸설명].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
    out.textContent = `칸 ${rows.length}개의 구조를 복사했습니다.\n입력값은 포함하지 않습니다.`;
  } catch (e) {
    out.textContent = '복사하지 못했습니다.\n(' + e.message + ')';
  }
};

document.getElementById('opts').onclick = () => chrome.runtime.openOptionsPage();

// 동의 항목 모두 체크: 이 버튼을 누를 때만, 지금 화면의 동의 체크박스·'동의함' 버튼을 체크
document.getElementById('agree').onclick = async () => {
  try {
    const tab = await activeTab();
    await inject(tab.id);
    const res = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => (window.__pubAgreeAll ? window.__pubAgreeAll() : null) });
    let c = 0, a = 0, d = 0;
    for (const r of res) if (r.result) { c += r.result.checked; a += r.result.already; d += r.result.disabled; }
    out.textContent = `동의 체크: ${c}개` + (a ? ` (이미 체크됨 ${a}개)` : '') + (d ? `\n잠겨 있어 못 누른 항목 ${d}개: 약관을 끝까지 내리거나 '내용 확인'을 누른 뒤 다시 눌러 주세요.` : '') + (c + a === 0 && !d ? '\n이 화면에서 동의 항목을 찾지 못했습니다.' : '');
  } catch (e) { out.textContent = '이 페이지에서는 실행할 수 없습니다.\n(' + e.message + ')'; }
};
