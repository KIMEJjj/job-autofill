(async () => {
  const out = {};
  const entry = document.querySelector('[data-field-path="_systemfield_location"]');
  out.found = !!entry;
  if (!entry) return JSON.stringify(out);
  const inp = entry.querySelector('input[role="combobox"]');
  out.attrs = [...inp.attributes].map(a => a.name + '=' + a.value.slice(0, 60));
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  inp.focus(); setter.call(inp, 'Seoul');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1800));
  out.expanded = inp.getAttribute('aria-expanded');
  out.controls = inp.getAttribute('aria-controls');
  out.value = inp.value;
  const boxes = [...document.querySelectorAll('[role="listbox"], [class*="menu" i], [class*="Menu" i], [class*="listbox" i], [class*="dropdown" i]')]
    .filter(el => el.offsetParent !== null);
  out.boxes = boxes.slice(0, 6).map(el => ({ role: el.getAttribute('role') || '', cls: String(el.className || '').slice(0, 70), text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 100), n: el.children.length }));
  const opts = [...document.querySelectorAll('[class*="option" i]')].filter(el => el.offsetParent !== null && (el.innerText || '').trim());
  out.opts = opts.slice(0, 8).map(el => ({
    role: el.getAttribute('role') || '',
    cls: String(el.className || '').slice(0, 80),
    tag: el.tagName.toLowerCase(),
    text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
    id: el.id || '',
  }));
  if (opts[0]) {
    out.optParent = { tag: opts[0].parentElement.tagName.toLowerCase(), role: opts[0].parentElement.getAttribute('role') || '', cls: String(opts[0].parentElement.className || '').slice(0, 70) };
    out.optOuter = (opts[0].closest('[role="listbox"]') || opts[0].parentElement).outerHTML.replace(/>[^<>]{1,120}</g, '><').replace(/\s+/g, ' ').slice(0, 800);
  }
  if (opts.length) {
    const pick = opts.find(el => /Seoul, South Korea/i.test(el.innerText || '')) || opts[0];
    out.pickText = (pick.innerText || '').replace(/\s+/g, ' ').slice(0, 60);
    pick.click();
    await new Promise(r => setTimeout(r, 900));
    out.afterValue = inp.value;
    out.afterExpanded = inp.getAttribute('aria-expanded');
    out.chips = [...entry.querySelectorAll('*')].filter(el => el.children.length === 0 && (el.innerText || '').trim()).map(el => el.innerText.trim().slice(0, 40)).slice(0, 8);
  }
  return JSON.stringify(out);
})()
