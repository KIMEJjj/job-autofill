(async () => {
  const result = await window.__pubFill(window.SAMPLE, {});
  return JSON.stringify({
    filled: result.filled,
    check: result.check,
    addressSearch: result.addrSearch,
    addressFilled: document.querySelector('[name="currentAddress.address"]').value === window.SAMPLE.address1,
    detailFilled: document.querySelector('[name="currentAddress.detailAddress"]').value === window.SAMPLE.address2
  });
})()
