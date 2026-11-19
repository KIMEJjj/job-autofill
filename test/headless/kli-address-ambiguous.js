(async () => {
  const result = await window.__pubFill(window.SAMPLE, {});
  return JSON.stringify({
    check: result.check,
    addressSearch: result.addrSearch,
    reason: result.addressSearchReason,
    addressUnchanged: document.querySelector('[name="currentAddress.address"]').value === '',
    modalStillOpen: getComputedStyle(document.getElementById('postcode-dialog')).display !== 'none'
  });
})()
