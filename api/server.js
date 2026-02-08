const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const clientRoutes = require("./routes/client");
const metricsRoutes = require("./routes/metrics");

const app = express();

// CORS for Angular dev server (4200)
const corsOptions = {
  origin: "http://localhost:4200",
  methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
};

app.use(cors(corsOptions));

// Express v5: DO NOT use app.options("*", ...)
// Use regex to match all routes for preflight
app.options(/.*/, cors(corsOptions));

app.use(express.json());

// ✅ Root route so "curl http://localhost:3000" returns 200
app.get("/", (req, res) => {
  res.status(200).send("Keyshield API OK");
});

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

// metricsRoutes should expose /metrics (and maybe /metrics.json etc)
app.use("/", metricsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
