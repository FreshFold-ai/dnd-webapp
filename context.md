# RESUME — Quick resume instructions
#
# Date: 2026-04-25
#
# Status: P2P MESH REFACTOR COMPLETE — next phase is Render deployment
#
# Required: Node.js (>=20), npm
#
# Quick start (local)
# 1. Open a terminal at repository root.
# 2. If `node_modules` is missing:
#
#    npm install
#
# 3. Start the server locally:
#
#    npm start
#
#    or for auto-reload during development:
#
#    npm run dev
#
# 4. Check the app on localhost:
#
#    http://localhost:3000
#
# Architecture Summary (as of 2026-04-25)
# ─────────────────────────────────────────
# The refactor from server-authoritative to P2P-mesh is 100% complete.
#
# Server role (src/server/index.js + socketHandlers.js):
#   - Room creation / join (lobby only)
#   - WebRTC signaling relay (offer/answer/ICE)
#   - DM heartbeat keepalive + absence timer
#   - Static file hosting
#   - /health endpoint (for Render)
#
# Client role (public/js/app.js + p2pMesh.js + catalog.js):
#   - Full-mesh WebRTC DataChannels via P2PMesh
#   - partyMembers roster (player:announce handshake on peer:connected)
#   - DM round engine: action submit → stat classification → authoritative d20 → resolution broadcast
#   - DM encounter engine: NPC spawn → prompt targeted players → receive decide/roll → loot draw → resolved broadcast
#   - All game events (chat, narration, trade, spawn, env, encounter) travel over P2P
#   - All state persists in localStorage; server holds zero gameplay state
#
# Key files:
#   public/js/p2pMesh.js   — WebRTC full-mesh abstraction (window.P2PMesh)
#   public/js/catalog.js   — NPC templates, item registry, loot tables (window.GameCatalog)
#   public/js/app.js       — All client logic (~1900 lines)
#   src/server/socketHandlers.js — Lobby + signaling only (188 lines)
#
# P2P message convention: { t: 'event-type', ...payload } — _from injected on receive
#
# Remaining socket.on (server) — intentional, lobby/signaling only:
#   room:joined, room:count, server:error, connect_error, disconnect,
#   peer:joined, peer:left, dm:offline, room:export:campaign,
#   webrtc:offer, webrtc:answer, webrtc:ice-candidate
#
# ─────────────────────────────────────────
# NEXT: Render Deployment
# See RENDER_DEPLOY.md for full step-by-step.
#
# render.yaml is already configured. You need to:
#   1. Create a personal GitHub mirror repo (classroom org can't authorize Render easily)
#   2. Push master to it:  git push deploy master
#   3. Create free Render account at render.com (sign up with GitHub)
#   4. New → Blueprint → select your mirror repo → Apply
#   5. Render reads render.yaml, builds, deploys automatically
#   6. Copy the .onrender.com URL, write to LIVE_DEMO_URL.txt, commit + push
#
# NOTE: render.yaml currently has `branch: feature/dnd-pivot` — update to `main` or `master`
# to match whatever branch name you push to the mirror.
#
# Free tier notes:
#   - No custom domain needed (you get a free .onrender.com subdomain)
#   - Free tier spins down after 15 min of inactivity (cold start ~30s)
#   - No database needed — server is stateless
#   - No paid plan needed for this project
#
# Tunnels (local demos while developing)
# - localtunnel (quick/ephemeral):
#
#   npm run tunnel:lt
#
# - ngrok (more reliable):
#
#   export NGROK_AUTHTOKEN=your_token
#   npm run tunnel:ngrok
#
# E2E test
#   node scripts/e2e-test.js
#
# Useful file locations
# - `launcher/launcher-config.json` — launcher settings
# - `LIVE_DEMO_URL.txt` — current public URL (ignored by git)
# - `render.yaml` — Render blueprint (set branch to match mirror before deploying)
# - `scripts/e2e-test.js` — quick two-client smoke test
#
# Environment vars
# - `PORT` — server port (default 3000)
# - `NODE_ENV` — set to `production` by Render automatically
#
# Purpose
# - A minimal, copy-paste checklist so you (or another dev) can resume work quickly.
#
# Required: Node.js (>=20), npm
#
# Quick start (local)
# 1. Open a terminal at repository root.
# 2. If `node_modules` is missing, either run the launcher (next item) or install manually:
#
#    npm install
#
# 3. Start the server locally (no tunnel):
#
#    npm start
#
#    or for auto-reload during development:
#
#    npm run dev
#
# 4. Check the app on localhost:
#
#    http://localhost:3000
#
# Launcher & installer UI
# - The launcher will automatically run `npm install` if dependencies are missing and provides a simple installer UI at http://localhost:3333.
#
#   node launcher/start-app.js
#
# - macOS wrapper: `mac/run-localserver.command` (make executable with `chmod +x`).
# - Windows wrapper: `windows\\run-localserver.bat`.
#
# Tunnels (public demos)
# - localtunnel (quick/ephemeral):
#
#   npm run tunnel:lt
#
# - ngrok (more reliable for demos; set auth token first):
#
#   export NGROK_AUTHTOKEN=your_token
#   npm run tunnel:ngrok
#
# - The server writes the current public URL to `LIVE_DEMO_URL.txt` in the repo root when a tunnel is active.
#
# E2E test
# - Run the small automated test (uses `LIVE_DEMO_URL.txt`, falls back to localhost):
#
#   node scripts/e2e-test.js
#
# Packaging
# - macOS thin .app:
#
#   npm run package:mac
#   # output: dist/RoomApp.app
#
# - Windows executable (pkg):
#
#   npm run package:win
#   # output: dist/RoomApp-win.exe
#
# Stopping the server
# - Find and kill the process listening on port 3000:
#
#   pid=$(lsof -ti :3000); if [ -n "$pid" ]; then kill $pid; fi
#
# Useful file locations
# - `launcher/launcher-config.json` — launcher settings (preferredTunnel, ngrokAuthtoken).
# - `LIVE_DEMO_URL.txt` — current public tunnel URL (ignored by git).
# - `dist/` — packaging artifacts.
# - `scripts/e2e-test.js` — quick two-client test.
#
# Environment vars
# - `PORT` — server port (default 3000)
# - `TUNNEL` — `localtunnel` or `ngrok` (used by launcher)
# - `NGROK_AUTHTOKEN` — ngrok token for reserved/custom domains and better reliability
# - `TUNNEL_SUBDOMAIN` — optional subdomain for localtunnel (may be refused if taken)
#
# Next recommended steps (when you return)
# 1. Provide `NGROK_AUTHTOKEN` if you want me to run a reliable public demo with ngrok.
# 2. Or ask me to prepare a `render.yaml` and step-by-step Render deployment instructions (I can add the file and exact environment variable guidance).
# 3. If you want packaging/signing automation, tell me which platform to prioritize (mac or windows) and I will prepare signing/DMG instructions.
#
# If you want me to proceed with any of the next steps before you step away, reply with which one: `ngrok` (demo), `render` (deploy), or `package` (signing/DMG).

# Context for Local Hosting Stage

Date: 2026-04-11
Repository: network-architecture-spring-2026-term-project-lab-empty-1 (feature/dnd-pivot)
Workspace root: /workspaces/term-project-team-invincible

Goal
- Provide a double-clickable macOS app that launches a local Node server which serves the webapp in this repo.
- Make the running site reachable by anyone via a public URL (using a tunnel like `ngrok` or `localtunnel`) and optionally map to a cheap domain.
- Keep a minimal "room DM" (room owner) link/state between the room creator and participants.

Known files/locations (start here)
- package.json
- public/index.html
- public/js/app.js
- src/server/index.js
- src/server/socketHandlers.js
- src/helpers/room.js

Target environment
- Final host: Apple Mac (Apple Silicon M-series, e.g., M5)
- Dev environment: current workspace container (Linux) — will be used to prepare scripts and assets
- Runtime: Node.js (version TBD after reading `package.json`)

Security & privacy notes
- Exposing a local machine to the public has risks. For initial testing, use a temporary tunnel URL and avoid sensitive data.
- If mapping a domain, use a short-lived DNS mapping or managed DNS with HTTPS via the tunnel provider if possible.

Immediate next steps
1. Inspect `package.json` to confirm Node version and existing start scripts. (in-progress)
2. Inspect `src/server/index.js` and `src/server/socketHandlers.js` to confirm stack (Express, Socket.io) and port.
3. Ensure static files are served and sockets are wired to `public/` front-end.
4. Add or update `npm start` script and `Procfile`-style runner if needed.
5. Test `npm start` locally and confirm the app loads and rooms can be created/joined.
6. Set up a tunnel (`ngrok` or `localtunnel`) and optionally map a cheap domain.
7. Package a macOS double-clickable app (Automator app, `appify` script, or simple `.command` wrapper in a `.app` bundle) that launches the server and opens the browser.

Placeholders to fill after inspection
- Node version: TBD
- Server entrypoint: TBD
- Server port: TBD

Notes
- Record chosen domain/tunnel URL and any credentials here for later steps.
- Keep `context.md` updated as we progress.

Status
- `context.md` created on 2026-04-11
- Next: review server files and `package.json` to determine exact modifications needed.
Tunnel usage
- To start an ephemeral tunnel automatically when the server starts, set the `TUNNEL` environment variable to `localtunnel` or `ngrok` before running `npm start`.
- Example commands:
	- Localtunnel: `TUNNEL=localtunnel TUNNEL_SUBDOMAIN=mydemo npm start` or `npm run tunnel:lt`
	- Ngrok: `TUNNEL=ngrok NGROK_AUTHTOKEN=<token> npm start` or `npm run tunnel:ngrok`
- The server will log the public tunnel URL on startup and store it at `app.locals.tunnelUrl`.
- Note: `localtunnel`/`ngrok` packages must be installed (`npm install`) before using these features.

Ngrok (demos) vs Render (production)

- Ngrok (recommended for demos):
	- Use ngrok for demos where you want a reliable HTTPS URL and WebSocket support. Ngrok free tier provides an ephemeral https://*.ngrok.io URL that works with Socket.IO; paid plans provide reserved subdomains and custom domain support.
	- To get an authtoken: sign up at https://ngrok.com, open your dashboard, copy the authtoken and run `ngrok authtoken <TOKEN>` locally or set `NGROK_AUTHTOKEN` in `launcher/launcher-config.json` or your environment.
	- Launcher usage: set `preferredTunnel: "ngrok"` in `launcher/launcher-config.json` (or run `TUNNEL=ngrok NGROK_AUTHTOKEN=<TOKEN> npm start`). The server writes the public URL to `LIVE_DEMO_URL.txt`.

- Render (recommended for stable demos / production):
	- Render provides always-on web services without requiring a tunnel. Use Render to host the app for a stable public URL and better reliability for multi-user realtime usage.
	- Quick Render steps: create an account at https://render.com, create a new Web Service, connect your GitHub repo, set Build Command to `npm install`, Start Command to `npm start`, and add any environment variables (e.g., TURN credentials later). Deploy and verify the public URL.
	- Example minimal `render.yaml` (optional):
		```yaml
		services:
			- type: web
				name: room-app
				env: node
				buildCommand: npm install
				startCommand: npm start
		```

What we're doing next (high level)

1. Get an `NGROK_AUTHTOKEN` and run a ngrok-based demo to validate multi-client realtime behavior. Use the launcher or `npm run tunnel:ngrok`.
2. Prepare a Render deployment: add a `render.yaml` (optional), configure the service on Render, set env vars, and deploy.
3. Acquire a cheap domain if desired and map it to the Render-hosted service (or to a paid ngrok custom domain if you use ngrok paid features).
4. Plan and implement TURN server integration and finalize the P2P signaling protocol for WebRTC (optional, required for robust audio/video P2P in NAT environments).
5. Finalize packaging (`dist/RoomApp.app`, `dist/RoomApp-win.exe`), code signing, and release notes.

Status (latest)
- Launcher with installer UI and programmatic `localtunnel` / `ngrok` support implemented.
- Packaging scripts added for macOS `.app` and Windows `.exe` (see `scripts/`).
- E2E local tests passed; public E2E via `localtunnel` was flaky in this environment — use ngrok or Render for reliable public demos.

Deployment & cloud notes

- Getting an ngrok authtoken: sign up at https://ngrok.com, open your dashboard, copy the "Authtoken" (Connect/Setup section) and either run `ngrok authtoken <TOKEN>` locally or set `NGROK_AUTHTOKEN` in your environment or `launcher/launcher-config.json`.
- Quick tunnel comparison:
	- `localtunnel`: free, no signup, ephemeral URL — great for quick PR/demo testing but can be flaky for multiple realtime clients.
	- `ngrok`: free ephemeral HTTPS URL that supports WebSockets; paid plans provide reserved subdomains, custom domains, and better reliability/inspector features.
	- Cloud hosts (Render, Railway): deploy the app for a stable public URL without tunnels; both offer free tiers but pricing/features change — compare current plans before committing.
- Cloud quick-starts:
	- Render: create account, connect GitHub, create a new Web Service, set build/start commands (`npm install` / `npm start`), add env vars if needed, deploy.
	- Railway: create account, create a new project from GitHub, pick the repo, configure start command (`npm start`), add env vars, deploy.
- Which to choose:
	- Quick/ephemeral demos: keep using `localtunnel` or `ngrok` free tier.
	- Reliable public demo or production: use Render or Railway (Render tends to be straightforward for always-on web services; Railway is fast for iterative deploys). Both have free tiers; long-term, paid plans or small VMs will cost more — check their pricing pages.

Launcher, installer & artifacts

- The launcher now provides a small installer UI when `node_modules` are missing (open at `http://localhost:3333`) that runs `npm install` and streams logs.
- The launcher is at `launcher/start-app.js`. It spawns the server with `TUNNEL` set per `launcher/launcher-config.json` and writes the public URL to `LIVE_DEMO_URL.txt`.
- Packaging artifacts generated in `dist/`: `dist/RoomApp.app` (macOS thin wrapper) and `dist/RoomApp-win.exe` (Windows executable via `pkg`).

Where the live URL appears

- When a tunnel is active the server writes the public URL to `LIVE_DEMO_URL.txt` at the repo root; use that file or the server console to copy the demo link.

Next choice

- If you want a persistent public URL, I recommend (step-by-step) either: reserve an ngrok subdomain (paid) or deploy to Render/Railway and map a cheap domain. Tell me which and I'll walk through the exact steps.

---

# Remaining Implementation Plan

Date: 2026-04-25
Status: P2P refactor ~40% complete. Server is done. Client is not yet updated.

## What is already done

- `src/server/socketHandlers.js` — rewritten to lobby-only (188 lines).
  Emits: `room:joined` (with `peers[]`), `peer:joined`, `peer:left`, `dm:offline`.
  Relays: `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`.
  No game logic, no round state, no encounters, no messages.
- `public/js/catalog.js` — new file. `window.GameCatalog`: NPC_TEMPLATES (13), ITEM_TYPES,
  OPTION_POOLS, OUTCOME_FLAVOR, `getOptionsForEncounter()`, `drawLoot()`, `seededRandom()`.
- `public/js/p2pMesh.js` — new file. `window.P2PMesh`: full-mesh WebRTC manager.
  API: `connectToPeer`, `handleOffer`, `handleAnswer`, `handleIceCandidate`,
  `broadcast`, `sendToPeer`, `on(type, fn)`, `off`, `getPeers`, `closeAll`.
  Messages are typed JSON: `{ t: "type", ...payload }`.
  Fires internal events: `peer:connected`, `peer:disconnected`.

## What still needs to be done

### Step 1 — Wire new scripts into index.html (5 min)

In `public/index.html`, add before the existing `<script src="/js/app.js">` tag:

```html
<script src="/js/catalog.js"></script>
<script src="/js/p2pMesh.js"></script>
```

Both must load before `app.js` since app.js will reference `window.GameCatalog`
and `window.P2PMesh`.

### Step 2 — Replace old WebRTC code in app.js with P2PMesh (30 min)

Remove these from `app.js` (they are replaced by p2pMesh.js):
- State vars: `peerConnections`, `dataChannels`, `pendingFiles`, `ICE_SERVERS`
- Functions: `createPeerConnection()`, `setupDataChannel()`, `initiateOffer()`
- Keep `sendFileToPeer()` stub but rewrite to use `P2PMesh.sendToPeer()` instead of `dataChannels`
- Keep `updateConnectionStatus()` — still useful for Socket.IO status

Wire P2PMesh signal relay at the top of the socket listener section:

```js
socket.on('webrtc:offer',         ({ fromId, offer })     => P2PMesh.handleOffer(fromId, offer));
socket.on('webrtc:answer',        ({ fromId, answer })    => P2PMesh.handleAnswer(fromId, answer));
socket.on('webrtc:ice-candidate', ({ fromId, candidate }) => P2PMesh.handleIceCandidate(fromId, candidate));
```

Remove the old `socket.on('webrtc:offer/answer/ice-candidate')` blocks (lines ~1680–1705).

### Step 3 — Handle new server events in app.js (20 min)

The new server emits different events. Update `app.js`:

**`room:joined`** — now includes `peers[]` (socket IDs already in room).
  After the existing join-UI logic, add:
  ```js
  (peers || []).forEach(peerId => P2PMesh.connectToPeer(peerId));
  ```

**`peer:joined`** (replaces `user:joined`) — server notifies room when someone joins.
  ```js
  socket.on('peer:joined', ({ socketId, username, character }) => {
    addMessage(`${username} joined the party.`, 'system');
    // existing peers connect back to the newcomer (newcomer already initiated via peers[])
    // no need to call connectToPeer here — the joiner connects to us via peers[]
  });
  ```

**`peer:left`** (replaces `user:left`) — server notifies room when someone leaves.
  ```js
  socket.on('peer:left', ({ socketId, username }) => {
    addMessage(`${username} left the party.`, 'system');
  });
  ```

**`dm:offline`** (new) — DM timed out or disconnected.
  ```js
  socket.on('dm:offline', ({ reason }) => {
    addMessage('The DM has gone offline. Session paused.', 'error');
    P2PMesh.closeAll();
  });
  ```

**Remove** the now-dead `socket.on('user:joined')` and `socket.on('user:left')` handlers.

**`room:started`** — this event no longer exists in the new server. The DM now receives
  `room:joined` (with `isDM: true`) instead. Remove the `socket.on('room:started')` handler
  and move any needed logic (room code display, storage reset) into the `room:joined` handler
  behind an `if (isDM)` guard. Note: the existing `room:started` handler references
  `roomMeta` which is out of scope — this is an existing bug.

### Step 4 — DM heartbeat timer (5 min)

After the DM's `room:joined`, start a keepalive so the server doesn't time out the room:

```js
if (isDM) {
  setInterval(() => socket.emit('room:heartbeat'), 30_000);
}
```

### Step 5 — Client-side roster system (replaces server-emitted room:users) (30 min)

The new server never emits `room:users`. Each client must maintain the party list P2P.

On `P2PMesh.on('peer:connected', ({ peerId }) => ...)`:
  - Send own identity + character to the new peer:
    ```js
    P2PMesh.sendToPeer(peerId, {
      t: 'player:announce',
      socketId: socket.id,
      username: myUsername,
      isDM,
      character: myCharacter,
      avatar: myAvatar,
    });
    ```

On `P2PMesh.on('player:announce', (payload) => ...)`:
  - Add/update peer in a local `partyMembers` map keyed by `payload.socketId`.
  - Call `updateUserRoster(Object.values(partyMembers))`.

On `P2PMesh.on('peer:disconnected', ({ peerId }) => ...)`:
  - Remove from `partyMembers`. Re-render roster.

Initialize own entry in `partyMembers` on join so self appears in roster.
Remove the now-dead `socket.on('room:users')` handler.
Update `updateTradePlayerList`, `updateDmWhisperList`, `updateSpawnPlayerList` to
use `partyMembers` values instead of the server-pushed `users` array.

### Step 6 — Replace socket emissions with P2P broadcasts (45 min)

Each function that was emitting a game event to the server must now broadcast/send over P2P.
Message type convention (`t` field) is defined here for consistency:

| Old `socket.emit(...)` | New P2P equivalent |
|---|---|
| `room:message { text }` | `P2PMesh.broadcast({ t:'chat', from:myUsername, text })` |
| `game:narrate { text }` | `P2PMesh.broadcast({ t:'narrate', from:myUsername, text })` |
| `dm:whisper { targetId, text }` | `P2PMesh.sendToPeer(targetId, { t:'whisper', from:myUsername, text })` |
| `round:submit-action { text }` | `P2PMesh.broadcast({ t:'round:action', from:myUsername, text })` (DM resolves) |
| `round:submit-roll` | `P2PMesh.broadcast({ t:'round:roll', from:myUsername, roll:d20() })` |
| `room:advance-round` | `P2PMesh.broadcast({ t:'round:advance', roundNumber })` (DM only) |
| `trade:item { targetId, item }` | `P2PMesh.sendToPeer(targetId, { t:'trade:offer', from:myUsername, item })` |
| `dm:spawn { npcType, ... }` | `P2PMesh.broadcast({ t:'encounter:start', ...resolvedEncounter })` (DM only) |
| `dm:env { eventType, detail }` | `P2PMesh.broadcast({ t:'env:event', eventType, detail, from:myUsername })` |
| `encounter:decide { eid, ... }` | `P2PMesh.sendToPeer(dmSocketId, { t:'encounter:decide', eid, ... })` |
| `encounter:roll { eid, roll }` | `P2PMesh.sendToPeer(dmSocketId, { t:'encounter:roll', eid, roll })` |
| `room:export:campaign` | Local read of sessionStorage — no socket needed. Trigger `downloadTxtFile()` directly. |

Track `dmSocketId` from `room:joined` (`roomMeta` doesn't include it yet; use `peers[0]`
for players joining after the DM since the DM is always the first socket in the room).
Better: include `dmSocketId` in `room:joined` emit from server (small server change, ~2 lines).

### Step 7 — Replace socket.on game handlers with P2PMesh.on handlers (45 min)

Remove all dead `socket.on` handlers for events the server no longer emits, and add
equivalent `P2PMesh.on(type, handler)` listeners. Map:

| Remove `socket.on(...)` | Add `P2PMesh.on(type, ...)` |
|---|---|
| `room:round` | `'round:state'` — DM broadcasts full round state after each change |
| `round:action:declared` | `'round:action'` |
| `round:action:prompted` | (DM-local resolution; DM responds via `P2PMesh.sendToPeer`) |
| `round:action:assigned` | `'round:assigned'` — DM sends back to the submitting player |
| `round:action:roll:accepted` | `'round:roll:ack'` — DM acks after receiving roll |
| `round:action:roll-locked` | `'round:roll'` (observe others' rolls) |
| `round:actions:resolved` | `'round:resolved'` — DM broadcasts resolution results |
| `room:message` | `'chat'` |
| `dm:whisper` | `'whisper'` |
| `game:roll` | `'game:roll'` |
| `game:narrate` | `'narrate'` |
| `trade:received` | `'trade:offer'` — receiving end accepts and updates inventory |
| `trade:sent` | local (sender removes item on submit, no ack needed) |
| `trade:notify` | `'trade:offer'` (DM sees all; filter `_from` isn't targetId) |
| `dm:spawn:result` | (DM is now authoritative; no ack needed) |
| `dm:spawn:event` | `'encounter:start'` |
| `dm:env:result` | (DM is now authoritative; local update) |
| `dm:env:event` | `'env:event'` |
| `room:spawn-limits` | local tracking in DM client |
| `room:env-limits` | local tracking in DM client |
| `encounter:start` | `'encounter:start'` |
| `encounter:roster` | `'encounter:roster'` — DM broadcasts as decisions come in |
| `encounter:prompt` | `'encounter:prompt'` — DM sends to targeted players |
| `encounter:decision:ack` | `'encounter:decision:ack'` — DM sends back to deciding player |
| `encounter:roll:ack` | `'encounter:roll:ack'` — DM sends back to rolling player |
| `encounter:ready` | `'encounter:ready'` — DM broadcasts |
| `encounter:resolved` | `'encounter:resolved'` — DM broadcasts |
| `room:export:campaign` | remove; export is now fully local |

### Step 8 — Client-side encounter + round engine (DM only) (60 min)

The server no longer resolves encounters or rounds. The DM client must do this.
Use `window.GameCatalog` for all data lookups.

**Encounter engine (DM client):**
- On `dmSpawnNPC()`: look up template from `GameCatalog.NPC_TEMPLATES`, generate `eid`,
  compute options via `GameCatalog.getOptionsForEncounter(role, seed)`.
  Broadcast `{ t:'encounter:start', eid, npcName, npcRole, npcStats, options }` to targets.
  Also broadcast `{ t:'encounter:prompt', eid, ... }` to each target player.
- On `P2PMesh.on('encounter:decide', ...)`: record decision, send back
  `{ t:'encounter:decision:ack', eid, optionLabel, needsRoll, check }` to that player.
  Broadcast updated `{ t:'encounter:roster', eid, roster }` to DM's own view.
- On `P2PMesh.on('encounter:roll', ...)`: record roll, resolve if all players ready.
  Send `{ t:'encounter:roll:ack', eid, ... }` back to roller.
  When all ready, broadcast `{ t:'encounter:ready', eid }`.
- On DM force-resolve or all players ready + round advance:
  compute outcome + loot via `GameCatalog.drawLoot()`.
  Broadcast `{ t:'encounter:resolved', eid, outcome, flavor, perPlayerLoot }`.

**Round engine (DM client):**
- On `P2PMesh.on('round:action', ...)`: DM records action, assigns stat check
  (pick relevant stat from action text heuristic or a fixed map), sends back
  `{ t:'round:assigned', text, statKey, statLabel, statValue, threshold }` to that player.
  Broadcast `{ t:'round:action', from, text }` to all (observed by other players).
- On `P2PMesh.on('round:roll', ...)`: DM records roll, broadcasts
  `{ t:'round:roll', from, roll, text }` to all.
- On `advanceRound()` (DM): resolve all pending actions, broadcast
  `{ t:'round:resolved', roundNumber, results[] }` then
  `{ t:'round:state', roundNumber, phase:'action' }` to open next round.

**Spawn limits and env limits:** track locally in DM client state vars
(`spawnLimits`, `envLimits`); no server involved.

### Step 9 — Misc cleanup (15 min)

- Remove the duplicate `function displayError()` declaration (appears twice in app.js).
- The `saveInventoryToStorage()` function is defined at line ~1590 but called at line ~1555
  (before its definition). Move it earlier or convert to use `writeStoredJson` inline.
- `goBackToJoin`: implement — call `P2PMesh.closeAll()`, reset state vars, hide `chatSection`,
  show `joinSection`. (Was a TODO stub in the old code.)
- `sendFileToPeer`: rewrite to use `P2PMesh.sendToPeer()` for the data channel,
  and add a file-picker button in the trade panel to call it. (Was a TODO stub.)

## File change summary

| File | Change |
|---|---|
| `public/index.html` | Add 2 script tags for `catalog.js` and `p2pMesh.js` |
| `public/js/app.js` | ~600 lines removed (old WebRTC + dead socket handlers), ~400 lines added (P2PMesh wiring, roster system, client-side game engines) |
| `src/server/socketHandlers.js` | Already done — no further changes needed |
| `public/js/catalog.js` | Already done — no further changes needed |
| `public/js/p2pMesh.js` | Already done — no further changes needed |

## Small optional server change (recommended)

In `socketHandlers.js`, include `dmSocketId` in the `room:joined` payload sent to players:

```js
socket.emit('room:joined', {
  roomId,
  socketId: socket.id,
  isDM: false,
  roomMeta: { roomType: room.roomType, dmName: room.dmName },
  peers,
  dmSocketId: room.dmSocketId,   // ← add this
});
```

This lets player clients correctly target the DM for `encounter:decide` and
`encounter:roll` without guessing which peer is the DM.
