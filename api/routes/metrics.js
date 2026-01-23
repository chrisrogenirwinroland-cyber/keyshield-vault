const express = require("express");
const client = require("prom-client");
const db = require("../db");

const router = express.Router();
client.collectDefaultMetrics();

const activeKeysGauge = new client.Gauge({ name: "active_keys_total", help: "Active keys" });
const revokedKeysGauge = new client.Gauge({ name: "revoked_keys_total", help: "Revoked keys" });
const rotationGauge = new client.Gauge({ name: "key_rotations_sum", help: "Sum of rotation_count across keys" });

router.get("/metrics", async (req, res) => {
  const active = db.prepare("SELECT COUNT(*) as c FROM api_keys WHERE status='ACTIVE'").get().c;
  const revoked = db.prepare("SELECT COUNT(*) as c FROM api_keys WHERE status='REVOKED'").get().c;
  const rotSum = db.prepare("SELECT COALESCE(SUM(rotation_count),0) as s FROM api_keys").get().s;

  activeKeysGauge.set(active);
  revokedKeysGauge.set(revoked);
  rotationGauge.set(rotSum);

  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

module.exports = router;
