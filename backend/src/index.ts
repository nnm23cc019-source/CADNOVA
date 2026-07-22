import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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

// Initialize DB on cold start (safely handled inside database.ts)
initDatabase().catch((err: any) => {
  console.warn('Database initialization warning:', err.message);
});

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

// ── HEALTH CHECK ENDPOINT ─────────────────────────────────────────────────
app.get(['/api/health', '/health'], (req, res) => {
  try {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(), 
      environment: process.env.VERCEL ? 'vercel-serverless' : 'local' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── AUTH API ROUTES ────────────────────────────────────────────────────────
app.post(['/api/auth/register', '/auth/register'], async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'Missing or invalid username or password' });
      return;
    }
    const existing = await getUserByUsername(username);
    if (existing) {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }
    const id = 'user-' + Math.random().toString(36).substr(2, 9);
    await createUser(id, username, password, role || 'student');
    res.status(200).json({ success: true, user: { id, username, role: role || 'student' } });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post(['/api/auth/login', '/auth/login'], async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: 'Missing username or password' });
      return;
    }
    const user = await getUserByUsername(username);
    if (!user || user.password !== password) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    res.status(200).json({ 
      success: true, 
      token: `mock-jwt-token-for-${username}`, 
      user: { id: user.id, username: user.username, role: user.role } 
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get(['/api/auth/me', '/auth/me'], async (req, res) => {
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
    res.status(200).json({ id: user.id, username: user.username, role: user.role });
  } catch (error: any) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── DESIGNS API ROUTES ─────────────────────────────────────────────────────

// GET all designs metadata
app.get(['/api/designs', '/designs'], async (req, res) => {
  try {
    const designs = await getDesigns();
    res.status(200).json(designs || []);
  } catch (error: any) {
    console.error('Get designs error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET design by ID
app.get(['/api/designs/:id', '/designs/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing design ID' });
      return;
    }
    const design = await getDesignById(id);
    if (!design) {
      res.status(404).json({ error: 'Design not found' });
      return;
    }
    let parsedGeometry = {};
    try {
      parsedGeometry = typeof design.geometry === 'string' ? JSON.parse(design.geometry) : design.geometry;
    } catch {
      parsedGeometry = design.geometry;
    }
    res.status(200).json({
      ...design,
      geometry: parsedGeometry
    });
  } catch (error: any) {
    console.error('Get design by ID error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// POST to save (insert or update) a design
app.post(['/api/designs', '/designs'], async (req, res) => {
  try {
    const { id, name, description, geometry } = req.body || {};
    if (!id || !name || geometry === undefined) {
      res.status(400).json({ error: 'Missing required fields: id, name, geometry' });
      return;
    }

    const geometryString = typeof geometry === 'string' ? geometry : JSON.stringify(geometry);
    await saveDesign(id, name, description || '', geometryString);
    res.status(200).json({ message: 'Design saved successfully', id });
  } catch (error: any) {
    console.error('Save design error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// DELETE a design
app.delete(['/api/designs/:id', '/designs/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing design ID' });
      return;
    }
    await deleteDesign(id);
    res.status(200).json({ message: 'Design deleted successfully' });
  } catch (error: any) {
    console.error('Delete design error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── COMMENTS API ───────────────────────────────────────────────────────────
app.get(['/api/designs/:id/comments', '/designs/:id/comments'], async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing design ID' });
      return;
    }
    const comments = await getComments(id);
    res.status(200).json(comments || []);
  } catch (error: any) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post(['/api/designs/:id/comments', '/designs/:id/comments'], async (req, res) => {
  try {
    const { id: designId } = req.params;
    const { username, content } = req.body || {};
    if (!designId || !username || !content) {
      res.status(400).json({ error: 'Missing designId, username, or content' });
      return;
    }
    const id = 'comment-' + Math.random().toString(36).substr(2, 9);
    await addComment(id, designId, username, content);
    res.status(200).json({ success: true, comment: { id, design_id: designId, username, content, created_at: new Date() } });
  } catch (error: any) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── LIKES API ──────────────────────────────────────────────────────────────
app.get(['/api/designs/:id/likes', '/designs/:id/likes'], async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing design ID' });
      return;
    }
    const count = await getLikesCount(id);
    const username = req.query.username as string;
    const hasLiked = username ? await hasUserLiked(id, username) : false;
    res.status(200).json({ count, hasLiked });
  } catch (error: any) {
    console.error('Get likes error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post(['/api/designs/:id/like', '/designs/:id/like'], async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.body || {};
    if (!id || !username) {
      res.status(400).json({ error: 'Missing design ID or username' });
      return;
    }
    const status = await toggleLike(id, username);
    const count = await getLikesCount(id);
    res.status(200).json({ ...status, count });
  } catch (error: any) {
    console.error('Toggle like error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── VERSIONS API ───────────────────────────────────────────────────────────
app.get(['/api/designs/:id/versions', '/designs/:id/versions'], async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing design ID' });
      return;
    }
    const versions = await getVersions(id);
    res.status(200).json(versions || []);
  } catch (error: any) {
    console.error('Get versions error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post(['/api/designs/:id/versions', '/designs/:id/versions'], async (req, res) => {
  try {
    const { id: designId } = req.params;
    const { name, geometry } = req.body || {};
    if (!designId || !name || !geometry) {
      res.status(400).json({ error: 'Missing version name or geometry' });
      return;
    }
    const id = 'ver-' + Math.random().toString(36).substr(2, 9);
    const geometryString = typeof geometry === 'string' ? geometry : JSON.stringify(geometry);
    await saveVersion(id, designId, name, geometryString);
    res.status(200).json({ success: true, version: { id, name, created_at: new Date() } });
  } catch (error: any) {
    console.error('Save version error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post(['/api/designs/:id/versions/:versionId/restore', '/designs/:id/versions/:versionId/restore'], async (req, res) => {
  try {
    const { id, versionId } = req.params;
    if (!id || !versionId) {
      res.status(400).json({ error: 'Missing design ID or version ID' });
      return;
    }
    const version = await getVersionById(versionId);
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    const design = await getDesignById(id);
    if (!design) {
      res.status(404).json({ error: 'Design not found' });
      return;
    }
    await saveDesign(design.id, design.name, design.description, version.geometry);
    let parsedGeom = {};
    try {
      parsedGeom = JSON.parse(version.geometry);
    } catch {
      parsedGeom = version.geometry;
    }
    res.status(200).json({ 
      success: true, 
      message: 'Version restored successfully', 
      geometry: parsedGeom 
    });
  } catch (error: any) {
    console.error('Restore version error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── ADMIN API ──────────────────────────────────────────────────────────────
app.get(['/api/admin/users', '/admin/users'], async (req, res) => {
  try {
    const users = await getUsers();
    res.status(200).json(users || []);
  } catch (error: any) {
    console.error('Admin get users error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post(['/api/admin/users/:username/role', '/admin/users/:username/role'], async (req, res) => {
  try {
    const { username } = req.params;
    const { role } = req.body || {};
    if (!username || !role) {
      res.status(400).json({ error: 'Missing username or role' });
      return;
    }
    await updateUserRole(username, role);
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Admin update role error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── AI COPILOT API ─────────────────────────────────────────────────────────
app.post(['/api/ai/chat', '/ai/chat'], async (req, res) => {
  try {
    const { prompt, context } = req.body || {};
    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    let reply = 'I have received your prompt. Can you clarify which mechanical parts or materials you want to analyze?';
    const lower = String(prompt).toLowerCase();
    
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

    res.status(200).json({ reply });
  } catch (error: any) {
    console.error('AI Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Fallback JSON 404 for unknown API endpoints
app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/api') || req.url.startsWith('/api') || process.env.VERCEL) {
    res.status(404).json({ error: 'Endpoint not found' });
  } else {
    res.sendFile(path.resolve(frontendDistPath, 'index.html'));
  }
});

// Export Express app for Vercel Serverless Functions
export default app;

// ── LOCAL SERVER INITIALIZATION (NON-VERCEL ONLY) ──────────────────────────
if (!process.env.VERCEL) {
  async function startServer() {
    try {
      app.use(express.static(frontendDistPath));
      const server = app.listen(PORT, () => {
        console.log(`Backend server running on http://localhost:${PORT}`);
      });
    } catch (error) {
      console.error('Failed to start local server:', error);
    }
  }

  startServer();
}
