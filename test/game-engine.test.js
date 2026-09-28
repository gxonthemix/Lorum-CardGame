import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeck, createInitialGame, legalCards, playCard, publicState,
  startContract, startPendingContract
} from "../server/game-engine.js";

const players = ["p1", "p2", "p3", "p4"];
const cards = new Map(createDeck().map(card => [card.id, card]));

test("a round deals every card once and keeps opponents' hands private", () => {
  const game = createInitialGame(players);
  startPendingContract(game);
  const dealt = game.hands.flat();
  assert.equal(dealt.length, 32);
  assert.equal(new Set(dealt.map(card => card.id)).size, 32);
  assert.deepEqual(game.hands.map(hand => hand.length), [8, 8, 8, 8]);

  const state = publicState(game, 1, ["A", "B", "C", "D"], "ABCD", "p1", "ordered");
  assert.deepEqual(state.hand, game.hands[1]);
  assert.deepEqual(state.handCounts, [8, 8, 8, 8]);
  assert.equal("hands" in state, false);
});

test("server rejects out-of-turn and off-suit moves without removing a card", () => {
  const game = createInitialGame(players);
  startPendingContract(game);
  game.currentPlayer = 1;
  game.trick = [{ player: 0, card: cards.get("9-hearts") }];
  game.hands[1] = [cards.get("7-clubs"), cards.get("8-hearts")];

  assert.deepEqual(legalCards(game, 1).map(card => card.id), ["8-hearts"]);
  assert.throws(() => playCard(game, 0, game.hands[0][0].id), /potezu/);
  assert.throws(() => playCard(game, 1, "7-clubs"), /dopuštena/);
  assert.deepEqual(game.hands[1].map(card => card.id), ["7-clubs", "8-hearts"]);
});

test("Sequence allows the starting rank or a neighboring rank in an open suit", () => {
  const game = createInitialGame(players, "manual");
  startContract(game, 6);
  game.sequenceStart = 8;
  game.sequences = { clubs: { low: 8, high: 8 } };
  game.hands[1] = [cards.get("7-clubs"), cards.get("10-clubs"), cards.get("8-hearts")];
  assert.deepEqual(legalCards(game, 1).map(card => card.id), ["7-clubs", "8-hearts"]);
});
