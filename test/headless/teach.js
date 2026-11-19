(async () => {
  const input = document.querySelector('#custom-field');
  const radio = document.querySelector('input[name="custom-choice"]');
  const first = await window.__pubFill(window.SAMPLE, {});
  const fingerprint = input.__pubfillFingerprint;
  const radioFingerprint = radio.__pubfillFingerprint;
  const second = await window.__pubFill(window.SAMPLE, {
    fieldMappings: { [location.host]: { [fingerprint]: 'name', [radioFingerprint]: 'gender' } }
  });
  return {
    firstCheck: first.check,
    mappedFilled: second.filled,
    value: input.value,
    radioChecked: radio.checked,
    fingerprint
  };
})()
