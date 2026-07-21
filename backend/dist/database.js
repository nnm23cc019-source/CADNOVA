import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../database.sqlite');
let db;
export async function initDatabase() {
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
      role TEXT NOT NULL, -- 'student', 'engineer', 'admin'
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
    // Create a default admin and test user if empty
    const adminExists = await db.get('SELECT * FROM users WHERE username = ?', 'admin');
    if (!adminExists) {
        await db.run('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', 'user-admin', 'admin', 'admin123', // In production we would hash this, for CADNOVA prototype it serves as robust validation
        'admin');
        await db.run('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', 'user-student', 'student', 'student123', 'student');
        await db.run('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', 'user-engineer', 'engineer', 'engineer123', 'engineer');
    }
    console.log('SQLite database initialized at:', dbPath);
}
export async function getDesigns() {
    return db.all('SELECT id, name, description, created_at, updated_at FROM designs ORDER BY updated_at DESC');
}
export async function getDesignById(id) {
    return db.get('SELECT * FROM designs WHERE id = ?', id);
}
export async function saveDesign(id, name, description, geometry) {
    return db.run(`INSERT INTO designs (id, name, description, geometry, updated_at) 
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET 
       name = excluded.name, 
       description = excluded.description, 
       geometry = excluded.geometry, 
       updated_at = CURRENT_TIMESTAMP`, id, name, description, geometry);
}
export async function deleteDesign(id) {
    return db.run('DELETE FROM designs WHERE id = ?', id);
}
// User helper functions
export async function createUser(id, username, passwordSecret, role) {
    return db.run('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', id, username, passwordSecret, role);
}
export async function getUserByUsername(username) {
    return db.get('SELECT * FROM users WHERE username = ?', username);
}
export async function getUsers() {
    return db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC');
}
export async function updateUserRole(username, role) {
    return db.run('UPDATE users SET role = ? WHERE username = ?', role, username);
}
// Comments helper functions
export async function getComments(designId) {
    return db.all('SELECT * FROM comments WHERE design_id = ? ORDER BY created_at ASC', designId);
}
export async function addComment(id, designId, username, content) {
    return db.run('INSERT INTO comments (id, design_id, username, content) VALUES (?, ?, ?, ?)', id, designId, username, content);
}
// Likes helper functions
export async function getLikesCount(designId) {
    const result = await db.get('SELECT COUNT(*) as count FROM likes WHERE design_id = ?', designId);
    return result ? result.count : 0;
}
export async function hasUserLiked(designId, username) {
    const result = await db.get('SELECT 1 FROM likes WHERE design_id = ? AND username = ?', designId, username);
    return !!result;
}
export async function toggleLike(designId, username) {
    const exists = await hasUserLiked(designId, username);
    if (exists) {
        await db.run('DELETE FROM likes WHERE design_id = ? AND username = ?', designId, username);
        return { liked: false };
    }
    else {
        await db.run('INSERT INTO likes (design_id, username) VALUES (?, ?)', designId, username);
        return { liked: true };
    }
}
// Versions helper functions
export async function getVersions(designId) {
    return db.all('SELECT id, design_id, name, created_at FROM versions WHERE design_id = ? ORDER BY created_at DESC', designId);
}
export async function getVersionById(versionId) {
    return db.get('SELECT * FROM versions WHERE id = ?', versionId);
}
export async function saveVersion(id, designId, name, geometry) {
    return db.run('INSERT INTO versions (id, design_id, name, geometry) VALUES (?, ?, ?, ?)', id, designId, name, geometry);
}
