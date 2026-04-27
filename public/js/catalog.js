/**
 * public/js/catalog.js
 * Browser-compatible copy of src/server/catalog.js
 * All game data and deterministic logic runs client-side over WebRTC P2P.
 * Exposed as window.GameCatalog = { NPC_TEMPLATES, ITEM_TYPES, EFFECT_DESCRIPTORS,
 *   KIT_ITEM_IDS, OPTION_POOLS, OUTCOME_FLAVOR, seededRandom, getOptionsForEncounter, drawLoot }
 */
(function (global) {
  'use strict';

  // ─── NPC Templates ────────────────────────────────────────────────────────────
  const NPC_TEMPLATES = {
    // ── AGGRO ──────────────────────────────────────────────────────────────────
    goblin_scout: {
      id: 'goblin_scout', role: 'aggro', name: 'Goblin Scout',
      stats: { hp: 18, atk: 6, def: 4, spd: 8, will: 3, neg: 2 },
      hp: 18, ac: 9, str: 6, dex: 8,
      flavor: 'A wiry goblin darts from the shadows, blade gleaming.',
      deathLoot: ['iron_dagger', 'copper_coins', 'tattered_cloak'],
      negLoot: ['scout_map', 'copper_coins'],
      negDifficulty: 14,
      lootTable: ['iron_dagger', 'copper_coins', 'tattered_cloak', 'scout_map'],
    },
    orc_raider: {
      id: 'orc_raider', role: 'aggro', name: 'Orc Raider',
      stats: { hp: 32, atk: 10, def: 7, spd: 5, will: 5, neg: 4 },
      hp: 32, ac: 12, str: 10, dex: 5,
      flavor: 'A hulking orc charges with a war cry, axe raised high.',
      deathLoot: ['battle_axe_worn', 'heavy_shield_dented', 'copper_coins', 'health_potion_minor'],
      negLoot: ['war_trophy', 'copper_coins'],
      negDifficulty: 17,
      lootTable: ['battle_axe_worn', 'heavy_shield_dented', 'copper_coins', 'health_potion_minor', 'war_trophy'],
    },
    bandit_thug: {
      id: 'bandit_thug', role: 'aggro', name: 'Bandit Thug',
      stats: { hp: 22, atk: 7, def: 5, spd: 6, will: 4, neg: 6 },
      hp: 22, ac: 10, str: 7, dex: 6,
      flavor: 'A scarred bandit levels a crossbow at the party.',
      deathLoot: ['crossbow_bolt_bundle', 'copper_coins', 'lockpick_set'],
      negLoot: ['stolen_journal', 'copper_coins'],
      negDifficulty: 12,
      lootTable: ['crossbow_bolt_bundle', 'copper_coins', 'lockpick_set', 'stolen_journal'],
    },
    skeleton_warrior: {
      id: 'skeleton_warrior', role: 'aggro', name: 'Skeleton Warrior',
      stats: { hp: 20, atk: 8, def: 6, spd: 5, will: 0, neg: 0 },
      hp: 20, ac: 11, str: 8, dex: 5,
      flavor: 'Bones rattle as an animated skeleton raises a rusted sword.',
      deathLoot: ['bone_fragment', 'rusty_sword', 'ancient_coin'],
      negLoot: [],
      negDifficulty: 99,
      lootTable: ['bone_fragment', 'rusty_sword', 'ancient_coin'],
    },
    dark_wolf: {
      id: 'dark_wolf', role: 'aggro', name: 'Dark Wolf',
      stats: { hp: 24, atk: 9, def: 3, spd: 12, will: 2, neg: 1 },
      hp: 24, ac: 8, str: 9, dex: 12,
      flavor: 'A massive black wolf snarls, hackles raised, eyes glowing red.',
      deathLoot: ['wolf_pelt', 'wolf_fang', 'copper_coins'],
      negLoot: ['wolf_pelt'],
      negDifficulty: 16,
      lootTable: ['wolf_pelt', 'wolf_fang', 'copper_coins'],
    },

    // ── GREY ───────────────────────────────────────────────────────────────────
    wandering_sage: {
      id: 'wandering_sage', role: 'grey', name: 'Wandering Sage',
      stats: { hp: 10, atk: 2, def: 2, spd: 4, will: 14, neg: 16 },
      hp: 10, ac: 7, str: 2, dex: 4,
      flavor: 'An elderly figure in faded robes watches you from the roadside.',
      deathLoot: ['spell_scroll_minor', 'ancient_tome_page'],
      negLoot: ['spell_scroll_minor', 'cryptic_map', 'ancient_tome_page', 'insight_token'],
      negDifficulty: 8,
      lootTable: ['spell_scroll_minor', 'cryptic_map', 'ancient_tome_page', 'insight_token'],
    },
    mysterious_stranger: {
      id: 'mysterious_stranger', role: 'grey', name: 'Mysterious Stranger',
      stats: { hp: 14, atk: 5, def: 5, spd: 9, will: 10, neg: 12 },
      hp: 14, ac: 10, str: 5, dex: 9,
      flavor: 'A cloaked figure leans against the wall, watching silently.',
      deathLoot: ['copper_coins', 'sealed_letter', 'smoke_bomb'],
      negLoot: ['sealed_letter', 'cryptic_map', 'insight_token', 'copper_coins'],
      negDifficulty: 11,
      lootTable: ['copper_coins', 'sealed_letter', 'smoke_bomb', 'cryptic_map', 'insight_token'],
    },
    lost_soldier: {
      id: 'lost_soldier', role: 'grey', name: 'Lost Soldier',
      stats: { hp: 20, atk: 7, def: 6, spd: 5, will: 6, neg: 9 },
      hp: 20, ac: 11, str: 7, dex: 5,
      flavor: 'A disheveled soldier in torn armor wanders aimlessly.',
      deathLoot: ['soldier_kit', 'copper_coins'],
      negLoot: ['soldier_kit', 'copper_coins', 'insight_token'],
      negDifficulty: 9,
      lootTable: ['soldier_kit', 'copper_coins', 'insight_token'],
    },
    town_drunk: {
      id: 'town_drunk', role: 'grey', name: 'Town Drunk',
      stats: { hp: 8, atk: 1, def: 1, spd: 2, will: 3, neg: 14 },
      hp: 8, ac: 6, str: 1, dex: 2,
      flavor: 'A stumbling figure clutches a bottle and slurs at you.',
      deathLoot: ['copper_coins'],
      negLoot: ['copper_coins', 'rumor_token', 'local_brew'],
      negDifficulty: 5,
      lootTable: ['copper_coins', 'rumor_token', 'local_brew'],
    },
    cursed_merchant: {
      id: 'cursed_merchant', role: 'grey', name: 'Cursed Merchant',
      stats: { hp: 12, atk: 2, def: 3, spd: 5, will: 8, neg: 13 },
      hp: 12, ac: 8, str: 2, dex: 5,
      flavor: 'A merchant with hollow eyes offers wares with trembling hands.',
      deathLoot: ['cursed_trinket', 'copper_coins', 'strange_gem'],
      negLoot: ['cursed_trinket', 'strange_gem', 'copper_coins', 'rumor_token'],
      negDifficulty: 10,
      lootTable: ['cursed_trinket', 'copper_coins', 'strange_gem', 'rumor_token'],
    },

    // ── UTILITY ────────────────────────────────────────────────────────────────
    village_healer: {
      id: 'village_healer', role: 'utility', name: 'Village Healer',
      stats: { hp: 12, atk: 0, def: 2, spd: 4, will: 12, neg: 18 },
      hp: 12, ac: 7, str: 0, dex: 4,
      flavor: 'A calm healer arranges herbs and bandages on a wooden table.',
      deathLoot: [],
      negLoot: ['health_potion_minor', 'bandage_bundle', 'antidote'],
      negDifficulty: 0,
      lootTable: ['health_potion_minor', 'bandage_bundle', 'antidote'],
      services: ['heal_minor', 'status_cure', 'buy_potions'],
    },
    traveling_merchant: {
      id: 'traveling_merchant', role: 'utility', name: 'Traveling Merchant',
      stats: { hp: 10, atk: 0, def: 1, spd: 6, will: 8, neg: 20 },
      hp: 10, ac: 6, str: 0, dex: 6,
      flavor: 'A cheerful merchant unpacks an assortment of goods from a cart.',
      deathLoot: [],
      negLoot: ['trade_goods', 'copper_coins', 'rope_bundle', 'torch_bundle'],
      negDifficulty: 0,
      lootTable: ['trade_goods', 'copper_coins', 'rope_bundle', 'torch_bundle'],
      services: ['buy_item', 'sell_item', 'trade_item'],
    },
    blacksmith_journeyman: {
      id: 'blacksmith_journeyman', role: 'utility', name: 'Blacksmith Journeyman',
      stats: { hp: 18, atk: 3, def: 4, spd: 3, will: 7, neg: 16 },
      hp: 18, ac: 9, str: 3, dex: 3,
      flavor: 'A soot-covered smith wipes calloused hands and eyes your weapons.',
      deathLoot: [],
      negLoot: ['iron_dagger', 'copper_coins', 'sharpening_stone'],
      negDifficulty: 0,
      lootTable: ['iron_dagger', 'copper_coins', 'sharpening_stone'],
      services: ['repair_weapon', 'upgrade_weapon', 'buy_blade'],
    },
  };

  // ─── Item Type Registry ───────────────────────────────────────────────────────
  const ITEM_TYPES = {
    health_potion_minor:  { id: 'health_potion_minor', name: 'Health Potion',         kind: 'consumable', effect: 'heal_10',         stackable: true,  maxStack: 5 },
    health_potion_major:  { id: 'health_potion_major', name: 'Greater Health Potion', kind: 'consumable', effect: 'heal_25',         stackable: true,  maxStack: 3 },
    strength_potion:      { id: 'strength_potion',     name: 'Potion of Strength',    kind: 'consumable', effect: 'buff_atk_2_turn', stackable: true,  maxStack: 3 },
    agility_potion:       { id: 'agility_potion',      name: 'Potion of Agility',     kind: 'consumable', effect: 'buff_spd_2_turn', stackable: true,  maxStack: 3 },
    antidote:             { id: 'antidote',             name: 'Antidote',              kind: 'consumable', effect: 'cure_poison',     stackable: true,  maxStack: 5 },
    smoke_bomb:           { id: 'smoke_bomb',           name: 'Smoke Bomb',            kind: 'consumable', effect: 'escape_boost',   stackable: true,  maxStack: 4 },
    local_brew:           { id: 'local_brew',           name: 'Local Brew',            kind: 'consumable', effect: 'buff_will_1_rnd',stackable: true,  maxStack: 6 },
    iron_dagger:          { id: 'iron_dagger',          name: 'Iron Dagger',           kind: 'equipment',  effect: 'atk_bonus_2',    stackable: false },
    battle_axe_worn:      { id: 'battle_axe_worn',      name: 'Worn Battle Axe',       kind: 'equipment',  effect: 'atk_bonus_4',    stackable: false },
    rusty_sword:          { id: 'rusty_sword',           name: 'Rusty Sword',          kind: 'equipment',  effect: 'atk_bonus_1',    stackable: false },
    heavy_shield_dented:  { id: 'heavy_shield_dented',  name: 'Dented Heavy Shield',  kind: 'equipment',  effect: 'def_bonus_3',    stackable: false },
    sharpening_stone:     { id: 'sharpening_stone',     name: 'Sharpening Stone',     kind: 'consumable', effect: 'buff_atk_1_enc', stackable: true,  maxStack: 3 },
    wolf_pelt:            { id: 'wolf_pelt',            name: 'Wolf Pelt',             kind: 'material',   stackable: true,  maxStack: 10 },
    wolf_fang:            { id: 'wolf_fang',            name: 'Wolf Fang',             kind: 'material',   stackable: true,  maxStack: 10 },
    bone_fragment:        { id: 'bone_fragment',        name: 'Bone Fragment',         kind: 'material',   stackable: true,  maxStack: 10 },
    tattered_cloak:       { id: 'tattered_cloak',       name: 'Tattered Cloak',       kind: 'equipment',  effect: 'def_bonus_1',    stackable: false },
    ancient_coin:         { id: 'ancient_coin',         name: 'Ancient Coin',          kind: 'currency',  stackable: true,  maxStack: 99 },
    copper_coins:         { id: 'copper_coins',         name: 'Copper Coins',          kind: 'currency',  stackable: true,  maxStack: 99 },
    strange_gem:          { id: 'strange_gem',          name: 'Strange Gem',           kind: 'material',  stackable: true,  maxStack: 5 },
    cursed_trinket:       { id: 'cursed_trinket',       name: 'Cursed Trinket',        kind: 'key',       stackable: false },
    war_trophy:           { id: 'war_trophy',           name: 'War Trophy',            kind: 'material',  stackable: false },
    scout_map:            { id: 'scout_map',            name: 'Scout Map',             kind: 'token',     stackable: false },
    cryptic_map:          { id: 'cryptic_map',          name: 'Cryptic Map',           kind: 'token',     stackable: false },
    sealed_letter:        { id: 'sealed_letter',        name: 'Sealed Letter',         kind: 'token',     stackable: false },
    stolen_journal:       { id: 'stolen_journal',       name: 'Stolen Journal',        kind: 'token',     stackable: false },
    ancient_tome_page:    { id: 'ancient_tome_page',    name: 'Ancient Tome Page',     kind: 'token',     stackable: true,  maxStack: 5 },
    rumor_token:          { id: 'rumor_token',          name: 'Useful Rumor',          kind: 'token',     stackable: true,  maxStack: 3 },
    insight_token:        { id: 'insight_token',        name: 'Insight',               kind: 'token',     stackable: true,  maxStack: 3 },
    spell_scroll_minor:   { id: 'spell_scroll_minor',   name: 'Minor Spell Scroll',    kind: 'consumable', effect: 'spell_bolt', stackable: true, maxStack: 3 },
    crossbow_bolt_bundle: { id: 'crossbow_bolt_bundle', name: 'Crossbow Bolts (x12)', kind: 'material',  stackable: true,  maxStack: 5 },
    bandage_bundle:       { id: 'bandage_bundle',       name: 'Bandages',              kind: 'consumable', effect: 'heal_5', stackable: true, maxStack: 5 },
    rope_bundle:          { id: 'rope_bundle',          name: 'Rope (50ft)',           kind: 'material',  stackable: true,  maxStack: 3 },
    torch_bundle:         { id: 'torch_bundle',         name: 'Torches (x5)',          kind: 'material',  stackable: true,  maxStack: 4 },
    lockpick_set:         { id: 'lockpick_set',         name: 'Lockpick Set',          kind: 'equipment', effect: 'skill_unlock', stackable: false },
    soldier_kit:          { id: 'soldier_kit',          name: "Soldier's Kit",         kind: 'equipment', effect: 'def_bonus_2',  stackable: false },
    trade_goods:          { id: 'trade_goods',          name: 'Trade Goods',           kind: 'currency',  stackable: true,  maxStack: 5 },
  };

  // ─── Effect Descriptors ───────────────────────────────────────────────────────
  const EFFECT_DESCRIPTORS = {
    heal_5:          { id: 'heal_5',          hook: 'on_use', scope: 'instant',    stat: 'hp',  value: 5,  label: 'Restore 5 HP' },
    heal_10:         { id: 'heal_10',         hook: 'on_use', scope: 'instant',    stat: 'hp',  value: 10, label: 'Restore 10 HP' },
    heal_25:         { id: 'heal_25',         hook: 'on_use', scope: 'instant',    stat: 'hp',  value: 25, label: 'Restore 25 HP' },
    buff_atk_2_turn: { id: 'buff_atk_2_turn', hook: 'on_use', scope: 'next_turn', stat: 'atk', value: 2,  label: '+2 ATK next turn' },
    buff_atk_1_enc:  { id: 'buff_atk_1_enc',  hook: 'on_use', scope: 'encounter', stat: 'atk', value: 1,  label: '+1 ATK this encounter' },
    buff_spd_2_turn: { id: 'buff_spd_2_turn', hook: 'on_use', scope: 'next_turn', stat: 'spd', value: 2,  label: '+2 SPD next turn' },
    buff_will_1_rnd: { id: 'buff_will_1_rnd', hook: 'on_use', scope: 'n_rounds:1',stat: 'will',value: 1,  label: '+1 WILL for 1 round' },
    cure_poison:     { id: 'cure_poison',     hook: 'on_use', scope: 'instant',    stat: null,  value: 0,  label: 'Cure poison/status' },
    escape_boost:    { id: 'escape_boost',    hook: 'on_use', scope: 'next_roll',  stat: 'spd', value: 4,  label: '+4 SPD on escape roll' },
    atk_bonus_1:     { id: 'atk_bonus_1',    hook: 'equip',  scope: 'permanent',  stat: 'atk', value: 1,  label: '+1 ATK while equipped' },
    atk_bonus_2:     { id: 'atk_bonus_2',    hook: 'equip',  scope: 'permanent',  stat: 'atk', value: 2,  label: '+2 ATK while equipped' },
    atk_bonus_4:     { id: 'atk_bonus_4',    hook: 'equip',  scope: 'permanent',  stat: 'atk', value: 4,  label: '+4 ATK while equipped' },
    def_bonus_1:     { id: 'def_bonus_1',    hook: 'equip',  scope: 'permanent',  stat: 'def', value: 1,  label: '+1 DEF while equipped' },
    def_bonus_2:     { id: 'def_bonus_2',    hook: 'equip',  scope: 'permanent',  stat: 'def', value: 2,  label: '+2 DEF while equipped' },
    def_bonus_3:     { id: 'def_bonus_3',    hook: 'equip',  scope: 'permanent',  stat: 'def', value: 3,  label: '+3 DEF while equipped' },
    skill_unlock:    { id: 'skill_unlock',   hook: 'equip',  scope: 'permanent',  stat: null,  value: 0,  label: 'Unlocks lock-related checks' },
    spell_bolt:      { id: 'spell_bolt',     hook: 'on_use', scope: 'instant',    stat: 'atk', value: 6,  label: 'Magical bolt: +6 ATK burst' },
  };

  // ─── Starting Kit Item IDs ────────────────────────────────────────────────────
  const KIT_ITEM_IDS = {
    'Balanced Kit':  [
      { id: 'iron_dagger', qty: 1 }, { id: 'crossbow_bolt_bundle', qty: 1 },
      { id: 'rope_bundle', qty: 1 }, { id: 'torch_bundle', qty: 1 },
      { id: 'health_potion_minor', qty: 1 },
    ],
    'Frontline Kit': [
      { id: 'battle_axe_worn', qty: 1 }, { id: 'heavy_shield_dented', qty: 1 },
      { id: 'health_potion_minor', qty: 2 }, { id: 'bandage_bundle', qty: 2 },
    ],
    'Scout Kit': [
      { id: 'iron_dagger', qty: 1 }, { id: 'crossbow_bolt_bundle', qty: 2 },
      { id: 'rope_bundle', qty: 1 }, { id: 'smoke_bomb', qty: 1 },
      { id: 'antidote', qty: 1 },
    ],
    'Caster Kit': [
      { id: 'spell_scroll_minor', qty: 2 }, { id: 'health_potion_minor', qty: 1 },
      { id: 'ancient_tome_page', qty: 1 },
    ],
    'Survival Kit': [
      { id: 'iron_dagger', qty: 1 }, { id: 'rope_bundle', qty: 2 },
      { id: 'torch_bundle', qty: 2 }, { id: 'bandage_bundle', qty: 3 },
      { id: 'antidote', qty: 1 },
    ],
    'Noble Kit': [
      { id: 'copper_coins', qty: 20 }, { id: 'iron_dagger', qty: 1 },
      { id: 'sealed_letter', qty: 1 },
    ],
  };

  // ─── Encounter Option Pools ───────────────────────────────────────────────────
  const OPTION_POOLS = {
    combat: [
      { id: 'attack_direct',    label: '⚔️ Attack directly',       tags: ['aggro','grey'],          reqRoll: true,  rollStat: 'atk',       difficulty: 0 },
      { id: 'attack_flanking',  label: '⚔️ Flank the enemy',      tags: ['aggro'],                 reqRoll: true,  rollStat: 'agility',   difficulty: 2 },
      { id: 'attack_heavy',     label: '⚔️ Heavy strike',         tags: ['aggro'],                 reqRoll: true,  rollStat: 'might',     difficulty: 3 },
      { id: 'defend_block',     label: '🛡️ Block and brace',      tags: ['aggro','grey'],          reqRoll: true,  rollStat: 'endurance', difficulty: 0 },
      { id: 'defend_dodge',     label: '🛡️ Dodge aside',         tags: ['aggro','grey'],          reqRoll: true,  rollStat: 'agility',   difficulty: 0 },
      { id: 'use_item_combat',  label: '🎒 Use an item',          tags: ['aggro','grey','utility'],reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'flee',             label: '🏃 Attempt to flee',      tags: ['aggro','grey'],          reqRoll: true,  rollStat: 'agility',   difficulty: 4 },
      { id: 'distract',         label: '🗣️ Distract the enemy',  tags: ['aggro','grey'],          reqRoll: true,  rollStat: 'presence',  difficulty: 2 },
      { id: 'disarm',           label: '⚔️ Attempt to disarm',   tags: ['aggro'],                 reqRoll: true,  rollStat: 'agility',   difficulty: 5 },
      { id: 'call_for_aid',     label: '📣 Call for aid',         tags: ['aggro','grey'],          reqRoll: false, rollStat: null,        difficulty: 0 },
    ],
    social: [
      { id: 'negotiate_peace',  label: '🤝 Propose a deal',       tags: ['grey','aggro'],          reqRoll: true,  rollStat: 'presence',  difficulty: 0 },
      { id: 'intimidate',       label: '😤 Intimidate them',      tags: ['grey','aggro'],          reqRoll: true,  rollStat: 'might',     difficulty: 3 },
      { id: 'persuade',         label: '🗣️ Persuade calmly',     tags: ['grey','utility'],        reqRoll: true,  rollStat: 'presence',  difficulty: 0 },
      { id: 'bribe',            label: '💰 Offer a bribe',        tags: ['grey','utility'],        reqRoll: true,  rollStat: 'presence',  difficulty: 1 },
      { id: 'probe_info',       label: '🔍 Ask probing questions',tags: ['grey'],                  reqRoll: true,  rollStat: 'intuition', difficulty: 0 },
      { id: 'feign_ally',       label: '🎭 Pose as an ally',      tags: ['grey'],                  reqRoll: true,  rollStat: 'presence',  difficulty: 4 },
      { id: 'show_mercy',       label: '🕊️ Show mercy',          tags: ['aggro','grey'],          reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'demand_surrender', label: '✊ Demand surrender',     tags: ['aggro'],                 reqRoll: true,  rollStat: 'might',     difficulty: 4 },
      { id: 'share_story',      label: '📖 Share your story',     tags: ['grey'],                  reqRoll: true,  rollStat: 'presence',  difficulty: 2 },
      { id: 'cry_for_help',     label: '😢 Appeal to compassion', tags: ['grey','utility'],        reqRoll: true,  rollStat: 'presence',  difficulty: 1 },
    ],
    utility: [
      { id: 'buy_health_pot',   label: '🧪 Buy a Health Potion',  tags: ['utility'],               reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'buy_antidote',     label: '🧪 Buy an Antidote',      tags: ['utility'],               reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'sell_item',        label: '💰 Sell an item',         tags: ['utility'],               reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'trade_item',       label: '🔄 Trade for something',  tags: ['utility'],               reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'ask_rumour',       label: '👂 Ask for local rumors', tags: ['grey','utility'],        reqRoll: true,  rollStat: 'presence',  difficulty: 1 },
      { id: 'hire_guide',       label: '🗺️ Hire as a guide',     tags: ['utility'],               reqRoll: true,  rollStat: 'presence',  difficulty: 2 },
      { id: 'request_healing',  label: '💊 Request healing',      tags: ['utility'],               reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'request_repair',   label: '🔨 Request weapon repair',tags: ['utility'],               reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'inspect_goods',    label: '🔎 Inspect goods',        tags: ['utility'],               reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'share_knowledge',  label: '📚 Share knowledge',      tags: ['grey','utility'],        reqRoll: false, rollStat: null,        difficulty: 0 },
    ],
    universal: [
      { id: 'observe',             label: '👁️ Observe carefully', tags: ['aggro','grey','utility'],reqRoll: true,  rollStat: 'intuition', difficulty: 0 },
      { id: 'wait',                label: '⏳ Wait and watch',     tags: ['aggro','grey','utility'],reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'signal_party',        label: '📣 Signal your party', tags: ['aggro','grey','utility'],reqRoll: false, rollStat: null,        difficulty: 0 },
      { id: 'use_item_universal',  label: '🎒 Use an item',       tags: ['aggro','grey','utility'],reqRoll: false, rollStat: null,        difficulty: 0 },
    ],
  };

  // ─── Outcome Flavor Text ──────────────────────────────────────────────────────
  const OUTCOME_FLAVOR = {
    death:     ["{{npc}} falls with a final cry.", "{{npc}} collapses, dropping their gear.", "The light fades from {{npc}}'s eyes."],
    negotiate: ["{{npc}} lowers their weapon and sighs.", "{{npc}} considers your words and relents.", "A tense moment passes — {{npc}} agrees."],
    flee:      ["{{player}} slips away into the shadows.", "{{player}} breaks away from the encounter."],
    success:   ["The encounter resolves in your favour.", "Everyone walks away with something gained.", "A deal is struck."],
  };

  // ─── Seeded Random ────────────────────────────────────────────────────────────
  function seededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  // ─── getOptionsForEncounter ───────────────────────────────────────────────────
  function getOptionsForEncounter(npcRole, seed) {
    const rng = seededRandom(seed);
    const role = npcRole || 'aggro';

    const allOptions = [
      ...OPTION_POOLS.combat.filter(o => o.tags.includes(role)),
      ...OPTION_POOLS.social.filter(o => o.tags.includes(role)),
      ...OPTION_POOLS.utility.filter(o => o.tags.includes(role)),
    ];

    const shuffled = allOptions.sort(() => rng() - 0.5);
    const picked = shuffled.slice(0, 3);

    const universal = OPTION_POOLS.universal[Math.floor(rng() * OPTION_POOLS.universal.length)];
    if (!picked.find(o => o.id === universal.id)) picked.push(universal);

    if (!picked.find(o => o.id === 'use_item_combat' || o.id === 'use_item_universal')) {
      picked.push(OPTION_POOLS.universal.find(o => o.id === 'use_item_universal'));
    }

    return picked.slice(0, 5);
  }

  // ─── drawLoot ─────────────────────────────────────────────────────────────────
  function drawLoot(lootTable, seed) {
    if (!lootTable || lootTable.length === 0) return [];
    const rng = seededRandom(seed);
    const first = lootTable[Math.floor(rng() * lootTable.length)];
    const items = [];
    if (first && ITEM_TYPES[first]) items.push({ id: first, name: ITEM_TYPES[first].name });
    if (lootTable.length >= 2 && rng() < 0.5) {
      const second = lootTable[Math.floor(rng() * lootTable.length)];
      if (second && ITEM_TYPES[second] && second !== first) {
        items.push({ id: second, name: ITEM_TYPES[second].name });
      }
    }
    return items;
  }

  // ─── Inventory Equip Boost Calculator ────────────────────────────────────────
  // Returns stat deltas (object keyed by stat name) for all equipped items
  // in the player's inventory. Equip-hook items with stat mappings:
  //   atk → might,  def → endurance,  spd → agility
  function getInventoryEquipBoosts(itemNames) {
    const EQUIP_STAT_MAP = { atk: 'might', def: 'endurance', spd: 'agility' };
    const bonuses = { might: 0, agility: 0, endurance: 0, intellect: 0, intuition: 0, presence: 0 };
    if (!Array.isArray(itemNames)) return bonuses;
    // Build a name→id lookup once
    const nameToId = {};
    Object.values(ITEM_TYPES).forEach(t => { nameToId[t.name] = t.id; });
    itemNames.forEach(name => {
      const id = nameToId[String(name).trim()];
      if (!id) return;
      const itemDef = ITEM_TYPES[id];
      if (!itemDef || !itemDef.effect) return;
      const effectDef = EFFECT_DESCRIPTORS[itemDef.effect];
      if (!effectDef || effectDef.hook !== 'equip' || effectDef.value === 0) return;
      const rawStat = effectDef.stat; // 'atk', 'def', 'spd', or already a full stat key
      const mappedStat = EQUIP_STAT_MAP[rawStat] || rawStat;
      if (mappedStat in bonuses) {
        bonuses[mappedStat] += effectDef.value;
      }
    });
    return bonuses;
  }

  // ─── Export ───────────────────────────────────────────────────────────────────
  global.GameCatalog = {
    NPC_TEMPLATES,
    ITEM_TYPES,
    EFFECT_DESCRIPTORS,
    KIT_ITEM_IDS,
    OPTION_POOLS,
    OUTCOME_FLAVOR,
    seededRandom,
    getOptionsForEncounter,
    drawLoot,
    getInventoryEquipBoosts,
  };
})(window);
