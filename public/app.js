
const socket = io();
const $ = id => document.getElementById(id);

let roomState = null;
let lastEvent = null;
let heldTrick = null;
let heldTrickTimer = null;
let introWasVisible = false;

const settings = {
  sound: JSON.parse(localStorage.getItem("lorum-settings") || "{}").sound ?? true,
  effects: JSON.parse(localStorage.getItem("lorum-settings") || "{}").effects ?? true,
  theme: JSON.parse(localStorage.getItem("lorum-settings") || "{}").theme ?? "dark",
  cardStyle: JSON.parse(localStorage.getItem("lorum-settings") || "{}").cardStyle ?? "realistic",
  handLayout: JSON.parse(localStorage.getItem("lorum-settings") || "{}").handLayout ?? "grid"
};

function persistSettings() {
  localStorage.setItem("lorum-settings", JSON.stringify(settings));
  document.body.dataset.theme = settings.theme;
  document.body.dataset.cardStyle = settings.cardStyle;
  $("sound").checked = settings.sound;
  $("effects").checked = settings.effects;
  document.querySelectorAll("[data-setting]").forEach(button => {
    button.classList.toggle("active", settings[button.dataset.setting] === button.dataset.value);
  });
}

function sessionId() {
  return sessionStorage.getItem("lorum-session") || "";
}

function saveSession(id) {
  sessionStorage.setItem("lorum-session", id);
}

function rememberRoom(code, name) {
  localStorage.setItem("lorum-last-room", JSON.stringify({
    code,
    name,
    sessionId: sessionId()
  }));
}

function clearRememberedRoom() {
  localStorage.removeItem("lorum-last-room");
}

function show(screenId) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.toggle("active", screen.id === screenId);
  });
}

function showError(response) {
  if (response && !response.ok) alert(response.error);
}

persistSettings();

document.querySelectorAll("[data-go]").forEach(button => {
  button.onclick = () => show(button.dataset.go);
});

$("sound").onchange = event => {
  settings.sound = event.target.checked;
  persistSettings();
};

$("effects").onchange = event => {
  settings.effects = event.target.checked;
  persistSettings();
};

document.querySelectorAll("[data-setting]").forEach(button => {
  button.onclick = () => {
    settings[button.dataset.setting] = button.dataset.value;
    persistSettings();
    renderGame();
  };
});

document.querySelectorAll("[data-mode]").forEach(button => {
  button.onclick = () => {
    const mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(item => {
      item.classList.toggle("active", item.dataset.mode === mode);
    });

    if (roomState?.phase === "lobby") {
      socket.emit("update-room-settings", { selectionMode:mode }, showError);
    } else {
      $("createMode").value = mode;
    }
  };
});

$("createBtn").onclick = () => {
  socket.emit("create-room", {
    name:$("nameInput").value,
    sessionId:sessionId(),
    selectionMode:$("createMode").value
  }, response => {
    if (!response.ok) {
      $("lobbyError").textContent = response.error;
      return;
    }

    saveSession(response.sessionId);
    rememberRoom(response.code, $("nameInput").value);
    show("room");
  });
};

$("joinBtn").onclick = () => {
  socket.emit("join-room", {
    code:$("codeInput").value,
    name:$("nameInput").value,
    sessionId:sessionId()
  }, response => {
    if (!response.ok) {
      $("lobbyError").textContent = response.error;
      return;
    }

    saveSession(response.sessionId);
    rememberRoom(response.code, $("nameInput").value);
    show("room");
  });
};

$("rejoinBtn").onclick = () => {
  const saved = JSON.parse(localStorage.getItem("lorum-last-room") || "null");
  if (!saved) return;

  socket.emit("reconnect-room", {
    code:saved.code,
    sessionId:saved.sessionId
  }, response => {
    if (!response.ok) {
      clearRememberedRoom();
      $("rejoinWrap").classList.add("hidden");
      $("lobbyError").textContent = response.error;
    }
  });
};

$("addBotBtn").onclick = () => socket.emit("add-bot", {}, showError);

function removeBot(playerIndex) {
  socket.emit("remove-bot", { playerIndex }, showError);
}

$("startBtn").onclick = () => socket.emit("start-game", {}, showError);
$("openSettings").onclick = () => $("settingsModal").classList.remove("hidden");
$("closeSettings").onclick = () => $("settingsModal").classList.add("hidden");

socket.on("connect", () => {
  const saved = JSON.parse(localStorage.getItem("lorum-last-room") || "null");
  if (!saved) return;

  $("rejoinWrap").classList.remove("hidden");
  $("rejoinText").textContent = `Vrati se u sobu ${saved.code}`;
});

socket.on("room-state", state => {
  roomState = state;

  if (state.phase === "lobby") {
    show("room");
    renderRoom();
    return;
  }

  show("game");
  renderGame();
  maybeShowContractModal();
  renderRoundIntro();
});

socket.on("game-event", event => {
  lastEvent = event;
  if (settings.sound && ["card-played","trick-complete","sequence-card","sequence-win"].includes(event.event)) {
    cardSound();
  }

  if (event.event === "trick-complete" && event.completedTrick) {
    heldTrick = event.completedTrick;
    clearTimeout(heldTrickTimer);
    renderGame();
    setTimeout(animateEvent, 30);
    heldTrickTimer = setTimeout(() => {
      heldTrick = null;
      renderGame();
    }, 800);
    return;
  }

  setTimeout(animateEvent, 30);
});

function renderRoom() {
  $("roomCode").textContent = roomState.roomCode;
  const isHost = roomState.hostId === sessionId();

  $("playerSlots").innerHTML = [0,1,2,3].map(index => {
    const name = roomState.names[index];
    const isBot = Boolean(roomState.bots?.[index]);

    if (!name) {
      return `
        <div class="slot">
          <span>Slobodno mjesto</span>
          <span></span>
        </div>
      `;
    }

    return `
      <div class="slot">
        <span>${name}${isBot ? " · MEDIUM" : ""}</span>
        <span>
          ${index === 0 ? "HOST" : ""}
          ${isHost && isBot ? `<button class="remove-bot" data-remove-bot="${index}">Makni</button>` : ""}
        </span>
      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-remove-bot]").forEach(button => {
    button.onclick = () => removeBot(Number(button.dataset.removeBot));
  });

  $("addBotBtn").classList.toggle("hidden", !isHost || roomState.names.length >= 4);
  $("startBtn").style.display = isHost ? "block" : "none";
  $("startBtn").disabled = roomState.names.length !== 4;
  $("roomHint").textContent = roomState.names.length === 4
    ? "Svi su spremni."
    : `Čekanje igrača: ${roomState.names.length}/4`;

  $("roomModeSettings").classList.toggle("hidden", !isHost);
  $("lockedMode").textContent = modeLabel(roomState.selectionMode);

  document.querySelectorAll("#roomModeSettings [data-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.mode === roomState.selectionMode);
  });
}

function modeLabel(mode) {
  return {
    ordered:"Redoslijedom",
    random:"Nasumično",
    manual:"Djelitelj bira"
  }[mode] || mode;
}

function maybeShowContractModal() {
  const modal = $("contractModal");

  if (
    roomState.selectionMode !== "manual" ||
    roomState.phase !== "contract" ||
    roomState.playerIndex !== roomState.dealer
  ) {
    modal.classList.add("hidden");
    return;
  }

  const used = new Set(roomState.usedContracts[roomState.dealer]);
  $("contractChoices").innerHTML = roomState.contracts
    .map((contract,index) => used.has(index) ? "" : `
      <button class="choice" data-contract="${index}">
        <strong>${contract.name}</strong>
        <span>${contract.description}</span>
      </button>
    `).join("");

  document.querySelectorAll("[data-contract]").forEach(button => {
    button.onclick = () => {
      modal.classList.add("hidden");
      socket.emit("choose-contract", {
        contractIndex:Number(button.dataset.contract)
      }, showError);
    };
  });

  modal.classList.remove("hidden");
}

function renderRoundIntro() {
  const overlay = $("roundIntro");

  if (roomState.phase !== "round-intro") {
    overlay.classList.add("hidden");
    introWasVisible = false;
    return;
  }

  const contract = roomState.contracts[roomState.pendingContractIndex];
  $("introKicker").textContent = roomState.roundInCycle === 0 && roomState.cycle > 0
    ? "NOVI DJELITELJ"
    : "SLJEDEĆA IGRA";
  $("introTitle").textContent = contract?.name || "Miniigra";
  $("introDescription").textContent = contract?.description || "";
  $("introDealer").textContent = `${roomState.names[roomState.dealer]} dijeli · ${roomState.names[(roomState.dealer + 1) % 4]} igra prvi`;
  overlay.classList.remove("hidden");

  if (!introWasVisible && settings.sound) introSound();
  introWasVisible = true;
}

function renderGame() {
  if (!roomState || roomState.phase === "lobby") return;

  const contract = roomState.contractIndex === null
    ? null
    : roomState.contracts[roomState.contractIndex];

  $("meta").textContent =
    `Ciklus ${roomState.cycle + 1}/4 · ${modeLabel(roomState.selectionMode)} · Dealer ${roomState.names[roomState.dealer]}`;

  $("contractName").textContent = contract?.name || "Priprema";
  $("contractDesc").textContent = contract?.description || "";

  $("scores").innerHTML = roomState.names.map((name,index) => `
    <div class="score-row"><span>${name}</span><strong>${roomState.scores[index]}</strong></div>
  `).join("");

  $("log").innerHTML = roomState.log.map(line => `<div>${line}</div>`).join("");

  document.querySelectorAll(".seat").forEach(element => {
    const absolute = Number(element.dataset.seat);
    const relative = (absolute - roomState.playerIndex + 4) % 4;
    element.className = `seat ${["bottom","left","top","right"][relative]}`;
    element.innerHTML = `
      <div class="seat-card ${absolute === roomState.dealer ? "dealer" : ""}">
        ${roomState.names[absolute]}
      </div>
      <div class="cards-count">${roomState.handCounts[absolute]} karata</div>
    `;
  });

  const legal = new Set(roomState.legalCardIds);
  $("hand").className = `hand ${settings.handLayout === "grid" ? "grid" : ""}`;
  $("hand").innerHTML = roomState.hand.map(card => cardHtml(
    card,
    legal.has(card.id) &&
    roomState.currentPlayer === roomState.playerIndex &&
    roomState.phase === "playing" &&
    !heldTrick
  )).join("");

  document.querySelectorAll("#hand .card").forEach(element => {
    element.onclick = () => {
      if (!element.classList.contains("disabled")) {
        socket.emit("play-card", { cardId:element.dataset.id }, showError);
      }
    };
  });

  const isSequence = contract?.id === "sequence";
  $("trick").style.display = isSequence ? "none" : "block";
  $("sequence").classList.toggle("active", isSequence);

  const visibleTrick = heldTrick || roomState.trick;
  $("trick").innerHTML = visibleTrick.map(entry => {
    const relative = (entry.player - roomState.playerIndex + 4) % 4;
    return cardHtml(entry.card, false, `played p${relative}`);
  }).join("");

  if (isSequence) renderSequence();
  else $("sequence").innerHTML = "";

  $("status").textContent = statusText();
}

function statusText() {
  if (heldTrick && lastEvent?.winner !== undefined) {
    return `Štih osvaja ${roomState.names[lastEvent.winner]}.`;
  }

  if (roomState.phase === "game-over") {
    return `Partija završena. Pobjednik: ${roomState.winner.map(index => roomState.names[index]).join(", ")}`;
  }

  if (roomState.phase === "round-intro") return "Sljedeća miniigra uskoro počinje.";
  if (roomState.phase === "contract") return `${roomState.names[roomState.dealer]} bira miniigru.`;

  return roomState.currentPlayer === roomState.playerIndex
    ? "Tvoj potez."
    : `Na potezu je ${roomState.names[roomState.currentPlayer]}.`;
}

function cardHtml(card, enabled, extra = "") {
  return `
    <div class="card ${card.red ? "red" : ""} ${enabled ? "" : "disabled"} ${extra}" data-id="${card.id}">
      <div class="corner">${card.label}<br>${card.suitSymbol}</div>
      <div class="pip">${card.suitSymbol}</div>
      <div class="corner corner-bottom">${card.label}<br>${card.suitSymbol}</div>
      <div class="large-card-label">${card.label}${card.suitSymbol}</div>
    </div>
  `;
}

function renderSequence() {
  $("sequence").innerHTML = ["clubs","diamonds","hearts","spades"].map(suit => {
    const symbol = { clubs:"♣", diamonds:"♦", hearts:"♥", spades:"♠" }[suit];
    const red = suit === "diamonds" || suit === "hearts";
    const sequence = roomState.sequences[suit];
    let cards = "";

    if (sequence) {
      for (let value = sequence.low; value <= sequence.high; value++) {
        const label = ({7:"7",8:"8",9:"9",10:"10",11:"J",12:"Q",13:"K",14:"A"})[value];
        cards += `<div class="seq-card ${red ? "red" : ""}">${label}${symbol}</div>`;
      }
    }

    return `<div class="seq-col"><strong>${symbol}</strong>${cards || "<span>—</span>"}</div>`;
  }).join("");
}

function animateEvent() {
  if (!settings.effects || !lastEvent || !roomState) return;

  let special = null;
  if (lastEvent.event === "trick-complete") special = lastEvent.scored?.special;
  if (!special) return;

  const cards = [...document.querySelectorAll("#trick .card")];
  cards.forEach(card => {
    const id = card.dataset.id || "";
    const matches =
      (special === "hearts" && id.includes("-hearts")) ||
      (special === "queens" && id.startsWith("Q-")) ||
      (special === "king-heart" && id === "K-hearts") ||
      (special === "jack-clubs" && id === "J-clubs") ||
      special === "last-trick";

    if (matches) card.classList.add("special-card");
  });

  if (navigator.vibrate && ["king-heart","last-trick"].includes(special)) {
    navigator.vibrate([35,25,45]);
  }
}

function cardSound() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;

  const context = new Context();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(160, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(75, context.currentTime + 0.07);
  gain.gain.setValueAtTime(0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.09);
}

function introSound() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;

  const context = new Context();
  [220,330].forEach((frequency,index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, context.currentTime + index * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3 + index * 0.08);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime + index * 0.08);
    oscillator.stop(context.currentTime + 0.35 + index * 0.08);
  });
}
