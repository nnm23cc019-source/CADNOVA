const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  ws.send(JSON.stringify({ client: 'web' }));
  setTimeout(() => {
    // Turn LED off
    ws.send(JSON.stringify({ type: 'set_led', device: 'esp32', deviceId: 'esp32-01', state: false }));
    console.log('💤 LED turned OFF');
    setTimeout(() => { ws.close(); process.exit(0); }, 500);
  }, 300);
});
ws.on('error', (e) => console.error('WS error:', e.message));
