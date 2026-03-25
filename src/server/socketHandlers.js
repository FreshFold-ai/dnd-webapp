/**
 * @file src/server/socketHandlers.js
 * @description Registers all Socket.IO event listeners for room-based
 *              real-time interactions.
 *
 * Exports:
 *   registerSocketHandlers(io) — call once after creating the Socket.IO server.
 */

const { getRoomSize, emitRoomCount } = require("../helpers/room");

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

      // Broadcast the message to everyone in the room (including sender)
      io.to(roomId).emit("room:message", {
        from: username,
        text,
        at: new Date().toISOString()
      });
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

      // Notify remaining room members
      socket.to(roomId).emit("user:left", { username });

      // Broadcast updated count
      emitRoomCount(io, roomId);
    });
  });
}

module.exports = { registerSocketHandlers };
