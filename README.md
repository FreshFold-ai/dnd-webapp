[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/0Kd2Byaj)

# Room App — Multi-User Real-Time Interaction

A simple multi-user room app scaffold focused on project infrastructure first.

## Tech Stack

- **Node.js** + **npm**
- **Express** — HTTP server + static file hosting
- **Socket.IO** — real-time WebSocket room communication

## Project Structure

```
term-project-team-invincible/
├── package.json                 # Dependencies and npm scripts
├── .gitignore                   # Git ignore rules
├── README.md                    # This file
├── src/
│   ├── server/
│   │   ├── index.js             # Express + HTTP server setup, entry point
│   │   └── socketHandlers.js    # Socket.IO event registration
│   └── helpers/
│       └── room.js              # Room utility functions (size, count broadcast)
└── public/
    ├── index.html               # HTML shell
    ├── js/
    │   └── app.js               # Client-side socket logic and DOM wiring
    └── css/
        └── styles.css           # Base styling
```

## Install & Run

```bash
npm install
npm run dev          # starts with --watch for auto-restart
# open http://localhost:3000
```

Or for production-style:
```bash
npm start
```

## Architecture

1. **Express** serves static files from `public/` (HTML, JS, CSS).
2. **Socket.IO** runs on the same HTTP server and manages all real-time events.
3. **Room helpers** (`src/helpers/room.js`) provide reusable room utilities.
4. **Socket handlers** (`src/server/socketHandlers.js`) register per-socket event listeners.
5. The **client** (`public/js/app.js`) connects to the server, manages the join/chat UI, and relays socket events to the DOM.

## Socket Event Contract

### Client → Server

| Event          | Payload                              | Description                    |
|----------------|--------------------------------------|--------------------------------|
| `room:join`    | `{ roomId: string, username: string }` | Request to join a named room |
| `room:message` | `{ text: string }`                   | Send a message to current room |

### Server → Client

| Event          | Payload                                          | Description                              |
|----------------|--------------------------------------------------|------------------------------------------|
| `room:joined`  | `{ roomId: string, socketId: string }`           | Join acknowledged for requesting user    |
| `room:count`   | `{ roomId: string, count: number }`              | Current connected member count in room   |
| `user:joined`  | `{ socketId: string, username: string }`         | Another user joined your room            |
| `user:left`    | `{ username: string }`                           | A user disconnected from your room       |
| `room:message` | `{ from: string, text: string, at: string }`    | Chat message broadcast to all in room    |

## Key Methods

### Server — `src/server/index.js`
Entry point. Creates Express app, HTTP server, Socket.IO server, registers handlers, starts listening.

### Server — `src/server/socketHandlers.js`
- **`registerSocketHandlers(io)`** — Attaches the connection listener and per-socket event handlers (room:join, room:message, disconnect).

### Server — `src/helpers/room.js`
- **`getRoomSize(io, roomId)`** → `number` — Returns socket count in a room.
- **`emitRoomCount(io, roomId)`** → `void` — Broadcasts `room:count` to the room.

### Client — `public/js/app.js`
- **`addMessage(text)`** → `void` — Appends a `<p>` to the message feed and scrolls.
- **`joinRoomFromInputs()`** → `void` — Reads form inputs, emits `room:join`.
- **`sendMessageFromInput()`** → `void` — Reads message input, emits `room:message`.

### UI Features
- **Live member counter** — the `#member-count` element below the chat window updates in real time whenever the server emits `room:count` (on every join and disconnect). No polling; purely event-driven via the existing Socket.IO infrastructure.

## Notes

- Input validation is intentionally minimal for early infrastructure.
- Next steps: stronger validation, auth/session strategy, roster display, and tests.