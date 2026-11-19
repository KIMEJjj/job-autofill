(async () => {
  const clean = html => html
    .replace(/\s(value|placeholder|src)="[^"]*"/gi, '')
    .replace(/>[^<>]{1,200}</g, '><')
    .replace(/\s+/g, ' ');
  const all = [...document.querySelectorAll('div')]
    .filter(el => /증명사진/.test(el.innerText || '') && /이미지 파일 첨부/.test(el.innerText || ''));
  const box = all[all.length - 1];
  const out = { count: all.length, found: !!box, cls: box ? String(box.className).slice(0, 80) : '' };
  if (box) {
    out.html = clean(box.outerHTML).slice(0, 2600);
    out.controls = [...box.querySelectorAll('*')]
      .filter(el => el.getAttribute('role') || ['BUTTON', 'LABEL', 'INPUT'].includes(el.tagName))
      .slice(0, 15).map(el => [el.tagName.toLowerCase(), el.getAttribute('role') || '', el.type || '', String(el.className || '').slice(0, 60)].join(' | '));
  }
  return JSON.stringify(out);
})()
