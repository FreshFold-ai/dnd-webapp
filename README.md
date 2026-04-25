[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/0Kd2Byaj)

# DnD Encounter Engine — Real-Time P2P Multiplayer

A browser-based Dungeons & Dragons encounter engine for real-time multiplayer sessions. One player acts as Dungeon Master (DM); the rest are players. The DM spawns NPCs, sets the environment, and narrates. Players respond to encounter prompts, roll dice, and receive loot.

**Architecture:** The server is a lightweight lobby — it handles room creation/join and WebRTC signaling only. All gameplay (rounds, encounters, chat, trade, narration, inventory) runs over **WebRTC DataChannels** in a full P2P mesh. All durable state lives in `localStorage`; the server holds zero gameplay state.

## Live Demo

Check `LIVE_DEMO_URL.txt` for the deployed URL, or run locally with a tunnel:

```bash
npm install
npm run tunnel:lt          # localtunnel (ephemeral, no account needed)
# or
export NGROK_AUTHTOKEN=your_token
npm run tunnel:ngrok       # ngrok (more stable)
```

## Tech Stack

- **Node.js 20+** + **Express 4** — HTTP server and static file hosting (lobby + signaling only)
- **Socket.IO 4** — room creation/join and WebRTC signaling relay
- **WebRTC DataChannels** — full P2P mesh for all gameplay events (via `p2pMesh.js`)
- **Vanilla JS / HTML5 / CSS3** — no frontend framework

## Project Structure

```
├── src/
│   └── server/
│       ├── index.js             # Express + HTTP server, /health endpoint
│       └── socketHandlers.js    # Lobby + WebRTC signaling only (188 lines)
├── public/
│   ├── index.html              # Single-page shell with all UI panels
│   ├── js/
│   │   ├── app.js              # All client logic — roster, round engine, encounter engine, UI
│   │   ├── p2pMesh.js          # WebRTC full-mesh abstraction (window.P2PMesh)
│   │   └── catalog.js          # NPC templates, item registry, loot tables (window.GameCatalog)
│   └── css/styles.css          # All styles
└── launcher/                   # Optional local launcher UI
```

## Install & Run

```bash
npm install
npm run dev        # nodemon --watch auto-restart on save
# open http://localhost:3000
```

## Features

| Feature | Description |
|---|---|
| Room creation / join | DM creates a named, password-protected room; players join with a sharable room code |
| P2P full mesh | After join, all gameplay flows over WebRTC DataChannels — no gameplay data touches the server |
| Character builder | Avatar, name, class, race, level, HP, and 6-stat array (44 points, each 3–20) |
| DM narration | DM broadcasts styled narration messages to all players via P2P |
| Round engine | DM tracks per-player actions; keyword classifier assigns ability checks; DM resolves all pending actions each round |
| Encounter engine | DM spawns an NPC (aggro/grey/utility) from a 13-template catalog; players receive an interactive prompt card over P2P |
| Decision + roll system | Players choose an action then submit a d20 roll; DM client resolves the outcome authoritatively via P2P |
| Loot distribution | On encounter resolution, DM client draws loot via seeded RNG and broadcasts per-player results |
| Inventory / trade | Persistent `localStorage` inventory; direct P2P item send (`sendToPeer`) with DM CC'd |
| Environment controls | DM triggers weather, terrain, event, or loot-drop environment events |
| NPC roster display | DM sees a live table of every player's current decision and roll status |
| Export / import | Characters and room state export to `.txt` (JSON) files; importable on next session |
| Seeded RNG | Deterministic loot draws keyed to encounter ID seed (`GameCatalog.seededRandom`) |

## NPC Catalog (13 templates)

| ID | Role | HP | AC |
|---|---|---|---|
| `goblin_scout` | aggro | 18 | 9 |
| `orc_raider` | aggro | 32 | 12 |
| `bandit_thug` | aggro | 22 | 10 |
| `skeleton_warrior` | aggro | 20 | 11 |
| `dark_wolf` | aggro | 24 | 8 |
| `wandering_sage` | grey | 10 | 7 |
| `mysterious_stranger` | grey | 14 | 10 |
| `lost_soldier` | grey | 20 | 11 |
| `town_drunk` | grey | 8 | 6 |
| `cursed_merchant` | grey | 12 | 8 |
| `village_healer` | utility | 12 | 7 |
| `traveling_merchant` | utility | 10 | 6 |
| `blacksmith_journeyman` | utility | 18 | 9 |

## Event Reference

All gameplay runs over **WebRTC DataChannels** (P2PMesh). The server only handles lobby and WebRTC signaling.

### Lobby — Client → Server (Socket.IO)

| Event | Key Payload Fields | Description |
|---|---|---|
| `room:join` | `roomId, username, password, character, isDM` | Join or create a room |
| `room:start` | `roomId` | DM signals room is starting |
| `room:heartbeat` | `roomId` | Keep-alive tick |
| `room:export:campaign` | `roomId, data` | DM exports room state to server for download |

### Lobby — Server → Client (Socket.IO)

| Event | Key Payload Fields | Description |
|---|---|---|
| `room:joined` | `roomId, socketId, users, meta` | Successful room join |
| `room:count` | `count` | Current occupant count update |
| `peer:joined` | `socketId, username` | Another peer's signaling info available |
| `peer:left` | `socketId` | Peer disconnected from signaling |
| `dm:offline` | — | DM has disconnected |
| `server:error` | `message` | Generic server error |
| `webrtc:offer` | `from, offer` | WebRTC offer relay |
| `webrtc:answer` | `from, answer` | WebRTC answer relay |
| `webrtc:ice-candidate` | `from, candidate` | ICE candidate relay |

### P2P DataChannel — Broadcast (all peers)

| Event (`t`) | Key Fields | Description |
|---|---|---|
| `player:announce` | `socketId, username, isDM, character, avatar` | Peer introduces themselves on connect |
| `room:message` | `username, text, at` | Chat message |
| `game:narrate` | `text, dmName, at` | DM narration |
| `dm:spawn` | `npcType, npcName, templateId` | DM spawns NPC (DM → all) |
| `dm:env` | `eventType, detail, dmName` | DM environment event |
| `room:round` | `round, actions` | DM broadcasts new round state |
| `round:action:declared` | `username, action` | Player's action declared to all |
| `round:action:prompted` | `username, stat, dc` | DM assigned a check (visible to all) |
| `round:action:roll-locked` | `username, roll, result` | Player's roll locked in |
| `round:actions:resolved` | `results[]` | All round actions resolved with outcomes |
| `encounter:start` | `eid, npcName, npcRole, npcStats` | Encounter started (DM → all) |
| `encounter:resolved` | `eid, outcome, flavor, perPlayerLoot` | Encounter ended; loot distributed |

### P2P DataChannel — Targeted (`sendToPeer`)

| Event (`t`) | Direction | Key Fields | Description |
|---|---|---|---|
| `dm:whisper` | DM → player | `text` | Private DM message |
| `trade:item` | player → player | `item, fromUsername` | Item trade (DM CC'd) |
| `round:submit-action` | player → DM | `action` | Player submits their action text |
| `round:submit-roll` | player → DM | `roll` | Player submits their d20 roll |
| `round:action:assigned` | DM → player | `stat, dc` | DM's check assignment sent to player |
| `round:action:roll:accepted` | DM → player | `roll, result` | DM acks the roll result |
| `encounter:prompt` | DM → player | `eid, npcName, npcRole, npcStats, options` | Player receives encounter card |
| `encounter:decide` | player → DM | `eid, optionId, optionLabel` | Player submits their decision |
| `encounter:roll` | player → DM | `eid, roll` | Player submits their d20 roll |
| `encounter:decision:ack` | DM → player | `eid, stat, dc` | DM acks decision, sends check info |
| `encounter:roll:ack` | DM → player | `eid, roll, outcome` | DM acks roll with outcome |
| `encounter:ready` | DM → player | `eid` | All players resolved; resolution imminent |

## localStorage Keys

| Key | Owner | Content |
|---|---|---|
| `dnd_inventory` | Player | `string[]` — item names |
| `dnd_character` | Player | Character object (name/class/race/stats/hp) |
| `dnd_room_env` | DM | `{ eventType, detail, at }[]` — weather/terrain events |
| `dnd_room_encounters` | DM | `{ eid, outcome, at }[]` — encounter outcomes |

## Export / Import Format

**Character export** (`kind: "character"`):
```json
{
  "kind": "character",
  "character": { "avatar": "...", "characterName": "...", "className": "...", "race": "...", "level": 1, "hp": 20, "stats": { ... } },
  "inventory": ["iron_dagger", "copper_coins"]
}
```

**Room export** (`kind: "room"`):
```json
{
  "kind": "room",
  "roomType": "dungeon",
  "dmName": "...",
  "roomPassword": "...",
  "environment": [ { "eventType": "weather", "detail": "...", "at": "..." } ],
  "encounters": [ { "eid": "...", "outcome": "death", "at": "..." } ]
}
```


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

## Import Templates (.txt)

Download starter templates from:

- `public/templates/room-template.txt`
- `public/templates/character-template.txt`

Import format uses JSON content inside a `.txt` file.

The landing page supports importing room and character templates.

Room import requires:

- `kind: "room"`
- `roomType`
- `dmName`
- `roomPassword`

Character import supports either wrapper format (`kind: "character"` + `character`) or a direct character object. Required character fields:

- `avatar`
- `characterName`
- `className`
- `race`
- `level` (>= 1)
- `hp` (>= 1)
- `stats` with: `might`, `agility`, `endurance`, `intellect`, `intuition`, `presence`

Stat rules:

- each stat between 3 and 20
- total points exactly 44

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
