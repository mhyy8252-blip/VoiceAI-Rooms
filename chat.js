import {sendAIRequest} from "./ai.js";
import {speak} from "./voice.js";
import {toast} from "./utils.js";
export async function askAssistant(input,output,mode="text"){
 const prompt=input.value.trim();if(!prompt)return;output.insertAdjacentHTML("beforeend",`<div class="message"><small>أنت</small>${escapeText(prompt)}</div>`);input.value="";
 const loading=document.createElement("div");loading.className="message";loading.textContent="المساعد يفكر...";output.append(loading);
 try{const answer=await sendAIRequest(prompt);loading.remove();const row=document.createElement("div");row.className="message";row.innerHTML=`<small>🤖 VoiceAI Assistant</small><div>${escapeText(answer)}</div>`;const speakBtn=document.createElement("button");speakBtn.className="btn secondary";speakBtn.textContent="🔊 استمع";speakBtn.onclick=()=>speak(answer);row.append(speakBtn);output.append(row);output.scrollTop=output.scrollHeight;if(mode==="voice")speak(answer);}
 catch(e){loading.textContent=e.message;toast(e.message);}
}
function escapeText(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
