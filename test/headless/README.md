# 헤드리스 크롬 시험 도구

- `cdp.mjs <확장폴더> <URL> <포트> <실행할 js>`: 크롬을 화면 없이 띄워 URL을 열고, schema·alias·qnet·sample·fill.js를 넣은 뒤 js를 실행해 결과를 출력합니다.
  - `NOINJECT=1`: 파일을 넣지 않음 (test/*.html처럼 페이지가 스스로 불러올 때)
- 회귀 시험 15종 (로컬 서버 먼저: `python3 -m http.server 8765 --bind 127.0.0.1`, 기준값은 `인수인계.md` 5장):
  `for t in form recruiter choices toggles questions mui mui2 period kei edu emailcheck trinity kli-address cj ninehire; do printf "%s " $t; NOINJECT=1 timeout 150 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/$t.html" 9337 test/headless/reg.js | tail -1; done`
- 증명사진 첨부: `node test/headless/cdp.mjs "$PWD" http://127.0.0.1:8765/test/photo.html 9369 test/headless/photo.js` → photo 2, 서류 칸 0
- 검색형 목록 칸(Ashby Location): `NOINJECT=1 node test/headless/cdp.mjs "$PWD" http://127.0.0.1:8765/test/ashby-location.html 9374 test/headless/ashby-location.js` → `"1/0"`, 값 `Seoul, South Korea`
- 전체 자동 시험: `test/headless/all.sh` (위 항목 + 양식 4종 + 이력서 + 팝업·설정 화면 열림까지 한 번에, 하나라도 다르면 exit 1)
- 실제 확장 검사: `node test/headless/real-ext.mjs <확장폴더> [Greenhouse 공고 주소…]` — 시험용 크롬에 확장을 그대로 올리고(CDP `Extensions.loadUnpacked`) 실제 툴바 버튼(`Extensions.triggerAction`)으로 팝업을 열어 설정 저장·칸 알려 주기·채우기·선택 목록을 가짜 정보로 확인(제출 안 함, all.sh 7번, `GH_URLS`로 공고 주소 전달). 팝업을 일반 탭으로 열면 보안 검사 때문에 선택 목록이 동작하지 않음
- 거주 국가·이메일 받기 질문: `test/residence.html` + `residence.js` (all.sh 1f)
- 양식 파일 채우기: `python3 test/docfill/make_templates.py && node test/headless/docfill-test.mjs "$PWD" && python3 test/docfill/verify.py test/docfill/out/resume_채움.* test/docfill/out/shapes_채움.docx` (변형 구조 shapes.docx 포함, `FILES=`로 파일 지정, 수원대 실제 양식은 `test/docfill/_local/`, 배포 제외)
- 이력서 내보내기: `resume-test.mjs <확장폴더>` → test/docfill/out/cv.docx·cv.pdf·cv_en.*
- Greenhouse 선택 목록(react-select): `rs-test.mjs <확장폴더> <지원서 URL>` (`RSDEBUG=1`, `ONLY=city`)
- 시연 GIF 9개: `demo-gifs.mjs <확장폴더> [번호]` → `demo/` (외부 프로그램 없이 `gifenc.html`로 인코딩), 검사 `gifcheck.mjs "/demo/<파일>.gif" <출력폴더> [장면]`. 시연용 페이지 `test/teach-demo.html`, `test/photo.html`
- 안내서 그림(새 기능): `guide-shots.mjs <확장폴더>` → guide/images/09~12
- 실제 사이트 시험 (가짜 프로필, 제출 안 함): `check.js`(그리팅 슈프리마 https://hr-suprema.career.greetinghr.com/ko/o/244288/apply), `gf4.js`(구글 설문)
- 공개 ATS 일괄 진단(가짜 프로필, 제출 버튼 미작동): `PORT=9351 node test/headless/diagnose.mjs <확장폴더> <사이트목록.txt> <보고서폴더> 1`. 목록은 `sites/`(Greeting 하위 주소, Ninehire/Greenhouse/Lever/Ashby 게시판 URL), Korea/Seoul 공고 우선. **동시에 여러 개 돌릴 때는 PORT를 다르게.** 보고서에 파일 칸·사진 첨부 결과도 나옵니다. 최신 보고서: `report-ashby-086`(Ashby 101/278, Location 모르는 칸 0), `report-greenhouse-new-086`, `report-greeting-guess-086b`, 지난 보고서는 `report-old/`.
- 일회성 실제 사이트 시험 스크립트(가짜 프로필, 제출 안 함): `check.js`(슈프리마), `gf4.js`(구글 설문), `molo-name.js`·`greenhouse-name.js`·`greenhouse-source*.js`(Greenhouse 이름·지원경로), `scan.js`·`form-detail.js`(칸 구조 출력)
- 한국노동연구원 한문이름 재현 시험: `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-name.html" 9336 test/headless/kli-name.js`
- 한국노동연구원 우편번호 검색 재현 시험: `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-address.html" 9337 test/headless/kli-address.js`
  - 재현 페이지는 저장 뒤 「저장하시겠습니까?」 확인 창이 뜨는 구조이며, 결과의 `confirmedSave`가 `확인`까지 눌렀는지를 보여 줍니다.
- 닫힌 주소 편집 화면에서 파란 우편번호 탭을 눌러 검색을 시작하는지 확인: `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-address.html?closed=1" 9337 test/headless/kli-address.js`
- 이미 기본주소가 입력된 경우에도 검색을 다시 타는지 확인: `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-address.html?prefilled=1" 9337 test/headless/kli-address-prefilled.js`
- 주소 창의 저장 버튼이 늦게 활성화되어도 저장까지 누르는지 확인: `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-address.html?slow=1" 9337 test/headless/kli-address.js`
- KLI 중복 주소 결과는 자동 선택하지 않는지 확인: `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-address.html?multiple=1" 9337 test/headless/kli-address-ambiguous.js`
- KLI 우편번호가 일치하지 않으면 선택하지 않는지 확인: `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-address.html?wrongzip=1" 9337 test/headless/kli-address-no-zip.js`
- 주소 입력칸과 Postcodify 검색창이 다른 프레임일 때 결과 합산 확인: `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-address-frame.html" 9338 test/headless/kli-address-frame.js`
- 파란 우편번호 탭을 누른 뒤 검색 iframe이 생기는 경우 재주입 흐름 확인: `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-address-open-frame.html" 9338 test/headless/kli-address-open-frame.js`
  - DOM fixture는 Postcodify 공개 예제에서 확인한 `.postcodify_search_result`, `.code5`, `a.selector` 구조를 사용합니다.
- (옛 방식) 주소 입력 시연 GIF(시연4) 다시 만들기(가짜 프로필, 제출 안 함): Pillow가 필요합니다(예: `python3 -m venv /tmp/pubfill-gif-venv && /tmp/pubfill-gif-venv/bin/pip install pillow`).
  1. `node test/headless/demo/rec-shots.mjs "$PWD" "http://127.0.0.1:8765/test/kli-address-demo.html" "$PWD/발표자료/시연/_addrframes" test/headless/demo/s4.js`
  2. `/tmp/pubfill-gif-venv/bin/python test/headless/demo/gif.py 발표자료/시연/_addrframes "발표자료/시연/시연4_주소입력.gif" 1600 96`
  - `rec-shots.mjs`는 일정 간격 스크린샷을 찍어 움직임이 적은 화면도 부드럽게 담습니다. `rec.mjs`는 화면이 바뀔 때만 오는 screencast 방식(시연1~3)입니다.
  - `test/kli-address-demo.html`은 KLI 주소 화면을 닮게 만든 시연용 페이지로, 검색 1.2초·기본주소 0.7초·확인 창 0.7초 지연을 넣어 자동 입력 과정이 보이게 했습니다.
- 실제 Postcodify 공개 위젯/API 1회 확인(검색어는 test/sample.js의 가짜 주소): `NOINJECT=1 node test/headless/cdp.mjs "$PWD" "http://127.0.0.1:8765/test/kli-postcodify-public.html" 9339 test/headless/kli-postcodify-public.js`
- OCR 회귀 시험: `test/ocr.html`은 코드로 만든 가짜 자격증 이미지, `test/ocr-number.html`은 DataQ 7종목 번호 형식의 가짜 OCR 텍스트를 사용합니다. `test/cert-search-row.html`은 선택된 자격증 chip과 발급기관·번호·취득일 연결을 가짜 프로필로 확인합니다.
