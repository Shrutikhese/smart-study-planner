# Smart Study Planner (Full-stack)

AWP mini project. Node.js + Express backend, SQLite database, JWT login, and a Bootstrap frontend served from the same server.

## Run it

Requires Node.js 22.13 or newer. The database uses the SQLite built into Node.js, so nothing needs to be compiled and no extra tools are needed on Windows.

```bash
cd smart-study-planner-fullstack
npm install
npm start
```

Open http://localhost:3000

Optional: set a secret before starting (recommended).

```bash
# Windows PowerShell
$env:JWT_SECRET="any-long-random-text"; npm start

# macOS / Linux
JWT_SECRET="any-long-random-text" npm start
```

The database file is created automatically at `data/planner.db`. Delete it to reset everything.

## Folder structure

```
smart-study-planner-fullstack/
  server.js              Express app, rate limit, static files
  db.js                  SQLite connection and table creation
  middleware/auth.js     JWT sign / verify, requireAuth guard
  routes/auth.js         register, login, me
  routes/planner.js      subjects, topics, tasks, notes, sessions, sample data
  public/                frontend (index.html, style.css, script.js)
  data/planner.db        created on first run
```

## API

All routes except register and login need the header `Authorization: Bearer <token>`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | /api/auth/register | Create account, returns token |
| POST | /api/auth/login | Log in, returns token |
| GET | /api/auth/me | Current user |
| GET | /api/data | All subjects, topics, tasks, notes, sessions |
| POST | /api/subjects | Add subject `{ name, color }` |
| PUT | /api/subjects/:id | Edit subject |
| DELETE | /api/subjects/:id | Delete subject with its tasks and notes |
| POST | /api/subjects/:id/topics | Add topic `{ name }` |
| DELETE | /api/topics/:id | Delete topic |
| POST | /api/tasks | Add task `{ subjectId, title, date, time, priority }` |
| PUT | /api/tasks/:id | Edit task or mark done `{ done: true }` |
| DELETE | /api/tasks/:id | Delete task |
| POST | /api/notes | Add note `{ subjectId, text }` |
| DELETE | /api/notes/:id | Delete note |
| POST | /api/sessions | Log a focus session `{ minutes, date, subjectId }` |
| POST | /api/sample | Add sample data `{ today }` |

## Database tables

- **users**: id, name, email (unique), password_hash, created_at
- **subjects**: id, user_id, name, color, created_at
- **topics**: id, subject_id, name
- **tasks**: id, user_id, subject_id, title, date, time, priority (high, medium, low), done, created_at
- **notes**: id, user_id, subject_id, text, created_at
- **sessions**: id, user_id, subject_id, date, minutes, created_at

Deleting a subject also deletes its topics, tasks and notes (foreign keys with `ON DELETE CASCADE`).

## Security notes

- Passwords are hashed with bcrypt, never stored as plain text.
- Every query is filtered by the logged-in user, so users cannot see each other's data.
- All SQL uses prepared statements, and all input is validated on the server.
- Login and register are rate limited.
