(async () => {
  const r = await window.__pubFill(window.SAMPLE, {});
  const v = id => document.getElementById(id).value;
  return JSON.stringify({
    filled: r.filled,
    check: r.check,
    twitter: v('twitter'),
    linkedin: v('linkedin'),
    github: v('github'),
    portfolio: v('portfolio'),
    companyTwitter: v('other-social'),
    twitterUsername: v('other-name'),
  });
})()
