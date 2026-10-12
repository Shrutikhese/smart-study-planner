// server.js - Express app: JSON API under /api, static frontend from /public
const express = require("express");
const path = require("path");
const rateLimit = require("express-rate-limit");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

// Limit login/register attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." }
});

app.use("/api/auth", authLimiter, require("./routes/auth"));
app.use("/api", require("./routes/planner"));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// Frontend
app.use(express.static(path.join(__dirname, "public")));

// Error handler
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
  console.error(err);
  res.status(500).json({ error: "Server error. Please try again." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Smart Study Planner running at http://localhost:${PORT}`));
