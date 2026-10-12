// routes/auth.js - register, login, current user
const express = require("express");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const db = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register  { name, email, password }
router.post("/register", async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "";
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const password = typeof b.password === "string" ? b.password : "";

    if (!name) return res.status(400).json({ error: "Please enter your name." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (password.length < 6) return res.status(400).json({ error: "Use a password with at least 6 characters." });

    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      return res.status(409).json({ error: "An account with this email already exists. Log in instead." });
    }

    const id = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, name, email, hash, new Date().toISOString());

    res.status(201).json({ token: signToken(id), user: { id, name, email } });
  } catch (err) { next(err); }
});

// POST /api/auth/login  { email, password }
router.post("/login", async (req, res, next) => {
  try {
    const b = req.body || {};
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const password = typeof b.password === "string" ? b.password : "";

    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const ok = row && await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "Email or password is incorrect." });

    res.json({ token: signToken(row.id), user: { id: row.id, name: row.name, email: row.email } });
  } catch (err) { next(err); }
});

// GET /api/auth/me  (needs token)
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
