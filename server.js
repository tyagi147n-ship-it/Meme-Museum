const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 3000;
const sessions = new Map();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function makeSeed() {
  return {
    users: [],
    memes: [
      { id: 'demo-1', userId: 'museum', username: 'Museum', caption: 'When the code works on the first try', category: 'Programming', image: '/demo1.svg', createdAt: new Date().toISOString(), likes: [], ratings: [], comments: [] },
      { id: 'demo-2', userId: 'museum', username: 'Museum', caption: 'Me opening the assignment one night before submission', category: 'College', image: '/demo2.svg', createdAt: new Date().toISOString(), likes: [], ratings: [], comments: [] }
    ],
    reports: []
  };
}
function loadDb() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(makeSeed(), null, 2));
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { const fresh = makeSeed(); fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2)); return fresh; }
}
let db = loadDb();
function saveDb() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function send(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': 'same-origin', ...headers });
  res.end(JSON.stringify(value));
}
function publicMeme(m) {
  const ratings = m.ratings || [];
  return { id: m.id, username: m.username, caption: m.caption, category: m.category, image: m.image,
    createdAt: m.createdAt, likes: (m.likes || []).length,
    rating: ratings.length ? Math.round(ratings.reduce((a, x) => a + x.value, 0) / ratings.length * 10) / 10 : 0,
    ratingCount: ratings.length, comments: m.comments || [] };
}
function currentUser(req) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('mm_session='))?.slice(11);
  return token ? sessions.get(token) : null;
}
function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = ''; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error('Request is too large.')); req.destroy(); } else data += chunk; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Please send valid form data.')); } });
    req.on('error', reject);
  });
}
function safeText(value, max) { return String(value || '').trim().slice(0, max); }
function requireUser(req, res) { const user = currentUser(req); if (!user) send(res, 401, { error: 'Please log in first.' }); return user; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex'); return `${salt}:${hash}`;
}
function passwordMatches(password, saved) {
  const [salt, original] = String(saved).split(':');
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(original, 'hex'));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (pathname.startsWith('/api/')) {
      if (req.method === 'GET' && pathname === '/api/me') return send(res, 200, { user: currentUser(req) });
      if (req.method === 'POST' && pathname === '/api/register') {
        const body = await readBody(req); const username = safeText(body.username, 30); const email = safeText(body.email, 100).toLowerCase(); const password = String(body.password || '');
        if (username.length < 2 || !email.includes('@') || password.length < 6) return send(res, 400, { error: 'Enter a name, valid email, and password with at least 6 characters.' });
        if (db.users.some(u => u.email === email)) return send(res, 409, { error: 'An account with that email already exists. Please log in.' });
        const user = { id: crypto.randomUUID(), username, email, passwordHash: hashPassword(password) }; db.users.push(user); saveDb();
        const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { id: user.id, username: user.username });
        return send(res, 201, { user: { id: user.id, username: user.username } }, { 'Set-Cookie': `mm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` });
      }
      if (req.method === 'POST' && pathname === '/api/login') {
        const body = await readBody(req); const email = safeText(body.email, 100).toLowerCase(); const user = db.users.find(u => u.email === email);
        if (!user || !passwordMatches(String(body.password || ''), user.passwordHash)) return send(res, 401, { error: 'Email or password is incorrect.' });
        const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { id: user.id, username: user.username });
        return send(res, 200, { user: { id: user.id, username: user.username } }, { 'Set-Cookie': `mm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` });
      }
      if (req.method === 'POST' && pathname === '/api/logout') {
        const user = currentUser(req); const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('mm_session='))?.slice(11); if (token) sessions.delete(token);
        return send(res, 200, { ok: true }, { 'Set-Cookie': 'mm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
      }
      if (req.method === 'GET' && pathname === '/api/memes') {
        const q = safeText(url.searchParams.get('q'), 80).toLowerCase(); const category = safeText(url.searchParams.get('category'), 40);
        let memes = db.memes.map(publicMeme).filter(m => (!q || `${m.caption} ${m.category} ${m.username}`.toLowerCase().includes(q)) && (!category || category === 'All' || m.category === category));
        const sort = url.searchParams.get('sort'); if (sort === 'popular') memes.sort((a,b) => b.likes-a.likes); else if (sort === 'trending') memes.sort((a,b) => (b.likes + b.comments.length*2)-(a.likes + a.comments.length*2)); else memes.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        return send(res, 200, { memes, categories: [...new Set(db.memes.map(m => m.category))].sort() });
      }
      const match = pathname.match(/^\/api\/memes\/([^/]+)(?:\/(like|rate|comments|report))?$/);
      if (match) {
        const [, id, action] = match; const meme = db.memes.find(m => m.id === id); if (!meme) return send(res, 404, { error: 'Meme not found.' });
        if (req.method === 'GET' && !action) return send(res, 200, { meme: publicMeme(meme) });
        if (!action) return send(res, 405, { error: 'That action is not supported.' });
        const user = requireUser(req, res); if (!user) return;
        const body = await readBody(req);
        if (req.method === 'POST' && action === 'like') {
          meme.likes = meme.likes || []; const index = meme.likes.indexOf(user.id); if (index >= 0) meme.likes.splice(index,1); else meme.likes.push(user.id); saveDb(); return send(res, 200, { liked: index < 0 });
        }
        if (req.method === 'POST' && action === 'rate') {
          const value = Number(body.value); if (!Number.isInteger(value) || value < 1 || value > 5) return send(res, 400, { error: 'Choose a rating from 1 to 5.' });
          meme.ratings = meme.ratings || []; const old = meme.ratings.find(r => r.userId === user.id); if (old) old.value = value; else meme.ratings.push({ userId: user.id, value }); saveDb(); return send(res, 200, { ok: true });
        }
        if (req.method === 'POST' && action === 'comments') {
          const text = safeText(body.text, 500); if (!text) return send(res, 400, { error: 'Write a comment first.' });
          meme.comments = meme.comments || []; meme.comments.push({ id: crypto.randomUUID(), username: user.username, text, createdAt: new Date().toISOString() }); saveDb(); return send(res, 201, { ok: true });
        }
        if (req.method === 'POST' && action === 'report') {
          const reason = safeText(body.reason, 300); if (!reason) return send(res, 400, { error: 'Please describe why you are reporting this meme.' });
          db.reports.push({ id: crypto.randomUUID(), memeId: id, userId: user.id, username: user.username, reason, createdAt: new Date().toISOString() }); saveDb(); return send(res, 201, { ok: true });
        }
      }
      if (req.method === 'POST' && pathname === '/api/upload') {
        const user = requireUser(req, res); if (!user) return; const body = await readBody(req, 8 * 1024 * 1024);
        const caption = safeText(body.caption, 180); const category = safeText(body.category, 40) || 'Other'; const match = String(body.imageData || '').match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
        if (!caption) return send(res, 400, { error: 'Add a caption for your meme.' }); if (!match) return send(res, 400, { error: 'Choose a PNG, JPG, GIF, or WEBP image.' });
        const bytes = Buffer.from(match[2], 'base64'); if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return send(res, 400, { error: 'Image must be smaller than 5 MB.' });
        const ext = { 'image/jpeg':'jpg', 'image/png':'png', 'image/gif':'gif', 'image/webp':'webp' }[match[1]]; const filename = `${crypto.randomUUID()}.${ext}`; fs.writeFileSync(path.join(UPLOADS, filename), bytes);
        const meme = { id: crypto.randomUUID(), userId: user.id, username: user.username, caption, category, image: `/uploads/${filename}`, createdAt: new Date().toISOString(), likes: [], ratings: [], comments: [] }; db.memes.push(meme); saveDb(); return send(res, 201, { meme: publicMeme(meme) });
      }
      if (req.method === 'POST' && pathname === '/api/contact') { const b = await readBody(req); if (!safeText(b.name,80) || !safeText(b.email,100) || !safeText(b.message,1000)) return send(res,400,{error:'Please fill in every field.'}); return send(res,200,{ok:true,message:'Thanks! Your message has been recorded for this demo.'}); }
      return send(res, 404, { error: 'API route not found.' });
    }
    const filePath = pathname === '/' ? path.join(PUBLIC, 'index.html') : path.resolve(PUBLIC, `.${pathname}`);
    if (!filePath.startsWith(PUBLIC + path.sep) && filePath !== path.join(PUBLIC,'index.html')) return send(res,403,{error:'Not allowed.'});
    let target = filePath;
    if (pathname.startsWith('/uploads/')) target = path.resolve(UPLOADS, `.${pathname.slice('/uploads'.length)}`);
    if (pathname.startsWith('/uploads/') && !target.startsWith(UPLOADS + path.sep)) return send(res,403,{error:'Not allowed.'});
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return send(res,404,{error:'File not found.'});
    const ext = path.extname(target).toLowerCase(); const types = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff' }); fs.createReadStream(target).pipe(res);
  } catch (error) {
    if (!res.headersSent) send(res, 500, { error: error.message || 'Something went wrong.' }); else res.destroy();
  }
});

server.listen(PORT, () => console.log(`Meme Museum is running at http://localhost:${PORT}`));
