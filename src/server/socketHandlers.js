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
const roomMessages = {};    // { roomId: message[] }
const roomTimeline = {};    // { roomId: timelineEvent[] }
const ROOM_HISTORY_LIMIT = 120;
const ROOM_TIMELINE_LIMIT = 1000;
const ROOM_MEMBER_LIMIT = 13;

const ACTION_STAT_LABELS = {
  might: 'Might',
  agility: 'Agility',
  endurance: 'Endurance',
  intellect: 'Intellect',
  intuition: 'Intuition',
  presence: 'Presence',
};

const ACTION_CHECK_RULES = [
  {
    statKey: 'presence',
    threshold: 18,
    patterns: [/persuade|negotiate|convince|charm|intimidate|command|perform|deceive|question|appeal/i],
  },
  {
    statKey: 'intuition',
    threshold: 18,
    patterns: [/scout|search|track|spot|notice|sense|listen|watch|survey|probe/i],
  },
  {
    statKey: 'agility',
    threshold: 19,
    patterns: [/sneak|hide|climb|dodge|dash|leap|jump|slip|steal|disarm|pick/i],
  },
  {
    statKey: 'intellect',
    threshold: 19,
    patterns: [/study|analyze|investigate|inspect|decode|remember|recall|plan|identify|read/i],
  },
  {
    statKey: 'endurance',
    threshold: 19,
    patterns: [/brace|withstand|endure|resist|hold|survive|weather|steady/i],
  },
  {
    statKey: 'might',
    threshold: 19,
    patterns: [/attack|strike|push|force|break|smash|lift|shove|kick|hold the line/i],
  },
];

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
const AVATAR_OPTIONS = ["⚔️", "🗡️", "🧙", "✨", "🏹", "🛡️", "🔮", "🎵", "🌿", "👊"];

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

function ensureRoundState(roomId) {
  if (!roomRounds[roomId]) {
    roomRounds[roomId] = {
      roundNumber: 1,
      turnIndex: 0,
      turnOrderIds: [],
      phase: 'action',
      pendingActions: {},
    };
  }

  if (!Array.isArray(roomRounds[roomId].turnOrderIds)) {
    roomRounds[roomId].turnOrderIds = [];
  }
  if (!roomRounds[roomId].phase) {
    roomRounds[roomId].phase = 'action';
  }
  if (!roomRounds[roomId].pendingActions || typeof roomRounds[roomId].pendingActions !== 'object') {
    roomRounds[roomId].pendingActions = {};
  }

  return roomRounds[roomId];
}

function getActionStatValue(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return 0;
  return Math.max(0, Math.round(numericScore));
}

function describeRoundAction(text) {
  const normalizedText = String(text || '').trim().toLowerCase();
  const matchedRule = ACTION_CHECK_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(normalizedText)))
    || { statKey: 'intuition', threshold: 15 };

  let threshold = matchedRule.threshold;
  if (/(careful|carefully|steady|guard|cover|help|assist)/i.test(normalizedText)) {
    threshold -= 2;
  }
  if (/(dangerous|risky|reckless|desperate|blind|alone|rapid|swift)/i.test(normalizedText)) {
    threshold += 2;
  }

  threshold = Math.max(16, Math.min(24, threshold));

  return {
    statKey: matchedRule.statKey,
    statLabel: ACTION_STAT_LABELS[matchedRule.statKey] || 'Intuition',
    threshold,
  };
}

function buildRoundResolutionText(action, success) {
  if (action.roll === null) {
    return 'No roll was submitted before the round closed.';
  }
  return success ? 'The attempt succeeds.' : 'The attempt falls short.';
}

function normalizeEncounterStatKey(statKey) {
  const normalizedKey = String(statKey || '').trim().toLowerCase();
  if (ACTION_STAT_LABELS[normalizedKey]) return normalizedKey;

  return {
    atk: 'might',
    def: 'endurance',
    spd: 'agility',
    will: 'intellect',
    neg: 'presence',
  }[normalizedKey] || 'intuition';
}

function clampEncounterThreshold(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 18;
  return Math.max(10, Math.min(26, Math.round(numericValue)));
}

function buildEncounterCheck(encounter, character, option) {
  const requiresRoll = Boolean(option?.reqRoll);
  if (!requiresRoll) {
    return {
      requiresRoll: false,
      requestedStatKey: null,
      statKey: null,
      statLabel: null,
      statScore: 0,
      statValue: 0,
      threshold: 0,
    };
  }

  const requestedStatKey = String(option?.rollStat || '').trim().toLowerCase();
  const statKey = normalizeEncounterStatKey(requestedStatKey);
  const statScore = Number(character?.stats?.[statKey] || 10);
  const statValue = getActionStatValue(statScore);
  const npcStats = encounter?.npcStats || {};

  let baseThreshold;
  switch (requestedStatKey) {
    case 'atk':
    case 'might':
      baseThreshold = 10 + Number(npcStats.def || npcStats.ac || npcStats.str || 8);
      break;
    case 'agility':
      baseThreshold = option?.id === 'flee'
        ? 10 + Number(npcStats.spd || npcStats.dex || 8)
        : 10 + Number(npcStats.spd || npcStats.def || npcStats.dex || 8);
      break;
    case 'endurance':
      baseThreshold = 10 + Number(npcStats.atk || npcStats.str || 8);
      break;
    case 'presence':
      baseThreshold = Number(npcStats.negDifficulty || (10 + Number(npcStats.neg || npcStats.will || 6)));
      break;
    case 'intellect':
    case 'intuition':
    case 'will':
      baseThreshold = 10 + Number(npcStats.will || npcStats.neg || 6);
      break;
    default:
      baseThreshold = 10 + Number(npcStats.ac || npcStats.def || 8);
      break;
  }

  return {
    requiresRoll: true,
    requestedStatKey: requestedStatKey || statKey,
    statKey,
    statLabel: ACTION_STAT_LABELS[statKey] || 'Intuition',
    statScore,
    statValue,
    threshold: clampEncounterThreshold(baseThreshold + Number(option?.difficulty || 0)),
  };
}

function describeEncounterChoice(option) {
  const optionId = String(option?.id || '').trim().toLowerCase();

  const knownChoices = {
    call_for_aid: {
      mode: 'support',
      resolutionText: 'Calls for aid and counts as immediate support for the encounter outcome.',
    },
    signal_party: {
      mode: 'support',
      resolutionText: 'Signals the party and helps coordinate the resolution.',
    },
    use_item_combat: {
      mode: 'support',
      resolutionText: 'Uses gear to create an opening and counts as support.',
    },
    use_item_universal: {
      mode: 'support',
      resolutionText: 'Uses gear to steady the situation and counts as support.',
    },
    show_mercy: {
      mode: 'mercy',
      resolutionText: 'Shows restraint and may soften the final outcome if the party gains control.',
    },
    wait: {
      mode: 'caution',
      resolutionText: 'Holds position and contributes a cautious success to the encounter.',
    },
    inspect_goods: {
      mode: 'utility',
      resolutionText: 'Focuses on the useful angle of the scene and counts as utility support.',
    },
    request_healing: {
      mode: 'support',
      resolutionText: 'Secures aid and contributes support without a roll.',
    },
    request_repair: {
      mode: 'utility',
      resolutionText: 'Buys time through practical help and contributes utility support.',
    },
    trade_item: {
      mode: 'utility',
      resolutionText: 'Leans on barter and contributes utility support.',
    },
    share_knowledge: {
      mode: 'support',
      resolutionText: 'Shares useful knowledge and contributes support without a roll.',
    },
  };

  if (knownChoices[optionId]) return knownChoices[optionId];

  if (option?.reqRoll) {
    return {
      mode: 'check',
      resolutionText: 'This choice resolves from the assigned stat check.',
    };
  }

  return {
    mode: 'support',
    resolutionText: 'This choice contributes immediate support without a roll.',
  };
}

function isEncounterReady(encounter) {
  return Boolean(
    encounter
      && encounter.targetSocketIds.length > 0
      && encounter.targetSocketIds.every((socketId) => {
        const playerState = encounter.playerStates[socketId];
        return playerState
          && playerState.decision
          && (!playerState.check?.requiresRoll || playerState.roll !== null);
      })
  );
}

function maybeMarkEncounterReady(roomId, encounter, io) {
  if (!isEncounterReady(encounter)) return false;
  if (!encounter.readyAt) {
    encounter.readyAt = new Date().toISOString();
    appendRoomTimeline(roomId, 'encounter_ready', {
      encounterId: encounter.eid,
      npcName: encounter.npcName,
      npcRole: encounter.npcRole,
    });
    io.to(roomId).emit('encounter:ready', {
      eid: encounter.eid,
      npcName: encounter.npcName,
      npcRole: encounter.npcRole,
      at: encounter.readyAt,
    });
  }
  return true;
}

function resolveRoundActions(roomId, io) {
  const roundState = ensureRoundState(roomId);
  const pendingActions = roundState.pendingActions || {};
  const orderedSocketIds = [
    ...roundState.turnOrderIds,
    ...Object.keys(pendingActions).filter((socketId) => !roundState.turnOrderIds.includes(socketId)),
  ];
  const results = [];

  orderedSocketIds.forEach((socketId) => {
    const action = pendingActions[socketId];
    if (!action) return;

    const actor = roomUsers[roomId]?.[socketId]?.username || action.actor || 'Player';
    const total = action.roll === null ? null : action.roll + action.statValue;
    const success = total !== null ? total >= action.threshold : false;
    const resolutionText = buildRoundResolutionText(action, success);

    const result = {
      actor,
      actorSocketId: socketId,
      text: action.text,
      statKey: action.statKey,
      statLabel: action.statLabel,
      statScore: action.statScore,
      statValue: action.statValue,
      threshold: action.threshold,
      roll: action.roll,
      total,
      success,
      resolutionText,
    };
    results.push(result);

    appendRoomTimeline(roomId, 'action_resolved', result);
  });

  roundState.pendingActions = {};
  Object.values(roomUsers[roomId] || {}).forEach((user) => {
    if (user.isDM) return;
    user.actionSelected = false;
    user.hasRolled = false;
  });

  if (results.length > 0) {
    io.to(roomId).emit('round:actions:resolved', {
      roundNumber: roundState.roundNumber,
      results,
    });
  }

  return results;
}

function emitRoundState(io, roomId) {
  const roundState = ensureRoundState(roomId);
  const turnSocketId = roundState.turnOrderIds[roundState.turnIndex] || null;
  const turnUser = turnSocketId && roomUsers[roomId] ? roomUsers[roomId][turnSocketId] : null;
  const pendingActions = Object.values(roundState.pendingActions || {});
  const activeEncounter = roomEncounters[roomId];
  io.to(roomId).emit("room:round", {
    roundNumber: roundState.roundNumber,
    turnIndex: roundState.turnIndex,
    turnSocketId,
    turnUsername: turnUser ? turnUser.username : "No active adventurer",
    phase: activeEncounter ? 'encounter' : (roundState.phase || 'action'),
    submittedActions: pendingActions.length,
    submittedRolls: pendingActions.filter((entry) => entry.roll !== null).length,
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

function getRoundContext(roomId) {
  const roundState = ensureRoundState(roomId);

  const turnSocketId = roundState.turnOrderIds[roundState.turnIndex] || null;
  const turnUser = turnSocketId && roomUsers[roomId] ? roomUsers[roomId][turnSocketId] : null;

  return {
    roundNumber: Math.max(1, Number(roundState.roundNumber) || 1),
    turnSocketId,
    turnUsername: turnUser ? turnUser.username : null,
  };
}

function appendRoomHistory(roomId, message) {
  if (!roomMessages[roomId]) roomMessages[roomId] = [];
  const roundContext = getRoundContext(roomId);
  roomMessages[roomId].push({
    roundNumber: roundContext.roundNumber,
    turnUsername: roundContext.turnUsername,
    ...message,
  });
  if (roomMessages[roomId].length > ROOM_HISTORY_LIMIT) {
    roomMessages[roomId].splice(0, roomMessages[roomId].length - ROOM_HISTORY_LIMIT);
  }
}

function appendRoomTimeline(roomId, type, details = {}) {
  if (!roomTimeline[roomId]) roomTimeline[roomId] = [];
  const roundContext = getRoundContext(roomId);
  const hasTurnUsername = Object.prototype.hasOwnProperty.call(details, 'turnUsername');
  roomTimeline[roomId].push({
    type,
    at: new Date().toISOString(),
    roundNumber: roundContext.roundNumber,
    turnUsername: hasTurnUsername ? details.turnUsername : roundContext.turnUsername,
    ...details,
  });
  if (roomTimeline[roomId].length > ROOM_TIMELINE_LIMIT) {
    roomTimeline[roomId].splice(0, roomTimeline[roomId].length - ROOM_TIMELINE_LIMIT);
  }
}

function normalizeRoundNumber(value) {
  const roundNumber = Number(value);
  return Number.isFinite(roundNumber) && roundNumber > 0 ? Math.round(roundNumber) : 1;
}

function labelEnvironmentEvent(eventType) {
  return {
    weather: 'Weather',
    terrain: 'Terrain',
    event: 'Event',
    loot: 'Loot',
  }[eventType] || 'Event';
}

function labelTarget(target, usersBySocketId) {
  if (!target || target === 'all') return 'all players';
  return usersBySocketId.get(target) || String(target);
}

function mapTimelineEntryToRoundEntry(entry, usersBySocketId) {
  const roundNumber = normalizeRoundNumber(entry.roundNumber);

  switch (entry.type) {
    case 'room_started':
    case 'player_joined':
    case 'player_left':
      return null;
    case 'room_message': {
      return {
        roundNumber,
        lane: 'players',
        item: {
          at: entry.at,
          actor: entry.actor,
          kind: 'chat',
          text: String(entry.text || '').trim(),
        },
      };
    }
    case 'action_declared':
      return {
        roundNumber,
        lane: 'players',
        item: {
          at: entry.at,
          actor: entry.actor,
          kind: 'action',
          text: entry.text,
        },
      };
    case 'action_prompted':
      return {
        roundNumber,
        lane: 'dm',
        item: {
          at: entry.at,
          kind: 'check',
          text: `${entry.actor}: roll d20 + ${entry.statLabel} (${entry.statValue}) vs ${entry.threshold} for "${entry.text}".`,
        },
      };
    case 'action_roll_submitted':
      return {
        roundNumber,
        lane: 'players',
        item: {
          at: entry.at,
          actor: entry.actor,
          kind: 'roll',
          text: `Locked d20 ${entry.roll} for "${entry.text}".`,
        },
      };
    case 'action_resolved': {
      const totalText = entry.total === null
        ? 'no roll submitted'
        : `${entry.roll} + ${entry.statValue} = ${entry.total} vs ${entry.threshold}`;
      return {
        roundNumber,
        lane: 'world',
        item: {
          at: entry.at,
          kind: 'action_result',
          text: `${entry.actor}: ${entry.success ? 'success' : 'failure'} on "${entry.text}" (${totalText}). ${entry.resolutionText}`,
        },
      };
    }
    case 'dice_roll':
      return {
        roundNumber,
        lane: 'players',
        item: {
          at: entry.at,
          actor: entry.actor,
          kind: 'roll',
          text: `Rolled d${entry.die} = ${entry.result}`,
        },
      };
    case 'trade_item':
      return {
        roundNumber,
        lane: 'players',
        item: {
          at: entry.at,
          actor: entry.actor,
          kind: 'trade',
          text: `Sent ${entry.item} to ${entry.target}`,
        },
      };
    case 'encounter_decision':
      return {
        roundNumber,
        lane: 'players',
        item: {
          at: entry.at,
          actor: entry.actor,
          kind: 'encounter_decision',
          text: entry.requiresRoll
            ? (entry.optionLabel || entry.optionId || 'Submitted encounter choice')
            : `${entry.optionLabel || entry.optionId || 'Submitted encounter choice'} (no roll required)`,
        },
      };
    case 'encounter_check_assigned':
      return {
        roundNumber,
        lane: 'dm',
        item: {
          at: entry.at,
          kind: 'check',
          text: `${entry.actor}: roll d20 + ${entry.statLabel} (${entry.statValue}) vs ${entry.threshold} for encounter choice "${entry.optionLabel}".`,
        },
      };
    case 'encounter_roll':
      return {
        roundNumber,
        lane: 'players',
        item: {
          at: entry.at,
          actor: entry.actor,
          kind: 'encounter_roll',
          text: `Locked d20 ${entry.roll} for "${entry.optionLabel}" (${entry.roll} + ${entry.statValue} = ${entry.total} vs ${entry.threshold}, ${entry.success ? 'success' : 'failure'}).`,
        },
      };
    case 'encounter_ready':
      return {
        roundNumber,
        lane: 'world',
        item: {
          at: entry.at,
          kind: 'encounter_ready',
          text: `${entry.npcName} is ready to resolve when the DM advances the round.`,
        },
      };
    case 'dm_narration':
      return {
        roundNumber,
        lane: 'dm',
        item: {
          at: entry.at,
          kind: 'narration',
          text: entry.text,
        },
      };
    case 'dm_whisper':
      return {
        roundNumber,
        lane: 'dm',
        item: {
          at: entry.at,
          kind: 'whisper',
          target: entry.target,
          visibility: 'private',
          text: entry.text,
        },
      };
    case 'npc_spawned':
      return {
        roundNumber,
        lane: 'dm',
        item: {
          at: entry.at,
          kind: 'prompt',
          text: `Spawned ${entry.npcName} (${String(entry.npcType || '').toUpperCase()}) targeting ${labelTarget(entry.target, usersBySocketId)}.`,
        },
      };
    case 'encounter_resolved':
      return {
        roundNumber,
        lane: 'dm',
        item: {
          at: entry.at,
          kind: 'resolution',
          text: `${entry.npcName} (${String(entry.npcRole || '').toUpperCase()}) resolved as ${entry.outcome}.${entry.flavor ? ` ${entry.flavor}` : ''}`,
        },
      };
    case 'environment_event': {
      const label = labelEnvironmentEvent(entry.eventType);
      return {
        roundNumber,
        lane: 'world',
        item: {
          at: entry.at,
          kind: entry.eventType || 'event',
          text: entry.detail ? `${label}: ${entry.detail}` : label,
        },
      };
    }
    case 'round_advanced':
      return {
        roundNumber,
        lane: 'world',
        item: {
          at: entry.at,
          kind: 'round_transition',
          text: `Round ${roundNumber} begins. Active turn: ${entry.turnUsername || 'No active adventurer'}.`,
        },
      };
    default:
      return null;
  }
}

function buildStructuredRounds(roomId) {
  const usersBySocketId = new Map(
    Object.values(roomUsers[roomId] || {}).map((user) => [user.socketId, user.username])
  );
  const roundsByNumber = new Map();

  (roomTimeline[roomId] || []).forEach((entry) => {
    const mapped = mapTimelineEntryToRoundEntry(entry, usersBySocketId);
    if (!mapped) return;

    const roundNumber = normalizeRoundNumber(mapped.roundNumber);
    if (!roundsByNumber.has(roundNumber)) {
      roundsByNumber.set(roundNumber, {
        roundNumber,
        activeTurn: entry.turnUsername || null,
        dm: [],
        players: [],
        world: [],
      });
    }

    const round = roundsByNumber.get(roundNumber);
    if (!round.activeTurn && entry.turnUsername) {
      round.activeTurn = entry.turnUsername;
    }
    round[mapped.lane].push(mapped.item);
  });

  return Array.from(roundsByNumber.values())
    .sort((left, right) => left.roundNumber - right.roundNumber)
    .map((round) => ({
      roundNumber: round.roundNumber,
      activeTurn: round.activeTurn || 'No active adventurer',
      dm: round.dm,
      players: round.players,
      world: round.world,
    }));
}

function buildPortableState(roomId) {
  const timeline = roomTimeline[roomId] || [];
  return {
    environment: timeline
      .filter((entry) => entry.type === 'environment_event' && ['weather', 'terrain'].includes(entry.eventType))
      .map((entry) => ({
        type: entry.eventType,
        detail: entry.detail || '',
        at: entry.at,
      })),
    encounters: timeline
      .filter((entry) => entry.type === 'encounter_resolved')
      .map((entry) => ({
        eid: entry.encounterId || '',
        npcName: entry.npcName || '',
        npcRole: entry.npcRole || '',
        outcome: entry.outcome || '',
        flavor: entry.flavor || '',
        forced: Boolean(entry.forced),
        at: entry.at,
      })),
  };
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

    socket.on("room:join", ({ roomId, username, password, character }) => {
      if (!roomId || !username) return;

      const normalizedName = String(username).trim().slice(0, 40) || 'Adventurer';
      const normalizedCharacter = normalizeCharacter(character || {});

      // Room must exist (created by DM via room:start)
      if (!roomMeta[roomId]) {
        socket.emit("server:error", { message: "Room not found. Check the room code." });
        return;
      }

      // Validate password
      if (roomMeta[roomId].roomPassword && roomMeta[roomId].roomPassword !== String(password || '')) {
        socket.emit("server:error", { message: "Incorrect room password." });
        return;
      }

      if (getRoomSize(io, roomId) >= ROOM_MEMBER_LIMIT) {
        socket.emit("server:error", { message: "Room is full. Max 1 DM and 12 players." });
        return;
      }

      socket.data.roomId = roomId;
      socket.data.username = normalizedName;
      socket.data.isDM = false;
      socket.data.character = normalizedCharacter;

      socket.join(roomId);
      socket.emit("room:joined", { roomId, socketId: socket.id, roomMeta: roomMeta[roomId] });
      socket.emit("room:history", roomMessages[roomId] || []);
      console.log(`[JOIN] ${normalizedName} joined ${roomId}`);
      appendRoomTimeline(roomId, 'player_joined', {
        actor: normalizedName,
        actorSocketId: socket.id,
      });

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
        roomRounds[roomId] = { roundNumber: 1, turnIndex: 0, turnOrderIds: [], phase: 'action', pendingActions: {} };
      }
      ensureRoundState(roomId);
      roomRounds[roomId].turnOrderIds = buildTurnOrder(roomId);

      socket.to(roomId).emit("user:joined", {
        socketId: socket.id,
        username: normalizedName,
      });

      emitRoomCount(io, roomId);
      emitRoomUsers(io, roomId);
      emitRoundState(io, roomId);
    });

    socket.on("room:start", ({ roomType, dmName, roomPassword, source, importedSnapshot }) => {
      const safeDmName = String(dmName || 'Dungeon Master').trim().slice(0, 40) || 'Dungeon Master';
      const safePassword = String(roomPassword || '').trim().slice(0, 40);
      const safeRoomType = String(roomType || 'Village').trim().slice(0, 40);

      if (!safeDmName || !safePassword) {
        socket.emit("server:error", { message: "DM name and room password are required." });
        return;
      }

      const roomId = uniqueRoomSlug();

      roomMeta[roomId] = {
        roomType: safeRoomType,
        dmName: safeDmName,
        roomPassword: safePassword,
        createdAt: Date.now(),
        source: source || 'manual'
      };
      roomUsers[roomId] = {};
      roomMessages[roomId] = [];
      roomTimeline[roomId] = [];
      roomRounds[roomId] = { roundNumber: 1, turnIndex: 0, turnOrderIds: [], phase: 'action', pendingActions: {} };
      roomSpawnLimits[roomId] = { spawnType: null, aggroCount: 0, greyCount: 0, utilityCount: 0 };
      roomEnvLimits[roomId] = { weatherChanged: false, lootDropTotal: 0, lootDropsByUser: {} };
      roomEncounters[roomId] = null;

      socket.data.roomId = roomId;
      socket.data.username = safeDmName;
      socket.data.isDM = true;

      roomUsers[roomId][socket.id] = {
        socketId: socket.id,
        username: safeDmName,
        avatar: '🧙',
        isDM: true,
        joinedAt: Date.now()
      };

      socket.join(roomId);
      socket.emit("room:joined", { roomId, socketId: socket.id, roomMeta: roomMeta[roomId] });
      console.log(`[START] DM ${safeDmName} created room ${roomId}`);
      appendRoomTimeline(roomId, 'room_started', {
        actor: safeDmName,
        actorSocketId: socket.id,
        roomType: safeRoomType,
      });

      emitRoomUsers(io, roomId);
      emitRoundState(io, roomId);
    });

    socket.on("room:message", ({ text }) => {
      const { roomId, username, isDM } = socket.data || {};

      if (!roomId || !username || !text) return;

      if (isDM) {
        socket.emit("server:error", { message: "DM regular chat is disabled. Use narration or whisper." });
        return;
      }

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

      const historyEntry = {
        from: username,
        text: text.trim(),
        isDMSender: Boolean(socket.data.isDM),
        at: new Date().toISOString(),
      };

      appendRoomHistory(roomId, historyEntry);
      io.to(roomId).emit("room:message", historyEntry);
      appendRoomTimeline(roomId, 'room_message', {
        actor: username,
        actorSocketId: socket.id,
        text: historyEntry.text,
      });
    });

    // ─── DnD Game Events ──────────────────────────────────────────────────

    socket.on('game:roll', () => {
      const { roomId, isDM } = socket.data;
      if (!roomId) return;

      if (isDM) {
        socket.emit("server:error", { message: "DM player-dice rolling is disabled" });
        return;
      }

      socket.emit("server:error", { message: "Standalone dice rolls are disabled. Submit a round action first." });
    });

    socket.on('round:submit-action', ({ text }) => {
      const { roomId, username, isDM, character } = socket.data || {};
      if (!roomId || isDM) {
        socket.emit('server:error', { message: 'Only players can submit round actions.' });
        return;
      }
      if (roomEncounters[roomId]) {
        socket.emit('server:error', { message: 'Resolve the active encounter before submitting a round action.' });
        return;
      }

      const roundState = ensureRoundState(roomId);
      if (roundState.phase !== 'action') {
        socket.emit('server:error', { message: 'The round is resolving. Wait for the next round to begin.' });
        return;
      }

      const safeText = String(text || '').trim().slice(0, 180);
      if (!safeText) {
        socket.emit('server:error', { message: 'Describe what you want to attempt this round.' });
        return;
      }
      if (roundState.pendingActions[socket.id]) {
        socket.emit('server:error', { message: 'You already locked an action for this round.' });
        return;
      }

      const { statKey, statLabel, threshold } = describeRoundAction(safeText);
      const statScore = Number(character?.stats?.[statKey] || 10);
      const statValue = getActionStatValue(statScore);

      roundState.pendingActions[socket.id] = {
        actor: username,
        actorSocketId: socket.id,
        text: safeText,
        statKey,
        statLabel,
        statScore,
        statValue,
        threshold,
        roll: null,
        total: null,
      };

      if (roomUsers[roomId] && roomUsers[roomId][socket.id]) {
        roomUsers[roomId][socket.id].actionSelected = true;
        roomUsers[roomId][socket.id].hasRolled = false;
      }

      appendRoomTimeline(roomId, 'action_declared', {
        actor: username,
        actorSocketId: socket.id,
        text: safeText,
      });
      appendRoomTimeline(roomId, 'action_prompted', {
        actor: username,
        actorSocketId: socket.id,
        text: safeText,
        statKey,
        statLabel,
        statScore,
        statValue,
        threshold,
      });

      socket.emit('round:action:assigned', {
        roundNumber: roundState.roundNumber,
        text: safeText,
        statKey,
        statLabel,
        statScore,
        statValue,
        threshold,
      });
      io.to(roomId).emit('round:action:declared', {
        from: username,
        text: safeText,
        roundNumber: roundState.roundNumber,
      });
      io.to(roomId).emit('round:action:prompted', {
        from: username,
        text: safeText,
        statKey,
        statLabel,
        statValue,
        threshold,
        roundNumber: roundState.roundNumber,
      });

      emitRoomUsers(io, roomId);
      emitRoundState(io, roomId);
    });

    socket.on('round:submit-roll', () => {
      const { roomId, username, isDM } = socket.data || {};
      if (!roomId || isDM) {
        socket.emit('server:error', { message: 'Only players can submit round rolls.' });
        return;
      }
      if (roomEncounters[roomId]) {
        socket.emit('server:error', { message: 'Use the encounter roll flow while an encounter is active.' });
        return;
      }

      const roundState = ensureRoundState(roomId);
      if (roundState.phase !== 'action') {
        socket.emit('server:error', { message: 'The round is resolving. Wait for the next round to begin.' });
        return;
      }

      const pendingAction = roundState.pendingActions[socket.id];
      if (!pendingAction) {
        socket.emit('server:error', { message: 'Submit an action before rolling.' });
        return;
      }
      if (pendingAction.roll !== null) {
        socket.emit('server:error', { message: 'You already locked your roll for this round.' });
        return;
      }

      const roll = Math.floor(Math.random() * 20) + 1;
      pendingAction.roll = roll;
      pendingAction.total = roll + pendingAction.statValue;

      if (roomUsers[roomId] && roomUsers[roomId][socket.id]) {
        roomUsers[roomId][socket.id].hasRolled = true;
      }

      appendRoomTimeline(roomId, 'action_roll_submitted', {
        actor: username,
        actorSocketId: socket.id,
        text: pendingAction.text,
        statKey: pendingAction.statKey,
        statLabel: pendingAction.statLabel,
        statScore: pendingAction.statScore,
        statValue: pendingAction.statValue,
        threshold: pendingAction.threshold,
        roll,
        total: pendingAction.total,
      });

      socket.emit('round:action:roll:accepted', {
        roundNumber: roundState.roundNumber,
        text: pendingAction.text,
        statKey: pendingAction.statKey,
        statLabel: pendingAction.statLabel,
        statScore: pendingAction.statScore,
        statValue: pendingAction.statValue,
        threshold: pendingAction.threshold,
        roll,
      });
      io.to(roomId).emit('round:action:roll-locked', {
        from: username,
        text: pendingAction.text,
        roll,
        roundNumber: roundState.roundNumber,
      });

      emitRoomUsers(io, roomId);
      emitRoundState(io, roomId);
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

      appendRoomHistory(roomId, {
        from: username,
        text: `[Narration] ${text.trim()}`,
        isDMSender: true,
        at: new Date().toISOString(),
      });
      appendRoomTimeline(roomId, 'dm_narration', {
        actor: username,
        actorSocketId: socket.id,
        text: text.trim(),
      });
    });

    // ─── WebRTC Signaling ─────────────────────────────────────────────────

    socket.on('dm:whisper', ({ targetId, text }) => {
      const { roomId, isDM, username } = socket.data || {};
      if (!roomId || !isDM) {
        socket.emit('server:error', { message: 'Only the DM can send whispers.' });
        return;
      }
      if (!targetId || typeof text !== 'string' || !text.trim()) return;
      const safeText = text.trim().slice(0, 300);
      io.to(targetId).emit('dm:whisper', { from: username, text: safeText });
      const targetUser = roomUsers[roomId] && roomUsers[roomId][targetId];
      appendRoomTimeline(roomId, 'dm_whisper', {
        actor: username,
        actorSocketId: socket.id,
        target: targetUser?.username || 'unknown',
        targetSocketId: targetId,
        text: safeText,
        visibility: 'private',
      });
    });

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
      const activeEncounter = roomEncounters[roomId];
      if (activeEncounter && !isEncounterReady(activeEncounter)) {
        socket.emit("server:error", { message: "The active encounter is not ready to resolve yet." });
        return;
      }

      const roundState = ensureRoundState(roomId);
      roundState.phase = 'resolution';
      resolveRoundActions(roomId, io);
      if (activeEncounter) {
        resolveEncounter(roomId, activeEncounter, io, roomUsers, roomEncounters, drawLoot, OUTCOME_FLAVOR);
      }

      const turnOrder = buildTurnOrder(roomId);
      roundState.turnOrderIds = turnOrder;
      roundState.roundNumber += 1;
      roundState.turnIndex = turnOrder.length === 0
        ? 0
        : (roundState.roundNumber - 1) % turnOrder.length;
      roundState.phase = 'action';
      roundState.pendingActions = {};

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
        text: `Round ${roundState.roundNumber} begins.`,
        at: new Date().toISOString(),
      });
      appendRoomTimeline(roomId, 'round_advanced', {
        actor: roomMeta[roomId]?.dmName || 'DM',
        roundNumber: roundState.roundNumber,
        turnUsername: getRoundContext(roomId).turnUsername,
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
        participants: Object.values(roomUsers[roomId] || {}).map((u) => ({
          avatar: u.avatar || null,
          username: u.username,
          className: u.className || null,
          race: u.race || null,
          level: u.level || null,
          isDM: Boolean(u.isDM),
        })),
        rounds: buildStructuredRounds(roomId),
        portableState: buildPortableState(roomId),
        exportedAt: new Date().toISOString()
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
        playerStates[sid] = {
          decision: null,
          check: null,
          roll: null,
          total: null,
          success: null,
          outcome: null,
        };
      });

      const encounter = {
        eid,
        templateId: template.id,
        npcName: name || template.name,
        npcRole: type,
        npcStats: {
          hp: template.hp,
          ac: template.ac,
          str: template.str,
          dex: template.dex,
          atk: template.stats?.atk ?? template.str,
          def: template.stats?.def ?? template.ac,
          spd: template.stats?.spd ?? template.dex,
          will: template.stats?.will ?? 0,
          neg: template.stats?.neg ?? 0,
          negDifficulty: template.negDifficulty ?? 0,
        },
        npcCurrentHp: template.hp,
        lootTable: template.lootTable || [],
        targetSocketIds,
        playerStates,
        roundNumber: getRoundContext(roomId).roundNumber,
        seed,
        readyAt: null,
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
      emitEncounterRoster(io, roomId, encounter);
      emitRoundState(io, roomId);
      appendRoomTimeline(roomId, 'npc_spawned', {
        actor: roomMeta[roomId]?.dmName || 'DM',
        npcType: type,
        npcName: encounter.npcName,
        target: target || 'all',
        encounterId: eid,
      });
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

      const playerIndex = enc.targetSocketIds.indexOf(socket.id);
      const availableOptions = getOptionsForEncounter(enc.npcRole, enc.seed + Math.max(0, playerIndex));
      const selectedOption = availableOptions.find((option) => option.id === optionId)
        || availableOptions.find((option) => option.label === optionLabel);
      if (!selectedOption) {
        socket.emit('server:error', { message: 'That encounter choice is no longer valid.' });
        return;
      }

      const encounterCheck = buildEncounterCheck(enc, socket.data?.character, selectedOption);
      const choiceSummary = describeEncounterChoice(selectedOption);
      const playerState = enc.playerStates[socket.id];
      playerState.decision = {
        optionId: String(selectedOption.id).slice(0, 40),
        optionLabel: String(selectedOption.label || '').slice(0, 80),
        requiresRoll: Boolean(selectedOption.reqRoll),
        mode: choiceSummary.mode,
        resolutionText: choiceSummary.resolutionText,
      };
      playerState.check = encounterCheck;
      if (!encounterCheck.requiresRoll) {
        playerState.success = true;
        playerState.outcome = 'success';
      }

      socket.emit('encounter:decision:ack', {
        eid,
        optionId: playerState.decision.optionId,
        optionLabel: playerState.decision.optionLabel,
        needsRoll: encounterCheck.requiresRoll,
        resolutionText: playerState.decision.resolutionText,
        check: encounterCheck.requiresRoll ? {
          statKey: encounterCheck.statKey,
          statLabel: encounterCheck.statLabel,
          statScore: encounterCheck.statScore,
          statValue: encounterCheck.statValue,
          threshold: encounterCheck.threshold,
        } : null,
      });
      appendRoomTimeline(roomId, 'encounter_decision', {
        actor: socket.data?.username || 'Player',
        actorSocketId: socket.id,
        encounterId: eid,
        optionId: playerState.decision.optionId,
        optionLabel: playerState.decision.optionLabel,
        requiresRoll: encounterCheck.requiresRoll,
        resolutionText: playerState.decision.resolutionText,
      });
      if (encounterCheck.requiresRoll) {
        appendRoomTimeline(roomId, 'encounter_check_assigned', {
          actor: socket.data?.username || 'Player',
          actorSocketId: socket.id,
          encounterId: eid,
          optionId: playerState.decision.optionId,
          optionLabel: playerState.decision.optionLabel,
          statKey: encounterCheck.statKey,
          statLabel: encounterCheck.statLabel,
          statScore: encounterCheck.statScore,
          statValue: encounterCheck.statValue,
          threshold: encounterCheck.threshold,
        });
      }

      emitEncounterRoster(io, roomId, enc);
      maybeMarkEncounterReady(roomId, enc, io);
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
      if (!ps.check?.requiresRoll) {
        socket.emit('server:error', { message: 'That encounter choice does not require a roll.' });
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

      const total = r + (ps.check?.statValue || 0);
      const success = total >= (ps.check?.threshold || 0);
      ps.total = total;
      ps.success = success;
      ps.outcome = success ? 'success' : 'failure';
      socket.emit('encounter:roll:ack', {
        eid,
        roll: r,
        statKey: ps.check?.statKey,
        statLabel: ps.check?.statLabel,
        statScore: ps.check?.statScore,
        statValue: ps.check?.statValue,
        threshold: ps.check?.threshold,
        total,
        success,
      });
      appendRoomTimeline(roomId, 'encounter_roll', {
        actor: socket.data?.username || 'Player',
        actorSocketId: socket.id,
        encounterId: eid,
        roll: r,
        optionId: ps.decision?.optionId,
        optionLabel: ps.decision?.optionLabel,
        statKey: ps.check?.statKey,
        statLabel: ps.check?.statLabel,
        statValue: ps.check?.statValue,
        threshold: ps.check?.threshold,
        total,
        success,
      });

      emitEncounterRoster(io, roomId, enc);
      maybeMarkEncounterReady(roomId, enc, io);
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
      emitRoundState(io, roomId);
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

        appendRoomTimeline(roomId, 'environment_event', {
          actor: dmName,
          eventType: type,
          detail: desc,
          target: target || 'all',
        });

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
      appendRoomTimeline(roomId, 'trade_item', {
        actor: username,
        actorSocketId: socket.id,
        target: toUsername,
        targetSocketId: targetId,
        item: safeItem,
      });

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
        appendRoomTimeline(roomId, 'player_left', {
          actor: username,
          actorSocketId: socket.id,
        });
        delete roomUsers[roomId][socket.id];
        if (roomRounds[roomId]?.pendingActions) {
          delete roomRounds[roomId].pendingActions[socket.id];
        }
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
          delete roomMessages[roomId];
          delete roomTimeline[roomId];
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
    const user = roomUserMap?.[sid];
    const ps = enc.playerStates[sid] || {};
    return {
      socketId: sid,
      username: user?.username || 'Unknown',
      decision: ps.decision ? {
        ...ps.decision,
      } : null,
      check: ps.check ? {
        requiresRoll: Boolean(ps.check.requiresRoll),
        statLabel: ps.check.statLabel,
        statValue: ps.check.statValue,
        threshold: ps.check.threshold,
      } : null,
      roll: ps.roll,
      total: ps.total,
      success: ps.success,
      outcome: ps.outcome
    };
  });
}

function emitEncounterRoster(io, roomId, enc) {
  const dmSocket = Object.values(roomUsers[roomId] || {}).find((user) => user.isDM);
  if (!dmSocket) return;

  io.to(dmSocket.socketId).emit('encounter:roster', {
    eid: enc.eid,
    ready: isEncounterReady(enc),
    roster: buildEncounterRoster(enc, roomUsers[roomId]),
  });
}

function encounterDecisionIsNegotiation(decision) {
  const optionId = String(decision?.optionId || '').trim().toLowerCase();
  return /negotiate|persuade|bribe|probe_info|feign_ally|show_mercy|demand_surrender|share_story|cry_for_help|ask_rumour|hire_guide/.test(optionId);
}

function renderEncounterFlavor(template, enc, roomUserMap) {
  const firstPlayerName = enc.targetSocketIds
    .map((socketId) => roomUserMap[socketId]?.username)
    .find(Boolean) || 'The party';

  return String(template || 'The encounter ends.')
    .replace(/{{npc}}/g, enc.npcName || 'The foe')
    .replace(/{{player}}/g, firstPlayerName);
}

function formatEncounterActorList(names) {
  const uniqueNames = Array.from(new Set(names.filter(Boolean)));
  if (uniqueNames.length === 0) return '';
  if (uniqueNames.length === 1) return uniqueNames[0];
  if (uniqueNames.length === 2) return `${uniqueNames[0]} and ${uniqueNames[1]}`;
  return `${uniqueNames.slice(0, -1).join(', ')}, and ${uniqueNames[uniqueNames.length - 1]}`;
}

function buildEncounterContributionClause(names, singularPhrase, pluralPhrase) {
  const uniqueNames = Array.from(new Set(names.filter(Boolean)));
  if (uniqueNames.length === 0) return '';
  return `${formatEncounterActorList(uniqueNames)} ${uniqueNames.length === 1 ? singularPhrase : pluralPhrase}`;
}

function buildEncounterContributionSummary(enc, roomUserMap, outcome) {
  const contributions = enc.targetSocketIds.map((socketId) => {
    const decision = enc.playerStates[socketId]?.decision || null;
    return {
      username: roomUserMap[socketId]?.username || 'A party member',
      decision,
      success: Boolean(enc.playerStates[socketId]?.success),
    };
  }).filter((entry) => entry.decision);

  const supportNames = contributions
    .filter((entry) => !entry.decision.requiresRoll && entry.decision.mode !== 'mercy')
    .map((entry) => entry.username);
  const mercyNames = contributions
    .filter((entry) => entry.decision.mode === 'mercy')
    .map((entry) => entry.username);
  const rolledSuccessNames = contributions
    .filter((entry) => entry.decision.requiresRoll && entry.success)
    .map((entry) => entry.username);
  const negotiationNames = contributions
    .filter((entry) => entry.success && encounterDecisionIsNegotiation(entry.decision))
    .map((entry) => entry.username);
  const failedCheckNames = contributions
    .filter((entry) => entry.decision.requiresRoll && !entry.success)
    .map((entry) => entry.username);

  const parts = [];

  if (outcome === 'death') {
    if (rolledSuccessNames.length > 0) {
      parts.push(buildEncounterContributionClause(rolledSuccessNames, 'forces the encounter open.', 'force the encounter open.'));
    }
    if (supportNames.length > 0) {
      parts.push(buildEncounterContributionClause(supportNames, 'keeps the party coordinated.', 'keep the party coordinated.'));
    }
    if (mercyNames.length > 0) {
      parts.push(buildEncounterContributionClause(mercyNames, 'tries to show restraint, but the clash still turns lethal.', 'try to show restraint, but the clash still turns lethal.'));
    }
  } else if (outcome === 'negotiate') {
    if (negotiationNames.length > 0) {
      parts.push(buildEncounterContributionClause(negotiationNames, 'talks the pressure down.', 'talk the pressure down.'));
    }
    if (supportNames.length > 0) {
      parts.push(buildEncounterContributionClause(supportNames, 'keeps the opening stable.', 'keep the opening stable.'));
    }
    if (mercyNames.length > 0) {
      parts.push(buildEncounterContributionClause(mercyNames, 'helps steer the scene away from bloodshed.', 'help steer the scene away from bloodshed.'));
    }
  } else if (outcome === 'success') {
    if (rolledSuccessNames.length > 0) {
      parts.push(buildEncounterContributionClause(rolledSuccessNames, 'secures the key advantage.', 'secure the key advantage.'));
    }
    if (supportNames.length > 0) {
      parts.push(buildEncounterContributionClause(supportNames, 'turns that opening into a clean win.', 'turn that opening into a clean win.'));
    }
  } else if (outcome === 'flee') {
    if (supportNames.length > 0) {
      parts.push(buildEncounterContributionClause(supportNames, 'buys the party room to disengage.', 'buy the party room to disengage.'));
    }
    if (failedCheckNames.length > 0) {
      parts.push(buildEncounterContributionClause(failedCheckNames, 'cannot convert the check in time.', 'cannot convert their checks in time.'));
    }
  }

  return parts.length > 0 ? `Party impact: ${parts.join(' ')}` : '';
}

// ─── Encounter Helper: Resolve encounter and emit results ─────────────────────
function resolveEncounter(roomId, enc, io, roomUsers, roomEncounters, drawLoot, OUTCOME_FLAVOR, forcedOutcome) {
  const seed = enc.seed;

  let totalParticipants = enc.targetSocketIds.length || 1;
  const successfulPlayers = enc.targetSocketIds.filter((sid) => enc.playerStates[sid]?.success);
  const successCount = successfulPlayers.length;
  const hasNegotiationSuccess = successfulPlayers.some((sid) => encounterDecisionIsNegotiation(enc.playerStates[sid]?.decision));

  let outcome;
  if (forcedOutcome) {
    outcome = forcedOutcome; // 'death', 'negotiate', 'flee', 'success'
  } else if (enc.npcRole === 'aggro') {
    outcome = successCount >= Math.ceil(totalParticipants / 2)
      ? (hasNegotiationSuccess ? 'negotiate' : 'death')
      : 'flee';
  } else if (enc.npcRole === 'grey') {
    outcome = successCount >= Math.ceil(totalParticipants / 2)
      ? (hasNegotiationSuccess ? 'negotiate' : 'success')
      : 'flee';
  } else {
    outcome = successCount >= Math.ceil(totalParticipants / 2) ? 'success' : 'flee';
  }

  // Draw loot: 1-2 winners get items
  const lootWinners = enc.targetSocketIds.filter((sid) => enc.playerStates[sid]?.success);
  if (lootWinners.length === 0 && outcome !== 'flee') lootWinners.push(...enc.targetSocketIds.slice(0, 1));

  const perPlayerLoot = {};
  lootWinners.forEach((sid, i) => {
    const items = drawLoot(enc.lootTable, seed + i);
    perPlayerLoot[sid] = items;
  });

  const flavorPool = OUTCOME_FLAVOR[outcome] || OUTCOME_FLAVOR['flee'];
  const flavorTemplate = flavorPool[Math.floor(Math.random() * flavorPool.length)] || 'The encounter ends.';
  const baseFlavor = renderEncounterFlavor(flavorTemplate, enc, roomUsers[roomId] || {});
  const contributionSummary = buildEncounterContributionSummary(enc, roomUsers[roomId] || {}, outcome);
  const flavor = contributionSummary ? `${baseFlavor} ${contributionSummary}` : baseFlavor;

  const resolvedPayload = {
    eid: enc.eid,
    outcome,
    flavor,
    roster: buildEncounterRoster(enc, roomUsers[roomId]),
    perPlayerLoot,
    at: new Date().toISOString()
  };
  enc.resolvedAt = resolvedPayload.at;

  appendRoomTimeline(roomId, 'encounter_resolved', {
    encounterId: enc.eid,
    npcName: enc.npcName,
    npcRole: enc.npcRole,
    outcome,
    forced: Boolean(forcedOutcome),
    flavor,
    lootRecipients: Object.keys(perPlayerLoot),
  });

  // Broadcast resolution to all room members
  io.to(roomId).emit('encounter:resolved', resolvedPayload);

  // Clear encounter
  roomEncounters[roomId] = null;
}

module.exports = { registerSocketHandlers };