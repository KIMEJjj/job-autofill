(async () => {
  const scan = window.__pubScan();
  const result = await window.__pubFill(window.SAMPLE, {});
  return JSON.stringify({
    filled: result.filled,
    check: result.check,
    addressSearch: result.addrSearch,
    reason: result.addressSearchReason,
    searchRecognized: scan.some(item => item.name === 'postcodify_test' && item.인식 === 'postcodifySearch'),
    searchedQuery: window.__searchedQuery === window.SAMPLE.address1,
    sampleHasDetail: !!window.SAMPLE.address2,
    addressFilled: document.querySelector('[name="currentAddress.address"]').value === window.SAMPLE.address1,
    detailFilled: document.querySelector('[name="currentAddress.detailAddress"]').value === window.SAMPLE.address2,
    modalDetailFilled: document.querySelector('[name="modalDetail"]').value === window.SAMPLE.address2,
    savedDetailEvent: window.__savedModalDetail === window.SAMPLE.address2,
    confirmedSave: window.__confirmedSave === true
  });
})()
