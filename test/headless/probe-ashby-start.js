(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 30 && !/start a new role|desired start|start date/i.test(document.body.innerText); i++) await sleep(500);
  window.scrollTo(0, document.body.scrollHeight); await sleep(600);
  const labels = [...document.querySelectorAll('label, div, span')]
    .filter(e => /when can you start a new role|desired start date|how soon can you start/i.test(e.innerText || '') && (e.innerText || '').length < 120)
    .slice(0, 6);
  const out = [];
  for (const l of labels) {
    const box = l.closest('[data-field-path]') || l.parentElement;
    const inp = box.querySelector('input, textarea');
    out.push({
      label: l.innerText.replace(/\s+/g, ' ').slice(0, 80),
      path: box.getAttribute('data-field-path') || '',
      input: inp ? {
        tag: inp.tagName, type: inp.type, role: inp.getAttribute('role') || '',
        readOnly: inp.readOnly, placeholder: inp.placeholder,
        aria: inp.getAttribute('aria-haspopup') || '',
        value: inp.value,
      } : null,
    });
  }
  // 날짜 입력 시도: 첫 칸에 '2026-12-01'을 넣고 상태 확인
  let typed = null;
  const first = out.find(x => x.input)?.input;
  if (first) {
    const el = document.querySelector('[data-field-path="' + out.find(x => x.input).path + '"] input') || null;
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      el.focus(); setter.call(el, '2026-12-01');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(700);
      typed = { value: el.value, expanded: el.getAttribute('aria-expanded') };
    }
  }
  return JSON.stringify({ out, typed }, null, 1);
})()
