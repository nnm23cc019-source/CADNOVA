import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { 
  initDatabase, 
  getDesigns, 
  getDesignById, 
  saveDesign, 
  deleteDesign,
  createUser,
  getUserByUsername,
  getUsers,
  updateUserRole,
  getComments,
  addComment,
  getLikesCount,
  hasUserLiked,
  toggleLike,
  getVersions,
  getVersionById,
  saveVersion
} from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS with support for development and production domains
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://cadnova.io',
    'http://cadnova.io',
    'https://www.cadnova.io',
    'http://www.cadnova.io'
  ],
  credentials: true
}));

app.use(express.json());

// Health Check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// --- AUTH API ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Missing username or password' });
      return;
    }
    const existing = await getUserByUsername(username);
    if (existing) {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }
    const id = 'user-' + Math.random().toString(36).substr(2, 9);
    await createUser(id, username, password, role || 'student');
    res.json({ success: true, user: { id, username, role: role || 'student' } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user || user.password !== password) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    res.json({ 
      success: true, 
      token: `mock-jwt-token-for-${username}`, 
      user: { id: user.id, username: user.username, role: user.role } 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer mock-jwt-token-for-')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const username = authHeader.replace('Bearer mock-jwt-token-for-', '');
    const user = await getUserByUsername(username);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- DESIGNS API ROUTES ---

// GET all designs metadata
app.get('/api/designs', async (req, res) => {
  try {
    const designs = await getDesigns();
    res.json(designs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET design by ID
app.get('/api/designs/:id', async (req, res) => {
  try {
    const design = await getDesignById(req.params.id);
    if (!design) {
      res.status(404).json({ error: 'Design not found' });
      return;
    }
    res.json({
      ...design,
      geometry: JSON.parse(design.geometry)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST to save (insert or update) a design
app.post('/api/designs', async (req, res) => {
  try {
    const { id, name, description, geometry } = req.body;
    if (!id || !name || geometry === undefined) {
      res.status(400).json({ error: 'Missing required fields: id, name, geometry' });
      return;
    }

    const geometryString = typeof geometry === 'string' ? geometry : JSON.stringify(geometry);
    await saveDesign(id, name, description || '', geometryString);
    res.status(200).json({ message: 'Design saved successfully', id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a design
app.delete('/api/designs/:id', async (req, res) => {
  try {
    await deleteDesign(req.params.id);
    res.json({ message: 'Design deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- COMMENTS API ---
app.get('/api/designs/:id/comments', async (req, res) => {
  try {
    const comments = await getComments(req.params.id);
    res.json(comments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/designs/:id/comments', async (req, res) => {
  try {
    const { username, content } = req.body;
    if (!username || !content) {
      res.status(400).json({ error: 'Missing username or content' });
      return;
    }
    const id = 'comment-' + Math.random().toString(36).substr(2, 9);
    await addComment(id, req.params.id, username, content);
    res.json({ success: true, comment: { id, design_id: req.params.id, username, content, created_at: new Date() } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- LIKES API ---
app.get('/api/designs/:id/likes', async (req, res) => {
  try {
    const count = await getLikesCount(req.params.id);
    const username = req.query.username as string;
    const hasLiked = username ? await hasUserLiked(req.params.id, username) : false;
    res.json({ count, hasLiked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/designs/:id/like', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      res.status(400).json({ error: 'Missing username' });
      return;
    }
    const status = await toggleLike(req.params.id, username);
    const count = await getLikesCount(req.params.id);
    res.json({ ...status, count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- VERSIONS API ---
app.get('/api/designs/:id/versions', async (req, res) => {
  try {
    const versions = await getVersions(req.params.id);
    res.json(versions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/designs/:id/versions', async (req, res) => {
  try {
    const { name, geometry } = req.body;
    if (!name || !geometry) {
      res.status(400).json({ error: 'Missing version name or geometry' });
      return;
    }
    const id = 'ver-' + Math.random().toString(36).substr(2, 9);
    const geometryString = typeof geometry === 'string' ? geometry : JSON.stringify(geometry);
    await saveVersion(id, req.params.id, name, geometryString);
    res.json({ success: true, version: { id, name, created_at: new Date() } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/designs/:id/versions/:versionId/restore', async (req, res) => {
  try {
    const version = await getVersionById(req.params.versionId);
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    const design = await getDesignById(req.params.id);
    if (!design) {
      res.status(404).json({ error: 'Design not found' });
      return;
    }
    await saveDesign(design.id, design.name, design.description, version.geometry);
    res.json({ 
      success: true, 
      message: 'Version restored successfully', 
      geometry: JSON.parse(version.geometry) 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- ADMIN API ---
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/:username/role', async (req, res) => {
  try {
    const { role } = req.body;
    await updateUserRole(req.params.username, role);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- AI COPILOT API ---
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    let reply = 'I have received your prompt. Can you clarify which mechanical parts or materials you want to analyze?';
    const lower = prompt.toLowerCase();
    
    if (lower.includes('material') || lower.includes('plastic') || lower.includes('metal')) {
      reply = '🤖 Material Selection Advice:\n- Aluminum: High tensile strength, extremely lightweight, great for structural shafts.\n- PLA Plastic: Ideal for rapid FDM 3D printing test brackets.\n- Steel: Highest load limits, heavy weight.';
    } else if (lower.includes('fillet') || lower.includes('sharp corner') || lower.includes('stress')) {
      reply = '🤖 Stress & Geometry Analysis:\nFilleting interior corners reduces geometric stress concentration factor (Kt) from 3.5 down to 1.4, enhancing mechanical cycle lifetime.';
    } else if (lower.includes('cost') || lower.includes('budget') || lower.includes('bom')) {
      const count = context?.solidsCount || 0;
      const costVal = count * 0.08 * 50; 
      reply = `🤖 Cost & Inventory Estimation:\nYour design contains ${count} 3D solids. Estimated materials cost is $${costVal.toFixed(2)} with PLA/Aluminum configurations.`;
    } else if (lower.includes('explain') || lower.includes('model')) {
      const count = context?.solidsCount || 0;
      reply = `🤖 Explain My Model:\nYour active workspace has ${count} 3D shapes. Solid volume totals approximately ${count * 125} cm³ with a safe minimum thickness threshold.`;
    } else if (lower.includes('gear')) {
      reply = '🤖 AI: I see you want a gear. Try using the "Text to CAD" tab for specific generation!';
    }

    res.json({ reply });
  } catch (error: any) {
    console.error('AI Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- SERVING STATIC ASSETS (FRONTEND) ---

// Serve the compiled build static assets of the frontend
app.use(express.static(frontendDistPath));

// Support Single Page Application (SPA) routing: fall back all unknown routes to frontend index.html
app.get('*', (req, res) => {
  res.sendFile(path.resolve(frontendDistPath, 'index.html'));
});

// Initialize database and start the Express server
async function startServer() {
  try {
    await initDatabase();
    const server = app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
      console.log(`Serving static files from ${frontendDistPath}`);
      console.log(`Website URL configured for cadnova.io`);
    });

    // ── WebSocket Server ───────────────────────────────────────────────────────
    const wss = new WebSocketServer({ server });

    // Separate sets: web browsers vs ESP32 hardware
    const webClients = new Set<WebSocket>();  // all browser WS connections
    let esp32Ws: WebSocket | null = null;     // the one ESP32 connection

    // Shared device state (single source of truth)
    let lastLedState = false;
    let lastBrightness = 75;
    let lastColor = { r: 255, g: 180, b: 40 };
    let lastRssi: number | null = null;

    // Heartbeat: backend pings ESP32 every 5 s (as requested in Requirement 8)
    const PING_INTERVAL_MS = 5000;
    const PONG_TIMEOUT_MS = 4000;
    const MAX_MISSED_PINGS = 3;

    let esp32PingTimer: NodeJS.Timeout | null = null;
    let esp32PongTimer: NodeJS.Timeout | null = null;
    let missedPingCount = 0;

    // ── Broadcast helpers ─────────────────────────────────────────────────────
    function broadcastToWeb(msg: any) {
      const str = JSON.stringify(msg);
      webClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(str);
      });
    }

    function broadcastStatus(connected: boolean, reconnecting = false) {
      const msg = { type: 'esp32_status', connected, reconnecting, rssi: lastRssi };
      broadcastToWeb(msg);
      console.log(`[STATUS] Broadcast → connected=${connected} reconnecting=${reconnecting}`);
    }

    // ── Heartbeat management ──────────────────────────────────────────────────
    function stopHeartbeat() {
      if (esp32PingTimer) { clearInterval(esp32PingTimer); esp32PingTimer = null; }
      if (esp32PongTimer) { clearTimeout(esp32PongTimer);  esp32PongTimer = null; }
      missedPingCount = 0;
    }

    function startHeartbeat() {
      stopHeartbeat();
      esp32PingTimer = setInterval(() => {
        if (!esp32Ws || esp32Ws.readyState !== WebSocket.OPEN) return;

        esp32Ws.send(JSON.stringify({ type: 'ping' }));
        console.log(`[HB] Ping sent (miss count so far: ${missedPingCount})`);

        esp32PongTimer = setTimeout(() => {
          missedPingCount++;
          console.log(`[HB] Pong timeout #${missedPingCount}/${MAX_MISSED_PINGS}`);

          if (missedPingCount >= MAX_MISSED_PINGS) {
            console.log('[HB] Max missed pings reached — terminating ESP32 connection');
            if (esp32Ws) { esp32Ws.terminate(); esp32Ws = null; }
            stopHeartbeat();
            broadcastStatus(false, false);
          } else {
            // Intermediate misses: show reconnecting
            broadcastStatus(false, true);
          }
        }, PONG_TIMEOUT_MS);
      }, PING_INTERVAL_MS);
    }

    // ── Connection handler ────────────────────────────────────────────────────
    wss.on('connection', (ws: WebSocket, req: any) => {
      const ip = req.socket.remoteAddress;
      console.log(`[WS] New connection from ${ip}`);

      ws.on('message', (raw: any) => {
        let data: any;
        try { data = JSON.parse(raw.toString()); }
        catch (e: any) { console.log('[ERR] JSON parse error: ' + e.message); return; }

        // ── ESP32 identifies itself ───────────────────────────────────────
        if (data.client === 'esp32') {
          console.log(`[ESP32] Connected from ${ip}`);
          esp32Ws = ws;
          missedPingCount = 0;

          if (data.state      !== undefined) lastLedState   = !!data.state;
          if (data.brightness !== undefined) lastBrightness = data.brightness;
          if (data.color      !== undefined) lastColor      = data.color;
          if (data.rssi       !== undefined) lastRssi       = data.rssi;

          console.log(`[ESP32] Initial state → LED=${lastLedState} brightness=${lastBrightness} color=RGB(${lastColor.r},${lastColor.g},${lastColor.b}) rssi=${lastRssi}`);

          // Restore last state from backend on reconnect/connect (Requirement 7)
          esp32Ws.send(JSON.stringify({ 
            device: 'esp32', 
            power: lastLedState, 
            brightness: lastBrightness, 
            color: lastColor 
          }));

          broadcastStatus(true);
          broadcastToWeb({ type: 'led_status', state: lastLedState, brightness: lastBrightness, rssi: lastRssi });
          startHeartbeat();
          return;
        }

        // ── Web browser identifies itself ────────────────────────────────
        if (data.client === 'web') {
          webClients.add(ws);
          console.log(`[WEB] Browser registered (total: ${webClients.size})`);
          // Send current state immediately
          ws.send(JSON.stringify({ type: 'esp32_status', connected: !!esp32Ws, rssi: lastRssi }));
          if (esp32Ws) {
            ws.send(JSON.stringify({ type: 'led_status', state: lastLedState, brightness: lastBrightness, rssi: lastRssi }));
          }
          return;
        }

        // ── Pong from ESP32 ──────────────────────────────────────────────
        if (data.type === 'pong') {
          if (esp32PongTimer) { clearTimeout(esp32PongTimer); esp32PongTimer = null; }
          missedPingCount = 0;
          if (data.rssi !== undefined) lastRssi = data.rssi;
          console.log(`[HB] Pong received → rssi=${data.rssi} uptime=${data.uptime}s`);
          // Respond so ESP32 knows server is alive
          if (esp32Ws && esp32Ws.readyState === WebSocket.OPEN) {
            esp32Ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
          }
          return;
        }

        // ── ESP32-initiated heartbeat ────────────────────────────────────
        if (data.type === 'heartbeat') {
          if (data.rssi !== undefined) lastRssi = data.rssi;
          console.log(`[HB] Heartbeat from ESP32 → rssi=${data.rssi} uptime=${data.uptime}s`);
          // ACK back
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
          }
          return;
        }

        // ── Device messages to forward to ESP32 ───────────────────────────────────
        if (data.device === 'esp32') {
          console.log(`[FORWARD] Sending to ESP32: power=${data.power} brightness=${data.brightness || 'unchanged'}`);
          if (data.power !== undefined) lastLedState = !!data.power;
          if (data.brightness !== undefined) lastBrightness = data.brightness;
          if (data.color !== undefined) lastColor = data.color;
          
          if (esp32Ws && esp32Ws.readyState === WebSocket.OPEN) {
            esp32Ws.send(JSON.stringify(data));
          } else {
            console.log('[CMD] Forward dropped — ESP32 not connected');
            ws.send(JSON.stringify({ type: 'esp32_status', connected: false }));
          }
          return;
        }

        // ── Commands from web → ESP32 ────────────────────────────────────
        if (data.type === 'set_led') {
          console.log("Request received");
          lastLedState = !!data.state; // Store state
          if (esp32Ws && esp32Ws.readyState === WebSocket.OPEN) {
            console.log("Sending command to ESP32");
            esp32Ws.send(JSON.stringify({ type: 'set_led', state: data.state }));
          } else {
            console.log('[CMD] set_led DROPPED — ESP32 not connected');
            ws.send(JSON.stringify({ type: 'esp32_status', connected: false }));
          }
          return;
        }

        if (data.type === 'set_brightness') {
          console.log(`[CMD] set_brightness → ${data.brightness}% (from web)`);
          lastBrightness = data.brightness;
          if (esp32Ws && esp32Ws.readyState === WebSocket.OPEN) {
            esp32Ws.send(JSON.stringify({ type: 'set_brightness', brightness: data.brightness }));
          } else {
            ws.send(JSON.stringify({ type: 'esp32_status', connected: false }));
          }
          return;
        }

        // ── led_status ACK from ESP32 ────────────────────────────────────
        if (data.type === 'led_status') {
          lastLedState = !!data.state;
          if (data.brightness !== undefined) lastBrightness = data.brightness;
          if (data.rssi       !== undefined) lastRssi       = data.rssi;
          console.log("ESP32 acknowledged command");
          broadcastToWeb({ type: 'led_status', state: lastLedState, brightness: lastBrightness, rssi: lastRssi });
          return;
        }
      });

      ws.on('close', (code: number, reason: any) => {
        const reasonStr = reason ? reason.toString() : '(none)';

        if (ws === esp32Ws) {
          console.log(`[ESP32] DISCONNECTED — code=${code} reason=${reasonStr}`);
          esp32Ws = null;
          stopHeartbeat();
          broadcastStatus(false, false);
        } else if (webClients.has(ws)) {
          webClients.delete(ws);
          console.log(`[WEB] Browser disconnected (remaining: ${webClients.size})`);
        } else {
          console.log(`[WS] Unknown client disconnected — code=${code}`);
        }
      });

      ws.on('error', (err: any) => {
        console.log(`[ERR] WebSocket error: ${err.message}`);
      });
    });

    console.log('[WS] WebSocket Server initialized on port ' + PORT);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

