(async () => {
  const scan = window.__pubScan();
  const result = await window.__pubFill(window.SAMPLE, {});
  const teaching = window.__pubTeachStart();
  if (window.__pubTeachCancel) window.__pubTeachCancel();
  return {
    ariaScan: scan.filter(x => x.종류.startsWith('aria:')).map(x => x.인식),
    check: result.check,
    yellow: document.querySelectorAll('[data-pubfill="check"]').length,
    teachable: teaching.fields
  };
})()
