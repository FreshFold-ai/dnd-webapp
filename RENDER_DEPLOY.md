# Render Deployment — Resume Context

**Date written:** April 23, 2026 · Updated April 25, 2026
**Branch to deploy:** `master` (local) → `main` on the mirror
**Source repo:** `mjdecker-teaching/network-architecture-spring-2026-term-project-lab-empty-1` (classroom — do not deploy from here)
**Deploy repo:** a personal GitHub mirror of the above (see B1)

---

## Where things stand

All codebase bugs and warnings from the code review have been fixed and committed.
The app runs correctly locally. The three code edits below have already been applied.
**Nothing has been deployed to Render yet.** Part B (5 steps on the Render website) is what remains.

The server is stateless by design — all durable player data lives in `localStorage` on the client.
No database, no secrets, and no API keys are needed to deploy.

---

## Part A — Code edits (already done as of April 23, 2026)

### A1. `/health` endpoint — `src/server/index.js`

Added after `app.use(express.static(...))`:

```js
app.get('/health', (_, res) => res.status(200).json({ status: 'ok' }));
```

Render pings this after every deploy to confirm the service is live before routing traffic.

### A2. `render.yaml` — updated fields

Added `branch`, `region`, and `healthCheckPath` to the existing blueprint:

```yaml
services:
  - type: web
    name: term-project-team-invincible
    runtime: node
    plan: free
    branch: main
    region: oregon
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
```

### A3. `package.json` — tunnel packages moved to `devDependencies`

`localtunnel` and `ngrok` moved from `dependencies` to `devDependencies`. With
`NODE_ENV=production` set during Render's build phase, `npm install` skips devDependencies
automatically — saves ~40 MB. The tunnel code in `index.js` is already gated behind
`if (process.env.TUNNEL)` which Render never sets, so there is zero runtime impact.

---

## Part B — Steps you do on GitHub and the Render website

### B1. Create a personal mirror repo on GitHub

Because the source repo is under a classroom org (`mjdecker-teaching`), deploying from it
directly would require instructor approval for Render's GitHub App. The clean workaround
is to mirror just the deploy branch into a repo you own.

On GitHub.com:
1. Create a **new empty public repo** under your personal account, e.g. `your-username/dnd-room-app`.
2. Do **not** initialize it with a README — leave it completely empty.

Then in the terminal at the repo root:

```bash
# Add your personal repo as a second remote
git remote add deploy https://github.com/YOUR_USERNAME/dnd-room-app.git

# Push the current branch to it (as 'main' on the mirror)
git push deploy master:main
```

`render.yaml` already has `branch: main` — no extra commit needed.
```

From this point on, whenever you want to redeploy just push to the mirror:

```bash
git push origin master          # keeps classroom repo in sync
git push deploy master:main     # triggers Render auto-deploy
```

### B2. Create a free Render account

Go to https://render.com → "Get Started for Free" → **Sign up with GitHub**.
Authorize Render to access your **personal** GitHub account — no org approval needed.

### B3. Create the Web Service via Blueprint

In the Render dashboard: **New → Blueprint** → select `your-username/dnd-room-app` → Render reads `render.yaml` → click **Apply**

Render pre-fills all settings from the yaml file:
- Name: `term-project-team-invincible`
- Runtime: Node | Build: `npm install` | Start: `npm start`
- Region: Oregon | Plan: Free | Health check: `/health`

The first deploy starts automatically.

### B4. Watch the deploy logs

Dashboard → your service → **Logs** tab.
A successful deploy ends with a line like:

```
Server running on http://localhost:10000
```

If the build goes red, paste the error lines into a new Copilot session — it can diagnose
and fix immediately.

### B5. Copy the public URL and update `LIVE_DEMO_URL.txt`

After a green deploy: Dashboard → **Settings → Custom Domains** shows the auto-assigned URL,
e.g. `https://term-project-team-invincible.onrender.com`

Open it in a browser to confirm the landing page loads, then commit the URL:

```bash
echo "https://term-project-team-invincible.onrender.com" > LIVE_DEMO_URL.txt
git add LIVE_DEMO_URL.txt
git commit -m "docs: update live demo URL"
git push origin master        # classroom repo
git push deploy master:main   # Render mirror
```

---

## Smoke test after deploy

Open the Render URL in two separate browsers (Tab 1 = DM, Tab 2 = Player):

| Step | Action | Expected result |
|------|--------|----------------|
| 1 | Tab 1: Create a room as DM | DM panel and NPC spawn section appear |
| 2 | Tab 2: Join the same room with the same room code | Player sees the message feed |
| 3 | DM: Spawn a specific NPC from the template dropdown (e.g. Goblin Scout) | Encounter card appears in Tab 2's message feed |
| 4 | Player: Choose a decision, submit a d20 roll | Encounter resolves, loot appears, inventory updates |
| 5 | DM: Trigger a weather environment event | Narration message appears in both tabs |
| 6 | Player: Export character → re-import the `.txt` file | Name, stats, and inventory survive the roundtrip |
| 7 | Check Render dashboard → Logs | No red runtime errors |

---

## Known constraints

| Constraint | Detail |
|---|---|
| **Free tier cold start** | Render sleeps services after 15 min of inactivity. Cold start = 30–50 s. In-room state (encounters, roster, round count) is lost on wake — players must rejoin. Exported `.txt` files are local and unaffected. |
| **Single instance** | Free tier is one process. Socket.IO works perfectly without a Redis adapter at this scale. |
| **WebSockets** | Supported on all Render plans including free. Socket.IO's upgrade from long-polling to WebSocket works with zero extra config. |
| **Auto-deploys** | Every push to `feature/dnd-pivot` triggers a redeploy automatically once the branch is connected. |
| **No secrets needed** | No database, no API keys, no `.env` file required. The only env var is `NODE_ENV=production`, already in `render.yaml`. |
