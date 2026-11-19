(async () => {
  const box = [...document.querySelectorAll('[class*="ImageUploadInput__Container"]')]
    .find(el => (el.closest('[class*="ApplicationFormInput__Layout"]') || document.body).innerText.includes('증명사진'));
  if (!box) return JSON.stringify({ found: false });
  const c = document.createElement('canvas'); c.width = 45; c.height = 60; c.getContext('2d').fillRect(0, 0, 45, 60);
  const b64 = c.toDataURL('image/jpeg', 0.9).split(',')[1];
  const raw = atob(b64); const u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  const dt = new DataTransfer(); dt.items.add(new File([u8], 'photo.jpg', { type: 'image/jpeg' }));
  const fire = (type, extra = {}) => box.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...extra }));
  fire('dragenter'); fire('dragover'); fire('drop');
  await new Promise(r => setTimeout(r, 1500));
  const imgs = [...box.querySelectorAll('img')].map(i => ({ src: (i.src || '').slice(0, 24), w: i.naturalWidth, h: i.naturalHeight }));
  const text = (box.innerText || '').replace(/\s+/g, ' ').slice(0, 120);
  const files = [...document.querySelectorAll('input[type=file]')].map(i => ({ accept: i.accept, n: i.files.length }));
  return JSON.stringify({ found: true, imgs, text, files });
})()
