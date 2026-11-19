(async () => {
  const r = await window.__pubFill(window.SAMPLE, {});
  const scan = window.__pubScan().filter(x => /how did you (come across|hear about|learn about)/i.test(x.칸설명));
  const checks = scan.map(x => {
    const input = [...document.querySelectorAll('input,textarea')]
      .find(el => (el.name || el.id) === x.name);
    return { mapped: x.인식 === 'applySource', filled: !!input && input.value === window.SAMPLE.applySource };
  });
  return { filled: r.filled, count: checks.length, checks, ok: checks.length === 3 && checks.every(x => x.mapped && x.filled) };
})()
