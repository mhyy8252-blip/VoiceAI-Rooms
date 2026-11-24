import { AppState } from "./state.js";
import { toast } from "./utils.js";

let socket = null;
let localStream = null;
let peers = new Map();
let remoteAudio = new Map();
let pendingCandidates = new Map();
let activeRoom = null;
let selfSocketId = null;
let ICE_SERVERS = [{ urls:"stun:stun.l.google.com:19302" }];

function emitSignal(to, data) {
  if (socket?.connected) socket.emit("signal", { to, ...data });
}
function shouldInitiate(peerId) {
  return !!selfSocketId && selfSocketId.localeCompare(peerId) > 0;
}
function createPeer(peerId) {
  if (peers.has(peerId)) return peers.get(peerId);
  const pc = new RTCPeerConnection({ iceServers:ICE_SERVERS });
  peers.set(peerId, pc);
  if (localStream) localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
  pc.onicecandidate = event => {
    if (event.candidate) emitSignal(peerId,{candidate:event.candidate});
  };
  pc.ontrack = event => {
    let audio=remoteAudio.get(peerId);
    if(!audio){
      audio=document.createElement("audio");
      audio.autoplay=true;audio.playsInline=true;audio.dataset.peer=peerId;
      document.body.append(audio);remoteAudio.set(peerId,audio);
    }
    audio.srcObject=event.streams[0];
    audio.play().catch(()=>toast("اضغط على الصفحة للسماح بتشغيل صوت المشاركين"));
  };
  pc.onconnectionstatechange=()=>{
    if(["failed","closed"].includes(pc.connectionState))closePeer(peerId);
  };
  return pc;
}
function closePeer(peerId){
  peers.get(peerId)?.close();peers.delete(peerId);pendingCandidates.delete(peerId);
  const audio=remoteAudio.get(peerId);if(audio)audio.remove();remoteAudio.delete(peerId);
}
async function startOffer(peerId){
  if(!localStream||!shouldInitiate(peerId))return;
  const pc=createPeer(peerId);
  if(pc.signalingState!=="stable")return;
  try{
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    emitSignal(peerId,{description:pc.localDescription});
  }catch(error){console.warn("WebRTC offer failed",error);}
}
async function onSignal({from,description,candidate}={}){
  if(!from)return;
  const pc=createPeer(from);
  try{
    if(description){
      await pc.setRemoteDescription(description);
      if(description.type==="offer"){
        const answer=await pc.createAnswer();
        await pc.setLocalDescription(answer);
        emitSignal(from,{description:pc.localDescription});
      }
      const queued=pendingCandidates.get(from)||[];
      pendingCandidates.delete(from);
      for(const item of queued)await pc.addIceCandidate(item);
    }
    if(candidate){
      if(pc.remoteDescription)await pc.addIceCandidate(candidate);
      else pendingCandidates.set(from,[...(pendingCandidates.get(from)||[]),candidate]);
    }
  }catch(error){console.warn("WebRTC signaling error",error);}
}
function ensureSocket(){
  if(socket)return socket;
  if(!window.io)throw new Error("تعذر تحميل مكتبة الاتصال. حدّث الصفحة.");
  socket=window.io({transports:["websocket","polling"]});
  socket.on("connect",()=>{if(activeRoom)joinServerRoom(activeRoom).catch(e=>toast(e.message));});
  socket.on("signal",onSignal);
  socket.on("peer:joined",peer=>{if(localStream&&shouldInitiate(peer.socketId))startOffer(peer.socketId);});
  socket.on("peer:left",({socketId})=>closePeer(socketId));
  socket.on("room:users",users=>window.dispatchEvent(new CustomEvent("voiceai:users",{detail:users})));
  socket.on("room:message",message=>window.dispatchEvent(new CustomEvent("voiceai:message",{detail:message})));
  socket.on("connect_error",()=>toast("تعذر الاتصال بالخادم؛ تحقق من رابط النشر"));
  return socket;
}
function joinServerRoom(roomId){
  return new Promise((resolve,reject)=>{
    const user=AppState.get("user");
    socket.emit("room:join",{roomId,user},async result=>{
      if(!result?.ok)return reject(new Error(result?.error||"تعذر دخول الغرفة"));
      selfSocketId=result.selfId;activeRoom=roomId;
      window.dispatchEvent(new CustomEvent("voiceai:users",{detail:[...(result.peers||[]),{
        socketId:selfSocketId,id:user.id,username:user.username,avatar:user.avatar,isMuted:!localStream,handRaised:false
      }]}));
      for(const peer of result.peers||[]){
        createPeer(peer.socketId);
        if(localStream&&shouldInitiate(peer.socketId))await startOffer(peer.socketId);
      }
      resolve(result);
    });
  });
}
export async function connectToRoom(roomId){
  try{
    const config=await fetch("/api/ice-servers").then(r=>r.json());
    if(Array.isArray(config.iceServers))ICE_SERVERS=config.iceServers;
    window.dispatchEvent(new CustomEvent("voiceai:ice-config",{detail:config}));
  }catch{}
  const s=ensureSocket();
  if(!s.connected)await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("انتهت مهلة الاتصال بالخادم")),12000);
    s.once("connect",()=>{clearTimeout(timer);resolve();});
    s.once("connect_error",error=>{clearTimeout(timer);reject(error);});
  });
  return joinServerRoom(roomId);
}
export function setLocalStream(stream){
  localStream=stream;
  for(const [peerId,pc] of peers){
    if(stream){
      const sender=pc.getSenders().find(item=>item.track?.kind==="audio");
      const track=stream.getAudioTracks()[0];
      if(sender&&track)sender.replaceTrack(track).catch(console.warn);
      else stream.getTracks().forEach(item=>pc.addTrack(item,stream));
    }else{
      pc.getSenders().filter(item=>item.track?.kind==="audio").forEach(item=>item.replaceTrack(null).catch(console.warn));
    }
  }
  socket?.emit("user:mute",{muted:!stream});
  if(stream)for(const peerId of peers.keys())startOffer(peerId);
}
export function setMuted(muted){socket?.emit("user:mute",{muted});}
export function setHandRaised(raised){socket?.emit("user:hand",{raised});}
export function getRealtimeSocket(){return socket;}
export function sendRealtimeMessage(content){
  if(!socket?.connected)throw new Error("الاتصال بالخادم غير متاح");
  socket.emit("room:message",{content});
}
export function leaveRealtimeRoom(){
  if(socket?.connected)socket.emit("room:leave");
  for(const peerId of [...peers.keys()])closePeer(peerId);
  if(localStream)localStream.getTracks().forEach(track=>track.stop());
  localStream=null;activeRoom=null;selfSocketId=null;
}
