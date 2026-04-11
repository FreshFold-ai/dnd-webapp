const io = require('socket.io-client');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('connected as', socket.id);
  socket.emit('room:join', { roomId: 'test-room', username: 'tester' });
});

socket.on('room:joined', ({ roomId, socketId }) => {
  console.log('room:joined', { roomId, socketId });
  socket.disconnect();
  process.exit(0);
});

socket.on('room:count', (payload) => {
  console.log('room:count', payload);
});

socket.on('user:joined', (payload) => {
  console.log('user:joined', payload);
});

socket.on('connect_error', (err) => {
  console.error('connect error', err.message || err);
  process.exit(1);
});

setTimeout(() => {
  console.error('timed out waiting for room:joined');
  process.exit(2);
}, 5000);
