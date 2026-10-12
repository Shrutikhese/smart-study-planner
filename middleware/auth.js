// middleware/auth.js - JWT helpers and the "must be logged in" guard
const jwt = require("jsonwebtoken");
const db = require("../db");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
if (!process.env.JWT_SECRET) {
  console.warn("Warning: JWT_SECRET is not set. Using an insecure development secret.");
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in." });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(payload.sub);
    if (!user) throw new Error("User not found");
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
}

module.exports = { signToken, requireAuth };
