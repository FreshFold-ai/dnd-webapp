/**
 * @file src/server/socketHandlers.js
 * @description LOBBY ONLY — room creation, join/discovery, WebRTC signaling relay.
 *   All gameplay logic runs client-side over WebRTC P2P data channels.
 *   The server never touches encounter state, round state, messages, or inventory.
 */

// ─── In-memory room registry (lobby metadata only) ────────────────────────────
// roomId → { dmName, roomType, roomPassword, dmSocketId, playerCount, createdAt }
const rooms = {};

// Room auto-cleanup: remove room after DM absent for DM_ABSENT_TTL_MS
const DM_ABSENT_TTL_MS = 2 * 60 * 1000;
const dmAbsenceTimers = {};

const ROOM_MEMBER_LIMIT = 6; // 1 DM + 5 players max

const SLUG_PREFIXES = ['ember','mist','iron','moon','storm','ashen','wild','frost','golden','shadow'];
const SLUG_SUFFIXES = ['marsh','spire','grove','keep','dunes','hollow','coast','cavern','citadel','fen'];

function generateRoomSlug() {
  const prefix = SLUG_PREFIXES[Math.floor(Math.random() * SLUG_PREFIXES.length)];
  const suffix = SLUG_SUFFIXES[Math.floor(Math.random() * SLUG_SUFFIXES.length)];
  const num    = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${suffix}-${num}`;
}

function uniqueRoomSlug() {
  for (let i = 0; i < 20; i++) {
    const slug = generateRoomSlug();
    if (!rooms[slug]) return slug;
  }
  return `${generateRoomSlug()}-${Date.now().toString().slice(-4)}`;
}

function deleteRoom(roomId) {
  delete rooms[roomId];
  clearTimeout(dmAbsenceTimers[roomId]);
  delete dmAbsenceTimers[roomId];
  console.log(`[LOBBY] Room ${roomId} deleted.`);
}

function startDmAbsenceTimer(roomId, io) {
  clearTimeout(dmAbsenceTimers[roomId]);
  dmAbsenceTimers[roomId] = setTimeout(() => {
    if (!rooms[roomId]) return;
    console.log(`[LOBBY] DM absent too long in ${roomId} — notifying peers and cleaning up.`);
    io.to(roomId).emit('dm:offline', { roomId, reason: 'dm_absent_timeout' });
    deleteRoom(roomId);
  }, DM_ABSENT_TTL_MS);
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    // ── DM: Create a new room ─────────────────────────────────────────────────
    socket.on('room:start', ({ roomType, dmName, roomPassword }) => {
      const safeName     = String(dmName     || 'Dungeon Master').trim().slice(0, 40) || 'Dungeon Master';
      const safePassword = String(roomPassword || '').trim().slice(0, 40);
      const safeType     = String(roomType   || 'Village').trim().slice(0, 40);

      if (!safeName || !safePassword) {
        socket.emit('server:error', { message: 'DM name and room password are required.' });
        return;
      }

      const roomId = uniqueRoomSlug();
      rooms[roomId] = {
        roomId,
        roomType: safeType,
        dmName: safeName,
        roomPassword: safePassword,
        dmSocketId: socket.id,
        playerCount: 0,
        createdAt: Date.now(),
      };

      socket.data.roomId   = roomId;
      socket.data.isDM     = true;
      socket.data.username = safeName;
      socket.join(roomId);

      socket.emit('room:joined', {
        roomId,
        socketId: socket.id,
        isDM: true,
        roomMeta: { roomType: safeType, dmName: safeName },
        peers: [],
      });

      console.log(`[LOBBY] DM ${safeName} created room ${roomId}`);
      startDmAbsenceTimer(roomId, io);
    });

    // ── Player: Join an existing room ─────────────────────────────────────────
    socket.on('room:join', ({ roomId, username, password, character }) => {
      const room = rooms[roomId];
      if (!room) {
        socket.emit('server:error', { message: 'Room not found. Check the room code.' });
        return;
      }
      if (room.roomPassword && room.roomPassword !== String(password || '')) {
        socket.emit('server:error', { message: 'Incorrect room password.' });
        return;
      }
      if (room.playerCount >= ROOM_MEMBER_LIMIT - 1) {
        socket.emit('server:error', { message: 'Room is full (max 5 players).' });
        return;
      }

      const safeName = String(username || 'Adventurer').trim().slice(0, 40) || 'Adventurer';

      socket.data.roomId    = roomId;
      socket.data.isDM      = false;
      socket.data.username  = safeName;
      socket.data.character = character || {};
      socket.join(roomId);
      room.playerCount += 1;

      // Collect current peer socket IDs in this room so the joiner can initiate WebRTC
      const socketsInRoom = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
      const peers = socketsInRoom.filter(sid => sid !== socket.id);

      socket.emit('room:joined', {
        roomId,
        socketId: socket.id,
        isDM: false,
        roomMeta: { roomType: room.roomType, dmName: room.dmName },
        peers,
      });

      // Notify existing peers so they can accept incoming WebRTC offers
      socket.to(roomId).emit('peer:joined', {
        socketId: socket.id,
        username: safeName,
        character: character || {},
      });

      console.log(`[LOBBY] ${safeName} joined ${roomId} (${room.playerCount} players)`);
    });

    // ── DM heartbeat: reset the absence timer ─────────────────────────────────
    socket.on('room:heartbeat', () => {
      const { roomId, isDM } = socket.data || {};
      if (!roomId || !isDM || !rooms[roomId]) return;
      startDmAbsenceTimer(roomId, io);
    });

    // ── WebRTC signaling relay (pass-through only, no inspection) ─────────────
    socket.on('webrtc:offer', ({ targetId, offer }) => {
      if (typeof targetId !== 'string') return;
      io.to(targetId).emit('webrtc:offer', { fromId: socket.id, offer });
    });

    socket.on('webrtc:answer', ({ targetId, answer }) => {
      if (typeof targetId !== 'string') return;
      io.to(targetId).emit('webrtc:answer', { fromId: socket.id, answer });
    });

    socket.on('webrtc:ice-candidate', ({ targetId, candidate }) => {
      if (typeof targetId !== 'string') return;
      io.to(targetId).emit('webrtc:ice-candidate', { fromId: socket.id, candidate });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const { roomId, isDM, username } = socket.data || {};
      if (!roomId) return;
      console.log(`[DISCONNECT] ${username || socket.id} left ${roomId}`);

      socket.to(roomId).emit('peer:left', { socketId: socket.id, username: username || '' });

      if (!rooms[roomId]) return;

      if (isDM) {
        rooms[roomId].dmSocketId = null;
        io.to(roomId).emit('dm:offline', { roomId, reason: 'dm_disconnected' });
        startDmAbsenceTimer(roomId, io);
        console.log(`[LOBBY] DM disconnected from ${roomId}; absence timer started.`);
      } else {
        rooms[roomId].playerCount = Math.max(0, (rooms[roomId].playerCount || 1) - 1);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
