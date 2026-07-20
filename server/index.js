
import express from "express";
import http from "http";
import { Server } from "socket.io";
import {
  createInitialGame, startContract, playCard, nextRound, publicState
} from "./game-engine.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const socketSessions = new Map();

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? roomCode() : code;
}

function roomPayload(room, socketId) {
  const playerIndex = room.players.findIndex(player => player.socketId === socketId || player.sessionId === socketSessions.get(socketId)?.sessionId);
  if (playerIndex < 0) return null;
  return room.game
    ? publicState(room.game, playerIndex, room.players.map(player => player.name), room.code, room.hostSessionId)
    : {
        roomCode: room.code,
        names: room.players.map(player => player.name),
        playerIndex,
        hostId: room.hostSessionId,
        phase: "lobby"
      };
}

function broadcastRoom(room, event = null) {
  for (const player of room.players) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit("room-state", roomPayload(room, player.socketId));
    if (event) io.to(player.socketId).emit("game-event", event);
  }
}

function normalizeName(value) {
  return String(value || "Igrač").trim().slice(0, 18) || "Igrač";
}

io.on("connection", socket => {
  socket.on("create-room", ({ name, sessionId }, callback) => {
    try {
      const code = roomCode();
      const id = sessionId || crypto.randomUUID();
      const room = {
        code,
        players: [{ name: normalizeName(name), sessionId: id, socketId: socket.id }],
        hostSessionId: id,
        game: null
      };
      rooms.set(code, room);
      socketSessions.set(socket.id, { roomCode: code, sessionId: id });
      socket.join(code);
      callback?.({ ok: true, code, sessionId: id });
      broadcastRoom(room);
    } catch (error) {
      callback?.({ ok: false, error: error.message });
    }
  });

  socket.on("join-room", ({ code, name, sessionId }, callback) => {
    try {
      const normalizedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(normalizedCode);
      if (!room) throw new Error("Soba ne postoji.");

      const id = sessionId || crypto.randomUUID();
      let player = room.players.find(item => item.sessionId === id);

      if (!player) {
        if (room.game) throw new Error("Partija je već počela.");
        if (room.players.length >= 4) throw new Error("Soba je puna.");
        player = { name: normalizeName(name), sessionId: id, socketId: socket.id };
        room.players.push(player);
      } else {
        player.socketId = socket.id;
        player.name = normalizeName(name || player.name);
      }

      socketSessions.set(socket.id, { roomCode: normalizedCode, sessionId: id });
      socket.join(normalizedCode);
      callback?.({ ok: true, code: normalizedCode, sessionId: id });
      broadcastRoom(room);
    } catch (error) {
      callback?.({ ok: false, error: error.message });
    }
  });

  socket.on("start-game", (_payload, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);
      if (!room) throw new Error("Nisi u sobi.");
      if (room.hostSessionId !== session.sessionId) throw new Error("Samo host može pokrenuti partiju.");
      if (room.players.length !== 4) throw new Error("Potrebna su točno 4 igrača.");
      room.game = createInitialGame(room.players.map(player => player.sessionId));
      callback?.({ ok: true });
      broadcastRoom(room);
    } catch (error) { callback?.({ ok: false, error: error.message }); }
  });

  socket.on("choose-contract", ({ contractIndex }, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);
      if (!room?.game) throw new Error("Partija nije pokrenuta.");
      const playerIndex = room.players.findIndex(player => player.sessionId === session.sessionId);
      if (playerIndex !== room.game.dealer) throw new Error("Samo djelitelj bira miniigru.");
      startContract(room.game, Number(contractIndex));
      callback?.({ ok: true });
      broadcastRoom(room);
    } catch (error) { callback?.({ ok: false, error: error.message }); }
  });

  socket.on("play-card", ({ cardId }, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);
      if (!room?.game) throw new Error("Partija nije pokrenuta.");
      const playerIndex = room.players.findIndex(player => player.sessionId === session.sessionId);
      const event = playCard(room.game, playerIndex, cardId);
      callback?.({ ok: true });
      broadcastRoom(room, event);
    } catch (error) { callback?.({ ok: false, error: error.message }); }
  });

  socket.on("next-round", (_payload, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);
      if (!room?.game) throw new Error("Partija nije pokrenuta.");
      const playerIndex = room.players.findIndex(player => player.sessionId === session.sessionId);
      if (playerIndex !== room.game.dealer) throw new Error("Samo djelitelj nastavlja.");
      nextRound(room.game);
      callback?.({ ok: true });
      broadcastRoom(room);
    } catch (error) { callback?.({ ok: false, error: error.message }); }
  });

  socket.on("disconnect", () => {
    const session = socketSessions.get(socket.id);
    socketSessions.delete(socket.id);
    if (!session) return;
    const room = rooms.get(session.roomCode);
    if (!room) return;
    const player = room.players.find(item => item.sessionId === session.sessionId);
    if (player) player.socketId = null;
    broadcastRoom(room);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => console.log(`Lorum Club radi na portu ${port}`));
