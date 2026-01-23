const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PEPPER = process.env.KEY_PEPPER || "pepper-change-me";

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function audit(actor, action, req, targetType = null, targetId = null, meta = {}) {
  db.prepare(
    "INSERT INTO audit_logs (actor, action, target_type, target_id, ip, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(actor, action, targetType, targetId, req.ip || "", JSON.stringify(meta || {}), new Date().toISOString());
}

function fingerprintKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey + PEPPER).digest("hex");
}

function generateRawKey() {
  return crypto.randomBytes(32).toString("hex");
}

router.post("/keys", requireAuth, (req, res) => {
  const actor = req.user.username;
  const label = (req.body && req.body.label) ? String(req.body.label) : "default";

  const rawKey = generateRawKey();
  const fp = fingerprintKey(rawKey);
  const hash = bcrypt.hashSync(rawKey, 12);
  const last4 = rawKey.slice(-4);

  const info = db.prepare(`
    INSERT INTO api_keys (label, status, key_hash, key_fingerprint, key_last4, created_at)
    VALUES (?, 'ACTIVE', ?, ?, ?, ?)
  `).run(label, hash, fp, last4, new Date().toISOString());

  audit(actor, "CREATE_KEY", req, "api_key", info.lastInsertRowid, { label });

  res.json({ id: info.lastInsertRowid, label, status: "ACTIVE", key_last4: last4, raw_key_once: rawKey });
});

router.get("/keys", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, label, status, key_last4, rotation_count, created_at, last_used_at, last_rotated_at, revoked_at, revocation_reason
    FROM api_keys ORDER BY id DESC
  `).all();
  res.json(rows);
});

router.delete("/keys/:id", requireAuth, (req, res) => {
  const actor = req.user.username;
  const id = Number(req.params.id);

  const row = db.prepare("SELECT id FROM api_keys WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Key not found" });

  db.prepare(`UPDATE api_keys SET status='REVOKED', revoked_at=?, revocation_reason='MANUAL_REVOKE' WHERE id=?`)
    .run(new Date().toISOString(), id);

  audit(actor, "REVOKE_KEY", req, "api_key", id, {});
  res.json({ ok: true });
});

router.get("/audit", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, actor, action, target_type, target_id, ip, meta, created_at
    FROM audit_logs ORDER BY id DESC LIMIT 50
  `).all();
  res.json(rows);
});

module.exports = router;
