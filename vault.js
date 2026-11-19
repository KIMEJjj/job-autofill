// 내 정보 암호화 저장소.
// - 잠금 암호 → PBKDF2(SHA-256, 60만 회) → AES-256-GCM 키
// - 디스크(chrome.storage.local)에는 암호문(vault)만 저장. 잠금 암호는 어디에도 저장하지 않음
// - 잠금을 풀면 키를 chrome.storage.session(메모리, 크롬 종료 시 삭제)에만 보관
(function (root) {
  const ITER = 600000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  // 큰 데이터(증명사진 포함)도 되도록 나눠서 변환(한 번에 펼치면 약 20만 바이트부터 실패). 결과 형식은 같음
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function encryptWith(key, salt, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function decryptWith(key, vault) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.ct));
    return JSON.parse(dec.decode(pt));
  }
  async function sessionKey() {
    const { vaultKey } = await chrome.storage.session.get('vaultKey');
    if (!vaultKey) return null;
    return crypto.subtle.importKey('raw', unb64(vaultKey), 'AES-GCM', true, ['encrypt', 'decrypt']);
  }
  async function keepKey(key) {
    const raw = await crypto.subtle.exportKey('raw', key);
    await chrome.storage.session.set({ vaultKey: b64(raw) });
  }

  const Vault = {
    isVault: v => !!(v && v.ct && v.iv && v.salt),
    async state() {
      const { vault, profile } = await chrome.storage.local.get(['vault', 'profile']);
      if (!vault) return profile ? 'legacy' : 'empty';
      return (await sessionKey()) ? 'unlocked' : 'locked';
    },
    // 처음 잠금 암호 정하기 (평문으로 남아 있던 옛 정보가 있으면 암호화해 옮기고 평문 삭제)
    async create(pass, initial) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(pass, salt);
      const { profile } = await chrome.storage.local.get('profile');
      const vault = await encryptWith(key, salt, initial || profile || {});
      await chrome.storage.local.set({ vault });
      await chrome.storage.local.remove('profile');
      await keepKey(key);
    },
    async unlock(pass) {
      const { vault } = await chrome.storage.local.get('vault');
      const key = await deriveKey(pass, unb64(vault.salt));
      try { await decryptWith(key, vault); } catch { return false; } // 암호가 틀리면 GCM 검증 실패
      await keepKey(key);
      return true;
    },
    async lock() { await chrome.storage.session.remove('vaultKey'); },
    async load() {
      const key = await sessionKey();
      if (!key) throw new Error('locked');
      const { vault } = await chrome.storage.local.get('vault');
      return decryptWith(key, vault);
    },
    async save(obj) {
      const key = await sessionKey();
      if (!key) throw new Error('locked');
      const { vault } = await chrome.storage.local.get('vault');
      await chrome.storage.local.set({ vault: await encryptWith(key, unb64(vault.salt), obj) });
    },
    async changePass(newPass) {
      const data = await this.load();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(newPass, salt);
      await chrome.storage.local.set({ vault: await encryptWith(key, salt, data) });
      await keepKey(key);
    },
    async exportVault() { const { vault } = await chrome.storage.local.get('vault'); return vault; },
    async importVault(v) { await chrome.storage.local.set({ vault: v }); await chrome.storage.local.remove('profile'); await this.lock(); },
  };
  // ── Mac 키체인 (도우미 프로그램 com.pubfill.keychain 을 통해, 꺼낼 때 Touch ID 또는 Mac 암호 확인) ──
  const HOST = 'com.pubfill.keychain';
  const native = msg => new Promise(res => {
    try {
      chrome.runtime.sendNativeMessage(HOST, msg, r => {
        if (chrome.runtime.lastError) res({ ok: false, error: chrome.runtime.lastError.message, missing: /not found|specified native messaging host/i.test(chrome.runtime.lastError.message) });
        else res(r || { ok: false, error: '응답 없음' });
      });
    } catch (e) { res({ ok: false, error: String(e && e.message || e), missing: true }); }
  });
  Vault.keychainStatus = () => native({ cmd: 'status' });
  Vault.keychainSave = async () => {
    const { vaultKey } = await chrome.storage.session.get('vaultKey');
    if (!vaultKey) return { ok: false, error: '먼저 잠금을 풀어 주세요' };
    return native({ cmd: 'save', key: vaultKey });
  };
  Vault.keychainForget = () => native({ cmd: 'forget' });
  Vault.keychainUnlock = async () => {
    const r = await native({ cmd: 'unlock' });
    if (!r.ok) return r;
    const { vault } = await chrome.storage.local.get('vault');
    try {
      const key = await crypto.subtle.importKey('raw', unb64(r.key), 'AES-GCM', true, ['encrypt', 'decrypt']);
      await decryptWith(key, vault); // 열쇠가 지금 정보와 맞는지 확인
    } catch { return { ok: false, error: '키체인 열쇠가 지금 정보와 맞지 않습니다. 잠금 암호로 푼 뒤 키체인에 다시 저장해 주세요.' }; }
    await chrome.storage.session.set({ vaultKey: r.key });
    return { ok: true };
  };
  root.PubVault = Vault;
  root.__pubVaultTest = { deriveKey, encryptWith, decryptWith };
})(typeof window !== 'undefined' ? window : globalThis);
