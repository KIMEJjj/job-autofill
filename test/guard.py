#!/usr/bin/env python3
"""원칙 검사: 이 확장의 개인정보 원칙(AGENTS.md 1장)이 코드에서 지켜지는지 자동으로 확인합니다.

사용: python3 test/guard.py        (저장소 맨 위 폴더에서, 하나라도 어기면 exit 1)

이 파일과 아래 기준값을 바꾸는 것은 원칙을 바꾸는 일입니다. 바꾸려면 이유를 Pull Request 설명에 적고
저장소 관리자의 확인을 받아야 합니다(.github/CODEOWNERS).
"""
import hashlib, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
fails = []
def bad(msg): fails.append(msg)
def read(p): return open(p, encoding='utf-8', errors='replace').read()

# ── 1. 외부로 보내는 코드 금지 ──
EXT_JS = sorted(f for f in os.listdir('.') if f.endswith('.js'))
EXT_HTML = sorted(f for f in os.listdir('.') if f.endswith('.html'))
NET = re.compile(r'\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|sendBeacon|new\s+EventSource|chrome\.(identity|cookies|history)\b|navigator\.sendBeacon')
for f in EXT_JS + EXT_HTML:
    for i, line in enumerate(read(f).split('\n'), 1):
        code = line.split('//')[0] if f.endswith('.js') else line
        if NET.search(code):
            bad(f'{f}:{i} 외부로 보낼 수 있는 코드: {line.strip()[:100]}')
        for m in re.finditer(r'importScripts\s*\(([^)]*)\)', code):
            if re.search(r'https?:', m.group(1)):
                bad(f'{f}:{i} 외부 스크립트 불러오기: {line.strip()[:100]}')
        if f.endswith('.html') and re.search(r'<(script|link|img|iframe)[^>]+(src|href)\s*=\s*["\']https?:', line, re.I):
            bad(f'{f}:{i} 외부 파일 불러오기: {line.strip()[:100]}')

# 코드 안 인터넷 주소는 문서 형식 이름(XML 네임스페이스)·출처 표시·입력 예시만 허용
URL_OK = {'schemas.openxmlformats.org', 'www.w3.org', 'www.data.go.kr', 'www.linkedin.com', 'github.com', '...'}
for f in EXT_JS:
    for i, line in enumerate(read(f).split('\n'), 1):
        for m in re.finditer(r'https?://([^/\'"\s)]+)', line):
            if m.group(1) not in URL_OK:
                bad(f'{f}:{i} 허용 목록에 없는 인터넷 주소: {m.group(0)}')

# ── 2. 권한·보안 설정을 넓히지 않음 ──
m = json.load(open('manifest.json', encoding='utf-8'))
KEYS = {'manifest_version', 'name', 'version', 'description', 'permissions', 'action', 'options_page', 'content_security_policy', 'background'}
for k in set(m) - KEYS:
    bad(f'manifest.json: 새 설정 "{k}" (host_permissions·content_scripts·externally_connectable 등은 원칙 검토 필요)')
PERMS = {'activeTab', 'scripting', 'storage', 'clipboardWrite', 'debugger', 'nativeMessaging'}
for p in set(m.get('permissions', [])) - PERMS:
    bad(f'manifest.json: 새 권한 "{p}"')
CSP = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
if (m.get('content_security_policy') or {}).get('extension_pages') != CSP:
    bad('manifest.json: content_security_policy가 바뀜 (외부 스크립트 차단 설정)')

# ── 3. 암호화를 약하게 하지 않음 ──
v = read('vault.js')
it = re.search(r'const\s+ITER\s*=\s*(\d+)', v)
if not it or int(it.group(1)) < 600000: bad('vault.js: PBKDF2 반복 횟수가 60만 회보다 적음')
if "name: 'AES-GCM', length: 256" not in v: bad('vault.js: AES-256-GCM 키 설정이 바뀜')
if re.search(r'localStorage|sessionStorage', v): bad('vault.js: 웹 저장소(localStorage) 사용 — 잠금 열쇠는 chrome.storage.session에만')
if re.search(r"storage\.local\.set\(\{[^}]*\b(pass|password|vaultKey)\b", v): bad('vault.js: 잠금 암호·열쇠를 디스크에 저장하는 코드')
if "chrome.storage.session.set({ vaultKey" not in v: bad('vault.js: 열쇠를 메모리(chrome.storage.session)에 두는 방식이 바뀜')

# ── 4. 제출하지 않음 ──
for f in ['fill.js', 'popup.js', 'background.js']:
    for i, line in enumerate(read(f).split('\n'), 1):
        code = line.split('//')[0]
        if re.search(r'\.submit\s*\(|requestSubmit\s*\(|new\s+(Submit)?Event\(\s*[\'"]submit', code):
            bad(f'{f}:{i} 양식을 제출하는 코드: {line.strip()[:100]}')
f = read('fill.js')
for word in ['주민등록', '인증번호', '비밀번호']:
    if not re.search(r'HARD_SKIP\s*=\s*\[[^\]]*' + word, f): bad(f'fill.js: HARD_SKIP에서 "{word}"가 빠짐(민감 칸 보호)')

# ── 5. 함께 들어 있는 외부 프로그램이 바뀌지 않음 ──
LIB = {
    'lib/tesseract-core-simd-lstm.wasm.js': 'ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf',
    'lib/tesseract.min.js': 'a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8',
    'lib/worker.min.js': 'aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc',
    'lib/lang/eng.traineddata.gz': '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
    'lib/lang/kor.traineddata.gz': '78c21276ab14c9bb734d83be1055d9fe5469a4e7e977c51ad385be5737e61126',
}
for p, h in LIB.items():
    if not os.path.exists(p) or hashlib.sha256(open(p, 'rb').read()).hexdigest() != h:
        bad(f'{p}: 글자 인식 프로그램 파일이 바뀌었거나 없음')
for dp, _, fs in os.walk('lib'):
    for n in fs:
        p = os.path.join(dp, n)
        if p.endswith(('.js', '.gz', '.wasm')) and p not in LIB: bad(f'{p}: lib/에 새 실행 파일')

# ── 6. 저장소에 실제 개인정보가 없음 ──
IGNORED = ('dist/', '발표자료/', 'test/docfill/_local/', 'test/docfill/out/', 'test/headless/report-old/', '.git/')
IGNORED_FILES = {'작업기록.md', '인수인계.md', 'AGENTS.local.md', 'native/pubfill-keychain'}
def files():
    try:
        out = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, check=True).stdout.split('\n')
        if any(out): return [x for x in out if x]
    except Exception: pass
    res = []
    for dp, dn, fs in os.walk('.'):
        for n in fs:
            p = os.path.relpath(os.path.join(dp, n), '.')
            if p.startswith(IGNORED) or p in IGNORED_FILES or n == '.DS_Store': continue
            res.append(p)
    return res
FAKE_EMAIL = re.compile(r'(@example\.(com|org|net)$|^testuser@gmail\.com$|^test@|^a@b\.com$|^example@domain\.com$|@test\.|@sample\.|noreply@anthropic\.com$)', re.I)
FAKE_PHONE = {'01098765432', '01012345678', '01000000000', '01011112222'}
EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}')
PHONE = re.compile(r'(?<!\d)01[016789][-. ]?\d{3,4}[-. ]?\d{4}(?!\d)')
RRN = re.compile(r'(?<!\d)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])-?[1-4]\d{6}(?!\d)')
for p in files():
    if p.startswith('lib/') or p.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.gz', '.docx', '.pptx', '.hwp', '.hwpx', '.zip', '.woff', '.woff2', '.ico')): continue
    try: t = read(p)
    except Exception: continue
    for e in set(EMAIL.findall(t)):
        if not FAKE_EMAIL.search(e) and not re.search(r'\.(png|jpe?g|gif|svg|js|css)$', e, re.I):
            bad(f'{p}: 가짜 목록에 없는 이메일 주소 {e}')
    for ph in set(PHONE.findall(t)):
        if re.sub(r'\D', '', ph) not in FAKE_PHONE: bad(f'{p}: 가짜 목록에 없는 휴대폰 번호 {ph}')
    for mm in RRN.finditer(t):
        bad(f'{p}: 주민등록번호 형식 {mm.group(0)[:8]}…')

if fails:
    print('원칙 검사 실패 (AGENTS.md 1장 참고):')
    for x in fails: print('  -', x)
    sys.exit(1)
print('원칙 검사 통과')
