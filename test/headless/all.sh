#!/bin/bash
# 전체 자동 시험: 원칙 guard → 회귀·사이트별 재현 → 사진 → 양식 → 이력서 → UI → 실제 확장 팝업
# 사용: test/headless/all.sh   (로컬 서버가 없으면 직접 띄웠다가 끝나면 종료합니다)
# 하나라도 기준과 다르면 0이 아닌 값으로 끝납니다. FORCE_FAIL=1이면 실패 감지 자체를 시험합니다.
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PORT="${PORT:-9337}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FAIL=0
SERVER_PID=""
DOC_TEMPLATE_BACKUP="$(mktemp -d "${TMPDIR:-/tmp}/pubfill-doc-templates.XXXXXX")"
DOC_TEMPLATES=(prose.docx resume.docx resume.hwpx resume.pptx resume_named.docx resume_photo.docx resume_short.docx resume_teach.docx shapes.docx)
for f in "${DOC_TEMPLATES[@]}"; do
  [ ! -f "test/docfill/$f" ] || cp -p "test/docfill/$f" "$DOC_TEMPLATE_BACKUP/$f"
done

say()  { printf '%s\n' "$*"; }
ok()   { printf '  ok   %s\n' "$*"; }
bad()  { printf '  FAIL %s\n' "$*" >&2; FAIL=1; }

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  pkill -f "user-data-dir=/private/tmp/claude-501/cdpprof" 2>/dev/null || true
  for f in "${DOC_TEMPLATES[@]}"; do
    if [ -f "$DOC_TEMPLATE_BACKUP/$f" ]; then
      cp -p "$DOC_TEMPLATE_BACKUP/$f" "test/docfill/$f"
    else
      rm -f "test/docfill/$f"
    fi
    rm -f "$DOC_TEMPLATE_BACKUP/$f"
  done
  rmdir "$DOC_TEMPLATE_BACKUP" 2>/dev/null || true
}
trap cleanup EXIT

say "== 0. 준비 =="
if [ ! -x "$CHROME" ]; then bad "Chrome을 찾을 수 없습니다: $CHROME"; else ok "Chrome"; fi

if ! curl -fsS -o /dev/null http://127.0.0.1:8765/test/form.html 2>/dev/null; then
  python3 -m http.server 8765 --bind 127.0.0.1 >/tmp/pubfill-all-http.log 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do
    curl -fsS -o /dev/null http://127.0.0.1:8765/test/form.html 2>/dev/null && break
    sleep 0.25
  done
fi
if curl -fsS -o /dev/null http://127.0.0.1:8765/test/form.html 2>/dev/null; then ok "로컬 서버 8765"; else bad "로컬 서버 8765 응답 없음"; fi

MANIFEST_V=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])" 2>/dev/null)
ENGINE_V=$(sed -n "s/^[[:space:]]*const ENGINE = '\([^']*\)';.*/\1/p" fill.js | head -1)
if [ -n "$MANIFEST_V" ] && [ "$MANIFEST_V" = "$ENGINE_V" ]; then ok "버전 일치 $MANIFEST_V"; else bad "버전 불일치 manifest=$MANIFEST_V engine=$ENGINE_V"; fi

say "== 0b. 원칙 검사 (외부 전송·권한·암호화·제출·개인정보) =="
if python3 test/guard.py >/tmp/pubfill-guard.log 2>&1; then ok "guard 통과"; else bad "guard 실패"; cat /tmp/pubfill-guard.log >&2; fi
want="name=홍길동 submits=0 clicks=0 rrn= pw= auth= intro="
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/submit-guard.html" "$PORT" test/headless/submit-guard.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "submit-guard $got"; else bad "submit-guard 기대 $want / 실제 $got"; fi

say "== 1. 회귀 15종 =="
for pair in form:54/0 recruiter:6/0 choices:6/0 toggles:4/1 questions:5/1 mui:3/0 mui2:2/0 period:8/0 kei:9/0 edu:8/0 emailcheck:6/0 trinity:10/1 kli-address:2/0 cj:24/0 ninehire:12/0; do
  t="${pair%%:*}"; want="${pair#*:}"
  got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/$t.html" "$PORT" test/headless/reg.js 2>&1 | tail -1)
  if [ "$got" = "$want" ]; then ok "$t $got"; else bad "$t 기대 $want / 실제 $got"; fi
done

say "== 1b. 입학구분(신입학·편입학) =="
want="10/0 t0=N t1=Y d0=2015.03 d1=2018.03 a2=01 a3=02 s2=셋째학교 s3=넷째학교"
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/admission.html" "$PORT" test/headless/admission.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "admission $got"; else bad "admission 기대 $want / 실제 $got"; fi
want="4/0 s1=테스트대학교 a0=01 t1=Y"
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/admission-mixed.html" "$PORT" test/headless/admission-mixed.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "admission-mixed $got"; else bad "admission-mixed 기대 $want / 실제 $got"; fi

say "== 1c. 커서가 들어올 때만 검사하는 칸 (코스트코 recruiter) =="
want="3/0 name=true email=true picker=0"
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/focuscheck.html" "$PORT" test/headless/focuscheck.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "focuscheck $got"; else bad "focuscheck 기대 $want / 실제 $got"; fi

say "== 1d. 우편번호 찾기 창 (코스트코 recruiter 예전 화면) =="
want="z=04524 a=서울특별시 중구 을지로 79 d=101동 1001호 open=false reason="
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/costco-address.html" "$PORT" test/headless/costco-address.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "costco-address $got"; else bad "costco-address 기대 $want / 실제 $got"; fi
for c in "?multi=1|costco-address-jibun.js|z=04524 a=서울특별시 중구 을지로 79 reason=" "|costco-address-single.js|z=04524 a=서울특별시 중구 을지로 79 reason=" "?multi=1|costco-address-fail.js|z= a= reason=검색 결과 2줄 중 내 주소와 같은 줄을 찾지 못했습니다." "?ovl=1|costco-address-ovl.js|z=04524 a=서울특별시 중구 을지로 79 d=101동 1001호 open=false alerts=0 reason="; do
  q="${c%%|*}"; r="${c#*|}"; js="${r%%|*}"; want="${r#*|}"
  got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/costco-address.html$q" "$PORT" "test/headless/$js" 2>&1 | tail -1)
  if [ "$got" = "$want" ]; then ok "$js $got"; else bad "$js 기대 $want / 실제 $got"; fi
done

say "== 1e. 속성으로 연·월 형식을 알려 주는 날짜 칸 (코스트코 복무기간) =="
want="s=2019.05 e=2020.11 hs=2015.03 he=2018.02"
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/ym-date.html" "$PORT" test/headless/ym-date.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "ym-date $got"; else bad "ym-date 기대 $want / 실제 $got"; fi

say "== 1f. 해외 지원서 (Greenhouse 학력 구역, Recruitee 이름, 거주 국가) =="
want="sy=2018 ey=2025 rs=degree=학사,endMonth=February,majorEn=Business Administration,schoolEn=Test University,startMonth=March"
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/gh-education.html" "$PORT" test/headless/gh-education.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "gh-education $got"; else bad "gh-education 기대 $want / 실제 $got"; fi
want="3/0 name=HONG GILDONG email=testuser@gmail.com phone=010-1234-5678"
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/recruitee.html" "$PORT" test/headless/recruitee.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "recruitee $got"; else bad "recruitee 기대 $want / 실제 $got"; fi

want="a=South Korea l=Korea, Republic of t=대한민국 c=Seoul q=none miss= e5= e6= rs= mail=testuser@gmail.com | foreign a= l= t= miss="
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/residence.html" "$PORT" test/headless/residence.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "residence $got"; else bad "residence 기대 $want / 실제 $got"; fi
# 그리팅 '주소 찾기' 상자(대상웰라이프 구조, 현주소·주민등록지·같은 우편번호 가게 줄) + 우편번호·퇴직사유·어학 등록번호·컴퓨터 프로그램명·봉사 주관기관 칸
want='zip=zip regzip=(제외) reason=career.reason langNo=languages.number certNo=certificates.number prog=(제외) host=activities.org | z=04541 a=서울특별시 중구 을지로 79 d=101동 1001호 done=true open=false | reg z=04541 a=서울특별시 중구 을지로 79 d=101동 1001호 | pre z=04541 done=true | other a=서울특별시 중구 을지로 7 z= | regDiff z=04533 a=서울특별시 중구 을지로 7 d=3층'
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/greeting-address.html" "$PORT" test/headless/greeting-address.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "greeting-address $got"; else bad "greeting-address 기대 $want / 실제 $got"; fi
# 주소 이름이 다른 사이트(실거주지 / 등본상 주소) + 주민등록지 '다른 주소'
want='heads=실거주지/등본상 주소 regzip=- regaddr=- regdet=- | cur z=04541 a=서울특별시 중구 을지로 79 d=101동 1001호 | reg z=04533 a=서울특별시 중구 을지로 7 d=3층'
got=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/greeting-address.html?names=1" "$PORT" test/headless/greeting-address-names.js 2>&1 | tail -1)
if [ "$got" = "$want" ]; then ok "greeting-address-names $got"; else bad "greeting-address-names 기대 $want / 실제 $got"; fi

say "== 1g. Twitter/X 개인 주소 연결 =="
TW=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/twitter.html" "$PORT" test/headless/twitter.js 2>&1 | tail -1)
case "$TW" in
  *'"filled":4'*'"check":2'*'"twitter":"https://x.com/test-user"'*'"linkedin":"https://www.linkedin.com/in/test-user"'*'"github":"https://github.com/test-user"'*'"portfolio":"https://test-user.example.com"'*'"companyTwitter":""'*'"twitterUsername":""'*)
    ok "개인 Twitter/X·LinkedIn·GitHub·포트폴리오 연결, 회사 URL·username 칸은 비움" ;;
  *) bad "twitter 연결 기대 4개 및 회사 URL·username 제외 / 실제 $TW" ;;
esac

say "== 2. 사진 첨부 =="
PHOTO=$(node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/photo.html" 9369 test/headless/photo.js 2>&1)
PHOTO_CHECK=$(printf '%s' "$PHOTO" | python3 -c '
import json,sys
raw=sys.stdin.read().strip()
try: d=json.loads(raw)
except Exception: print("FAIL parse:"+raw[:120]); sys.exit(0)
files=d.get("files") or []
photo_ok = d.get("photo")==2 and d.get("name")=="filled" and len(files)==6
for f in files:
    name, _, n = f.partition(":")
    if name in ("ph1","profilePhoto"):
        photo_ok = photo_ok and n=="1"
    else:
        photo_ok = photo_ok and n=="0"
print(("ok" if photo_ok else "FAIL")+" photo="+str(d.get("photo"))+" files="+",".join(files))
' 2>&1)
case "$PHOTO_CHECK" in
  ok*) ok "${PHOTO_CHECK#ok }" ;;
  *)   bad "$PHOTO_CHECK" ;;
esac

say "== 3. 검색형 목록 칸 (Ashby Location) =="
AL=$(NOINJECT=1 node test/headless/cdp.mjs "$ROOT" "http://127.0.0.1:8765/test/ashby-location.html" 9374 test/headless/ashby-location.js 2>&1 | tail -1)
case "$AL" in
  *'"result":"1/0"'*'"value":"Seoul, South Korea"'*) ok "목록에서 'Seoul, South Korea' 선택" ;;
  *) bad "ashby-location: $AL" ;;
esac

say "== 4. 양식 채우기 (기본 3종 + 변형 구조) =="
if python3 test/docfill/make_templates.py >/tmp/pubfill-all-templates.log 2>&1; then ok "양식 만들기"; else bad "make_templates.py 실패"; fi
DOC_LOG=$(FILES=resume.docx,resume.pptx,resume.hwpx,shapes.docx node test/headless/docfill-test.mjs "$ROOT" 9361 2>&1)
if printf '%s' "$DOC_LOG" | grep -q '"error"'; then bad "docfill-test 오류: $(printf '%s' "$DOC_LOG" | tail -1)"; else ok "docfill-test 4종"; fi
if python3 test/docfill/verify.py test/docfill/out/resume_채움.* test/docfill/out/shapes_채움.docx >/tmp/pubfill-all-verify.log 2>&1; then
  ok "$(grep -h '줄 일치' /tmp/pubfill-all-verify.log | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
else
  bad "verify.py 불일치"; tail -5 /tmp/pubfill-all-verify.log | sed 's/^/       /' >&2
fi

say "== 5. 이력서 내보내기 =="
RESUME=$(node test/headless/resume-test.mjs "$ROOT" 9365 2>&1 | tail -1)
if printf '%s' "$RESUME" | grep -q '"name"'; then ok "resume-test"; else bad "resume-test: $RESUME"; fi
if printf '%s' "$RESUME" | grep -q '"twitter":"https://x.com/test-user"' && printf '%s' "$RESUME" | grep -q '"twitterEn":"https://x.com/test-user"'; then
  ok "Twitter/X 한국어·영문 이력서 포함"
else
  bad "Twitter/X 이력서 연결: $RESUME"
fi
if python3 - test/docfill/out/cv.docx test/docfill/out/cv_en.docx <<'PY'
import sys,zipfile,xml.etree.ElementTree as ET
for p in sys.argv[1:]:
    with zipfile.ZipFile(p) as z:
        root=ET.fromstring(z.read('word/document.xml'))
    text=''.join((x.text or '') for x in root.iter() if x.tag.split('}')[-1]=='t')
    if 'Twitter / X' not in text or 'https://x.com/test-user' not in text:
        print('Twitter/X not present in',p); sys.exit(1)
print('Twitter/X present in both Word files')
PY
then ok "Twitter/X 주소가 한국어·영문 DOCX에 기록됨"
else bad "Twitter/X DOCX 확인 실패"; fi
for f in cv.docx cv.pdf cv_en.docx cv_en.pdf; do
  p="test/docfill/out/$f"
  if [ -s "$p" ]; then ok "$f"; else bad "$f 없음/빈 파일"; fi
done
if [ -s test/docfill/out/cv.pdf ] && [ "$(head -c 4 test/docfill/out/cv.pdf)" = "%PDF" ]; then ok "cv.pdf 형식"; else bad "cv.pdf 형식 아님"; fi

say "== 6. 팝업·설정 화면 =="
UI=$(node test/headless/ui-check.mjs "$ROOT" 9366 2>&1 | tail -1)
if printf '%s' "$UI" | grep -q '"ok":true'; then ok "팝업 버튼 6개 · Twitter/X 설정 항목 · 콘솔 오류 0"; else bad "ui-check: $UI"; fi

if [ "${FORCE_FAIL:-0}" = "1" ]; then bad "FORCE_FAIL=1 자기 시험"; fi

say "== 7. 실제 확장 (시험용 크롬에 올려 툴바 팝업으로) =="
# 설정 화면 잠금 암호·사진 저장 후 다시 열기, 칸 알려 주기, 채우기(지원 기록이 생기지 않는지). GH_URLS를 주면 실제 Greenhouse 선택 목록까지
RX=$(timeout 400 node test/headless/real-ext.mjs "$ROOT" ${GH_URLS:-} 2>&1 | tail -1)
if printf '%s' "$RX" | grep -q '"ok":true'; then ok "real-ext $(printf '%s' "$RX" | python3 -c 'import json,sys; d=json.load(sys.stdin)["steps"]; print("사진·Twitter 유지, 지원 기록 없음, 알려 주기", d["teach"]["marked"], "칸, 채움", d["fill"]["filled"], "칸", *[g["url"].split("/")[3]+" 목록 "+str(len(g["picked"])) for g in d.get("greenhouse",[])])')"; else bad "real-ext: $RX"; fi

say "== 결과 =="
if [ "$FAIL" -eq 0 ]; then say "전체 통과"; exit 0; else say "실패 있음"; exit 1; fi
