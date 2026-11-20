(async()=>{const N=n=>document.querySelector(`[name="${n}"]`);const P='languagesCertificationsAndOtherActivity.';
const scan=window.__pubScan();const k=n=>{const x=scan.find(s=>s.name===n);return x?x.인식:'?'};
const map="zip="+k('personalInformation.currentAddress.postalCode')+" regzip="+k('personalInformation.registeredAddress.postalCode')+" reason="+k('workHistory.workExperiences.0.reasonForResignation')+" langNo="+k(P+'certifiedLanguageTests.0.registrationNumber')+" certNo="+k(P+'certificatesLicenses.0.registrationNumber')+" prog="+k(P+'computerSkills.0.programName')+" host="+k(P+'volunteerExperiences.0.hostOrganization');
const sl=ms=>new Promise(z=>setTimeout(z,ms));
const v=n=>N('personalInformation.currentAddress.'+n).value;const setv=(n,x)=>{N('personalInformation.currentAddress.'+n).value=x};
const g=n=>N('personalInformation.registeredAddress.'+n).value;const clearReg=()=>['postalCode','address','detailedAddress'].forEach(n=>{N('personalInformation.registeredAddress.'+n).value=''});
const r=await window.__pubFill(window.SAMPLE,{});await sl(500);
let out=map+" | z="+v('postalCode')+" a="+v('address')+" d="+v('detailedAddress')+" done="+!!r.addressSearchDone+" open="+!document.getElementById('dlg').hidden+" | reg z="+g('postalCode')+" a="+g('address')+" d="+g('detailedAddress');
// 예전 버전이 주소 글자만 넣어 둔 상태: 검색 상자로 다시 골라 우편번호까지
setv('postalCode','');setv('address',window.SAMPLE.address1);
const r2=await window.__pubFill(window.SAMPLE,{});await sl(500);
out+=" | pre z="+v('postalCode')+" done="+!!r2.addressSearchDone;
// 사용자가 다른 주소를 골라 둔 상태: 그대로 둠
setv('postalCode','');setv('address','서울특별시 중구 을지로 7');
await window.__pubFill(window.SAMPLE,{});await sl(500);
out+=" | other a="+v('address')+" z="+v('postalCode');
// 주민등록지가 다른 주소
clearReg();
await window.__pubFill(Object.assign({},window.SAMPLE,{regSame:'다른 주소',regAddress1:'서울특별시 중구 을지로 7',regAddress2:'3층',regZip:''}),{});await sl(500);
out+=" | regDiff z="+g('postalCode')+" a="+g('address')+" d="+g('detailedAddress');
return out})()
