// Smooth brightness dim/bright demo via WebSocket
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');

const DEVICE_ID = 'esp32-01';
const DELAY_MS  = 80; // ms between steps → smooth 80-step sweep

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function send(type, payload) {
  const msg = JSON.stringify({ type, device: 'esp32', deviceId: DEVICE_ID, ...payload });
  ws.send(msg);
}

async function runDemo() {
  // 1. Make sure LED is ON
  send('set_led', { state: true });
  await sleep(400);

  console.log('▼  Dimming  100% → 10%');
  for (let b = 100; b >= 10; b -= 3) {
    send('set_brightness', { brightness: b });
    process.stdout.write(`\r  Brightness: ${b}%   `);
    await sleep(DELAY_MS);
  }

  await sleep(600);

  console.log('\n▲  Brightening  10% → 100%');
  for (let b = 10; b <= 100; b += 3) {
    send('set_brightness', { brightness: b });
    process.stdout.write(`\r  Brightness: ${b}%   `);
    await sleep(DELAY_MS);
  }

  // Settle at 75%
  await sleep(300);
  send('set_brightness', { brightness: 75 });
  console.log('\n✓  Done — settled at 75%');
  ws.close();
}

ws.on('open', () => {
  // Register as web client first
  ws.send(JSON.stringify({ client: 'web' }));
  setTimeout(runDemo, 300);
});

ws.on('message', (data) => {
  // silent — just drain acks
});

ws.on('error', (err) => console.error('WS error:', err.message));
