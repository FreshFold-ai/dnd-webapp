/**
 * @file public/js/app.js
 * @description Browser-side client for joining rooms and exchanging messages
 *              via Socket.IO.
 *
 * This script connects to the Socket.IO server on the same origin,
 * manages the join form and chat UI, and relays events between the
 * server and the DOM.
 */

/* ── Socket connection ─────────────────────────────────────── */

/**
 * socket — the Socket.IO client instance.
 * Connects automatically to the same origin that served the page.
 */
const socket = io();

/* ── DOM references ────────────────────────────────────────── */

const joinBtn       = document.getElementById("joinBtn");
const usernameInput = document.getElementById("username");
const roomIdInput   = document.getElementById("roomId");
const joinSection   = document.getElementById("join-section");
const chatSection   = document.getElementById("chat-section");
const statusEl      = document.getElementById("status");
const messagesEl    = document.getElementById("messages");
const messageForm   = document.getElementById("messageForm");
const messageInput  = document.getElementById("messageInput");

/** Whether the user has successfully joined a room. */
let joined = false;

/* ── Helper functions ──────────────────────────────────────── */

/**
 * addMessage — appends a text line to the chat message list.
 *
 * @param   {string} text — the line to display.
 * @returns {void}
 *
 * Side-effect: creates a <p> element inside #messages and scrolls
 *              the container to the bottom so the newest message
 *              is always visible.
 */
function addMessage(text) {
  const el = document.createElement("p");
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * joinRoomFromInputs — reads the username & roomId inputs and emits
 *                      a "room:join" event to the server.
 *
 * Input:  none (reads DOM input values).
 * Output: emits "room:join" with { username, roomId } if both inputs
 *         contain non-empty trimmed strings.
 *         Does nothing if either field is blank.
 */
function joinRoomFromInputs() {
  const username = usernameInput.value.trim();
  const roomId   = roomIdInput.value.trim();
  if (!username || !roomId) return;
  socket.emit("room:join", { username, roomId });
}

/**
 * sendMessageFromInput — reads the message input and emits a
 *                        "room:message" event to the server.
 *
 * Input:  none (reads messageInput value).
 * Output: emits "room:message" with { text } if the user has joined
 *         and the input is non-empty.  Clears the input afterwards.
 */
function sendMessageFromInput() {
  if (!joined) return;
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit("room:message", { text });
  messageInput.value = "";
}

/* ── UI event listeners ────────────────────────────────────── */

/** Click the Join button to attempt joining a room. */
joinBtn.addEventListener("click", joinRoomFromInputs);

/** Submit the message form to send a chat message. */
messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessageFromInput();
});

/* ── Socket event handlers ─────────────────────────────────── */

/**
 * room:joined — server confirms that this client has joined a room.
 *
 * Input payload:  { roomId: string, socketId: string }
 * Side-effects:
 *   - Sets joined = true.
 *   - Hides the join form section, shows the chat section.
 *   - Updates the status text with room name and socket ID.
 *   - Appends a "You joined" notification.
 */
socket.on("room:joined", ({ roomId, socketId }) => {
  joined = true;
  joinSection.hidden = true;
  chatSection.hidden = false;
  statusEl.textContent = `Joined room "${roomId}" as socket ${socketId}`;
  addMessage("You joined the room.");
});

/**
 * room:count — server sends updated member count for the room.
 *
 * Input payload:  { roomId: string, count: number }
 * Side-effects:
 *   - Updates the #member-count element with the current count.
 *   - Also stores count in statusEl.dataset.count for programmatic access.
 */
socket.on("room:count", ({ count }) => {
  document.getElementById("member-count").textContent = `Members: ${count}`;
  statusEl.dataset.count = String(count);
});

/**
 * user:joined — another user joined the same room.
 *
 * Input payload:  { socketId: string, username: string }
 * Side-effect: appends a join notification to the message list.
 */
socket.on("user:joined", ({ username }) => {
  addMessage(`${username} joined.`);
});

/**
 * user:left — another user disconnected from the room.
 *
 * Input payload:  { username: string }
 * Side-effect: appends a leave notification to the message list.
 */
socket.on("user:left", ({ username }) => {
  addMessage(`${username} left.`);
});

/**
 * room:message — a chat message was broadcast to the room.
 *
 * Input payload:  { from: string, text: string, at: string (ISO 8601) }
 * Side-effect: formats the timestamp and appends the message to the list.
 */
socket.on("room:message", ({ from, text, at }) => {
  const time = new Date(at).toLocaleTimeString();
  addMessage(`[${time}] ${from}: ${text}`);
});
