# P2P Game Fixes & Redesign Plan

> Work through this list top-to-bottom. Check off each step as it is completed.

---

## Phase 1 — Fix P2P Display Gaps

### Step 1 — DM narration not visible in DM chat
- **File:** `public/js/app.js` — `sendNarration()` (~L1323)
- **Root cause:** `P2PMesh.broadcast()` sends to *other* peers only; the sender never receives its own `game:narrate` event, so nothing appears in the DM's feed.
- **Fix:** Add `addMessage('📜 [DM] ' + text, 'narrate')` immediately after the broadcast call inside `sendNarration()`.
- [x] Done

---

### Step 2 — DM encounter roster panel never created (player decisions/rolls invisible to DM)
- **File:** `public/js/app.js` — `dmStartEncounter()` and `P2PMesh.on('encounter:start')` handler
- **Root cause:** The `dm-encounter-panel` DOM element (with `#dm-encounter-roster` and force-resolve buttons) is only built inside `P2PMesh.on('encounter:start')`, which never fires on the DM's own client. `dmUpdateEncounterRosterPanel()` finds no element and silently fails.
- **Fix:**
  1. Extract the panel-creation block into a helper `buildDmEncounterPanel(eid, npcName)`.
  2. Call it directly inside `dmStartEncounter()` after broadcasting.
  3. Add an `if (!isDM)` guard inside `P2PMesh.on('encounter:start')` so non-DM peers still build the (read-only status) panel.
- [x] Done

---

### Step 3 — Encounter option selection doesn't trigger dice roll
- **File:** `public/js/app.js` — `P2PMesh.on('encounter:prompt')` handler (~L1803)
- **Root cause:** `document.getElementById('enc-roll-btn-' + eid)` is called *before* `msgBox.appendChild(card)`. The element doesn't exist in the document yet → `rollBtn` is `null` → listener never attached → button does nothing.
- **Fix:**
  1. Move the roll-button listener setup to **after** `msgBox.appendChild(card)` (use `msgBox.querySelector` instead of `document.getElementById`).
  2. When a player clicks an option where `opt.reqRoll === true`, immediately show the roll section on the card (don't wait for DM ack — ack will add stat details).
- [x] Done

---

## Phase 2 — Redesign Round Combat Interface

### Step 4 — Remove old panels; add new `#dice-panel` HTML
- **File:** `public/index.html`
- **Remove:**
  - `#action-section` div (Round Action label, action-input, "Lock Action" button, action-status span)
  - `#dice-section` div (Action Roll label, check-summary span, Roll d20 button)
- **Add:** A single `#dice-panel` with two sub-phases:
  ```
  #dice-panel.panel.hidden
    .panel-label  "Your Action"
    #dice-input-phase
      input#action-input  placeholder "What do you attempt this round…"
      button#action-submit-btn  "Submit Action"
    #dice-check-phase  (hidden until DM assigns stat)
      #dice-check-info   e.g. "Roll d20 + Might (+2) vs 12 — assigned by DM"
      .dice-face-wrapper
        .dice-face#dice-face-display  "?"
      button#dice-roll-btn.dice-btn  "Roll d20"
      #dice-result   (formula shown after roll)
    #action-status   (status text below everything)
  ```
- [x] Done

---

### Step 5 — Dice animation CSS
- **File:** `public/css/styles.css`
- Add `.dice-face-wrapper` — centered container with border and glow
- Add `.dice-face` — large bold monospace number display
- Add `.dice-face--rolling` class — triggers rapid number flicker via JS `setInterval`
- Add `.dice-btn` style (large prominent button)
- [x] Done

---

### Step 6 — Rewrite round action flow JS
- **File:** `public/js/app.js`
- Replace `submitRoundAction()`:
  - Sends `round:submit-action`; transitions UI to check-phase showing "Waiting for DM to assign check…"
- Replace `rollDice(20)`:
  - Starts `setInterval` dice animation cycling 1–20 on `#dice-face-display`
  - Sends `round:submit-roll` to DM
  - On `round:action:roll:accepted` ack: stop animation at returned `roll`, populate `#dice-result` with formula `N + Stat (±value) = Total vs Threshold`
- Replace `updateRoundActionUI()`:
  - New 4-state machine: `idle | submitted | rolling | locked`
  - Update all element ID references from old IDs to new panel IDs
- [x] Done

---

### Step 7 — Block round advance until all active players have rolled
- **File:** `public/js/app.js` — `dmAdvanceRound()`
- Before advancing, check `Object.values(dmRoundActions)`: if any player who submitted an action has `roll === null`, display a DM-visible warning message in the feed.
- DM can still force-advance (soft block, not hard-locked).
- DM encounter roster shows per-player roll status icons: ⏳ awaiting roll / ✅ rolled N.
- [x] Done

---

## Phase 3 — Encounter Roll UX Polish

### Step 8 — Replace manual roll number input with animated dice button
- **File:** `public/js/app.js` — `P2PMesh.on('encounter:prompt')` card template
- Remove `<input type="number" …>` from the card's roll section
- Add a `.dice-face` counter + "Roll d20" button (reusing Phase 2 styles)
- `submitEncounterRoll(eid)`:
  - Starts dice face animation
  - Sends `{ t: 'encounter:roll', eid }` (DM generates the actual number authoritatively)
  - On `encounter:roll:ack`: stop animation at returned `roll`, show formula
- [x] Done

---

## Phase 4 — Inventory Stat Boosts

### Step 9 — Add `getInventoryEquipBoosts()` to GameCatalog
- **File:** `public/js/catalog.js`
- New function exported on `window.GameCatalog`:
  - Input: array of item name strings (as stored in `myInventory`)
  - Looks up each item by matching `ITEM_TYPES[id].name === itemName`
  - For matching items with `hook: 'equip'`: accumulates stat bonuses
  - Stat mapping: `atk` → `might`, `def` → `endurance`, `spd` → `agility`
  - Returns: `{ might: N, agility: N, endurance: N, intellect: 0, intuition: 0, presence: 0 }` delta
- [x] Done

---

### Step 10 — Include inventory boosts in action submissions
- **File:** `public/js/app.js`
- In `submitRoundAction()` and `submitEncounterDecision()`: compute `GameCatalog.getInventoryEquipBoosts(myInventory)`, include as `statBonus` in payload.
- DM handler for `round:submit-action`: add `statBonus[statKey] || 0` to `statValue` when building the check.
- DM handler for `encounter:decide`: same — add bonus to the stat value used for threshold comparison.
- [x] Done (implemented in Step 6 for round actions; encounter:decide also applies boost via partyMembers inventory)

---

### Step 11 — Show stat boost tags in inventory list
- **File:** `public/js/app.js` — `renderInventory()`
- For equipment items that have a `hook: 'equip'` effect in `GameCatalog.ITEM_TYPES`, append the effect label (e.g. `+2 ATK`) to the `inv-item-tag` span.
- [x] Done

---

## Phase 5 — Wider Sidebar + Responsive Hide

### Step 12 — Widen sidebar
- **File:** `public/css/styles.css`
- `.sidebar { width: 180px; min-width: 180px }` → `width: 260px; min-width: 260px`
- `#chat-section { max-width: 900px }` → `max-width: 1200px`
- [x] Done

---

### Step 13 — Hide sidebar on small screens
- **File:** `public/css/styles.css`
- Add `@media (max-width: 768px) { .sidebar { display: none; } }`
- [x] Done

---

## Phase 6 — Trade & DM Visibility

### Step 14 — Better trade DM notification
- **File:** `public/js/app.js` — `P2PMesh.on('trade:item')` handler
- When DM receives the CC'd trade, show both sender and target username in message: `🔔 Trade: SenderName → TargetName: ItemName`
- Note: target name requires passing `targetId` in the CC message; update `triggerTrade()` to include `_targetId` in the dm-copy payload.
- [x] Done

---

### Step 15 — Inventory update signal to DM
- **File:** `public/js/app.js`
- After any inventory change (loot received, trade in/out): send `P2PMesh.sendToPeer(dmSocketId, { t: 'player:inventory-update', inventory: myInventory })`
- DM handler: `P2PMesh.on('player:inventory-update', ({ inventory, _from }) => { if (partyMembers[_from]) partyMembers[_from].inventory = inventory; })`
- Used by DM for accurate boost calculations in encounter `encounter:decide` handler.
- [x] Done

---

## Progress Summary

| Step | Area | Status |
|------|------|--------|
| 1 | DM narration echo | ⬜ |
| 2 | DM encounter panel creation | ⬜ |
| 3 | Encounter roll button fix | ⬜ |
| 4 | New dice-panel HTML | ⬜ |
| 5 | Dice animation CSS | ⬜ |
| 6 | Round action JS rewrite | ⬜ |
| 7 | Block advance until all rolled | ⬜ |
| 8 | Encounter animated dice | ⬜ |
| 9 | getInventoryEquipBoosts() | ⬜ |
| 10 | Boosts in action payloads | ⬜ |
| 11 | Boost tags in inventory list | ⬜ |
| 12 | Wider sidebar | ⬜ |
| 13 | Responsive sidebar hide | ⬜ |
| 14 | Trade DM notification | ⬜ |
| 15 | Inventory update signal | ⬜ |
