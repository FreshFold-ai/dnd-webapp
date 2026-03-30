/**
 * @file src/server/socketHandlers.js
 * @description Registers all Socket.IO event listeners for room-based
 *              real-time interactions.
 */

const { getRoomSize, emitRoomCount } = require("../helpers/room");

// In memory storage
const roomMessages = {}; // { roomId: [messages] }
const userLastMessageTime = {}; // rate limiting

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    socket.on("room:join", ({ roomId, username }) => {
      if (!roomId || !username) return;

      socket.data.roomId = roomId;
      socket.data.username = username;

      socket.join(roomId);
      console.log(`[JOIN] ${username} joined ${roomId}`);

      if (!roomMessages[roomId]) {
        roomMessages[roomId] = [];
      }

      socket.to(roomId).emit("user:joined", {
        socketId: socket.id,
        username,
      });

      emitRoomCount(io, roomId);
    });

    socket.on("room:message", ({ text }) => {
      const { roomId, username } = socket.data || {};

      if (!roomId || !username || !text) return;

      if (typeof text !== "string" || !text.trim()) {
        socket.emit("error", "Message cannot be empty");
        return;
      }

      if (text.length > 300) {
        socket.emit("error", "Message too long (max 300 chars)");
        return;
      }

      const now = Date.now();
      const lastTime = userLastMessageTime[socket.id] || 0;

      if (now - lastTime < 1000) {
        socket.emit("error", "You're sending messages too fast");
        return;
      }

      userLastMessageTime[socket.id] = now;

      io.to(roomId).emit("room:message", {
        from: username,
        text,
        at: new Date().toISOString(),
      });

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

    // ─── DnD Game Events ──────────────────────────────────────────────────

    socket.on('game:roll', ({ result, die }) => {
      const { roomId, username } = socket.data;
      if (!roomId) return;

      io.to(roomId).emit('game:roll', {
        from: username,
        result,
        die,
        at: new Date().toISOString(),
      });
    });

    socket.on('game:narrate', ({ text }) => {
      const { roomId, username } = socket.data;
      if (!roomId) return;

      io.to(roomId).emit('game:narrate', {
        from: username,
        text,
        at: new Date().toISOString(),
      });
    });

    // ─── WebRTC Signaling ─────────────────────────────────────────────────

    socket.on('webrtc:offer', ({ targetId, offer }) => {
      io.to(targetId).emit('webrtc:offer', {
        fromId: socket.id,
        offer,
      });
    });

    socket.on('webrtc:answer', ({ targetId, answer }) => {
      io.to(targetId).emit('webrtc:answer', {
        fromId: socket.id,
        answer,
      });
    });

    socket.on('webrtc:ice-candidate', ({ targetId, candidate }) => {
      io.to(targetId).emit('webrtc:ice-candidate', {
        fromId: socket.id,
        candidate,
      });
    });

    // ─── Disconnect ───────────────────────────────────────────────────────

    socket.on("disconnect", () => {
      const { roomId, username } = socket.data || {};
      if (!roomId || !username) return;

      console.log(`[DISCONNECT] ${username} left ${roomId}`);

      socket.to(roomId).emit("user:left", { username });
      emitRoomCount(io, roomId);
    });
  });
}

module.exports = { registerSocketHandlers };