(async () => {
  const entry = document.querySelector('[data-field-path="_systemfield_location"]');
  const inp = entry.querySelector('input[role="combobox"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  inp.focus(); setter.call(inp, 'Seoul');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1800));
  const lb = document.querySelector('[role="listbox"]');
  const out = { found: !!lb };
  if (!lb) return JSON.stringify(out);
  out.cls = String(lb.className).slice(0, 80);
  out.html = lb.outerHTML.replace(/>[^<>]{1,80}</g, '><').replace(/\s+/g, ' ').slice(0, 1200);
  out.walk = [];
  const walk = (el, d) => {
    if (d > 4 || out.walk.length > 30) return;
    out.walk.push({ d, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', cls: String(el.className || '').slice(0, 60), text: (el.children.length ? '' : (el.innerText || '').trim().slice(0, 40)) });
    [...el.children].forEach(c => walk(c, d + 1));
  };
  walk(lb, 0);
  const cand = [...lb.querySelectorAll('*')].filter(el => el.children.length === 0 && /Seoul, South Korea/i.test(el.innerText || ''));
  out.leaf = cand.slice(0, 4).map(el => ({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', cls: String(el.className || '').slice(0, 70), text: el.innerText.trim().slice(0, 40), parentRole: el.parentElement.getAttribute('role') || '', parentCls: String(el.parentElement.className || '').slice(0, 60) }));
  const target = cand[0];
  if (target) {
    const clickable = target.closest('[role="option"]') || target.parentElement;
    out.clickable = { tag: clickable.tagName.toLowerCase(), role: clickable.getAttribute('role') || '', cls: String(clickable.className || '').slice(0, 70) };
    clickable.click();
    await new Promise(r => setTimeout(r, 1000));
    out.afterValue = inp.value;
    out.afterExpanded = inp.getAttribute('aria-expanded');
    out.afterText = (entry.innerText || '').replace(/\s+/g, ' ').slice(0, 80);
  }
  return JSON.stringify(out);
})()
