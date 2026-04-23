## Progress Report, Team Invincible

Report Date: April 23, 2026

### Who is in our group?

Kobe, Devon, Urvish, Brandon.

### What is our project?

We are building a real-time multiplayer Dungeons & Dragons encounter engine. One player is the Dungeon Master (DM) and the rest are players. The DM spawns NPCs from a 13-template catalog, sets environment events, and narrates. Players receive interactive encounter cards, choose a decision, submit a d20 roll, and receive loot. All durable state persists in `localStorage` and exports to `.txt` files for portability between sessions.

### What have we accomplished?

#### Session & Room Infrastructure
- Express + Socket.IO server running on Node.js, deployed to Render
- Named password-protected rooms: DM creates, players join with a room code
- Per-room transient state: `roomUsers`, `roomMeta`, `roomRounds`, `roomSpawnLimits`, `roomEnvLimits`, `roomEncounters`
- Live user roster sidebar with connection status and reconnect handling
- Round counter visible to all players; DM advances rounds

#### Character System
- Avatar picker with 8 emoji options
- Character builder: name, class (8 options), race (8 options), level, HP
- 6-stat array (Might, Agility, Endurance, Intellect, Intuition, Presence) with 44-point budget, each stat 3–20
- Character persists to `localStorage` and reloads on rejoin
- Character export/import as `.txt` (JSON), including full inventory

#### Encounter Engine
- 13 NPC templates across 3 roles (aggro, grey, utility) in `src/server/catalog.js`
- Each template has stats, flavor text, death loot, negotiation loot, loot table, and difficulty values
- Seeded RNG (`seededRandom`) for deterministic loot draws
- `drawLoot()` draws 1–2 items from a loot table as `{ id, name }` objects
- DM spawn panel: pick NPC type, optionally pick a specific template from a dropdown, override name, target all or individual players
- Spawn limits: 1 aggro, up to 5 grey, up to 5 utility per round; only 1 active encounter at a time
- DM force-resolve buttons: Death, Negotiate, Flee
- Player encounter prompt card (rendered in message feed): shows NPC stats, option buttons, d20 roll input
- `encounter:decide` → `encounter:roll` → `encounter:resolve` socket event flow
- Server resolves based on roll vs. NPC AC/difficulty with `OUTCOME_FLAVOR` text
- Loot distributed per-player via `perPlayerLoot` map; added to `localStorage` inventory on client
- DM sees live NPC roster table (username, decision, roll, outcome)

#### Environment System
- DM triggers 4 event types: weather, terrain, environmental event, loot drop
- Rate-limited per round (max 3 weather/terrain, max 5 events/loot per round)
- Persistent weather/terrain events saved to `localStorage` for room export

#### Inventory & Trade
- Player inventory persists in `localStorage`
- Inventory panel with item list and remove button
- Peer-to-peer item trade via Socket.IO offer/accept/reject flow
- WebRTC data channel setup for direct file trade (`sendFileToPeer` — UI trigger pending)

#### Export / Import
- Character export: `{ kind, character, inventory }` written as `.txt` file (fully client-side)
- Character import: restores character fields and inventory from `.txt`
- Room export: `{ kind, roomType, dmName, roomPassword, environment[], encounters[] }` as `.txt`
- Room import: pre-fills join form with room credentials and restores env/encounter history

#### DM Narration
- DM-only narration input broadcasts styled messages to all players

#### UI & CSS
- Single-page app with hidden/shown panel sections
- Dark fantasy theme with encounter card styles
- Avatars visible in user roster
- NPC roster table in DM panel
- `.msg-card` base class with `.msg-card--encounter` and `.msg-card--resolved` modifiers
- All encounter buttons created via DOM (no `onclick` inline handlers) — XSS safe

#### Code Quality
- `escapeHtml()` helper used for all user-supplied strings inserted into innerHTML
- Removed unused `loadInventoryFromStorage()` function
- Dead stub functions (`goBackToJoin`, `sendFileToPeer`) annotated with TODO comments
- `OUTCOME_FLAVOR` keys aligned with server outcome strings (`negotiate`, `flee`, `success`)
- `drawLoot()` returns `{ id, name }[]` array matching client expectations
- Flat NPC stat fields (`hp`, `ac`, `str`, `dex`, `lootTable`) on all 13 templates

### What still needs to be done

- Bind `sendFileToPeer` to a UI trigger (file picker + Send button in trade panel)
- Implement `goBackToJoin` (socket leave event, state reset, confirmation dialog)
- Automated test suite (Jest or similar) for catalog/RNG/socket handler logic
- CI/CD pipeline via GitHub Actions

### Responsibility summary

Brandon: Encounter engine, catalog, socket resolution logic.
Devon: Character builder, avatar system, UI/CSS.
Kobe: Room management, export/import, round system.
Urvish: Deployment, inventory/trade, environment system, WebRTC.


### Who is in our group?

Kobe, Devin, Urvish, Brandon.

### What is our project?

We are building a multi user real time room application with user authentication, room management, avatars, a 2D map, and in room activities. We are using Node.js, Express, and Socket.IO.

Right now we have a localhost only chat demo. We do not have a live deployment yet.

### What have we accomplished?

We committed our initial scaffold on March 25, 2026. This includes the following.
An Express server that serves static files and runs Socket.IO on localhost:3000. A basic HTML page with a join form and chat text box. Socket event handlers for joining a room, sending messages, and disconnect notifications. A live member counter. A render.yaml config file for Render deployment (not yet connected). A README with documentation.

Our project has 116 lines of actual code across 4 JavaScript files. The rest of the 463 total lines are comments, blanks, HTML, and CSS. We have 0 test files so far.

When we run it locally and open two browser tabs, we can type a username and room name, send messages and files between tabs, and see a member count update. Added a dice roll function up to a D20. That is the full extent of our current functionality.

### What needs to be done

We have grouped our remaining tasks by priority and assigned them to team members.

#### Must have. Assigned to Urvish.

1. Deploy our app to Render so it has a public URL.
2. Choose and set up a database (MongoDB, PostgreSQL, or SQLite).
3. Add CORS configuration for production deployment.
4. Fix the duplicate room join bug where a user can join multiple rooms and only the last one gets notified on disconnect.

#### Core features. Assigned to Brandon.

5. Store message history so new users can see past messages.
6. Add input validation and rate limiting on the server.
7. Add server logging for requests, events, and errors.
8. Add error handling on both server and client.

#### User system and UI. Assigned to Devin.

9. Build user registration and login.
10. Build a user roster sidebar that shows who is in the room.
11. Show a connection status indicator and handle reconnects.
12. Avatar support for user profiles.
13. UI redesign with responsive layout, better styling, and loading states.

#### Rooms and map. Assigned to Kobe.

14. Build persistent room creation, listing, and joining.
15. Build a room discovery page so users can browse rooms.
16. Add a leave room button and the ability to switch rooms.
17. 2D map for avatar exploration.
18. In room activities (we still need to define the scope for this).

#### Shared

19. Add a test framework and write tests. Each of us will write tests for our own work.
20. Set up a CI/CD pipeline with GitHub Actions. Kobe and Urvish will handle this.

### Responsibility summary

Urvish: Deployment, database setup, CORS, bug fixes.
Brandon: Message history, input validation, rate limiting, logging, error handling.
Devon: User authentication, roster display, connection handling, avatars, UI redesign.
Kobe: Room management, room discovery, room switching, 2D map, in room activities.

### What adjustments do we need to make?

All four of us need to start contributing code through branches and pull requests. We need to set up a database before we can build authentication, rooms, or message history. We will use GitHub Issues to track our 20 tasks listed above.

For the 2D map, we plan to keep the scope minimal. Think Oregon Trail or a bare bones DnD overworld, not a full game engine. We will use a simple grid rendered on an HTML canvas where each user has a character that moves with arrow keys or WASD. Our map will be a 2D array of tile IDs. Each tile will be a colored square or simple sprite. Rooms will be locations on the map that players walk into to join. We will define character traits entirely with integers and other primitives, for example strength as an int, name as a string, color as a hex string. No classes, no complex objects. We will store each character as a flat JSON object like { name: "Kobe", x: 5, y: 3, color: "#ff0000", hp: 10, str: 5, def: 3 }. We will broadcast positions over Socket.IO so all players see each other move in real time. The map itself will be a static JSON file that defines which tiles are walkable, which are walls, and which are room entrances. We will keep it to a single screen with no scrolling to start. This is achievable with canvas drawing calls and a few socket events for position updates without any external game libraries.

### Our plan going forward

1. Deploy our current app to Render.
2. Set up our database.
3. Build user registration and login.
4. Build persistent rooms with create, list, join, and leave.
5. Store and load message history.
6. Add the user roster sidebar.
7. Write tests for everything above.
8. Redesign our UI.
9. Build avatars if time allows.
10. Build the 2D map if time allows.
