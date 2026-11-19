(async () => {
  const first = await window.__pubFill(window.SAMPLE, {});
  const openRequested = first.addressSearchOpenRequested === true;
  let picker = null;
  if (openRequested) {
    for (let i = 0; i < 30 && !window.frames.length; i++) await new Promise(resolve => setTimeout(resolve, 100));
    const frame = window.frames[0];
    if (frame && frame.__pubFill) {
      picker = await frame.__pubFill({
        address1: window.SAMPLE.address1,
        zip: window.SAMPLE.zip,
        address2: window.SAMPLE.address2
      }, { addressOnly: true });
    }
  }
  return JSON.stringify({
    openRequested,
    pickerDone: picker?.addressSearchDone === true,
    addressFilled: document.querySelector('[name="currentAddress.address"]').value === window.SAMPLE.address1,
    detailFilled: document.querySelector('[name="currentAddress.detailAddress"]').value === window.SAMPLE.address2
  });
})()
