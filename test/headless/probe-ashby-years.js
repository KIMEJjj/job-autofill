(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 40 && !document.querySelector('input[type=radio]'); i++) await sleep(500);
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(1200);
  const seen = new Set();
  const out = [];
  for (const r of document.querySelectorAll('input[type=radio]')) {
    const lab = (r.closest('label') || r.parentElement).innerText || '';
    if (!/More than 5 years|Less than 1 year|1-3 years|3-5 years|years of experience/i.test(lab)) continue;
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    const fs = r.closest('fieldset');
    const name = r.name;
    const opts = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(name)}"]`)]
      .map(x => ((x.closest('label') || x.parentElement).innerText || '').replace(/\s+/g, ' ').trim());
    out.push({
      name,
      legend: fs ? (fs.querySelector('legend')?.innerText || '').replace(/\s+/g, ' ').slice(0, 140) : '',
      path: (r.closest('[data-field-path]')?.getAttribute('data-field-path') || ''),
      label: lab.replace(/\s+/g, ' ').slice(0, 80),
      opts,
      parentHtml: (r.closest('[class*="field" i]') || r.parentElement.parentElement).outerHTML
        .replace(/>[^<>]{1,80}</g, '><').replace(/\s+/g, ' ').slice(0, 700),
    });
  }
  return JSON.stringify({ radios: document.querySelectorAll('input[type=radio]').length, out }, null, 1);
})()
