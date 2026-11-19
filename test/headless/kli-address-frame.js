(async () => {
  const results = await Promise.all([
    window.__pubFill(window.SAMPLE, {}),
    window.frames[0].__pubFill(window.SAMPLE, {})
  ]);
  const main = results[0], picker = results[1];
  return JSON.stringify({
    filled: results.reduce((n, result) => n + result.filled, 0),
    parentFallback: main.addrSearch,
    pickerDone: picker.addressSearchDone,
    addressFilled: document.querySelector('[name="currentAddress.address"]').value === window.SAMPLE.address1,
    detailFilled: document.querySelector('[name="currentAddress.detailAddress"]').value === window.SAMPLE.address2
  });
})()
