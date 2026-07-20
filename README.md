# Lorum Club

Lorum Club is a browser-based multiplayer adaptation of the traditional four-player card game Lorum.

The application allows players to create a private room, join using a room code, and play a complete match in real time from desktop or mobile devices.

## Gameplay

A match is played by four players using a 32-card deck.

Each player acts as the dealer for seven consecutive rounds. During those rounds, the player seated after the dealer plays first. After all seven game modes have been completed, the dealer position moves to the next player.

The game currently includes:

* Minimum
* Maximum
* Hearts
* Queens
* King of Hearts and the Last Trick
* Jack of Clubs
* Sequence

In Sequence, the first card played determines the starting rank for all four suits. Each suit is then built upward or downward from that rank, with players placing one card per turn.

## Online Multiplayer

Players can:

* create private rooms
* join using a room code
* play with four separate devices
* reconnect after refreshing the page
* continue an active match in real time

All game rules are validated by the server. Players only receive their own hand, while opponents’ cards remain hidden.

## Technology

* JavaScript
* Node.js
* Express
* Socket.IO
* HTML
* CSS

## Running Locally

Node.js 20 or newer is recommended.

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

To test a complete match locally, open the application in four separate browser sessions.

## Deployment

The application can be deployed as a Node.js service on platforms that support WebSockets, such as Railway.

The server uses the port provided by the hosting environment:

```js
process.env.PORT || 3000
```

## Project Status

The application is currently in active development.

Planned improvements include persistent match storage, player profiles, turn timers, improved reconnect handling, automated tests, and additional visual polish.
