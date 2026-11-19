(async () => {
  const c = document.createElement('canvas'); c.width = 45; c.height = 60; c.getContext('2d').fillRect(0, 0, 45, 60);
  window.SAMPLE.photo = c.toDataURL('image/jpeg', 0.9);
  const r = await window.__pubFill(window.SAMPLE, {});
  const got = [...document.querySelectorAll('input[type=file]')].map(i => (i.id || i.name) + ':' + i.files.length);
  return JSON.stringify({ photo: r.photo, files: got, changes: window.__changes, name: document.getElementById('nm').value ? 'filled' : 'empty' });
})()
