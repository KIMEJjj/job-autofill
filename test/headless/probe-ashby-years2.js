(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 30 && document.querySelectorAll('input[type=radio]').length < 5; i++) await sleep(500);
  window.scrollTo(0, document.body.scrollHeight); await sleep(800);
  const out = [];
  for (const r of document.querySelectorAll('input[type=radio]')) {
    let n = r.parentElement, txt = '';
    for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
      const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
      if (t) { txt = t; break; }
    }
    out.push({
      name: r.name, id: r.id,
      aria: r.getAttribute('aria-label') || '',
      val: r.value,
      labelTag: (r.closest('label')?.innerText || '').replace(/\s+/g, ' ').slice(0, 40),
      near: txt.slice(0, 80),
      hidden: !(r.offsetWidth || r.offsetHeight || r.getClientRects().length),
    });
  }
  const btns = [...document.querySelectorAll('[role=radio], button')]
    .filter(b => /More than 5 years|Less than 1 year|years/i.test(b.innerText || ''))
    .slice(0, 10)
    .map(b => ({ tag: b.tagName, role: b.getAttribute('role') || '', text: (b.innerText || '').replace(/\s+/g, ' ').slice(0, 50), cls: String(b.className).slice(0, 60) }));
  return JSON.stringify({ radios: out, btns }, null, 1);
})()
