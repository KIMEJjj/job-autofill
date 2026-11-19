(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); const P = window.SAMPLE;
 __cap('② 목록·달력에서 자동으로 고르기'); await sl(1500);
 __cap('"이 페이지 채우기" 클릭'); await __press(); await sl(400);
 const prof = { gender: P.gender, birth: P.birth, military: '군필', militaryType: '현역병', militaryBranch: '육군', militaryStart: P.militaryStart, militaryEnd: P.militaryEnd };
 __cap('목록·달력을 열어 내 정보와 같은 항목 선택'); const t = setInterval(() => { document.querySelectorAll('[data-pubfill]').forEach(e => { if (/242, 183, 5|f2b705/.test(e.style.outline)) e.style.outline = ''; }); }, 100);
 await window.__pubFill(prof, {}); __keep(); await sl(700); await window.__pubFill(prof, {}); __keep();
 clearInterval(t); document.getElementById('pfout').textContent = '채움 완료 · 제출은 직접'; __go('button[name="basicInformation.gender"]'); await sl(900);
 __cap('성별 · 생년월일 · 병역 모두 선택 완료'); await sl(2200); __go('button[name="militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus"]'); await sl(2500); return 'ok'; })()
