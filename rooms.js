import {AppState} from "./state.js";
import {uid} from "./utils.js";
export async function loadRooms(){
  try {
    const response = await fetch("/api/rooms");
    if (!response.ok) throw new Error("تعذر تحميل الغرف");
    const rooms = await response.json();
    AppState.set("rooms", rooms);
    return rooms;
  } catch (error) {
    console.warn("Using cached room list:", error);
    return AppState.get("rooms");
  }
}
export async function createRoom(data){
  const response = await fetch("/api/rooms", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(result.error || "تعذر إنشاء الغرفة");
  AppState.set("rooms",[result,...AppState.get("rooms").filter(r=>r.id!==result.id)]);
  AppState.log("room_created",result.name);
  return result;
}
export function joinRoom(id){
  const room=AppState.get("rooms").find(r=>r.id===id);
  if(!room||!room.isActive)throw new Error("الغرفة غير متاحة");
  AppState.set("activeRoomId",id);
  AppState.log("room_joined",room.name);
  return room;
}
export function leaveRoom(){AppState.set("activeRoomId",null);}
export function sendRoomMessage(roomId,content){
  const all={...AppState.get("messages")};
  all[roomId]=[...(all[roomId]||[]),{id:uid("msg"),sender:AppState.get("user")?.username||"ضيف",content,time:new Date().toISOString()}].slice(-200);
  AppState.set("messages",all);
}
