(async () => {
  const result = await window.__pubFill(window.PROFILE, {});
  return {
    filled: result.filled,
    issuer: document.querySelector('#issuer').value,
    number: document.querySelector('#number').value,
    date: document.querySelector('#date').value
  };
})()
