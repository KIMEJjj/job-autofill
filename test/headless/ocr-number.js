(() => {
  return window.RESULT.map(items => {
    const cert = items[0] || {};
    return { name: cert.name, number: cert.number, issuer: cert.issuer };
  });
})()
