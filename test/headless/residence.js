(async()=>{const v=id=>{const e=document.getElementById(id);return e.tagName==='SELECT'?(e.selectedIndex>0?e.options[e.selectedIndex].text:''):e.value};const q=()=>(document.querySelector('[name=seoul]:checked')||{value:'none'}).value;
const r=await window.__pubFill(window.SAMPLE,{});const a="a="+v('q1')+" l="+v('q2')+" t="+v('q3')+" c="+v('city')+" q="+q()+" miss="+r.missing.filter(m=>/거주/.test(m)).join(',')+" e5="+v('q5')+" e6="+v('q6')+" rs="+(r.rsTargets||[]).map(t=>t.field).join(',')+" mail="+v('mail');
document.querySelector('form').reset();
const r2=await window.__pubFill(Object.assign({},window.SAMPLE,{address1:'Friedrichstrasse 1, Berlin',addressEn:''}),{overwrite:true});
return a+" | foreign a="+v('q1')+" l="+v('q2')+" t="+v('q3')+" miss="+r2.missing.filter(m=>/거주/.test(m)).join(',')})()
