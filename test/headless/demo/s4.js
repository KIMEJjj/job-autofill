(async () => { const sl = ms => new Promise(r => setTimeout(r, ms));
 const P = window.SAMPLE;
 __cap('① 주소 칸 옆 파란 「우편번호」 탭'); __go('[name="currentAddress.address"]'); await sl(1500);
 __cap('"이 페이지 채우기" 클릭'); await __press(); await sl(350);
 const run = window.__pubFill(P, {});
 __cap('② 저장된 주소로 우편번호 검색'); await sl(1750);
 __cap('③ 내 우편번호와 같은 결과 하나만 자동 선택'); await sl(1150);
 __cap('④ 상세주소 입력 → 저장 → 확인'); await sl(900);
 const result = await run; __keep();
 const filled = document.querySelector('[name="currentAddress.address"]').value === P.address1;
 const detailed = document.querySelector('[name="currentAddress.detailAddress"]').value === P.address2;
 const out = document.getElementById('pfout');
 if (out) out.textContent = filled ? '채운 칸: 2개\n제출은 직접 해 주세요.' : '주소를 채우지 못했습니다.';
 __cap(filled ? '주소 자동 입력 완료 · 제출은 직접' : '주소 자동 입력 실패');
 await sl(2600);
 return JSON.stringify({ filled, detailed, reason: result && result.addressSearchReason }); })()
