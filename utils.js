export const $ = (s,root=document)=>root.querySelector(s);
export const escapeHTML = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function toast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;$("#toast-region").append(el);setTimeout(()=>el.remove(),3200);}
export function uid(prefix="id"){return `${prefix}_${Math.random().toString(36).slice(2,10)}`;}
export function setLanguage(lang){document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";}
