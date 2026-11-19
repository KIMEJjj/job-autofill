(async () => {
  const scan = window.__pubScan();
  const result = await window.__pubFill(window.SAMPLE, {});
  document.querySelectorAll('input').forEach(el => { el.value = ''; });
  const empty = await window.__pubFill(Object.assign({}, window.SAMPLE, { name: '', birth: '', phone: '', email: '' }), {});
  return {
    scan: scan.map(x => x.인식),
    result: result.filled + '/' + result.check,
    blankCheck: empty.check,
    yellow: document.querySelectorAll('[data-pubfill="check"]').length
  };
})()
