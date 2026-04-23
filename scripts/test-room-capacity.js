const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const projectRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(projectRoot, 'src', 'server', 'index.js');
const port = 4100 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServerReady(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server did not become ready in time.'));
    }, 10000);

    function onData(chunk) {
      const text = chunk.toString();
      if (text.includes(`Server running on http://localhost:${port}`)) {
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        resolve();
      }
    }

    child.stdout.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before becoming ready (code ${code}).`));
    });
  });
}

function onceWithTimeout(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    function onEvent(payload) {
      cleanup();
      resolve(payload);
    }

    function onError(payload) {
      cleanup();
      reject(new Error(payload?.message || `Server error while waiting for ${eventName}`));
    }

    function cleanup() {
      clearTimeout(timeout);
      socket.off(eventName, onEvent);
      socket.off('server:error', onError);
    }

    socket.once(eventName, onEvent);
    socket.once('server:error', onError);
  });
}

async function connectClient() {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });

  await onceWithTimeout(socket, 'connect');
  return socket;
}

function buildCharacter(index) {
  return {
    avatar: '⚔️',
    characterName: `Player ${index}`,
    className: 'Fighter',
    race: 'Human',
    level: 1,
    hp: 20,
    equipment: 'Balanced Kit',
    stats: {
      might: 8,
      agility: 8,
      endurance: 7,
      intellect: 7,
      intuition: 7,
      presence: 7,
    },
  };
}

function waitForJoinRejection(socket, payload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for join rejection'));
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      socket.off('room:joined', onJoined);
      socket.off('server:error', onError);
    }

    function onJoined(joinPayload) {
      cleanup();
      reject(new Error(`Unexpected room join for ${joinPayload.roomId}`));
    }

    function onError(errorPayload) {
      cleanup();
      resolve(errorPayload);
    }

    socket.once('room:joined', onJoined);
    socket.once('server:error', onError);
    socket.emit('room:join', payload);
  });
}

async function main() {
  const server = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const sockets = [];

  try {
    await waitForServerReady(server);

    const dm = await connectClient();
    sockets.push(dm);

    const dmJoined = onceWithTimeout(dm, 'room:joined');
    dm.emit('room:start', {
      roomType: 'Village',
      dmName: 'Capacity DM',
      roomPassword: 'limit-test',
    });
    const { roomId } = await dmJoined;

    const players = [];
    for (let index = 1; index <= 12; index += 1) {
      const socket = await connectClient();
      sockets.push(socket);
      const joined = onceWithTimeout(socket, 'room:joined');
      socket.emit('room:join', {
        roomId,
        username: `Player ${index}`,
        password: 'limit-test',
        character: buildCharacter(index),
      });
      await joined;
      players.push(socket);
    }

    const exported = onceWithTimeout(dm, 'room:export:campaign');
    dm.emit('room:export:campaign');
    const { campaign } = await exported;
    assert.strictEqual(campaign.participants.length, 13, 'Room should contain exactly 13 participants at capacity');

    const overflowSocket = await connectClient();
    sockets.push(overflowSocket);
    const errorPayload = await waitForJoinRejection(overflowSocket, {
      roomId,
      username: 'Overflow Player',
      password: 'limit-test',
      character: buildCharacter(13),
    });

    assert.strictEqual(errorPayload.message, 'Room is full. Max 1 DM and 12 players.');

    const exportedAfterReject = onceWithTimeout(dm, 'room:export:campaign');
    dm.emit('room:export:campaign');
    const { campaign: finalCampaign } = await exportedAfterReject;
    assert.strictEqual(finalCampaign.participants.length, 13, 'Rejected joins must not change room size');

    console.log('room capacity integration test passed');
  } finally {
    await Promise.all(sockets.map((socket) => new Promise((resolve) => {
      if (!socket.connected) {
        resolve();
        return;
      }
      socket.once('disconnect', resolve);
      socket.disconnect();
    })));

    if (!server.killed) {
      server.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});