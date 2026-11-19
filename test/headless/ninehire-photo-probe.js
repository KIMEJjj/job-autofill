(async () => {
  const desc = el => ({
    tag: el.tagName.toLowerCase(),
    type: el.type || '',
    id: el.id || '',
    name: el.name || '',
    accept: el.accept || '',
    role: el.getAttribute && (el.getAttribute('role') || ''),
    cls: (el.className && String(el.className).slice(0, 70)) || '',
    text: (el.innerText || el.textContent || '').trim().slice(0, 60),
  });
  const files = () => [...document.querySelectorAll('input[type=file]')].map(desc);
  const out = { before: files(), clicked: [] };
  const hits = [...document.querySelectorAll('div,span,button,label,a')]
    .filter(el => /이미지 파일 첨부|권장 사이즈/.test((el.innerText || '').slice(0, 80)))
    .filter(el => ![...el.children].some(c => /이미지 파일 첨부|권장 사이즈/.test((c.innerText || '').slice(0, 80))));
  out.hits = hits.slice(0, 6).map(desc);
  for (const h of hits.slice(0, 2)) {
    let t = h;
    for (let k = 0; k < 4 && t.parentElement; k++, t = t.parentElement) {
      const d = desc(t);
      if (t.getAttribute('role') === 'button' || t.tagName === 'BUTTON' || t.tagName === 'LABEL' ||
          /button|btn|upload|attach|file|dropzone/i.test(d.cls)) break;
    }
    out.clicked.push({ hit: desc(h), target: desc(t) });
    t.click();
    await new Promise(r => setTimeout(r, 1200));
    out.afterClick = files();
    if (out.afterClick.length) break;
  }
  return JSON.stringify(out);
})()
