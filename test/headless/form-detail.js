(async () => {
  const r = await window.__pubFill(window.SAMPLE, {});
  return {
    filled: r.filled,
    check: r.check,
    certificates: [...document.querySelectorAll('[name^="c_"]')].map(el => [el.name, el.value]),
    languages: [...document.querySelectorAll('[name^="l_"]')].map(el => [el.name, el.value])
  };
})()
