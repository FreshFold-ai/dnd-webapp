/**
 * @file src/server/index.js
 * @description Application entry point. Creates the Express app, attaches
 *              the HTTP server, wires up Socket.IO, and starts listening.
 *
 * Responsibilities:
 *   - Configure Express to serve static assets from /public.
 *   - Create the HTTP server wrapping Express.
 *   - Initialise Socket.IO and delegate event handling to socketHandlers.
 *   - Listen on the configured port.
 */

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { registerSocketHandlers } = require("./socketHandlers");

/* ── Bootstrap ─────────────────────────────────────────────── */

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/** Port the server listens on.  Overridable via the PORT env var. */
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
});

/**
 * Static file middleware.
 *
 * Input:  Any HTTP request whose path matches a file under /public.
 * Output: The matched static file (HTML, CSS, JS, images, etc.).
 */
app.use(express.static(path.join(__dirname, "..", "..", "public")));

/** Health check endpoint for Render deploy verification. */
app.get('/health', (_, res) => res.status(200).json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error('[HTTP ERROR]', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

/* ── Socket.IO setup ───────────────────────────────────────── */

/**
 * Register all Socket.IO event handlers via the dedicated module.
 *
 * Input:  io — the Socket.IO Server instance.
 * Output: Per-socket event listeners are attached inside the callback.
 */
registerSocketHandlers(io);

/* ── Start ─────────────────────────────────────────────────── */

server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  const tunnelType = process.env.TUNNEL; // 'localtunnel' or 'ngrok'
  if (tunnelType) {
    (async () => {
      try {
        const { startTunnel } = require("./tunnel");
        const tunnel = await startTunnel(PORT, { type: tunnelType, subdomain: process.env.TUNNEL_SUBDOMAIN });
        if (tunnel && tunnel.url) {
          console.log(`[TUNNEL] Public URL: ${tunnel.url}`);
          app.locals.tunnelUrl = tunnel.url;
          const cleanup = async () => {
            try { await tunnel.close(); } catch (e) {}
            process.exit(0);
          };
          process.on("SIGINT", cleanup);
          process.on("SIGTERM", cleanup);
        }
      } catch (err) {
        console.error("[TUNNEL] Failed to start tunnel:", err);
      }
    })();
  }
});

// HANDLE CRASHES
/**
 * Global handlers for uncaught exceptions and unhandled promise rejections.
 * Logs the error to the console
 */
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

process.on("unhandledRejection", (err) => {
  console.error("[UNHANDLED REJECTION]", err);
});
