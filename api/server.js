/**
 * KeyShield Vault API - server.js
 * Express v5: DO NOT use app.options("*", ...)
 * Use regex for preflight catch-all.
 */
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const clientRoutes = require("./routes/client");
const metricsRoutes = require("./routes/metrics");

const app = express();

const corsOptions = {
  origin: "http://localhost:4200",
  methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: false,
};

// CORS for all routes
app.use(cors(corsOptions));

// Preflight for ALL paths (Express v5 safe)
app.options(/.*/, cors(corsOptions));

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "KeyShield Vault API",
    time: new Date().toISOString(),
  });
});

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/client", clientRoutes);
app.use("/", metricsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
