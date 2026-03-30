const { getRoomSize, emitRoomCount } = require('../helpers/room');
 
function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
 
    // ─── Room Events ────────────────────────────────────────────────────────
 
    socket.on('room:join', ({ roomId, username }) => {
      socket.data.roomId = roomId;
      socket.data.username = username;
 
      socket.join(roomId);
 
      // Tell the joining user they're in
      socket.emit('room:joined', { roomId, socketId: socket.id });
 
      // Tell everyone else in the room a new user arrived
      socket.to(roomId).emit('user:joined', {
        socketId: socket.id,
        username,
      });
 
      emitRoomCount(io, roomId);
    });
 
    socket.on('room:message', ({ text }) => {
      const { roomId, username } = socket.data;
      if (!roomId) return;
 
      io.to(roomId).emit('room:message', {
        from: username,
        text,
        at: new Date().toISOString(),
      });
    });
 
    // ─── DnD Game Events ────────────────────────────────────────────────────
 
    // Broadcast a dice roll result to the whole room
    socket.on('game:roll', ({ result, die }) => {
      const { roomId, username } = socket.data;
      if (!roomId) return;
 
      io.to(roomId).emit('game:roll', {
        from: username,
        result,
        die,         // e.g. 20 for a d20
        at: new Date().toISOString(),
      });
    });
 
    // DM-only: push a new narration line to the room
    socket.on('game:narrate', ({ text }) => {
      const { roomId, username } = socket.data;
      if (!roomId) return;
 
      io.to(roomId).emit('game:narrate', {
        from: username,
        text,
        at: new Date().toISOString(),
      });
    });
 
    // ─── WebRTC Signaling ───────────────────────────────────────────────────
    // The server doesn't interpret any of this — it just passes messages
    // between two specific sockets so they can negotiate a direct P2P link.
 
    // Offer: Player A wants to open a P2P connection to Player B
    socket.on('webrtc:offer', ({ targetId, offer }) => {
      io.to(targetId).emit('webrtc:offer', {
        fromId: socket.id,
        offer,
      });
    });
 
    // Answer: Player B accepts and sends its side of the handshake back
    socket.on('webrtc:answer', ({ targetId, answer }) => {
      io.to(targetId).emit('webrtc:answer', {
        fromId: socket.id,
        answer,
      });
    });
 
    // ICE candidate: routing info so the browsers can find each other
    socket.on('webrtc:ice-candidate', ({ targetId, candidate }) => {
      io.to(targetId).emit('webrtc:ice-candidate', {
        fromId: socket.id,
        candidate,
      });
    });
 
    // ─── Disconnect ─────────────────────────────────────────────────────────
 
    socket.on('disconnect', () => {
      const { roomId, username } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('user:left', { username });
        emitRoomCount(io, roomId);
      }
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}
 
module.exports = { registerSocketHandlers };