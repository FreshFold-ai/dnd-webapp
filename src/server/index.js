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

/**
 * Static file middleware.
 *
 * Input:  Any HTTP request whose path matches a file under /public.
 * Output: The matched static file (HTML, CSS, JS, images, etc.).
 */
app.use(express.static(path.join(__dirname, "..", "..", "public")));

/* ── Socket.IO setup ───────────────────────────────────────── */

/**
 * Register all Socket.IO event handlers via the dedicated module.
 *
 * Input:  io — the Socket.IO Server instance.
 * Output: Per-socket event listeners are attached inside the callback.
 */
registerSocketHandlers(io);

/* ── Start ─────────────────────────────────────────────────── */

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
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
