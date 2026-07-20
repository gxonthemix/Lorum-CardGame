
/*
U public/app.js dodaj ove handlere uz postojeće lobby handlere.
Patch servera već šalje roomState.bots.
*/

$("addBotBtn").onclick = () => {
  socket.emit("add-bot", {}, showError);
};

function removeBot(playerIndex) {
  socket.emit("remove-bot", { playerIndex }, showError);
}

/*
U renderRoom() zamijeni playerSlots innerHTML dio ovim:
*/

$("playerSlots").innerHTML = [0,1,2,3].map(index => {
  const name = roomState.names[index];
  const isBot = Boolean(roomState.bots?.[index]);
  const isHost = roomState.hostId === sessionId();

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

const isHost = roomState.hostId === sessionId();
$("addBotBtn").classList.toggle(
  "hidden",
  !isHost || roomState.names.length >= 4
);
