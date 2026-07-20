
const socket = io();
const $ = id => document.getElementById(id);
let roomState = null;
let lastEvent = null;

const settings = {
  sound: JSON.parse(localStorage.getItem("lorum-settings") || "{}").sound ?? true,
  effects: JSON.parse(localStorage.getItem("lorum-settings") || "{}").effects ?? true,
  theme: JSON.parse(localStorage.getItem("lorum-settings") || "{}").theme ?? "dark",
  cardStyle: JSON.parse(localStorage.getItem("lorum-settings") || "{}").cardStyle ?? "realistic",
  handLayout: JSON.parse(localStorage.getItem("lorum-settings") || "{}").handLayout ?? "grid"
};

function persist() {
  localStorage.setItem("lorum-settings", JSON.stringify(settings));
  document.body.dataset.theme = settings.theme;
  document.body.dataset.cardStyle = settings.cardStyle;
  $("sound").checked = settings.sound;
  $("effects").checked = settings.effects;
  document.querySelectorAll("[data-setting]").forEach(btn => btn.classList.toggle("active", settings[btn.dataset.setting] === btn.dataset.value));
}
persist();

document.querySelectorAll("[data-go]").forEach(btn => btn.onclick = () => show(btn.dataset.go));
function show(id){ document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id)); }

$("sound").onchange = e => { settings.sound = e.target.checked; persist(); };
$("effects").onchange = e => { settings.effects = e.target.checked; persist(); };
document.querySelectorAll("[data-setting]").forEach(btn => btn.onclick = () => { settings[btn.dataset.setting] = btn.dataset.value; persist(); renderGame(); });

function sessionId(){ return localStorage.getItem("lorum-session") || ""; }
function saveSession(id){ localStorage.setItem("lorum-session", id); }

$("createBtn").onclick = () => socket.emit("create-room", { name: $("nameInput").value, sessionId: sessionId() }, response => {
  if (!response.ok) return $("lobbyError").textContent = response.error;
  saveSession(response.sessionId); show("room");
});
$("joinBtn").onclick = () => socket.emit("join-room", { code: $("codeInput").value, name: $("nameInput").value, sessionId: sessionId() }, response => {
  if (!response.ok) return $("lobbyError").textContent = response.error;
  saveSession(response.sessionId); show("room");
});
$("startBtn").onclick = () => socket.emit("start-game", {}, showError);
$("nextBtn").onclick = () => socket.emit("next-round", {}, showError);
$("openSettings").onclick = () => $("settingsModal").classList.remove("hidden");
$("closeSettings").onclick = () => $("settingsModal").classList.add("hidden");
function showError(response){ if (response && !response.ok) alert(response.error); }

socket.on("room-state", state => {
  roomState = state;
  if (state.phase === "lobby") { show("room"); renderRoom(); }
  else { show("game"); renderGame(); maybeShowContractModal(); }
});
socket.on("game-event", event => { lastEvent = event; if (settings.sound) cardSound(); setTimeout(animateEvent, 30); });

function renderRoom(){
  $("roomCode").textContent = roomState.roomCode;
  $("playerSlots").innerHTML = [0,1,2,3].map(i => `<div class="slot"><span>${roomState.names[i] || "Slobodno mjesto"}</span><span>${i===0?"HOST":""}</span></div>`).join("");
  const isHost = roomState.hostId === sessionId();
  $("startBtn").style.display = isHost ? "block" : "none";
  $("startBtn").disabled = roomState.names.length !== 4;
  $("roomHint").textContent = roomState.names.length === 4 ? "Svi su spremni." : `Čekanje igrača: ${roomState.names.length}/4`;
}

function maybeShowContractModal(){
  const modal = $("contractModal");
  if (roomState.phase !== "contract" || roomState.playerIndex !== roomState.dealer) return modal.classList.add("hidden");
  const used = new Set(roomState.usedContracts[roomState.dealer]);
  $("contractChoices").innerHTML = roomState.contracts.map((c,i) => used.has(i) ? "" : `<button class="choice" data-contract="${i}"><strong>${c.name}</strong><span>${c.description}</span></button>`).join("");
  document.querySelectorAll("[data-contract]").forEach(btn => btn.onclick = () => socket.emit("choose-contract", { contractIndex:Number(btn.dataset.contract) }, showError));
  modal.classList.remove("hidden");
}

function renderGame(){
  if (!roomState || roomState.phase === "lobby") return;
  const c = roomState.contractIndex == null ? null : roomState.contracts[roomState.contractIndex];
  $("meta").textContent = `Ciklus ${roomState.cycle+1}/4 · Dealer ${roomState.names[roomState.dealer]}`;
  $("contractName").textContent = c?.name || "Odabir igre";
  $("contractDesc").textContent = c?.description || "";
  $("scores").innerHTML = roomState.names.map((name,i)=>`<div class="score-row"><span>${name}</span><strong>${roomState.scores[i]}</strong></div>`).join("");
  $("log").innerHTML = roomState.log.map(line=>`<div>${line}</div>`).join("");

  document.querySelectorAll(".seat").forEach(el => {
    const absolute = Number(el.dataset.seat);
    const rel = (absolute - roomState.playerIndex + 4) % 4;
    el.className = `seat ${["bottom","left","top","right"][rel]}`;
    el.innerHTML = `<div class="seat-card ${absolute===roomState.dealer?"dealer":""}">${roomState.names[absolute]}</div><div class="cards-count">${roomState.handCounts[absolute]} karata</div>`;
  });

  const legal = new Set(roomState.legalCardIds);
  $("hand").className = `hand ${settings.handLayout==="grid"?"grid":""}`;
  $("hand").innerHTML = roomState.hand.map(card => cardHtml(card, legal.has(card.id) && roomState.currentPlayer===roomState.playerIndex && roomState.phase==="playing")).join("");
  document.querySelectorAll("#hand .card").forEach(el => el.onclick = () => {
    if (!el.classList.contains("disabled")) socket.emit("play-card", { cardId: el.dataset.id }, showError);
  });

  const isSeq = c?.id === "sequence";
  $("trick").style.display = isSeq ? "none" : "block";
  $("sequence").classList.toggle("active", isSeq);
  $("trick").innerHTML = roomState.trick.map(entry => {
    const rel = (entry.player - roomState.playerIndex + 4) % 4;
    return cardHtml(entry.card, false, `played p${rel}`);
  }).join("");

  if (isSeq) renderSequence();
  else $("sequence").innerHTML = "";

  $("status").textContent = statusText();
  $("nextBtn").classList.toggle("hidden", roomState.phase !== "round-over" || roomState.playerIndex !== roomState.dealer);
}

function statusText(){
  if (roomState.phase === "game-over") return `Partija završena. Pobjednik: ${roomState.winner.map(i=>roomState.names[i]).join(", ")}`;
  if (roomState.phase === "round-over") return "Miniigra završena.";
  if (roomState.phase === "contract") return `${roomState.names[roomState.dealer]} bira miniigru.`;
  return roomState.currentPlayer === roomState.playerIndex ? "Tvoj potez." : `Na potezu je ${roomState.names[roomState.currentPlayer]}.`;
}

function cardHtml(card, enabled, extra=""){
  return `<div class="card ${card.red?"red":""} ${enabled?"":"disabled"} ${extra}" data-id="${card.id}"><div class="corner">${card.label}<br>${card.suitSymbol}</div><div class="pip">${card.suitSymbol}</div></div>`;
}

function renderSequence(){
  $("sequence").innerHTML = ["clubs","diamonds","hearts","spades"].map(suit => {
    const symbol = {clubs:"♣",diamonds:"♦",hearts:"♥",spades:"♠"}[suit];
    const red = suit==="diamonds"||suit==="hearts";
    const seq = roomState.sequences[suit];
    let cards = "";
    if (seq) for (let v=seq.low;v<=seq.high;v++) {
      const label = ({7:"7",8:"8",9:"9",10:"10",11:"J",12:"Q",13:"K",14:"A"})[v];
      cards += `<div class="seq-card ${red?"red":""}">${label}${symbol}</div>`;
    }
    return `<div class="seq-col"><strong>${symbol}</strong>${cards || `<span>—</span>`}</div>`;
  }).join("");
}

function animateEvent(){
  if (!settings.effects || !lastEvent || !roomState) return;
  let special = null;
  const c = roomState.contractIndex == null ? null : roomState.contracts[roomState.contractIndex]?.id;
  if (lastEvent.event === "trick-complete") special = lastEvent.scored?.special;
  if (!special) return;
  const cards = [...document.querySelectorAll("#trick .card")];
  cards.forEach(card => {
    const id = card.dataset.id || "";
    const match =
      (special==="hearts" && id.includes("-hearts")) ||
      (special==="queens" && id.startsWith("Q-")) ||
      (special==="king-heart" && id==="K-hearts") ||
      (special==="jack-clubs" && id==="J-clubs") ||
      special==="last-trick";
    if (match) card.classList.add("special-card");
  });
  if (navigator.vibrate && (special==="king-heart" || special==="last-trick")) navigator.vibrate([35,25,45]);
}

function cardSound(){
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  const ctx=new Ctx(),o=ctx.createOscillator(),g=ctx.createGain();
  o.type="triangle";o.frequency.setValueAtTime(160,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(75,ctx.currentTime+.07);
  g.gain.setValueAtTime(.035,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.08);
  o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.09);
}
