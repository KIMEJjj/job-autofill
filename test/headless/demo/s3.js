(async () => { const sl = ms => new Promise(r => setTimeout(r, ms)); const P = window.SAMPLE;
 const q = n => document.querySelector(`[name="languagesCertificationsAndOtherActivity.certificatesLicenses.0.${n}"]`);
 __cap('③ 자격증 정보 채우기'); __go(q('credentials')); await sl(1800);
 __cap('자격증명을 검색해서 고르면'); const inp = q('credentials'); inp.focus(); inp.click();
 const set = v => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); };
 const name = '컴퓨터활용능력'; for (let i = 1; i <= name.length; i++) { set(name.slice(0, i)); await sl(110); }
 await sl(3000); const c = document.getElementById(inp.getAttribute('aria-controls')); const opts = c ? [...c.querySelectorAll('[role="option"]')] : [];
 const all = opts.map(x => x.textContent.trim()).join(' / '); const o = opts.find(x => /컴퓨터활용능력s*1급/.test(x.textContent)) || opts.find(x => /컴퓨터활용능력/.test(x.textContent) && !/직접/.test(x.textContent)); let picked = o ? o.textContent.trim() : '(없음)'; if (o) o.click(); await sl(900);
 __cap('"이 페이지 채우기" 클릭'); await __press(); await sl(300);
 __cap('같은 자격증을 내 정보에서 찾아 등급·발급기관·취득일 입력');
 await window.__pubFill({ certificates: P.certificates }, {}); __keep(); __go(q('credentials')); await sl(1200);
 document.getElementById('pfout').textContent = '채움 완료 · 제출은 직접'; await sl(2800); return all.slice(0,200) + ' || picked ' + picked + ' issuer=' + q('issuingAgency').value + ' rating=' + q('rating').value; })()
