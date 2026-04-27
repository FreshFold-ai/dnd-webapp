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
let dmSocketId = '';          // socket ID of the DM in the current room

// partyMembers: Map<socketId, member> — local roster maintained via P2P player:announce
const partyMembers = {};

// pendingFiles: Map<socketId, { name, chunks, totalSize }> — kept for file receive reassembly
const pendingFiles = {};
 
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
// Legacy refs kept for compat; new dice-panel element refs below
let actionSection, actionInput, actionStatus, actionCheckSummary, actionSubmitBtn, actionRollBtn;
// New dice-panel refs
let dicePanelEl, diceInputPhase, diceCheckPhase, diceCheckInfo, diceFaceDisplay, diceRollBtn, diceResult;
let diceRollInterval = null;

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
  // New dice-panel refs
  dicePanelEl   = document.getElementById('dice-panel');
  diceInputPhase = document.getElementById('dice-input-phase');
  diceCheckPhase = document.getElementById('dice-check-phase');
  diceCheckInfo  = document.getElementById('dice-check-info');
  diceFaceDisplay = document.getElementById('dice-face-display');
  diceRollBtn    = document.getElementById('dice-roll-btn');
  diceResult     = document.getElementById('dice-result');
  // Re-assign shared refs to new panel equivalents
  actionSection  = dicePanelEl;
  actionInput    = document.getElementById('action-input');
  actionSubmitBtn = document.getElementById('action-submit-btn');
  actionStatus   = document.getElementById('action-status');
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
  // Show/hide entire dice panel
  if (dicePanelEl) dicePanelEl.classList.toggle('hidden', !isPlayer);
  // Hide old sections in case they still exist in DOM
  if (diceSection)  diceSection.classList.add('hidden');

  if (!isPlayer) return;

  const actionPhase = currentRoundPhase === 'action';
  const hasAssigned = Boolean(myPendingRoundAction);
  const hasRolled   = Boolean(hasAssigned && myPendingRoundAction.roll !== null && myPendingRoundAction.roll !== undefined);

  // Toggle sub-phases
  if (diceInputPhase) diceInputPhase.classList.toggle('hidden', hasAssigned);
  if (diceCheckPhase) diceCheckPhase.classList.toggle('hidden', !hasAssigned);

  // Submit button
  if (actionSubmitBtn) {
    actionSubmitBtn.disabled = !actionPhase || hasAssigned || !(actionInput?.value.trim());
  }
  // Roll button
  if (diceRollBtn) {
    diceRollBtn.disabled = !actionPhase || !hasAssigned || hasRolled;
  }

  // Status text
  if (actionStatus) {
    if (!actionPhase) {
      actionStatus.textContent = currentRoundPhase === 'encounter'
        ? 'An encounter is active. Resolve it before taking a new round action.'
        : 'Waiting for the next round to open the action phase.';
    } else if (!hasAssigned) {
      actionStatus.textContent = 'Describe one action to attempt this round.';
    } else if (!hasRolled) {
      actionStatus.textContent = `Action submitted: "${myPendingRoundAction.text}" — roll when ready.`;
    } else {
      actionStatus.textContent = `Roll locked: ${myPendingRoundAction.roll}. Waiting for round resolution.`;
    }
  }

  // Check info line
  if (diceCheckInfo) {
    if (!hasAssigned) {
      diceCheckInfo.textContent = 'Waiting for DM to assign a stat check…';
    } else {
      const bonus = myPendingRoundAction.statValue >= 0
        ? `+${formatActionStatValue(myPendingRoundAction.statValue)}`
        : formatActionStatValue(myPendingRoundAction.statValue);
      diceCheckInfo.textContent = `Roll d20 ${bonus} ${myPendingRoundAction.statLabel} vs ${myPendingRoundAction.threshold}`;
    }
  }

  // Show result only once rolled
  if (diceResult && hasRolled && myPendingRoundAction) {
    const { roll, statValue, statLabel, threshold } = myPendingRoundAction;
    const total = roll + (statValue || 0);
    const bonus = statValue >= 0 ? `+${formatActionStatValue(statValue)}` : formatActionStatValue(statValue);
    diceResult.textContent = `${roll} ${bonus} (${statLabel}) = ${total} vs ${threshold} — ${total >= threshold ? 'SUCCESS ✓' : 'FAILURE ✗'}`;
  } else if (diceResult && !hasRolled) {
    diceResult.textContent = '';
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

    // Check if this item has an equip bonus via GameCatalog
    let tagText = meta.tag;
    if (typeof GameCatalog !== 'undefined') {
      const nameToId = {};
      Object.values(GameCatalog.ITEM_TYPES).forEach(t => { nameToId[t.name] = t.id; });
      const id = nameToId[String(item).trim()];
      if (id) {
        const itemDef = GameCatalog.ITEM_TYPES[id];
        const effectDef = itemDef?.effect ? GameCatalog.EFFECT_DESCRIPTORS[itemDef.effect] : null;
        if (effectDef && effectDef.hook === 'equip' && effectDef.label) {
          tagText = effectDef.label;
        } else if (effectDef && effectDef.hook === 'on_use' && effectDef.label) {
          tagText = effectDef.label;
        }
      }
    }
    tag.textContent = tagText;

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
  P2PMesh.sendToPeer(targetId, { t: 'dm:whisper', text });
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

// (displayError is defined earlier in the file)
 
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

  P2PMesh.broadcast({ t: 'room:message', text });
  messageInput.value = '';
}

function submitRoundAction() {
  if (isDM) return;
  const text = actionInput?.value.trim() || '';
  if (!text) {
    displayError('Describe what you want to attempt this round.');
    return;
  }
  const statBonus = (typeof GameCatalog !== 'undefined' && GameCatalog.getInventoryEquipBoosts)
    ? GameCatalog.getInventoryEquipBoosts(myInventory)
    : {};
  P2PMesh.sendToPeer(dmSocketId, { t: 'round:submit-action', text, statBonus });
  // Transition UI immediately to check-phase (waiting for DM stat assignment)
  if (diceInputPhase) diceInputPhase.classList.add('hidden');
  if (diceCheckPhase) diceCheckPhase.classList.remove('hidden');
  if (diceCheckInfo)  diceCheckInfo.textContent = 'Waiting for DM to assign a stat check…';
  if (actionStatus)   actionStatus.textContent = `Action submitted: "${text}" — waiting for DM assignment.`;
  if (actionSubmitBtn) actionSubmitBtn.disabled = true;
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
  if (diceRollBtn) diceRollBtn.disabled = true;
  if (actionStatus) actionStatus.textContent = 'Rolling…';

  // Start dice face animation
  if (diceFaceDisplay) {
    diceFaceDisplay.classList.add('dice-face--rolling');
    const wrapper = diceFaceDisplay.closest('.dice-face-wrapper');
    if (wrapper) wrapper.classList.add('rolling');
    if (diceRollInterval) clearInterval(diceRollInterval);
    diceRollInterval = setInterval(() => {
      diceFaceDisplay.textContent = String(Math.floor(Math.random() * 20) + 1);
    }, 80);
  }

  P2PMesh.sendToPeer(dmSocketId, { t: 'round:submit-roll' });
}

// Stop dice animation and settle on a final value
function settleDiceRoll(roll) {
  if (diceRollInterval) { clearInterval(diceRollInterval); diceRollInterval = null; }
  if (diceFaceDisplay) {
    diceFaceDisplay.textContent = String(roll);
    diceFaceDisplay.classList.remove('dice-face--rolling');
    const wrapper = diceFaceDisplay.closest('.dice-face-wrapper');
    if (wrapper) wrapper.classList.remove('rolling');
  }
}

function advanceRound() {
  if (!isDM) {
    displayError('Only the DM can advance rounds.');
    return;
  }
  dmAdvanceRound();
}
 
// ─── DM Round Engine ──────────────────────────────────────────────────────────
// keyed by socketId → { text, statKey, statLabel, statScore, statValue, threshold, roll, username }
const dmRoundActions = {};

// Keyword → stat mapping for action classification
const ACTION_STAT_MAP = [
  { keywords: ['attack','strike','hit','fight','slash','stab','shoot','charge','bash','smash','swing'], stat: 'might' },
  { keywords: ['dodge','run','jump','climb','hide','sneak','flee','sprint','roll','tumble','dash'], stat: 'agility' },
  { keywords: ['endure','resist','hold','survive','tank','block','defend','withstand','brace'], stat: 'endurance' },
  { keywords: ['cast','spell','ritual','identify','study','analyze','investigate','decipher','read','craft'], stat: 'intellect' },
  { keywords: ['sense','detect','perceive','listen','watch','intuit','feel','search','spot'], stat: 'intuition' },
  { keywords: ['persuade','charm','intimidate','deceive','negotiate','convince','inspire','bluff','command','taunt'], stat: 'presence' },
];
const STAT_LABELS = { might: 'Might', agility: 'Agility', endurance: 'Endurance', intellect: 'Intellect', intuition: 'Intuition', presence: 'Presence' };
const ACTION_THRESHOLD = 12;

function dmPickStat(text) {
  const lower = text.toLowerCase();
  for (const { keywords, stat } of ACTION_STAT_MAP) {
    if (keywords.some(k => lower.includes(k))) return stat;
  }
  return 'might';
}

// DM receives a player's declared action text → assign stat check, broadcast declaration
P2PMesh.on('round:submit-action', ({ text, statBonus, _from }) => {
  if (!isDM) return;
  const member = partyMembers[_from];
  if (!member) return;
  const username = member.username;
  const stats = member.character?.stats || {};
  const statKey   = dmPickStat(text);
  const statLabel = STAT_LABELS[statKey];
  const statScore = Number(stats[statKey] || 10);
  const baseMod   = Math.floor((statScore - 10) / 2);
  // Apply any equip bonus the player reported
  const itemBonus = (statBonus && typeof statBonus[statKey] === 'number') ? statBonus[statKey] : 0;
  const statValue = baseMod + itemBonus;
  const threshold = ACTION_THRESHOLD;

  dmRoundActions[_from] = { text, statKey, statLabel, statScore, statValue, threshold, roll: null, username };

  // Broadcast declaration to all (including DM's own feed via local call below)
  P2PMesh.broadcast({ t: 'round:action:declared', from: username, text });
  addMessage(`${username} commits: ${text}${itemBonus ? ` (item bonus +${itemBonus} ${statLabel})` : ''}`, 'system');

  // Broadcast prompted check to all observers
  P2PMesh.broadcast({ t: 'round:action:prompted', from: username, text, statLabel, statValue, threshold });

  // Tell the acting player their assigned stat check
  P2PMesh.sendToPeer(_from, { t: 'round:action:assigned', text, statKey, statLabel, statScore, statValue, threshold });
});

// DM receives player's roll trigger → generate authoritative roll, ack to player, tell all
P2PMesh.on('round:submit-roll', ({ _from }) => {
  if (!isDM) return;
  const entry = dmRoundActions[_from];
  if (!entry || entry.roll !== null) return; // already rolled
  const roll = Math.floor(Math.random() * 20) + 1;
  entry.roll = roll;

  P2PMesh.sendToPeer(_from, {
    t: 'round:action:roll:accepted',
    text: entry.text,
    statKey: entry.statKey,
    statLabel: entry.statLabel,
    statScore: entry.statScore,
    statValue: entry.statValue,
    threshold: entry.threshold,
    roll,
  });
  P2PMesh.broadcast({ t: 'round:action:roll-locked', from: entry.username, text: entry.text, roll });
  addMessage(`${entry.username} locks in a d20 roll of ${roll} for "${entry.text}".`, 'roll');
});

// DM advances the round: resolve all pending actions, broadcast results, bump round number
function dmAdvanceRound() {
  const roundNumber = currentRoundNumber;

  // Soft-block: warn if any player submitted an action but hasn't rolled yet
  const pendingRolls = Object.values(dmRoundActions).filter(e => e.roll === null);
  if (pendingRolls.length > 0) {
    const names = pendingRolls.map(e => e.username).join(', ');
    addMessage(`⚠️ [DM] Still waiting for roll(s) from: ${names}. Advancing anyway — unrolled actions get a random d20.`, 'system');
  }

  const results = Object.entries(dmRoundActions).map(([sid, entry]) => {
    const roll = entry.roll ?? Math.floor(Math.random() * 20) + 1;
    const total = roll + entry.statValue;
    const success = total >= entry.threshold;
    const resolutionText = success
      ? `${entry.username} succeeds with a ${total}!`
      : `${entry.username} fails with a ${total}.`;
    return {
      actor: entry.username,
      text: entry.text,
      statKey: entry.statKey,
      statLabel: entry.statLabel,
      statScore: entry.statScore,
      statValue: entry.statValue,
      threshold: entry.threshold,
      roll,
      total,
      success,
      resolutionText,
      roundNumber,
    };
  });

  // Clear actions for next round
  Object.keys(dmRoundActions).forEach(k => delete dmRoundActions[k]);

  const nextRound = roundNumber + 1;
  currentRoundNumber = nextRound;
  currentRoundPhase = 'action';

  // Broadcast results to all peers
  P2PMesh.broadcast({ t: 'round:actions:resolved', roundNumber, results });
  // Broadcast new round state
  P2PMesh.broadcast({ t: 'room:round', roundNumber: nextRound, turnUsername: '', phase: 'action' });

  // Apply locally on DM's own display
  results.forEach(result => {
    addMessage(formatRoundResolutionMessage({ ...result, roundNumber }), result.success ? 'system' : 'error');
  });
  if (roundDisplay) roundDisplay.textContent = String(nextRound);
  if (phaseDisplay) phaseDisplay.textContent = 'Action Phase';
  if (turnDisplay) turnDisplay.textContent = 'No active adventurer';
  updateRoundActionUI();
}

// ─── Trade Item ───────────────────────────────────────────────────────────────
function triggerTrade() {
  const targetId = tradeTargetSelect?.value;
  if (!targetId) { displayError('Choose a player to trade with.'); return; }
  if (!selectedTradeItem) { displayError('Select an item from your inventory.'); return; }
  P2PMesh.sendToPeer(targetId, { t: 'trade:item', item: selectedTradeItem });
  // Also CC the DM so they can observe the trade
  if (dmSocketId && dmSocketId !== socket.id && dmSocketId !== targetId) {
    P2PMesh.sendToPeer(dmSocketId, { t: 'trade:item', item: selectedTradeItem, _observedBy: 'dm', _targetId: targetId });
  }
  // Local sender confirmation
  const toUsername = partyMembers[targetId]?.username || targetId;
  let removed = false;
  myInventory = myInventory.filter(i => { if (!removed && i === selectedTradeItem) { removed = true; return false; } return true; });
  writeStoredJson(RUNTIME_STORAGE_KEYS.inventory, myInventory);
  renderInventory();
  renderTradeInventory();
  addMessage(`💼 You sent ${selectedTradeItem || 'an item'} to ${toUsername}.`, 'system');
}

// ─── DM: Spawn NPC ────────────────────────────────────────────────────────────
function dmSpawnNPC() {
  if (!isDM) return;
  const npcType      = spawnNpcType?.value || 'utility';
  const templateId   = document.getElementById('spawn-npc-template')?.value || '';
  const npcName      = spawnNpcName?.value.trim() || '';
  const target       = spawnTarget?.value || 'all';
  P2PMesh.broadcast({ t: 'dm:spawn', npcType, templateId: templateId || undefined, npcName, target });
  // Run the encounter engine locally (DM is authoritative)
  dmStartEncounter({ npcType, templateId: templateId || undefined, npcName, target });
  if (spawnNpcName) spawnNpcName.value = '';
}

// ─── DM: Environment Event ────────────────────────────────────────────────────
function dmTriggerEnv() {
  if (!isDM) return;
  const eventType = envEventType?.value || 'weather';
  const detail    = envEventDetail?.value.trim() || '';
  const target    = envTarget?.value || 'all';
  P2PMesh.broadcast({ t: 'dm:env', eventType, detail, target });
  // DM saves environment events in tab-scoped storage for room export.
  if (eventType === 'weather' || eventType === 'terrain') {
    const env = readStoredJson(RUNTIME_STORAGE_KEYS.roomEnv, []);
    env.push({ type: eventType, detail: detail || '', at: new Date().toISOString() });
    writeStoredJson(RUNTIME_STORAGE_KEYS.roomEnv, env);
  }
  if (envEventDetail) envEventDetail.value = '';
}

// --- DM Encounter Engine ---
let activeEncounter = null; // { eid, npc, targetSocketIds, roster, resolvedName, seed }

function dmPickTemplate(npcType, templateId) {
  const { NPC_TEMPLATES } = GameCatalog;
  if (templateId && NPC_TEMPLATES[templateId]) return NPC_TEMPLATES[templateId];
  const matches = Object.values(NPC_TEMPLATES).filter(t => t.role === npcType);
  if (matches.length) return matches[Math.floor(Math.random() * matches.length)];
  return NPC_TEMPLATES.goblin_scout;
}

function dmStartEncounter({ npcType, templateId, npcName, target }) {
  if (!isDM) return;
  const npc = dmPickTemplate(npcType, templateId);
  const eid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const at  = new Date().toISOString();
  const dmName = myUsername;

  const allPlayers = Object.values(partyMembers).filter(m => !m.isDM);
  const targetSocketIds = target === 'all'
    ? allPlayers.map(m => m.socketId)
    : [target].filter(sid => partyMembers[sid] && !partyMembers[sid].isDM);

  const npcStats = { hp: npc.hp, ac: npc.ac, str: npc.str, dex: npc.dex };
  const resolvedName = npcName || npc.name;
  const seed = parseInt(eid.replace(/\D/g, '').slice(0, 8), 10) || Date.now();
  const options = GameCatalog.getOptionsForEncounter(npc.role, seed);

  const roster = targetSocketIds.map(sid => ({
    socketId: sid,
    username: partyMembers[sid]?.username || sid,
    decision: null, check: null, roll: null, total: null, success: null,
  }));

  activeEncounter = { eid, npc, targetSocketIds, roster, resolvedName, seed };

  // Save to encounter storage
  const enc = readStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, []);
  enc.push({ eid, npcName: resolvedName, npcType: npc.role, at });
  writeStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, enc);

  const roleLabel = { aggro: '\u2694\ufe0f AGGRO', grey: '\ud83c\udf2b\ufe0f GREY', utility: '\ud83d\udd27 UTILITY' }[npc.role] || npc.role;
  P2PMesh.broadcast({ t: 'encounter:start', eid, npcName: resolvedName, npcRole: npc.role, npcStats, targetSocketIds, dmName, at });
  addMessage(`[ENCOUNTER STARTED] ${roleLabel} "${resolvedName}" | HP:${npc.hp} AC:${npc.ac} | ${targetSocketIds.length} target(s)`, 'narrate');
  // DM builds its panel locally (does not receive its own broadcast)
  buildDmEncounterPanel(eid, resolvedName);

  targetSocketIds.forEach(sid => {
    P2PMesh.sendToPeer(sid, { t: 'encounter:prompt', eid, npcName: resolvedName, npcRole: npc.role, npcStats, options, dmName, at });
  });
}

P2PMesh.on('encounter:decide', ({ eid, optionId, optionLabel, _from }) => {
  if (!isDM || !activeEncounter || activeEncounter.eid !== eid) return;
  const entry = activeEncounter.roster.find(r => r.socketId === _from);
  if (!entry || entry.decision) return;

  const options = GameCatalog.getOptionsForEncounter(activeEncounter.npc.role, activeEncounter.seed);
  const chosenOpt = options.find(o => o.id === optionId) || { id: optionId, label: optionLabel, reqRoll: true, rollStat: 'might', difficulty: 0 };
  const needsRoll = Boolean(chosenOpt.reqRoll);

  const member = partyMembers[_from];
  const stats  = member?.character?.stats || {};
  const STAT_KEY_MAP = { atk: 'might', spd: 'agility', might: 'might', agility: 'agility', endurance: 'endurance', intellect: 'intellect', intuition: 'intuition', presence: 'presence' };
  const resolvedStat = STAT_KEY_MAP[chosenOpt.rollStat] || 'might';
  const statScore = Number(stats[resolvedStat] || 10);
  const statValue = Math.floor((statScore - 10) / 2);
  const threshold = Math.max(8, 10 + (chosenOpt.difficulty || 0));
  const check = { stat: resolvedStat, statLabel: STAT_LABELS[resolvedStat] || resolvedStat, statValue, threshold, requiresRoll: needsRoll };
  const resolutionText = needsRoll ? null : `${optionLabel} requires no roll.`;

  entry.decision = { optionId, optionLabel, check };
  entry.check    = check;

  P2PMesh.sendToPeer(_from, { t: 'encounter:decision:ack', eid, optionLabel, needsRoll, check: { statLabel: check.statLabel, statValue, threshold }, resolutionText });
  dmUpdateEncounterRosterPanel(eid);
});

P2PMesh.on('encounter:roll', ({ eid, _from }) => {
  if (!isDM || !activeEncounter || activeEncounter.eid !== eid) return;
  const entry = activeEncounter.roster.find(r => r.socketId === _from);
  if (!entry || entry.roll !== null) return;

  const roll    = Math.floor(Math.random() * 20) + 1;
  const sv      = entry.check?.statValue ?? 0;
  const thresh  = entry.check?.threshold ?? 12;
  const total   = roll + sv;
  const success = total >= thresh;

  entry.roll = roll; entry.total = total; entry.success = success;

  P2PMesh.sendToPeer(_from, { t: 'encounter:roll:ack', eid, roll, statLabel: entry.check?.statLabel, statValue: sv, threshold: thresh, total, success });

  const allReady = activeEncounter.roster.every(r => {
    if (!r.decision) return false;
    return !r.check?.requiresRoll || r.roll !== null;
  });
  if (allReady) {
    activeEncounter.targetSocketIds.forEach(sid => {
      P2PMesh.sendToPeer(sid, { t: 'encounter:ready', eid, npcName: activeEncounter.resolvedName });
    });
  }

  dmUpdateEncounterRosterPanel(eid);
});

function dmUpdateEncounterRosterPanel(eid) {
  if (!activeEncounter || activeEncounter.eid !== eid) return;
  const el = document.getElementById('dm-encounter-roster');
  if (!el) return;
  const ready = activeEncounter.roster.every(r => r.decision && (!r.check?.requiresRoll || r.roll !== null));
  const summary = ready ? '<div class="roster-row"><strong>✅ Encounter ready. Advance the round to resolve it.</strong></div>' : '';
  el.innerHTML = summary + activeEncounter.roster.map(p => {
    let statusIcon = '⏳';
    let rollText = 'awaiting choice';
    if (p.decision && p.check?.requiresRoll && p.roll === null) {
      statusIcon = '🎲';
      rollText = `awaiting d20 vs ${p.check.threshold}`;
    } else if (p.decision && p.check?.requiresRoll) {
      statusIcon = '✅';
      rollText = `d20 ${p.roll}+${p.check.statValue}=${p.total} (${p.success ? 'success' : 'failure'})`;
    } else if (p.decision) {
      statusIcon = '✅';
      rollText = 'no roll required';
    }
    return `<div class="roster-row"><span>${statusIcon} ${escapeHtml(p.username)}</span><span>${p.decision ? escapeHtml(p.decision.optionLabel) : '—'}</span><span>${rollText}</span></div>`;
  }).join('');
}

function dmResolveEncounter(eid, outcome) {
  if (!isDM || !activeEncounter || activeEncounter.eid !== eid) return;
  const { npc, roster, resolvedName, seed } = activeEncounter;
  const at = new Date().toISOString();

  const flavorPool = GameCatalog.OUTCOME_FLAVOR[outcome] || GameCatalog.OUTCOME_FLAVOR.success;
  const flavor = flavorPool[Math.floor(Math.random() * flavorPool.length)]
    .replace('{{npc}}', resolvedName).replace('{{player}}', myUsername);

  const lootTable = outcome === 'death' ? (npc.deathLoot || []) : outcome === 'negotiate' ? (npc.negLoot || []) : [];
  const perPlayerLoot = {};
  roster.forEach(r => { perPlayerLoot[r.socketId] = GameCatalog.drawLoot(lootTable, seed ^ (r.socketId.charCodeAt(0) || 1)); });
  perPlayerLoot[socket.id] = GameCatalog.drawLoot(lootTable, seed ^ 0xff);

  activeEncounter = null;

  P2PMesh.broadcast({ t: 'encounter:resolved', eid, outcome, flavor, roster, perPlayerLoot, at });

  const myLoot = perPlayerLoot[socket.id] || [];
  myLoot.forEach(item => myInventory.push(item.name));
  if (myLoot.length) { writeStoredJson(RUNTIME_STORAGE_KEYS.inventory, myInventory); renderInventory(); }

  const enc2 = readStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, []);
  const rec = enc2.find(e => e.eid === eid);
  if (rec) { rec.outcome = outcome; rec.resolvedAt = at; writeStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, enc2); }

  const outcomeEmoji = { death: '\ud83d\udc80', negotiate: '\ud83e\udd1d', flee: '\ud83d\udca8', success: '\u2728' }[outcome] || '\u2694\ufe0f';
  addMessage(`${outcomeEmoji} Encounter resolved: ${outcome}. ${flavor}`, 'narrate');
  const dmPanel = document.getElementById('dm-encounter-panel');
  if (dmPanel) dmPanel.remove();
} 

function sendNarration() {
  const text = narrateInput.value.trim();
  if (!text) return;
  P2PMesh.broadcast({ t: 'game:narrate', text });
  narrateInput.value = '';
  // DM never receives its own broadcast — echo locally
  addMessage(`📜 [DM] ${text}`, 'narrate');
}

 
// ─── P2P File Trade ───────────────────────────────────────────────────────────
// TODO: integrate file-send UI trigger (bind to a 'Send File' button in inventory/trade panel)
function sendFileToPeer(targetId, file) {
  if (!P2PMesh.getPeers().includes(targetId)) {
    addMessage('No open P2P channel to that player yet.', 'system');
    return;
  }

  if (loadingScreen) loadingScreen.classList.remove('hidden');

  // Send JSON metadata first so the receiver knows name + total size
  P2PMesh.sendToPeer(targetId, { t: 'file:meta', name: file.name, size: file.size });

  const CHUNK = 16 * 1024; // 16 KB chunks
  let offset = 0;
  const reader = new FileReader();

  reader.onload = (e) => {
    P2PMesh.sendBinaryToPeer(targetId, e.target.result);
    offset += e.target.result.byteLength;
    if (offset < file.size) {
      readSlice(offset);
    } else {
      addMessage(`Sent "${file.name}" to ${targetId.slice(0, 6)}…`, 'system');
      if (loadingScreen) loadingScreen.classList.add('hidden');
    }
  };

  function readSlice(o) {
    reader.readAsArrayBuffer(file.slice(o, o + CHUNK));
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
 
// ─── P2P File Receive ─────────────────────────────────────────────────────────

// ─── P2P Roster System ───────────────────────────────────────────────────────

// When a new DataChannel opens, send our identity so the peer can add us to their roster
P2PMesh.on('peer:connected', ({ peerId }) => {
  P2PMesh.sendToPeer(peerId, {
    t: 'player:announce',
    socketId: socket.id,
    username: myUsername,
    isDM,
    character: myCharacter,
    avatar: myAvatar,
  });
});

// Receive a peer's identity and add/update them in the local roster
P2PMesh.on('player:announce', ({ socketId: peerId, username, isDM: peerIsDM, character, avatar, _from }) => {
  partyMembers[peerId || _from] = {
    socketId: peerId || _from,
    username: username || 'Unknown',
    isDM: Boolean(peerIsDM),
    character: character || null,
    avatar: avatar || '🧙',
  };
  updateUserRoster(Object.values(partyMembers));
  updateTradePlayerList(Object.values(partyMembers));
  updateDmWhisperList(Object.values(partyMembers));
  updateSpawnPlayerList(Object.values(partyMembers));
});

// Remove a peer from the roster when their DataChannel closes
P2PMesh.on('peer:disconnected', ({ peerId }) => {
  // peerId is the socketId used as the key in pcs/channels inside P2PMesh
  // find the partyMembers entry whose socketId matches
  const key = Object.keys(partyMembers).find(k => k === peerId);
  if (key) delete partyMembers[key];
  updateUserRoster(Object.values(partyMembers));
  updateTradePlayerList(Object.values(partyMembers));
  updateDmWhisperList(Object.values(partyMembers));
  updateSpawnPlayerList(Object.values(partyMembers));
});

// ─── P2P File Receive ─────────────────────────────────────────────────────────

P2PMesh.on('file:meta', ({ name, size, _from }) => {
  pendingFiles[_from] = { name, chunks: [], totalSize: size };
});

P2PMesh.on('binary:data', ({ buffer, _from }) => {
  const file = pendingFiles[_from];
  if (!file) return;
  file.chunks.push(buffer);
  const received = file.chunks.reduce((n, c) => n + c.byteLength, 0);
  if (received >= file.totalSize) {
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
    delete pendingFiles[_from];
  }
});

// ─── Socket Event Listeners ───────────────────────────────────────────────────
 
socket.on('room:joined', ({ roomId, socketId, isDM: joinedAsDM, roomMeta, peers = [], dmSocketId: serverDmSocketId }) => {
  if (loadingScreen) loadingScreen.classList.add('hidden');
  myRoomId = roomId;
  // Sync authoritative isDM flag from server payload
  if (joinedAsDM !== undefined) isDM = joinedAsDM;
  // Store the DM's socket ID so players can target them directly
  if (serverDmSocketId) dmSocketId = serverDmSocketId;
  else if (isDM) dmSocketId = socketId; // DM's own socket
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

  // Seed own entry in partyMembers so self appears in roster immediately
  partyMembers[socket.id] = {
    socketId: socket.id,
    username: myUsername,
    isDM,
    character: myCharacter,
    avatar: myAvatar,
  };
  updateUserRoster(Object.values(partyMembers));

  // Connect to all peers already in the room (joiner initiates WebRTC to each)
  // peer:connected fires on each open DataChannel and triggers player:announce exchange
  peers.forEach(peerId => P2PMesh.connectToPeer(peerId));

  // DM-specific: show room code and reset portable state for fresh rooms
  if (isDM) {
    if (createdRoomCode) {
      createdRoomCode.textContent = `Room started: ${roomId} (${myRoomType})`;
      createdRoomCode.classList.remove('hidden');
    }
    if (copyRoomCodeBtn) copyRoomCodeBtn.classList.remove('hidden');
    if (joinRoomIdInput) joinRoomIdInput.value = roomId;
    addMessage(`Room "${roomId}" created. Share this code with your players.`, 'system');
    // Imported rooms restore state before room:start; fresh rooms start clean.
    if (shouldResetPortableRoomState({ source: 'manual' })) {
      writeStoredJson(RUNTIME_STORAGE_KEYS.roomEnv, []);
      writeStoredJson(RUNTIME_STORAGE_KEYS.roomEncounters, []);
    }
    // Keepalive: reset the server's DM absence timer every 30 s
    setInterval(() => socket.emit('room:heartbeat'), 30_000);
  }

  if (pendingNormalizationLines.length > 0) {
    addMessage('--- Normalization Report ---', 'system');
    pendingNormalizationLines.forEach((line) => addMessage(line, 'system'));
    addMessage('--- End Normalization Report ---', 'system');
    pendingNormalizationLines = [];
  }
});

socket.on('room:count', ({ count }) => {
  memberCount.textContent = count;
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

socket.on('peer:joined', ({ socketId, username }) => {
  addMessage(`${username} joined the party.`, 'system');
});
 
socket.on('peer:left', ({ socketId, username }) => {
  addMessage(`${username} left the party.`, 'system');
});

socket.on('dm:offline', ({ reason }) => {
  addMessage('The DM has gone offline. Session paused.', 'error');
  P2PMesh.closeAll();
});
 
P2PMesh.on('room:round', ({ roundNumber, turnUsername, phase }) => {
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

P2PMesh.on('round:action:declared', ({ from, text }) => {
  if (from === myUsername) return;
  addMessage(`${from} commits: ${text}`, 'system');
});

P2PMesh.on('round:action:prompted', ({ from, text, statLabel, statValue, threshold }) => {
  if (from === myUsername) return;
  addMessage(`[Check] ${from}: roll d20 + ${statLabel} (${formatActionStatValue(statValue)}) vs ${threshold} for "${text}".`, 'system');
});

P2PMesh.on('round:action:assigned', ({ text, statKey, statLabel, statScore, statValue, threshold }) => {
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
  const bonus = statValue >= 0 ? `+${formatActionStatValue(statValue)}` : formatActionStatValue(statValue);
  addMessage(`[Check Assigned] Roll d20 ${bonus} ${statLabel} vs ${threshold} for "${text}".`, 'system');
});

P2PMesh.on('round:action:roll:accepted', ({ text, statKey, statLabel, statScore, statValue, threshold, roll }) => {
  myPendingRoundAction = {
    text,
    statKey,
    statLabel,
    statScore,
    statValue,
    threshold,
    roll,
  };
  settleDiceRoll(roll);
  updateRoundActionUI();
  addMessage(`[Roll Locked] d20 ${roll} locked for "${text}". Resolution happens when the DM advances the round.`, 'roll');
});

P2PMesh.on('round:action:roll-locked', ({ from, text, roll }) => {
  if (from === myUsername) return;
  addMessage(`${from} locks in a d20 roll of ${roll} for "${text}".`, 'roll');
});

P2PMesh.on('round:actions:resolved', ({ roundNumber, results }) => {
  results.forEach((result) => {
    addMessage(formatRoundResolutionMessage({ ...result, roundNumber }), result.success ? 'system' : 'error');
  });
  myPendingRoundAction = null;
  if (diceFaceDisplay) diceFaceDisplay.textContent = '?';
  if (diceResult) diceResult.textContent = '';
  updateRoundActionUI();
});

P2PMesh.on('room:message', ({ text, _from }) => {
  const sender = partyMembers[_from] || {};
  const from = sender.username || _from;
  const isDMSender = Boolean(sender.isDM);
  const label = isDMSender ? `[DM] ${from}` : from;
  addMessage(`${label}: ${text}`);
});

P2PMesh.on('dm:whisper', ({ text }) => {
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
 
P2PMesh.on('game:roll', ({ from, result, die, _from }) => {
  const senderName = from || partyMembers[_from]?.username || _from;
  addMessage(`🎲 ${senderName} rolled a d${die} — got ${result}!`, 'roll');
});
 
P2PMesh.on('game:narrate', ({ text }) => {
  addMessage(`📜 [DM] ${text}`, 'narrate');
});

// ─── Trade / Inventory ────────────────────────────────────────────────────────

P2PMesh.on('trade:item', ({ item, _from, _observedBy, _targetId }) => {
  const fromUsername = partyMembers[_from]?.username || _from;
  if (isDM || _observedBy === 'dm') {
    const toUsername = _targetId ? (partyMembers[_targetId]?.username || _targetId) : 'someone';
    addMessage(`🔔 Trade: ${fromUsername} → ${toUsername}: ${item}`, 'system');
    return;
  }
  myInventory.push(item);
  writeStoredJson(RUNTIME_STORAGE_KEYS.inventory, myInventory);
  renderInventory();
  renderTradeInventory();
  addMessage(`💼 ${fromUsername} traded you: ${item}`, 'trade');
  // Notify DM of updated inventory
  if (dmSocketId && dmSocketId !== socket.id) {
    P2PMesh.sendToPeer(dmSocketId, { t: 'player:inventory-update', inventory: myInventory });
  }
});

// ─── DM Spawn / Environment ───────────────────────────────────────────────────

// DM receives inventory updates from players after trades or loot
P2PMesh.on('player:inventory-update', ({ inventory, _from }) => {
  if (!isDM) return;
  if (partyMembers[_from]) partyMembers[_from].inventory = inventory;
});

// Players receive dm:env broadcasts from the DM
P2PMesh.on('dm:env', ({ eventType, detail }) => {
  if (isDM) return; // DM already handled locally in dmTriggerEnv
  const typeLabel = { weather: '🌩️ Weather Change', terrain: '🗺️ Terrain Change', event: '⚡ Environmental Event', loot: '💰 Loot Drop' }[eventType] || eventType;
  addMessage(`${typeLabel}${detail ? ': ' + detail : ''}`, 'narrate');
});

// Players receive dm:spawn broadcasts as encounter prompt cards (handled by encounter:start)
// dm:spawn on players is a no-op here — encounter engine (Step 8) emits encounter:start


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

// Build the DM-side encounter panel (roster + force-resolve buttons).
// Called directly by dmStartEncounter() so the DM sees it immediately.
function buildDmEncounterPanel(eid, npcName) {
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
  const forceRow = panel.querySelector('.encounter-force-row');
  ['death', 'negotiate', 'flee'].forEach(outc => {
    const btn = document.createElement('button');
    btn.textContent = `Force: ${outc.charAt(0).toUpperCase() + outc.slice(1)}`;
    btn.addEventListener('click', () => dmForceResolve(eid, outc));
    forceRow.appendChild(btn);
  });
  msgBox.parentElement.insertBefore(panel, msgBox);
}

P2PMesh.on('encounter:start', ({ eid, npcName, npcRole, npcStats, targetSocketIds, dmName, at }) => {
  const roleLabel = { aggro: '⚔️ AGGRO', grey: '🌫️ GREY', utility: '🔧 UTILITY' }[npcRole] || npcRole;
  addMessage(
    `[ENCOUNTER STARTED] ${roleLabel} "${npcName}" | HP:${npcStats.hp} AC:${npcStats.ac} STR:${npcStats.str} DEX:${npcStats.dex} | Targets: ${targetSocketIds.length} player(s)`,
    'narrate'
  );
  // DM builds its own panel inside dmStartEncounter(); non-DM peers get the read-only version here.
  if (isDM) return;
  buildDmEncounterPanel(eid, npcName);
});

P2PMesh.on('encounter:roster', ({ eid, roster, ready }) => {
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
  // DM resolves locally (engine broadcasts encounter:resolved to all peers)
  dmResolveEncounter(eid, outcome);
}

// ─── Encounter: Player Prompt Card ───────────────────────────────────────────
let activeEncounterEid = null;

P2PMesh.on('encounter:prompt', ({ eid, npcName, npcRole, npcStats, options, dmName, at }) => {
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
      <div class="dice-face-wrapper enc-dice-wrapper">
        <div class="dice-face" id="enc-dice-face-${eid}">?</div>
      </div>
      <button class="dice-btn encounter-roll-btn" id="enc-roll-btn-${eid}">Roll d20</button>
      <span class="enc-roll-info" id="enc-roll-info-${eid}"></span>
    </div>
    <div class="encounter-result" id="enc-result-${eid}"></div>`;
  // Add option buttons via DOM to avoid inline event handlers (XSS prevention)
  const actionsDiv = card.querySelector('.encounter-actions');
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'encounter-btn';
    btn.textContent = opt.label + (opt.reqRoll ? ' (check required)' : ' (no roll)');
    btn.addEventListener('click', () => submitEncounterDecision(eid, opt.id, opt.label, opt.reqRoll));
    actionsDiv.appendChild(btn);
  });

  // Append card FIRST so querySelector finds the elements inside it
  msgBox.appendChild(card);
  msgBox.scrollTop = msgBox.scrollHeight;

  // Now safely attach the roll button listener (element is in the DOM)
  const rollBtn = card.querySelector(`#enc-roll-btn-${eid}`);
  if (rollBtn) rollBtn.addEventListener('click', () => submitEncounterRoll(eid));
});

function submitEncounterDecision(eid, optionId, optionLabel, reqRoll) {
  if (activeEncounterEid !== eid) return;
  P2PMesh.sendToPeer(dmSocketId, { t: 'encounter:decide', eid, optionId, optionLabel });
  // Disable decision buttons
  const card = document.getElementById(`encounter-card-${eid}`);
  if (card) card.querySelectorAll('.encounter-btn').forEach(b => b.disabled = true);
  // Immediately reveal roll section if this option needs a check (DM ack will fill in stat details)
  if (reqRoll) {
    const rollSection = document.getElementById(`enc-roll-${eid}`);
    if (rollSection) rollSection.style.display = 'block';
    const res = document.getElementById(`enc-result-${eid}`);
    if (res) res.textContent = `Choice locked: ${optionLabel}. Waiting for DM to assign stat check…`;
  }
}

P2PMesh.on('encounter:decision:ack', ({ eid, optionLabel, needsRoll, check, resolutionText }) => {
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

// Per-encounter dice animation interval map
const encRollIntervals = {};

function submitEncounterRoll(eid) {
  const faceEl = document.getElementById(`enc-dice-face-${eid}`);
  const btnEl  = document.getElementById(`enc-roll-btn-${eid}`);
  const infoEl = document.getElementById(`enc-roll-info-${eid}`);

  if (btnEl) btnEl.disabled = true;
  if (infoEl) infoEl.textContent = 'Rolling…';

  // Start dice face animation
  if (faceEl) {
    faceEl.classList.add('dice-face--rolling');
    const wrapper = faceEl.closest('.dice-face-wrapper');
    if (wrapper) wrapper.classList.add('rolling');
    if (encRollIntervals[eid]) clearInterval(encRollIntervals[eid]);
    encRollIntervals[eid] = setInterval(() => {
      faceEl.textContent = String(Math.floor(Math.random() * 20) + 1);
    }, 80);
  }

  // DM generates the authoritative roll
  P2PMesh.sendToPeer(dmSocketId, { t: 'encounter:roll', eid });
}

P2PMesh.on('encounter:roll:ack', ({ eid, roll, statLabel, statValue, threshold, total, success }) => {
  // Settle dice animation
  if (encRollIntervals[eid]) { clearInterval(encRollIntervals[eid]); delete encRollIntervals[eid]; }
  const faceEl = document.getElementById(`enc-dice-face-${eid}`);
  if (faceEl) {
    faceEl.textContent = String(roll);
    faceEl.classList.remove('dice-face--rolling');
    const wrapper = faceEl.closest('.dice-face-wrapper');
    if (wrapper) wrapper.classList.remove('rolling');
  }
  const infoEl = document.getElementById(`enc-roll-info-${eid}`);
  const bonus = Number(statValue) >= 0 ? `+${formatActionStatValue(statValue)}` : formatActionStatValue(statValue);
  const resultText = `${roll} ${bonus} (${statLabel}) = ${total} vs ${threshold} — ${success ? 'SUCCESS ✓' : 'FAILURE ✗'}`;
  if (infoEl) infoEl.textContent = resultText;
  const res = document.getElementById(`enc-result-${eid}`);
  if (res) res.textContent = `Roll locked. ${resultText}. Waiting for DM to resolve the encounter.`;
});

P2PMesh.on('encounter:ready', ({ eid, npcName }) => {
  const res = document.getElementById(`enc-result-${eid}`);
  if (res) {
    const baseText = res.textContent ? `${res.textContent} ` : '';
    res.textContent = `${baseText}Encounter ready. Waiting for the DM to advance the round.`.trim();
  }
  addMessage(`[Encounter Ready] ${npcName} will resolve when the DM advances the round.`, 'system');
});

// ─── Encounter: Resolution ─────────────────────────────────────────────────────
P2PMesh.on('encounter:resolved', ({ eid, outcome, flavor, roster, perPlayerLoot, at }) => {
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
    myLoot.forEach(item => { myInventory.push(item.name); });
    saveInventoryToStorage();
    renderInventory();
    // Notify DM of updated inventory
    if (dmSocketId && dmSocketId !== socket.id) {
      P2PMesh.sendToPeer(dmSocketId, { t: 'player:inventory-update', inventory: myInventory });
    }
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

// dm:env:result, dm:spawn:event, dm:env:event, room:spawn-limits, room:env-limits removed —
// DM validates locally; limit tracking moved to Step 8 engine

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
 
// ─── WebRTC Signaling (relay via P2PMesh) ────────────────────────────────────

socket.on('webrtc:offer',         ({ fromId, offer })     => P2PMesh.handleOffer(fromId, offer));
socket.on('webrtc:answer',        ({ fromId, answer })    => P2PMesh.handleAnswer(fromId, answer));
socket.on('webrtc:ice-candidate', ({ fromId, candidate }) => P2PMesh.handleIceCandidate(fromId, candidate));
 
// ─── Key bindings ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.activeElement === messageInput) sendMessageFromInput();
    if (document.activeElement === actionInput) submitRoundAction();
    if (document.activeElement === narrateInput)  sendNarration();
  }
});
 