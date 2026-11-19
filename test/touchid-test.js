// Touch ID(WebAuthn PRF)로 암호 열쇠를 만들 수 있는지만 확인. 아무것도 저장하지 않음.
const out = document.getElementById('out');
const log = (...a) => { out.textContent += '\n' + a.join(' '); };
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
const salt = new TextEncoder().encode('pubfill-prf-test-salt-v1-000000').slice(0, 32);
let credId = null;

out.textContent = `크롬: ${navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] || '알 수 없음'}`;
log('WebAuthn 사용 가능:', !!window.PublicKeyCredential);

document.getElementById('reg').onclick = async () => {
  try {
    if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      log('Mac 지문 인증기:', (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) ? '있음' : '없음');
    }
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { name: '지원서 자동입력 (시험)' },
      user: { id: rnd(16), name: 'pubfill-test', displayName: '지원서 자동입력 시험' },
      challenge: rnd(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      extensions: { prf: { eval: { first: salt } } },
    }});
    credId = cred.rawId;
    const ext = cred.getClientExtensionResults();
    log('등록: 성공');
    log('PRF(지문으로 열쇠 만들기) 지원:', ext.prf?.enabled ? '예' : '아니오');
    document.getElementById('use').disabled = false;
  } catch (e) {
    log('등록 실패:', e.name, e.message);
  }
};

document.getElementById('use').onclick = async () => {
  try {
    const a = await navigator.credentials.get({ publicKey: {
      challenge: rnd(32),
      allowCredentials: [{ type: 'public-key', id: credId }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: salt } } },
    }});
    const r = a.getClientExtensionResults().prf?.results?.first;
    log('잠금 해제 시험:', r ? `성공 (열쇠 ${r.byteLength}바이트 생성)` : '지문 인증은 됐지만 열쇠를 만들지 못함');
    log(r ? '\n결론: Touch ID 잠금 해제를 만들 수 있습니다.' : '\n결론: 이 환경에서는 Touch ID로 열쇠를 만들 수 없습니다.');
  } catch (e) {
    log('잠금 해제 실패:', e.name, e.message);
  }
};
