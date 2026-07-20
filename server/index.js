
import express from "express";
import http from "http";
import crypto from "crypto";
import { Server } from "socket.io";
import {
  createInitialGame,
  startContract,
  startPendingContract,
  playCard,
  legalCards,
  publicState,
  CONTRACTS
} from "./game-engine.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok:true }));

const rooms = new Map();
const socketSessions = new Map();
const introTimers = new Map();
const botTimers = new Map();

const BOT_NAMES = ["Marta AI", "Ivan AI", "Lea AI", "Dino AI", "Nina AI"];

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? createRoomCode() : code;
}

function normalizeName(value) {
  return String(value || "Igrač").trim().slice(0,18) || "Igrač";
}

function normalizeMode(value) {
  return ["ordered","random","manual"].includes(value) ? value : "ordered";
}

function makeBot(room) {
  const usedNames = new Set(room.players.map(player => player.name));
  const name = BOT_NAMES.find(candidate => !usedNames.has(candidate)) || `AI ${room.players.length + 1}`;

  return {
    name,
    sessionId:`bot-${crypto.randomUUID()}`,
    socketId:null,
    isBot:true
  };
}

function playerIndexFor(room, socketId) {
  const session = socketSessions.get(socketId);
  return room.players.findIndex(player =>
    player.socketId === socketId ||
    (session && player.sessionId === session.sessionId)
  );
}

function roomPayload(room, socketId) {
  const playerIndex = playerIndexFor(room, socketId);
  if (playerIndex < 0) return null;

  const common = {
    roomCode:room.code,
    names:room.players.map(player => player.name),
    bots:room.players.map(player => Boolean(player.isBot)),
    connected:room.players.map(player => Boolean(player.socketId) || Boolean(player.isBot)),
    playerIndex,
    hostId:room.hostSessionId,
    selectionMode:room.selectionMode
  };

  if (!room.game) {
    return { ...common, phase:"lobby" };
  }

  return {
    ...publicState(
      room.game,
      playerIndex,
      room.players.map(player => player.name),
      room.code,
      room.hostSessionId,
      room.selectionMode
    ),
    bots:common.bots,
    connected:common.connected
  };
}

function broadcastRoom(room, event = null) {
  for (const player of room.players) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit("room-state", roomPayload(room, player.socketId));
    if (event) io.to(player.socketId).emit("game-event", event);
  }
}

function clearBotTimer(roomCode) {
  clearTimeout(botTimers.get(roomCode));
  botTimers.delete(roomCode);
}

function scheduleIntro(room) {
  if (!room.game || room.game.phase !== "round-intro") return;

  clearTimeout(introTimers.get(room.code));
  const timer = setTimeout(() => {
    if (!room.game || room.game.phase !== "round-intro") return;

    try {
      startPendingContract(room.game);
      broadcastRoom(room, {
        event:"round-started",
        contractIndex:room.game.contractIndex
      });
      scheduleBotAction(room);
    } catch (error) {
      console.error(error);
    }
  }, 2600);

  introTimers.set(room.code, timer);
}

function chooseBotContract(room, dealerIndex) {
  if (!room.game || room.game.phase !== "contract") return;
  if (!room.players[dealerIndex]?.isBot) return;

  const used = new Set(room.game.usedContracts[dealerIndex]);
  const remaining = [0,1,2,3,4,5,6].filter(index => !used.has(index));

  // Medium AI: prefer contract based on hand shape, but keep some randomness.
  const hand = room.game.hands[dealerIndex] || [];
  const hearts = hand.filter(card => card.suit === "hearts").length;
  const queens = hand.filter(card => card.rank === "Q").length;
  const hasKingHeart = hand.some(card => card.id === "K-hearts");
  const hasJackClubs = hand.some(card => card.id === "J-clubs");

  const scoreFor = index => {
    const id = CONTRACTS[index].id;
    let score = Math.random() * 2;

    if (id === "hearts") score += 4 - hearts;
    if (id === "queens") score += 4 - queens * 1.5;
    if (id === "king-last") score += hasKingHeart ? -3 : 2;
    if (id === "jack-clubs") score += hasJackClubs ? -3 : 2;
    if (id === "maximum") score += hand.filter(card => card.value >= 12).length * 0.4;
    if (id === "minimum") score += hand.filter(card => card.value <= 9).length * 0.3;
    if (id === "sequence") score += 1;

    return score;
  };

  const choice = remaining
    .map(index => ({ index, score:scoreFor(index) }))
    .sort((a,b) => b.score - a.score)[0].index;

  setTimeout(() => {
    if (!room.game || room.game.phase !== "contract") return;

    try {
      startContract(room.game, choice);
      broadcastRoom(room, {
        event:"round-started",
        contractIndex:choice
      });
      scheduleBotAction(room);
    } catch (error) {
      console.error(error);
    }
  }, 900 + Math.floor(Math.random() * 700));
}

function cardRisk(game, card) {
  const contractId = game.contractIndex === null ? null : CONTRACTS[game.contractIndex].id;
  let score = card.value;

  if (contractId === "minimum") score += card.value * 0.6;
  if (contractId === "maximum") score -= card.value * 0.9;

  if (contractId === "hearts") {
    if (card.suit === "hearts") score += 8;
    score += card.value * 0.3;
  }

  if (contractId === "queens") {
    if (card.rank === "Q") score += 12;
    score += card.value * 0.25;
  }

  if (contractId === "king-last") {
    if (card.id === "K-hearts") score += 18;
    score += card.value * 0.25;
  }

  if (contractId === "jack-clubs") {
    if (card.id === "J-clubs") score += 18;
    score += card.value * 0.25;
  }

  return score;
}

function chooseMediumBotCard(game, playerIndex) {
  const legal = legalCards(game, playerIndex);
  if (!legal.length) return null;

  const contractId = CONTRACTS[game.contractIndex]?.id;

  if (contractId === "sequence") {
    const hand = game.hands[playerIndex];
    const scored = legal.map(card => {
      let score = Math.random() * 1.5;

      const sameSuitCards = hand.filter(other => other.suit === card.suit);
      const lower = sameSuitCards.some(other => other.value === card.value - 1);
      const higher = sameSuitCards.some(other => other.value === card.value + 1);

      if (lower) score += 2;
      if (higher) score += 2;

      const edgeDistance = Math.min(card.value - 7, 14 - card.value);
      score += (4 - edgeDistance) * 0.2;

      return { card, score };
    });

    scored.sort((a,b) => b.score - a.score);
    return scored[0].card;
  }

  const leadSuit = game.trick[0]?.card.suit;
  const currentWinningCard = game.trick
    .filter(entry => !leadSuit || entry.card.suit === leadSuit)
    .map(entry => entry.card)
    .sort((a,b) => b.value - a.value)[0];

  const scored = legal.map(card => {
    let score = -cardRisk(game, card) + Math.random() * 2.5;

    if (leadSuit && card.suit === leadSuit && currentWinningCard) {
      const wouldWin = card.value > currentWinningCard.value;
      const contract = CONTRACTS[game.contractIndex].id;

      if (["minimum","hearts","queens","king-last","jack-clubs"].includes(contract)) {
        score += wouldWin ? -7 : 4;
      }

      if (contract === "maximum") {
        score += wouldWin ? 6 : -2;
      }
    }

    return { card, score };
  });

  scored.sort((a,b) => b.score - a.score);

  // 20% chance to choose the second-best legal move, preventing perfect play.
  if (scored.length > 1 && Math.random() < 0.2) {
    return scored[1].card;
  }

  return scored[0].card;
}

function scheduleBotAction(room) {
  clearBotTimer(room.code);

  if (!room.game) return;

  if (room.game.phase === "round-intro") {
    scheduleIntro(room);
    return;
  }

  if (room.game.phase === "contract") {
    chooseBotContract(room, room.game.dealer);
    return;
  }

  if (room.game.phase !== "playing") return;

  const remainingLock = (room.lockedUntil || 0) - Date.now();
  if (remainingLock > 0) {
    const timer = setTimeout(() => scheduleBotAction(room), remainingLock + 20);
    botTimers.set(room.code, timer);
    return;
  }

  const playerIndex = room.game.currentPlayer;
  if (!room.players[playerIndex]?.isBot) return;

  const delay = 650 + Math.floor(Math.random() * 850);

  const timer = setTimeout(() => {
    if (!room.game || room.game.phase !== "playing") return;
    if (room.game.currentPlayer !== playerIndex) return;
    if (!room.players[playerIndex]?.isBot) return;

    const card = chooseMediumBotCard(room.game, playerIndex);
    if (!card) return;

    try {
      const event = playCard(room.game, playerIndex, card.id);

      if (event.event === "trick-complete") {
        room.lockedUntil = Date.now() + 800;
      }

      broadcastRoom(room, event);

      if (room.game.phase === "round-intro") {
        scheduleIntro(room);
      } else if (event.event === "trick-complete") {
        setTimeout(() => scheduleBotAction(room), 820);
      } else {
        scheduleBotAction(room);
      }
    } catch (error) {
      console.error(error);
    }
  }, delay);

  botTimers.set(room.code, timer);
}

io.on("connection", socket => {
  socket.on("create-room", ({ name, sessionId, selectionMode }, callback) => {
    try {
      const code = createRoomCode();
      const id = sessionId || crypto.randomUUID();

      const room = {
        code,
        players:[{
          name:normalizeName(name),
          sessionId:id,
          socketId:socket.id,
          isBot:false
        }],
        hostSessionId:id,
        selectionMode:normalizeMode(selectionMode),
        game:null,
        lockedUntil:0
      };

      rooms.set(code, room);
      socketSessions.set(socket.id, { roomCode:code, sessionId:id });
      socket.join(code);

      callback?.({ ok:true, code, sessionId:id });
      broadcastRoom(room);
    } catch (error) {
      callback?.({ ok:false, error:error.message });
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

        player = {
          name:normalizeName(name),
          sessionId:id,
          socketId:socket.id,
          isBot:false
        };

        room.players.push(player);
      } else {
        if (player.isBot) throw new Error("Ta sesija pripada AI igraču.");
        player.socketId = socket.id;
        player.name = normalizeName(name || player.name);
      }

      socketSessions.set(socket.id, {
        roomCode:normalizedCode,
        sessionId:id
      });

      socket.join(normalizedCode);
      callback?.({ ok:true, code:normalizedCode, sessionId:id });
      broadcastRoom(room);
    } catch (error) {
      callback?.({ ok:false, error:error.message });
    }
  });

  socket.on("reconnect-room", ({ code, sessionId }, callback) => {
    try {
      const normalizedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(normalizedCode);
      if (!room) throw new Error("Soba više ne postoji.");

      const player = room.players.find(item =>
        item.sessionId === sessionId && !item.isBot
      );

      if (!player) throw new Error("Tvoja prethodna sesija nije pronađena.");

      player.socketId = socket.id;
      socketSessions.set(socket.id, {
        roomCode:normalizedCode,
        sessionId
      });

      socket.join(normalizedCode);
      callback?.({ ok:true });
      broadcastRoom(room);
    } catch (error) {
      callback?.({ ok:false, error:error.message });
    }
  });

  socket.on("add-bot", (_payload, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);

      if (!room) throw new Error("Nisi u sobi.");
      if (room.hostSessionId !== session.sessionId) throw new Error("Samo host može dodati AI.");
      if (room.game) throw new Error("AI se može dodati samo prije početka.");
      if (room.players.length >= 4) throw new Error("Soba je puna.");

      room.players.push(makeBot(room));
      callback?.({ ok:true });
      broadcastRoom(room);
    } catch (error) {
      callback?.({ ok:false, error:error.message });
    }
  });

  socket.on("remove-bot", ({ playerIndex }, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);

      if (!room) throw new Error("Nisi u sobi.");
      if (room.hostSessionId !== session.sessionId) throw new Error("Samo host može maknuti AI.");
      if (room.game) throw new Error("AI se može maknuti samo prije početka.");

      const index = Number(playerIndex);
      if (!room.players[index]?.isBot) throw new Error("Odabrani igrač nije AI.");

      room.players.splice(index, 1);
      callback?.({ ok:true });
      broadcastRoom(room);
    } catch (error) {
      callback?.({ ok:false, error:error.message });
    }
  });

  socket.on("update-room-settings", ({ selectionMode }, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);

      if (!room) throw new Error("Nisi u sobi.");
      if (room.game) throw new Error("Postavke su zaključane nakon početka.");
      if (room.hostSessionId !== session.sessionId) throw new Error("Samo host mijenja način igre.");

      room.selectionMode = normalizeMode(selectionMode);
      callback?.({ ok:true });
      broadcastRoom(room);
    } catch (error) {
      callback?.({ ok:false, error:error.message });
    }
  });

  socket.on("start-game", (_payload, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);

      if (!room) throw new Error("Nisi u sobi.");
      if (room.hostSessionId !== session.sessionId) throw new Error("Samo host može pokrenuti partiju.");
      if (room.players.length !== 4) throw new Error("Potrebna su točno 4 igrača.");

      room.game = createInitialGame(
        room.players.map(player => player.sessionId),
        room.selectionMode
      );

      callback?.({ ok:true });
      broadcastRoom(room);

      if (room.game.phase === "round-intro") scheduleIntro(room);
      else scheduleBotAction(room);
    } catch (error) {
      callback?.({ ok:false, error:error.message });
    }
  });

  socket.on("choose-contract", ({ contractIndex }, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);

      if (!room?.game) throw new Error("Partija nije pokrenuta.");
      if (room.selectionMode !== "manual") throw new Error("Ručni odabir nije uključen.");

      const playerIndex = room.players.findIndex(player =>
        player.sessionId === session.sessionId
      );

      if (playerIndex !== room.game.dealer) throw new Error("Samo djelitelj bira miniigru.");
      if (room.players[playerIndex]?.isBot) throw new Error("AI sam bira svoju miniigru.");

      startContract(room.game, Number(contractIndex));
      callback?.({ ok:true });

      broadcastRoom(room, {
        event:"round-started",
        contractIndex:Number(contractIndex)
      });

      scheduleBotAction(room);
    } catch (error) {
      callback?.({ ok:false, error:error.message });
    }
  });

  socket.on("play-card", ({ cardId }, callback) => {
    try {
      const session = socketSessions.get(socket.id);
      const room = session && rooms.get(session.roomCode);

      if (!room?.game) throw new Error("Partija nije pokrenuta.");
      if (Date.now() < (room.lockedUntil || 0)) {
        throw new Error("Pričekaj da se završi prikaz štiha.");
      }

      const playerIndex = room.players.findIndex(player =>
        player.sessionId === session.sessionId
      );

      if (room.players[playerIndex]?.isBot) throw new Error("AI poteze kontrolira server.");

      const event = playCard(room.game, playerIndex, cardId);

      if (event.event === "trick-complete") {
        room.lockedUntil = Date.now() + 800;
      }

      callback?.({ ok:true });
      broadcastRoom(room, event);

      if (room.game.phase === "round-intro") {
        scheduleIntro(room);
      } else if (event.event === "trick-complete") {
        setTimeout(() => scheduleBotAction(room), 820);
      } else {
        scheduleBotAction(room);
      }
    } catch (error) {
      callback?.({ ok:false, error:error.message });
    }
  });

  socket.on("disconnect", () => {
    const session = socketSessions.get(socket.id);
    socketSessions.delete(socket.id);
    if (!session) return;

    const room = rooms.get(session.roomCode);
    if (!room) return;

    const player = room.players.find(item =>
      item.sessionId === session.sessionId
    );

    if (player && !player.isBot) player.socketId = null;
    broadcastRoom(room);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Lorum Club radi na portu ${port}`);
});
