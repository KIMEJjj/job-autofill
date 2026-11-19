(async () => {
  const r = await window.__pubFill(Object.assign(window.SAMPLE,{militaryType:'현역병'}), {}); await new Promise(z => setTimeout(z, 700)); const r2 = await window.__pubFill(window.SAMPLE, {}); r.filled += r2.filled;
  const ark = window.__pubScan().filter(x => x.종류.startsWith('ark')).map(x => { const b = document.querySelector(`button[name="${x.name}"]`); return x.칸설명 + ' [' + x.인식 + '] → ' + (b ? b.textContent.trim() : '?'); });
  return JSON.stringify({ filled: r.filled, check: r.check, missing: r.missing }) + '\n' + ark.join('\n');
})()
