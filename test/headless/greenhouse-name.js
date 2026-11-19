(async () => {
  const scan = window.__pubScan();
  const cases = [
    { profile: window.SAMPLE, firstKo: '길동', lastKo: '홍', preferred: 'GILDONG' },
    {
      profile: Object.assign({}, window.SAMPLE, { name: '남궁길동', nameEn: 'NAMGUNG GILDONG' }),
      firstKo: '길동', lastKo: '남궁', preferred: 'GILDONG',
    },
    {
      profile: Object.assign({}, window.SAMPLE, { nameEn: 'HONGGILDONG' }),
      firstKo: '길동', lastKo: '홍', preferred: 'GILDONG',
    },
  ];
  const results = [];
  for (const [i, c] of cases.entries()) {
    const r = await window.__pubFill(c.profile, { overwrite: true });
    const expected = {
      legal_first_name_korean: { field: 'name', value: c.firstKo },
      legal_last_name_korean: { field: 'name', value: c.lastKo },
      preferred_first_name: { field: 'nameEn', value: c.preferred },
      preferred_first_name_english: { field: 'nameEn', value: c.preferred },
    };
    const checks = Object.entries(expected).map(([name, want]) => {
      const input = document.querySelector(`[name="${name}"]`);
      const item = scan.find(x => x.name === name);
      return {
        name,
        mapped: !!item && item.인식 === want.field,
        filled: !!input && input.value === want.value,
      };
    });
    results.push({ case: i + 1, filled: r.filled, checks, ok: checks.every(x => x.mapped && x.filled) });
  }
  return { cases: results, ok: results.every(x => x.ok) };
})()
