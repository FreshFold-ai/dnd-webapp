/**
 * Real-browser benchmark via Playwright: 1 DM + 2 Players play through several rounds
 * of an aggro encounter on https://dnd-webapp-9fs4.onrender.com/.
 *
 * Captures, per browser context:
 *   - Socket.IO packet/byte counts (signaling + relay).
 *   - WebRTC RTCPeerConnection.getStats() across ALL peer connections, sampled
 *     every 1s, including bytes/packets sent and received on data channels and
 *     candidate-pair RTT.
 *   - Phase timings (connect → join → encounter start → each round resolution).
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const URL = process.env.TARGET_URL || 'https://dnd-webapp-9fs4.onrender.com';
const ROOM_PASSWORD = 'pw';
const OUT_DIR = path.join(__dirname, 'results');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// Init script injected into every page BEFORE the app loads. Wraps
// RTCPeerConnection so we can list every connection later, and patches the
// global `io()` factory (created by socket.io.js) lazily to record traffic.
// ─────────────────────────────────────────────────────────────────────────────
const INIT_SCRIPT = `
  (function () {
    window.__pcs = [];
    const NativePC = window.RTCPeerConnection;
    if (NativePC) {
      window.RTCPeerConnection = function (...args) {
        const pc = new NativePC(...args);
        window.__pcs.push(pc);
        return pc;
      };
      window.RTCPeerConnection.prototype = NativePC.prototype;
    }

    window.__sioStats = { sent: 0, recv: 0, sentBytes: 0, recvBytes: 0, events: { sent: {}, recv: {} } };
    function patchSocket(sock) {
      if (!sock || sock.__patched) return;
      sock.__patched = true;
      const origEmit = sock.emit.bind(sock);
      sock.emit = function (ev, ...rest) {
        try {
          const sz = new Blob([JSON.stringify([ev, ...rest])]).size;
          window.__sioStats.sent++;
          window.__sioStats.sentBytes += sz;
          window.__sioStats.events.sent[ev] = (window.__sioStats.events.sent[ev] || 0) + 1;
        } catch (e) {}
        return origEmit(ev, ...rest);
      };
      sock.onAny((ev, ...rest) => {
        try {
          const sz = new Blob([JSON.stringify([ev, ...rest])]).size;
          window.__sioStats.recv++;
          window.__sioStats.recvBytes += sz;
          window.__sioStats.events.recv[ev] = (window.__sioStats.events.recv[ev] || 0) + 1;
        } catch (e) {}
      });
    }
    // Poll for the app's global socket and patch it.
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.socket && window.socket.emit) { patchSocket(window.socket); clearInterval(iv); }
      if (Date.now() - start > 30000) clearInterval(iv);
    }, 50);
  })();
`;

async function launchPeer(label) {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--no-sandbox'] });
  const context = await browser.newContext();
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[${label}] pageerror:`, e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[${label}] console.error:`, msg.text().slice(0, 200));
  });
  return { label, browser, context, page };
}

async function gotoApp(peer) {
  const t0 = performance.now();
  await peer.page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  return +(performance.now() - t0).toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// DM flow
// ─────────────────────────────────────────────────────────────────────────────
async function dmStartRoom(dm) {
  await dm.page.fill('#start-dm-name', 'BenchDM');
  await dm.page.fill('#start-room-password', ROOM_PASSWORD);
  await dm.page.click('button:has-text("Start New Room")');
  // Room code appears in #created-room-code, but the chat-section also unhides.
  await dm.page.waitForSelector('#chat-section:not(.hidden)', { timeout: 30000 });
  // Read room id from the in-game display
  const roomId = await dm.page.locator('#room-display').innerText();
  return roomId.trim();
}

async function playerJoin(p, roomId, charName, statValues) {
  await p.page.fill('#join-room-id', roomId);
  await p.page.fill('#join-room-password', ROOM_PASSWORD);
  await p.page.fill('#char-name', charName);
  // Bump might so they hit the AGGRO NPC reliably.
  await p.page.evaluate((v) => {
    const el = document.getElementById('stat-might');
    if (el) {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, statValues.might || 16);
  await p.page.click('button:has-text("Join Room")');
  await p.page.waitForSelector('#chat-section:not(.hidden)', { timeout: 30000 });
}

async function dmSpawnNPC(dm, templateId = 'goblin_scout') {
  await dm.page.selectOption('#spawn-npc-type', 'aggro');
  await dm.page.selectOption('#spawn-npc-template', templateId);
  await dm.page.click('#dm-spawn-section button:has-text("Spawn")');
}

async function playerResolveEncounter(p, eid) {
  // Wait for the encounter card. There may already be one — find the latest.
  await p.page.waitForFunction(() =>
    !!document.querySelector('.msg-card--encounter:not(.msg-card--resolved) .encounter-btn'),
    { timeout: 20000 }
  );
  // Click the first option (typically the attack/might option).
  const card = await p.page.locator('.msg-card--encounter:not(.msg-card--resolved)').last();
  await card.locator('.encounter-btn').first().click();
  // If a roll button shows up, click it.
  try {
    const rollBtn = card.locator('.encounter-roll-btn');
    await rollBtn.waitFor({ state: 'visible', timeout: 4000 });
    await rollBtn.click();
  } catch (_) { /* no-roll option — fine */ }
}

async function dmAdvanceRound(dm) {
  // Wait for the Next Round button to be enabled/visible. It's hidden by default.
  // The DM's button selector is #next-round-btn.
  await dm.page.waitForSelector('#next-round-btn:not(.hidden)', { timeout: 15000 }).catch(() => {});
  await dm.page.click('#next-round-btn').catch(async () => {
    // Fallback: invoke the function directly.
    await dm.page.evaluate(() => typeof advanceRound === 'function' && advanceRound());
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats sampler
// ─────────────────────────────────────────────────────────────────────────────
async function sampleStats(peer) {
  const out = await peer.page.evaluate(async () => {
    const out = { sio: null, pcs: [], at: Date.now() };
    out.sio = window.__sioStats ? JSON.parse(JSON.stringify(window.__sioStats)) : null;
    if (window.__pcs && window.__pcs.length) {
      for (const pc of window.__pcs) {
        try {
          const stats = await pc.getStats();
          let bytesSent = 0, bytesRecv = 0, packetsSent = 0, packetsRecv = 0;
          let messagesSent = 0, messagesRecv = 0;
          let dcBytesSent = 0, dcBytesRecv = 0;
          let currentRoundTripTime = null;
          let availableOutgoingBitrate = null;
          stats.forEach((r) => {
            if (r.type === 'transport') {
              bytesSent += Number(r.bytesSent || 0);
              bytesRecv += Number(r.bytesReceived || 0);
              packetsSent += Number(r.packetsSent || 0);
              packetsRecv += Number(r.packetsReceived || 0);
            }
            if (r.type === 'data-channel') {
              messagesSent += Number(r.messagesSent || 0);
              messagesRecv += Number(r.messagesReceived || 0);
              dcBytesSent  += Number(r.bytesSent || 0);
              dcBytesRecv  += Number(r.bytesReceived || 0);
            }
            if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') {
              if (typeof r.currentRoundTripTime === 'number') currentRoundTripTime = r.currentRoundTripTime;
              if (typeof r.availableOutgoingBitrate === 'number') availableOutgoingBitrate = r.availableOutgoingBitrate;
            }
          });
          out.pcs.push({
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            bytesSent, bytesRecv, packetsSent, packetsRecv,
            messagesSent, messagesRecv, dcBytesSent, dcBytesRecv,
            rttMs: currentRoundTripTime !== null ? +(currentRoundTripTime * 1000).toFixed(1) : null,
            availableOutgoingBitrate,
          });
        } catch (e) { out.pcs.push({ error: e.message }); }
      }
    }
    return out;
  });
  out.peer = peer.label;
  return out;
}

function startSampler(peers, intervalMs = 1000) {
  const samples = [];
  const iv = setInterval(async () => {
    for (const p of peers) {
      try { samples.push(await sampleStats(p)); } catch (e) {}
    }
  }, intervalMs);
  return { samples, stop: () => clearInterval(iv) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Launching 3 Chromium contexts…');
  const dm = await launchPeer('DM');
  const p1 = await launchPeer('Player1');
  const p2 = await launchPeer('Player2');
  const peers = [dm, p1, p2];

  const phaseTimings = [];
  const t0 = performance.now();
  function mark(name) { phaseTimings.push({ name, ms: +(performance.now() - t0).toFixed(2) }); }

  // 1) Page loads (parallel)
  console.log('Loading app on all 3 peers…');
  const loads = await Promise.all(peers.map((p) => gotoApp(p)));
  loads.forEach((ms, i) => phaseTimings.push({ name: `pageload_${peers[i].label}`, ms }));
  mark('after_pageloads');

  // Start stats sampler
  const sampler = startSampler(peers, 1000);

  // 2) DM creates room
  console.log('DM starting room…');
  const roomId = await dmStartRoom(dm);
  console.log('  Room:', roomId);
  mark('dm_room_started');

  // 3) Players join
  console.log('Players joining…');
  await playerJoin(p1, roomId, 'Alice', { might: 18 });
  mark('p1_joined');
  await playerJoin(p2, roomId, 'Bob', { might: 18 });
  mark('p2_joined');

  // 4) Wait for the WebRTC mesh to come up on all 3.
  console.log('Waiting for WebRTC data channels…');
  await Promise.all(peers.map((p) => p.page.waitForFunction(() => {
    if (!window.__pcs || window.__pcs.length < 2) return false;
    return window.__pcs.every((pc) => pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
  }, { timeout: 30000 }).catch(() => null)));
  mark('mesh_connected');

  // Give the mesh ~2s to settle and exchange roster.
  await new Promise((r) => setTimeout(r, 2000));

  // 5) DM spawns aggro NPC, then run rounds until resolved or 6 rounds elapse.
  console.log('DM spawning AGGRO NPC (goblin_scout)…');
  await dmSpawnNPC(dm, 'goblin_scout');
  mark('npc_spawned');

  const ROUND_LIMIT = 6;
  let resolved = false;
  for (let r = 1; r <= ROUND_LIMIT; r++) {
    console.log(`Round ${r}: players resolve encounter…`);
    try {
      await Promise.all([
        playerResolveEncounter(p1).catch((e) => console.log(' P1:', e.message)),
        playerResolveEncounter(p2).catch((e) => console.log(' P2:', e.message)),
      ]);
    } catch (e) { console.log('  resolve err:', e.message); }
    // Wait briefly for the DM to receive both reports.
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`Round ${r}: DM advances…`);
    await dmAdvanceRound(dm);
    mark(`round_${r}_advanced`);

    // Check if the encounter resolved (NPC death) — if so, stop.
    resolved = await dm.page.evaluate(() => !document.getElementById('dm-encounter-panel'));
    if (resolved) { console.log(`  encounter resolved at round ${r}.`); break; }
  }
  mark('encounter_done');

  // Let any trailing traffic settle, then stop sampling.
  await new Promise((r) => setTimeout(r, 2000));
  sampler.stop();

  // Final snapshot
  const finalStats = [];
  for (const p of peers) finalStats.push(await sampleStats(p));

  // Save & summarize
  const report = {
    target: URL,
    timestamp: new Date().toISOString(),
    roomId,
    phaseTimings,
    samples: sampler.samples,
    finalStats,
  };
  const outPath = path.join(OUT_DIR, 'playwright-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('\nSaved:', outPath);

  // Console summary
  console.log('\nPhase timings:');
  console.table(phaseTimings.map((p) => ({ phase: p.name, ms_since_start: p.ms })));
  console.log('\nFinal per-peer Socket.IO + WebRTC totals:');
  console.table(finalStats.map((s) => {
    const pc = s.pcs.reduce((a, b) => ({
      bytesSent: a.bytesSent + (b.bytesSent || 0),
      bytesRecv: a.bytesRecv + (b.bytesRecv || 0),
      messagesSent: a.messagesSent + (b.messagesSent || 0),
      messagesRecv: a.messagesRecv + (b.messagesRecv || 0),
      dcBytesSent: a.dcBytesSent + (b.dcBytesSent || 0),
      dcBytesRecv: a.dcBytesRecv + (b.dcBytesRecv || 0),
      rttMs: b.rttMs != null ? b.rttMs : a.rttMs,
    }), { bytesSent: 0, bytesRecv: 0, messagesSent: 0, messagesRecv: 0, dcBytesSent: 0, dcBytesRecv: 0, rttMs: null });
    return {
      peer: s.peer,
      sio_pkts_sent: s.sio?.sent ?? 0,
      sio_pkts_recv: s.sio?.recv ?? 0,
      sio_bytes_sent: s.sio?.sentBytes ?? 0,
      sio_bytes_recv: s.sio?.recvBytes ?? 0,
      pcs: s.pcs.length,
      dc_msgs_sent: pc.messagesSent,
      dc_msgs_recv: pc.messagesRecv,
      dc_bytes_sent: pc.dcBytesSent,
      dc_bytes_recv: pc.dcBytesRecv,
      transport_bytes_sent: pc.bytesSent,
      transport_bytes_recv: pc.bytesRecv,
      p2p_rtt_ms: pc.rttMs,
    };
  }));

  for (const p of peers) await p.browser.close();
})().catch((err) => { console.error(err); process.exit(1); });
