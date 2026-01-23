const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();
const PEPPER = process.env.KEY_PEPPER || "pepper-change-me";

function fingerprintKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey + PEPPER).digest("hex");
}
function generateRawKey() {
  return crypto.randomBytes(32).toString("hex");
}
function audit(action, req, keyId, meta = {}) {
  db.prepare(
    "INSERT INTO audit_logs (actor, action, target_type, target_id, ip, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("client", action, "api_key", keyId, req.ip || "", JSON.stringify(meta || {}), new Date().toISOString());
}

router.post("/access", (req, res) => {
  const rawKey = req.headers["x-api-key"];
  if (!rawKey) return res.status(400).json({ error: "Missing x-api-key header" });

  const fp = fingerprintKey(String(rawKey));
  const row = db.prepare("SELECT * FROM api_keys WHERE key_fingerprint = ?").get(fp);
  if (!row) return res.status(401).json({ error: "Invalid key" });
  if (row.status !== "ACTIVE") return res.status(403).json({ error: `Key not active (${row.status})` });

  const ok = bcrypt.compareSync(String(rawKey), row.key_hash);
  if (!ok) return res.status(401).json({ error: "Invalid key" });

  db.prepare("UPDATE api_keys SET last_used_at=? WHERE id=?")
    .run(new Date().toISOString(), row.id);
  audit("KEY_USED", req, row.id, {});

  // Rotate after use (Option A)
  const newKey = generateRawKey();
  const newFp = fingerprintKey(newKey);
  const newHash = bcrypt.hashSync(newKey, 12);
  const newLast4 = newKey.slice(-4);

  db.prepare(`
    UPDATE api_keys
    SET key_hash=?, key_fingerprint=?, key_last4=?, rotation_count=rotation_count+1, last_rotated_at=?
    WHERE id=?
  `).run(newHash, newFp, newLast4, new Date().toISOString(), row.id);

  audit("KEY_ROTATED", req, row.id, {});

  res.json({
    access: "granted",
    asset: { id: "asset-001", message: "Sensitive asset accessed successfully." },
    rotated_key_once: newKey
  });
});

module.exports = router;
