(async () => {
  const scan = window.__pubScan();
  const hanja = scan.find(item => item.name === 'chineseName');
  const talent = scan.find(item => item.name === 'personalInfo[1].selectedItem');
  const profile = { ...window.SAMPLE, nameHanja: '測試', localTalent: '대상' };
  const result = await window.__pubFill(profile, {});
  await new Promise(resolve => setTimeout(resolve, 80));
  return JSON.stringify({
    englishRecognized: scan.some(item => item.name === 'englishName' && item.인식 === 'nameEn'),
    hanjaRecognized: hanja?.인식 === 'nameHanja',
    hanjaFilled: document.querySelector('[name="chineseName"]').value === profile.nameHanja,
    localTalentRecognized: talent?.인식 === 'localTalent',
    localTalentFilled: document.querySelector('[name="personalInfo[1].selectedItem"]').value === profile.localTalent,
    filled: result.filled,
    check: result.check
  });
})()
