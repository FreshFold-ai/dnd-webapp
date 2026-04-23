const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const projectRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(projectRoot, 'src', 'server', 'index.js');
const artifactDir = path.join(projectRoot, 'dist', 'test-artifacts');
const port = 5100 + Math.floor(Math.random() * 1000);
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

function expectNoEventWithin(socket, eventName, timeoutMs = 300) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    function onEvent(payload) {
      cleanup();
      reject(new Error(`Unexpected ${eventName}: ${JSON.stringify(payload)}`));
    }

    function onError(payload) {
      cleanup();
      reject(new Error(payload?.message || `Server error while waiting for no ${eventName}`));
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function buildCharacter({ avatar, name, className, race, level, hp, equipment, stats }) {
  return {
    avatar,
    characterName: name,
    className,
    race,
    level,
    hp,
    equipment,
    stats,
  };
}

async function joinPlayer(socket, roomId, username, password, character) {
  const joined = onceWithTimeout(socket, 'room:joined');
  socket.emit('room:join', { roomId, username, password, character });
  return joined;
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });

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
      roomType: 'Forest',
      dmName: 'Smoke DM',
      roomPassword: 'evergreen',
    });
    const dmRoom = await dmJoined;
    const roomId = dmRoom.roomId;

    assert.ok(roomId, 'DM should receive a room id');

    const playerConfigs = [
      {
        username: 'Aria',
        character: buildCharacter({
          avatar: '🏹',
          name: 'Aria',
          className: 'Ranger',
          race: 'Elf',
          level: 3,
          hp: 22,
          equipment: 'Scout Kit',
          stats: { might: 6, agility: 10, endurance: 7, intellect: 7, intuition: 8, presence: 6 },
        }),
      },
      {
        username: 'Borin',
        character: buildCharacter({
          avatar: '🛡️',
          name: 'Borin',
          className: 'Paladin',
          race: 'Dwarf',
          level: 4,
          hp: 28,
          equipment: 'Frontline Kit',
          stats: { might: 9, agility: 5, endurance: 9, intellect: 6, intuition: 7, presence: 8 },
        }),
      },
      {
        username: 'Cyra',
        character: buildCharacter({
          avatar: '🔮',
          name: 'Cyra',
          className: 'Warlock',
          race: 'Tiefling',
          level: 3,
          hp: 20,
          equipment: 'Caster Kit',
          stats: { might: 4, agility: 7, endurance: 7, intellect: 10, intuition: 7, presence: 9 },
        }),
      },
      {
        username: 'Dax',
        character: buildCharacter({
          avatar: '🗡️',
          name: 'Dax',
          className: 'Rogue',
          race: 'Human',
          level: 2,
          hp: 18,
          equipment: 'Balanced Kit',
          stats: { might: 6, agility: 10, endurance: 6, intellect: 8, intuition: 7, presence: 7 },
        }),
      },
    ];

    const players = [];
    for (const config of playerConfigs) {
      const socket = await connectClient();
      sockets.push(socket);
      await joinPlayer(socket, roomId, config.username, 'evergreen', config.character);
      players.push({ socket, ...config });
    }

    const [aria, borin, cyra, dax] = players;

    const ariaMessage = onceWithTimeout(dm, 'room:message');
    aria.socket.emit('room:message', { text: 'Scouting ahead by the old trees.' });
    await ariaMessage;

    const narration = onceWithTimeout(aria.socket, 'game:narrate');
    dm.emit('game:narrate', { text: 'Mist rolls between the trees as the patrol advances.' });
    await narration;

    const whisper = onceWithTimeout(aria.socket, 'dm:whisper');
    dm.emit('dm:whisper', { targetId: aria.socket.id, text: 'You spot movement near the ridge.' });
    await whisper;

    const tradeReceived = onceWithTimeout(borin.socket, 'trade:received');
    const tradeSent = onceWithTimeout(aria.socket, 'trade:sent');
    aria.socket.emit('trade:item', { targetId: borin.socket.id, item: 'Rope (50ft)' });
    await Promise.all([tradeReceived, tradeSent]);

    const envEvent = onceWithTimeout(dax.socket, 'dm:env:event');
    const envResult = onceWithTimeout(dm, 'dm:env:result');
    dm.emit('dm:env', { eventType: 'weather', detail: 'A cold rain starts to fall.', target: 'all' });
    await Promise.all([envEvent, envResult]);

    const roundActions = [
      { player: aria, text: 'Scout ahead by the old trees.' },
      { player: borin, text: 'Hold the line at the gate.' },
      { player: cyra, text: 'Read the strange runes.' },
      { player: dax, text: 'Sneak through the brush.' },
    ];

    for (const { player, text } of roundActions) {
      const assigned = onceWithTimeout(player.socket, 'round:action:assigned');
      player.socket.emit('round:submit-action', { text });
      const check = await assigned;
      assert.strictEqual(check.text, text, 'Action assignment should echo the submitted action text');
    }

    for (const { player } of roundActions) {
      const rollAccepted = onceWithTimeout(player.socket, 'round:action:roll:accepted');
      player.socket.emit('round:submit-roll');
      const accepted = await rollAccepted;
      assert.ok(accepted.roll >= 1 && accepted.roll <= 20, 'Round action rolls should be d20 results');
    }

    const resolvedActions = onceWithTimeout(dm, 'round:actions:resolved');
    const roundState = waitForMatchingEvent(dm, 'room:round', (payload) => payload?.roundNumber === 2, 8000);
    const roundNarration = onceWithTimeout(dax.socket, 'game:narrate');
    dm.emit('room:advance-round');
    const resolutionPayload = await resolvedActions;
    assert.strictEqual(resolutionPayload.results.length, 4, 'All four player actions should resolve together');
    await Promise.all([roundState, roundNarration]);

    const encounterStart = onceWithTimeout(dm, 'encounter:start');
    const encounterPrompts = players.map(({ socket }) => onceWithTimeout(socket, 'encounter:prompt'));
    dm.emit('dm:spawn', { npcType: 'aggro', npcName: 'Fell Boar', target: 'all' });
    const dmEncounter = await encounterStart;
    const prompts = await Promise.all(encounterPrompts);

    assert.strictEqual(prompts.length, 4, 'All four players should receive an encounter prompt');
    assert.strictEqual(dmEncounter.npcName, 'Fell Boar');

    const encounterSelections = [];
    for (let index = 0; index < players.length; index += 1) {
      const { socket } = players[index];
      const prompt = prompts[index];
      const option = index === 0
        ? (prompt.options.find((entry) => !entry.reqRoll) || prompt.options[0])
        : (prompt.options.find((entry) => entry.reqRoll) || prompt.options[0]);
      const decisionAck = onceWithTimeout(socket, 'encounter:decision:ack');
      socket.emit('encounter:decide', {
        eid: prompt.eid,
        optionId: option.id,
        optionLabel: option.label,
      });
      const ack = await decisionAck;
      encounterSelections.push({ option, ack });
      if (index === 0) {
        assert.ok(!ack.needsRoll, 'First smoke test encounter choice should exercise the no-roll path');
      } else {
        assert.ok(ack.needsRoll, 'Later smoke test encounter choices should require a roll');
      }
    }

    const readySeen = onceWithTimeout(dm, 'encounter:ready', 8000);
    for (let index = 0; index < players.length; index += 1) {
      if (index === 0) continue;
      const { socket } = players[index];
      const prompt = prompts[index];
      const check = encounterSelections[index].ack.check;
      const plannedRoll = index < 2
        ? Math.min(20, Math.max(1, check.threshold - check.statValue + 1))
        : Math.max(1, Math.min(20, check.threshold - check.statValue - 2));
      const rollAck = onceWithTimeout(socket, 'encounter:roll:ack');
      socket.emit('encounter:roll', { eid: prompt.eid, roll: plannedRoll });
      await rollAck;
    }
    await readySeen;
    await expectNoEventWithin(dm, 'encounter:resolved', 400);

    const resolutionSeen = Promise.all(players.map(({ socket }) => onceWithTimeout(socket, 'encounter:resolved', 8000)));
    const dmResolution = onceWithTimeout(dm, 'encounter:resolved', 8000);
    const roundThreeState = waitForMatchingEvent(dm, 'room:round', (payload) => payload?.roundNumber === 3, 8000);
    const roundThreeNarration = onceWithTimeout(dax.socket, 'game:narrate');
    dm.emit('room:advance-round');
    await Promise.all([resolutionSeen, dmResolution, roundThreeState, roundThreeNarration]);

    await delay(100);

    const exported = onceWithTimeout(dm, 'room:export:campaign', 8000);
    dm.emit('room:export:campaign');
    const { campaign } = await exported;

    assert.strictEqual(campaign.kind, 'room');
    assert.strictEqual(campaign.roomId, roomId);
    assert.strictEqual(campaign.roomType, 'Forest');
    assert.strictEqual(campaign.dmName, 'Smoke DM');
    assert.strictEqual(campaign.participants.length, 5, 'Smoke export should contain the DM and 4 players');
    assert.ok(Array.isArray(campaign.rounds) && campaign.rounds.length >= 3, 'Smoke export should be grouped into rounds');
    assert.ok(campaign.portableState && Array.isArray(campaign.portableState.environment), 'Smoke export should include portable environment state');
    assert.ok(campaign.portableState && Array.isArray(campaign.portableState.encounters), 'Smoke export should include portable encounter state');

    const roundOne = campaign.rounds.find((round) => round.roundNumber === 1);
    const roundTwo = campaign.rounds.find((round) => round.roundNumber === 2);
    const roundThree = campaign.rounds.find((round) => round.roundNumber === 3);
    assert.ok(roundOne, 'Round 1 should be present');
    assert.ok(roundTwo, 'Round 2 should be present');
    assert.ok(roundThree, 'Round 3 should be present');

    assert.ok(roundOne.players.some((entry) => entry.actor === 'Aria' && entry.kind === 'chat' && entry.text === 'Scouting ahead by the old trees.'), 'Round 1 should include Aria chat');
    assert.ok(roundOne.players.some((entry) => entry.actor === 'Aria' && entry.kind === 'action' && entry.text === 'Scout ahead by the old trees.'), 'Round 1 should include Aria round action');
    assert.ok(roundOne.players.some((entry) => entry.actor === 'Borin' && entry.kind === 'action' && entry.text === 'Hold the line at the gate.'), 'Round 1 should include Borin round action');
    assert.ok(roundOne.players.some((entry) => entry.actor === 'Cyra' && entry.kind === 'action' && entry.text === 'Read the strange runes.'), 'Round 1 should include Cyra round action');
    assert.ok(roundOne.players.some((entry) => entry.actor === 'Dax' && entry.kind === 'action' && entry.text === 'Sneak through the brush.'), 'Round 1 should include Dax round action');
    assert.ok(roundOne.players.filter((entry) => entry.kind === 'roll' && entry.text.includes('Locked d20')).length === 4, 'Round 1 should include four locked action rolls');
    assert.ok(roundOne.players.some((entry) => entry.actor === 'Aria' && entry.kind === 'trade' && entry.text === 'Sent Rope (50ft) to Borin'), 'Round 1 should include the trade');
    assert.ok(roundOne.dm.some((entry) => entry.kind === 'narration' && entry.text === 'Mist rolls between the trees as the patrol advances.'), 'Round 1 should include DM narration');
    assert.ok(roundOne.dm.some((entry) => entry.kind === 'whisper' && entry.target === 'Aria' && entry.text === 'You spot movement near the ridge.'), 'Round 1 should include DM whisper');
    assert.ok(roundOne.dm.filter((entry) => entry.kind === 'check').length === 4, 'Round 1 should include four assigned action checks');
    assert.ok(roundOne.world.some((entry) => entry.kind === 'weather' && entry.text === 'Weather: A cold rain starts to fall.'), 'Round 1 should include the weather event');
    assert.ok(roundOne.world.filter((entry) => entry.kind === 'action_result').length === 4, 'Round 1 should include four resolved round actions');

    assert.ok(roundTwo.world.some((entry) => entry.kind === 'round_transition' && entry.text.includes('Round 2 begins.')), 'Round 2 should include the round transition');
    assert.ok(roundTwo.dm.some((entry) => entry.kind === 'prompt' && entry.text.includes('Fell Boar')), 'Round 2 should include the encounter prompt');
    assert.ok(roundTwo.players.filter((entry) => entry.kind === 'encounter_decision').length === 4, 'Round 2 should include four encounter decisions');
    assert.ok(roundTwo.players.some((entry) => entry.kind === 'encounter_decision' && entry.text.includes('(no roll required)')), 'Round 2 should record the no-roll encounter choice');
    assert.ok(roundTwo.dm.filter((entry) => entry.kind === 'check').length === 3, 'Round 2 should include three encounter checks for the rolled choices');
    assert.ok(roundTwo.players.filter((entry) => entry.kind === 'encounter_roll').length === 3, 'Round 2 should include three encounter rolls for the rolled choices');
    assert.ok(roundTwo.world.some((entry) => entry.kind === 'encounter_ready'), 'Round 2 should note when the encounter became ready');
    assert.ok(roundTwo.dm.some((entry) => entry.kind === 'resolution' && entry.text.includes('Fell Boar') && entry.text.includes('Party impact:')), 'Round 2 should include the richer encounter resolution summary');

    assert.ok(roundThree.world.some((entry) => entry.kind === 'round_transition' && entry.text.includes('Round 3 begins.')), 'Round 3 should include the round transition');

    assert.ok(campaign.portableState.environment.some((entry) => entry.type === 'weather' && entry.detail === 'A cold rain starts to fall.'), 'Portable state should keep the weather change');
    assert.ok(campaign.portableState.encounters.some((entry) => entry.npcName === 'Fell Boar' && entry.flavor.includes('Party impact:')), 'Portable state should keep the richer encounter outcome flavor');

    const artifactPath = path.join(artifactDir, `${roomId}-room.txt`);
    fs.writeFileSync(artifactPath, JSON.stringify(campaign, null, 2));

    console.log(`smoke export test passed`);
    console.log(`artifact written: ${artifactPath}`);
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