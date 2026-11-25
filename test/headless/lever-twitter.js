(async () => {
  const r = await window.__pubFill(window.SAMPLE, {});
  const el = document.querySelector('input[name="urls[Twitter]"]');
  const scan = window.__pubScan().find(x => x.name === 'urls[Twitter]');
  return JSON.stringify({
    found: !!el,
    field: scan ? scan.인식 : '-',
    value: el ? el.value : '',
    filled: r.filled,
    check: r.check,
  });
})()
