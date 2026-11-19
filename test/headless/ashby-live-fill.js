(async () => {
  const r = await window.__pubFill(window.SAMPLE, {});
  const el = document.querySelector('[data-field-path="_systemfield_location"] input');
  return JSON.stringify({ filled: r.filled, check: r.check, loc: el ? el.value : '(none)', missing: (r.missing || []).slice(0, 8) });
})()
