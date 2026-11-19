(async () => {
  const desc = el => [el.tagName.toLowerCase(), el.type || '', el.accept || '', String(el.className || '').slice(0, 50), el.id || '', el.name || ''].join('|');
  const list = () => [...document.querySelectorAll('input[type=file]')].map(desc);
  const box = [...document.querySelectorAll('[class*="ImageUploadInput__Container"]')]
    .find(el => (el.closest('[class*="ApplicationFormInput__Layout"]') || document.body).innerText.includes('증명사진'));
  const out = { found: !!box, before: list() };
  if (!box) return JSON.stringify(out);
  const seq = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  for (const t of seq) box.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  await new Promise(r => setTimeout(r, 1200));
  out.afterBoxClick = list();

  // 컨테이너 안쪽(이미지 빈 자리)도 눌러 봄
  const inner = box.querySelector('[class*="ImageEmpty"]') || box.firstElementChild;
  if (inner) {
    for (const t of seq) inner.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 1200));
    out.afterInnerClick = list();
  }
  // body 바로 아래 새로 생긴 요소
  out.lastBody = [...document.body.children].slice(-4).map(el => desc(el).slice(0, 120));
  return JSON.stringify(out);
})()
