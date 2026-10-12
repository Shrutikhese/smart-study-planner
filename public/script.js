"use strict";
/* =====================================================
   Smart Study Planner - script.js (full-stack version)
   Talks to the Express API in ../routes. Only the login
   token is kept in the browser; all data is in SQLite.
   ===================================================== */

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => ds(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ds(d); };
const fmtDate = s => parse(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const fmtTime = t => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

const PRI = {
  high:   { label: "High",   cls: "text-bg-danger",  w: 0 },
  medium: { label: "Medium", cls: "text-bg-warning", w: 1 },
  low:    { label: "Low",    cls: "text-bg-success", w: 2 }
};

/* ---------- state ---------- */
let user = null;   // { id, name, email }
let data = null;   // { subjects, tasks, notes, sessions }
const subjectOf = id => data.subjects.find(s => s.id === id);

/* ---------- API ---------- */
const TOKEN_KEY = "ssp.token";
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };

async function api(method, path, body){
  const headers = { "Content-Type": "application/json" };
  if (getToken()) headers.Authorization = "Bearer " + getToken();
  let res;
  try {
    res = await fetch("/api" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new Error("Cannot reach the server. Is it running?");
  }
  let json = null;
  try { json = await res.json(); } catch (e) {}
  if (!res.ok){
    if (res.status === 401 && user) forceLogout();
    throw new Error((json && json.error) || "Something went wrong. Please try again.");
  }
  return json;
}

/* run an async action and show any error as a toast */
async function run(fn){
  try { await fn(); } catch (err) { toast(err.message); }
}

async function loadData(){ data = await api("GET", "/data"); }

function forceLogout(){
  stopTimer(); setToken(null); user = null; data = null;
  authMsg("Your session has expired. Please log in again.");
  go("auth");
}

/* ---------- toast ---------- */
function toast(msg){
  const el = document.createElement("div");
  el.className = "toast align-items-center text-bg-dark border-0";
  el.setAttribute("role", "status");
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  $("#toasts").appendChild(el);
  el.addEventListener("hidden.bs.toast", () => el.remove());
  new bootstrap.Toast(el, { delay: 6000 }).show();
}

/* ---------- routing ---------- */
const PUBLIC = ["home", "auth"];
const renderers = {};

function go(page){
  if (location.hash === "#" + page) route(); else location.hash = "#" + page;
}

function route(){
  let page = location.hash.slice(1) || "home";
  if (!$("#page-" + page)) page = "home";
  if (!PUBLIC.includes(page) && !user) page = "auth";
  if (page === "auth" && user) page = "dashboard";

  $$(".page").forEach(p => p.classList.toggle("d-none", p.id !== "page-" + page));
  $$("#navLinks .nav-link").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + page));
  $$(".auth-only").forEach(e => e.classList.toggle("d-none", !user));
  $("#navGuest").classList.toggle("d-none", !!user);
  $("#navUser").classList.toggle("d-none", !user);
  if (user) $("#navName").textContent = user.name;

  fillSubjects();
  if (user && data && renderers[page]) renderers[page]();

  const menu = $("#navMenu");
  if (menu.classList.contains("show")) bootstrap.Collapse.getOrCreateInstance(menu).hide();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ---------- auth ---------- */
function authMsg(text){
  const box = $("#authMsg");
  box.textContent = text;
  box.classList.toggle("d-none", !text);
}
async function startSession(result){
  setToken(result.token);
  user = result.user;
  await loadData();
  authMsg("");
  go("dashboard");
}

$("#registerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const p1 = $("#regPass").value, p2 = $("#regPass2").value;
  if (p1 !== p2) return authMsg("The two passwords do not match.");
  try {
    const r = await api("POST", "/auth/register", {
      name: $("#regName").value.trim(), email: $("#regEmail").value.trim(), password: p1
    });
    e.target.reset();
    await startSession(r);
  } catch (err) { authMsg(err.message); }
});

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const r = await api("POST", "/auth/login", { email: $("#loginEmail").value.trim(), password: $("#loginPass").value });
    e.target.reset();
    await startSession(r);
  } catch (err) { authMsg(err.message); }
});

$("#logoutBtn").addEventListener("click", () => {
  stopTimer(); setToken(null);
  user = null; data = null;
  go("home");
});

/* ---------- shared UI ---------- */
function fillSubjects(){
  if (!data) return;
  $$(".subject-select").forEach(sel => {
    const keep = sel.value;
    const empty = sel.dataset.empty;
    let html = empty !== undefined ? `<option value="">${esc(empty)}</option>` : "";
    if (data.subjects.length) html += data.subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
    else if (empty === undefined) html += `<option value="">Add a subject first</option>`;
    sel.innerHTML = html;
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
  });
  updateTopicList();
}

function updateTopicList(){
  const s = data && subjectOf($("#pSubject").value);
  $("#topicList").innerHTML = s ? s.topics.map(t => `<option value="${esc(t.name)}"></option>`).join("") : "";
}
$("#pSubject").addEventListener("change", updateTopicList);

const byTime = (a, b) =>
  (a.time || "99:99").localeCompare(b.time || "99:99") || PRI[a.priority].w - PRI[b.priority].w;

function taskItem(t, actions = false, showDate = false){
  const s = subjectOf(t.subjectId);
  const late = !t.done && t.date < today();
  const status = t.done ? ["Completed", "text-success"] : late ? ["Overdue", "text-danger"] : ["Pending", "text-secondary"];
  const when = [showDate ? fmtDate(t.date) : "", fmtTime(t.time)].filter(Boolean).join(", ");
  return `<li class="task ${t.done ? "is-done" : ""}" style="--c:${esc(s ? s.color : "#18223d")}">
    <input class="form-check-input" type="checkbox" data-toggle="${t.id}" ${t.done ? "checked" : ""} aria-label="Mark ${esc(t.title)} as completed">
    <div class="grow">
      <div class="task-title">${esc(t.title)}</div>
      <div class="small text-secondary"><span class="chip">${esc(s ? s.name : "No subject")}</span>${esc(when)}</div>
    </div>
    <span class="badge ${PRI[t.priority].cls}">${PRI[t.priority].label}</span>
    <span class="small fw-semibold ${status[1]}">${status[0]}</span>
    ${actions ? `<div class="btn-group btn-group-sm">
      <button class="btn btn-outline-dark" data-edit="${t.id}" type="button">Edit</button>
      <button class="btn btn-outline-dark" data-delete="${t.id}" type="button">Delete</button></div>` : ""}
  </li>`;
}

function refresh(){
  const page = location.hash.slice(1) || "home";
  if (data && renderers[page]) renderers[page]();
  fillSubjects();
}

/* ---------- dashboard ---------- */
renderers.dashboard = () => {
  $("#dashName").textContent = user.name;
  $("#dashDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const t = today();
  const all = data.tasks;
  const done = all.filter(x => x.done).length;
  const pct = all.length ? Math.round(done / all.length * 100) : 0;
  const todayTasks = all.filter(x => x.date === t).sort(byTime);
  const dueToday = todayTasks.filter(x => !x.done).length;
  const late = all.filter(x => !x.done && x.date < t).length;

  $("#dPending").textContent = all.length - done;
  $("#dToday").textContent = dueToday;
  $("#dLate").textContent = late;
  $("#dashBar").style.width = pct + "%";
  $("#dashBarWrap").setAttribute("aria-valuenow", pct);
  $("#dashPct").textContent = pct + "%";
  $("#dashDone").textContent = `${done} of ${all.length} tasks completed`;

  $("#dashAlert").innerHTML = (late || dueToday)
    ? `<div class="alert alert-warning" role="alert"><b>Reminder:</b> ${dueToday} task${dueToday === 1 ? "" : "s"} due today${late ? `, ${late} overdue` : ""}.</div>`
    : "";

  if (!data.subjects.length){
    $("#dashTasks").innerHTML = `<li class="empty">Nothing here yet. Add your first subject, or <button class="btn btn-marker btn-sm" data-sample type="button">load sample data</button> to see how it works.</li>`;
  } else {
    $("#dashTasks").innerHTML = todayTasks.length
      ? todayTasks.map(x => taskItem(x)).join("")
      : `<li class="empty">No tasks planned for today. Use Add Task to plan one.</li>`;
  }
};

/* ---------- subjects ---------- */
renderers.subjects = () => {
  $("#subjectList").innerHTML = data.subjects.length
    ? data.subjects.map(s => {
        const pending = data.tasks.filter(t => t.subjectId === s.id && !t.done).length;
        return `<div class="col-md-6"><div class="card p-3 h-100">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div><h2 class="h5 mb-0"><span class="dot" style="--c:${esc(s.color)}"></span>${esc(s.name)}</h2>
            <div class="small text-secondary">${pending} pending task${pending === 1 ? "" : "s"}</div></div>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-dark" data-editsub="${s.id}" type="button">Edit</button>
              <button class="btn btn-outline-dark" data-delsub="${s.id}" type="button">Delete</button></div>
          </div>
          <div class="mt-3">${s.topics.length
            ? s.topics.map(tp => `<span class="topic">${esc(tp.name)}<button type="button" data-deltopic="${tp.id}" aria-label="Remove topic ${esc(tp.name)}">&times;</button></span>`).join("")
            : `<span class="small text-secondary">No topics yet.</span>`}</div>
          <form class="input-group input-group-sm mt-2" data-topicform="${s.id}">
            <input class="form-control" placeholder="Add a topic" maxlength="60" required aria-label="New topic for ${esc(s.name)}">
            <button class="btn btn-ink" type="submit">Add topic</button>
          </form></div></div>`;
      }).join("")
    : `<div class="col-12"><div class="empty">No subjects yet. Add your first one above.</div></div>`;
};

$("#subjectForm").addEventListener("submit", e => {
  e.preventDefault();
  run(async () => {
    const s = await api("POST", "/subjects", { name: $("#subName").value.trim(), color: $("#subColor").value });
    data.subjects.push(s);
    $("#subName").value = "";
    refresh();
  });
});

$("#editSubjectForm").addEventListener("submit", e => {
  e.preventDefault();
  run(async () => {
    const id = $("#esId").value;
    const upd = await api("PUT", "/subjects/" + id, { name: $("#esName").value.trim(), color: $("#esColor").value });
    Object.assign(subjectOf(id), { name: upd.name, color: upd.color });
    bootstrap.Modal.getInstance($("#editSubjectModal")).hide();
    refresh();
  });
});

/* ---------- planner ---------- */
renderers.planner = () => {
  if (!$("#pDate").value) $("#pDate").value = today();
  const t = today();
  const group = (title, items, cls = "", dateText = "") => `
    <div class="agenda-day ${cls}">
      <h3 class="h6 mb-2">${title} <span class="fw-normal text-secondary">${esc(dateText)}</span></h3>
      ${items.length ? `<ul class="task-list">${items.map(x => taskItem(x)).join("")}</ul>` : `<p class="small text-secondary mb-0">Nothing planned.</p>`}
    </div>`;
  let html = "";
  const overdue = data.tasks.filter(x => !x.done && x.date < t).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  if (overdue.length) html += group("Overdue", overdue, "overdue");
  const n = $("#plannerView").value === "day" ? 1 : 7;
  for (let i = 0; i < n; i++){
    const d = addDays(t, i);
    const items = data.tasks.filter(x => x.date === d).sort(byTime);
    html += group(i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtDate(d), items, i === 0 ? "today" : "", i < 2 ? fmtDate(d) : "");
  }
  $("#agenda").innerHTML = html;
};
$("#plannerView").addEventListener("change", () => data && renderers.planner());

$("#taskForm").addEventListener("submit", e => {
  e.preventDefault();
  if (!$("#pSubject").value){ toast("Add a subject first."); go("subjects"); return; }
  run(async () => {
    const t = await api("POST", "/tasks", {
      subjectId: $("#pSubject").value, title: $("#pTitle").value.trim(),
      date: $("#pDate").value, time: $("#pTime").value, priority: $("#pPriority").value
    });
    data.tasks.push(t);
    $("#pTitle").value = ""; $("#pTime").value = "";
    toast("Added to your schedule.");
    refresh();
  });
});

/* ---------- task manager ---------- */
renderers.tasks = () => {
  const q = $("#tSearch").value.trim().toLowerCase();
  const st = $("#tStatus").value, pr = $("#tPriority").value, sub = $("#tSubject").value;
  const list = data.tasks
    .filter(t => (st === "all" || (st === "done") === t.done)
      && (pr === "all" || t.priority === pr)
      && (!sub || t.subjectId === sub)
      && (!q || t.title.toLowerCase().includes(q)))
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  $("#taskList").innerHTML = list.length
    ? list.map(t => taskItem(t, true, true)).join("")
    : `<li class="empty">No tasks match. Add one from the Study Planner page.</li>`;
};
["tSearch", "tStatus", "tPriority", "tSubject"].forEach(id => {
  $("#" + id).addEventListener("input", () => data && renderers.tasks());
});

$("#editTaskForm").addEventListener("submit", e => {
  e.preventDefault();
  run(async () => {
    const id = $("#eId").value;
    const upd = await api("PUT", "/tasks/" + id, {
      title: $("#eTitle").value.trim(), subjectId: $("#eSubject").value,
      date: $("#eDate").value, time: $("#eTime").value, priority: $("#ePriority").value
    });
    const i = data.tasks.findIndex(x => x.id === id);
    if (i >= 0) data.tasks[i] = upd;
    bootstrap.Modal.getInstance($("#editTaskModal")).hide();
    refresh();
  });
});

/* ---------- notes ---------- */
renderers.notes = () => {
  const f = $("#nFilter").value;
  const list = data.notes.filter(n => !f || n.subjectId === f).sort((a, b) => b.created.localeCompare(a.created));
  $("#noteList").innerHTML = list.length
    ? list.map(n => {
        const s = subjectOf(n.subjectId);
        return `<div class="col-md-6 col-lg-4"><div class="note">
          <div class="d-flex justify-content-between align-items-center">
            <span class="chip m-0"><span class="dot" style="--c:${esc(s ? s.color : "#18223d")}"></span>${esc(s ? s.name : "No subject")}</span>
            <button class="btn btn-sm btn-outline-dark" data-delnote="${n.id}" type="button">Delete</button></div>
          <p>${esc(n.text)}</p>
          <div class="small text-secondary">${esc(new Date(n.created).toLocaleDateString(undefined, { day: "numeric", month: "short" }))}</div>
        </div></div>`;
      }).join("")
    : `<div class="col-12"><div class="empty">No notes yet.</div></div>`;
};
$("#nFilter").addEventListener("input", () => data && renderers.notes());

$("#noteForm").addEventListener("submit", e => {
  e.preventDefault();
  if (!$("#nSubject").value){ toast("Add a subject first."); go("subjects"); return; }
  run(async () => {
    const n = await api("POST", "/notes", { subjectId: $("#nSubject").value, text: $("#nText").value.trim() });
    data.notes.push(n);
    $("#nText").value = "";
    refresh();
  });
});

/* ---------- progress ---------- */
renderers.progress = () => {
  const all = data.tasks;
  const done = all.filter(t => t.done).length;
  const pct = all.length ? Math.round(done / all.length * 100) : 0;
  const totalMin = data.sessions.reduce((a, s) => a + s.minutes, 0);
  $("#pgPct").textContent = pct + "%";
  $("#pgDone").textContent = done;
  $("#pgPending").textContent = all.length - done;
  $("#pgTime").textContent = totalMin >= 60 ? (Math.round(totalMin / 6) / 10) + "h" : totalMin + "m";

  $("#pgSubjects").innerHTML = data.subjects.length
    ? data.subjects.map(s => {
        const mine = all.filter(t => t.subjectId === s.id);
        const d = mine.filter(t => t.done).length;
        const p = mine.length ? Math.round(d / mine.length * 100) : 0;
        return `<div class="mb-3"><div class="d-flex justify-content-between small"><span><span class="dot" style="--c:${esc(s.color)}"></span>${esc(s.name)}</span><span>${d}/${mine.length} done</span></div>
          <div class="progress" style="height:10px" role="progressbar" aria-label="${esc(s.name)} progress" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar" style="width:${p}%;background:${esc(s.color)}"></div></div></div>`;
      }).join("")
    : `<div class="empty">Add subjects and tasks to see progress.</div>`;

  const days = [...Array(7)].map((_, i) => addDays(today(), i - 6));
  const mins = days.map(d => data.sessions.filter(s => s.date === d).reduce((a, s) => a + s.minutes, 0));
  const max = Math.max(...mins, 1);
  $("#pgWeek").innerHTML = days.map((d, i) => `<div class="col-bar">
    <span>${mins[i]}</span><div class="bar" style="height:${Math.round(mins[i] / max * 130)}px"></div>
    <span>${parse(d).toLocaleDateString(undefined, { weekday: "short" })}</span></div>`).join("");
};

/* ---------- study timer ---------- */
const T = { mode: "focus", remaining: 25 * 60, endAt: null, id: null };
const timerLen = () => (T.mode === "focus" ? +$("#focusLen").value : +$("#breakLen").value) * 60;

function drawTimer(){
  const r = T.remaining;
  const text = `${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
  $("#clock").textContent = text;
  $("#timerMode").textContent = T.mode === "focus" ? "Focus session" : "Break";
  $("#timerStart").textContent = T.id ? "Pause" : "Start";
  $("#timerSwitch").textContent = T.mode === "focus" ? "Switch to break" : "Switch to focus";
  document.title = T.id ? `${text} - Study Planner` : "Smart Study Planner";
}
function stopTimer(){ clearInterval(T.id); T.id = null; T.endAt = null; }
function setMode(mode){ stopTimer(); T.mode = mode; T.remaining = timerLen(); drawTimer(); }

function tick(){
  T.remaining = Math.max(0, Math.ceil((T.endAt - Date.now()) / 1000));
  if (T.remaining > 0) return drawTimer();
  const wasFocus = T.mode === "focus";
  const mins = +$("#focusLen").value;
  stopTimer();
  if (wasFocus && data){
    toast(`Focus session complete (${mins} min). Take a break.`);
    run(async () => {
      const s = await api("POST", "/sessions", { minutes: mins, date: today(), subjectId: $("#timerSubject").value });
      data.sessions.push(s);
      if (renderers.timer) renderers.timer();
    });
  } else toast("Break over. Ready to focus?");
  setMode(wasFocus ? "break" : "focus");
}

$("#timerStart").addEventListener("click", () => {
  if (T.id){
    T.remaining = Math.max(0, Math.ceil((T.endAt - Date.now()) / 1000));
    stopTimer(); drawTimer(); return;
  }
  T.endAt = Date.now() + T.remaining * 1000;
  T.id = setInterval(tick, 250);
  drawTimer();
});
$("#timerReset").addEventListener("click", () => setMode(T.mode));
$("#timerSwitch").addEventListener("click", () => setMode(T.mode === "focus" ? "break" : "focus"));
["focusLen", "breakLen"].forEach(id => $("#" + id).addEventListener("change", () => { if (!T.id) setMode(T.mode); }));

renderers.timer = () => {
  drawTimer();
  const todays = data.sessions.filter(s => s.date === today());
  $("#tmSessions").textContent = todays.length;
  $("#tmMinutes").textContent = todays.reduce((a, s) => a + s.minutes, 0);
};

/* ---------- reminders ---------- */
const notified = new Set();
function checkReminders(){
  if (!user || !data) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  data.tasks.filter(t => !t.done && t.date === today() && t.time && !notified.has(t.id)).forEach(t => {
    const [h, m] = t.time.split(":").map(Number);
    const diff = nowMin - (h * 60 + m);
    if (diff >= 0 && diff <= 10){
      notified.add(t.id);
      toast(`Time to study: ${t.title} (${fmtTime(t.time)})`);
    }
  });
}
setInterval(checkReminders, 30000);

/* ---------- click actions (event delegation) ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("button");
  if (!el || !data) return;

  if (el.dataset.sample !== undefined){
    return run(async () => {
      data = await api("POST", "/sample", { today: today() });
      refresh();
    });
  }

  if (el.dataset.edit){
    const t = data.tasks.find(x => x.id === el.dataset.edit); if (!t) return;
    fillSubjects();
    $("#eId").value = t.id; $("#eTitle").value = t.title; $("#eSubject").value = t.subjectId;
    $("#eDate").value = t.date; $("#eTime").value = t.time || ""; $("#ePriority").value = t.priority;
    bootstrap.Modal.getOrCreateInstance($("#editTaskModal")).show();
  }
  if (el.dataset.delete){
    if (!confirm("Delete this task?")) return;
    const id = el.dataset.delete;
    run(async () => {
      await api("DELETE", "/tasks/" + id);
      data.tasks = data.tasks.filter(x => x.id !== id);
      refresh();
    });
  }
  if (el.dataset.editsub){
    const s = subjectOf(el.dataset.editsub); if (!s) return;
    $("#esId").value = s.id; $("#esName").value = s.name; $("#esColor").value = s.color;
    bootstrap.Modal.getOrCreateInstance($("#editSubjectModal")).show();
  }
  if (el.dataset.delsub){
    if (!confirm("Delete this subject with its tasks and notes?")) return;
    const id = el.dataset.delsub;
    run(async () => {
      await api("DELETE", "/subjects/" + id);
      data.subjects = data.subjects.filter(s => s.id !== id);
      data.tasks = data.tasks.filter(t => t.subjectId !== id);
      data.notes = data.notes.filter(n => n.subjectId !== id);
      data.sessions.forEach(s => { if (s.subjectId === id) s.subjectId = null; });
      refresh();
    });
  }
  if (el.dataset.deltopic){
    const id = el.dataset.deltopic;
    run(async () => {
      await api("DELETE", "/topics/" + id);
      data.subjects.forEach(s => { s.topics = s.topics.filter(t => t.id !== id); });
      refresh();
    });
  }
  if (el.dataset.delnote){
    const id = el.dataset.delnote;
    run(async () => {
      await api("DELETE", "/notes/" + id);
      data.notes = data.notes.filter(n => n.id !== id);
      refresh();
    });
  }
});

document.addEventListener("change", e => {
  const box = e.target.closest("[data-toggle]");
  if (!box || !data) return;
  const t = data.tasks.find(x => x.id === box.dataset.toggle);
  if (!t) return;
  run(async () => {
    try {
      const upd = await api("PUT", "/tasks/" + t.id, { done: box.checked });
      Object.assign(t, upd);
    } finally { refresh(); }
  });
});

document.addEventListener("submit", e => {
  const f = e.target.closest("[data-topicform]");
  if (!f || !data) return;
  e.preventDefault();
  const input = $("input", f);
  const name = input.value.trim();
  if (!name) return;
  run(async () => {
    const topic = await api("POST", "/subjects/" + f.dataset.topicform + "/topics", { name });
    subjectOf(f.dataset.topicform).topics.push(topic);
    refresh();
  });
});

/* ---------- init ---------- */
(async function init(){
  drawTimer();
  if (getToken()){
    try {
      const me = await api("GET", "/auth/me");
      user = me.user;
      await loadData();
    } catch (e) {
      setToken(null); user = null; data = null;
    }
  }
  route();
})();
