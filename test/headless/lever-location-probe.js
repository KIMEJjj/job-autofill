(async () => {
  const out = [];
  for (const s of document.querySelectorAll('select')) {
    const lab = (s.closest('.application-question') || s.closest('li') || s.parentElement.parentElement || document.body).innerText || '';
    if (!/location/i.test(lab.slice(0, 200))) continue;
    out.push({ name: s.name, label: lab.replace(/\s+/g, ' ').slice(0, 80), options: [...s.options].slice(0, 12).map(o => o.text.trim()) });
  }
  // 선택 목록이 버튼형인 경우
  for (const b of document.querySelectorAll('button[role="combobox"], [role="combobox"]')) {
    const lab = (b.closest('.application-question') || b.closest('li') || document.body).innerText || '';
    if (!/location/i.test(lab.slice(0, 200))) continue;
    out.push({ tag: b.tagName, role: b.getAttribute('role'), label: lab.replace(/\s+/g, ' ').slice(0, 80), value: (b.innerText || '').slice(0, 60) });
  }
  return JSON.stringify(out);
})()
