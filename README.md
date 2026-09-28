# Lorum Club

A browser-based, real-time adaptation of the four-player card game Lorum. Players create a private room, join with a room code, and play a complete match from separate desktop or mobile browsers.

## Engineering highlights

- Socket.IO keeps room state synchronized and supports reconnecting to an active match.
- The server validates moves and game rules; each player receives only their own hand.
- The game engine implements seven contracts across four players and a 32-card deck.
- The browser UI includes responsive layouts and locally saved visual and sound preferences.

## Stack

JavaScript, Node.js 20+, Express, Socket.IO, HTML, and CSS. No database is required for local play.

## Run locally

```bash
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000). To play with other people, open the app in four browser sessions or on four devices that can reach the host. You can also add bots from a room for a quicker local walkthrough.

Run `npm test` for the game-engine rules.

## How a match works

Four players use a 32-card deck. Each dealer runs seven rounds before the dealer position moves on. The included contracts are Minimum, Maximum, Hearts, Queens, King of Hearts and the Last Trick, Jack of Clubs, and Sequence.

In Sequence, the first card sets the starting rank for all suits; players then build each suit up or down one card at a time.

## Project map

| Path | Responsibility |
| --- | --- |
| `server/index.js` | HTTP server, rooms, Socket.IO events, reconnects, and state delivery |
| `server/game-engine.js` | Deck, turns, contract rules, and move validation |
| `public/` | Browser interface and client-side interactions |

## Current limitations

Room and match state live in server memory, so restarting the server ends active games. Reconnect works while that server process remains running. There is no persistent account system or turn timer yet. Engine tests cover dealing, private hand delivery, and move validation, but end-to-end multiplayer coverage is still missing. These are the main next steps before treating the app as a hosted service.

For deployment, use a Node.js host that supports persistent WebSocket connections. The server reads `PORT` from the environment and defaults to 3000.
