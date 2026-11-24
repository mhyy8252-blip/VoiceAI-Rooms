import {AppState} from "./state.js";
import {toast} from "./utils.js";
import {setLocalStream} from "./realtime.js";
let stream=null, audioContext=null, analyser=null, raf=0;
export async function toggleMicrophone(button){
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;setLocalStream(null);cancelAnimationFrame(raf);button.textContent="🎤 تشغيل الميكروفون";toast("تم إيقاف الميكروفون");return;}
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    audioContext=new (window.AudioContext||window.webkitAudioContext)();analyser=audioContext.createAnalyser();analyser.fftSize=256;
    audioContext.createMediaStreamSource(stream).connect(analyser);setLocalStream(stream);button.textContent="🔇 إيقاف الميكروفون";toast("الميكروفون يعمل على هذا الجهاز");
    const data=new Uint8Array(analyser.frequencyBinCount);const meter=document.querySelector("#mic-level");
    const draw=()=>{if(!stream)return;analyser.getByteFrequencyData(data);const avg=data.reduce((a,b)=>a+b,0)/data.length;if(meter)meter.style.width=Math.min(100,avg*1.8)+"%";raf=requestAnimationFrame(draw);};draw();
  }catch(e){toast("تعذر الوصول للميكروفون: "+e.message);}
}
export function toggleHand(){const user={...AppState.get("user"),handRaised:!AppState.get("user")?.handRaised};AppState.set("user",user);import("./realtime.js").then(m=>m.setHandRaised(user.handRaised));toast(user.handRaised?"تم رفع اليد":"تم إنزال اليد");}
export function speak(text,lang="ar"){if(!("speechSynthesis" in window)){toast("ميزة النطق غير مدعومة");return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang==="ar"?"ar-SA":"en-US";speechSynthesis.speak(u);}

export function stopMicrophone(){
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}
  cancelAnimationFrame(raf);
  setLocalStream(null);
  const meter=document.querySelector("#mic-level");if(meter)meter.style.width="0%";
  const button=document.querySelector("#mic-toggle");if(button)button.textContent="🎤 تشغيل الميكروفون";
}
