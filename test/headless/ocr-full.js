(async () => {
  const r = await window.run();
  return JSON.stringify(r.res.map(file => ({
    file: file.file,
    error: file.error || '',
    items: file.items.map(({ name, number, date, issuer }) => ({ name, number, date, issuer }))
  })));
})()
