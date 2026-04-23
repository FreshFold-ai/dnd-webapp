const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const { io } = require('socket.io-client');

const projectRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(projectRoot, 'src', 'server', 'index.js');
const port = 3100 + Math.floor(Math.random() * 2000);
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

function waitForMatchingEvent(socket, eventName, matcher, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    function onEvent(payload) {
      if (!matcher(payload)) return;
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

    socket.on(eventName, onEvent);
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
      dmName: 'Test DM',
      roomPassword: 'secret',
    });
    const dmRoom = await dmJoined;
    const roomId = dmRoom.roomId;

    assert.ok(roomId, 'DM should receive a room id');
    assert.strictEqual(dmRoom.roomMeta.roomType, 'Village');

    const player = await connectClient();
    sockets.push(player);

    const playerJoined = onceWithTimeout(player, 'room:joined');
    player.emit('room:join', {
      roomId,
      username: 'Alice',
      password: 'secret',
      character: {
        avatar: '🏹',
        characterName: 'Alice',
        className: 'Ranger',
        race: 'Elf',
        level: 3,
        hp: 22,
        equipment: 'Scout Kit',
        stats: {
          might: 6,
          agility: 10,
          endurance: 7,
          intellect: 7,
          intuition: 8,
          presence: 6,
        },
      },
    });
    await playerJoined;

    const narration = onceWithTimeout(player, 'game:narrate');
    dm.emit('game:narrate', { text: 'The village gate opens.' });
    await narration;

    const assigned = onceWithTimeout(player, 'round:action:assigned');
    player.emit('round:submit-action', { text: 'Scout ahead.' });
    const actionCheck = await assigned;
    assert.strictEqual(actionCheck.text, 'Scout ahead.');

    const rollAccepted = onceWithTimeout(player, 'round:action:roll:accepted');
    player.emit('round:submit-roll');
    const rollPayload = await rollAccepted;
    assert.ok(rollPayload.roll >= 1 && rollPayload.roll <= 20, 'Round roll should be a d20 result');

    const resolved = onceWithTimeout(dm, 'round:actions:resolved');
    const nextRound = waitForMatchingEvent(dm, 'room:round', (payload) => payload?.roundNumber === 2);
    dm.emit('room:advance-round');
    const resolution = await resolved;
    const nextRoundState = await nextRound;

    assert.strictEqual(resolution.results.length, 1, 'One player action should resolve');
    assert.strictEqual(resolution.results[0].actor, 'Alice');
    assert.strictEqual(nextRoundState.roundNumber, 2, 'Advancing the round should open round 2');

    const exported = onceWithTimeout(dm, 'room:export:campaign');
    dm.emit('room:export:campaign');
    const { campaign } = await exported;

    assert.strictEqual(campaign.kind, 'room');
    assert.strictEqual(campaign.roomId, roomId);
    assert.strictEqual(campaign.roomType, 'Village');
    assert.strictEqual(campaign.dmName, 'Test DM');
    assert.ok(Array.isArray(campaign.participants), 'Export should include participants');
    assert.ok(Array.isArray(campaign.rounds), 'Export should include grouped rounds');
    assert.ok(campaign.portableState && Array.isArray(campaign.portableState.environment), 'Export should include portable environment state');
    assert.ok(campaign.portableState && Array.isArray(campaign.portableState.encounters), 'Export should include portable encounter state');

    assert.strictEqual(campaign.participants.length, 2, 'Export should include the DM and one player');
    assert.ok(campaign.participants.some((user) => user.username === 'Test DM' && user.isDM), 'DM should be present in export');
    assert.ok(campaign.participants.some((user) => user.username === 'Alice' && user.className === 'Ranger'), 'Player should be present in export');

    const roundOne = campaign.rounds.find((round) => round.roundNumber === 1);
    const roundTwo = campaign.rounds.find((round) => round.roundNumber === 2);
    assert.ok(roundOne, 'Round 1 should be present');
    assert.ok(roundTwo, 'Round 2 should be present');
    assert.ok(roundOne.dm.some((entry) => entry.kind === 'narration' && entry.text === 'The village gate opens.'), 'Round 1 should include DM narration');
    assert.ok(roundOne.dm.some((entry) => entry.kind === 'check' && entry.text.includes('Alice: roll d20 +')), 'Round 1 should include the assigned action check');
    assert.ok(roundOne.players.some((entry) => entry.actor === 'Alice' && entry.kind === 'action' && entry.text === 'Scout ahead.'), 'Round 1 should include the player action');
    assert.ok(roundOne.players.some((entry) => entry.actor === 'Alice' && entry.kind === 'roll' && entry.text.includes('Locked d20')), 'Round 1 should include the locked action roll');
    assert.ok(roundOne.world.some((entry) => entry.kind === 'action_result' && entry.text.includes('Alice:')), 'Round 1 should include the resolved action result');
    assert.ok(roundTwo.world.some((entry) => entry.kind === 'round_transition' && entry.text.includes('Round 2 begins.')), 'Round 2 should include the round transition');

    console.log('room export integration test passed');
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