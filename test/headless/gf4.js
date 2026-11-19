(async () => { window.SAMPLE.address1='성남시 분당구 판교로 1'; window.SAMPLE.zip='13529'; const r = await window.__pubFill(window.SAMPLE, {}); await new Promise(z => setTimeout(z, 500));
 const g = [...document.querySelectorAll('[role="radio"][aria-checked="true"]')].map(x => x.getAttribute('data-value'));
 const b = [...document.querySelectorAll('[role="listbox"] [role="option"][aria-selected="true"]')].map(x => x.getAttribute('data-value'));
 return JSON.stringify({ filled: r.filled, check: r.check, radios: g, region: b, date: document.querySelector('input[type=date]').value }); })()
