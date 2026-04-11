[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/0Kd2Byaj)

# Room App — Multi-User Real-Time Interaction

A simple multi-user room app scaffold focused on project infrastructure first.

## Live demo URL (when running locally)

- This project supports exposing your local server to the public using `localtunnel` or `ngrok`.
- On a machine that launches the server with a tunnel, the public URL will be written to `LIVE_DEMO_URL.txt` in the repository root.
- Do not hard-code the ephemeral URL in this README — it will change every time you start a free tunnel. Instead, run the tunnel and copy the URL from `LIVE_DEMO_URL.txt` or from the server console output.

Examples:

```bash
npm install
# start and open a localtunnel (ephemeral)
npm run tunnel:lt
# or start ngrok (requires NGROK_AUTHTOKEN)
export NGROK_AUTHTOKEN=your_token
npm run tunnel:ngrok
```

The current public URL (if the tunnel is running) is available in `LIVE_DEMO_URL.txt`.

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

## Recent changes & how to run them

- Tunnels: programmatic support for `localtunnel` and `ngrok` was added. Start with `npm run tunnel:lt` (localtunnel) or set `NGROK_AUTHTOKEN` and run `npm run tunnel:ngrok`.
- Live URL: the server writes the current public URL to `LIVE_DEMO_URL.txt` when a tunnel is active. Do not commit this file.
- Launcher & installer UI: `launcher/start-app.js` provides a cross-platform launcher that will (if `node_modules` are missing) start a local installer UI at `http://localhost:3333` to run `npm install` with live logs. Use the macOS/Windows wrappers in `mac/` and `windows/` or the `dist/` artifacts.
- Packaging: `scripts/make-macos-app.sh` creates a thin `.app` at `dist/RoomApp.app`; `scripts/build-windows-exe.sh` builds `dist/RoomApp-win.exe` using `pkg`.
- E2E test: `scripts/e2e-test.js` is a small Node test that uses `LIVE_DEMO_URL.txt` (or falls back to `http://localhost:3000`) to verify two clients can join and exchange messages.

## Where to get an ngrok authtoken

1. Sign up at https://ngrok.com and log into the dashboard.
2. Copy the Authtoken from the "Connect" or "Setup" section.
3. Set it locally with `ngrok authtoken <TOKEN>` or export it as `NGROK_AUTHTOKEN` or paste it into `launcher/launcher-config.json` under `ngrokAuthtoken`.

## Quick deploy options (Render vs Railway)

- Render: well suited for always-on web services. Steps: create account on https://render.com → New → Web Service → connect GitHub repo → set Build Command (`npm install`) and Start Command (`npm start`) → add environment variables and deploy. Good for stable demos and mapping custom domains (paid/reserved features).
- Railway: quick iterative deployments from GitHub with simple project creation at https://railway.app. Steps: create account → New Project → Deploy from GitHub → choose repo and service → set start command (`npm start`) → deploy. Very fast for development and previews.
- Cost and choice: both platforms offer free tiers/credits; which is cheaper depends on your usage and current pricing. For immediate demos, use the free tier of either. For long-term stable hosting, Render is slightly more opinionated for web services; Railway is faster for iterative dev. I can prepare step-by-step deploy config for either — tell me which you prefer.

## Quick checklist to publish a stable demo

1. Choose hosting: Render or Railway (or reserve an ngrok subdomain / buy a cheap domain).
2. Add any required environment variables to the host (none required for basic usage; add `TURN` credentials if you add a TURN server later).
3. Use `npm start` as the app start command on the host.
4. Verify the hosted URL supports WebSocket (Socket.IO) and test with `scripts/e2e-test.js` updated to point at the hosted URL.

## What we're doing next

- Short-term (demos): use `ngrok` for reliable ephemeral HTTPS + WebSocket demos. Get an authtoken from https://ngrok.com, add it to `NGROK_AUTHTOKEN` or `launcher/launcher-config.json`, then run:

```bash
# start a demo with ngrok (requires NGROK_AUTHTOKEN)
npm run tunnel:ngrok
```

- Mid-term (stable hosting): deploy to Render for an always-on public URL. Steps:
    1. Create an account on https://render.com and connect the GitHub repo.
 2. Create a new Web Service: set Build Command `npm install` and Start Command `npm start`.
 3. Add any environment variables (e.g., TURN credentials if you add a TURN server later).
 4. Deploy and verify the public URL.

- Long-term (production-ready):
    - Acquire a cheap domain and map it to your Render service (or use ngrok paid custom domains).
    - Add TURN server support for WebRTC reliability and finalize the P2P signaling protocol.
    - Sign and notarize macOS apps and sign Windows executables for distribution.

If you want I can walk through each of these steps in order (ngrok demo → Render deploy → domain mapping → TURN integration → packaging/signing). Tell me which to do first and I'll proceed step-by-step.
