// ─── Socket Setup ────────────────────────────────────────────────────────────
const socket = io();
 
// ─── State ───────────────────────────────────────────────────────────────────
let myUsername = '';
let myRoomId = '';
let isDM = false;
let myAvatar = '🧙';
 
// peerConnections: Map<socketId, RTCPeerConnection>
const peerConnections = {};
// dataChannels: Map<socketId, RTCDataChannel>
const dataChannels = {};
// pendingFiles: Map<socketId, { name, chunks, totalSize }>
const pendingFiles = {};
 
const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
 
// ─── DOM Refs ─────────────────────────────────────────────────────────────────
let feed, memberCount, joinSection, chatSection;
let roomIdInput, usernameInput, messageInput, avatarSelect;
let diceSection, dmSection, narrateInput, tradeSection, avatarDisplay, connectionStatus;
let userRoster, loadingScreen;

document.addEventListener('DOMContentLoaded', () => {
  feed          = document.getElementById('message-feed');
  memberCount   = document.getElementById('member-count');
  joinSection   = document.getElementById('join-section');
  chatSection   = document.getElementById('chat-section');
  roomIdInput   = document.getElementById('room-id');
  usernameInput = document.getElementById('username');
  messageInput  = document.getElementById('message-input');
  diceSection   = document.getElementById('dice-section');
  dmSection     = document.getElementById('dm-section');
  narrateInput  = document.getElementById('narrate-input');
  tradeSection  = document.getElementById('trade-section');
  avatarSelect  = document.getElementById('avatar-select');
  avatarDisplay = document.getElementById('avatar-display');
  connectionStatus = document.getElementById('connection-status');
  userRoster    = document.getElementById('user-roster');
  loadingScreen = document.getElementById('loading-screen');

  if (avatarSelect) {
    avatarSelect.addEventListener('change', updateAvatarDisplay);
  }
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
  const avatar = avatarSelect?.value || myAvatar || '🧙';
  myAvatar = avatar;
  if (!avatarDisplay) return;

  avatarDisplay.textContent = avatar;
  avatarDisplay.classList.remove('hidden');
}
 
// ─── Update User Roster ───────────────────────────────────────────────────────
function updateUserRoster(users) {
  if (!userRoster) return;
  
  userRoster.innerHTML = '';
  users.forEach((username, index) => {
    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';
    userDiv.textContent = `${index + 1}. ${username}`;
    if (username === myUsername) {
      userDiv.classList.add('user-item--self');
    }
    userRoster.appendChild(userDiv);
  });
}
 
// ─── Join ─────────────────────────────────────────────────────────────────────
function joinRoomFromInputs() {
  const roomIdEl   = roomIdInput || document.getElementById('room-id');
  const usernameEl = usernameInput || document.getElementById('username');
  const roomId     = roomIdEl?.value.trim() || '';
  const username   = usernameEl?.value.trim() || '';
  if (!roomId || !username) return;
 
  myRoomId   = roomId;
  myUsername = username;
  myAvatar   = avatarSelect?.value || myAvatar;
  isDM       = username.toLowerCase() === 'dm';
 
  updateAvatarDisplay();
  socket.emit('room:join', { roomId, username });
  if (loadingScreen) loadingScreen.classList.remove('hidden');
}

// ─── Go Back to Join Screen ──────────────────────────────────────────────────
function goBackToJoin() {
  chatSection.classList.add('hidden');
  joinSection.classList.remove('hidden');
  diceSection.classList.add('hidden');
  tradeSection.classList.add('hidden');
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
  const result = Math.floor(Math.random() * die) + 1;
  socket.emit('game:roll', { result, die });
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
 
socket.on('room:joined', ({ roomId, socketId }) => {
  if (loadingScreen) loadingScreen.classList.add('hidden');
  joinSection.classList.add('hidden');
  chatSection.classList.remove('hidden');
  diceSection.classList.remove('hidden');
  tradeSection.classList.remove('hidden');
  if (isDM) dmSection.classList.remove('hidden');
  addMessage(`You joined room "${roomId}" as ${myUsername}.`, 'system');
});
 
socket.on('room:count', ({ count }) => {
  memberCount.textContent = count;
});

socket.on('room:users', ({ users }) => {
  updateUserRoster(users);
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
 