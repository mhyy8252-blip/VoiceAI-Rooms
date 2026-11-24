import {AppState} from "./state.js";
const PROVIDERS={
 google:{name:"Google Gemini",models:["gemini-2.0-flash","gemini-2.5-flash"],defaultModel:"gemini-2.0-flash",
  endpoint:(m,key)=>`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`,
  headers:()=>({"Content-Type":"application/json"}),
  body:(model,messages,s,max,t)=>({system_instruction:{parts:[{text:s}]},contents:messages.map(x=>({role:x.role==="assistant"?"model":"user",parts:[{text:x.content}]})),generationConfig:{maxOutputTokens:max,temperature:t}}),
  parse:d=>d.candidates?.[0]?.content?.parts?.[0]?.text||""},
 openai:{name:"OpenAI",models:["gpt-4o-mini"],defaultModel:"gpt-4o-mini",endpoint:()=>"https://api.openai.com/v1/chat/completions",
  headers:k=>({"Content-Type":"application/json",Authorization:`Bearer ${k}`}),
  body:(m,msg,s,max,t)=>({model:m,max_tokens:max,temperature:t,messages:[{role:"system",content:s},...msg]}),parse:d=>d.choices?.[0]?.message?.content||""},
 anthropic:{name:"Anthropic",models:["claude-haiku-5-5","claude-sonnet-4-6"],defaultModel:"claude-haiku-5-5",endpoint:()=>"https://api.anthropic.com/v1/messages",
  headers:k=>({"Content-Type":"application/json","x-api-key":k,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"}),
  body:(m,msg,s,max,t)=>({model:m,max_tokens:max,temperature:t,system:s,messages:msg}),parse:d=>d.content?.[0]?.text||""}
};
const cache=new Map(), requestTimes=new Map();
export const PROVIDER_MODELS=Object.fromEntries(Object.entries(PROVIDERS).map(([k,v])=>[k,v.models]));
function rateLimit(){const id=AppState.get("user")?.id||"guest",now=Date.now(),recent=(requestTimes.get(id)||[]).filter(t=>now-t<60000);if(recent.length>=20)throw new Error("تجاوزت حد الطلبات — انتظر دقيقة");recent.push(now);requestTimes.set(id,recent);}
export async function sendAIRequest(message,history=[]){
 const s=AppState.get("aiSettings"),p=PROVIDERS[s.provider];if(!p)throw new Error("مزود AI غير معروف");
 const key=s.keys?.[s.provider];if(!key)throw new Error(`أدخل مفتاح API الخاص بـ ${p.name} من مركز التحكم`);
 rateLimit();const cacheKey=`${s.provider}:${s.model}:${message.trim().toLowerCase()}`;if(cache.has(cacheKey))return cache.get(cacheKey);
 const messages=[...history,{role:"user",content:message}];
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(p.endpoint(s.model,key),{method:"POST",headers:p.headers(key),body:JSON.stringify(p.body(s.model,messages,s.systemPrompt,Math.min(2000,Number(s.maxTokens)||500),Number(s.temperature)||0.7)),signal:controller.signal});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error?.message||`فشل الطلب: ${response.status}`);
  const result=p.parse(data);if(!result)throw new Error("لم يصل رد من مزود AI");cache.set(cacheKey,result);setTimeout(()=>cache.delete(cacheKey),300000);return result;
 }finally{clearTimeout(timeout);}
}
export async function sendWithFallback(message,history=[]){
 const chain=[["google","gemini-2.0-flash"],["openai","gpt-4o-mini"],["anthropic","claude-haiku-5-5"]],original=AppState.get("aiSettings");
 for(const [provider,model] of chain){try{if(!original.keys?.[provider])continue;AppState.set("aiSettings",{...original,provider,model});const result=await sendAIRequest(message,history);if(provider!==original.provider)AppState.set("aiSettings",original);return result;}catch(e){console.warn("AI fallback",provider,e.message);}}
 AppState.set("aiSettings",original);throw new Error("AI غير متاح حالياً أو لم تُضف مفاتيح المزودين الاحتياطيين");
}
export function availableProviders(){return PROVIDERS;}
