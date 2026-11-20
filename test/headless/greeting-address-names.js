(async()=>{const N=n=>document.querySelector(`[name="${n}"]`);const sl=ms=>new Promise(z=>setTimeout(z,ms));
const scan=window.__pubScan();const k=n=>{const x=scan.find(s=>s.name===n);return x?x.인식:'?'};
const c=n=>N('personalInformation.currentAddress.'+n).value, g=n=>N('personalInformation.registeredAddress.'+n).value;
const heads=[...document.querySelectorAll('h4')].map(h=>h.textContent).join('/');
const pre="heads="+heads+" regzip="+k('personalInformation.registeredAddress.postalCode')+" regaddr="+k('personalInformation.registeredAddress.address')+" regdet="+k('personalInformation.registeredAddress.detailedAddress');
await window.__pubFill(Object.assign({},window.SAMPLE,{regSame:'다른 주소',regAddress1:'서울특별시 중구 을지로 7',regAddress2:'3층'}),{});await sl(500);
return pre+" | cur z="+c('postalCode')+" a="+c('address')+" d="+c('detailedAddress')+" | reg z="+g('postalCode')+" a="+g('address')+" d="+g('detailedAddress')})()
