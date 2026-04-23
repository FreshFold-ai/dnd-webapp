/**
 * @file src/server/socketHandlers.js
 * @description Registers all Socket.IO event listeners for room-based
 *              real-time interactions.
 */

const { getRoomSize, emitRoomCount } = require("../helpers/room");
const { NPC_TEMPLATES, ITEM_TYPES, KIT_ITEM_IDS, getOptionsForEncounter, drawLoot, OUTCOME_FLAVOR } = require('./catalog');

// In memory storage — server holds ONLY live-session transient state.
// All persistent data (inventory, logs, character) lives in client localStorage.
const userLastMessageTime = {}; // rate limiting
const roomUsers = {}; // { roomId: { socketId: participant } }
const roomMeta = {}; // { roomId: { roomType, dmName, roomPassword, createdAt, source } }
const roomRounds = {}; // { roomId: { roundNumber, turnIndex, turnOrderIds } }
const roomSpawnLimits = {}; // { roomId: { spawnType, aggroCount, greyCount, utilityCount } }
const roomEnvLimits = {};   // { roomId: { weatherChanged, lootDropTotal } }
const roomEncounters = {};  // { roomId: activeEncounter | null }

const SLUG_PREFIXES = [
  "ember", "mist", "iron", "moon", "storm", "ashen", "wild", "frost", "golden", "shadow"
];
const SLUG_SUFFIXES = [
  "marsh", "spire", "grove", "keep", "dunes", "hollow", "coast", "cavern", "citadel", "fen"
];

const ROOM_TYPES = [
  "Village", "Township", "City", "Ruins", "Castle", "Manor", "Desert", "Oasis",
  "Forest", "Mountains", "Moonlit Grove", "Hollow Fen", "Sunken Temple",
  "Crystal Caverns", "Ashen Wastes", "Skyreach Spire", "Whispering Catacombs", "Storm Coast"
];
const CLASS_OPTIONS = ["Fighter", "Rogue", "Wizard", "Cleric", "Ranger", "Paladin", "Warlock", "Bard", "Druid", "Monk"];
const RACE_OPTIONS = ["Human", "Elf", "Dwarf", "Halfling", "Orc", "Tiefling", "Dragonborn", "Gnome", "Half-Elf", "Half-Orc"];
const EQUIPMENT_OPTIONS = ["Balanced Kit", "Frontline Kit", "Scout Kit", "Caster Kit", "Survival Kit", "Noble Kit"];
const AVATAR_OPTIONS = ["🧙", "⚔️", "🏹", "🗡️", "🛡️", "🌿"];

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function closestOption(value, options, fallback = options[0]) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const exact = options.find((opt) => opt.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  return fallback;
}

function normalizeStats(inputStats = {}) {
  const defaults = {
    might: 7,
    agility: 8,
    endurance: 7,
    intellect: 8,
    intuition: 7,
    presence: 7,
  };
  const keys = Object.keys(defaults);
  const stats = {};

  keys.forEach((key) => {
    stats[key] = clampNumber(inputStats[key], 3, 20, defaults[key]);
  });

  let total = keys.reduce((sum, key) => sum + stats[key], 0);
  while (total < 44) {
    const key = keys.filter((k) => stats[k] < 20).sort((a, b) => stats[a] - stats[b])[0];
    if (!key) break;
    stats[key] += 1;
    total += 1;
  }
  while (total > 44) {
    const key = keys.filter((k) => stats[k] > 3).sort((a, b) => stats[b] - stats[a])[0];
    if (!key) break;
    stats[key] -= 1;
    total -= 1;
  }
  return stats;
}

function normalizeCharacter(character = {}) {
  return {
    avatar: closestOption(character.avatar, AVATAR_OPTIONS, "🧙"),
    characterName: String(character.characterName || "Adventurer").trim().slice(0, 40) || "Adventurer",
    className: closestOption(character.className, CLASS_OPTIONS, "Fighter"),
    race: closestOption(character.race, RACE_OPTIONS, "Human"),
    level: clampNumber(character.level, 1, 20, 1),
    hp: clampNumber(character.hp, 8, 120, 20),
    backstory: String(character.backstory || "").trim().slice(0, 600),
    equipment: closestOption(character.equipment, EQUIPMENT_OPTIONS, "Balanced Kit"),
    stats: normalizeStats(character.stats || {}),
  };
}

function generateRoomSlug() {
  const prefix = SLUG_PREFIXES[Math.floor(Math.random() * SLUG_PREFIXES.length)];
  const suffix = SLUG_SUFFIXES[Math.floor(Math.random() * SLUG_SUFFIXES.length)];
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${suffix}-${number}`;
}

function uniqueRoomSlug() {
  let attempts = 0;
  while (attempts < 20) {
    const slug = generateRoomSlug();
    if (!roomMeta[slug]) return slug;
    attempts += 1;
  }
  return `${generateRoomSlug()}-${Date.now().toString().slice(-4)}`;
}

/**
 * emitRoomUsers — broadcasts the current user list to every socket in the room.
 */
function emitRoomUsers(io, roomId) {
  if (!roomUsers[roomId]) return;
  const users = Object.values(roomUsers[roomId]);
  io.to(roomId).emit("room:users", { users });
}

function buildTurnOrder(roomId) {
  if (!roomUsers[roomId]) return [];
  return Object.values(roomUsers[roomId])
    .filter((user) => !user.isDM)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .map((user) => user.socketId);
}

function emitRoundState(io, roomId) {
  if (!roomRounds[roomId]) return;
  const roundState = roomRounds[roomId];
  const turnSocketId = roundState.turnOrderIds[roundState.turnIndex] || null;
  const turnUser = turnSocketId && roomUsers[roomId] ? roomUsers[roomId][turnSocketId] : null;
  io.to(roomId).emit("room:round", {
    roundNumber: roundState.roundNumber,
    turnIndex: roundState.turnIndex,
    turnSocketId,
    turnUsername: turnUser ? turnUser.username : "No active adventurer"
  });
}

function resetRoundFlags(roomId) {
  if (!roomUsers[roomId]) return;
  Object.values(roomUsers[roomId]).forEach((user) => {
    if (user.isDM) return;
    user.actionSelected = false;
    user.hasRolled = false;
  });
}

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    socket.onAny((event, ...args) => {
      console.log(`[EVENT] ${socket.id} ${event}`, args);
    });

    socket.on("error", (err) => {
      console.error(`[SOCKET ERROR] ${socket.id}`, err);
    });

    socket.on("room:start", ({ roomType, dmName, roomPassword, source }) => {
      if (!roomType || !dmName || !roomPassword) {
        socket.emit("server:error", { message: "Room type, DM name, and room password are required" });
        return;
      }

      const normalizedRoomType = closestOption(roomType, ROOM_TYPES, "Village");
      const normalizedDM = String(dmName || "Dungeon Master").trim().slice(0, 40) || "Dungeon Master";
      const normalizedPassword = String(roomPassword || "adventure").trim().slice(0, 40) || "adventure";

      const roomId = uniqueRoomSlug();
      roomMeta[roomId] = {
        roomType: normalizedRoomType,
        dmName: normalizedDM,
        roomPassword: normalizedPassword,
        createdAt: new Date().toISOString(),
        source: source || "manual"
      };

      socket.data.roomId = roomId;
      socket.data.username = normalizedDM;
      socket.data.isDM = true;
      socket.data.character = {
        avatar: "🎲",
        className: "Dungeon Master",
        race: normalizedRoomType,
        level: 0
      };
      socket.join(roomId);

      if (!roomUsers[roomId]) roomUsers[roomId] = {};
      roomUsers[roomId][socket.id] = {
        socketId: socket.id,
        username: normalizedDM,
        avatar: "🎲",
        className: "Dungeon Master",
        race: normalizedRoomType,
        level: 0,
        isDM: true,
        actionSelected: false,
        hasRolled: false,
        joinedAt: Date.now()
      };

      roomRounds[roomId] = {
        roundNumber: 1,
        turnIndex: 0,
        turnOrderIds: []
      };
      roomSpawnLimits[roomId] = { spawnType: null, aggroCount: 0, greyCount: 0, utilityCount: 0 };
      roomEnvLimits[roomId]   = { weatherChanged: false, lootDropTotal: 0, lootDropsByUser: {} };
      roomEncounters[roomId]  = null;

      socket.emit("room:started", {
        roomId,
        roomType: normalizedRoomType,
        dmName: normalizedDM
      });

      socket.emit("room:joined", {
        roomId,
        socketId: socket.id,
        roomMeta: {
          roomType: normalizedRoomType,
          dmName: normalizedDM,
          createdAt: roomMeta[roomId].createdAt
        }
      });
      // No server-side message history — client localStorage is the durable store.

      emitRoomCount(io, roomId);
      emitRoomUsers(io, roomId);
      emitRoundState(io, roomId);
      console.log(`[ROOM START] ${normalizedDM} started ${roomId} (${normalizedRoomType})`);
    });

    socket.on("room:join", ({ roomId, username, roomPassword, character }) => {
      if (!roomId || !username || !roomPassword) {
        socket.emit("server:error", { message: "Room code, name, and password are required" });
        return;
      }

      const room = roomMeta[roomId];
      if (!room) {
        socket.emit("server:error", { message: "Room does not exist" });
        return;
      }

      if (room.roomPassword !== roomPassword) {
        socket.emit("server:error", { message: "Incorrect room password" });
        return;
      }

      const normalizedName = String(username || "Adventurer").trim().slice(0, 40) || "Adventurer";
      const normalizedCharacter = normalizeCharacter(character || { characterName: normalizedName });

      socket.data.roomId = roomId;
      socket.data.username = normalizedName;
      socket.data.isDM = false;
      socket.data.character = normalizedCharacter;

      socket.join(roomId);
      socket.emit("room:joined", {
        roomId,
        socketId: socket.id,
        roomMeta: {
          roomType: room.roomType,
          dmName: room.dmName,
          createdAt: room.createdAt
        }
      });
      // No server history — client's localStorage holds their log.
      console.log(`[JOIN] ${normalizedName} joined ${roomId}`);

      if (!roomUsers[roomId]) {
        roomUsers[roomId] = {};
      }
      roomUsers[roomId][socket.id] = {
        socketId: socket.id,
        username: normalizedName,
        avatar: normalizedCharacter.avatar,
        className: normalizedCharacter.className,
        race: normalizedCharacter.race,
        level: normalizedCharacter.level,
        isDM: false,
        actionSelected: false,
        hasRolled: false,
        joinedAt: Date.now()
      };

      if (!roomRounds[roomId]) {
        roomRounds[roomId] = { roundNumber: 1, turnIndex: 0, turnOrderIds: [] };
      }
      roomRounds[roomId].turnOrderIds = buildTurnOrder(roomId);

      socket.to(roomId).emit("user:joined", {
        socketId: socket.id,
        username: normalizedName,
      });

      emitRoomCount(io, roomId);
      emitRoomUsers(io, roomId);
      emitRoundState(io, roomId);
    });

    socket.on("room:message", ({ text }) => {
      const { roomId, username } = socket.data || {};

      if (!roomId || !username || !text) return;

      if (typeof text !== "string" || !text.trim()) {
        socket.emit("server:error", { message: "Message cannot be empty" });
        return;
      }

      if (text.length > 300) {
        socket.emit("server:error", { message: "Message too long (max 300 chars)" });
        return;
      }

      const now = Date.now();
      const lastTime = userLastMessageTime[socket.id] || 0;

      if (now - lastTime < 1000) {
        socket.emit("server:error", { message: "You're sending messages too fast" });
        return;
      }

      userLastMessageTime[socket.id] = now;

      io.to(roomId).emit("room:message", {
        from: username,
        text,
        at: new Date().toISOString(),
      });

      if (roomUsers[roomId] && roomUsers[roomId][socket.id] && !roomUsers[roomId][socket.id].isDM) {
        const lower = text.trim().toLowerCase();
        if (lower.startsWith('/action ') || lower.startsWith('action:')) {
          roomUsers[roomId][socket.id].actionSelected = true;
          emitRoomUsers(io, roomId);
        }
      }
    });

    // ─── DnD Game Events ──────────────────────────────────────────────────

    socket.on('game:roll', ({ result, die }) => {
      const { roomId, username, isDM } = socket.data;
      if (!roomId) return;

      if (isDM) {
        socket.emit("server:error", { message: "DM player-dice rolling is disabled" });
        return;
      }

      if (roomUsers[roomId] && roomUsers[roomId][socket.id]) {
        roomUsers[roomId][socket.id].hasRolled = true;
        emitRoomUsers(io, roomId);
      }

      io.to(roomId).emit('game:roll', {
        from: username,
        result,
        die,
        at: new Date().toISOString(),
      });
    });

    socket.on('game:narrate', ({ text }) => {
      const { roomId, username, isDM } = socket.data;
      if (!roomId) return;
      if (!isDM) {
        socket.emit("server:error", { message: "Only the DM can narrate" });
        return;
      }

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

    socket.on("room:advance-round", () => {
      const { roomId, isDM } = socket.data || {};
      if (!roomId || !isDM || !roomRounds[roomId]) {
        socket.emit("server:error", { message: "Only the DM can advance rounds" });
        return;
      }

      const turnOrder = buildTurnOrder(roomId);
      roomRounds[roomId].turnOrderIds = turnOrder;
      roomRounds[roomId].roundNumber += 1;
      roomRounds[roomId].turnIndex = turnOrder.length === 0
        ? 0
        : (roomRounds[roomId].roundNumber - 1) % turnOrder.length;

      resetRoundFlags(roomId);
      emitRoomUsers(io, roomId);
      emitRoundState(io, roomId);
      // Reset per-round spawn/env limits
      roomSpawnLimits[roomId] = { spawnType: null, aggroCount: 0, greyCount: 0, utilityCount: 0 };
      roomEnvLimits[roomId]   = { weatherChanged: false, lootDropTotal: 0, lootDropsByUser: {} };
      io.to(roomId).emit('room:spawn-limits', { limits: roomSpawnLimits[roomId] });
      io.to(roomId).emit('room:env-limits',   { limits: roomEnvLimits[roomId] });
      io.to(roomId).emit("game:narrate", {
        from: roomMeta[roomId]?.dmName || "DM",
        text: `Round ${roomRounds[roomId].roundNumber} begins.`,
        at: new Date().toISOString(),
      });
    });

    socket.on('room:export:campaign', () => {
      const { roomId, isDM } = socket.data || {};
      if (!roomId || !isDM || !roomMeta[roomId]) {
        socket.emit("server:error", { message: "Campaign export is only available to the room DM" });
        return;
      }

      const campaign = {
        kind: 'room',
        roomId,
        roomType: roomMeta[roomId].roomType,
        dmName: roomMeta[roomId].dmName,
        roomPassword: roomMeta[roomId].roomPassword,
        notes: '',
        exportedAt: new Date().toISOString()
        // timeline intentionally excluded — client localStorage is the narrative log
      };

      socket.emit('room:export:campaign', { campaign });
    });

    // ─── DM: Spawn NPC / Start Encounter ─────────────────────────────────
    socket.on('dm:spawn', ({ npcType, npcName, templateId, target }) => {
      const { roomId, isDM } = socket.data || {};
      if (!roomId || !isDM) {
        socket.emit('server:error', { message: 'Only the DM can spawn NPCs' });
        return;
      }

      if (roomEncounters[roomId]) {
        socket.emit('dm:spawn:result', { ok: false, message: 'An encounter is already active. Resolve it first.' });
        return;
      }

      const validTypes = ['utility', 'grey', 'aggro'];
      const type = validTypes.includes(npcType) ? npcType : 'utility';
      const name = String(npcName || '').trim().slice(0, 40) || 'Unnamed';

      const limits = roomSpawnLimits[roomId] || { spawnType: null, aggroCount: 0, greyCount: 0, utilityCount: 0 };
      roomSpawnLimits[roomId] = limits;

      if (limits.spawnType && limits.spawnType !== type) {
        socket.emit('dm:spawn:result', { ok: false, message: `Only one NPC type per round. Already spawned: ${limits.spawnType}`, limits });
        return;
      }
      if (type === 'aggro' && limits.aggroCount >= 1) {
        socket.emit('dm:spawn:result', { ok: false, message: 'Only 1 AGGRO NPC allowed per round.', limits });
        return;
      }
      if (type === 'grey' && limits.greyCount >= 5) {
        socket.emit('dm:spawn:result', { ok: false, message: 'Max 5 Grey NPCs per round reached.', limits });
        return;
      }
      if (type === 'utility' && limits.utilityCount >= 5) {
        socket.emit('dm:spawn:result', { ok: false, message: 'Max 5 Utility NPCs per round reached.', limits });
        return;
      }

      limits.spawnType = type;
      if (type === 'aggro') limits.aggroCount += 1;
      if (type === 'grey')  limits.greyCount  += 1;
      if (type === 'utility') limits.utilityCount += 1;

      // Pick NPC template from catalog
      const roleTemplates = Object.entries(NPC_TEMPLATES).filter(([, t]) => t.role === type);
      let template = templateId && NPC_TEMPLATES[templateId] ? NPC_TEMPLATES[templateId] : null;
      if (!template && roleTemplates.length) {
        const idx = Math.floor(Math.random() * roleTemplates.length);
        template = roleTemplates[idx][1];
      }
      if (!template) {
        template = { id: 'custom', name, role: type, hp: 20, ac: 10, str: 10, dex: 10, lootTable: [] };
      }

      // Build encounter object
      const seed = Date.now();
      const eid = `enc_${roomId}_${seed}`;

      // Determine target socket IDs
      const roomUserList = roomUsers[roomId] || {};
      let targetSocketIds = [];
      if (target === 'all') {
        targetSocketIds = Object.values(roomUserList).filter(u => !u.isDM).map(u => u.socketId);
      } else if (target) {
        // target is a socketId of a specific player
        targetSocketIds = [target];
      } else {
        targetSocketIds = Object.values(roomUserList).filter(u => !u.isDM).map(u => u.socketId);
      }

      const playerStates = {};
      targetSocketIds.forEach(sid => {
        playerStates[sid] = { decision: null, roll: null, outcome: null };
      });

      const encounter = {
        eid,
        templateId: template.id,
        npcName: name || template.name,
        npcRole: type,
        npcStats: { hp: template.hp, ac: template.ac, str: template.str, dex: template.dex },
        npcCurrentHp: template.hp,
        lootTable: template.lootTable || [],
        targetSocketIds,
        playerStates,
        round: roomRounds[roomId] || 1,
        seed,
        resolvedAt: null
      };
      roomEncounters[roomId] = encounter;

      const dmName = roomMeta[roomId]?.dmName || 'DM';

      // Emit encounter:start to DM
      socket.emit('encounter:start', {
        eid,
        npcName: encounter.npcName,
        npcRole: type,
        npcStats: encounter.npcStats,
        targetSocketIds,
        dmName,
        at: new Date().toISOString()
      });

      // Emit encounter:prompt to each targeted player
      targetSocketIds.forEach((sid, i) => {
        const options = getOptionsForEncounter(type, seed + i);
        io.to(sid).emit('encounter:prompt', {
          eid,
          npcName: encounter.npcName,
          npcRole: type,
          npcStats: encounter.npcStats,
          options,
          dmName,
          at: new Date().toISOString()
        });
      });

      socket.emit('dm:spawn:result', { ok: true, npcType: type, npcName: encounter.npcName, limits });
      io.to(roomId).emit('room:spawn-limits', { limits: { ...limits } });
    });

    // ─── Encounter: Player Decision ───────────────────────────────────────
    socket.on('encounter:decide', ({ eid, optionId, optionLabel }) => {
      const { roomId } = socket.data || {};
      if (!roomId) return;
      const enc = roomEncounters[roomId];
      if (!enc || enc.eid !== eid) {
        socket.emit('server:error', { message: 'No active encounter.' });
        return;
      }
      if (!enc.playerStates[socket.id]) {
        socket.emit('server:error', { message: 'You are not part of this encounter.' });
        return;
      }
      if (enc.playerStates[socket.id].decision !== null) {
        socket.emit('server:error', { message: 'You already submitted a decision.' });
        return;
      }
      enc.playerStates[socket.id].decision = { optionId: String(optionId).slice(0, 40), optionLabel: String(optionLabel || '').slice(0, 80) };
      socket.emit('encounter:decision:ack', { eid, optionId });

      // Notify DM of roster update
      const dmSocket = Object.values(roomUsers[roomId] || {}).find(u => u.isDM);
      if (dmSocket) {
        const roster = buildEncounterRoster(enc, roomUsers[roomId]);
        io.to(dmSocket.socketId).emit('encounter:roster', { eid, roster });
      }
    });

    // ─── Encounter: Player Roll ───────────────────────────────────────────
    socket.on('encounter:roll', ({ eid, roll }) => {
      const { roomId } = socket.data || {};
      if (!roomId) return;
      const enc = roomEncounters[roomId];
      if (!enc || enc.eid !== eid) {
        socket.emit('server:error', { message: 'No active encounter.' });
        return;
      }
      const ps = enc.playerStates[socket.id];
      if (!ps) {
        socket.emit('server:error', { message: 'You are not part of this encounter.' });
        return;
      }
      if (ps.decision === null) {
        socket.emit('server:error', { message: 'Choose an action before rolling.' });
        return;
      }
      if (ps.roll !== null) {
        socket.emit('server:error', { message: 'You already rolled.' });
        return;
      }
      const r = Math.max(1, Math.min(20, Math.round(Number(roll))));
      if (!Number.isFinite(r)) {
        socket.emit('server:error', { message: 'Invalid roll value.' });
        return;
      }
      ps.roll = r;

      // Determine individual outcome
      const hitThreshold = enc.npcStats.ac;
      const outcome = r >= hitThreshold ? 'hit' : 'miss';
      ps.outcome = outcome;
      socket.emit('encounter:roll:ack', { eid, roll: r, outcome });

      // Notify DM
      const dmUser = Object.values(roomUsers[roomId] || {}).find(u => u.isDM);
      if (dmUser) {
        const roster = buildEncounterRoster(enc, roomUsers[roomId]);
        io.to(dmUser.socketId).emit('encounter:roster', { eid, roster });
      }

      // Check if all players have rolled → auto-resolve
      const allDone = enc.targetSocketIds.every(sid => enc.playerStates[sid]?.roll !== null);
      if (allDone) {
        resolveEncounter(roomId, enc, io, roomUsers, roomEncounters, drawLoot, OUTCOME_FLAVOR);
      }
    });

    // ─── Encounter: DM Force Resolve ──────────────────────────────────────
    socket.on('encounter:resolve', ({ eid, outcome: forcedOutcome }) => {
      const { roomId, isDM } = socket.data || {};
      if (!roomId || !isDM) return;
      const enc = roomEncounters[roomId];
      if (!enc || enc.eid !== eid) {
        socket.emit('server:error', { message: 'No active encounter to resolve.' });
        return;
      }
      resolveEncounter(roomId, enc, io, roomUsers, roomEncounters, drawLoot, OUTCOME_FLAVOR, forcedOutcome);
    });

    // ─── DM: Environment Event ────────────────────────────────────────────
    socket.on('dm:env', ({ eventType, detail, target }) => {
      const { roomId, isDM } = socket.data || {};
      if (!roomId || !isDM) {
        socket.emit('server:error', { message: 'Only the DM can trigger environment events' });
        return;
      }

      const validTypes = ['weather', 'terrain', 'event', 'loot'];
      const type = validTypes.includes(eventType) ? eventType : 'event';
      const desc = String(detail || '').trim().slice(0, 200);

      const limits = roomEnvLimits[roomId] || { weatherChanged: false, lootDropTotal: 0, lootDropsByUser: {} };
      roomEnvLimits[roomId] = limits;

      if (type === 'weather' && limits.weatherChanged) {
        socket.emit('dm:env:result', { ok: false, message: 'Weather can only change once per round.', limits });
        return;
      }
      if (type === 'loot') {
        // loot drop: max 3 per round total (simplified; could be per-user)
        if (limits.lootDropTotal >= 3) {
          socket.emit('dm:env:result', { ok: false, message: 'Max 3 loot drops per round reached.', limits });
          return;
        }
        limits.lootDropTotal += 1;
      }
      if (type === 'weather') limits.weatherChanged = true;

      const dmName = roomMeta[roomId]?.dmName || 'DM';
      const payload = { eventType: type, detail: desc, dmName, at: new Date().toISOString() };

      if (target === 'all') {
        io.to(roomId).emit('dm:env:event', payload);
      } else {
        io.to(target).emit('dm:env:event', payload);
        socket.emit('dm:env:event', payload);
      }

      socket.emit('dm:env:result', { ok: true, eventType: type, limits });
      io.to(roomId).emit('room:env-limits', { limits: { ...limits } });
    });

    // ─── Trade Item ───────────────────────────────────────────────────────
    socket.on('trade:item', ({ targetId, item }) => {
      const { roomId, username } = socket.data || {};
      if (!roomId || !username || !item || !targetId) return;

      const safeItem = String(item).trim().slice(0, 60);
      const targetSocket = io.sockets.sockets.get(targetId);
      if (!targetSocket || targetSocket.data.roomId !== roomId) {
        socket.emit('server:error', { message: 'Player not found in this room.' });
        return;
      }

      const toUsername = targetSocket.data.username || 'someone';
      targetSocket.emit('trade:received', { fromUsername: username, item: safeItem });
      socket.emit('trade:sent', { toUsername, item: safeItem });

      // Notify DM
      const dmSocket = Object.values(roomUsers[roomId] || {})
        .find(u => u.isDM);
      if (dmSocket) {
        io.to(dmSocket.socketId).emit('trade:notify', { fromUsername: username, toUsername, item: safeItem });
      }
    });

    // ─── Disconnect ───────────────────────────────────────────────────────

    socket.on("disconnect", () => {
      const { roomId, username } = socket.data || {};
      if (!roomId || !username) return;

      console.log(`[DISCONNECT] ${username} left ${roomId}`);

      if (roomUsers[roomId] && roomUsers[roomId][socket.id]) {
        delete roomUsers[roomId][socket.id];
        if (roomRounds[roomId]) {
          roomRounds[roomId].turnOrderIds = buildTurnOrder(roomId);
          if (roomRounds[roomId].turnIndex >= roomRounds[roomId].turnOrderIds.length) {
            roomRounds[roomId].turnIndex = 0;
          }
        }
        if (Object.keys(roomUsers[roomId]).length === 0) {
          delete roomUsers[roomId];
          delete roomMeta[roomId];
          delete roomRounds[roomId];
          delete roomSpawnLimits[roomId];
          delete roomEnvLimits[roomId];
          delete roomEncounters[roomId];
        }
      }

      socket.to(roomId).emit("user:left", { username });
      emitRoomCount(io, roomId);
      emitRoomUsers(io, roomId);
      emitRoundState(io, roomId);
    });
  });
}

// ─── Encounter Helper: Build roster summary for DM ───────────────────────────
function buildEncounterRoster(enc, roomUserMap) {
  return enc.targetSocketIds.map(sid => {
    const user = Object.values(roomUserMap || {}).find(u => u.socketId === sid);
    const ps = enc.playerStates[sid] || {};
    return {
      socketId: sid,
      username: user?.username || 'Unknown',
      decision: ps.decision,
      roll: ps.roll,
      outcome: ps.outcome
    };
  });
}

// ─── Encounter Helper: Resolve encounter and emit results ─────────────────────
function resolveEncounter(roomId, enc, io, roomUsers, roomEncounters, drawLoot, OUTCOME_FLAVOR, forcedOutcome) {
  const seed = enc.seed;

  // Compute overall outcome: aggro = need hits; grey/utility = social success
  let hits = 0;
  let totalParticipants = enc.targetSocketIds.length || 1;
  enc.targetSocketIds.forEach(sid => {
    if (enc.playerStates[sid]?.outcome === 'hit') hits++;
  });

  let outcome;
  if (forcedOutcome) {
    outcome = forcedOutcome; // 'death', 'negotiate', 'flee', 'success'
  } else if (enc.npcRole === 'aggro') {
    outcome = hits >= Math.ceil(totalParticipants / 2) ? 'death' : 'flee';
  } else {
    outcome = hits >= Math.ceil(totalParticipants / 2) ? 'success' : 'flee';
  }

  // Draw loot: 1-2 winners get items
  const lootWinners = enc.targetSocketIds.filter(sid => enc.playerStates[sid]?.outcome === 'hit');
  if (lootWinners.length === 0 && outcome !== 'flee') lootWinners.push(...enc.targetSocketIds.slice(0, 1));

  const perPlayerLoot = {};
  lootWinners.forEach((sid, i) => {
    const items = drawLoot(enc.lootTable, seed + i);
    perPlayerLoot[sid] = items;
  });

  const flavorPool = OUTCOME_FLAVOR[outcome] || OUTCOME_FLAVOR['flee'];
  const flavor = flavorPool[Math.floor(Math.random() * flavorPool.length)] || 'The encounter ends.';

  const resolvedPayload = {
    eid: enc.eid,
    outcome,
    flavor,
    roster: buildEncounterRoster(enc, roomUsers[roomId]),
    perPlayerLoot,
    at: new Date().toISOString()
  };

  // Broadcast resolution to all room members
  io.to(roomId).emit('encounter:resolved', resolvedPayload);

  // Clear encounter
  roomEncounters[roomId] = null;
}

module.exports = { registerSocketHandlers };