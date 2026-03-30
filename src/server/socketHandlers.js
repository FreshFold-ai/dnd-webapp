/**
 * @file src/server/socketHandlers.js
 * @description Registers all Socket.IO event listeners for room-based
 *              real-time interactions.
 *
 * Exports:
 *   registerSocketHandlers(io) — call once after creating the Socket.IO server.
 */

const { getRoomSize, emitRoomCount } = require("../helpers/room");

// In memory storage
const roomMessages = {}; // { roomId: [messages] }
const userLastMessageTime = {}; // rate limiting

/**
 * registerSocketHandlers — attaches the "connection" listener to the
 * Socket.IO server and registers per-socket event handlers inside it.
 *
 * @param   {import("socket.io").Server} io — the Socket.IO Server instance.
 * @returns {void}
 *
 * Side-effect: every new socket gets listeners for
 *   room:join, room:message, and disconnect.
 */
function registerSocketHandlers(io) {

  /**
   * io.on("connection") — fired for every new WebSocket client.
   *
   * Input:  socket — the Socket.IO socket instance for this client.
   * Output: registers the event listeners described below.
   */
  io.on("connection", (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    /**
     * Event: room:join
     *
     * Description: Client requests to join a named room.
     *
     * Input payload:
     *   { roomId: string   — identifier for the room to join,
     *     username: string  — display name chosen by the user }
     *
     * Outputs / side-effects:
     *   1. Stores roomId and username on socket.data for later use.
     *   2. Adds the socket to the Socket.IO room identified by roomId.
     *   3. Emits "user:joined" to OTHER members of the room
     *      with payload { socketId, username }.
     *   4. Emits "room:joined" back to the JOINING socket only
     *      with payload { roomId, socketId }.
     *   5. Emits "room:count" to ALL members (including joiner)
     *      with payload { roomId, count }.
     *
     * Validation: silently returns if roomId or username is falsy.
     */
    socket.on("room:join", ({ roomId, username }) => {
      // Guard: both fields are required
      if (!roomId || !username) return;

      // Persist session info on the socket for use by other handlers
      socket.data.roomId = roomId;
      socket.data.username = username;

      // Subscribe this socket to the room channel
      socket.join(roomId);

      // Log the join event on the server console
      console.log(`[JOIN] ${username} joined ${roomId}`);

      // Initialize message history for the room if it doesn't exist
      if (!roomMessages[roomId]) {
        roomMessages[roomId] = [];
      }

      // Notify existing room members that someone new arrived
      socket.to(roomId).emit("user:joined", {
        socketId: socket.id,
        username
      });

      // Confirm the join back to the requesting client
      socket.emit("room:joined", {
        roomId,
        socketId: socket.id
      });

      // Broadcast updated member count to the entire room
      emitRoomCount(io, roomId);
    });

    /**
     * Event: room:message
     *
     * Description: Client sends a text message to their current room.
     *
     * Input payload:
     *   { text: string — the message content }
     *
     * Outputs / side-effects:
     *   Emits "room:message" to ALL sockets in the sender's room
     *   with payload { from: string, text: string, at: string (ISO 8601) }.
     *
     * Validation: silently returns if the sender has not joined a room,
     *             or if text is falsy.
     */
    socket.on("room:message", ({ text }) => {
      const { roomId, username } = socket.data || {};

      // Guard: sender must have joined and provided a non-empty message
      if (!roomId || !username || !text) return;

      // Additional validation: non-empty and max length
      if (typeof text !== "string" || !text.trim()) {
        socket.emit("error", "Message cannot be empty");
        return;
      }

      // Max length check (e.g., 300 chars)
      if (text.length > 300) {
        socket.emit("error", "Message too long (max 300 chars)");
        return;
      }

      // Rate limiting: allow max 1 message per second per user
      const now = Date.now();
      const lastTime = userLastMessageTime[socket.id] || 0;

      if (now - lastTime < 1000) {
        socket.emit("error", "You're sending messages too fast");
        return;
      }

      userLastMessageTime[socket.id] = now;



      // Broadcast the message to everyone in the room (including sender)
      io.to(roomId).emit("room:message", {
        from: username,
        text,
        at: new Date().toISOString()
      });

      // Store the message in the room's history (in-memory)
      if (!roomMessages[roomId]) {
        roomMessages[roomId] = [];
      }

      roomMessages[roomId].push({
        from: username,
        text: text.trim(),
        at: new Date().toISOString()
      });

      if (roomMessages[roomId].length > 100) {
        roomMessages[roomId].shift();
      }
    });

    /**
     * Event: disconnect
     *
     * Description: Fired automatically when the client's transport closes
     *              (tab closed, network lost, etc.).
     *
     * Input:  none (triggered by Socket.IO internals).
     *
     * Outputs / side-effects:
     *   1. Emits "user:left" to remaining members of the room
     *      with payload { username }.
     *   2. Emits updated "room:count" to the room.
     *
     * Validation: silently returns if the socket never joined a room.
     */
    socket.on("disconnect", () => {
      const { roomId, username } = socket.data || {};
      if (!roomId || !username) return;

      // Log the disconnect event on the server console
      console.log(`[DISCONNECT] ${username} left ${roomId}`);

      // Notify remaining room members
      socket.to(roomId).emit("user:left", { username });

      // Broadcast updated count
      emitRoomCount(io, roomId);
    });
  });
}

module.exports = { registerSocketHandlers };
