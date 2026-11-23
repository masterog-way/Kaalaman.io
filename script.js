/* ==========================================================================
   QUIZ KAALAMAN — script.js
   Frontend app: auth, quizzes, leaderboards, profile, admin.
   Storage: talks to the Node/Express server when it is available
            (Railway / `npm start`), otherwise falls back to localStorage
            so the site also works when index.html is opened directly.
   ========================================================================== */

/* ============================================================== CONSTANTS */

const QK = {
  VERSION: '1.0.0',
  STORE_KEY: 'quizKaalaman:data:v1',
  SESSION_KEY: 'quizKaalaman:session:v1',
  ADMIN_USER: 'Mr.Admin1',
  ADMIN_PASS: 'Admin123!',
  ADMIN_ID: '999',
  POINTS_CORRECT: 10,
  POINTS_WRONG: -2,
  QUESTION_SECONDS: 30,
  MAX_QUESTIONS: 500
};

const DIFFICULTIES = [
  { key: 'baby',       name: 'Baby Mode',  count: 5,   time: 40, weight: 1.0, color: '#22c55e', icon: 'bi-emoji-smile-fill' },
  { key: 'normal',     name: 'Normal',     count: 20,  time: 30, weight: 1.5, color: '#3b82f6', icon: 'bi-hand-thumbs-up-fill' },
  { key: 'hard',       name: 'Hard',       count: 50,  time: 22, weight: 2.2, color: '#f59e0b', icon: 'bi-fire' },
  { key: 'hell',       name: 'Hell',       count: 100, time: 16, weight: 3.0, color: '#ef4444', icon: 'bi-lightning-charge-fill' },
  { key: 'impossible', name: 'Impossible', count: 500, time: 12, weight: 4.0, color: '#7c3aed', icon: 'bi-skull-fill' }
];

const TOPICS = [
  { key: 'coding',        name: 'Coding',                        tl: 'Programming at logic',      icon: 'bi-code-slash',       c1: '#1e3a8a', c2: '#3b82f6' },
  { key: 'hardware',      name: 'Computer Hardware & Software',  tl: 'Bahagi ng kompyuter',       icon: 'bi-cpu-fill',         c1: '#334155', c2: '#0ea5e9' },
  { key: 'networking',    name: 'Networking',                    tl: 'Koneksyon at network',      icon: 'bi-diagram-3-fill',   c1: '#065f46', c2: '#14b8a6' },
  { key: 'philosophy',    name: 'Philosophy',                    tl: 'Pilosopiya at kaisipan',    icon: 'bi-lightbulb-fill',   c1: '#4c1d95', c2: '#a78bfa' },
  { key: 'math',          name: 'Mathematics in the Modern World', tl: 'Matematika sa modernong mundo', icon: 'bi-calculator-fill', c1: '#831843', c2: '#f472b6' },
  { key: 'values',        name: 'Values',                        tl: 'Pagpapahalaga at asal',     icon: 'bi-heart-fill',       c1: '#9a3412', c2: '#fb923c' },
  { key: 'pe',            name: 'P.E',                           tl: 'Physical Education',        icon: 'bi-bicycle',          c1: '#166534', c2: '#84cc16' },
  { key: 'nstp',          name: 'NSTP / CWTS',                   tl: 'Serbisyo sa komunidad',     icon: 'bi-flag-fill',        c1: '#7f1d1d', c2: '#dc2626' },
  { key: 'malikhaing',    name: 'Malikhaing Pagsulat',           tl: 'Creative writing',          icon: 'bi-pencil-fill',      c1: '#701a75', c2: '#e879f9' },
  { key: 'history',       name: 'Reading in Philippine History', tl: 'Kasaysayan ng Pilipinas',   icon: 'bi-book-fill',        c1: '#78350f', c2: '#eab308' }
];

/* ============================================================== STATE */

let DATA = null;          // the whole database
let SESSION = null;       // { userId }
let storageMode = 'local';// 'server' | 'local'
let quiz = null;          // active quiz runtime
let boardMode = 'category';
let boardCat = null;
let boardDiff = 'baby';
let timerHandle = null;
let serverOk = false;

/* ============================================================== HELPERS */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function nowISO() { return new Date().toISOString(); }

/** Deterministic-ish shuffle (Fisher–Yates). */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Decimal-safe rounding. */
function round(n, d = 2) {
  const f = Math.pow(10, d);
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
         ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtDur(ms) {
  if (!ms || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function topicByKey(k) { return TOPICS.find(t => t.key === k) || null; }
function diffByKey(k) { return DIFFICULTIES.find(d => d.key === k) || null; }

function initials(name) {
  const parts = String(name || '?').trim().split(/[\s_-]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ============================================================== TOASTS */

function toast(msg, type = 'info', ms = 3200) {
  const host = $('#toastHost');
  if (!host) return;
  const icons = { ok: 'bi-check-circle-fill', err: 'bi-x-circle-fill', warn: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
  const el = document.createElement('div');
  el.className = `qk-toast ${type}`;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${esc(msg)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ============================================================== STORAGE */

function blankData() {
  return {
    version: QK.VERSION,
    meta: { siteName: 'QUIZ KAALAMAN', primary: '#6d28d9', accent: '#a855f7', createdAt: nowISO() },
    users: [],
    results: [],
    requests: [],
    seed: 0
  };
}

async function api(path, options) {
  const res = await fetch('api/' + path, Object.assign({
    headers: { 'Content-Type': 'application/json' }
  }, options || {}));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/** Detect whether a real server is serving us. */
async function detectServer() {
  if (location.protocol === 'file:') return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('api/health', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return false;
    const j = await res.json();
    return !!(j && j.ok);
  } catch (e) {
    return false;
  }
}

async function loadData() {
  serverOk = await detectServer();
  if (serverOk) {
    try {
      DATA = await api('data');
      storageMode = 'server';
    } catch (e) {
      serverOk = false;
    }
  }
  if (!serverOk) {
    storageMode = 'local';
    try {
      const raw = localStorage.getItem(QK.STORE_KEY);
      DATA = raw ? JSON.parse(raw) : null;
    } catch (e) { DATA = null; }
  }
  if (!DATA || typeof DATA !== 'object') DATA = blankData();
  DATA.users = Array.isArray(DATA.users) ? DATA.users : [];
  DATA.results = Array.isArray(DATA.results) ? DATA.results : [];
  DATA.requests = Array.isArray(DATA.requests) ? DATA.requests : [];
  DATA.meta = Object.assign(blankData().meta, DATA.meta || {});
  ensureAdmin();
}

async function saveData() {
  if (serverOk) {
    try {
      await api('data', { method: 'PUT', body: JSON.stringify(DATA) });
    } catch (e) {
      // Server hiccup: keep the local mirror so nothing is lost on-screen.
      try { localStorage.setItem(QK.STORE_KEY, JSON.stringify(DATA)); } catch (_) {}
      toast('Saved locally — server is not responding.', 'warn');
    }
  } else {
    try {
      localStorage.setItem(QK.STORE_KEY, JSON.stringify(DATA));
    } catch (e) {
      toast('Storage is full — could not save.', 'err');
    }
  }
}

/* ============================================================== ID + USERS */

/** Next free 3-digit ID (001–998). 999 is reserved for the admin. */
function allocateId() {
  const used = new Set(DATA.users.map(u => String(u.id)));
  for (let i = 1; i <= 998; i++) {
    const id = String(i).padStart(3, '0');
    if (!used.has(id)) return id;
  }
  // All 3-digit ids taken: fall back to a random unused 3-digit code.
  let id;
  do { id = String(Math.floor(Math.random() * 998) + 1).padStart(3, '0'); } while (used.has(id));
  return id;
}

function ensureAdmin() {
  const existing = DATA.users.find(u => u.role === 'admin' || u.username.toLowerCase() === QK.ADMIN_USER.toLowerCase());
  if (existing) {
    // Keep the reserved credentials steady.
    existing.role = 'admin';
    existing.id = QK.ADMIN_ID;
    existing.banned = false;
    return existing;
  }
  const admin = {
    id: QK.ADMIN_ID,
    username: QK.ADMIN_USER,
    email: 'admin@quizkaalaman.local',
    password: QK.ADMIN_PASS,
    role: 'admin',
    banned: false,
    points: 0,
    createdAt: nowISO(),
    theme: null
  };
  DATA.users.push(admin);
  return admin;
}

function findUser(username) {
  if (!username) return null;
  const u = String(username).trim().toLowerCase();
  return DATA.users.find(x => x.username.toLowerCase() === u) || null;
}

function userById(id) {
  return DATA.users.find(u => String(u.id) === String(id)) || null;
}

function currentUser() {
  if (!SESSION) return null;
  return userById(SESSION.userId);
}

function isAdmin(u) { return !!u && u.role === 'admin'; }

function validateUsername(name) {
  const n = String(name || '').trim();
  if (n.length < 3) return 'Username must be at least 3 characters.';
  if (n.length > 20) return 'Username must be 20 characters or fewer.';
  if (!/^[A-Za-z0-9_]+$/.test(n)) return 'Letters, numbers and underscore only. Walang espasyo o simbolo.';
  return null;
}

function validatePassword(pw) {
  const p = String(pw || '');
  if (p.length < 6) return 'Password must be at least 6 characters.';
  if (p.length > 64) return 'Password is too long.';
  return null;
}

/* ============================================================== SCORING */

function userResults(userId) {
  return DATA.results.filter(r => r.userId === userId);
}

function computeStats(userId) {
  const rs = userResults(userId);
  const answered = rs.reduce((s, r) => s + r.total, 0);
  const correct = rs.reduce((s, r) => s + r.score, 0);
  const accuracy = answered ? round((correct / answered) * 100, 1) : 0;
  const rating = answered
    ? round(rs.reduce((s, r) => s + (r.rating || 0), 0) / rs.length, 1)
    : 0;
  const perfect = rs.filter(r => r.total > 0 && r.score === r.total).length;
  const best = rs.reduce((m, r) => Math.max(m, r.total ? round((r.score / r.total) * 100, 1) : 0), 0);
  const lastPlayed = rs.length ? rs.reduce((m, r) => (r.at > m ? r.at : m), rs[0].at) : null;
  return { played: rs.length, answered, correct, accuracy, rating, perfect, best, lastPlayed, points: 0 };
}

/** Rating for a single run: blends accuracy with difficulty weight. */
function runRating(score, total, diffKey) {
  if (!total) return 0;
  const d = diffByKey(diffKey) || DIFFICULTIES[1];
  const acc = score / total;                       // 0..1
  const base = acc * 100;                          // 0..100
  const scaled = base * d.weight;                  // difficulty multiplier
  const cap = 100 * d.weight;
  return round(clamp(scaled, 0, cap) * (100 / cap), 1); // normalised back to 0..100
}

/** Best single run per topic, for the category leaderboard. */
function categoryBoard(topicKey) {
  const best = new Map();
  for (const r of DATA.results) {
    if (topicKey && r.topic !== topicKey) continue;
    const prev = best.get(r.userId);
    const pct = r.total ? (r.score / r.total) * 100 : 0;
    if (!prev || pct > prev.pct || (pct === prev.pct && r.score > prev.raw.score)) {
      best.set(r.userId, { raw: r, pct: round(pct, 1) });
    }
  }
  const rows = [];
  for (const [userId, v] of best) {
    const u = userById(userId);
    if (!u) continue;                              // records for deleted accounts are already purged
    rows.push({
      userId, id: u.id, username: u.username, banned: !!u.banned,
      score: v.raw.score, total: v.raw.total,
      pct: v.pct, difficulty: v.raw.difficulty, at: v.raw.at
    });
  }
  rows.sort((a, b) => b.pct - a.pct || b.score - a.score || (a.at < b.at ? -1 : 1));
  return rows;
}

/** Best single run per difficulty, across every topic. */
function difficultyBoard(diffKey) {
  const best = new Map();
  for (const r of DATA.results) {
    if (diffKey && r.difficulty !== diffKey) continue;
    const prev = best.get(r.userId);
    const pct = r.total ? (r.score / r.total) * 100 : 0;
    if (!prev || pct > prev.pct || (pct === prev.pct && r.score > prev.raw.score)) {
      best.set(r.userId, { raw: r, pct: round(pct, 1) });
    }
  }
  const rows = [];
  for (const [userId, v] of best) {
    const u = userById(userId);
    if (!u) continue;
    rows.push({
      userId, id: u.id, username: u.username,
      score: v.raw.score, total: v.raw.total, pct: v.pct,
      topic: v.raw.topic, at: v.raw.at
    });
  }
  rows.sort((a, b) => b.pct - a.pct || b.score - a.score || (a.at < b.at ? -1 : 1));
  return rows;
}

/** Overall rating board — players ranked by their average rating. */
function overallBoard() {
  const rows = [];
  for (const u of DATA.users) {
    const rs = userResults(u.id);
    if (!rs.length) continue;                      // rating leaderboard = players who have played
    const answered = rs.reduce((s, r) => s + r.total, 0);
    const correct = rs.reduce((s, r) => s + r.score, 0);
    rows.push({
      userId: u.id, id: u.id, username: u.username, role: u.role, banned: !!u.banned,
      points: u.points || 0,
      played: rs.length,
      answered,
      correct,
      accuracy: answered ? round((correct / answered) * 100, 1) : 0,
      rating: answered ? round(rs.reduce((s, r) => s + (r.rating || 0), 0) / rs.length, 1) : 0,
      perfect: rs.filter(r => r.total > 0 && r.score === r.total).length
    });
  }
  rows.sort((a, b) => b.rating - a.rating || b.accuracy - a.accuracy || b.points - a.points);
  return rows;
}

/* ============================================================== THEME */

function applyTheme() {
  const m = (DATA && DATA.meta) || blankData().meta;
  const root = document.documentElement;
  root.style.setProperty('--qk-primary', m.primary);
  root.style.setProperty('--qk-primary-light', m.accent);
  root.style.setProperty('--qk-primary-dark', shade(m.primary, -32));
  const nameEls = $$('[data-site-name]');
  nameEls.forEach(el => { el.textContent = m.siteName; });
  const brand = $('.navbar-brand');
  if (brand) {
    brand.innerHTML = `<span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.7 3.7L12 11.7 5.3 8 12 4.3ZM5 9.6l6 3.3v7.6l-6-3.3V9.6Zm8 10.9v-7.6l6-3.3v7.6l-6 3.3Z"/></svg>
    </span> ${esc(m.siteName.split(' ')[0] || 'QUIZ')} <span class="brand-accent">${esc(m.siteName.split(' ').slice(1).join(' ') || 'KAALAMAN')}</span>`;
  }
}

/** Lighten/darken a hex colour by pct (-100..100). */
function shade(hex, pct) {
  let h = String(hex || '#6d28d9').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = '6d28d9';
  const num = parseInt(h, 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Set the per-category accent variables on :root. */
function applyTopicTheme(topicKey) {
  const t = topicByKey(topicKey);
  const root = document.documentElement;
  if (t) {
    root.style.setProperty('--topic-a', t.c1);
    root.style.setProperty('--topic-b', t.c2);
  } else {
    root.style.setProperty('--topic-a', DATA.meta.primary);
    root.style.setProperty('--topic-b', DATA.meta.accent);
  }
}

/* ============================================================== AUTH */

function showGate(panel) {
  const gate = $('#authGate');
  gate.classList.remove('gone');
  gate.style.display = '';
  $('#gateChoice').classList.add('d-none');
  $('#signinForm').classList.add('d-none');
  $('#loginForm').classList.add('d-none');
  if (panel === 'signin') $('#signinForm').classList.remove('d-none');
  else if (panel === 'login') $('#loginForm').classList.remove('d-none');
  else $('#gateChoice').classList.remove('d-none');
  const first = panel === 'signin' ? $('#signinUser') : panel === 'login' ? $('#loginUser') : null;
  if (first) setTimeout(() => first.focus(), 60);
}

function hideGate() {
  const gate = $('#authGate');
  gate.classList.add('gone');
  setTimeout(() => { gate.style.display = 'none'; }, 300);
}

function startSession(user) {
  SESSION = { userId: user.id };
  try { sessionStorage.setItem(QK.SESSION_KEY, JSON.stringify(SESSION)); } catch (e) {}
  const stored = currentUser();
  const u = stored;
  DATA.meta.theme = u.theme || null;
  applyTheme();
  if (u.theme) {
    DATA.meta.primary = u.theme.primary || DATA.meta.primary;
    DATA.meta.accent = u.theme.accent || DATA.meta.accent;
    applyTheme();
  }
  hideGate();
  $('#app').classList.remove('d-none');
  renderChrome();
  goHome();
}

function logout() {
  SESSION = null;
  try { sessionStorage.removeItem(QK.SESSION_KEY); } catch (e) {}
  stopTimer();
  quiz = null;
  $('#app').classList.add('d-none');
  ['#signinForm', '#loginForm'].forEach(s => $(s).reset && $(s).reset());
  ['#signinError', '#loginError'].forEach(s => $(s) && $(s).classList.add('d-none'));
  showGate('choice');
  toast('Naka-log out ka na. See you again!', 'info');
}

/* -- Sign in (create account) -------------------------------------------- */
function doSignin(ev) {
  ev.preventDefault();
  const errBox = $('#signinError');
  const show = (m) => { errBox.textContent = m; errBox.classList.remove('d-none'); };

  const username = $('#signinUser').value.trim();
  const email = $('#signinEmail').value.trim();
  const pw = $('#signinPass').value;
  const pw2 = $('#signinPass2').value;

  const uErr = validateUsername(username);
  if (uErr) return show(uErr);

  // No duplicate usernames — nobody may share a name.
  if (findUser(username)) return show(`"${username}" is already taken. Pumili ng ibang username.`);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return show('Please enter a valid email address.');
  if (DATA.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return show('That email is already registered. Gamitin ang ibang email.');
  }
  const pErr = validatePassword(pw);
  if (pErr) return show(pErr);
  if (pw !== pw2) return show('Passwords do not match. Hindi pareho ang password.');

  const id = allocateId();
  const user = {
    id,
    username,
    email,
    password: pw,
    role: 'user',
    banned: false,
    points: 0,
    createdAt: nowISO(),
    theme: null
  };
  DATA.users.push(user);
  saveData();
  errBox.classList.add('d-none');

  // The 3-digit ID is shown immediately — this is the code for quick login.
  showIdAnnouncement(user);
}

function showIdAnnouncement(user) {
  const card = $('#gateChoice');
  $('#signinForm').classList.add('d-none');
  $('#loginForm').classList.add('d-none');
  card.classList.remove('d-none');
  card.innerHTML = `
    <div class="text-center">
      <div class="result-head">
        <i class="bi bi-patch-check-fill r-icon" style="color:#16a34a"></i>
        <h3>Registered!</h3>
        <p class="text-muted small mb-3">Welcome, <strong>${esc(user.username)}</strong>.</p>
      </div>
      <div class="id-box mb-3">
        <small>Your ID (quick login code)</small>
        <strong>${esc(user.id)}</strong>
      </div>
      <p class="tiny-note mb-3">
        Remember this 3-digit ID — ito ang ginagamit sa quick login button
        (ang maliit na brain logo sa itaas-kaliwa). Makikita rin ito sa Profile mo.
      </p>
      <button class="btn btn-gate-primary w-100 py-2" type="button" id="afterRegister">
        <i class="bi bi-box-arrow-in-right"></i> Log in now
      </button>
    </div>`;
  const btn = $('#afterRegister');
  if (btn) {
    btn.addEventListener('click', () => {
      restoreGateChoice();
      showGate('login');
      $('#loginUser').value = user.username;
      $('#loginPass').focus();
    });
  }
}

function restoreGateChoice() {
  $('#gateChoice').innerHTML = `
    <p class="gate-ask">Paano ka magsisimula? <em>How do you want to start?</em></p>
    <div class="gate-actions">
      <button class="btn btn-gate btn-gate-primary" type="button" data-go="signin">
        <i class="bi bi-person-plus-fill"></i>
        <span><strong>Sign In</strong><small>Create a new account</small></span>
      </button>
      <button class="btn btn-gate btn-gate-outline" type="button" data-go="login">
        <i class="bi bi-box-arrow-in-right"></i>
        <span><strong>Log In</strong><small>I already have an account</small></span>
      </button>
    </div>`;
}

/* -- Log in -------------------------------------------------------------- */
function doLogin(ev) {
  ev.preventDefault();
  const errBox = $('#loginError');
  const show = (m) => { errBox.textContent = m; errBox.classList.remove('d-none'); };

  const username = $('#loginUser').value.trim();
  const pw = $('#loginPass').value;
  if (!username || !pw) return show('Enter your username and password.');

  const user = findUser(username);
  if (!user || user.password !== pw) {
    return show('Wrong username or password. Hindi tugma sa aming record.');
  }
  if (user.banned) {
    return show('This account is banned. Please contact the administrator.');
  }
  errBox.classList.add('d-none');
  startSession(user);
  toast(`Welcome back, ${user.username}!`, 'ok');
}

/* -- Quick login by 3-digit ID ------------------------------------------- */
function doQuickLogin() {
  const box = $('#quickError');
  const raw = $('#quickId').value.trim();
  const show = (m) => { box.textContent = m; box.classList.remove('d-none'); };

  if (!/^\d{1,3}$/.test(raw)) return show('Please enter a 3-digit ID. Halimbawa: 007');
  const id = String(parseInt(raw, 10)).padStart(3, '0');
  const user = userById(id);
  if (!user) return show(`No account uses the ID ${id}.`);

  box.classList.add('d-none');
  $('#quickId').value = '';
  const modalEl = $('#quickLoginModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();

  // Land on the fill-up form, prefilled with the username for this ID.
  hideGate();
  $('#app').classList.add('d-none');
  showGate('login');
  $('#loginUser').value = user.username;
  $('#loginPass').value = '';
  $('#loginPass').focus();
  toast(`ID ${id} found — please enter the password for ${user.username}.`, 'info');
}

/* ============================================================== NAVIGATION */

const VIEWS = ['home', 'topics', 'setup', 'play', 'result', 'boards', 'profile', 'admin'];

function showView(name) {
  if (name === 'admin' && !isAdmin(currentUser())) {
    toast('Admin area is for administrators only.', 'err');
    return;
  }
  VIEWS.forEach(v => {
    const el = $('#view-' + v);
    if (el) el.classList.toggle('d-none', v !== name);
  });
  $$('.app-nav .nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  renderHome();
  loadBoard();
  showView('home');
}

function renderChrome() {
  const u = currentUser();
  if (!u) return;
  $('#navUser').textContent = u.username;
  $('#navId').textContent = u.id;
  $$('.admin-only').forEach(el => el.classList.toggle('d-none', !isAdmin(u)));
  applyTheme();
}

/* ============================================================== TOPICS UI */

function topicCardHTML(t) {
  return `
  <div class="col-12 col-sm-6 col-lg-4 col-xl-3">
    <button class="topic-card" type="button" data-topic="${t.key}"
            style="--topic-a:${t.c1};--topic-b:${t.c2}"
            aria-label="Open ${esc(t.name)} quiz">
      <span class="topic-num">${TOPICS.indexOf(t) + 1}</span>
      <div class="topic-ico"><i class="bi ${t.icon}"></i></div>
      <h5>${esc(t.name)}</h5>
      <p class="topic-tl">${esc(t.tl)}</p>
      <div class="topic-tags">5 difficulties · up to 500 items</div>
      <span class="topic-go">Pumili at maglaro <i class="bi bi-arrow-right-short"></i></span>
    </button>
  </div>`;
}

function renderTopicGrids() {
  const html = TOPICS.map(topicCardHTML).join('');
  ['#topicGrid', '#topicGridHome'].forEach(sel => {
    const el = $(sel);
    if (el) el.innerHTML = html;
  });
}

/* ============================================================== HOME */

function renderHome() {
  const u = currentUser();
  if (!u) return;
  const st = computeStats(u.id);
  $('#homeName').textContent = u.username;
  $('#hsPlayed').textContent = st.played;
  $('#hsAcc').textContent = st.accuracy + '%';
  $('#hsRating').textContent = st.rating;
  $('#hsPoints').textContent = u.points || 0;
  renderTopicGrids();
}

/* ============================================================== SETUP */

let setupTopic = null;
let setupDiff = 'baby';

function openSetup(topicKey) {
  const t = topicByKey(topicKey);
  if (!t) return;
  setupTopic = topicKey;
  setupDiff = 'baby';
  applyTopicTheme(topicKey);
  renderSetup();
  showView('setup');
}

function renderSetup() {
  const t = topicByKey(setupTopic);
  if (!t) return;
  const card = $('#setupCard');
  const pool = BANK[setupTopic] ? BANK[setupTopic].length : 0;

  const diffCards = DIFFICULTIES.map(d => {
    const usable = Math.min(d.count, pool);
    return `
    <div class="col">
      <button class="diff-card ${setupDiff === d.key ? 'sel' : ''}" type="button" data-diff="${d.key}">
        <div class="d-name">
          <span class="diff-dot" style="background:${d.color}"></span>
          <i class="bi ${d.icon}"></i> ${d.name}
        </div>
        <div class="d-count">${d.count} items · ${d.time}s each</div>
        <div class="d-count" style="opacity:.85">Best available: ${usable} question${usable === 1 ? '' : 's'}</div>
      </button>
    </div>`;
  }).join('');

  card.innerHTML = `
    <div class="setup-head" style="--topic-a:${t.c1};--topic-b:${t.c2}">
      <div class="d-flex align-items-center gap-3">
        <div class="topic-ico" style="margin:0;background:rgba(255,255,255,.24)"><i class="bi ${t.icon}"></i></div>
        <div>
          <h3>${esc(t.name)}</h3>
          <p>${esc(t.tl)}</p>
        </div>
      </div>
    </div>

    <h6 class="mb-2"><i class="bi bi-sliders2"></i> Choose a difficulty</h6>
    <p class="text-muted small">
      Baby = 5 questions, Normal = 20, Hard = 50, Hell = 100, Impossible = 500.
      Ang mga tanong at pagpipilian ay nire-reshuffle bawat laro.
    </p>
    <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-5 g-2" id="diffRow">${diffCards}</div>

    <div class="play-row">
      <div class="play-meta">
        <span class="pill diff" id="setupPill">${diffByKey(setupDiff).name} · ${diffByKey(setupDiff).count} items</span>
        <span class="pill"><i class="bi bi-shuffle"></i> Shuffled every play</span>
        <span class="pill"><i class="bi bi-hourglass-split"></i> ${diffByKey(setupDiff).time}s per question</span>
      </div>
      <button class="btn-play" type="button" id="playBtn">
        <i class="bi bi-play-fill"></i> PLAY
      </button>
    </div>`;

  $$('.diff-card', card).forEach(b => {
    b.addEventListener('click', () => {
      setupDiff = b.dataset.diff;
      renderSetup();
    });
  });
  const pb = $('#playBtn', card);
  if (pb) pb.addEventListener('click', startQuiz);
}

/* ============================================================== QUIZ RUN */

/** Build the run: shuffle the question pool, shuffle each question's choices. */
function buildRun(topicKey, diffKey) {
  const diff = diffByKey(diffKey);
  const all = (BANK[topicKey] || []).map(q => ({ q: q.q, a: q.a, lang: q.lang, all: q.all }));
  const pool = shuffle(all);
  const n = Math.min(diff.count, pool.length);
  const items = [];
  for (let i = 0; i < n; i++) {
    const src = pool[i];
    const choices = shuffle(src.all);
    items.push({
      q: src.q,
      lang: src.lang || 'en',
      answer: src.a,
      choices,
      answerIndex: choices.indexOf(src.a)
    });
  }
  return items;
}

function startQuiz() {
  const u = currentUser();
  if (!u) return;
  if (u.banned) { toast('Your account is banned. You cannot play.', 'err'); return; }

  const items = buildRun(setupTopic, setupDiff);
  if (!items.length) { toast('No questions available for this topic.', 'err'); return; }

  quiz = {
    topic: setupTopic,
    difficulty: setupDiff,
    items,
    index: 0,
    score: 0,
    answers: [],
    startedAt: Date.now(),
    questionStartedAt: 0,
    locked: false,
    timeLeft: DIFFICULTIES.find(d => d.key === setupDiff).time
  };
  applyTopicTheme(setupTopic);
  showView('play');
  renderQuestion();
}

function renderQuestion() {
  const card = $('#playCard');
  if (!quiz) return;
  const item = quiz.items[quiz.index];
  const t = topicByKey(quiz.topic);
  const d = diffByKey(quiz.difficulty);
  const pct = ((quiz.index) / quiz.items.length) * 100;
  const letters = ['A', 'B', 'C', 'D'];

  card.innerHTML = `
    <div class="play-top">
      <div class="play-meta">
        <span class="pill diff" style="--topic-a:${t.c1};--topic-b:${t.c2}">
          <i class="bi ${t.icon}"></i> ${esc(t.name)}
        </span>
        <span class="pill"><i class="bi ${d.icon}"></i> ${d.name}</span>
        <span class="pill"><i class="bi bi-list-ol"></i> ${quiz.index + 1} / ${quiz.items.length}</span>
        <span class="pill"><i class="bi bi-star-fill"></i> Score ${quiz.score}</span>
      </div>
      <button class="btn btn-sm btn-outline-secondary btn-skip" type="button" id="quitQuiz">
        <i class="bi bi-x-lg"></i> Quit
      </button>
    </div>

    <div class="timer-bar" role="progressbar" aria-label="Time left"
         aria-valuemin="0" aria-valuemax="${d.time}" aria-valuenow="${quiz.timeLeft}">
      <div class="timer-fill" id="timerFill"></div>
    </div>

    <div class="q-text">
      <span class="badge q-tag ${item.lang === 'tl' ? 'text-bg-warning' : 'text-bg-primary'}">
        ${item.lang === 'tl' ? 'Tagalog' : 'English'}
      </span>
      ${esc(item.q)}
    </div>

    <div class="opt-list" id="optList">
      ${item.choices.map((c, i) => `
        <button class="opt-btn" type="button" data-idx="${i}">
          <span class="opt-key">${letters[i]}</span>
          <span>${esc(c)}</span>
        </button>`).join('')}
    </div>

    <div id="fbSlot"></div>

    <div class="play-foot">
      <span class="text-muted small">${pct.toFixed(0)}% complete</span>
      <button class="btn btn-gate-primary d-none" type="button" id="nextBtn">
        ${quiz.index === quiz.items.length - 1 ? 'Finish' : 'Next'} <i class="bi bi-arrow-right"></i>
      </button>
    </div>`;

  $$('#optList .opt-btn', card).forEach(b => {
    b.addEventListener('click', () => answerQuestion(parseInt(b.dataset.idx, 10)));
  });
  $('#quitQuiz', card).addEventListener('click', quitQuiz);
  startTimer();
}

function startTimer() {
  stopTimer();
  const d = diffByKey(quiz.difficulty);
  quiz.timeLeft = d.time;
  quiz.questionStartedAt = Date.now();
  updateTimerBar();
  timerHandle = setInterval(() => {
    quiz.timeLeft -= 1;
    if (quiz.timeLeft <= 0) {
      quiz.timeLeft = 0;
      updateTimerBar();
      stopTimer();
      answerQuestion(-1);       // time out = no answer
      return;
    }
    updateTimerBar();
  }, 1000);
}

function updateTimerBar() {
  const fill = $('#timerFill');
  if (!fill || !quiz) return;
  const d = diffByKey(quiz.difficulty);
  const pct = clamp((quiz.timeLeft / d.time) * 100, 0, 100);
  fill.style.width = pct + '%';
  fill.classList.toggle('low', pct <= 30);
  const bar = fill.parentElement;
  if (bar) bar.setAttribute('aria-valuenow', String(quiz.timeLeft));
}

function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

function answerQuestion(idx) {
  if (!quiz || quiz.locked) return;
  quiz.locked = true;
  stopTimer();

  const item = quiz.items[quiz.index];
  const isTimeout = idx < 0;
  const correct = !isTimeout && idx === item.answerIndex;
  const ms = Date.now() - quiz.questionStartedAt;

  if (correct) quiz.score += 1;
  quiz.answers.push({
    index: quiz.index,
    q: item.q,
    lang: item.lang,
    correct,
    timedOut: isTimeout,
    picked: isTimeout ? null : item.choices[idx],
    answer: item.answer,
    ms
  });

  $$('#optList .opt-btn').forEach(b => {
    const i = parseInt(b.dataset.idx, 10);
    b.disabled = true;
    if (i === item.answerIndex) b.classList.add('correct');
    else if (i === idx) b.classList.add('wrong');
    else b.classList.add('dim');
  });

  const fb = $('#fbSlot');
  if (fb) {
    fb.innerHTML = correct
      ? `<div class="feedback ok"><i class="bi bi-check-circle-fill"></i> Tama! Correct.
           <span class="fb-note">Answer: ${esc(item.answer)} · ${fmtDur(ms)}</span></div>`
      : `<div class="feedback no"><i class="bi bi-x-circle-fill"></i>
           ${isTimeout ? 'Naubos ang oras! Time is up.' : 'Mali. That is not right.'}
           <span class="fb-note">Correct answer: <strong>${esc(item.answer)}</strong></span></div>`;
  }

  const next = $('#nextBtn');
  if (next) {
    next.classList.remove('d-none');
    next.addEventListener('click', nextQuestion);
    next.focus();
  }

  // Last question: auto-advance after a beat so 500-item runs stay quick.
  if (quiz.index === quiz.items.length - 1 && !correct) {
    // users still get to read the answer — no auto-advance here
  }
}

function nextQuestion() {
  if (!quiz) return;
  quiz.index += 1;
  quiz.locked = false;
  if (quiz.index >= quiz.items.length) {
    finishQuiz();
    return;
  }
  renderQuestion();
}

function quitQuiz() {
  if (!quiz) return;
  const done = quiz.index + (quiz.locked ? 1 : 0);
  if (done === 0 && !confirm('Quit this quiz? Wala pang nasagot — hindi ito mare-record.')) return;
  stopTimer();
  if (done > 0) {
    if (!confirm('Quit this quiz? Ang mga nasagot na ay mare-record.')) {
      quiz.locked = true;
      startTimerResume();
      return;
    }
    finishQuiz(true);
  } else {
    quiz = null;
    applyTopicTheme(null);
    showView('topics');
  }
}

/** Resume the timer after a cancelled quit (keeps the remaining seconds). */
function startTimerResume() {
  const keep = quiz.timeLeft;
  stopTimer();
  timerHandle = setInterval(() => {
    quiz.timeLeft -= 1;
    if (quiz.timeLeft <= 0) { quiz.timeLeft = 0; updateTimerBar(); stopTimer(); return; }
    updateTimerBar();
  }, 1000);
  quiz.timeLeft = keep;
  updateTimerBar();
}

function finishQuiz(partial = false) {
  stopTimer();
  const u = currentUser();
  if (!u) return;

  const answered = quiz.answers.length;
  const total = quiz.items.length;
  const duration = Date.now() - quiz.startedAt;

  if (answered === 0) {
    quiz = null;
    applyTopicTheme(null);
    showView('topics');
    return;
  }

  // Score counts only answered items; unanswered remain part of the total.
  const rating = runRating(quiz.score, total, quiz.difficulty);
  const record = {
    id: uid(),
    userId: u.id,
    topic: quiz.topic,
    difficulty: quiz.difficulty,
    score: quiz.score,
    total,
    answered,
    rating,
    duration,
    at: nowISO(),
    answers: quiz.answers.map(a => ({
      q: a.q, correct: a.correct, picked: a.picked, answer: a.answer, ms: a.ms
    }))
  };
  DATA.results.push(record);

  // Points: correct answers gain, wrong ones cost a little.
  const delta = (quiz.score * QK.POINTS_CORRECT) + ((answered - quiz.score) * QK.POINTS_WRONG);
  u.points = clamp((u.points || 0) + delta, 0, 1000000);

  saveData();
  renderResult(record, partial);
  showView('result');
  quiz = null;
  applyTopicTheme(null);
}

function renderResult(r, partial) {
  const t = topicByKey(r.topic);
  const d = diffByKey(r.difficulty);
  const pct = r.total ? round((r.score / r.total) * 100, 1) : 0;
  const u = currentUser();
  const st = computeStats(u.id);

  let title, icon, color;
  if (pct >= 90)      { title = 'Napakahusay! Outstanding!'; icon = 'bi-trophy-fill';   color = '#f59e0b'; }
  else if (pct >= 75) { title = 'Magaling! Great job!';      icon = 'bi-star-fill';     color = '#16a34a'; }
  else if (pct >= 50) { title = 'Hindi masama! Not bad.';    icon = 'bi-hand-thumbs-up-fill'; color = '#3b82f6'; }
  else                { title = 'Kaya pa! Keep practising.'; icon = 'bi-arrow-repeat'; color = '#ef4444'; }

  const wrongList = r.answers.filter(a => !a.correct).slice(0, 12);
  const reviewHTML = wrongList.length
    ? `<details class="mt-2">
         <summary class="fw-bold" style="cursor:pointer;color:var(--qk-primary-dark)">
           Review ${wrongList.length}${r.answers.filter(a => !a.correct).length > 12 ? ' (showing first 12)' : ''} missed item(s)
         </summary>
         <div class="mt-2">${wrongList.map(a => `
           <div class="review-item no">
             <div class="rv-q">${esc(a.q)}</div>
             <div class="rv-a">Your answer:
               <span class="rv-no">${a.picked ? esc(a.picked) : 'No answer (timed out)'}</span></div>
             <div class="rv-a">Correct:
               <span class="rv-ok">${esc(a.answer)}</span></div>
           </div>`).join('')}</div>
       </details>`
    : `<p class="text-success fw-bold mt-3 mb-0"><i class="bi bi-check2-all"></i> Perfect run — walang mali!</p>`;

  $('#resultCard').innerHTML = `
    <div class="result-head">
      <i class="bi ${icon} r-icon" style="color:${color}"></i>
      <h3>${title}</h3>
      <p class="text-muted small mb-0">
        ${esc(t.name)} · ${d.name}${partial ? ' · ended early' : ''}
      </p>
    </div>

    <div class="text-center">
      <div class="rating-big">${pct}%</div>
      <p class="text-muted small mb-0">Final score</p>
    </div>

    <div class="score-row">
      <span class="pill"><i class="bi bi-check-circle"></i> ${r.score} correct</span>
      <span class="pill"><i class="bi bi-x-circle"></i> ${r.answered - r.score} wrong</span>
      <span class="pill"><i class="bi bi-list-ol"></i> ${r.score} / ${r.total}</span>
      <span class="pill"><i class="bi bi-speedometer2"></i> Rating ${r.rating}</span>
      <span class="pill"><i class="bi bi-stopwatch"></i> ${fmtDur(r.duration)}</span>
    </div>

    <div class="alert alert-light border-0 mb-2" style="background:var(--qk-soft)">
      <div class="d-flex flex-wrap gap-3 justify-content-between small">
        <span>Best in ${esc(t.name)}: <strong>${st.best}%</strong></span>
        <span>Overall rating: <strong>${st.rating}</strong></span>
        <span>Total points: <strong>${u.points || 0}</strong></span>
      </div>
    </div>

    ${r.answers.some(a => !a.correct) ? reviewHTML : reviewHTML}

    <div class="d-flex flex-wrap gap-2 justify-content-center mt-4">
      <button class="btn btn-gate-primary" type="button" id="againBtn"><i class="bi bi-arrow-repeat"></i> Play again</button>
      <button class="btn btn-gate-outline" type="button" data-nav="topics"><i class="bi bi-grid-3x3-gap"></i> Other quizzes</button>
      <button class="btn btn-outline-secondary" type="button" id="boardsBtn"><i class="bi bi-trophy"></i> Leaderboards</button>
    </div>`;

  $('#againBtn').addEventListener('click', () => { openSetup(r.topic); });
  $('#boardsBtn').addEventListener('click', () => { renderBoardsView(); showView('boards'); });
}

/* ============================================================== LEADERBOARDS */

function boardFiltersHTML(prefix) {
  if (boardMode === 'category') {
    return `
      <label class="form-label mb-1" for="${prefix}CatSel">Category</label>
      <select class="form-select form-select-sm" id="${prefix}CatSel" style="max-width:420px">
        ${TOPICS.map(t => `<option value="${t.key}" ${boardCat === t.key ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
      </select>`;
  }
  if (boardMode === 'difficulty') {
    return `
      <label class="form-label mb-1" for="${prefix}DiffSel">Difficulty</label>
      <select class="form-select form-select-sm" id="${prefix}DiffSel" style="max-width:420px">
        ${DIFFICULTIES.map(d => `<option value="${d.key}" ${boardDiff === d.key ? 'selected' : ''}>${d.name} — ${d.count} items</option>`).join('')}
      </select>`;
  }
  return `<p class="text-muted small mb-0">
    Players ranked by overall rating — ang average ng lahat ng kanilang laro, bigat ng bawat difficulty kasama.
  </p>`;
}

function rankBadge(i) {
  const cls = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
  return `<span class="rank-badge ${cls}">${i + 1}</span>`;
}

function playerCell(name) {
  return `<div class="player-cell"><span class="player-dot">${esc(initials(name))}</span><span>${esc(name)}</span></div>`;
}

function boardHTML() {
  const me = currentUser();
  const myId = me ? me.id : null;

  if (boardMode === 'category') {
    const rows = categoryBoard(boardCat);
    if (!rows.length) return emptyBoard('Wala pang naglaro sa category na ito.');
    return `
    <table class="qk-table">
      <thead><tr>
        <th style="width:56px">Rank</th><th>Player</th><th>Score</th><th>Items</th>
        <th>%</th><th>Difficulty</th><th>Played</th>
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr class="${String(r.userId) === String(myId) ? 'is-me' : ''}">
            <td>${rankBadge(i)}</td>
            <td>${playerCell(r.username)}${r.banned ? ' <span class="badge badge-banned">BANNED</span>' : ''}</td>
            <td><strong>${r.score}</strong></td>
            <td>${r.total}</td>
            <td><strong>${r.pct}%</strong></td>
            <td><span class="badge" style="background:${diffByKey(r.difficulty).color}">${diffByKey(r.difficulty).name}</span></td>
            <td class="text-muted small">${esc(fmtDate(r.at))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  }

  if (boardMode === 'difficulty') {
    const rows = difficultyBoard(boardDiff);
    if (!rows.length) return emptyBoard('Wala pang naglaro sa difficulty na ito.');
    return `
    <table class="qk-table">
      <thead><tr>
        <th style="width:56px">Rank</th><th>Player</th><th>Topic</th><th>Score</th>
        <th>Items</th><th>%</th><th>Difficulty</th><th>Played</th>
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => {
          const t = topicByKey(r.topic);
          const d = diffByKey(boardDiff);
          return `
          <tr class="${String(r.userId) === String(myId) ? 'is-me' : ''}">
            <td>${rankBadge(i)}</td>
            <td>${playerCell(r.username)}</td>
            <td><span class="topic-dot" style="background:linear-gradient(145deg,${t.c1},${t.c2})"><i class="bi ${t.icon}"></i></span>${esc(t.name)}</td>
            <td><strong>${r.score}</strong></td>
            <td>${r.total}</td>
            <td><strong>${r.pct}%</strong></td>
            <td><span class="badge" style="background:${d.color}">${d.name}</span></td>
            <td class="text-muted small">${esc(fmtDate(r.at))}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  }

  // overall
  const rows = overallBoard();
  if (!rows.length) return emptyBoard('Wala pang may rating. Maglaro ka na!');
  return `
  <table class="qk-table">
    <thead><tr>
      <th style="width:56px">Rank</th><th>Player</th><th>Rating</th><th>Accuracy</th>
      <th>Quizzes</th><th>Items</th><th>Perfect</th><th>Points</th>
    </tr></thead>
    <tbody>
      ${rows.map((r, i) => `
        <tr class="${String(r.userId) === String(myId) ? 'is-me' : ''}">
          <td>${rankBadge(i)}</td>
          <td>${playerCell(r.username)}
            ${r.role === 'admin' ? ' <span class="badge badge-admin">ADMIN</span>' : ''}
            ${r.banned ? ' <span class="badge badge-banned">BANNED</span>' : ''}</td>
          <td><strong style="color:var(--qk-primary)">${r.rating}</strong></td>
          <td>${r.accuracy}%</td>
          <td>${r.played}</td>
          <td>${r.answered}</td>
          <td>${r.perfect}</td>
          <td>${r.points}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

function emptyBoard(msg) {
  return `<div class="empty-note"><i class="bi bi-hourglass-split"></i>${esc(msg)}</div>`;
}

function loadBoard() {
  if (boardMode === 'category' && !boardCat) boardCat = TOPICS[0].key;
  const f = $('#boardFilters');
  const b = $('#boardBody');
  if (!f || !b) return;
  f.innerHTML = boardFiltersHTML('home');
  b.innerHTML = boardHTML();
  wireBoardControls('home');
}

function loadBoard2() {
  if (boardMode === 'category' && !boardCat) boardCat = TOPICS[0].key;
  const f = $('#boardFilters2');
  const b = $('#boardBody2');
  if (!f || !b) return;
  f.innerHTML = boardFiltersHTML('full');
  b.innerHTML = boardHTML();
  wireBoardControls('full');
}

function wireBoardControls(which) {
  const id = which === 'home' ? '#homeCatSel' : '#fullCatSel';
  const dId = which === 'home' ? '#homeDiffSel' : '#fullDiffSel';
  const cs = $(id), ds = $(dId);
  if (cs) cs.addEventListener('change', () => { boardCat = cs.value; which === 'home' ? loadBoard() : loadBoard2(); });
  if (ds) ds.addEventListener('change', () => { boardDiff = ds.value; which === 'home' ? loadBoard() : loadBoard2(); });
}

function renderBoardsView() { loadBoard2(); }

/* ============================================================== PROFILE */

function renderProfile() {
  const u = currentUser();
  if (!u) return;
  const st = computeStats(u.id);

  $('#pfAvatar').textContent = initials(u.username);
  $('#pfName').textContent = u.username;
  $('#pfEmail').textContent = u.email || '—';
  $('#pfId').textContent = u.id;
  $('#pfAdminBadge').classList.toggle('d-none', !isAdmin(u));
  $('#pfBannedBadge').classList.toggle('d-none', !u.banned);

  $('#pfStats').innerHTML = `
    <div class="col-6 col-md-3"><div class="stat-card"><div class="s-val">${st.rating}</div><div class="s-lab">Overall Rating</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card"><div class="s-val">${st.played}</div><div class="s-lab">Quizzes Taken</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card"><div class="s-val">${st.correct}</div><div class="s-lab">Correct Answers</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card"><div class="s-val">${st.accuracy}%</div><div class="s-lab">Accuracy</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card"><div class="s-val">${u.points || 0}</div><div class="s-lab">Points</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card"><div class="s-val">${st.best}%</div><div class="s-lab">Best Run</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card"><div class="s-val">${st.perfect}</div><div class="s-lab">Perfect Runs</div></div></div>
    <div class="col-6 col-md-3"><div class="stat-card"><div class="s-val" style="font-size:.95rem;padding-top:.4rem">${esc(st.lastPlayed ? fmtDate(st.lastPlayed) : '—')}</div><div class="s-lab">Last Played</div></div></div>`;

  // Per-category breakdown
  const perCat = TOPICS.map(t => {
    const rs = userResults(u.id).filter(r => r.topic === t.key);
    if (!rs.length) return null;
    const answered = rs.reduce((s, r) => s + r.total, 0);
    const correct = rs.reduce((s, r) => s + r.score, 0);
    const pct = answered ? round((correct / answered) * 100, 1) : 0;
    return { t, rs, answered, correct, pct };
  }).filter(Boolean);

  $('#pfPerCat').innerHTML = perCat.length
    ? perCat.sort((a, b) => b.pct - a.pct).map(x => `
      <div class="cat-bar">
        <div class="cb-top">
          <span><i class="bi ${x.t.icon}" style="color:${x.t.c1}"></i> ${esc(x.t.name)}</span>
          <span>${x.correct}/${x.answered} · ${x.pct}%</span>
        </div>
        <div class="cb-track">
          <div class="cb-fill" style="width:${x.pct}%;background:linear-gradient(90deg,${x.t.c1},${x.t.c2})"></div>
        </div>
      </div>`).join('')
    : `<div class="empty-note"><i class="bi bi-bar-chart"></i>Wala ka pang laro. Play a quiz para makita ang performance mo.</div>`;

  // History
  const hist = userResults(u.id).slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  $('#pfHistCount').textContent = hist.length ? `${hist.length} record(s)` : '';
  $('#pfHistory').innerHTML = hist.length
    ? `<table class="qk-table">
        <thead><tr><th>Date</th><th>Topic</th><th>Difficulty</th><th>Score</th><th>%</th><th>Rating</th><th>Time</th></tr></thead>
        <tbody>
          ${hist.map(r => {
            const t = topicByKey(r.topic), d = diffByKey(r.difficulty);
            const pct = r.total ? round((r.score / r.total) * 100, 1) : 0;
            return `<tr>
              <td class="text-muted small">${esc(fmtDate(r.at))}</td>
              <td><span class="topic-dot" style="background:linear-gradient(145deg,${t.c1},${t.c2})"><i class="bi ${t.icon}"></i></span>${esc(t.name)}</td>
              <td><span class="badge" style="background:${d.color}">${d.name}</span></td>
              <td><strong>${r.score}</strong> / ${r.total}</td>
              <td><strong>${pct}%</strong></td>
              <td>${r.rating}</td>
              <td class="text-muted small">${esc(fmtDur(r.duration))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`
    : `<div class="empty-note"><i class="bi bi-clock-history"></i>Wala pang quiz history.</div>`;

  renderMyRequests();
}

function renderMyRequests() {
  const u = currentUser();
  if (!u) return;
  const mine = DATA.requests.filter(r => r.userId === u.id).slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  const box = $('#pfReqStatus');
  if (!mine.length) { box.innerHTML = ''; return; }
  box.innerHTML = mine.slice(0, 5).map(r => `
    <div class="d-flex justify-content-between align-items-center gap-2 mb-1">
      <span class="small">→ <strong>${esc(r.requested)}</strong></span>
      <span class="req-chip ${r.status}">${r.status}</span>
    </div>`).join('');
}

function requestNameChange() {
  const u = currentUser();
  const input = $('#pfNewName');
  const wanted = input.value.trim();
  const err = validateUsername(wanted);
  if (err) { toast(err, 'err'); return; }
  if (wanted.toLowerCase() === u.username.toLowerCase()) { toast('That is already your username.', 'warn'); return; }
  if (findUser(wanted)) { toast(`"${wanted}" is already taken.`, 'err'); return; }

  const pending = DATA.requests.find(r => r.userId === u.id && r.status === 'pending');
  if (pending) { toast('May pending request ka na. Please wait for the admin.', 'warn'); return; }

  DATA.requests.push({
    id: uid(),
    userId: u.id,
    from: u.username,
    requested: wanted,
    status: 'pending',
    at: nowISO(),
    decidedAt: null
  });
  saveData();
  input.value = '';
  renderMyRequests();
  toast('Request sent to the admin. Antayin ang approval.', 'ok');
}

function copyId() {
  const u = currentUser();
  if (!u) return;
  const text = u.id;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast('ID copied: ' + text, 'ok'),
      () => toast('Your ID is ' + text, 'info')
    );
  } else {
    toast('Your ID is ' + text, 'info');
  }
}

/* ============================================================== ADMIN */

function renderAdmin() {
  const me = currentUser();
  if (!isAdmin(me)) return;

  // --- players table
  const q = ($('#adminSearch').value || '').trim().toLowerCase();
  const filter = $('#adminFilter').value;
  let users = DATA.users.slice().sort((a, b) => (a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : a.username.localeCompare(b.username)));
  if (q) {
    users = users.filter(u =>
      u.username.toLowerCase().includes(q) ||
      String(u.id).includes(q) ||
      (u.email || '').toLowerCase().includes(q));
  }
  if (filter === 'admin') users = users.filter(u => u.role === 'admin');
  if (filter === 'banned') users = users.filter(u => u.banned);
  if (filter === 'active') users = users.filter(u => !u.banned);

  $('#adminUsers').innerHTML = users.length ? `
    <table class="qk-table">
      <thead><tr>
        <th style="width:52px">ID</th><th>Player</th><th>Email</th><th>Password</th>
        <th>Quick code</th><th>Points</th><th>Rating</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${users.map(u => {
          const st = computeStats(u.id);
          const self = String(u.id) === String(me.id);
          return `<tr class="${self ? 'is-me' : ''}">
            <td><strong>${esc(u.id)}</strong></td>
            <td>${playerCell(u.username)}
              ${u.role === 'admin' ? ' <span class="badge badge-admin">ADMIN</span>' : ' <span class="badge badge-user">USER</span>'}</td>
            <td class="small">${esc(u.email || '—')}</td>
            <td><span class="cred-box cred-reveal" data-reveal="${esc(u.password)}" title="Click to reveal">••••••</span></td>
            <td><span class="cred-box">${esc(u.id)}</span></td>
            <td>${u.points || 0}</td>
            <td>${st.rating} <span class="text-muted small">(${st.played})</span></td>
            <td>${u.banned ? '<span class="badge badge-banned">BANNED</span>' : '<span class="badge text-bg-success">Active</span>'}</td>
            <td>
              <div class="admin-action">
                <button class="btn btn-outline-primary btn-xs" data-act="points" data-uid="${esc(u.id)}"><i class="bi bi-plus-circle"></i> Points</button>
                <button class="btn btn-outline-secondary btn-xs" data-act="rename" data-uid="${esc(u.id)}"><i class="bi bi-pencil"></i> Rename</button>
                <button class="btn btn-outline-warning btn-xs" data-act="toggleAdmin" data-uid="${esc(u.id)}" ${self ? 'disabled' : ''}>
                  <i class="bi bi-shield-check"></i> ${u.role === 'admin' ? 'Demote' : 'Make admin'}</button>
                <button class="btn btn-outline-dark btn-xs" data-act="ban" data-uid="${esc(u.id)}" ${self ? 'disabled' : ''}>
                  <i class="bi bi-slash-circle"></i> ${u.banned ? 'Unban' : 'Ban'}</button>
                <button class="btn btn-outline-danger btn-xs" data-act="delete" data-uid="${esc(u.id)}" ${self ? 'disabled' : ''}>
                  <i class="bi bi-trash"></i> Delete</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`
    : `<div class="empty-note"><i class="bi bi-people"></i>No players match your search.</div>`;

  // --- name requests
  const pending = DATA.requests.filter(r => r.status === 'pending');
  const badge = $('#reqBadge');
  if (badge) {
    badge.textContent = pending.length;
    badge.classList.toggle('d-none', pending.length === 0);
  }
  const all = DATA.requests.slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  $('#adminRequests').innerHTML = all.length ? all.map(r => {
    const u = userById(r.userId);
    return `
    <div class="req-card">
      <div class="rc-line mb-1">
        <strong>${esc(r.from)}</strong> <span class="text-muted small">(ID ${esc(r.userId)})</span>
        → wants <strong>${esc(r.requested)}</strong>
        <span class="req-chip ${r.status}">${r.status}</span>
      </div>
      <div class="text-muted small mb-2">
        ${esc(fmtDate(r.at))}${r.decidedAt ? ' · decided ' + esc(fmtDate(r.decidedAt)) : ''}
        ${!u ? ' · account no longer exists' : ''}
      </div>
      ${r.status === 'pending' && u ? `
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-success" data-req="approve" data-rid="${esc(r.id)}">
            <i class="bi bi-check2"></i> Approve</button>
          <button class="btn btn-sm btn-outline-danger" data-req="reject" data-rid="${esc(r.id)}">
            <i class="bi bi-x"></i> Reject</button>
        </div>` : ''}
    </div>`;
  }).join('')
  : `<div class="empty-note"><i class="bi bi-inbox"></i>Walang name change requests.</div>`;

  // --- points select
  const sel = $('#ptsUser');
  const keep = sel.value;
  sel.innerHTML = DATA.users.map(u =>
    `<option value="${esc(u.id)}">${esc(u.username)} — ID ${esc(u.id)} (${u.points || 0} pts)</option>`).join('');
  if (keep && userById(keep)) sel.value = keep;

  // --- overview
  const totalAnswered = DATA.results.reduce((s, r) => s + r.total, 0);
  const totalCorrect = DATA.results.reduce((s, r) => s + r.score, 0);
  $('#adminOverview').innerHTML = `
    <div class="col-6"><div class="stat-card"><div class="s-val">${DATA.users.length}</div><div class="s-lab">Players</div></div></div>
    <div class="col-6"><div class="stat-card"><div class="s-val">${DATA.results.length}</div><div class="s-lab">Quizzes Played</div></div></div>
    <div class="col-6"><div class="stat-card"><div class="s-val">${totalCorrect}</div><div class="s-lab">Correct Answers</div></div></div>
    <div class="col-6"><div class="stat-card"><div class="s-val">${totalAnswered ? round((totalCorrect / totalAnswered) * 100, 1) : 0}%</div><div class="s-lab">Site Accuracy</div></div></div>
    <div class="col-6"><div class="stat-card"><div class="s-val">${pending.length}</div><div class="s-lab">Open Requests</div></div></div>
    <div class="col-6"><div class="stat-card"><div class="s-val">${DATA.users.filter(u => u.banned).length}</div><div class="s-lab">Banned</div></div></div>`;

  // --- theme form
  $('#themePrimary').value = DATA.meta.primary;
  $('#themeAccent').value = DATA.meta.accent;
  $('#themeSiteName').value = DATA.meta.siteName;

  wireAdminControls();
}

function wireAdminControls() {
  $$('#adminUsers [data-reveal]').forEach(el => {
    el.addEventListener('click', () => {
      const shown = el.classList.toggle('shown');
      el.textContent = shown ? el.dataset.reveal : '••••••';
    });
  });

  $$('#adminUsers [data-act]').forEach(btn => {
    btn.addEventListener('click', () => adminAction(btn.dataset.act, btn.dataset.uid));
  });

  $$('#adminRequests [data-req]').forEach(btn => {
    btn.addEventListener('click', () => decideRequest(btn.dataset.rid, btn.dataset.req === 'approve'));
  });

  const s = $('#adminSearch');
  s.oninput = () => renderAdmin();
  const f = $('#adminFilter');
  f.onchange = () => renderAdmin();

  const gp = $('#givePoints');
  gp.onclick = givePoints;

  const et = $('#saveTheme');
  et.onclick = saveTheme;
  const rt = $('#resetTheme');
  rt.onclick = resetTheme;
  $$('.btn-theme-preset').forEach(b => {
    b.onclick = () => { $('#themePrimary').value = b.dataset.color; };
  });

  const ex = $('#exportData');
  ex.onclick = exportJSON;
  const im = $('#importData');
  im.onclick = () => $('#importFile').click();
  const ifl = $('#importFile');
  ifl.onchange = importJSON;

  const ch = $('#adminClearHistory');
  ch.onclick = clearAllHistory;
}

function adminAction(act, uidStr) {
  const u = userById(uidStr);
  const me = currentUser();
  if (!u) { toast('Player not found.', 'err'); return; }

  if (act === 'points') {
    const v = prompt(`Points to give ${u.username} (use a negative number to deduct):`, '100');
    if (v === null) return;
    const n = parseInt(v, 10);
    if (isNaN(n)) { toast('Enter a whole number.', 'err'); return; }
    u.points = clamp((u.points || 0) + n, 0, 1000000);
    saveData();
    toast(`${n >= 0 ? 'Added' : 'Deducted'} ${Math.abs(n)} points ${n >= 0 ? 'to' : 'from'} ${u.username}. Now ${u.points}.`, 'ok');
    renderAdmin();
    return;
  }

  if (act === 'rename') {
    const v = prompt(`New username for ${u.username}:`, u.username);
    if (v === null) return;
    const name = v.trim();
    const err = validateUsername(name);
    if (err) { toast(err, 'err'); return; }
    const other = findUser(name);
    if (other && String(other.id) !== String(u.id)) { toast('That username is already taken.', 'err'); return; }
    u.username = name;
    // Any pending request from this user is now satisfied.
    DATA.requests.forEach(r => {
      if (r.userId === u.id && r.status === 'pending') { r.status = 'approved'; r.decidedAt = nowISO(); }
    });
    saveData();
    toast(`Username changed to ${name}.`, 'ok');
    renderAdmin();
    if (String(me.id) === String(u.id)) renderChrome();
    return;
  }

  if (act === 'toggleAdmin') {
    if (String(u.id) === String(me.id)) { toast('You cannot change your own admin status.', 'warn'); return; }
    u.role = u.role === 'admin' ? 'user' : 'admin';
    saveData();
    toast(`${u.username} is now ${u.role === 'admin' ? 'an ADMIN' : 'a regular player'}.`, 'ok');
    renderAdmin();
    return;
  }

  if (act === 'ban') {
    if (String(u.id) === String(me.id)) { toast('You cannot ban yourself.', 'warn'); return; }
    u.banned = !u.banned;
    saveData();
    toast(`${u.username} ${u.banned ? 'is now BANNED' : 'has been unbanned'}.`, u.banned ? 'warn' : 'ok');
    renderAdmin();
    return;
  }

  if (act === 'delete') {
    if (String(u.id) === String(me.id)) { toast('You cannot delete your own account.', 'warn'); return; }
    if (!confirm(`Delete ${u.username} (ID ${u.id})?\n\nThis removes the account AND all of its quiz records, requests and leaderboard entries. Hindi na ito maibabalik.`)) return;
    const rid = String(u.id);
    DATA.users = DATA.users.filter(x => String(x.id) !== rid);
    DATA.results = DATA.results.filter(r => String(r.userId) !== rid);   // all records go too
    DATA.requests = DATA.requests.filter(r => String(r.userId) !== rid);
    saveData();
    toast(`${u.username} and all records deleted.`, 'ok');
    renderAdmin();
    return;
  }
}

function decideRequest(rid, approve) {
  const r = DATA.requests.find(x => x.id === rid);
  if (!r || r.status !== 'pending') return;
  const u = userById(r.userId);
  if (!u) { r.status = 'rejected'; r.decidedAt = nowISO(); saveData(); renderAdmin(); return; }

  if (approve) {
    const clash = findUser(r.requested);
    if (clash && String(clash.id) !== String(u.id)) {
      toast(`Cannot approve — "${r.requested}" is already taken.`, 'err');
      return;
    }
    u.username = r.requested;
  }
  r.status = approve ? 'approved' : 'rejected';
  r.decidedAt = nowISO();
  saveData();
  toast(approve ? `Approved: ${r.from} → ${r.requested}` : `Rejected the request from ${r.from}.`, approve ? 'ok' : 'info');
  renderAdmin();
}

function givePoints() {
  const sel = $('#ptsUser');
  const u = userById(sel.value);
  if (!u) { toast('Pick a player first.', 'err'); return; }
  const n = parseInt($('#ptsAmount').value, 10);
  if (isNaN(n) || n === 0) { toast('Enter a non-zero whole number.', 'err'); return; }
  u.points = clamp((u.points || 0) + n, 0, 1000000);
  saveData();
  toast(`${n > 0 ? 'Gave' : 'Deducted'} ${Math.abs(n)} points ${n > 0 ? 'to' : 'from'} ${u.username}. Total: ${u.points}.`, 'ok');
  renderAdmin();
}

function saveTheme() {
  DATA.meta.primary = $('#themePrimary').value;
  DATA.meta.accent = $('#themeAccent').value;
  DATA.meta.siteName = ($('#themeSiteName').value || 'QUIZ KAALAMAN').trim().slice(0, 30);
  saveData();
  applyTheme();
  toast('Theme applied for everyone.', 'ok');
}

function resetTheme() {
  DATA.meta.primary = '#6d28d9';
  DATA.meta.accent = '#a855f7';
  DATA.meta.siteName = 'QUIZ KAALAMAN';
  saveData();
  applyTheme();
  renderAdmin();
  toast('Theme restored to the original purple & white.', 'ok');
}

function clearAllHistory() {
  if (!confirm('Clear the quiz history of ALL players? Accounts stay, but every score and leaderboard entry is removed.')) return;
  DATA.results = [];
  saveData();
  renderAdmin();
  toast('All quiz history cleared.', 'warn');
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'quiz-kaalaman-data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('JSON exported.', 'ok');
}

function importJSON(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(String(reader.result));
      if (!obj || !Array.isArray(obj.users)) throw new Error('bad shape');
      if (!confirm('Replace the current data with this file?')) return;
      DATA = obj;
      DATA.users = DATA.users || [];
      DATA.results = DATA.results || [];
      DATA.requests = DATA.requests || [];
      DATA.meta = Object.assign(blankData().meta, DATA.meta || {});
      ensureAdmin();
      saveData();
      applyTheme();
      renderAdmin();
      toast('Data imported.', 'ok');
    } catch (e) {
      toast('That file is not a valid QUIZ KAALAMAN export.', 'err');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

/* ============================================================== WIRING */

function wireEvents() {
  // gate buttons (delegated — the choice panel is rebuilt after registering)
  $('#authGate').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b || !$('#authGate').contains(b) || b.dataset.go === 'back') return;
    showGate(b.dataset.go);
  });
  $('#authGate').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go="back"]');
    if (b) showGate('choice');
  });

  $('#signinForm').addEventListener('submit', doSignin);
  $('#loginForm').addEventListener('submit', doLogin);

  // show/hide password toggles
  $$('[data-toggle-pass]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePass);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
  // "show all" checkboxes
  const link = (cbSel, ids) => {
    const cb = $(cbSel);
    if (!cb) return;
    cb.addEventListener('change', () => {
      ids.forEach(i => {
        const inp = document.getElementById(i);
        if (!inp) return;
        inp.type = cb.checked ? 'text' : 'password';
        const t = document.querySelector(`[data-toggle-pass="${i}"]`);
        if (t) t.innerHTML = `<i class="bi ${cb.checked ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
      });
    });
  };
  link('#signinShowAll', ['signinPass', 'signinPass2']);
  link('#loginShowAll', ['loginPass']);

  // quick login
  const qBtn = $('#quickLoginBtn');
  if (qBtn) {
    qBtn.addEventListener('click', () => {
      $('#quickId').value = '';
      $('#quickError').classList.add('d-none');
      const modal = bootstrap.Modal.getOrCreateInstance($('#quickLoginModal'));
      modal.show();
      setTimeout(() => $('#quickId').focus(), 350);
    });
  }
  $('#quickSubmit').addEventListener('click', doQuickLogin);
  $('#quickId').addEventListener('keydown', (e) => { if (e.key === 'Enter') doQuickLogin(); });
  $('#quickId').addEventListener('input', () => {
    $('#quickId').value = $('#quickId').value.replace(/\D/g, '').slice(0, 3);
  });

  // logout
  $('#logoutBtn').addEventListener('click', logout);

  // nav
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      const to = nav.dataset.nav;
      if (to === 'home') goHome();
      else if (to === 'topics') { renderTopicGrids(); showView('topics'); }
      else if (to === 'boards') { renderBoardsView(); showView('boards'); }
      else if (to === 'profile') { renderProfile(); showView('profile'); }
      else if (to === 'admin') { renderAdmin(); showView('admin'); }
      return;
    }
    const topic = e.target.closest('[data-topic]');
    if (topic && !topic.disabled) { openSetup(topic.dataset.topic); }
  });

  // leaderboard tabs — home
  $$('#view-home .seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      boardMode = b.dataset.board;
      $$('#view-home .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      loadBoard();
    });
  });
  // leaderboard tabs — full view
  $$('#view-boards .seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      boardMode = b.dataset.board2;
      $$('#view-boards .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      loadBoard2();
    });
  });

  // profile
  $('#pfRequestName').addEventListener('click', requestNameChange);
  $('#pfCopyId').addEventListener('click', copyId);
  $('#pfNewName').addEventListener('keydown', (e) => { if (e.key === 'Enter') requestNameChange(); });

  // clean up the timer when the tab is hidden for a long time
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && quiz && timerHandle) {
      // freeze: subtract the hidden period by restarting from the stored seconds
      stopTimer();
      quiz.paused = true;
    } else if (!document.hidden && quiz && quiz.paused) {
      quiz.paused = false;
      startTimerResume();
    }
  });
}

/* ============================================================== BOOT */

async function boot() {
  $('#gateYear').textContent = new Date().getFullYear();
  $('#footYear').textContent = '© ' + new Date().getFullYear();

  wireEvents();
  await loadData();

  $('#storageMode').textContent = storageMode === 'server' ? 'server JSON' : 'browser localStorage';
  $('#footMode').textContent = storageMode === 'server' ? 'server JSON storage' : 'local storage';

  applyTheme();

  // Resume a session if the tab was reloaded.
  let resumed = false;
  try {
    const raw = sessionStorage.getItem(QK.SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const u = s && userById(s.userId);
      if (u && !u.banned) {
        SESSION = { userId: u.id };
        resumed = true;
      }
    }
  } catch (e) {}

  if (resumed) {
    const u = currentUser();
    applyTheme();
    hideGate();
    $('#app').classList.remove('d-none');
    renderChrome();
    goHome();
  } else {
    SESSION = null;
    $('#app').classList.add('d-none');
    applyTheme();
    showGate('choice');
  }
}

/**
 * First-run seed check — warns loudly in the console if a topic has an empty bank.
 * The question banks live in questions.js-style data inside this file (see BANK below).
 */
function selfCheck() {
  const problems = [];
  TOPICS.forEach(t => {
    const n = (BANK[t.key] || []).length;
    if (n < 5) problems.push(`${t.key}: only ${n} question(s)`);
  });
  if (problems.length) console.warn('[QUIZ KAALAMAN] thin question banks →', problems.join('; '));
  return problems;
}

document.addEventListener('DOMContentLoaded', () => { boot(); });
