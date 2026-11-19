(async () => {
  const r = await window.__pubFill(window.SAMPLE, {});
  const wanted = window.__pubScan().filter(x =>
    /legal.*(first|last).*korean|preferred.*first.*name/i.test(x.칸설명)
  );
  const expected = wanted.map(x => {
    const label = x.칸설명.toLowerCase();
    const value = label.includes('legal first name') ? '길동'
      : label.includes('legal last name') ? '홍' : 'GILDONG';
    const input = [...document.querySelectorAll('input,textarea')]
      .find(el => (el.name || el.id) === x.name);
    return {
      label: x.칸설명,
      mapped: x.인식,
      kind: x.종류,
      name: x.name,
      filled: !!input && input.value === value,
    };
  });
  return {
    filled: r.filled,
    nameFields: expected,
    ok: expected.length === 4
      && expected.every(x => x.filled && (
        /legal/i.test(x.label) ? x.mapped === 'name' : x.mapped === 'nameEn'
      )),
  };
})()
