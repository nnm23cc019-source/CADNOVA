// c:\Users\Hrishikesh R Rao\Downloads\cad-platform\backend\server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';

// Load environment variables
dotenv.config();

let ai = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path in backend folder
const dbPath = path.resolve(__dirname, 'database.sqlite');
// Path to the frontend build assets
const frontendDistPath = path.resolve(__dirname, '../frontend/dist');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS with support for development and production domains
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://cad.io',
        'http://cad.io',
        'https://www.cad.io',
        'http://www.cad.io',
        'https://cadnova.io',
        'http://cadnova.io',
        'https://www.cadnova.io',
        'http://www.cadnova.io'
    ],
    credentials: true
}));

app.use(express.json());

// SQLite database instance
let db;

// Initialize database
async function initDatabase() {
    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Create tables
    await db.exec(`
    CREATE TABLE IF NOT EXISTS designs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      geometry TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      design_id TEXT NOT NULL,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS likes (
      design_id TEXT NOT NULL,
      username TEXT NOT NULL,
      PRIMARY KEY (design_id, username)
    );

    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      design_id TEXT NOT NULL,
      name TEXT NOT NULL,
      geometry TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create default users if empty
  const adminExists = await db.get('SELECT * FROM users WHERE username = ?', 'admin');
  if (!adminExists) {
    await db.run(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
      'user-admin',
      'admin',
      await bcrypt.hash('admin123', 10),
      'admin'
    );
    await db.run(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
      'user-student',
      'student',
      await bcrypt.hash('student123', 10),
      'student'
    );
    await db.run(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
      'user-engineer',
      'engineer',
      await bcrypt.hash('engineer123', 10),
      'engineer'
    );
  }

  console.log('SQLite database initialized at:', dbPath);
}

// Database helper functions
async function getDesigns() {
    return db.all('SELECT id, name, description, created_at, updated_at FROM designs ORDER BY updated_at DESC');
}

async function getDesignById(id) {
    return db.get('SELECT * FROM designs WHERE id = ?', id);
}

async function saveDesign(id, name, description, geometry) {
    return db.run(
        `INSERT INTO designs (id, name, description, geometry, updated_at) 
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET 
       name = excluded.name, 
       description = excluded.description, 
       geometry = excluded.geometry, 
       updated_at = CURRENT_TIMESTAMP`,
        id,
        name,
        description,
        geometry
    );
}

async function deleteDesign(id) {
    return db.run('DELETE FROM designs WHERE id = ?', id);
}

// --- API ROUTES ---

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
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
    
    if (ai) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are an expert CAD and mechanical engineering assistant for the CADNOVA.io platform. Answer concisely and professionally. Current CAD context: ' + JSON.stringify(context),
        }
      });
      reply = response.text;
    } else {
      const lower = prompt.toLowerCase();
      
      if (lower.includes('material') || lower.includes('plastic') || lower.includes('metal')) {
        reply = 'ðŸ¤– Material Selection Advice:\n- Aluminum: High tensile strength, extremely lightweight, great for structural shafts.\n- PLA Plastic: Ideal for rapid FDM 3D printing test brackets.\n- Steel: Highest load limits, heavy weight.';
      } else if (lower.includes('fillet') || lower.includes('sharp corner') || lower.includes('stress')) {
        reply = 'ðŸ¤– Stress & Geometry Analysis:\nFilleting interior corners reduces geometric stress concentration factor (Kt) from 3.5 down to 1.4, enhancing mechanical cycle lifetime.';
      } else if (lower.includes('cost') || lower.includes('budget') || lower.includes('bom')) {
        const count = context?.solidsCount || 0;
        const costVal = count * 0.08 * 50; 
        reply = `ðŸ¤– Cost & Inventory Estimation:\nYour design contains ${count} 3D solids. Estimated materials cost is $${costVal.toFixed(2)} with PLA/Aluminum configurations.`;
      } else if (lower.includes('explain') || lower.includes('model')) {
        const count = context?.solidsCount || 0;
        reply = `ðŸ¤– Explain My Model:\nYour active workspace has ${count} 3D shapes. Solid volume totals approximately ${count * 125} cmÂ³ with a safe minimum thickness threshold.`;
      } else if (lower.includes('gear')) {
        reply = 'ðŸ¤– AI: I see you want a gear. Try using the "Text to CAD" tab for specific generation!';
      }
    }

    res.json({ reply });
  } catch (error) {
    console.error('AI Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    if (ai) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are a CAD model generator. Parse the user request and return a JSON object describing a 3D shape. Supported types: cube, cylinder, gear, shaft.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['cube', 'cylinder', 'gear', 'shaft'] },
              material: { type: Type.STRING, enum: ['Aluminum', 'Steel', 'Copper', 'PLA Plastic', 'Wood'] },
              size: { type: Type.NUMBER, description: 'Size for cube' },
              radius: { type: Type.NUMBER, description: 'Radius for cylinder' },
              height: { type: Type.NUMBER, description: 'Height for cylinder' },
              teeth: { type: Type.NUMBER, description: 'Number of teeth for gear' },
              thickness: { type: Type.NUMBER, description: 'Thickness for gear' },
              diameter: { type: Type.NUMBER, description: 'Diameter for shaft' },
              length: { type: Type.NUMBER, description: 'Length for shaft' }
            },
            required: ['type']
          }
        }
      });
      
      const generatedShape = JSON.parse(response.text);
      res.json(generatedShape);
    } else {
      const lower = prompt.toLowerCase();
      let generatedShape = { type: 'cube', size: 50 };
      if (lower.includes('gear')) {
         const teethMatch = lower.match(/(\d+)\s*teeth/);
         const teeth = teethMatch ? parseInt(teethMatch[1]) : 24;
         generatedShape = { type: 'gear', teeth, thickness: 15 };
      } else if (lower.includes('cylinder')) {
         generatedShape = { type: 'cylinder', radius: 20, height: 80 };
      }
      res.json(generatedShape);
    }
  } catch (error) {
    console.error('AI Generate Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- AUTH API ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Missing username or password' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long' });
      return;
    }
    const existing = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (existing) {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }
    const id = 'user-' + Math.random().toString(36).substr(2, 9);
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
      id,
      username,
      hashedPassword,
      role || 'student'
    );
    res.json({ success: true, user: { id, username, role: role || 'student' } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    const jwtSecret = process.env.JWT_SECRET || 'cadnova-fallback-secret-42';
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, jwtSecret, { expiresIn: '7d' });
    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, username: user.username, role: user.role } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = authHeader.replace('Bearer ', '');
    const jwtSecret = process.env.JWT_SECRET || 'cadnova-fallback-secret-42';
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (e) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const user = await db.get('SELECT * FROM users WHERE username = ?', decoded.username);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all designs metadata
app.get('/api/designs', async (req, res) => {
    try {
        const designs = await getDesigns();
        res.json(designs);
    } catch (error) {
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
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST to save design (insert or update)
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
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE a design
app.delete('/api/designs/:id', async (req, res) => {
    try {
        await deleteDesign(req.params.id);
        res.json({ message: 'Design deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- COMMENTS API ---
app.get('/api/designs/:id/comments', async (req, res) => {
  try {
    const comments = await db.all('SELECT * FROM comments WHERE design_id = ? ORDER BY created_at ASC', req.params.id);
    res.json(comments);
  } catch (error) {
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
    await db.run(
      'INSERT INTO comments (id, design_id, username, content) VALUES (?, ?, ?, ?)',
      id,
      req.params.id,
      username,
      content
    );
    res.json({ success: true, comment: { id, design_id: req.params.id, username, content, created_at: new Date() } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- LIKES API ---
app.get('/api/designs/:id/likes', async (req, res) => {
  try {
    const result = await db.get('SELECT COUNT(*) as count FROM likes WHERE design_id = ?', req.params.id);
    const count = result ? result.count : 0;
    const username = req.query.username;
    let hasLiked = false;
    if (username) {
      const likedRecord = await db.get('SELECT 1 FROM likes WHERE design_id = ? AND username = ?', req.params.id, username);
      hasLiked = !!likedRecord;
    }
    res.json({ count, hasLiked });
  } catch (error) {
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
    const likedRecord = await db.get('SELECT 1 FROM likes WHERE design_id = ? AND username = ?', req.params.id, username);
    let liked = false;
    if (likedRecord) {
      await db.run('DELETE FROM likes WHERE design_id = ? AND username = ?', req.params.id, username);
      liked = false;
    } else {
      await db.run('INSERT INTO likes (design_id, username) VALUES (?, ?)', req.params.id, username);
      liked = true;
    }
    const countResult = await db.get('SELECT COUNT(*) as count FROM likes WHERE design_id = ?', req.params.id);
    const count = countResult ? countResult.count : 0;
    res.json({ liked, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- VERSIONS API ---
app.get('/api/designs/:id/versions', async (req, res) => {
  try {
    const versions = await db.all('SELECT id, design_id, name, created_at FROM versions WHERE design_id = ? ORDER BY created_at DESC', req.params.id);
    res.json(versions);
  } catch (error) {
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
    await db.run(
      'INSERT INTO versions (id, design_id, name, geometry) VALUES (?, ?, ?, ?)',
      id,
      req.params.id,
      name,
      geometryString
    );
    res.json({ success: true, version: { id, name, created_at: new Date() } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/designs/:id/versions/:versionId/restore', async (req, res) => {
  try {
    const version = await db.get('SELECT * FROM versions WHERE id = ?', req.params.versionId);
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ADMIN API ---
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/:username/role', async (req, res) => {
  try {
    const { role } = req.body;
    await db.run('UPDATE users SET role = ? WHERE username = ?', role, req.params.username);
    res.json({ success: true });
  } catch (error) {
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

// --- SERVER INITIALIZATION ---

function tsLog(tag, ...args) {
    const t = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    console.log(`[${t}][${tag}]`, ...args);
}

async function startServer() {
    try {
        await initDatabase();
        const server = app.listen(PORT, () => {
            tsLog('SERVER', `Running on port ${PORT}`);
            tsLog('SERVER', `Static files: ${frontendDistPath}`);
        });

        // â”€â”€ WebSocket Server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const wss = new WebSocketServer({ server });

        // Separate sets: web browsers vs ESP32 hardware
        const webClients   = new Set();  // all browser WS connections
        // Multi-device state tracking
        // Map: deviceId -> { ws, power, brightness, color, rssi, connectedAt, pongTimer, missedPings, reconnecting }
        const esp32Devices = new Map();

        // Heartbeat: backend pings ESP32 every 10 s
        // Mark disconnected only after 3 consecutive missed pongs
        const PING_INTERVAL_MS  = 10000;
        const PONG_TIMEOUT_MS   = 8000;
        const MAX_MISSED_PINGS  = 3;

        let globalPingTimer     = null;

        // â”€â”€ Broadcast helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        function broadcastToWeb(msg) {
            const str = JSON.stringify(msg);
            webClients.forEach(ws => {
                if (ws.readyState === 1) ws.send(str);
            });
        }

        function broadcastStatus(deviceId) {
            const dev = esp32Devices.get(deviceId);
            if (dev) {
                const msg = { type: 'esp32_status', deviceId, connected: true, reconnecting: dev.reconnecting, rssi: dev.rssi };
                broadcastToWeb(msg);
                tsLog('STATUS', `Broadcast -> ${deviceId} connected=true reconnecting=${dev.reconnecting}`);
            } else {
                const msg = { type: 'esp32_status', deviceId, connected: false, reconnecting: false };
                broadcastToWeb(msg);
                tsLog('STATUS', `Broadcast -> ${deviceId} connected=false`);
            }
        }

        function broadcastDeviceList() {
            const list = Array.from(esp32Devices.keys());
            broadcastToWeb({ type: 'esp32_devices', devices: list });
        }

        // â”€â”€ Heartbeat management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        function startGlobalHeartbeat() {
            if (globalPingTimer) return;
            globalPingTimer = setInterval(() => {
                for (const [deviceId, dev] of esp32Devices.entries()) {
                    if (dev.ws.readyState !== 1) continue;

                    dev.ws.send(JSON.stringify({ type: 'ping' }));
                    tsLog('HB', `Ping sent to ${deviceId} (miss: ${dev.missedPings})`);

                    if (dev.pongTimer) clearTimeout(dev.pongTimer);
                    dev.pongTimer = setTimeout(() => {
                        dev.missedPings++;
                        tsLog('HB', `Pong timeout ${deviceId} #${dev.missedPings}/${MAX_MISSED_PINGS}`);

                        if (dev.missedPings >= MAX_MISSED_PINGS) {
                            tsLog('HB', `Max missed pings reached — terminating ${deviceId}`);
                            dev.ws.terminate();
                            esp32Devices.delete(deviceId);
                            broadcastStatus(deviceId);
                            broadcastDeviceList();
                        } else {
                            dev.reconnecting = true;
                            broadcastStatus(deviceId);
                        }
                    }, PONG_TIMEOUT_MS);
                }
            }, PING_INTERVAL_MS);
        }
        startGlobalHeartbeat();

        // â”€â”€ Connection handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        wss.on('connection', (ws, req) => {
            const ip = req.socket.remoteAddress;
            tsLog('WS', `New connection from ${ip}`);

            ws.on('message', (raw) => {
                let data;
                try { data = JSON.parse(raw); }
                catch (e) { tsLog('ERR', 'JSON parse error: ' + e.message); return; }

                // â”€â”€ ESP32 identifies itself â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                if (data.client === 'esp32') {
                    const deviceId = data.deviceId || 'esp32-default';
                    ws.esp32Id = deviceId; // tag the websocket
                    tsLog('ESP32', `Connected ${deviceId} from ${ip}`);
                    
                    const dev = {
                        ws,
                        power: data.state !== undefined ? !!data.state : false,
                        brightness: data.brightness !== undefined ? data.brightness : 75,
                        color: data.color || { r: 255, g: 180, b: 40 },
                        rssi: data.rssi,
                        connectedAt: Date.now(),
                        missedPings: 0,
                        reconnecting: false,
                        pongTimer: null
                    };
                    esp32Devices.set(deviceId, dev);

                    tsLog('ESP32', `Initial state -> LED=${dev.power} brightness=${dev.brightness} rssi=${dev.rssi}`);

                    // Restore last state from backend on reconnect/connect (Requirement 7)
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({ 
                            device: 'esp32', 
                            power: dev.power, 
                            brightness: dev.brightness, 
                            color: dev.color 
                        }));
                    }

                    broadcastDeviceList();
                    broadcastStatus(deviceId);
                    broadcastToWeb({ type: 'led_status', deviceId, state: dev.power, brightness: dev.brightness, rssi: dev.rssi });
                    return;
                }

                // ── Web browser identifies itself ─────────────────────────────────────────
                if (data.client === 'web') {
                    webClients.add(ws);
                    tsLog('WEB', `Browser registered (total: ${webClients.size})`);
                    
                    ws.send(JSON.stringify({ type: 'esp32_devices', devices: Array.from(esp32Devices.keys()) }));
                    for (const [deviceId, dev] of esp32Devices.entries()) {
                        ws.send(JSON.stringify({ type: 'esp32_status', deviceId, connected: true, rssi: dev.rssi }));
                        ws.send(JSON.stringify({ type: 'led_status', deviceId, state: dev.power, brightness: dev.brightness, rssi: dev.rssi }));
                    }
                    return;
                }

                // ── Pong from ESP32 ──────────────────────────────────────────────────────
                if (data.type === 'pong' && ws.esp32Id) {
                    const dev = esp32Devices.get(ws.esp32Id);
                    if (dev) {
                        if (dev.pongTimer) clearTimeout(dev.pongTimer);
                        dev.missedPings = 0;
                        dev.reconnecting = false;
                        if (data.rssi !== undefined) dev.rssi = data.rssi;
                        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
                    }
                    return;
                }

                // ── ESP32-initiated heartbeat ─────────────────────────────────────────────
                if (data.type === 'heartbeat' && ws.esp32Id) {
                    const dev = esp32Devices.get(ws.esp32Id);
                    if (dev) {
                        if (data.rssi !== undefined) dev.rssi = data.rssi;
                        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
                    }
                    return;
                }

                // ── Device messages to forward to ESP32 ───────────────────────────────────
                if (data.device === 'esp32') {
                    const deviceId = data.deviceId || 'esp32-default';
                    const dev = esp32Devices.get(deviceId);
                    
                    if (dev && dev.ws.readyState === 1) {
                        if (data.power !== undefined) dev.power = !!data.power;
                        if (data.brightness !== undefined) dev.brightness = data.brightness;
                        if (data.color !== undefined) dev.color = data.color;
                        dev.ws.send(JSON.stringify(data));
                    } else {
                        ws.send(JSON.stringify({ type: 'esp32_status', deviceId, connected: false }));
                    }
                    return;
                }

                // ── Commands from web → ESP32 ────────────────────────────────────
                if (data.type === 'set_led') {
                    const deviceId = data.deviceId || 'esp32-default';
                    const dev = esp32Devices.get(deviceId);
                    if (dev && dev.ws.readyState === 1) {
                        dev.ws.send(JSON.stringify({ type: 'set_led', state: data.state }));
                    } else {
                        ws.send(JSON.stringify({ type: 'esp32_status', deviceId, connected: false }));
                    }
                    return;
                }

                if (data.type === 'set_brightness') {
                    const deviceId = data.deviceId || 'esp32-default';
                    const dev = esp32Devices.get(deviceId);
                    if (dev && dev.ws.readyState === 1) {
                        dev.ws.send(JSON.stringify({ type: 'set_brightness', brightness: data.brightness }));
                    } else {
                        ws.send(JSON.stringify({ type: 'esp32_status', deviceId, connected: false }));
                    }
                    return;
                }

                // â”€â”€ led_status ACK from ESP32 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                if (data.type === 'led_status' && ws.esp32Id) {
                    const dev = esp32Devices.get(ws.esp32Id);
                    if (dev) {
                        dev.power = !!data.state;
                        if (data.brightness !== undefined) dev.brightness = data.brightness;
                        if (data.rssi !== undefined) dev.rssi = data.rssi;
                        broadcastToWeb({ type: 'led_status', deviceId: ws.esp32Id, state: dev.power, brightness: dev.brightness, rssi: dev.rssi });
                    }
                    return;
                }
            });

            ws.on('close', (code, reason) => {
                const reasonStr = reason ? reason.toString() : '(none)';

                if (ws.esp32Id) {
                    tsLog('ESP32', `DISCONNECTED ${ws.esp32Id} — code=${code} reason=${reasonStr}`);
                    esp32Devices.delete(ws.esp32Id);
                    broadcastStatus(ws.esp32Id);
                    broadcastDeviceList();
                } else if (webClients.has(ws)) {
                    webClients.delete(ws);
                    tsLog('WEB', `Browser disconnected (remaining: ${webClients.size})`);
                } else {
                    tsLog('WS', `Unknown client disconnected â€” code=${code}`);
                }
            });

            ws.on('error', (err) => {
                tsLog('ERR', `WebSocket error: ${err.message}`);
            });
        });

        tsLog('SERVER', 'WebSocket server ready');

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

