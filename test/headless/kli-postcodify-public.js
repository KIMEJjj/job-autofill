(async () => {
  for (let i = 0; i < 50 && !document.querySelector('.postcodify_search_controls input.keyword'); i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!window.__pubFill || !document.querySelector('.postcodify_search_controls input.keyword')) {
    return JSON.stringify({ widgetReady: false });
  }
  const result = await window.__pubFill(window.SAMPLE, {});
  const rows = [...document.querySelectorAll('.postcodify_search_result')];
  const resultZips = rows.map(row => String(row.querySelector('.code5')?.textContent || '').replace(/\D/g, ''));
  const matchingRows = resultZips.filter(zip => zip === window.SAMPLE.zip);
  return JSON.stringify({
    widgetReady: true,
    filled: result.filled,
    check: result.check,
    reason: result.addressSearchReason,
    resultCount: rows.length,
    matchingZipCount: matchingRows.length,
    resultZips,
    addressSearchDone: result.addressSearchDone === true,
    addressFilled: document.querySelector('[name="currentAddress.address"]').value !== '',
    detailFilled: document.querySelector('[name="currentAddress.detailAddress"]').value === window.SAMPLE.address2
  });
})()
