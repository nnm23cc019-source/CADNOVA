// All-in-one LED demo: same, slow, fast, rainbow sweep
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');

const DEVICE_ID = 'esp32-01';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setBrightness(b) {
  ws.send(JSON.stringify({ type: 'set_brightness', device: 'esp32', deviceId: DEVICE_ID, brightness: b }));
}
function setColor(r, g, b) {
  ws.send(JSON.stringify({ type: 'set_color', device: 'esp32', deviceId: DEVICE_ID, color: { r, g, b } }));
}
function setLed(state) {
  ws.send(JSON.stringify({ type: 'set_led', device: 'esp32', deviceId: DEVICE_ID, state }));
}

function hsvToRgb(h, s, v) {
  let r, g, b;
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

async function sweep(label, stepMs, stepSize = 3) {
  console.log(`\n${label}`);
  for (let b = 100; b >= 10; b -= stepSize) {
    setBrightness(b);
    process.stdout.write(`\r  ▼ ${b}%  `);
    await sleep(stepMs);
  }
  await sleep(400);
  for (let b = 10; b <= 100; b += stepSize) {
    setBrightness(b);
    process.stdout.write(`\r  ▲ ${b}%  `);
    await sleep(stepMs);
  }
  await sleep(600);
}

async function rainbowSweep() {
  console.log('\n🌈  Rainbow Color Sweep (dim → full → dim cycling colors)');
  const colors = [
    { name: 'Red',    r: 255, g: 0,   b: 0   },
    { name: 'Orange', r: 255, g: 100, b: 0   },
    { name: 'Yellow', r: 255, g: 200, b: 0   },
    { name: 'Green',  r: 0,   g: 255, b: 0   },
    { name: 'Cyan',   r: 0,   g: 200, b: 255 },
    { name: 'Blue',   r: 0,   g: 0,   b: 255 },
    { name: 'Purple', r: 140, g: 0,   b: 255 },
    { name: 'White',  r: 255, g: 255, b: 255 },
  ];

  for (const col of colors) {
    setColor(col.r, col.g, col.b);
    process.stdout.write(`\r  Color: ${col.name.padEnd(8)} `);
    // dim down
    for (let b = 100; b >= 20; b -= 5) {
      setBrightness(b);
      await sleep(40);
    }
    // brighten up
    for (let b = 20; b <= 100; b += 5) {
      setBrightness(b);
      await sleep(40);
    }
    await sleep(200);
  }

  // Restore warm amber
  setColor(255, 180, 40);
  setBrightness(75);
  console.log('\n  Restored: Warm Amber 🟡');
}

async function runAllDemos() {
  setLed(true);
  await sleep(400);

  // 1. Same demo
  await sweep('⚡  [1/4] Same Demo  (100% → 10% → 100%)', 80);

  // 2. Slower (cinematic)
  await sweep('🎬  [2/4] Slow (Cinematic Fade)', 160);

  // 3. Faster (flash)
  await sweep('💥  [3/4] Fast (Quick Flash)', 25);

  // 4. Rainbow sweep
  await rainbowSweep();

  console.log('\n✅  All demos complete! LED settled at warm amber, 75%.');
  ws.close();
  process.exit(0);
}

ws.on('open', () => {
  ws.send(JSON.stringify({ client: 'web' }));
  setTimeout(runAllDemos, 300);
});
ws.on('error', (e) => console.error('WS error:', e.message));
