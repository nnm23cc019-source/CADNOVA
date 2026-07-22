import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine appropriate DB path based on environment
const isVercel = !!process.env.VERCEL;
const dbDir = isVercel ? '/tmp' : path.resolve(__dirname, '..');
const dbPath = path.join(dbDir, 'database.sqlite');

let db: any = null;
let useMemoryFallback = false;

// In-Memory Fallback Store for Serverless Environments
interface MemoryStore {
  designs: Map<string, any>;
  users: Map<string, any>;
  comments: any[];
  likes: Set<string>;
  versions: Map<string, any>;
}

const memoryStore: MemoryStore = {
  designs: new Map(),
  users: new Map(),
  comments: [],
  likes: new Set(),
  versions: new Map()
};

function seedMemoryStore() {
  if (memoryStore.users.size === 0) {
    memoryStore.users.set('admin', { id: 'user-admin', username: 'admin', password: 'admin123', role: 'admin', created_at: new Date().toISOString() });
    memoryStore.users.set('student', { id: 'user-student', username: 'student', password: 'student123', role: 'student', created_at: new Date().toISOString() });
    memoryStore.users.set('engineer', { id: 'user-engineer', username: 'engineer', password: 'engineer123', role: 'engineer', created_at: new Date().toISOString() });
  }
}

export async function initDatabase(): Promise<void> {
  // If running on Vercel or already in memory fallback mode, use in-memory store cleanly
  if (isVercel) {
    useMemoryFallback = true;
    seedMemoryStore();
    console.log('Running in Vercel Serverless environment. Initialized in-memory fallback database store.');
    return;
  }

  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Dynamic import to prevent top-level module load failure in Serverless Function cold start
    const sqlite3Module = await import('sqlite3');
    const { open } = await import('sqlite');
    const sqlite3 = sqlite3Module.default || sqlite3Module;

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

    // Create default admin and test users if empty
    const adminExists = await db.get('SELECT * FROM users WHERE username = ?', 'admin');
    if (!adminExists) {
      await db.run(
        'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
        'user-admin',
        'admin',
        'admin123',
        'admin'
      );
      await db.run(
        'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
        'user-student',
        'student',
        'student123',
        'student'
      );
      await db.run(
        'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
        'user-engineer',
        'engineer',
        'engineer123',
        'engineer'
      );
    }

    console.log('SQLite database initialized successfully at:', dbPath);
  } catch (err: any) {
    console.warn('SQLite initialization unavailable. Falling back to in-memory store:', err.message);
    useMemoryFallback = true;
    seedMemoryStore();
  }
}

export async function getDesigns() {
  try {
    if (useMemoryFallback || !db) {
      return Array.from(memoryStore.designs.values());
    }
    return await db.all('SELECT id, name, description, created_at, updated_at FROM designs ORDER BY updated_at DESC');
  } catch (err) {
    return Array.from(memoryStore.designs.values());
  }
}

export async function getDesignById(id: string) {
  try {
    if (useMemoryFallback || !db) {
      return memoryStore.designs.get(id) || null;
    }
    return await db.get('SELECT * FROM designs WHERE id = ?', id);
  } catch (err) {
    return memoryStore.designs.get(id) || null;
  }
}

export async function saveDesign(id: string, name: string, description: string, geometry: string) {
  try {
    if (useMemoryFallback || !db) {
      const now = new Date().toISOString();
      const existing = memoryStore.designs.get(id);
      const item = {
        id,
        name,
        description,
        geometry,
        created_at: existing ? existing.created_at : now,
        updated_at: now
      };
      memoryStore.designs.set(id, item);
      return item;
    }
    return await db.run(
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
  } catch (err) {
    const now = new Date().toISOString();
    const existing = memoryStore.designs.get(id);
    const item = {
      id,
      name,
      description,
      geometry,
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };
    memoryStore.designs.set(id, item);
    return item;
  }
}

export async function deleteDesign(id: string) {
  try {
    if (useMemoryFallback || !db) {
      memoryStore.designs.delete(id);
      return;
    }
    return await db.run('DELETE FROM designs WHERE id = ?', id);
  } catch (err) {
    memoryStore.designs.delete(id);
  }
}

// User helper functions
export async function createUser(id: string, username: string, passwordSecret: string, role: string) {
  try {
    if (useMemoryFallback || !db) {
      const user = { id, username, password: passwordSecret, role, created_at: new Date().toISOString() };
      memoryStore.users.set(username, user);
      return user;
    }
    return await db.run(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
      id,
      username,
      passwordSecret,
      role
    );
  } catch (err) {
    const user = { id, username, password: passwordSecret, role, created_at: new Date().toISOString() };
    memoryStore.users.set(username, user);
    return user;
  }
}

export async function getUserByUsername(username: string) {
  try {
    if (useMemoryFallback || !db) {
      return memoryStore.users.get(username) || null;
    }
    return await db.get('SELECT * FROM users WHERE username = ?', username);
  } catch (err) {
    return memoryStore.users.get(username) || null;
  }
}

export async function getUsers() {
  try {
    if (useMemoryFallback || !db) {
      return Array.from(memoryStore.users.values()).map(({ password, ...u }) => u);
    }
    return await db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC');
  } catch (err) {
    return Array.from(memoryStore.users.values()).map(({ password, ...u }) => u);
  }
}

export async function updateUserRole(username: string, role: string) {
  try {
    if (useMemoryFallback || !db) {
      const user = memoryStore.users.get(username);
      if (user) {
        user.role = role;
        memoryStore.users.set(username, user);
      }
      return;
    }
    return await db.run('UPDATE users SET role = ? WHERE username = ?', role, username);
  } catch (err) {
    const user = memoryStore.users.get(username);
    if (user) {
      user.role = role;
      memoryStore.users.set(username, user);
    }
  }
}

// Comments helper functions
export async function getComments(designId: string) {
  try {
    if (useMemoryFallback || !db) {
      return memoryStore.comments.filter(c => c.design_id === designId);
    }
    return await db.all('SELECT * FROM comments WHERE design_id = ? ORDER BY created_at ASC', designId);
  } catch (err) {
    return memoryStore.comments.filter(c => c.design_id === designId);
  }
}

export async function addComment(id: string, designId: string, username: string, content: string) {
  try {
    if (useMemoryFallback || !db) {
      const comment = { id, design_id: designId, username, content, created_at: new Date().toISOString() };
      memoryStore.comments.push(comment);
      return comment;
    }
    return await db.run(
      'INSERT INTO comments (id, design_id, username, content) VALUES (?, ?, ?, ?)',
      id,
      designId,
      username,
      content
    );
  } catch (err) {
    const comment = { id, design_id: designId, username, content, created_at: new Date().toISOString() };
    memoryStore.comments.push(comment);
    return comment;
  }
}

// Likes helper functions
export async function getLikesCount(designId: string) {
  try {
    if (useMemoryFallback || !db) {
      let count = 0;
      for (const key of memoryStore.likes) {
        if (key.startsWith(`${designId}:`)) count++;
      }
      return count;
    }
    const result = await db.get('SELECT COUNT(*) as count FROM likes WHERE design_id = ?', designId);
    return result ? (result as any).count : 0;
  } catch (err) {
    let count = 0;
    for (const key of memoryStore.likes) {
      if (key.startsWith(`${designId}:`)) count++;
    }
    return count;
  }
}

export async function hasUserLiked(designId: string, username: string) {
  try {
    if (useMemoryFallback || !db) {
      return memoryStore.likes.has(`${designId}:${username}`);
    }
    const result = await db.get('SELECT 1 FROM likes WHERE design_id = ? AND username = ?', designId, username);
    return !!result;
  } catch (err) {
    return memoryStore.likes.has(`${designId}:${username}`);
  }
}

export async function toggleLike(designId: string, username: string) {
  try {
    if (useMemoryFallback || !db) {
      const key = `${designId}:${username}`;
      if (memoryStore.likes.has(key)) {
        memoryStore.likes.delete(key);
        return { liked: false };
      } else {
        memoryStore.likes.add(key);
        return { liked: true };
      }
    }
    const exists = await hasUserLiked(designId, username);
    if (exists) {
      await db.run('DELETE FROM likes WHERE design_id = ? AND username = ?', designId, username);
      return { liked: false };
    } else {
      await db.run('INSERT INTO likes (design_id, username) VALUES (?, ?)', designId, username);
      return { liked: true };
    }
  } catch (err) {
    const key = `${designId}:${username}`;
    if (memoryStore.likes.has(key)) {
      memoryStore.likes.delete(key);
      return { liked: false };
    } else {
      memoryStore.likes.add(key);
      return { liked: true };
    }
  }
}

// Versions helper functions
export async function getVersions(designId: string) {
  try {
    if (useMemoryFallback || !db) {
      return Array.from(memoryStore.versions.values()).filter(v => v.design_id === designId);
    }
    return await db.all('SELECT id, design_id, name, created_at FROM versions WHERE design_id = ? ORDER BY created_at DESC', designId);
  } catch (err) {
    return Array.from(memoryStore.versions.values()).filter(v => v.design_id === designId);
  }
}

export async function getVersionById(versionId: string) {
  try {
    if (useMemoryFallback || !db) {
      return memoryStore.versions.get(versionId) || null;
    }
    return await db.get('SELECT * FROM versions WHERE id = ?', versionId);
  } catch (err) {
    return memoryStore.versions.get(versionId) || null;
  }
}

export async function saveVersion(id: string, designId: string, name: string, geometry: string) {
  try {
    if (useMemoryFallback || !db) {
      const ver = { id, design_id: designId, name, geometry, created_at: new Date().toISOString() };
      memoryStore.versions.set(id, ver);
      return ver;
    }
    return await db.run(
      'INSERT INTO versions (id, design_id, name, geometry) VALUES (?, ?, ?, ?)',
      id,
      designId,
      name,
      geometry
    );
  } catch (err) {
    const ver = { id, design_id: designId, name, geometry, created_at: new Date().toISOString() };
    memoryStore.versions.set(id, ver);
    return ver;
  }
}
