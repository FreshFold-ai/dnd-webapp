/**
 * public/js/p2pMesh.js
 * WebRTC full-mesh manager for the DnD Encounter Engine.
 *
 * Every peer (DM + up to 5 players) maintains a direct RTCPeerConnection +
 * RTCDataChannel with every other peer. All gameplay traffic travels over
 * these channels after the initial WebRTC handshake — the server is never
 * involved in gameplay once connections are established.
 *
 * Signaling (offer / answer / ICE candidates) is relayed through the
 * Socket.IO server via the global `socket` object, which must be initialised
 * before this file loads.
 *
 * API (exposed as window.P2PMesh):
 *   connectToPeer(peerId)           — initiate connection (you are the offerer)
 *   handleOffer(fromId, offer)      — accept incoming offer, send answer
 *   handleAnswer(fromId, answer)    — set remote description from answer
 *   handleIceCandidate(fromId, c)   — add ICE candidate
 *   broadcast(msg)                  — JSON-serialise and send to all open channels
 *   sendToPeer(peerId, msg)         — JSON-serialise and send to one peer
 *   on(type, fn)                    — register handler for message type
 *   off(type, fn)                   — remove handler
 *   getPeers()                      — return array of peerId strings with open channels
 *   closeAll()                      — close every connection (e.g. on room leave)
 */
(function (global) {
  'use strict';

  const ICE_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  /** @type {Record<string, RTCPeerConnection>} */
  const pcs = {};
  /** @type {Record<string, RTCDataChannel>} */
  const channels = {};
  /** @type {Record<string, Set<Function>>} */
  const handlers = {};

  // ── Internal helpers ──────────────────────────────────────────────────────────

  function fire(type, payload) {
    const set = handlers[type];
    if (!set) return;
    set.forEach(fn => {
      try { fn(payload); } catch (e) { console.error('[P2PMesh] handler error for', type, e); }
    });
  }

  function onMessage(data, peerId) {
    if (data instanceof ArrayBuffer) {
      fire('binary:data', { buffer: data, _from: peerId });
      return;
    }
    try {
      const msg = JSON.parse(data);
      const { t, ...rest } = msg;
      if (t) fire(t, { ...rest, _from: peerId });
    } catch (e) {
      console.warn('[P2PMesh] non-JSON frame from', peerId);
    }
  }

  function setupChannel(ch, peerId) {
    channels[peerId] = ch;
    ch.binaryType = 'arraybuffer';
    ch.onopen    = () => fire('peer:connected',    { peerId });
    ch.onclose   = () => {
      delete channels[peerId];
      fire('peer:disconnected', { peerId });
    };
    ch.onerror   = (e) => console.warn('[P2PMesh] channel error with', peerId, e);
    ch.onmessage = ({ data }) => onMessage(data, peerId);
  }

  function makePc(peerId) {
    if (pcs[peerId]) return pcs[peerId];
    const pc = new RTCPeerConnection(ICE_CFG);
    pcs[peerId] = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        // `socket` is the global Socket.IO client initialised before this script
        socket.emit('webrtc:ice-candidate', { targetId: peerId, candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') {
        delete channels[peerId];
        delete pcs[peerId];
        fire('peer:disconnected', { peerId });
      }
    };

    return pc;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Initiate a new outbound connection to `peerId`.
   * Creates an RTCPeerConnection + DataChannel, generates an offer, and
   * relays it through the signalling server.
   */
  function connectToPeer(peerId) {
    if (pcs[peerId]) return; // already in progress / connected
    const pc = makePc(peerId);
    // Accept DataChannel if the other side happens to initiate one too
    pc.ondatachannel = ({ channel }) => setupChannel(channel, peerId);
    const ch = pc.createDataChannel('game', { ordered: true });
    setupChannel(ch, peerId);
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer).then(() => offer))
      .then(offer => socket.emit('webrtc:offer', { targetId: peerId, offer }))
      .catch(e => console.error('[P2PMesh] offer failed for', peerId, e));
  }

  /**
   * Respond to an incoming offer from `fromId`.
   * Creates an RTCPeerConnection (if not yet existing), sets the remote
   * description, and sends an answer back through the server.
   */
  async function handleOffer(fromId, offer) {
    const pc = makePc(fromId);
    if (!pc.ondatachannel) {
      pc.ondatachannel = ({ channel }) => setupChannel(channel, fromId);
    }
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc:answer', { targetId: fromId, answer });
  }

  /** Apply the remote answer for an outbound offer. */
  async function handleAnswer(fromId, answer) {
    const pc = pcs[fromId];
    if (pc) {
      try { await pc.setRemoteDescription(answer); } catch (e) {}
    }
  }

  /** Add an ICE candidate received from the server relay. */
  async function handleIceCandidate(fromId, candidate) {
    const pc = pcs[fromId];
    if (pc) {
      try { await pc.addIceCandidate(candidate); } catch (e) {}
    }
  }

  /** Send `msg` (plain object) to every peer whose DataChannel is open. */
  function broadcast(msg) {
    const data = JSON.stringify(msg);
    Object.values(channels).forEach(ch => {
      if (ch.readyState === 'open') try { ch.send(data); } catch (e) {}
    });
  }

  /** Send `msg` (plain object) to a single peer. */
  function sendToPeer(peerId, msg) {
    const ch = channels[peerId];
    if (ch && ch.readyState === 'open') {
      try { ch.send(JSON.stringify(msg)); } catch (e) {}
    }
  }

  /** Send a raw ArrayBuffer to a single peer (for file transfers). */
  function sendBinaryToPeer(peerId, buffer) {
    const ch = channels[peerId];
    if (ch && ch.readyState === 'open') {
      try { ch.send(buffer); } catch (e) {}
    }
  }

  /** Register a handler for messages of the given `type` string. */
  function on(type, fn) {
    if (!handlers[type]) handlers[type] = new Set();
    handlers[type].add(fn);
  }

  /** Remove a previously registered handler. */
  function off(type, fn) {
    if (handlers[type]) handlers[type].delete(fn);
  }

  /** Return IDs of all peers that currently have an open DataChannel. */
  function getPeers() {
    return Object.keys(channels).filter(id => channels[id].readyState === 'open');
  }

  /** Close everything — call on room leave or page unload. */
  function closeAll() {
    Object.entries(pcs).forEach(([id, pc]) => {
      try { pc.close(); } catch (e) {}
      delete channels[id];
      delete pcs[id];
    });
  }

  // ── Expose ────────────────────────────────────────────────────────────────────
  global.P2PMesh = {
    connectToPeer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    broadcast,
    sendToPeer,
    sendBinaryToPeer,
    on,
    off,
    getPeers,
    closeAll,
  };
})(window);
