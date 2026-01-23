const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const db = new Database("data.db");

// Tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL UNIQUE,
  key_last4 TEXT NOT NULL,
  rotation_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  last_rotated_at TEXT,
  revoked_at TEXT,
  revocation_reason TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  ip TEXT,
  meta TEXT,
  created_at TEXT NOT NULL
);
`);

// Seed admin user (simple demo login)
function seedAdmin() {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (!existing) {
    const passwordHash = bcrypt.hashSync("admin123", 10);
    db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run("admin", passwordHash, new Date().toISOString());
    console.log("Seeded admin user: admin / admin123");
  }
}
seedAdmin();

module.exports = db;
