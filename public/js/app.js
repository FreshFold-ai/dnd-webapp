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
let avatarBox, roundDisplay, turnDisplay, nextRoundBtn;
let inventoryBox, inventoryList, tradeInventoryButtons, tradeTargetSelect, tradeSelectedItem;
let dmSpawnSection, dmEnvSection, spawnLimitInfo, envLimitInfo;
let spawnNpcType, spawnNpcName, spawnTarget, envEventType, envEventDetail, envTarget;

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
const AVATAR_OPTIONS = ['🧙', '⚔️', '🏹', '🗡️', '🛡️', '🌿'];

const CLASS_AVATAR_MAP = {
  Fighter: '⚔️', Rogue: '🗡️', Wizard: '🧙', Cleric: '🛡️',
  Ranger: '🏹', Paladin: '🛡️', Warlock: '🧙', Bard: '🌿', Druid: '🌿', Monk: '⚔️'
};

const KIT_INVENTORIES = {
  'Balanced Kit':  ['Shortsword', 'Shortbow', 'Rope (50ft)', 'Torch', 'Rations (3 days)'],
  'Frontline Kit': ['Longsword', 'Heavy Armor', 'Shield', 'Health Potion'],
  'Scout Kit':     ['Longbow', 'Light Armor', 'Rope (50ft)', 'Grappling Hook', 'Rations (3 days)'],
  'Caster Kit':    ['Arcane Staff', 'Spellbook', 'Arcane Focus', 'Magic Reagents'],
  'Survival Kit':  ['Hooded Cloak', 'Rations (5 days)', 'Trap Tools', 'Hunting Knife'],
  'Noble Kit':     ['Fine Attire', 'Signet Ring', 'Coin Purse', 'Fine Wine']
};

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
  snapshotSection = document.getElementById('snapshot-section');
  exportCampaignBtn = document.getElementById('export-campaign-btn');
  exportCharacterBtn = document.getElementById('export-character-btn');
  avatarBox = document.getElementById('avatar-box');
  roundDisplay = document.getElementById('round-display');
  turnDisplay = document.getElementById('turn-display');
  nextRoundBtn = document.getElementById('next-round-btn');
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

  if (avatarSelect) {
    avatarSelect.addEventListener('change', () => {
      myAvatar = avatarSelect.value || myAvatar;
      updateAvatarDisplay();
    });
  }

  // Auto-derive avatar emoji when class changes on join form
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

  updateSliderSummaries();
  updateStatsSummary();
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
  const avatar = myAvatar || avatarSelect?.value || '🧙';
  myAvatar = avatar;
  if (!avatarDisplay) return;

  avatarDisplay.textContent = avatar;
  avatarDisplay.classList.remove('hidden');
}

// ─── Inventory Helpers ────────────────────────────────────────────────────────
function initInventory(equipment) {
  // Load saved inventory from localStorage, or start from kit
  try {
    const stored = localStorage.getItem('dnd_inventory');
    if (stored) { myInventory = JSON.parse(stored); }
    else { myInventory = [...(KIT_INVENTORIES[equipment] || ["Adventurer's Pack"])]; }
  } catch(e) {
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
    const div = document.createElement('div');
    div.className = 'inv-item';
    div.textContent = item;
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
    const btn = document.createElement('button');
    btn.className = 'trade-item-btn';
    btn.textContent = item;
    btn.onclick = () => {
      document.querySelectorAll('.trade-item-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTradeItem = item;
      if (tradeSelectedItem) tradeSelectedItem.textContent = `Selected: ${item}`;
    };
    tradeInventoryButtons.appendChild(btn);
  });
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
  return {
    kind: 'room',
    roomType: closestOption(rawRoom.roomType, ROOM_TYPES, 'Village'),
    dmName: (rawRoom.dmName || 'Dungeon Master').toString().trim().slice(0, 40) || 'Dungeon Master',
    roomPassword: (rawRoom.roomPassword || 'adventure').toString().trim().slice(0, 40) || 'adventure',
    // Environment events and encounter outcomes carry forward; no chat or decisions
    environment: Array.isArray(rawRoom.environment) ? rawRoom.environment.slice(0, 50) : [],
    encounters: Array.isArray(rawRoom.encounters) ? rawRoom.encounters.slice(0, 100) : []
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
  // Fully client-side — no chat, no decisions, only portable room state
  let environment = [];
  let encounters = [];
  try { environment = JSON.parse(localStorage.getItem('dnd_room_env') || '[]'); } catch(e) {}
  try { encounters = JSON.parse(localStorage.getItem('dnd_room_encounters') || '[]'); } catch(e) {}

  const snapshot = {
    kind: 'room',
    roomType: myRoomType || '',
    dmName: myUsername || '',
    roomPassword: myRoomPassword || '',
    environment,   // [ { type, detail, at } ] — weather/terrain state only
    encounters,    // [ { npcName, npcRole, outcome, at } ] — lifecycle records only
    exportedAt: new Date().toISOString()
  };
  const roomCode = (myRoomId || 'room').toLowerCase();
  downloadTxtFile(`${roomCode}-room.txt`, snapshot);
  addMessage('Room snapshot exported.', 'system');
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
  // Read latest inventory from localStorage
  let inventory = [...myInventory];
  try {
    const stored = localStorage.getItem('dnd_inventory');
    if (stored) inventory = JSON.parse(stored);
  } catch(e) {}

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
    // Restore DM's portable room state to localStorage so it carries into the new room
    try { localStorage.setItem('dnd_room_env', JSON.stringify(snapshot.environment || [])); } catch(e) {}
    try { localStorage.setItem('dnd_room_encounters', JSON.stringify(snapshot.encounters || [])); } catch(e) {}

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
    // Restore inventory if the snapshot includes it
    if (Array.isArray(snapshot.inventory) && snapshot.inventory.length > 0) {
      myInventory = snapshot.inventory.map(i => String(i).trim()).filter(Boolean);
      try { localStorage.setItem('dnd_inventory', JSON.stringify(myInventory)); } catch(e) {}
      renderInventory();
      renderTradeInventory();
    }
    addMessage(`Character imported: ${importedCharacter.characterName}. Inventory: ${myInventory.length} item(s).`, 'system');
  } catch (err) {
    displayError(err.message || 'Unable to import character snapshot.');
  }
}

function joinRoomFromInputs() {
  const roomId = joinRoomIdInput?.value.trim() || '';
  const roomPassword = joinRoomPasswordInput?.value || '';
  if (!roomId || !roomPassword) {
    displayError('Room code and room password are required.');
    return;
  }

  const characterResult = collectCharacterFromInputs();
  if (!characterResult.valid) {
    displayError(characterResult.message);
    return;
  }

  const character = characterResult.character;
 
  myRoomId   = roomId;
  myRoomPassword = roomPassword;
  myUsername = character.characterName;
  myAvatar   = character.avatar;
  myCharacter = character;
  isDM = false;
  initInventory(character.equipment);
 
  updateAvatarDisplay();
  socket.emit('room:join', {
    roomId,
    roomPassword,
    username: character.characterName,
    character
  });
  if (loadingScreen) loadingScreen.classList.remove('hidden');
}

// ─── Go Back to Join Screen ──────────────────────────────────────────────────
// TODO: implement back-navigation (socket leave event, state reset, confirm dialog)
function goBackToJoin() {
  chatSection.classList.add('hidden');
  joinSection.classList.remove('hidden');
  diceSection.classList.add('hidden');
  tradeSection.classList.add('hidden');
  if (snapshotSection) snapshotSection.classList.add('hidden');
  if (nextRoundBtn) nextRoundBtn.classList.add('hidden');
  if (avatarBox) avatarBox.classList.remove('hidden');
  dmSection.classList.add('hidden');
  // Optionally emit leave room or reset state
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function sendMessageFromInput() {
  const text = messageInput.value.trim();
  if (!text) {
    displayError('Message cannot be empty.');
    return;
  }
  socket.emit('room:message', { text });
  messageInput.value = '';
}
 
// ─── DnD: Dice Roll ───────────────────────────────────────────────────────────
function rollDice(die = 20) {
  if (isDM) {
    displayError('DM player-dice rolling is disabled.');
    return;
  }
  const result = Math.floor(Math.random() * die) + 1;
  socket.emit('game:roll', { result, die });
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
    tradeSection.classList.add('hidden');
    if (avatarBox) avatarBox.classList.add('hidden');
    if (inventoryBox) inventoryBox.classList.add('hidden');
    if (nextRoundBtn) nextRoundBtn.classList.remove('hidden');
    if (dmSpawnSection) dmSpawnSection.classList.remove('hidden');
    if (dmEnvSection) dmEnvSection.classList.remove('hidden');
  } else {
    diceSection.classList.remove('hidden');
    tradeSection.classList.remove('hidden');
    if (avatarBox) avatarBox.classList.remove('hidden');
    if (inventoryBox) inventoryBox.classList.remove('hidden');
    if (nextRoundBtn) nextRoundBtn.classList.add('hidden');
    if (dmSpawnSection) dmSpawnSection.classList.add('hidden');
    if (dmEnvSection) dmEnvSection.classList.add('hidden');
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
  if (avatarSelect) {
    avatarSelect.value = myAvatar || avatarSelect.value;
  }
  updateAvatarDisplay();
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

  // Save room identity; if source was 'import' the env/encounter logs were already restored
  // For fresh rooms, clear any stale logs from a previous session
  if (isDM) {
    const wasImport = (myRoomId && myRoomId !== roomId); // heuristic: new roomId = fresh start
    myRoomId = roomId;
    if (!wasImport) {
      try { localStorage.setItem('dnd_room_env', '[]'); } catch(e) {}
      try { localStorage.setItem('dnd_room_encounters', '[]'); } catch(e) {}
    }
  }
});

socket.on('room:count', ({ count }) => {
  memberCount.textContent = count;
});

socket.on('room:round', ({ roundNumber, turnUsername }) => {
  if (roundDisplay) roundDisplay.textContent = String(roundNumber || 1);
  if (turnDisplay) turnDisplay.textContent = turnUsername || 'No active adventurer';
});

socket.on('room:users', ({ users }) => {
  updateUserRoster(users);
  updateTradePlayerList(users);
  updateSpawnPlayerList(users);
});
 
socket.on('room:history', (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return;
  addMessage('--- Recent room history ---', 'system');
  messages.forEach(({ from, text }) => {
    addMessage(`${from}: ${text}`);
  });
  addMessage('--- End room history ---', 'system');
});

socket.on('server:error', ({ message }) => {
  displayError(message || 'An unknown server error occurred.');
});

socket.on('connect_error', (error) => {
  displayError(`Connection failed: ${error && error.message ? error.message : error}`);
  console.error('[CONNECT ERROR]', error);
  updateConnectionStatus('disconnected');
});

socket.on('disconnect', (reason) => {
  addMessage(`Disconnected from server: ${reason}`, 'error');
  updateConnectionStatus('disconnected');
});

socket.on('connect', () => {
  updateConnectionStatus('connected');
  addMessage('Connected to server.', 'system');
});

socket.on('reconnect', () => {
  updateConnectionStatus('connected');
  addMessage('Reconnected to server.', 'system');
});

socket.on('reconnect_attempt', () => {
  updateConnectionStatus('reconnecting');
  addMessage('Attempting to reconnect to server…', 'system');
});

socket.on('reconnect_error', (error) => {
  updateConnectionStatus('disconnected');
  console.error('[RECONNECT ERROR]', error);
});

socket.on('user:joined', ({ socketId, username }) => {
  addMessage(`${username} joined the party.`, 'system');
  // We initiate the WebRTC offer to the newcomer
  initiateOffer(socketId);
});
 
socket.on('user:left', ({ username }) => {
  addMessage(`${username} left the party.`, 'system');
});
 
socket.on('room:message', ({ from, text }) => {
  addMessage(`${from}: ${text}`);
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
  try { localStorage.setItem('dnd_inventory', JSON.stringify(myInventory)); } catch(e) {}
  renderInventory();
  renderTradeInventory();
  addMessage(`💼 ${fromUsername} traded you: ${item}`, 'trade');
});

socket.on('trade:sent', ({ toUsername, item }) => {
  let removed = false;
  myInventory = myInventory.filter(i => { if (!removed && i === item) { removed = true; return false; } return true; });
  try { localStorage.setItem('dnd_inventory', JSON.stringify(myInventory)); } catch(e) {}
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

socket.on('encounter:roster', ({ eid, roster }) => {
  const el = document.getElementById('dm-encounter-roster');
  if (!el) return;
  el.innerHTML = roster.map(p =>
    `<div class="roster-row"><span>${escapeHtml(p.username)}</span><span>${p.decision ? escapeHtml(p.decision.optionLabel) : '—'}</span><span>${p.roll !== null ? `d20: ${p.roll} (${escapeHtml(p.outcome)})` : 'no roll'}</span></div>`
  ).join('');
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
    btn.textContent = opt.label + (opt.roll ? ` (roll: ${opt.roll})` : '');
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
  // Show roll section
  const rollSection = document.getElementById(`enc-roll-${eid}`);
  if (rollSection) rollSection.style.display = 'block';
  // Disable decision buttons
  const card = document.getElementById(`encounter-card-${eid}`);
  if (card) card.querySelectorAll('.encounter-btn').forEach(b => b.disabled = true);
}

socket.on('encounter:decision:ack', ({ eid }) => {
  const res = document.getElementById(`enc-result-${eid}`);
  if (res) res.textContent = '✓ Decision submitted. Now roll!';
});

function submitEncounterRoll(eid) {
  const input = document.getElementById(`enc-roll-input-${eid}`);
  const roll = Math.max(1, Math.min(20, parseInt(input?.value || '10', 10)));
  socket.emit('encounter:roll', { eid, roll });
}

socket.on('encounter:roll:ack', ({ eid, roll, outcome }) => {
  const res = document.getElementById(`enc-result-${eid}`);
  if (res) res.textContent = `You rolled ${roll} — ${outcome === 'hit' ? '✅ Hit!' : '❌ Miss'}`;
  const rollSection = document.getElementById(`enc-roll-${eid}`);
  if (rollSection) rollSection.querySelector('button').disabled = true;
});

// ─── Encounter: Resolution ─────────────────────────────────────────────────────
socket.on('encounter:resolved', ({ eid, outcome, flavor, roster, perPlayerLoot, at }) => {
  // Remove DM panel if present
  const dmPanel = document.getElementById('dm-encounter-panel');
  if (dmPanel) dmPanel.remove();

  activeEncounterEid = null;

  // DM saves encounter lifecycle record to localStorage (outcome only — no decisions/rolls)
  if (isDM) {
    try {
      const enc = JSON.parse(localStorage.getItem('dnd_room_encounters') || '[]');
      // Find NPC name from the roster if available
      enc.push({ eid, outcome, at: at || new Date().toISOString() });
      localStorage.setItem('dnd_room_encounters', JSON.stringify(enc));
    } catch(e) {}
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

// ─── localStorage persistence helpers ────────────────────────────────────────
function saveInventoryToStorage() {
  try { localStorage.setItem('dnd_inventory', JSON.stringify(myInventory)); } catch(e) {}
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
  // DM saves environment events to localStorage for room export (weather/terrain are portable state)
  if (isDM && (eventType === 'weather' || eventType === 'terrain')) {
    try {
      const env = JSON.parse(localStorage.getItem('dnd_room_env') || '[]');
      env.push({ type: eventType, detail: detail || '', at: new Date().toISOString() });
      localStorage.setItem('dnd_room_env', JSON.stringify(env));
    } catch(e) {}
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
    if (document.activeElement === narrateInput)  sendNarration();
  }
});
 