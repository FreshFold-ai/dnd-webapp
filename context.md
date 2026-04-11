# RESUME — Quick resume instructions
#
# Date: 2026-04-11
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
