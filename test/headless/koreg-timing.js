(async () => {
  const result = await window.__pubFill(window.SAMPLE, {});
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    filled: result.filled,
    validationAlerts: window.ALERTS.length,
    eventOrderOk: document.querySelector('#applicant-name').value === '홍길동'
  };
})()
