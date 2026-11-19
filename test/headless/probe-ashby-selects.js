(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 40 && !document.querySelector('select'); i++) await sleep(500);
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(1200);
  const out = [];
  for (const s of document.querySelectorAll('select')) {
    const near = (s.closest('[data-field-path]')?.getAttribute('data-field-path') || '');
    let n = s.parentElement, txt = '';
    for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
      const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
      if (t) { txt = t; break; }
    }
    out.push({
      name: s.name, path: near, text: txt.slice(0, 100),
      opts: [...s.options].slice(0, 10).map(o => o.text.trim()),
      count: s.options.length,
      outer: (s.closest('[data-field-path]') || s.parentElement).outerHTML.replace(/>[^<>]{1,60}</g, '><').replace(/\s+/g, ' ').slice(0, 600),
    });
  }
  return JSON.stringify({ selects: document.querySelectorAll('select').length, out }, null, 1);
})()
