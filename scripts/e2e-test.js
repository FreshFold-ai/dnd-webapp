const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');

const LIVE_FILE = path.join(__dirname, '..', 'LIVE_DEMO_URL.txt');

function readLiveUrl() {
  if (fs.existsSync(LIVE_FILE)) {
    return fs.readFileSync(LIVE_FILE, 'utf8').trim();
  }
  // fallback to localhost for local testing
  console.warn('LIVE_DEMO_URL.txt not found; falling back to http://localhost:3000');
  return 'http://localhost:3000';
}

const url = readLiveUrl();
console.log('Using live URL:', url);

const ROOM = 'e2e-room';

function createClient(name) {
  const socket = io(url, { reconnection: false });
  socket._name = name;
  return socket;
}

async function run() {
  return new Promise((resolve, reject) => {
    const alice = createClient('alice');
    let bob = null;

    let aliceJoined = false;
    let bobJoined = false;
    let aliceGot = null;
    let bobGot = null;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('E2E test timed out'));
    }, 20000);

    function cleanup() {
      try { alice.disconnect(); } catch (e) {}
      try { bob.disconnect(); } catch (e) {}
      clearTimeout(timeout);
    }

    alice.on('connect', () => {
      console.log('[alice] connected', alice.id);
      alice.emit('room:join', { roomId: ROOM, username: 'alice' });
    });


    alice.on('connect_error', (err) => {
      console.error('[alice] connect_error', err && err.message ? err.message : err);
    });
    

    alice.on('room:joined', () => {
      console.log('[alice] room:joined');
      aliceJoined = true;
      // create bob after alice has joined to avoid tunnel race conditions
      bob = createClient('bob');
      bob.on('room:joined', () => {
        console.log('[bob] room:joined');
        bobJoined = true;
        if (aliceJoined && bobJoined) startMessaging();
      });
      bob.on('connect', () => {
        console.log('[bob] connected', bob.id);
        bob.emit('room:join', { roomId: ROOM, username: 'bob' });
      });
      bob.on('connect_error', (err) => {
        console.error('[bob] connect_error', err && err.message ? err.message : err);
      });
      bob.on('room:message', (msg) => {
        bobGot = msg;
      });
    });

    alice.on('room:message', (msg) => {
      aliceGot = msg;
    });


    function startMessaging() {
      // alice sends
      alice.emit('room:message', { text: 'hello from alice' });
      setTimeout(() => {
        if (!bobGot || bobGot.text.indexOf('hello from alice') === -1) {
          cleanup();
          return reject(new Error('Bob did not receive alice message'));
        }
        // bob sends
        bob.emit('room:message', { text: 'hi alice, this is bob' });
        setTimeout(() => {
          if (!aliceGot || aliceGot.text.indexOf('hi alice') === -1) {
            cleanup();
            return reject(new Error('Alice did not receive bob message'));
          }
          cleanup();
          resolve('E2E messages exchanged successfully');
        }, 800);
      }, 800);
    }
  });
}

run().then((msg) => {
  console.log(msg);
  process.exit(0);
}).catch((err) => {
  console.error('E2E test failed:', err && err.message ? err.message : err);
  process.exit(1);
});
