/**
 * Network benchmark for https://dnd-webapp-9fs4.onrender.com/
 *
 * Simulates 1 DM + 2 Players over Socket.IO and measures:
 *   - HTTP cold/warm load (page + critical assets)
 *   - Signaling RTT (room:start, room:join, webrtc:offer/answer/ice-candidate)
 *   - Packet count and bytes per peer
 *
 * NOTE: Actual gameplay traffic in this app flows P2P over WebRTC data
 * channels and never reaches the server, so it cannot be measured from
 * outside a real browser. This bench only measures the signaling layer
 * + static asset delivery.
 */

const { io } = require('socket.io-client');
const https = require('https');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

const URL = process.env.TARGET_URL || 'https://dnd-webapp-9fs4.onrender.com';
const OUT_DIR = path.join(__dirname, 'results');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ──────────────────────────────────────────────────────────────────────────────
// HTTP probes
// ──────────────────────────────────────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    let firstByteAt = null;
    https.get(url, (res) => {
      let bytes = 0;
      res.on('data', (chunk) => {
        if (firstByteAt === null) firstByteAt = performance.now();
        bytes += chunk.length;
      });
      res.on('end', () => {
        resolve({
          url,
          status: res.statusCode,
          ttfbMs: firstByteAt !== null ? +(firstByteAt - t0).toFixed(2) : null,
          totalMs: +(performance.now() - t0).toFixed(2),
          bytes,
        });
      });
    }).on('error', reject);
  });
}

async function probeHttp() {
  const targets = [
    `${URL}/`,
    `${URL}/js/app.js`,
    `${URL}/js/p2pMesh.js`,
    `${URL}/js/catalog.js`,
    `${URL}/css/styles.css`,
    `${URL}/socket.io/socket.io.js`,
  ];
  const out = [];
  for (const t of targets) {
    try { out.push(await httpGet(t)); }
    catch (e) { out.push({ url: t, error: e.message }); }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Socket.IO instrumentation
// ──────────────────────────────────────────────────────────────────────────────
function makeClient(label) {
  const stats = {
    label,
    sent: 0, recv: 0,
    sentBytes: 0, recvBytes: 0,
    events: { sent: {}, recv: {} },
    timeline: [],
    createdAt: performance.now(),
    connectedAt: null,
  };

  const sock = io(URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    autoConnect: true,
  });
  sock.once('connect', () => { stats.connectedAt = performance.now(); });

  // Wrap emit to count outbound packets (best-effort sizing)
  const origEmit = sock.emit.bind(sock);
  sock.emit = (ev, ...args) => {
    const sz = Buffer.byteLength(JSON.stringify([ev, ...args]));
    stats.sent++;
    stats.sentBytes += sz;
    stats.events.sent[ev] = (stats.events.sent[ev] || 0) + 1;
    stats.timeline.push({ t: performance.now(), dir: 'out', ev, bytes: sz });
    return origEmit(ev, ...args);
  };

  sock.onAny((ev, ...args) => {
    const sz = Buffer.byteLength(JSON.stringify([ev, ...args]));
    stats.recv++;
    stats.recvBytes += sz;
    stats.events.recv[ev] = (stats.events.recv[ev] || 0) + 1;
    stats.timeline.push({ t: performance.now(), dir: 'in', ev, bytes: sz });
  });

  return { sock, stats };
}

function waitFor(sock, ev, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), timeoutMs);
    sock.once(ev, (payload) => { clearTimeout(to); resolve(payload); });
  });
}

async function timed(label, fn) {
  const t0 = performance.now();
  const v = await fn();
  const dt = +(performance.now() - t0).toFixed(2);
  return { label, ms: dt, value: v };
}

// ──────────────────────────────────────────────────────────────────────────────
// Scenario: 1 DM + 2 Players → join → simulate WebRTC signaling pairs
// ──────────────────────────────────────────────────────────────────────────────
async function runScenario() {
  const dm = makeClient('DM');
  const p1 = makeClient('Player1');
  const p2 = makeClient('Player2');

  const phaseTimings = [];

  // Connect all three (already auto-connecting; wait for stats.connectedAt)
  async function awaitConnected(c, name) {
    const t0 = performance.now();
    while (c.stats.connectedAt === null) {
      if (performance.now() - t0 > 10000) throw new Error(`timeout connecting ${name}`);
      await new Promise(r => setTimeout(r, 10));
    }
    return { label: `connect_${name}`, ms: +(c.stats.connectedAt - c.stats.createdAt).toFixed(2) };
  }
  phaseTimings.push(await awaitConnected(dm, 'dm'));
  phaseTimings.push(await awaitConnected(p1, 'p1'));
  phaseTimings.push(await awaitConnected(p2, 'p2'));

  // DM creates room
  const roomCreate = await timed('room_create', async () => {
    dm.sock.emit('room:start', {
      roomType: 'BenchRoom',
      dmName: 'BenchDM',
      roomPassword: 'pw',
    });
    return await waitFor(dm.sock, 'room:joined');
  });
  phaseTimings.push(roomCreate);
  const roomId = roomCreate.value.roomId;

  // Player1 joins
  phaseTimings.push(await timed('p1_join', async () => {
    p1.sock.emit('room:join', { roomId, username: 'Alice', password: 'pw', character: { name: 'Alice', stats: { might: 14 } } });
    return await waitFor(p1.sock, 'room:joined');
  }));
  // DM should also see peer:joined
  await waitFor(dm.sock, 'peer:joined').catch(() => {});

  // Player2 joins
  phaseTimings.push(await timed('p2_join', async () => {
    p2.sock.emit('room:join', { roomId, username: 'Bob', password: 'pw', character: { name: 'Bob', stats: { might: 12 } } });
    return await waitFor(p2.sock, 'room:joined');
  }));
  await waitFor(dm.sock, 'peer:joined').catch(() => {});
  await waitFor(p1.sock, 'peer:joined').catch(() => {});

  // Simulate WebRTC signaling exchanges (offer/answer/ICE) between each pair.
  // We don't establish real WebRTC; we measure the relay round-trip.
  const signalingRtts = [];
  async function signalRtt(from, to, kind, payload) {
    const t0 = performance.now();
    const pending = waitFor(to.sock, `webrtc:${kind}`, 5000);
    from.sock.emit(`webrtc:${kind}`, { targetId: to.sock.id, [kind === 'ice-candidate' ? 'candidate' : kind]: payload });
    await pending;
    return +(performance.now() - t0).toFixed(2);
  }

  const pairs = [
    ['DM↔P1', dm, p1],
    ['DM↔P2', dm, p2],
    ['P1↔P2', p1, p2],
  ];
  const FAKE_SDP = 'v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=application 9 DTLS/SCTP 5000\r\nc=IN IP4 0.0.0.0\r\na=sctpmap:5000 webrtc-datachannel 1024\r\n';
  const FAKE_ICE = { candidate: 'candidate:1 1 UDP 2122252543 192.0.2.1 49152 typ host', sdpMid: '0', sdpMLineIndex: 0 };

  for (const [name, a, b] of pairs) {
    for (let i = 0; i < 5; i++) {
      const rttOffer  = await signalRtt(a, b, 'offer',  { type: 'offer',  sdp: FAKE_SDP });
      const rttAnswer = await signalRtt(b, a, 'answer', { type: 'answer', sdp: FAKE_SDP });
      const rttIce1   = await signalRtt(a, b, 'ice-candidate', FAKE_ICE);
      const rttIce2   = await signalRtt(b, a, 'ice-candidate', FAKE_ICE);
      signalingRtts.push({ pair: name, iter: i, offer: rttOffer, answer: rttAnswer, ice_a_to_b: rttIce1, ice_b_to_a: rttIce2 });
    }
  }

  // Settle to capture any trailing packets
  await new Promise(r => setTimeout(r, 400));

  dm.sock.disconnect();
  p1.sock.disconnect();
  p2.sock.disconnect();

  return {
    roomId,
    phaseTimings,
    signalingRtts,
    perPeer: {
      DM: summarize(dm.stats),
      Player1: summarize(p1.stats),
      Player2: summarize(p2.stats),
    },
  };
}

function summarize(s) {
  return {
    label: s.label,
    packetsSent: s.sent,
    packetsRecv: s.recv,
    bytesSent: s.sentBytes,
    bytesRecv: s.recvBytes,
    eventsSent: s.events.sent,
    eventsRecv: s.events.recv,
  };
}

function pct(arr, p) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a,b)=>a-b);
  const idx = Math.min(sorted.length - 1, Math.floor((p/100) * sorted.length));
  return sorted[idx];
}
function mean(arr){ return arr.length ? +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : null; }

(async () => {
  console.log(`Target: ${URL}`);
  console.log('1) HTTP probes…');
  const http = await probeHttp();
  console.table(http.map(r => ({ url: r.url.replace(URL,''), status: r.status, ttfbMs: r.ttfbMs, totalMs: r.totalMs, KB: r.bytes ? +(r.bytes/1024).toFixed(1) : null })));

  console.log('\n2) Signaling scenario (1 DM + 2 Players)…');
  const scenario = await runScenario();

  // Aggregate signaling RTT
  const allRtts = [];
  scenario.signalingRtts.forEach(r => allRtts.push(r.offer, r.answer, r.ice_a_to_b, r.ice_b_to_a));
  const rttSummary = {
    samples: allRtts.length,
    min: Math.min(...allRtts),
    mean: mean(allRtts),
    p50: pct(allRtts, 50),
    p95: pct(allRtts, 95),
    max: Math.max(...allRtts),
  };

  console.log('\nPhase timings (ms):');
  console.table(scenario.phaseTimings.map(p => ({ phase: p.label, ms: p.ms })));

  console.log('\nSignaling RTT (ms):');
  console.table([rttSummary]);

  console.log('\nPer-peer packet/byte counts:');
  console.table(Object.values(scenario.perPeer).map(p => ({
    peer: p.label, sent: p.packetsSent, recv: p.packetsRecv,
    bytesSent: p.bytesSent, bytesRecv: p.bytesRecv,
  })));

  const report = {
    target: URL,
    timestamp: new Date().toISOString(),
    http,
    scenario,
    rttSummary,
  };
  const outPath = path.join(OUT_DIR, 'bench-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nSaved: ${outPath}`);
})().catch(err => { console.error(err); process.exit(1); });
