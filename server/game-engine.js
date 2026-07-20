
export const SUITS = [
  { id: "clubs", symbol: "♣", red: false },
  { id: "diamonds", symbol: "♦", red: true },
  { id: "hearts", symbol: "♥", red: true },
  { id: "spades", symbol: "♠", red: false }
];

export const RANKS = [
  { id:"7", label:"7", value:7 }, { id:"8", label:"8", value:8 },
  { id:"9", label:"9", value:9 }, { id:"10", label:"10", value:10 },
  { id:"J", label:"J", value:11 }, { id:"Q", label:"Q", value:12 },
  { id:"K", label:"K", value:13 }, { id:"A", label:"A", value:14 }
];

export const CONTRACTS = [
  { id:"minimum", name:"Minimum", description:"Svaki osvojeni štih donosi 1 kazneni bod." },
  { id:"maximum", name:"Maximum", description:"Svaki osvojeni štih donosi -1 bod." },
  { id:"hearts", name:"Srca", description:"Svako osvojeno srce donosi 1 kazneni bod." },
  { id:"queens", name:"Dame", description:"Svaka osvojena dama donosi 2 kaznena boda." },
  { id:"king-last", name:"Kralj srca i zadnji štih", description:"Kralj srca donosi 4 boda, zadnji štih još 4." },
  { id:"jack-clubs", name:"Dečko tref", description:"Dečko tref donosi 8 kaznenih bodova." },
  { id:"sequence", name:"NIZ", description:"Prva karta određuje početni rang svih nizova." }
];

export function createDeck() {
  return SUITS.flatMap(suit => RANKS.map(rank => ({
    id: `${rank.id}-${suit.id}`,
    suit: suit.id,
    suitSymbol: suit.symbol,
    red: suit.red,
    rank: rank.id,
    label: rank.label,
    value: rank.value
  })));
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createInitialGame(playerIds) {
  return {
    phase: "contract",
    dealer: 0,
    cycle: 0,
    usedContracts: Array.from({ length: 4 }, () => []),
    hands: [[], [], [], []],
    currentPlayer: 1,
    trickLeader: 1,
    trick: [],
    trickNumber: 1,
    scores: [0,0,0,0],
    contractIndex: null,
    sequenceStart: null,
    sequences: {},
    winner: null,
    log: ["Partija je pokrenuta."],
    playerIds
  };
}

function sortHand(hand) {
  hand.sort((a,b) => {
    const sa = SUITS.findIndex(s => s.id === a.suit);
    const sb = SUITS.findIndex(s => s.id === b.suit);
    return sa - sb || a.value - b.value;
  });
}

export function startContract(game, contractIndex) {
  if (game.phase !== "contract") throw new Error("Miniigra se trenutno ne može odabrati.");
  if (game.usedContracts[game.dealer].includes(contractIndex)) throw new Error("Ta je miniigra već odigrana.");
  if (!CONTRACTS[contractIndex]) throw new Error("Nepoznata miniigra.");

  game.usedContracts[game.dealer].push(contractIndex);
  game.contractIndex = contractIndex;
  game.phase = "playing";
  game.trick = [];
  game.trickNumber = 1;
  game.sequenceStart = null;
  game.sequences = {};

  const deck = shuffle(createDeck());
  game.hands = [[],[],[],[]];
  deck.forEach((card, index) => game.hands[index % 4].push(card));
  game.hands.forEach(sortHand);

  game.trickLeader = (game.dealer + 1) % 4;
  game.currentPlayer = game.trickLeader;
  game.log.unshift(`Odabrana igra: ${CONTRACTS[contractIndex].name}.`);
}

export function isSequence(game) {
  return game.contractIndex !== null && CONTRACTS[game.contractIndex].id === "sequence";
}

export function legalCards(game, playerIndex) {
  const hand = game.hands[playerIndex];
  if (isSequence(game)) {
    if (game.sequenceStart === null) return hand;
    return hand.filter(card => {
      const seq = game.sequences[card.suit];
      if (!seq) return card.value === game.sequenceStart;
      return card.value === seq.low - 1 || card.value === seq.high + 1;
    });
  }

  if (game.trick.length === 0) return hand;
  const leadSuit = game.trick[0].card.suit;
  const matching = hand.filter(card => card.suit === leadSuit);
  return matching.length ? matching : hand;
}

function scoreTrick(game, winner) {
  const contract = CONTRACTS[game.contractIndex].id;
  const cards = game.trick.map(entry => entry.card);
  let points = 0;
  let special = null;

  if (contract === "minimum") points = 1;
  if (contract === "maximum") points = -1;
  if (contract === "hearts") {
    points = cards.filter(card => card.suit === "hearts").length;
    if (points) special = "hearts";
  }
  if (contract === "queens") {
    points = cards.filter(card => card.rank === "Q").length * 2;
    if (points) special = "queens";
  }
  if (contract === "king-last") {
    if (cards.some(card => card.suit === "hearts" && card.rank === "K")) {
      points += 4;
      special = "king-heart";
    }
    if (game.trickNumber === 8) {
      points += 4;
      special = special || "last-trick";
    }
  }
  if (contract === "jack-clubs" && cards.some(card => card.suit === "clubs" && card.rank === "J")) {
    points = 8;
    special = "jack-clubs";
  }

  game.scores[winner] += points;
  return { points, special };
}

function advanceSequenceTurn(game) {
  let checked = 0;
  do {
    game.currentPlayer = (game.currentPlayer + 1) % 4;
    checked++;
  } while (checked < 4 && legalCards(game, game.currentPlayer).length === 0);
}

function finishRound(game) {
  game.phase = "round-over";
  if (game.usedContracts[game.dealer].length === 7) {
    if (game.dealer === 3) {
      game.phase = "game-over";
      const min = Math.min(...game.scores);
      game.winner = game.scores.map((score, index) => score === min ? index : -1).filter(index => index >= 0);
    } else {
      game.dealer += 1;
      game.cycle += 1;
    }
  }
}

export function playCard(game, playerIndex, cardId) {
  if (game.phase !== "playing") throw new Error("Partija trenutno nije aktivna.");
  if (game.currentPlayer !== playerIndex) throw new Error("Nisi na potezu.");

  const hand = game.hands[playerIndex];
  const cardIndex = hand.findIndex(card => card.id === cardId);
  if (cardIndex < 0) throw new Error("Nemaš tu kartu.");

  const legal = new Set(legalCards(game, playerIndex).map(card => card.id));
  if (!legal.has(cardId)) throw new Error("Ta karta nije dopuštena.");

  const [card] = hand.splice(cardIndex, 1);
  game.log.unshift(`Igrač ${playerIndex + 1} igra ${card.label}${card.suitSymbol}.`);

  if (isSequence(game)) {
    if (game.sequenceStart === null) game.sequenceStart = card.value;
    const seq = game.sequences[card.suit];
    if (!seq) game.sequences[card.suit] = { low: card.value, high: card.value };
    else {
      seq.low = Math.min(seq.low, card.value);
      seq.high = Math.max(seq.high, card.value);
    }

    if (hand.length === 0) {
      game.scores[playerIndex] -= 8;
      game.hands.forEach((remaining, index) => {
        if (index !== playerIndex) game.scores[index] += remaining.length;
      });
      game.log.unshift(`Igrač ${playerIndex + 1} je prvi završio NIZ.`);
      finishRound(game);
      return { card, event: "sequence-win", playerIndex };
    }

    advanceSequenceTurn(game);
    return { card, event: "sequence-card", playerIndex };
  }

  game.trick.push({ player: playerIndex, card });

  if (game.trick.length < 4) {
    game.currentPlayer = (game.currentPlayer + 1) % 4;
    return { card, event: "card-played", playerIndex };
  }

  const leadSuit = game.trick[0].card.suit;
  let winnerEntry = game.trick[0];
  for (const entry of game.trick.slice(1)) {
    if (entry.card.suit === leadSuit && entry.card.value > winnerEntry.card.value) winnerEntry = entry;
  }

  const winner = winnerEntry.player;
  const scored = scoreTrick(game, winner);
  const completedTrick = game.trick.map(entry => ({...entry}));
  game.log.unshift(`Igrač ${winner + 1} osvaja ${game.trickNumber}. štih.`);
  game.trick = [];

  if (game.hands.every(handItem => handItem.length === 0)) {
    finishRound(game);
  } else {
    game.trickNumber += 1;
    game.currentPlayer = winner;
    game.trickLeader = winner;
  }

  return {
    card,
    event: "trick-complete",
    playerIndex,
    winner,
    scored,
    completedTrick,
    trickNumber: game.trickNumber === 1 ? 8 : game.trickNumber - 1
  };
}

export function nextRound(game) {
  if (game.phase !== "round-over") throw new Error("Runda još nije završena.");
  game.phase = "contract";
  game.contractIndex = null;
  game.trick = [];
  game.sequenceStart = null;
  game.sequences = {};
}

export function publicState(game, playerIndex, names, roomCode, hostId) {
  return {
    roomCode,
    names,
    hostId,
    playerIndex,
    phase: game.phase,
    dealer: game.dealer,
    cycle: game.cycle,
    usedContracts: game.usedContracts,
    hand: game.hands[playerIndex] || [],
    handCounts: game.hands.map(hand => hand.length),
    currentPlayer: game.currentPlayer,
    trick: game.trick,
    trickNumber: game.trickNumber,
    scores: game.scores,
    contractIndex: game.contractIndex,
    contracts: CONTRACTS,
    sequenceStart: game.sequenceStart,
    sequences: game.sequences,
    winner: game.winner,
    log: game.log.slice(0, 15),
    legalCardIds: game.phase === "playing" ? legalCards(game, playerIndex).map(card => card.id) : []
  };
}
