// ─── Socket Setup ────────────────────────────────────────────────────────────
const socket = io();
 
// ─── State ───────────────────────────────────────────────────────────────────
let myUsername = '';
let myRoomId = '';
let isDM = false;
let myAvatar = '🧙';
let myCharacter = null;
let importedCharacter = null;
let myRoomType = '';
let myRoomPassword = '';
let pendingNormalizationLines = [];
let myInventory = [];          // player's current item list
let selectedTradeItem = null;  // item chosen for trade
let spawnLimits = {};          // echoed from server each round
let envLimits = {};
let currentRoundNumber = 1;
let currentRoundPhase = 'action';
let myPendingRoundAction = null;
 
// peerConnections: Map<socketId, RTCPeerConnection>
const peerConnections = {};
// dataChannels: Map<socketId, RTCDataChannel>
const dataChannels = {};
// pendingFiles: Map<socketId, { name, chunks, totalSize }>
const pendingFiles = {};
 
const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
 
// ─── DOM Refs ─────────────────────────────────────────────────────────────────
let feed, memberCount, joinSection, chatSection;
let joinRoomIdInput, joinRoomPasswordInput, messageInput, avatarSelect, joinAvatarSelect;
let startRoomTypeInput, startDMNameInput, startRoomPasswordInput;
let charNameInput, charBackstoryInput, charEquipmentInput, charClassInput, charRaceInput, charLevelInput, charHPInput;
let statMightInput, statAgilityInput, statEnduranceInput, statIntellectInput, statIntuitionInput, statPresenceInput;
let characterImportInput, roomImportInput, statsSummary, createdRoomCode, copyRoomCodeBtn;
let charLevelValue, charHPValue;
let statMightValue, statAgilityValue, statEnduranceValue, statIntellectValue, statIntuitionValue, statPresenceValue;
let diceSection, dmSection, narrateInput, tradeSection, avatarDisplay, connectionStatus;
let userRoster, loadingScreen, snapshotSection, exportCampaignBtn, exportCharacterBtn;
let avatarBox, charSummary, chatInputRow, roundDisplay, phaseDisplay, turnDisplay, nextRoundBtn;
let dmWhisperTarget, dmWhisperInput;
let inventoryBox, inventoryList, tradeInventoryButtons, tradeTargetSelect, tradeSelectedItem;
let dmSpawnSection, dmEnvSection, spawnLimitInfo, envLimitInfo;
let spawnNpcType, spawnNpcName, spawnTarget, envEventType, envEventDetail, envTarget;
let actionSection, actionInput, actionStatus, actionCheckSummary, actionSubmitBtn, actionRollBtn;

const ROOM_TYPES = [
  'Village', 'Township', 'City', 'Ruins', 'Castle', 'Manor', 'Desert', 'Oasis',
  'Forest', 'Mountains', 'Moonlit Grove', 'Hollow Fen', 'Sunken Temple',
  'Crystal Caverns', 'Ashen Wastes', 'Skyreach Spire', 'Whispering Catacombs', 'Storm Coast'
];

const CLASS_OPTIONS = ['Fighter', 'Rogue', 'Wizard', 'Cleric', 'Ranger', 'Paladin', 'Warlock', 'Bard', 'Druid', 'Monk'];
const RACE_OPTIONS = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Orc', 'Tiefling', 'Dragonborn', 'Gnome', 'Half-Elf', 'Half-Orc'];
const EQUIPMENT_OPTIONS = [
  'Balanced Kit',
  'Frontline Kit',
  'Scout Kit',
  'Caster Kit',
  'Survival Kit',
  'Noble Kit'
];
const AVATAR_OPTIONS = ['⚔️', '🗡️', '🧙', '✨', '🏹', '🛡️', '🔮', '🎵', '🌿', '👊'];

const CLASS_AVATAR_MAP = {
  Fighter: '⚔️', Rogue: '🗡️', Wizard: '🧙', Cleric: '✨',
  Ranger: '🏹', Paladin: '🛡️', Warlock: '🔮', Bard: '🎵', Druid: '🌿', Monk: '👊'
};

const KIT_INVENTORIES = {
  'Balanced Kit':  ['Shortsword', 'Shortbow', 'Rope (50ft)', 'Torch', 'Rations (3 days)'],
  'Frontline Kit': ['Longsword', 'Heavy Armor', 'Shield', 'Health Potion'],
  'Scout Kit':     ['Longbow', 'Light Armor', 'Rope (50ft)', 'Grappling Hook', 'Rations (3 days)'],
  'Caster Kit':    ['Arcane Staff', 'Spellbook', 'Arcane Focus', 'Magic Reagents'],
  'Survival Kit':  ['Hooded Cloak', 'Rations (5 days)', 'Trap Tools', 'Hunting Knife'],
  'Noble Kit':     ['Fine Attire', 'Signet Ring', 'Coin Purse', 'Fine Wine']
};

const INVENTORY_CATEGORY_RULES = [
  { tag: 'Weapon', icon: '⚔️', pattern: /(sword|bow|staff|knife|dagger)/i },
  { tag: 'Armor', icon: '🛡️', pattern: /(armor|shield|cloak)/i },
  { tag: 'Consumable', icon: '🧪', pattern: /(potion|rations|wine)/i },
  { tag: 'Utility', icon: '🧰', pattern: /(rope|hook|torch|book|focus|reagents|tools|ring|purse|attire)/i },
];

const RUNTIME_STORAGE_KEYS = {
  inventory: 'dnd_inventory',
  roomEnv: 'dnd_room_env',
  roomEncounters: 'dnd_room_encounters'
};

function getRuntimeStorage() {
  try {
    return window.sessionStorage;
  } catch (e) {
    return null;
  }
}

function readStoredJson(key, fallback) {
  const storage = getRuntimeStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  const storage = getRuntimeStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function extractSnapshotInventory(snapshot) {
  if (!Array.isArray(snapshot?.inventory)) return null;
  return snapshot.inventory.map((item) => String(item).trim()).filter(Boolean);
}

function shouldResetPortableRoomState(roomMeta) {
  return roomMeta?.source !== 'import';
}

document.addEventListener('DOMContentLoaded', () => {
  feed          = document.getElementById('message-feed');
  memberCount   = document.getElementById('member-count');
  joinSection   = document.getElementById('join-section');
  chatSection   = document.getElementById('chat-section');
  joinRoomIdInput = document.getElementById('join-room-id');
  joinRoomPasswordInput = document.getElementById('join-room-password');
  messageInput  = document.getElementById('message-input');
  diceSection   = document.getElementById('dice-section');
  dmSection     = document.getElementById('dm-section');
  narrateInput  = document.getElementById('narrate-input');
  tradeSection  = document.getElementById('trade-section');
  avatarSelect  = document.getElementById('avatar-select');
  joinAvatarSelect = null; // removed from form, kept variable for compat
  startRoomTypeInput = document.getElementById('start-room-type');
  startDMNameInput = document.getElementById('start-dm-name');
  startRoomPasswordInput = document.getElementById('start-room-password');
  charNameInput = document.getElementById('char-name');
  charBackstoryInput = document.getElementById('char-backstory');
  charEquipmentInput = document.getElementById('char-equipment');
  charClassInput = document.getElementById('char-class');
  charRaceInput = document.getElementById('char-race');
  charLevelInput = document.getElementById('char-level');
  charHPInput = document.getElementById('char-hp');
  charLevelValue = document.getElementById('char-level-value');
  charHPValue = document.getElementById('char-hp-value');
  statMightInput = document.getElementById('stat-might');
  statAgilityInput = document.getElementById('stat-agility');
  statEnduranceInput = document.getElementById('stat-endurance');
  statIntellectInput = document.getElementById('stat-intellect');
  statIntuitionInput = document.getElementById('stat-intuition');
  statPresenceInput = document.getElementById('stat-presence');
  statMightValue = document.getElementById('stat-might-value');
  statAgilityValue = document.getElementById('stat-agility-value');
  statEnduranceValue = document.getElementById('stat-endurance-value');
  statIntellectValue = document.getElementById('stat-intellect-value');
  statIntuitionValue = document.getElementById('stat-intuition-value');
  statPresenceValue = document.getElementById('stat-presence-value');
  characterImportInput = document.getElementById('character-import-file');
  roomImportInput = document.getElementById('room-import-file');
  statsSummary = document.getElementById('stats-summary');
  createdRoomCode = document.getElementById('created-room-code');
  copyRoomCodeBtn = document.getElementById('copy-room-code-btn');
  avatarDisplay = document.getElementById('avatar-display');
  connectionStatus = document.getElementById('connection-status');
  userRoster    = document.getElementById('user-roster');
  loadingScreen = document.getElementById('loading-screen');
  charSummary   = document.getElementById('char-summary');
  chatInputRow  = document.getElementById('chat-input-row');
  dmWhisperTarget = document.getElementById('dm-whisper-target');
  dmWhisperInput  = document.getElementById('dm-whisper-input');
  snapshotSection = document.getElementById('snapshot-section');
  exportCampaignBtn = document.getElementById('export-campaign-btn');
  exportCharacterBtn = document.getElementById('export-character-btn');
  avatarBox = document.getElementById('avatar-box');
  roundDisplay = document.getElementById('round-display');
  phaseDisplay = document.getElementById('phase-display');
  turnDisplay = document.getElementById('turn-display');
  nextRoundBtn = document.getElementById('next-round-btn');
  actionSection = document.getElementById('action-section');
  actionInput = document.getElementById('action-input');
  actionStatus = document.getElementById('action-status');
  actionCheckSummary = document.getElementById('action-check-summary');
  actionSubmitBtn = document.getElementById('action-submit-btn');
  actionRollBtn = document.getElementById('action-roll-btn');
  inventoryBox = document.getElementById('inventory-box');
  inventoryList = document.getElementById('inventory-list');
  tradeInventoryButtons = document.getElementById('trade-inventory-buttons');
  tradeTargetSelect = document.getElementById('trade-target-select');
  tradeSelectedItem = document.getElementById('trade-selected-item');
  dmSpawnSection = document.getElementById('dm-spawn-section');
  dmEnvSection = document.getElementById('dm-env-section');
  spawnLimitInfo = document.getElementById('spawn-limit-info');
  envLimitInfo = document.getElementById('env-limit-info');
  spawnNpcType = document.getElementById('spawn-npc-type');
  spawnNpcName = document.getElementById('spawn-npc-name');
  spawnTarget = document.getElementById('spawn-target');
  envEventType = document.getElementById('env-event-type');
  envEventDetail = document.getElementById('env-event-detail');
  envTarget = document.getElementById('env-target');

  // Derive avatar emoji when class changes on join form (pre-join only)
  if (charClassInput) {
    charClassInput.addEventListener('change', () => {
      myAvatar = CLASS_AVATAR_MAP[charClassInput.value] || '🧙';
    });
  }

  [statMightInput, statAgilityInput, statEnduranceInput, statIntellectInput, statIntuitionInput, statPresenceInput]
    .filter(Boolean)
    .forEach((input) => input.addEventListener('input', updateStatsSummary));

  [charLevelInput, charHPInput]
    .filter(Boolean)
    .forEach((input) => input.addEventListener('input', updateSliderSummaries));

  if (actionInput) {
    actionInput.addEventListener('input', updateRoundActionUI);
  }

  updateSliderSummaries();
  updateStatsSummary();
  updateRoundActionUI();
});
// ─── UI Helpers ───────────────────────────────────────────────────────────────
function addMessage(text, type = 'chat') {
  const p = document.createElement('p');
  p.className = `msg msg--${type}`;
  p.textContent = text;
  feed.appendChild(p);
  feed.scrollTop = feed.scrollHeight;
  
}

function displayError(message) {
  addMessage(`Error: ${message}`, 'error');
}

function updateAvatarDisplay() {
  if (isDM) {
    if (avatarDisplay) avatarDisplay.classList.add('hidden');
    return;
  }
  const avatar = myAvatar || '🧙';
  if (!avatarDisplay) return;
  avatarDisplay.textContent = avatar;
  avatarDisplay.classList.remove('hidden');
}

function updateCharSummary() {
  if (!charSummary) return;
  if (isDM || !myCharacter) { charSummary.textContent = ''; return; }
  const c = myCharacter;
  charSummary.innerHTML =
    `<div class="char-summary-head">` +
      `<span class="char-summary-avatar">${c.avatar || '🧙'}</span>` +
      `<div class="char-summary-title">` +
        `<div class="char-summary-name">${escapeHtml(c.characterName)}</div>` +
        `<div class="char-summary-sub">${escapeHtml(c.className)} · ${escapeHtml(c.race)} · Lv ${c.level}</div>` +
      `</div>` +
    `</div>` +
    `<div class="char-summary-stats">HP ${c.hp}</div>`;
}

function formatActionStatValue(value) {
  return String(Number(value) || 0);
}

function formatRoundResolutionMessage(result) {
  const formula = result.total === null
    ? 'no roll submitted'
    : `${result.roll} + ${formatActionStatValue(result.statValue)} = ${result.total} vs ${result.threshold}`;
  return `[Round ${result.roundNumber || currentRoundNumber} Resolution] ${result.actor}: ${result.success ? 'SUCCESS' : 'FAILURE'} on "${result.text}" (${formula}). ${result.resolutionText}`;
}

function updateRoundActionUI() {
  const isPlayer = !isDM;
  if (actionSection) actionSection.classList.toggle('hidden', !isPlayer);
  if (diceSection) diceSection.classList.toggle('hidden', !isPlayer);
  if (!isPlayer) return;

  const actionPhase = currentRoundPhase === 'action';
  const hasAssignedAction = Boolean(myPendingRoundAction);
  const hasLockedRoll = Boolean(hasAssignedAction && myPendingRoundAction.roll !== null && myPendingRoundAction.roll !== undefined);

  if (actionInput) {
    actionInput.disabled = !actionPhase || hasAssignedAction;
  }
  if (actionSubmitBtn) {
    actionSubmitBtn.disabled = !actionPhase || hasAssignedAction || !(actionInput?.value.trim());
  }
  if (actionRollBtn) {
    actionRollBtn.disabled = !actionPhase || !hasAssignedAction || hasLockedRoll;
  }
  if (actionStatus) {
    if (!actionPhase) {
      actionStatus.textContent = currentRoundPhase === 'encounter'
        ? 'An encounter is active. Resolve it before taking a new round action.'
        : 'Waiting for the next round to open the action phase.';
    } else if (!hasAssignedAction) {
      actionStatus.textContent = 'Describe one action to attempt this round.';
    } else if (!hasLockedRoll) {
      actionStatus.textContent = `Locked action: ${myPendingRoundAction.text}`;
    } else {
      actionStatus.textContent = `Roll locked: ${myPendingRoundAction.roll}. Waiting for round resolution.`;
    }
  }
  if (actionCheckSummary) {
    if (!hasAssignedAction) {
      actionCheckSummary.textContent = 'Submit an action to receive a stat check.';
    } else {
      actionCheckSummary.textContent = `Roll d20 + ${myPendingRoundAction.statLabel} (${formatActionStatValue(myPendingRoundAction.statValue)}) vs ${myPendingRoundAction.threshold}`;
    }
  }
}

// ─── Inventory Helpers ────────────────────────────────────────────────────────
function initInventory(equipment) {
  // Load saved inventory from tab-scoped runtime storage, or start from kit.
  const stored = readStoredJson(RUNTIME_STORAGE_KEYS.inventory, null);
  if (Array.isArray(stored)) {
    myInventory = stored.map((item) => String(item).trim()).filter(Boolean);
  } else {
    myInventory = [...(KIT_INVENTORIES[equipment] || ["Adventurer's Pack"])];
  }
  renderInventory();
  renderTradeInventory();
}

function renderInventory() {
  if (!inventoryList) return;
  inventoryList.innerHTML = '';
  if (myInventory.length === 0) {
    inventoryList.innerHTML = '<em class="inv-empty">Empty</em>';
    return;
  }
  myInventory.forEach((item) => {
    const meta = describeInventoryItem(item);
    const div = document.createElement('div');
    div.className = 'inv-item';
    const icon = document.createElement('span');
    icon.className = 'inv-item-icon';
    icon.textContent = meta.icon;

    const name = document.createElement('span');
    name.className = 'inv-item-name';
    name.textContent = item;

    const tag = document.createElement('span');
    tag.className = 'inv-item-tag';
    tag.textContent = meta.tag;

    div.append(icon, name, tag);
    inventoryList.appendChild(div);
  });
}

function renderTradeInventory() {
  if (!tradeInventoryButtons) return;
  tradeInventoryButtons.innerHTML = '';
  selectedTradeItem = null;
  if (tradeSelectedItem) tradeSelectedItem.textContent = '';
  if (myInventory.length === 0) {
    tradeInventoryButtons.innerHTML = '<em class="trade-inv-empty">No items to trade</em>';
    return;
  }
  myInventory.forEach((item) => {
    const meta = describeInventoryItem(item);
    const btn = document.createElement('button');
    btn.className = 'trade-item-btn';
    btn.textContent = `${meta.icon} ${item}`;
    btn.onclick = () => {
      document.querySelectorAll('.trade-item-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTradeItem = item;
      if (tradeSelectedItem) tradeSelectedItem.textContent = `Selected: ${item}`;
    };
    tradeInventoryButtons.appendChild(btn);
  });
}

function describeInventoryItem(item) {
  const normalized = String(item || '').trim();
  return INVENTORY_CATEGORY_RULES.find((rule) => rule.pattern.test(normalized)) || {
    tag: 'Utility',
    icon: '🧰'
  };
}

function updateTradePlayerList(users) {
  if (!tradeTargetSelect) return;
  const current = tradeTargetSelect.value;
  tradeTargetSelect.innerHTML = '<option value="">— choose player —</option>';
  users.filter(u => !u.isDM && u.username !== myUsername).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.socketId;
    opt.textContent = u.username;
    tradeTargetSelect.appendChild(opt);
  });
  tradeTargetSelect.value = current;
}

function updateSpawnPlayerList(users) {
  [spawnTarget, envTarget].forEach(sel => {
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="all">All players</option>';
    users.filter(u => !u.isDM).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.socketId;
      opt.textContent = u.username;
      sel.appendChild(opt);
    });
    sel.value = current || 'all';
  });
}

function updateDmWhisperList(users) {
  if (!dmWhisperTarget) return;
  const current = dmWhisperTarget.value;
  dmWhisperTarget.innerHTML = '<option value="">— choose player —</option>';
  users.filter(u => !u.isDM).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.socketId;
    opt.textContent = u.username;
    dmWhisperTarget.appendChild(opt);
  });
  dmWhisperTarget.value = current;
}

function sendDmWhisper() {
  if (!isDM) return;
  const targetId = dmWhisperTarget?.value;
  const text = dmWhisperInput?.value.trim();
  if (!targetId) { displayError('Choose a player to whisper to.'); return; }
  if (!text) { displayError('Whisper message cannot be empty.'); return; }
  socket.emit('dm:whisper', { targetId, text });
  addMessage(`🔒 [You → player] ${text}`, 'narrate');
  if (dmWhisperInput) dmWhisperInput.value = '';
}

function getStatValues() {
  return {
    might: Number(statMightInput?.value || 0),
    agility: Number(statAgilityInput?.value || 0),
    endurance: Number(statEnduranceInput?.value || 0),
    intellect: Number(statIntellectInput?.value || 0),
    intuition: Number(statIntuitionInput?.value || 0),
    presence: Number(statPresenceInput?.value || 0)
  };
}

function validateStats(stats) {
  const values = Object.values(stats);
  const sum = values.reduce((total, value) => total + value, 0);
  const invalidRange = values.some((value) => value < 3 || value > 20);
  if (invalidRange) {
    return { valid: false, message: 'Each stat must be between 3 and 20.' };
  }
  if (sum !== 44) {
    return { valid: false, message: `Total stat points must equal 44. Current total: ${sum}.` };
  }
  return { valid: true, message: '', sum };
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function closestOption(value, options, fallback = options[0]) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const exact = options.find((opt) => opt.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const normalized = raw.toLowerCase();
  let best = fallback;
  let bestScore = Number.POSITIVE_INFINITY;
  options.forEach((opt) => {
    const score = levenshteinDistance(normalized, opt.toLowerCase());
    if (score < bestScore) {
      best = opt;
      bestScore = score;
    }
  });
  return best;
}

function normalizeStats(inputStats = {}) {
  const defaults = {
    might: 7,
    agility: 8,
    endurance: 7,
    intellect: 8,
    intuition: 7,
    presence: 7
  };
  const keys = Object.keys(defaults);
  const stats = {};

  keys.forEach((key) => {
    stats[key] = clampNumber(inputStats[key], 3, 20, defaults[key]);
  });

  let total = keys.reduce((sum, key) => sum + stats[key], 0);
  while (total < 44) {
    const candidate = keys
      .filter((key) => stats[key] < 20)
      .sort((a, b) => stats[a] - stats[b])[0];
    if (!candidate) break;
    stats[candidate] += 1;
    total += 1;
  }

  while (total > 44) {
    const candidate = keys
      .filter((key) => stats[key] > 3)
      .sort((a, b) => stats[b] - stats[a])[0];
    if (!candidate) break;
    stats[candidate] -= 1;
    total -= 1;
  }

  return stats;
}

function normalizeCharacter(rawCharacter = {}) {
  const normalized = {
    avatar: closestOption(rawCharacter.avatar, AVATAR_OPTIONS, '🧙'),
    characterName: (rawCharacter.characterName || 'Adventurer').toString().trim().slice(0, 40),
    className: closestOption(rawCharacter.className, CLASS_OPTIONS, 'Fighter'),
    race: closestOption(rawCharacter.race, RACE_OPTIONS, 'Human'),
    level: clampNumber(rawCharacter.level, 1, 20, 1),
    hp: clampNumber(rawCharacter.hp, 8, 120, 20),
    backstory: (rawCharacter.backstory || '').toString().trim().slice(0, 600),
    equipment: closestOption(rawCharacter.equipment, EQUIPMENT_OPTIONS, 'Balanced Kit'),
    stats: normalizeStats(rawCharacter.stats || {})
  };

  if (!normalized.characterName) normalized.characterName = 'Adventurer';
  return normalized;
}

function normalizeRoomSnapshot(rawRoom = {}) {
  const portableState = rawRoom && typeof rawRoom.portableState === 'object'
    ? rawRoom.portableState
    : rawRoom;

  return {
    kind: 'room',
    roomType: closestOption(rawRoom.roomType, ROOM_TYPES, 'Village'),
    dmName: (rawRoom.dmName || 'Dungeon Master').toString().trim().slice(0, 40) || 'Dungeon Master',
    roomPassword: (rawRoom.roomPassword || 'adventure').toString().trim().slice(0, 40) || 'adventure',
    // Environment events and encounter outcomes carry forward; no chat or decisions
    environment: Array.isArray(portableState.environment) ? portableState.environment.slice(0, 50) : [],
    encounters: Array.isArray(portableState.encounters) ? portableState.encounters.slice(0, 100) : []
  };
}

function formatNormalizationLine(field, original, normalized) {
  const from = original === undefined || original === null || original === '' ? '(empty)' : String(original);
  const to = normalized === undefined || normalized === null || normalized === '' ? '(empty)' : String(normalized);
  if (from === to) return `${field}: kept "${to}"`;
  return `${field}: "${from}" -> "${to}"`;
}

function queueNormalizationReport(title, lines) {
  pendingNormalizationLines.push(`[${title}]`);
  lines.forEach((line) => pendingNormalizationLines.push(line));
}

function buildRoomNormalizationLines(rawRoom, normalizedRoom) {
  return [
    formatNormalizationLine('roomType', rawRoom?.roomType, normalizedRoom.roomType),
    formatNormalizationLine('dmName', rawRoom?.dmName, normalizedRoom.dmName),
    formatNormalizationLine('roomPassword', rawRoom?.roomPassword, normalizedRoom.roomPassword),
    `environment events: ${normalizedRoom.environment.length} carried forward`,
    `encounter records: ${normalizedRoom.encounters.length} carried forward`
  ];
}

function buildCharacterNormalizationLines(rawCharacter, normalizedCharacter) {
  const lines = [
    formatNormalizationLine('avatar', rawCharacter?.avatar, normalizedCharacter.avatar),
    formatNormalizationLine('characterName', rawCharacter?.characterName, normalizedCharacter.characterName),
    formatNormalizationLine('className', rawCharacter?.className, normalizedCharacter.className),
    formatNormalizationLine('race', rawCharacter?.race, normalizedCharacter.race),
    formatNormalizationLine('level', rawCharacter?.level, normalizedCharacter.level),
    formatNormalizationLine('hp', rawCharacter?.hp, normalizedCharacter.hp),
    formatNormalizationLine('equipment', rawCharacter?.equipment, normalizedCharacter.equipment),
    formatNormalizationLine('backstory', rawCharacter?.backstory, normalizedCharacter.backstory)
  ];

  ['might', 'agility', 'endurance', 'intellect', 'intuition', 'presence'].forEach((key) => {
    lines.push(formatNormalizationLine(`stats.${key}`, rawCharacter?.stats?.[key], normalizedCharacter.stats[key]));
  });

  return lines;
}

function updateStatsSummary() {
  if (!statsSummary) return;
  const stats = getStatValues();
  const sum = Object.values(stats).reduce((total, value) => total + value, 0);
  if (statMightValue) statMightValue.textContent = String(stats.might);
  if (statAgilityValue) statAgilityValue.textContent = String(stats.agility);
  if (statEnduranceValue) statEnduranceValue.textContent = String(stats.endurance);
  if (statIntellectValue) statIntellectValue.textContent = String(stats.intellect);
  if (statIntuitionValue) statIntuitionValue.textContent = String(stats.intuition);
  if (statPresenceValue) statPresenceValue.textContent = String(stats.presence);
  statsSummary.textContent = `Stat points used: ${sum} / 44`;
  statsSummary.style.color = sum === 44 ? '#7ab0d0' : '#f0c060';
}

function updateSliderSummaries() {
  if (charLevelValue && charLevelInput) {
    charLevelValue.textContent = String(Number(charLevelInput.value || 1));
  }
  if (charHPValue && charHPInput) {
    charHPValue.textContent = String(Number(charHPInput.value || 20));
  }
}

function downloadTxtFile(filename, payload) {
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function requestCampaignExport() {
  if (!isDM) {
    displayError('Only the DM can export room snapshots.');
    return;
  }
  socket.emit('room:export:campaign');
}

function exportCharacterFromRoom() {
  const source = myCharacter || normalizeCharacter({
    avatar: myAvatar,
    characterName: myUsername,
    className: charClassInput?.value,
    race: charRaceInput?.value,
    level: charLevelInput?.value,
    hp: charHPInput?.value,
    backstory: charBackstoryInput?.value,
    equipment: charEquipmentInput?.value,
    stats: getStatValues()
  });

  const character = normalizeCharacter(source);
  // Read latest inventory from tab-scoped runtime storage
  let inventory = [...myInventory];
  const storedInventory = readStoredJson(RUNTIME_STORAGE_KEYS.inventory, null);
  if (Array.isArray(storedInventory)) inventory = storedInventory;

  // Export: identity + stats + inventory only — no chat, no decisions, no backstory
  const payload = {
    kind: 'character',
    character: {
      avatar: character.avatar,
      characterName: character.characterName,
      className: character.className,
      race: character.race,
      level: character.level,
      hp: character.hp,
      stats: character.stats,
      equipment: character.equipment
    },
    inventory
  };
  const safeName = (character.characterName || 'adventurer').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  downloadTxtFile(`${safeName || 'adventurer'}-character.txt`, payload);
  addMessage('Character snapshot exported.', 'system');
}

async function copyRoomCode() {
  const code = (myRoomId || joinRoomIdInput?.value || '').trim();
  if (!code) {
    displayError('No room code available to copy.');
    return;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(code);
    } else {
      const temp = document.createElement('input');
      temp.value = code;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
    }
    if (createdRoomCode) {
      createdRoomCode.textContent = `Room started: ${code} (copied)`;
      createdRoomCode.classList.remove('hidden');
    }
  } catch (err) {
    displayError('Unable to copy room code.');
  }
}

function applyCharacterToForm(character) {
  if (!character) return;
  if (joinAvatarSelect) joinAvatarSelect.value = character.avatar || '🧙';
  if (charNameInput) charNameInput.value = character.characterName || '';
  if (charClassInput) charClassInput.value = character.className || '';
  if (charRaceInput) charRaceInput.value = character.race || '';
  if (charLevelInput) charLevelInput.value = character.level || '';
  if (charHPInput) charHPInput.value = character.hp || '';
  if (charBackstoryInput) charBackstoryInput.value = character.backstory || '';
  if (charEquipmentInput) charEquipmentInput.value = character.equipment || '';
  if (statMightInput) statMightInput.value = character.stats?.might ?? '';
  if (statAgilityInput) statAgilityInput.value = character.stats?.agility ?? '';
  if (statEnduranceInput) statEnduranceInput.value = character.stats?.endurance ?? '';
  if (statIntellectInput) statIntellectInput.value = character.stats?.intellect ?? '';
  if (statIntuitionInput) statIntuitionInput.value = character.stats?.intuition ?? '';
  if (statPresenceInput) statPresenceInput.value = character.stats?.presence ?? '';
  updateSliderSummaries();
  updateStatsSummary();
}

function collectCharacterFromInputs() {
  const derivedAvatar = CLASS_AVATAR_MAP[charClassInput?.value] || myAvatar || '🧙';
  const character = {
    avatar: derivedAvatar,
    characterName: charNameInput?.value.trim() || '',
    className: charClassInput?.value || '',
    race: charRaceInput?.value || '',
    level: Number(charLevelInput?.value || 0),
    hp: Number(charHPInput?.value || 0),
    backstory: charBackstoryInput?.value.trim() || '',
    equipment: charEquipmentInput?.value || '',
    stats: getStatValues()
  };

  if (!character.characterName || !character.className || !character.race) {
    return { valid: false, message: 'Character name, class, and race are required.' };
  }
  if (character.level < 1 || character.hp < 1) {
    return { valid: false, message: 'Level and HP must be at least 1.' };
  }

  const statValidation = validateStats(character.stats);
  if (!statValidation.valid) return { valid: false, message: statValidation.message };

  return { valid: true, character };
}

async function parseTxtSnapshot(file) {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Snapshot file must contain valid JSON text.');
  }
}
 
// ─── Update User Roster ───────────────────────────────────────────────────────
function updateUserRoster(users) {
  if (!userRoster) return;
  
  userRoster.innerHTML = '';
  users.forEach((participant, index) => {
    const username = participant?.username || 'Unknown';
    const avatar = participant?.avatar || '🧙';
    const className = participant?.className || 'Adventurer';
    const race = participant?.race || 'Unknown';
    const level = Number(participant?.level || 1);
    const isDmRow = Boolean(participant?.isDM);
    const actionSelected = Boolean(participant?.actionSelected);
    const hasRolled = Boolean(participant?.hasRolled);
    const leading = isDmRow ? '✦' : avatar;
    const statusBadges = [
      actionSelected ? '<span class="roster-state roster-state--ready">ACTION</span>' : '',
      hasRolled ? '<span class="roster-state roster-state--rolled">ROLLED</span>' : ''
    ].join('');
    const roleMeta = isDmRow ? 'DM' : `${className} • ${race} • Lv ${level}`;

    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';
    userDiv.innerHTML = `
      <div class="user-item-main">${index + 1}. ${leading} ${username}</div>
      <div class="user-item-meta">${statusBadges}${roleMeta}</div>
    `;
    if (username === myUsername) {
      userDiv.classList.add('user-item--self');
    }
    userRoster.appendChild(userDiv);
  });
}

function displayError(message) {
  addMessage(`Error: ${message}`, 'error');
}
 
// ─── Start / Join ─────────────────────────────────────────────────────────────
function startRoomFromInputs() {
  const roomType = startRoomTypeInput?.value.trim() || '';
  const dmName = startDMNameInput?.value.trim() || '';
  const roomPassword = startRoomPasswordInput?.value || '';

  if (!roomType || !dmName || !roomPassword) {
    displayError('Room type, DM name, and room password are required.');
    return;
  }

  isDM = true;
  myUsername = dmName;
  myRoomType = roomType;
  myRoomPassword = roomPassword;
  socket.emit('room:start', {
    roomType,
    dmName,
    roomPassword,
    source: 'manual'
  });
  if (loadingScreen) loadingScreen.classList.remove('hidden');
}

async function importRoomFromFile() {
  const file = roomImportInput?.files?.[0];
  if (!file) {
    displayError('Select a room .txt file to import.');
    return;
  }

  try {
    const rawSnapshot = await parseTxtSnapshot(file);
    const snapshot = normalizeRoomSnapshot(rawSnapshot);
    queueNormalizationReport('Room Import Normalization', buildRoomNormalizationLines(rawSnapshot, snapshot));

    const roomType = snapshot.roomType;
    const dmName = snapshot.dmName;
    const roomPassword = snapshot.roomPassword;

    isDM = true;
    myUsername = dmName;
    myRoomType = roomType;
    myRoomPassword = roomPassword;
    // Restore DM's portable room state into tab-scoped storage so imports stay isolated per tab.
    writeStoredJson(RUNTIME_STORAGE_KEYS.roomEnv, snapshot.environment || []);
    writeStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, snapshot.encounters || []);

    socket.emit('room:start', {
      roomType,
      dmName,
      roomPassword,
      source: 'import',
      importedSnapshot: snapshot
    });
    if (loadingScreen) loadingScreen.classList.remove('hidden');
  } catch (err) {
    displayError(err.message || 'Unable to import room snapshot.');
  }
}

async function importCharacterFromFile() {
  const file = characterImportInput?.files?.[0];
  if (!file) {
    displayError('Select a character .txt file to import.');
    return;
  }

  try {
    const snapshot = await parseTxtSnapshot(file);
    const payload = snapshot.kind === 'character' ? snapshot.character : snapshot;
    if (!payload || typeof payload !== 'object') {
      displayError('Invalid character snapshot format.');
      return;
    }

    importedCharacter = normalizeCharacter(payload);
  queueNormalizationReport('Character Import Normalization', buildCharacterNormalizationLines(payload, importedCharacter));

    applyCharacterToForm(importedCharacter);
    // Restore inventory if the snapshot includes it, even when it is intentionally empty.
    const importedInventory = extractSnapshotInventory(snapshot);
    if (importedInventory) {
      myInventory = importedInventory;
      writeStoredJson(RUNTIME_STORAGE_KEYS.inventory, myInventory);
      renderInventory();
      renderTradeInventory();
    }
    addMessage(`Character imported: ${importedCharacter.characterName}. Inventory: ${myInventory.length} item(s).`, 'system');
  } catch (err) {
    displayError(err.message || 'Unable to import character snapshot.');
  }
}

function joinRoomFromInputs() {
  const roomId   = joinRoomIdInput?.value.trim() || '';
  const password = joinRoomPasswordInput?.value || '';
  const username = charNameInput?.value.trim() || '';

  if (!roomId || !username) {
    displayError('Room code and character name are required.');
    return;
  }

  const rawCharacter = {
    avatar: myAvatar,
    characterName: username,
    className: charClassInput?.value || 'Fighter',
    race: charRaceInput?.value || 'Human',
    level: Number(charLevelInput?.value || 1),
    hp: Number(charHPInput?.value || 20),
    backstory: charBackstoryInput?.value?.trim() || '',
    equipment: charEquipmentInput?.value || 'Balanced Kit',
    stats: getStatValues()
  };
  const character = importedCharacter || normalizeCharacter(rawCharacter);

  myRoomId   = roomId;
  myUsername = username;
  isDM       = false;
  myCharacter = character;

  socket.emit('room:join', { roomId, username, password, character });
  if (loadingScreen) loadingScreen.classList.remove('hidden');
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function sendMessageFromInput() {
  if (isDM) {
    displayError('DM regular chat is disabled. Use Narrate or Whisper.');
    return;
  }

  const text = messageInput.value.trim();
  if (!text) {
    displayError('Message cannot be empty.');
    return;
  }

  socket.emit('room:message', { text });
  messageInput.value = '';
}

function submitRoundAction() {
  if (isDM) return;
  const text = actionInput?.value.trim() || '';
  if (!text) {
    displayError('Describe what you want to attempt this round.');
    return;
  }
  socket.emit('round:submit-action', { text });
}
 
// ─── DnD: Dice Roll ───────────────────────────────────────────────────────────
function rollDice(die = 20) {
  if (isDM) {
    displayError('DM player-dice rolling is disabled.');
    return;
  }
  if (die !== 20) {
    displayError('Round actions use a d20 check only.');
    return;
  }
  socket.emit('round:submit-roll');
}

function advanceRound() {
  if (!isDM) {
    displayError('Only the DM can advance rounds.');
    return;
  }
  socket.emit('room:advance-round');
}
 
// ─── Trade Item ───────────────────────────────────────────────────────────────
function triggerTrade() {
  const targetId = tradeTargetSelect?.value;
  if (!targetId) { displayError('Choose a player to trade with.'); return; }
  if (!selectedTradeItem) { displayError('Select an item from your inventory.'); return; }
  socket.emit('trade:item', { targetId, item: selectedTradeItem });
}

// ─── DM: Spawn NPC ────────────────────────────────────────────────────────────
function dmSpawnNPC() {
  if (!isDM) return;
  const npcType      = spawnNpcType?.value || 'utility';
  const templateId   = document.getElementById('spawn-npc-template')?.value || '';
  const npcName      = spawnNpcName?.value.trim() || '';
  const target       = spawnTarget?.value || 'all';
  socket.emit('dm:spawn', { npcType, templateId: templateId || undefined, npcName, target });
  if (spawnNpcName) spawnNpcName.value = '';
}

// ─── DM: Environment Event ────────────────────────────────────────────────────
function dmTriggerEnv() {
  if (!isDM) return;
  const eventType = envEventType?.value || 'weather';
  const detail    = envEventDetail?.value.trim() || '';
  const target    = envTarget?.value || 'all';
  socket.emit('dm:env', { eventType, detail, target });
  if (envEventDetail) envEventDetail.value = '';
}

// ─── DnD: DM Narrate ──────────────────────────────────────────────────────────
function sendNarration() {
  const text = narrateInput.value.trim();
  if (!text) return;
  socket.emit('game:narrate', { text });
  narrateInput.value = '';
}

// ─── WebRTC: Create a peer connection to a new player ────────────────────────
function createPeerConnection(targetId) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnections[targetId] = pc;
 
  // Send ICE candidates to the other peer via the server
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('webrtc:ice-candidate', { targetId, candidate });
    }
  };
 
  // When the remote side opens a DataChannel (they initiated)
  pc.ondatachannel = ({ channel }) => {
    setupDataChannel(channel, targetId);
  };
 
  return pc;
}
 
// ─── WebRTC: Wire up a DataChannel for file transfers ────────────────────────
function setupDataChannel(channel, peerId) {
  dataChannels[peerId] = channel;
  channel.binaryType = 'arraybuffer';
 
  channel.onopen = () => {
    addMessage(`Direct P2P link established with ${peerId.slice(0, 6)}…`, 'system');
  };
 
  channel.onmessage = ({ data }) => {
    // Protocol: first message is JSON metadata, rest are binary chunks
    if (typeof data === 'string') {
      const meta = JSON.parse(data);
      pendingFiles[peerId] = { name: meta.name, chunks: [], totalSize: meta.size };
    } else {
      const file = pendingFiles[peerId];
      if (!file) return;
      file.chunks.push(data);
      const received = file.chunks.reduce((n, c) => n + c.byteLength, 0);
 
      if (received >= file.totalSize) {
        // Reassemble and offer as download
        const blob = new Blob(file.chunks);
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = file.name;
        a.textContent = `Download "${file.name}"`;
        const p = document.createElement('p');
        p.className = 'msg msg--trade';
        p.appendChild(a);
        feed.appendChild(p);
        feed.scrollTop = feed.scrollHeight;
        delete pendingFiles[peerId];
      }
    }
  };
}
 
// ─── WebRTC: Initiate offer to a new peer ────────────────────────────────────
async function initiateOffer(targetId) {
  const pc      = createPeerConnection(targetId);
  const channel = pc.createDataChannel('file-trade');
  setupDataChannel(channel, targetId);
 
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('webrtc:offer', { targetId, offer });
}
 
// ─── P2P File Trade ───────────────────────────────────────────────────────────
// TODO: integrate file-send UI trigger (bind to a 'Send File' button in inventory/trade panel)
function sendFileToPeer(targetId, file) {
  const channel = dataChannels[targetId];
  if (!channel || channel.readyState !== 'open') {
    addMessage('No open P2P channel to that player yet.', 'system');
    return;
  }

  // Show loading screen
  if (loadingScreen) {
    loadingScreen.classList.remove('hidden');
  }

  // Send metadata first, then the raw file in chunks
  channel.send(JSON.stringify({ name: file.name, size: file.size }));
 
  const CHUNK = 16 * 1024; // 16 KB chunks
  let offset = 0;
  const reader = new FileReader();
 
  reader.onload = (e) => {
    channel.send(e.target.result);
    offset += e.target.result.byteLength;
    if (offset < file.size) readSlice(offset);
    else {
      addMessage(`Sent "${file.name}" to ${targetId.slice(0, 6)}…`, 'system');
      // Hide loading screen
      if (loadingScreen) {
        loadingScreen.classList.add('hidden');
      }
    }
  };
 
  function readSlice(o) {
    const slice = file.slice(o, o + CHUNK);
    reader.readAsArrayBuffer(slice);
  }
  readSlice(0);
}
 
// ─── Connection Status ──────────────────────────────────────────────────────────
function updateConnectionStatus(status) {
  if (!connectionStatus) return;
  
  connectionStatus.classList.remove('connection-status--connected', 'connection-status--disconnected', 'connection-status--reconnecting');
  const dot = connectionStatus.querySelector('.connection-dot');
  const text = connectionStatus.querySelector('.connection-text');
  
  switch (status) {
    case 'connected':
      connectionStatus.classList.add('connection-status--connected');
      text.textContent = 'Connected';
      connectionStatus.setAttribute('title', 'Connected to server');
      break;
    case 'disconnected':
      connectionStatus.classList.add('connection-status--disconnected');
      text.textContent = 'Disconnected';
      connectionStatus.setAttribute('title', 'Disconnected from server');
      break;
    case 'reconnecting':
      connectionStatus.classList.add('connection-status--reconnecting');
      text.textContent = 'Reconnecting…';
      connectionStatus.setAttribute('title', 'Attempting to reconnect to server');
      break;
  }
}
 
// ─── Socket Event Listeners ───────────────────────────────────────────────────
 
socket.on('room:joined', ({ roomId, socketId, roomMeta }) => {
  if (loadingScreen) loadingScreen.classList.add('hidden');
  myRoomId = roomId;
  if (roomMeta && roomMeta.roomType) myRoomType = roomMeta.roomType;
  joinSection.classList.add('hidden');
  chatSection.classList.remove('hidden');
  if (isDM) {
    diceSection.classList.add('hidden');
    if (actionSection) actionSection.classList.add('hidden');
    tradeSection.classList.add('hidden');
    if (avatarBox) avatarBox.classList.add('hidden');
    if (chatInputRow) chatInputRow.classList.add('hidden');
    if (inventoryBox) inventoryBox.classList.add('hidden');
    if (nextRoundBtn) nextRoundBtn.classList.remove('hidden');
    if (dmSpawnSection) dmSpawnSection.classList.remove('hidden');
    if (dmEnvSection) dmEnvSection.classList.remove('hidden');
  } else {
    diceSection.classList.remove('hidden');
    if (actionSection) actionSection.classList.remove('hidden');
    tradeSection.classList.remove('hidden');
    if (avatarBox) avatarBox.classList.remove('hidden');
    if (chatInputRow) chatInputRow.classList.remove('hidden');
    if (inventoryBox) inventoryBox.classList.remove('hidden');
    if (nextRoundBtn) nextRoundBtn.classList.add('hidden');
    if (dmSpawnSection) dmSpawnSection.classList.add('hidden');
    if (dmEnvSection) dmEnvSection.classList.add('hidden');
    initInventory(myCharacter?.equipment || 'Balanced Kit');
  }
  if (snapshotSection) snapshotSection.classList.remove('hidden');
  if (isDM) dmSection.classList.remove('hidden');
  else dmSection.classList.add('hidden');
  if (exportCampaignBtn) {
    exportCampaignBtn.classList.toggle('hidden', !isDM);
  }
  if (exportCharacterBtn) {
    exportCharacterBtn.classList.toggle('hidden', isDM);
  }
  updateAvatarDisplay();
  updateCharSummary();
  myPendingRoundAction = null;
  updateRoundActionUI();
  addMessage(`You joined room "${roomId}" as ${myUsername}.`, 'system');

  if (pendingNormalizationLines.length > 0) {
    addMessage('--- Normalization Report ---', 'system');
    pendingNormalizationLines.forEach((line) => addMessage(line, 'system'));
    addMessage('--- End Normalization Report ---', 'system');
    pendingNormalizationLines = [];
  }
});

socket.on('room:started', ({ roomId, roomType, dmName }) => {
  myRoomType = roomType || myRoomType;
  myUsername = dmName || myUsername;
  if (createdRoomCode) {
    createdRoomCode.textContent = `Room started: ${roomId} (${roomType})`;
    createdRoomCode.classList.remove('hidden');
  }
  if (copyRoomCodeBtn) copyRoomCodeBtn.classList.remove('hidden');
  if (joinRoomIdInput) joinRoomIdInput.value = roomId;
  addMessage(`DM ${dmName} started room "${roomId}".`, 'system');

  // Imported rooms already restored portable state before room:start; fresh rooms should start clean.
  if (isDM) {
    myRoomId = roomId;
    if (shouldResetPortableRoomState(roomMeta)) {
      writeStoredJson(RUNTIME_STORAGE_KEYS.roomEnv, []);
      writeStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, []);
    }
  }
});

socket.on('room:count', ({ count }) => {
  memberCount.textContent = count;
});

socket.on('room:history', (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return;
  addMessage('--- Recent room history ---', 'system');
  messages.forEach(({ from, text, isDMSender }) => {
    const label = isDMSender ? `[DM] ${from}` : from;
    const isNarration = typeof text === 'string' && text.startsWith('[Narration] ');
    const body = isNarration ? text.replace('[Narration] ', '') : text;
    addMessage(`${label}: ${body}`, isNarration ? 'narrate' : 'chat');
  });
  addMessage('--- End room history ---', 'system');
});

socket.on('server:error', ({ message }) => {
  displayError(message || 'An unknown server error occurred.');
});

socket.on('connect_error', (error) => {
  displayError(`Connection failed: ${error && error.message ? error.message : error}`);
  console.error('[CONNECT ERROR]', error);
});

socket.on('disconnect', (reason) => {
  addMessage(`Disconnected from server: ${reason}`, 'error');
});

socket.on('user:joined', ({ socketId, username }) => {
  addMessage(`${username} joined the party.`, 'system');
  // We initiate the WebRTC offer to the newcomer
  initiateOffer(socketId);
});
 
socket.on('user:left', ({ username }) => {
  addMessage(`${username} left the party.`, 'system');
});
 
socket.on('room:users', ({ users }) => {
  updateUserRoster(users);
  updateTradePlayerList(users);
  updateDmWhisperList(users);
  updateSpawnPlayerList(users);
});

socket.on('room:round', ({ roundNumber, turnUsername, phase }) => {
  const numericRound = Number(roundNumber || 1);
  const roundChanged = numericRound !== currentRoundNumber;
  currentRoundNumber = numericRound;
  currentRoundPhase = phase || 'action';

  if (roundDisplay) roundDisplay.textContent = String(numericRound);
  if (phaseDisplay) {
    phaseDisplay.textContent = {
      action: 'Action Phase',
      resolution: 'Resolution Phase',
      encounter: 'Encounter Phase',
    }[currentRoundPhase] || 'Action Phase';
  }
  if (turnDisplay) turnDisplay.textContent = turnUsername || 'No active adventurer';

  if (roundChanged) {
    myPendingRoundAction = null;
    if (actionInput) actionInput.value = '';
  }
  updateRoundActionUI();
});

socket.on('round:action:declared', ({ from, text }) => {
  if (from === myUsername) return;
  addMessage(`${from} commits: ${text}`, 'system');
});

socket.on('round:action:prompted', ({ from, text, statLabel, statValue, threshold }) => {
  if (from === myUsername) return;
  addMessage(`[Check] ${from}: roll d20 + ${statLabel} (${formatActionStatValue(statValue)}) vs ${threshold} for "${text}".`, 'system');
});

socket.on('round:action:assigned', ({ text, statKey, statLabel, statScore, statValue, threshold }) => {
  myPendingRoundAction = {
    text,
    statKey,
    statLabel,
    statScore,
    statValue,
    threshold,
    roll: null,
  };
  if (actionInput) actionInput.value = '';
  updateRoundActionUI();
  addMessage(`[Check] Roll d20 + ${statLabel} (${formatActionStatValue(statValue)}) vs ${threshold} for "${text}".`, 'system');
});

socket.on('round:action:roll:accepted', ({ text, statKey, statLabel, statScore, statValue, threshold, roll }) => {
  myPendingRoundAction = {
    text,
    statKey,
    statLabel,
    statScore,
    statValue,
    threshold,
    roll,
  };
  updateRoundActionUI();
  addMessage(`[Roll Locked] d20 ${roll} locked for "${text}". Resolution happens when the DM advances the round.`, 'roll');
});

socket.on('round:action:roll-locked', ({ from, text, roll }) => {
  if (from === myUsername) return;
  addMessage(`${from} locks in a d20 roll of ${roll} for "${text}".`, 'roll');
});

socket.on('round:actions:resolved', ({ roundNumber, results }) => {
  results.forEach((result) => {
    addMessage(formatRoundResolutionMessage({ ...result, roundNumber }), result.success ? 'system' : 'error');
  });
  myPendingRoundAction = null;
  updateRoundActionUI();
});

socket.on('room:message', ({ from, text, isDMSender }) => {
  const label = isDMSender ? `[DM] ${from}` : from;
  addMessage(`${label}: ${text}`);
});

socket.on('dm:whisper', ({ from, text }) => {
  addMessage(`🔒 [DM → you] ${escapeHtml ? escapeHtml(text) : text}`, 'narrate');
});

socket.on('room:export:campaign', ({ campaign }) => {
  if (!campaign || typeof campaign !== 'object') {
    displayError('Invalid campaign export payload.');
    return;
  }

  const portableState = campaign.portableState && typeof campaign.portableState === 'object'
    ? {
        environment: Array.isArray(campaign.portableState.environment) ? campaign.portableState.environment : [],
        encounters: Array.isArray(campaign.portableState.encounters) ? campaign.portableState.encounters : [],
      }
    : {
        environment: readStoredJson(RUNTIME_STORAGE_KEYS.roomEnv, []),
        encounters: readStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, []),
      };

  const snapshot = {
    ...campaign,
    portableState,
    exportedAt: new Date().toISOString()
  };

  const roomCode = (campaign.roomId || myRoomId || 'room').toLowerCase();
  downloadTxtFile(`${roomCode}-room.txt`, snapshot);
  addMessage('Room snapshot exported.', 'system');
});
 
// ─── DnD Game Events ──────────────────────────────────────────────────────────
 
socket.on('game:roll', ({ from, result, die }) => {
  addMessage(`🎲 ${from} rolled a d${die} — got ${result}!`, 'roll');
});
 
socket.on('game:narrate', ({ from, text }) => {
  addMessage(`📜 [DM] ${text}`, 'narrate');
});

// ─── Trade / Inventory ────────────────────────────────────────────────────────

socket.on('trade:received', ({ fromUsername, item }) => {
  myInventory.push(item);
  writeStoredJson(RUNTIME_STORAGE_KEYS.inventory, myInventory);
  renderInventory();
  renderTradeInventory();
  addMessage(`💼 ${fromUsername} traded you: ${item}`, 'trade');
});

socket.on('trade:sent', ({ toUsername, item }) => {
  let removed = false;
  myInventory = myInventory.filter(i => { if (!removed && i === item) { removed = true; return false; } return true; });
  writeStoredJson(RUNTIME_STORAGE_KEYS.inventory, myInventory);
  renderInventory();
  renderTradeInventory();
  addMessage(`💼 You sent ${item || 'an item'} to ${toUsername}.`, 'system');
});

socket.on('trade:notify', ({ fromUsername, toUsername, item }) => {
  if (isDM) addMessage(`🔔 Trade: ${fromUsername} → ${toUsername}: ${item}`, 'system');
});

// ─── DM Spawn / Environment ───────────────────────────────────────────────────

socket.on('dm:spawn:result', ({ ok, message, npcType, npcName, limits }) => {
  if (!ok) { displayError(message); return; }
  spawnLimits = limits || spawnLimits;
  updateSpawnLimitDisplay();
});

// ─── Encounter: DM View ───────────────────────────────────────────────────────
// Safely encode user-supplied strings before inserting into innerHTML
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

socket.on('encounter:start', ({ eid, npcName, npcRole, npcStats, targetSocketIds, dmName, at }) => {
  const roleLabel = { aggro: '⚔️ AGGRO', grey: '🌫️ GREY', utility: '🔧 UTILITY' }[npcRole] || npcRole;
  addMessage(
    `[ENCOUNTER STARTED] ${roleLabel} "${npcName}" | HP:${npcStats.hp} AC:${npcStats.ac} STR:${npcStats.str} DEX:${npcStats.dex} | Targets: ${targetSocketIds.length} player(s)`,
    'narrate'
  );
  // DM can force-resolve via button that appears below
  const msgBox = document.getElementById('message-feed');
  if (!msgBox) return;
  const existing = document.getElementById('dm-encounter-panel');
  if (existing) existing.remove();
  const panel = document.createElement('div');
  panel.id = 'dm-encounter-panel';
  panel.className = 'dm-encounter-panel';
  panel.innerHTML = `
    <strong>Active Encounter: "${escapeHtml(npcName)}"</strong>
    <div id="dm-encounter-roster" class="encounter-roster">Waiting for players...</div>
    <div class="encounter-force-row"></div>`;
  // Add force-resolve buttons via DOM to avoid inline event handlers (XSS prevention)
  const forceRow = panel.querySelector('.encounter-force-row');
  ['death', 'negotiate', 'flee'].forEach(outc => {
    const btn = document.createElement('button');
    btn.textContent = `Force: ${outc.charAt(0).toUpperCase() + outc.slice(1)}`;
    btn.addEventListener('click', () => dmForceResolve(eid, outc));
    forceRow.appendChild(btn);
  });
  msgBox.parentElement.insertBefore(panel, msgBox);
});

socket.on('encounter:roster', ({ eid, roster, ready }) => {
  const el = document.getElementById('dm-encounter-roster');
  if (!el) return;
  const summary = ready
    ? '<div class="roster-row"><strong>Encounter ready. Advance the round to resolve it.</strong></div>'
    : '';
  el.innerHTML = summary + roster.map((p) => {
    let rollText = 'awaiting choice';
    if (p.decision && p.check && p.check.requiresRoll && p.roll === null) {
      rollText = `awaiting d20 vs ${p.check.threshold}`;
    } else if (p.decision && p.check && p.check.requiresRoll) {
      rollText = `d20 ${p.roll} + ${p.check.statValue} = ${p.total} (${p.success ? 'success' : 'failure'})`;
    } else if (p.decision) {
      rollText = p.decision.resolutionText || 'no roll required';
    }

    return `<div class="roster-row"><span>${escapeHtml(p.username)}</span><span>${p.decision ? escapeHtml(p.decision.optionLabel) : '—'}</span><span>${rollText}</span></div>`;
  }).join('');
});

function dmForceResolve(eid, outcome) {
  socket.emit('encounter:resolve', { eid, outcome });
}

// ─── Encounter: Player Prompt Card ───────────────────────────────────────────
let activeEncounterEid = null;

socket.on('encounter:prompt', ({ eid, npcName, npcRole, npcStats, options, dmName, at }) => {
  activeEncounterEid = eid;
  const roleLabel = { aggro: '⚔️ AGGRO', grey: '🌫️ GREY', utility: '🔧 UTILITY' }[npcRole] || npcRole;
  const msgBox = document.getElementById('message-feed');
  if (!msgBox) return;

  const card = document.createElement('div');
  card.className = 'msg-card msg-card--encounter';
  card.id = `encounter-card-${eid}`;

  card.innerHTML = `
    <div class="encounter-header">${escapeHtml(roleLabel)} Encounter: <strong>${escapeHtml(npcName)}</strong></div>
    <div class="encounter-stats">HP: ${npcStats.hp} | AC: ${npcStats.ac} | STR: ${npcStats.str} | DEX: ${npcStats.dex}</div>
    <div class="encounter-actions"></div>
    <div class="encounter-roll-section" id="enc-roll-${eid}" style="display:none;">
      <label>Roll d20 (1-20): <input type="number" id="enc-roll-input-${eid}" min="1" max="20" value="10" style="width:60px;"></label>
      <button class="encounter-roll-btn" id="enc-roll-btn-${eid}">Submit Roll</button>
    </div>
    <div class="encounter-result" id="enc-result-${eid}"></div>`;
  // Add option buttons via DOM to avoid inline event handlers (XSS prevention)
  const actionsDiv = card.querySelector('.encounter-actions');
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'encounter-btn';
    btn.textContent = opt.label + (opt.reqRoll ? ' (check required)' : ' (no roll)');
    btn.addEventListener('click', () => submitEncounterDecision(eid, opt.id, opt.label));
    actionsDiv.appendChild(btn);
  });
  const rollBtn = document.getElementById(`enc-roll-btn-${eid}`);
  if (rollBtn) rollBtn.addEventListener('click', () => submitEncounterRoll(eid));

  msgBox.appendChild(card);
  msgBox.scrollTop = msgBox.scrollHeight;
});

function submitEncounterDecision(eid, optionId, optionLabel) {
  if (activeEncounterEid !== eid) return;
  socket.emit('encounter:decide', { eid, optionId, optionLabel });
  // Disable decision buttons
  const card = document.getElementById(`encounter-card-${eid}`);
  if (card) card.querySelectorAll('.encounter-btn').forEach(b => b.disabled = true);
}

socket.on('encounter:decision:ack', ({ eid, optionLabel, needsRoll, check, resolutionText }) => {
  const res = document.getElementById(`enc-result-${eid}`);
  const rollSection = document.getElementById(`enc-roll-${eid}`);
  const rollButton = rollSection ? rollSection.querySelector('button') : null;
  if (needsRoll) {
    if (rollSection) rollSection.style.display = 'block';
    if (rollButton) rollButton.disabled = false;
    if (res) {
      res.textContent = `Choice locked: ${optionLabel}. Roll d20 + ${check.statLabel} (${formatActionStatValue(check.statValue)}) vs ${check.threshold}.`;
    }
  } else {
    if (rollSection) rollSection.style.display = 'none';
    if (res) {
      res.textContent = `Choice locked: ${optionLabel}. ${resolutionText || 'No roll required.'} Resolution happens when the DM advances the round.`;
    }
  }
});

function submitEncounterRoll(eid) {
  const input = document.getElementById(`enc-roll-input-${eid}`);
  const roll = Math.max(1, Math.min(20, parseInt(input?.value || '10', 10)));
  socket.emit('encounter:roll', { eid, roll });
}

socket.on('encounter:roll:ack', ({ eid, roll, statLabel, statValue, threshold, total, success }) => {
  const res = document.getElementById(`enc-result-${eid}`);
  if (res) {
    res.textContent = `Roll locked: ${roll} + ${formatActionStatValue(statValue)} = ${total} vs ${threshold} (${success ? 'success' : 'failure'}). Resolution happens when the DM advances the round.`;
  }
  const rollSection = document.getElementById(`enc-roll-${eid}`);
  if (rollSection) rollSection.querySelector('button').disabled = true;
});

socket.on('encounter:ready', ({ eid, npcName }) => {
  const res = document.getElementById(`enc-result-${eid}`);
  if (res) {
    const baseText = res.textContent ? `${res.textContent} ` : '';
    res.textContent = `${baseText}Encounter ready. Waiting for the DM to advance the round.`.trim();
  }
  addMessage(`[Encounter Ready] ${npcName} will resolve when the DM advances the round.`, 'system');
});

// ─── Encounter: Resolution ─────────────────────────────────────────────────────
socket.on('encounter:resolved', ({ eid, outcome, flavor, roster, perPlayerLoot, at }) => {
  // Remove DM panel if present
  const dmPanel = document.getElementById('dm-encounter-panel');
  if (dmPanel) dmPanel.remove();

  activeEncounterEid = null;

  // DM saves encounter lifecycle records in tab-scoped runtime storage.
  if (isDM) {
    const enc = readStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, []);
    enc.push({ eid, outcome, at: at || new Date().toISOString() });
    writeStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, enc);
  }

  // Replace the prompt card with result
  const card = document.getElementById(`encounter-card-${eid}`);
  const outcomeEmoji = { death: '💀', negotiate: '🤝', flee: '💨', success: '✨' }[outcome] || '⚔️';

  const mySocketId = socket.id;
  const myLoot = perPlayerLoot[mySocketId] || [];
  let lootHtml = '';
  if (myLoot.length > 0) {
    lootHtml = `<div class="encounter-loot">🎁 Loot: ${myLoot.map(i => i.name).join(', ')}</div>`;
    // Add to inventory
    myLoot.forEach(item => {
      myInventory.push(item.name);
      saveInventoryToStorage();
    });
    renderInventory();
  }

  const resultHtml = `
    <div class="msg-card msg-card--encounter msg-card--resolved">
      <div class="encounter-header">${outcomeEmoji} Encounter Resolved: ${outcome.toUpperCase()}</div>
      <div class="encounter-flavor">${escapeHtml(flavor)}</div>
      ${lootHtml}
    </div>`;

  if (card) {
    card.outerHTML = resultHtml;
  } else {
    const msgBox = document.getElementById('message-feed');
    if (msgBox) { msgBox.insertAdjacentHTML('beforeend', resultHtml); msgBox.scrollTop = msgBox.scrollHeight; }
  }

  addMessage(`${outcomeEmoji} Encounter ended: ${outcome}. ${flavor}`, 'narrate');
});

// ─── Runtime storage helpers ────────────────────────────────────────────────
function saveInventoryToStorage() {
  writeStoredJson(RUNTIME_STORAGE_KEYS.inventory, myInventory);
}

socket.on('dm:env:result', ({ ok, message, eventType, limits }) => {
  if (!ok) { displayError(message); return; }
  envLimits = limits || envLimits;
  updateEnvLimitDisplay();
});

socket.on('dm:spawn:event', ({ npcType, npcName, dmName }) => {
  // Encounter prompt cards are shown via encounter:prompt; this is a no-op for players
  // DM announcement is handled by encounter:start
});

socket.on('dm:env:event', ({ eventType, detail, dmName }) => {
  const typeLabel = { weather: '🌩️ Weather Change', terrain: '🗺️ Terrain Change', event: '⚡ Environmental Event', loot: '💰 Loot Drop' }[eventType] || eventType;
  addMessage(`${typeLabel}${detail ? ': ' + detail : ''}`, 'narrate');
  // DM saves environment events in tab-scoped storage for room export.
  if (isDM && (eventType === 'weather' || eventType === 'terrain')) {
    const env = readStoredJson(RUNTIME_STORAGE_KEYS.roomEnv, []);
    env.push({ type: eventType, detail: detail || '', at: new Date().toISOString() });
    writeStoredJson(RUNTIME_STORAGE_KEYS.roomEnv, env);
  }
});

socket.on('room:spawn-limits', ({ limits }) => {
  spawnLimits = limits || {};
  updateSpawnLimitDisplay();
});

socket.on('room:env-limits', ({ limits }) => {
  envLimits = limits || {};
  updateEnvLimitDisplay();
});

function updateSpawnLimitDisplay() {
  if (!spawnLimitInfo) return;
  const parts = [];
  if (spawnLimits.spawnType) parts.push(`type locked: ${spawnLimits.spawnType}`);
  if (spawnLimits.aggroCount >= 1) parts.push('AGGRO used');
  if (spawnLimits.greyCount !== undefined) parts.push(`Grey: ${spawnLimits.greyCount}/5`);
  if (spawnLimits.utilityCount !== undefined) parts.push(`Utility: ${spawnLimits.utilityCount}/5`);
  spawnLimitInfo.textContent = parts.length ? `(${parts.join(', ')})` : '';
}

function updateEnvLimitDisplay() {
  if (!envLimitInfo) return;
  const parts = [];
  if (envLimits.weatherChanged) parts.push('weather used');
  if (envLimits.lootDropTotal !== undefined) parts.push(`loot: ${envLimits.lootDropTotal} dropped`);
  envLimitInfo.textContent = parts.length ? `(${parts.join(', ')})` : '';
}
 
// ─── WebRTC Signaling ─────────────────────────────────────────────────────────
 
socket.on('webrtc:offer', async ({ fromId, offer }) => {
  const pc = createPeerConnection(fromId);
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('webrtc:answer', { targetId: fromId, answer });
});
 
socket.on('webrtc:answer', async ({ fromId, answer }) => {
  const pc = peerConnections[fromId];
  if (pc) await pc.setRemoteDescription(answer);
});
 
socket.on('webrtc:ice-candidate', async ({ fromId, candidate }) => {
  const pc = peerConnections[fromId];
  if (pc) await pc.addIceCandidate(candidate);
});
 
// ─── Key bindings ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.activeElement === messageInput) sendMessageFromInput();
    if (document.activeElement === actionInput) submitRoundAction();
    if (document.activeElement === narrateInput)  sendNarration();
  }
});
 