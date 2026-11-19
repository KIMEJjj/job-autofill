(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); const P = window.SAMPLE;
 __cap('① 일반 입력칸과 버튼형 선택'); await sl(1500);
 __cap('"이 페이지 채우기" 클릭'); await __press(); await sl(500);
 const steps = [['이름', { name: P.name }, '[name="basicInformation.name"]'], ['이메일', { email: P.email }, '[name="basicInformation.name"]'], ['연락처', { phone: P.phone }, '[name="basicInformation.phoneNumber.nationalNumber"]'],
   ['주소', { zip: P.zip, address1: P.address1, address2: P.address2 }, '[name="personalInformation.currentAddress.address"]'], ['장애여부 · 보훈여부 (버튼형)', { disability: '비대상', veteran: '비대상' }, null]];
 for (const [label, prof, sel] of steps) {
   if (sel) __go(sel); else { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '비대상'); __go(b); }
   await sl(700); __cap(label + ' 입력'); await window.__pubFill(prof, {}); __keep(); await sl(1300);
 }
 document.getElementById('pfout').textContent = '채움 완료 · 제출은 직접'; __cap('초록 테두리 = 자동으로 채운 칸'); await sl(2500); return 'ok'; })()
