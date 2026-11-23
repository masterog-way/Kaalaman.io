/* ==========================================================================
   QUIZ KAALAMAN — server.js
   Node + Express server for Railway. Serves the static site and keeps the
   whole database in a JSON file, so every player sees the same accounts,
   scores and leaderboards.

   Run locally:   npm install && npm start   →  http://localhost:3000
   On Railway:    push the repo; Railway runs `npm start` automatically.
   ========================================================================== */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/* Where the data lives. On Railway, attach a Volume and set DATA_DIR to its
   mount path (e.g. /data) so the database survives redeploys.
   Without a volume the file is written inside the container and is reset
   whenever Railway rebuilds. */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'quiz-kaalaman.json');

const ADMIN_USER = 'Mr.Admin1';
const ADMIN_PASS = 'Admin123!';
const ADMIN_ID = '999';
const PUBLIC_DIR = __dirname;

/* --------------------------------------------------------------- storage */

function blankData() {
  return {
    version: '1.0.0',
    meta: {
      siteName: 'QUIZ KAALAMAN',
      primary: '#6d28d9',
      accent: '#a855f7',
      createdAt: new Date().toISOString()
    },
    users: [],
    results: [],
    requests: [],
    seed: 0
  };
}

function ensureAdmin(data) {
  const existing = data.users.find(
    u => u.role === 'admin' || String(u.username).toLowerCase() === ADMIN_USER.toLowerCase()
  );
  if (existing) {
    existing.role = 'admin';
    existing.id = ADMIN_ID;
    existing.banned = false;
    return;
  }
  data.users.push({
    id: ADMIN_ID,
    username: ADMIN_USER,
    email: 'admin@quizkaalaman.local',
    password: ADMIN_PASS,
    role: 'admin',
    banned: false,
    points: 0,
    createdAt: new Date().toISOString(),
    theme: null
  });
}

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    console.error('[data] read failed:', err.message);
    return null;
  }
}

/* Atomic-ish write: write to a temp file then rename, so a crash mid-write
   cannot leave a half-written database behind. */
function writeData(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
    return true;
  } catch (err) {
    console.error('[data] write failed:', err.message);
    return false;
  }
}

function loadOrInit() {
  let data = readData();
  if (!data) {
    data = blankData();
    ensureAdmin(data);
    writeData(data);
    console.log('[data] created new database at', DATA_FILE);
  } else {
    data.users = Array.isArray(data.users) ? data.users : [];
    data.results = Array.isArray(data.results) ? data.results : [];
    data.requests = Array.isArray(data.requests) ? data.requests : [];
    data.meta = Object.assign(blankData().meta, data.meta || {});
    ensureAdmin(data);
  }
  return data;
}

/* ------------------------------------------------------------ middleware */

app.use(express.json({ limit: '8mb' }));
app.use(express.static(PUBLIC_DIR, { index: 'index.html', extensions: ['html'] }));

/* Very light rate limit on the API — stops accidental request storms from
   one tab from hammering the disk. */
const hits = new Map();
app.use('/api', (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, reset: now + 60000 };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + 60000; }
  rec.count += 1;
  hits.set(ip, rec);
  if (rec.count > 600) return res.status(429).json({ ok: false, error: 'Too many requests' });
  next();
});

/* ------------------------------------------------------------------ API */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'QUIZ KAALAMAN',
    version: '1.0.0',
    storage: 'json',
    time: new Date().toISOString()
  });
});

app.get('/api/data', (req, res) => {
  const data = loadOrInit();
  res.json(data);
});

app.put('/api/data', (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.users)) {
    return res.status(400).json({ ok: false, error: 'Invalid payload shape' });
  }

  /* The server owns the admin account: whatever the client sends, the
     reserved admin credentials are enforced here too. */
  incoming.results = Array.isArray(incoming.results) ? incoming.results : [];
  incoming.requests = Array.isArray(incoming.requests) ? incoming.requests : [];
  incoming.meta = Object.assign(blankData().meta, incoming.meta || {});
  ensureAdmin(incoming);

  /* Records belonging to players that no longer exist are dropped, so a
     deleted account can never leave orphan scores on a leaderboard. */
  const ids = new Set(incoming.users.map(u => String(u.id)));
  incoming.results = incoming.results.filter(r => ids.has(String(r.userId)));
  incoming.requests = incoming.requests.filter(r => ids.has(String(r.userId)));

  if (!writeData(incoming)) {
    return res.status(500).json({ ok: false, error: 'Could not write database' });
  }
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

/* A tiny read-only summary, handy for checking a Railway deployment. */
app.get('/api/stats', (req, res) => {
  const data = loadOrInit();
  res.json({
    ok: true,
    players: data.users.length,
    results: data.results.length,
    openRequests: data.requests.filter(r => r.status === 'pending').length
  });
});

/* SPA-ish fallback: any unknown path returns the app. */
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* ---------------------------------------------------------------- start */

app.listen(PORT, '0.0.0.0', () => {
  const data = loadOrInit();
  console.log('=========================================');
  console.log('  QUIZ KAALAMAN server is running');
  console.log('  Port    :', PORT);
  console.log('  Data    :', DATA_FILE);
  console.log('  Players :', data.users.length);
  console.log('  Admin   :', ADMIN_USER, '/ (password set)');
  console.log('=========================================');
});

/* Do not crash the container on an unexpected error — log it and keep going. */
process.on('uncaughtException', err => console.error('[uncaught]', err));
process.on('unhandledRejection', err => console.error('[unhandled]', err));
