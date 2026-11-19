(async () => {
  const clean = s => (s || '').replace(/\s(value|placeholder|src)="[^"]*"/gi, '').replace(/>[^<>]{1,160}</g, '><').replace(/\s+/g, ' ');
  const el = [...document.querySelectorAll('input[role="combobox"], input')]
    .find(x => (x.placeholder || '') === 'Start typing...' && /Location/.test((x.closest('div[class*="field"], div[class*="Field"]') || x.parentElement?.parentElement || document.body).innerText.slice(0, 200)));
  const out = { found: !!el };
  if (!el) return JSON.stringify(out);
  const holder = el.closest('div[class*="field"], div[class*="Field"]') || el.parentElement.parentElement;
  out.near = clean(holder.outerHTML).slice(0, 1400);
  out.attrs = [...el.attributes].map(a => a.name + '=' + a.value.slice(0, 40));
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  el.focus(); setter.call(el, 'Seoul');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1500));
  out.options = [...document.querySelectorAll('[role="option"], [role="listbox"] li, [class*="option" i]')]
    .map(o => ({ t: (o.innerText || '').trim().slice(0, 50), role: o.getAttribute('role') || '', cls: String(o.className || '').slice(0, 40) }))
    .filter(o => o.t).slice(0, 12);
  out.value = el.value;
  return JSON.stringify(out);
})()
