import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ROOMS_FILE = path.join(DATA_DIR, "rooms.json");
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.ALLOWED_ORIGIN?.split(",").map(x => x.trim()).filter(Boolean) || true },
  maxHttpBufferSize: 1e6
});
app.use(express.json({ limit: "32kb" }));
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

const seedRooms = [
  { id:"room-tech", name:"عالم التقنية", description:"نقاشات تقنية وابتكارات يومية", icon:"💻", type:"public", maxUsers:50, aiEnabled:true },
  { id:"room-night", name:"سهرات هادئة", description:"مساحة لطيفة للتعارف والحديث", icon:"🌙", type:"public", maxUsers:30, aiEnabled:false },
  { id:"room-ai", name:"مختبر الذكاء الاصطناعي", description:"تجارب وأفكار مع المساعد الذكي", icon:"🤖", type:"ai", maxUsers:50, aiEnabled:true },
  { id:"room-music", name:"موسيقى ومزاج", description:"شاركنا ما تحب الاستماع إليه", icon:"🎧", type:"public", maxUsers:40, aiEnabled:false }
];
let rooms = seedRooms;
const members = new Map(); // socket.id -> { roomId, user }
const histories = new Map();

function persistRooms() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
}
try {
  if (fs.existsSync(ROOMS_FILE)) {
    const stored = JSON.parse(fs.readFileSync(ROOMS_FILE, "utf8"));
    if (Array.isArray(stored)) rooms = stored;
  } else persistRooms();
} catch (error) {
  console.error("Could not load rooms store:", error.message);
}

function roomUsers(roomId) {
  return [...members.entries()]
    .filter(([, m]) => m.roomId === roomId)
    .map(([socketId, m]) => ({ socketId, id:m.user.id, username:m.user.username, avatar:m.user.avatar, handRaised:!!m.user.handRaised, isMuted:!!m.user.isMuted }));
}
function emitRoomState(roomId) {
  io.to(roomId).emit("room:users", roomUsers(roomId));
}
function leaveCurrentRoom(socket) {
  const current = members.get(socket.id);
  if (!current) return;
  socket.leave(current.roomId);
  members.delete(socket.id);
  emitRoomState(current.roomId);
  io.to(current.roomId).emit("peer:left", { socketId: socket.id });
}

app.get("/api/health", (_req, res) => res.json({ ok:true, service:"voiceai-rooms", rooms:rooms.length }));
app.get("/api/ice-servers", (_req, res) => {
  const iceServers = [{ urls:"stun:stun.l.google.com:19302" }];
  const urls = (process.env.TURN_URLS || "").split(",").map(x=>x.trim()).filter(Boolean);
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({ urls, username:process.env.TURN_USERNAME, credential:process.env.TURN_CREDENTIAL });
  }
  res.set("Cache-Control", "no-store").json({ iceServers, turnConfigured:iceServers.length>1 });
});
app.get("/api/rooms", (_req, res) => res.json(rooms.map(r => ({ ...r, users:roomUsers(r.id).length, isActive:true }))));
app.post("/api/rooms", (req, res) => {
  const { name, description="", type="public", maxUsers=30, aiEnabled=false, icon="✨" } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2) return res.status(400).json({ error:"اسم الغرفة يجب ألا يقل عن حرفين" });
  const room = {
    id:randomUUID(), name:name.trim().slice(0,40),
    description:String(description).slice(0,100),
    type:["public","private","ai"].includes(type) ? type : "public",
    maxUsers:Math.max(2, Math.min(100, Number(maxUsers) || 30)),
    aiEnabled:!!aiEnabled, icon:String(icon).slice(0,8)
  };
  rooms.unshift(room);
  persistRooms();
  res.status(201).json({ ...room, users:0, isActive:true });
});

io.on("connection", socket => {
  socket.on("room:join", ({ roomId, user } = {}, ack = () => {}) => {
    try {
      if (!roomId || !user || typeof user.username !== "string" || user.username.trim().length < 2) {
        return ack({ ok:false, error:"بيانات الدخول إلى الغرفة غير صحيحة" });
      }
      const room = rooms.find(r => r.id === roomId);
      if (!room) return ack({ ok:false, error:"الغرفة غير موجودة على الخادم" });
      leaveCurrentRoom(socket);
      const currentUsers = roomUsers(roomId);
      if (currentUsers.length >= Number(room.maxUsers || 50)) return ack({ ok:false, error:"الغرفة ممتلئة" });
      const safeUser = {
        id: String(user.id || randomUUID()),
        username: user.username.trim().slice(0,24),
        avatar: String(user.avatar || user.username.trim()[0]).slice(0,4),
        handRaised:false,
        isMuted:true
      };
      members.set(socket.id, { roomId, user:safeUser });
      socket.join(roomId);
      const peers = roomUsers(roomId).filter(u => u.socketId !== socket.id);
      ack({ ok:true, room:{ ...room, users:peers.length + 1 }, peers, selfId:socket.id });
      emitRoomState(roomId);
      socket.to(roomId).emit("peer:joined", { socketId:socket.id, user:{ id:safeUser.id, username:safeUser.username, avatar:safeUser.avatar } });
    } catch (error) {
      ack({ ok:false, error:"تعذر الانضمام إلى الغرفة" });
    }
  });

  socket.on("room:leave", () => leaveCurrentRoom(socket));
  socket.on("signal", ({ to, description, candidate } = {}) => {
    if (!to || !members.has(socket.id)) return;
    const fromRoom = members.get(socket.id).roomId;
    const target = members.get(to);
    if (!target || target.roomId !== fromRoom) return;
    io.to(to).emit("signal", { from:socket.id, description, candidate });
  });
  socket.on("room:message", ({ content } = {}) => {
    const member = members.get(socket.id);
    if (!member || typeof content !== "string") return;
    const text = content.trim().slice(0,500);
    if (!text) return;
    const message = { id:randomUUID(), sender:member.user.username, content:text, time:new Date().toISOString() };
    const list = histories.get(member.roomId) || [];
    list.push(message);
    histories.set(member.roomId, list.slice(-100));
    io.to(member.roomId).emit("room:message", message);
  });
  socket.on("room:history", (_payload, ack = () => {}) => {
    const member = members.get(socket.id);
    ack(member ? (histories.get(member.roomId) || []).slice(-100) : []);
  });
  socket.on("user:hand", ({ raised } = {}) => {
    const member = members.get(socket.id);
    if (!member) return;
    member.user.handRaised = !!raised;
    emitRoomState(member.roomId);
  });
  socket.on("user:mute", ({ muted } = {}) => {
    const member = members.get(socket.id);
    if (!member) return;
    member.user.isMuted = !!muted;
    emitRoomState(member.roomId);
  });
  socket.on("disconnect", () => leaveCurrentRoom(socket));
});

httpServer.listen(PORT, "0.0.0.0", () => console.log(`VoiceAI Rooms listening on ${PORT}`));
