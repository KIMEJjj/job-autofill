// 시험용 가짜 chrome.storage (메모리)
(function(){ const mk=()=>{const m={};return{_m:m,async get(k){const ks=Array.isArray(k)?k:[k];const o={};ks.forEach(x=>{if(x in m)o[x]=JSON.parse(JSON.stringify(m[x]))});return o},async set(o){Object.assign(m,JSON.parse(JSON.stringify(o)))},async remove(k){(Array.isArray(k)?k:[k]).forEach(x=>delete m[x])},onChanged:{addListener(){},removeListener(){}}}};
window.chrome={storage:{local:mk(),session:mk(),onChanged:{addListener(){},removeListener(){}}},runtime:{openOptionsPage(){},sendMessage:async()=>({}),onMessage:{addListener(){},removeListener(){}}}}; })();
