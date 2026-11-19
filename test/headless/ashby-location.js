(async () => {
  const r = await window.__pubFill(window.SAMPLE, {});
  return JSON.stringify({ result: r.filled + '/' + r.check, value: document.getElementById('loc').value });
})()
