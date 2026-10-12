// routes/planner.js - all data routes. Every route needs a valid token and only touches the logged-in user's rows.
const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

/* ---------- validation helpers ---------- */
const PRIORITIES = ["high", "medium", "low"];
const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const isTime = v => v === "" || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
const isColor = v => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const bad = (res, msg) => res.status(400).json({ error: msg });
const notFound = res => res.status(404).json({ error: "Not found." });
const now = () => new Date().toISOString();

/* ---------- ownership helpers ---------- */
const ownSubject = (userId, id) =>
  typeof id === "string" ? db.prepare("SELECT * FROM subjects WHERE id = ? AND user_id = ?").get(id, userId) : undefined;
const ownTask = (userId, id) => db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, userId);

/* ---------- response formatters (database row -> JSON the frontend uses) ---------- */
const fmtTask = r => ({ id: r.id, subjectId: r.subject_id, title: r.title, date: r.date, time: r.time, priority: r.priority, done: !!r.done });
const fmtNote = r => ({ id: r.id, subjectId: r.subject_id, text: r.text, created: r.created_at });
const fmtSession = r => ({ id: r.id, subjectId: r.subject_id, date: r.date, minutes: r.minutes });

function getAll(userId){
  const subs = db.prepare("SELECT * FROM subjects WHERE user_id = ? ORDER BY rowid").all(userId);
  const tops = db.prepare(
    "SELECT t.* FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE s.user_id = ? ORDER BY t.rowid"
  ).all(userId);
  return {
    subjects: subs.map(s => ({
      id: s.id, name: s.name, color: s.color,
      topics: tops.filter(t => t.subject_id === s.id).map(t => ({ id: t.id, name: t.name }))
    })),
    tasks: db.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY rowid").all(userId).map(fmtTask),
    notes: db.prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY rowid").all(userId).map(fmtNote),
    sessions: db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY rowid").all(userId).map(fmtSession)
  };
}

/* ================= DATA ================= */
// GET /api/data - everything for the logged-in user
router.get("/data", (req, res) => res.json(getAll(req.user.id)));

/* ================= SUBJECTS ================= */
// POST /api/subjects  { name, color }
router.post("/subjects", (req, res) => {
  const name = clean(req.body?.name, 40);
  const color = req.body?.color === undefined ? "#2f6fed" : req.body.color;
  if (!name) return bad(res, "Subject name is required.");
  if (!isColor(color)) return bad(res, "Colour must look like #2f6fed.");
  const id = randomUUID();
  db.prepare("INSERT INTO subjects (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, req.user.id, name, color, now());
  res.status(201).json({ id, name, color, topics: [] });
});

// PUT /api/subjects/:id  { name?, color? }
router.put("/subjects/:id", (req, res) => {
  const cur = ownSubject(req.user.id, req.params.id);
  if (!cur) return notFound(res);
  const name = req.body?.name === undefined ? cur.name : clean(req.body.name, 40);
  const color = req.body?.color === undefined ? cur.color : req.body.color;
  if (!name) return bad(res, "Subject name is required.");
  if (!isColor(color)) return bad(res, "Colour must look like #2f6fed.");
  db.prepare("UPDATE subjects SET name = ?, color = ? WHERE id = ?").run(name, color, cur.id);
  res.json({ id: cur.id, name, color });
});

// DELETE /api/subjects/:id  (its topics, tasks and notes are deleted too)
router.delete("/subjects/:id", (req, res) => {
  const cur = ownSubject(req.user.id, req.params.id);
  if (!cur) return notFound(res);
  db.prepare("DELETE FROM subjects WHERE id = ?").run(cur.id);
  res.json({ ok: true });
});

/* ================= TOPICS ================= */
// POST /api/subjects/:id/topics  { name }
router.post("/subjects/:id/topics", (req, res) => {
  const subject = ownSubject(req.user.id, req.params.id);
  if (!subject) return notFound(res);
  const name = clean(req.body?.name, 60);
  if (!name) return bad(res, "Topic name is required.");
  const id = randomUUID();
  db.prepare("INSERT INTO topics (id, subject_id, name) VALUES (?, ?, ?)").run(id, subject.id, name);
  res.status(201).json({ id, name });
});

// DELETE /api/topics/:id
router.delete("/topics/:id", (req, res) => {
  const info = db.prepare(
    "DELETE FROM topics WHERE id = ? AND subject_id IN (SELECT id FROM subjects WHERE user_id = ?)"
  ).run(req.params.id, req.user.id);
  if (!info.changes) return notFound(res);
  res.json({ ok: true });
});

/* ================= TASKS ================= */
// POST /api/tasks  { subjectId, title, date, time?, priority? }
router.post("/tasks", (req, res) => {
  const b = req.body || {};
  const subject = ownSubject(req.user.id, b.subjectId);
  const title = clean(b.title, 80);
  const time = b.time === undefined || b.time === null ? "" : b.time;
  const priority = b.priority === undefined ? "medium" : b.priority;
  if (!subject) return bad(res, "Choose a valid subject.");
  if (!title) return bad(res, "Task title is required.");
  if (!isDate(b.date)) return bad(res, "Choose a valid date.");
  if (!isTime(time)) return bad(res, "Choose a valid time.");
  if (!PRIORITIES.includes(priority)) return bad(res, "Priority must be high, medium or low.");
  const id = randomUUID();
  db.prepare("INSERT INTO tasks (id, user_id, subject_id, title, date, time, priority, done, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)")
    .run(id, req.user.id, subject.id, title, b.date, time, priority, now());
  res.status(201).json(fmtTask(ownTask(req.user.id, id)));
});

// PUT /api/tasks/:id  any of { subjectId, title, date, time, priority, done }
router.put("/tasks/:id", (req, res) => {
  const cur = ownTask(req.user.id, req.params.id);
  if (!cur) return notFound(res);
  const b = req.body || {};
  const next = {
    subject_id: b.subjectId === undefined ? cur.subject_id : b.subjectId,
    title: b.title === undefined ? cur.title : clean(b.title, 80),
    date: b.date === undefined ? cur.date : b.date,
    time: b.time === undefined ? cur.time : (b.time === null ? "" : b.time),
    priority: b.priority === undefined ? cur.priority : b.priority,
    done: b.done === undefined ? cur.done : (b.done ? 1 : 0)
  };
  if (!ownSubject(req.user.id, next.subject_id)) return bad(res, "Choose a valid subject.");
  if (!next.title) return bad(res, "Task title is required.");
  if (!isDate(next.date)) return bad(res, "Choose a valid date.");
  if (!isTime(next.time)) return bad(res, "Choose a valid time.");
  if (!PRIORITIES.includes(next.priority)) return bad(res, "Priority must be high, medium or low.");
  db.prepare("UPDATE tasks SET subject_id = ?, title = ?, date = ?, time = ?, priority = ?, done = ? WHERE id = ?")
    .run(next.subject_id, next.title, next.date, next.time, next.priority, next.done, cur.id);
  res.json(fmtTask(ownTask(req.user.id, cur.id)));
});

// DELETE /api/tasks/:id
router.delete("/tasks/:id", (req, res) => {
  const info = db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  if (!info.changes) return notFound(res);
  res.json({ ok: true });
});

/* ================= NOTES ================= */
// POST /api/notes  { subjectId, text }
router.post("/notes", (req, res) => {
  const subject = ownSubject(req.user.id, req.body?.subjectId);
  const text = clean(req.body?.text, 500);
  if (!subject) return bad(res, "Choose a valid subject.");
  if (!text) return bad(res, "Write something in the note.");
  const id = randomUUID();
  const created = now();
  db.prepare("INSERT INTO notes (id, user_id, subject_id, text, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, req.user.id, subject.id, text, created);
  res.status(201).json({ id, subjectId: subject.id, text, created });
});

// DELETE /api/notes/:id
router.delete("/notes/:id", (req, res) => {
  const info = db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  if (!info.changes) return notFound(res);
  res.json({ ok: true });
});

/* ================= STUDY SESSIONS (timer) ================= */
// POST /api/sessions  { minutes, date, subjectId? }
router.post("/sessions", (req, res) => {
  const b = req.body || {};
  const minutes = Number(b.minutes);
  let subjectId = null;
  if (b.subjectId) {
    const s = ownSubject(req.user.id, b.subjectId);
    if (!s) return bad(res, "Choose a valid subject.");
    subjectId = s.id;
  }
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return bad(res, "Minutes must be between 1 and 180.");
  if (!isDate(b.date)) return bad(res, "Choose a valid date.");
  const id = randomUUID();
  db.prepare("INSERT INTO sessions (id, user_id, subject_id, date, minutes, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, req.user.id, subjectId, b.date, minutes, now());
  res.status(201).json({ id, subjectId, date: b.date, minutes });
});

/* ================= SAMPLE DATA (for demos) ================= */
// POST /api/sample  { today: "YYYY-MM-DD" } - adds example subjects and tasks, returns all data
router.post("/sample", (req, res) => {
  const today = req.body?.today;
  if (!isDate(today)) return bad(res, "Choose a valid date.");
  const addDays = (s, n) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };
  const uid = req.user.id;
  const insSub = db.prepare("INSERT INTO subjects (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)");
  const insTopic = db.prepare("INSERT INTO topics (id, subject_id, name) VALUES (?, ?, ?)");
  const insTask = db.prepare("INSERT INTO tasks (id, user_id, subject_id, title, date, time, priority, done, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

  db.exec("BEGIN");
  try {
    const mk = (name, color, topics) => {
      const id = randomUUID();
      insSub.run(id, uid, name, color, now());
      topics.forEach(t => insTopic.run(randomUUID(), id, t));
      return id;
    };
    const dbms = mk("DBMS", "#2f6fed", ["Normalization", "Transactions", "SQL Joins"]);
    const java = mk("Java", "#e0762c", ["Inheritance", "Collections"]);
    const cloud = mk("Cloud Computing", "#1f9d8a", ["Virtualization", "Service models"]);
    const crypt = mk("Cryptography", "#8a4fd6", ["Playfair Cipher", "RSA"]);
    const add = (sid, title, off, time, priority, done = 0) =>
      insTask.run(randomUUID(), uid, sid, title, addDays(today, off), time, priority, done, now());
    add(dbms, "Normalization", 0, "16:00", "high", 1);
    add(java, "Inheritance", 0, "17:30", "high");
    add(cloud, "Virtualization", 0, "19:00", "medium");
    add(crypt, "Playfair Cipher", 0, "20:00", "low");
    add(dbms, "Transactions", 1, "16:00", "medium");
    add(java, "Collections", 2, "18:00", "medium");
    add(crypt, "RSA", 3, "17:00", "high");
  db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  res.status(201).json(getAll(uid));
});

module.exports = router;
