'use strict';
/*
 * Живой класс — сервер.
 * Express (страницы и API) + Socket.IO (события в реальном времени).
 * Все данные хранятся в одной папке (на Amvera это постоянное хранилище /data):
 *   db.json          — ученики, группы, уроки, ответы, сообщения
 *   exercises/*.html — загруженные задания
 *   boards/*.json    — общие доски
 *   images/*         — картинки из сообщений и с досок
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Boards = require('./boards');

const PORT = Number(process.env.PORT) || 3000;
const DATA = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
// на Railway без подключённого тома (Volume) всё стирается при каждом обновлении — предупреждаем учителя
const STORAGE_WARN = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) && !process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.DATA_DIR;
if (STORAGE_WARN) console.warn('WARNING: no Railway volume — data will be lost on the next deploy. Add a Volume mounted at /data.');
const EX_DIR = path.join(DATA, 'exercises');
const IMG_DIR = path.join(DATA, 'images');
const BOARD_DIR = path.join(DATA, 'boards');
const MEDIA_DIR = path.join(DATA, 'media');
const BACKUP_DIR = path.join(DATA, 'backups');
const DB_FILE = path.join(DATA, 'db.json');
const PUB = path.join(__dirname, 'public');
for (const d of [DATA, EX_DIR, IMG_DIR, BOARD_DIR, MEDIA_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true });

/* ---------- хранилище ---------- */
let db = {};
let restoring = false;
/* GUEST_ONLY=1 — «гостевой» сервер (например, резервный на Railway): нет аккаунтов учеников и Telegram,
   ученики входят только по ссылке-приглашению на доску и пишут имя; имена гостей удаляются через сутки */
const GUEST_ONLY = /^(1|true|yes)$/i.test(process.env.GUEST_ONLY || '');   // идёт восстановление из полной копии — ничего не записываем
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = {}; }
db = Object.assign({
  secret: crypto.randomBytes(32).toString('hex'),
  teacher: null,
  students: {}, groups: {}, groupOrder: [], lessons: {}, exercises: {},
  progress: {}, threads: {}, docs: {}, library: [], templates: [], journals: {}, folders: {}, tg: {}, guests: {}, vocab: {}, ideas: {}, exits: {}, palette: [], stars: {}
}, db);

let saveTimer = null;
function writeNow() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
function save() {
  if (restoring) return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; try { writeNow(); } catch (e) { console.error('save failed', e); } }, 400);
}
/* доски хранятся отдельными файлами и держатся в памяти, пока открыты */
const boards = {}, boardTimers = {};
function loadBoard(id) {
  if (boards[id]) return boards[id];
  try { boards[id] = JSON.parse(fs.readFileSync(path.join(BOARD_DIR, id + '.json'), 'utf8')); } catch (e) { return null; }
  return boards[id];
}
function writeBoard(id) {
  const b = boards[id]; if (!b) return;
  const f = path.join(BOARD_DIR, id + '.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(b)); fs.renameSync(f + '.tmp', f);
  backupBoard(id, f);
}
/* резервные копии: не чаще раза в 3 часа на доску, хранятся последние 30 */
const lastBackup = {};
function backupBoard(id, file) {
  try {
    const now = Date.now();
    if (lastBackup[id] && now - lastBackup[id] < 3 * 3600e3) return;
    const dir = path.join(BACKUP_DIR, id); fs.mkdirSync(dir, { recursive: true });
    const list = fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort();
    if (!lastBackup[id] && list.length) { const t = Number(list[list.length - 1].replace('.json', '')); if (now - t < 3 * 3600e3) { lastBackup[id] = t; return; } }
    fs.copyFileSync(file, path.join(dir, now + '.json')); lastBackup[id] = now;
    list.concat(now + '.json').slice(0, -30).forEach(x => { try { fs.unlinkSync(path.join(dir, x)); } catch (e) {} });
  } catch (e) { console.error('backup failed', e.message); }
}
function saveBoard(id) {
  if (boardTimers[id]) return;
  boardTimers[id] = setTimeout(() => { delete boardTimers[id]; try { writeBoard(id); } catch (e) { console.error('board save failed', e); } }, 500);
}
function shutdown() {
  try { if (saveTimer) clearTimeout(saveTimer); writeNow(); } catch (e) {}
  for (const id of Object.keys(boardTimers)) { try { clearTimeout(boardTimers[id]); writeBoard(id); } catch (e) {} }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
writeNow();

/* ---------- утилиты ---------- */
const newId = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');
const pk = (sid, exId) => sid + ':' + exId;
const clampPct = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const str = (v, max) => String(v == null ? '' : v).slice(0, max);

function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
function checkPw(pw, stored) {
  try {
    const [s, h] = String(stored).split(':');
    const a = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 32);
    const b = Buffer.from(h, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}
function sign(p) {
  const b = Buffer.from(JSON.stringify(p)).toString('base64url');
  return b + '.' + crypto.createHmac('sha256', db.secret).update(b).digest('base64url');
}
function verify(token) {
  if (!token) return null;
  const [b, s] = String(token).split('.');
  if (!b || !s) return null;
  const e = crypto.createHmac('sha256', db.secret).update(b).digest('base64url');
  if (e.length !== s.length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(s))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(b, 'base64url').toString()); } catch (err) { return null; }
  if (!p || p.exp < Date.now()) return null;
  if (p.r === 't') return db.teacher && db.teacher.v === p.v ? p : null;
  if (p.r === 's') { const st = db.students[p.id]; if (!st || st.v !== p.v || st.status) return null; if (p.via === 'link' && (!st.link || !inGroup(st.id))) return null; return p; }
  if (p.r === 'g') { const g = db.guests[p.id]; return g ? p : null; }
  if (p.r === 'p') { const st = db.students[p.id]; return st && st.v === p.v ? p : null; }
  return null;
}
function verifyPlain(token) {
  if (!token) return null;
  const [b, s] = String(token).split('.');
  if (!b || !s) return null;
  const e = crypto.createHmac('sha256', db.secret).update(b).digest('base64url');
  if (e.length !== s.length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(s))) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p && p.exp > Date.now() ? p : null; } catch (err) { return null; }
}
function cookies(h) {
  const o = {};
  String(h || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) { try { o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); } catch (e) {} }
  });
  return o;
}
const session = req => verify(cookies(req.headers.cookie).sid);
function setSid(req, res, payload) {
  const days = 90;
  const val = sign(Object.assign({}, payload, { exp: Date.now() + days * 864e5 }));
  res.append('Set-Cookie', `sid=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}` + (req.secure ? '; Secure' : ''));
}

const groupOfExercise = exId => {
  const ex = db.exercises[exId]; if (!ex) return null;
  const l = db.lessons[ex.lessonId]; if (!l) return null;
  return db.groups[l.groupId] || null;
};
const canStudent = (sid, exId) => {
  const ex = db.exercises[exId];
  if (db.guests[sid]) return db.guests[sid].boardId === exId;
  const st = db.students[sid]; if (!st || st.status) return false;
  if (ex && Array.isArray(ex.blocked) && ex.blocked.includes(sid)) return false;
  if (ex && Array.isArray(ex.access) && ex.access.includes(sid)) return true;
  const g = groupOfExercise(exId); return !!(g && g.studentIds.includes(sid));
};
const pubStudent = s => ({ id: s.id, name: s.name, login: s.login, lastSeen: s.lastSeen || null, createdAt: s.createdAt, status: s.status || 'ok', tg: s.tgUsername || (s.tgId ? 'id ' + s.tgId : ''), link: !!s.link });
const summaryOf = p => p ? { filled: p.filled, total: p.total, correct: p.correct, wrong: p.wrong, scroll: p.scroll, near: p.near, action: p.action, updatedAt: p.updatedAt } : null;
const loginTaken = (login, exceptId) => {
  const L = login.toLowerCase();
  if (db.teacher && db.teacher.login.toLowerCase() === L) return true;
  return Object.values(db.students).some(s => s.id !== exceptId && s.login.toLowerCase() === L);
};
function dropExercise(exId) {
  delete db.exercises[exId];
  try { fs.unlinkSync(path.join(EX_DIR, exId + '.html')); } catch (e) {}
  try { fs.unlinkSync(path.join(BOARD_DIR, exId + '.json')); } catch (e) {}
  delete boards[exId];
  for (const k of Object.keys(db.progress)) if (k.endsWith(':' + exId)) delete db.progress[k];
  for (const k of Object.keys(db.threads)) if (k.endsWith(':' + exId)) delete db.threads[k];
}
function dropLesson(lId) {
  const l = db.lessons[lId]; if (!l) return;
  l.exerciseIds.forEach(dropExercise);
  delete db.lessons[lId];
}
/* Заметки (Notes): разрешаем только простую разметку */
const DOC_TAGS = new Set(['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'ul', 'ol', 'li', 'mark', 'h2', 'h3', 'blockquote']);
function cleanDoc(html) {
  html = String(html || '').slice(0, 200000)
    .replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const keep = [];
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (m, close, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!DOC_TAGS.has(tag)) return '';
    let out;
    if (close) out = '</' + tag + '>';
    else if (tag === 'mark') { const c = /class\s*=\s*["']?(h[1-5])/i.exec(attrs); out = '<mark' + (c ? ' class="' + c[1] + '"' : '') + '>'; }
    else out = '<' + tag + '>';
    keep.push(out); return '\u0000' + (keep.length - 1) + '\u0000';
  });
  return html.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
}
const titleFromHtml = html => { const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html); return m ? m[1].trim() : ''; };

/* ---------- приложение ---------- */
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '20mb' }));
app.use('/static', express.static(PUB, { maxAge: '1h' }));

const auth = role => (req, res, next) => {
  const s = session(req);
  if (!s || (role && s.r !== role)) return res.status(401).json({ error: 'Please sign in' });
  req.s = s; next();
};
function notifyGroup(gid) {
  const g = db.groups[gid]; if (!g || typeof io === 'undefined') return;
  for (const sid of g.studentIds) io.to('s:' + sid).emit('refresh');
}
const notifyLesson = lid => { const l = db.lessons[lid]; if (l) notifyGroup(l.groupId); };
const bad = (res, msg, code) => res.status(code || 400).json({ error: msg });

/* страницы */
app.get('/', (req, res) => {
  const s = session(req);
  if (s && s.r === 't') return res.redirect('/teacher');
  if (s && s.r === 's') return res.redirect('/student');
  res.set('Cache-Control', 'no-store').sendFile(path.join(PUB, 'login.html'));
});
app.get('/teacher', (req, res) => { const s = session(req); if (!s || s.r !== 't') return res.redirect('/'); res.sendFile(path.join(PUB, 'teacher.html')); });
app.get('/student', (req, res) => { const s = session(req); if (!s || s.r !== 's') return res.redirect('/'); res.set('Cache-Control', 'no-store'); res.sendFile(path.join(PUB, 'student.html')); });

/* вход */
app.get('/api/setup', (req, res) => res.json({ needed: !db.teacher }));
app.post('/api/setup', (req, res) => {
  if (db.teacher) return bad(res, 'Teacher already exists', 403);
  const login = str(req.body.login, 40).trim();
  const password = str(req.body.password, 200);
  if (!/^[\w.\-а-яё]{3,40}$/i.test(login)) return bad(res, 'Login: at least 3 characters — letters, digits, dot or dash');
  if (password.length < 6) return bad(res, 'Password: at least 6 characters');
  db.teacher = { login, hash: hashPw(password), v: 1 };
  save();
  setSid(req, res, { r: 't', v: 1 });
  res.json({ role: 't' });
});
app.post('/api/login', (req, res) => {
  const L = str(req.body.login, 60).trim().toLowerCase();
  const pw = str(req.body.password, 200);
  if (db.teacher && L === db.teacher.login.toLowerCase() && checkPw(pw, db.teacher.hash)) {
    setSid(req, res, { r: 't', v: db.teacher.v });
    return res.json({ role: 't' });
  }
  const st = GUEST_ONLY ? null : Object.values(db.students).find(s => s.login.toLowerCase() === L);
  if (st && checkPw(pw, st.hash)) {
    setSid(req, res, { r: 's', id: st.id, v: st.v });
    return res.json({ role: 's' });
  }
  setTimeout(() => bad(res, 'Wrong login or password', 401), 500);
});
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

/* ---------- вход через Telegram (бот, ссылка t.me/бот?start=код — работает в любом браузере, включая Safari) ---------- */
const QRCode = require('qrcode');
/* личная ссылка для входа без Telegram и пароля: работает, пока учитель её не отзовёт
   или пока ученик состоит хотя бы в одной группе */
function inGroup(sid) { return Object.values(db.groups).some(g => g.studentIds.includes(sid)); }
function baseUrl(req) { const h = req.headers['x-forwarded-host'] || req.headers.host; const pr = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http'); return pr.split(',')[0] + '://' + h; }
async function linkOut(req, st) {
  if (!st.link) return { on: false };
  const url = baseUrl(req) + '/l/' + st.link;
  let qr = ''; try { qr = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#1E1E1C', light: '#FFFFFF' } }); } catch (e) {}
  return { on: true, url, qr, at: st.linkAt || null, used: st.linkUsed || null };
}
app.get('/api/t/students/:id/link', auth('t'), async (req, res) => { const st = db.students[req.params.id]; if (!st) return bad(res, 'Student not found', 404); res.json(await linkOut(req, st)); });
app.post('/api/t/students/:id/link', auth('t'), async (req, res) => {
  const st = db.students[req.params.id]; if (!st) return bad(res, 'Student not found', 404);
  if (!st.link || req.body.renew) { st.link = crypto.randomBytes(18).toString('base64url'); st.linkAt = Date.now(); st.linkUsed = null; if (req.body.renew) { st.v = (st.v || 1) + 1; io.in('s:' + st.id).disconnectSockets(true); } }
  save(); res.json(await linkOut(req, st));
});
app.delete('/api/t/students/:id/link', auth('t'), (req, res) => {
  const st = db.students[req.params.id]; if (!st) return bad(res, 'Student not found', 404);
  delete st.link; delete st.linkAt; delete st.linkUsed;
  st.v = (st.v || 1) + 1; io.in('s:' + st.id).disconnectSockets(true);   // кто вошёл по ссылке — выходит
  save(); res.json({ ok: true });
});
app.get('/l/:token', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (GUEST_ONLY) return res.redirect('/?link=off');
  const t = String(req.params.token || '');
  const st = t.length > 10 && Object.values(db.students).find(x => x.link === t);
  if (!st || st.status === 'blocked' || st.status === 'pending' || !inGroup(st.id)) return res.redirect('/?link=off');
  st.linkUsed = Date.now(); save();
  setSid(req, res, { r: 's', id: st.id, v: st.v, via: 'link' });
  res.redirect('/student');
});
const tg = { token: '', username: '', gen: 0, offset: 0 };
const tgCodes = new Map();
const tgToken = () => process.env.TELEGRAM_BOT_TOKEN || (db.tg && db.tg.token) || '';
async function tgApi(method, body) {
  const t = tg.token; if (!t) throw new Error('no bot');
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 40000);
  try {
    const r = await fetch((process.env.TELEGRAM_API || 'https://api.telegram.org') + '/bot' + t + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: ctl.signal });
    const d = await r.json();
    if (!d.ok) throw new Error(d.description || 'Telegram error');
    return d.result;
  } finally { clearTimeout(tm); }
}
const tgSend = (chat, text, extra) => tgApi('sendMessage', Object.assign({ chat_id: chat, text, disable_web_page_preview: true }, extra || {})).catch(e => console.error('tg send', e.message));
async function startBot() {
  const gen = ++tg.gen; tg.token = tgToken(); tg.username = '';
  if (!tg.token) return;
  try { const me = await tgApi('getMe'); tg.username = me.username; await tgApi('deleteWebhook', { drop_pending_updates: false }).catch(() => {}); console.log('Telegram bot @' + me.username); }
  catch (e) { console.error('Telegram bot:', e.message); tg.error = e.message; setTimeout(() => { if (gen === tg.gen) startBot(); }, 30000); return; }
  tg.error = '';
  while (gen === tg.gen) {
    try {
      const ups = await tgApi('getUpdates', { offset: tg.offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
      for (const u of ups) { tg.offset = u.update_id + 1; try { await tgUpdate(u); } catch (e) { console.error('tg update', e); } }
    } catch (e) { if (gen !== tg.gen) return; await new Promise(r => setTimeout(r, 5000)); }
  }
}
const tgName = u => [u.first_name, u.last_name].filter(Boolean).join(' ');
async function tgUpdate(u) {
  if (u.message && typeof u.message.text === 'string') {
    const m = /^\/start(?:\s+(\w+))?/.exec(u.message.text.trim()), from = u.message.from;
    if (!m || !from) return;
    const entry = m[1] && tgCodes.get(m[1]);
    if (!entry || Date.now() - entry.at > 15 * 60e3) return tgSend(from.id, 'Open the Speak&Teach website and press “Sign in with Telegram”.');
    entry.user = { id: String(from.id), first: str(from.first_name, 60), last: str(from.last_name, 60), username: str(from.username, 60) };
    return tgSend(from.id, entry.purpose === 'link' ? '✅ Telegram is connected to the teacher account. Go back to the browser.' : '✅ Done! Go back to the browser — you will be signed in automatically.');
  }
  const q = u.callback_query;
  if (q && q.data) {
    const ok = db.teacher && db.teacher.tgId && String(q.from.id) === db.teacher.tgId;
    const m = /^(ap|rj):(\w+)$/.exec(q.data);
    let note = 'Not allowed';
    if (ok && m) {
      const st = db.students[m[2]];
      if (!st) note = 'Already handled';
      else if (m[1] === 'ap') { approveStudent(st, null); note = 'Approved: ' + st.name; }
      else { rejectStudent(st); note = 'Declined'; }
      if (q.message) tgApi('editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text: (q.message.text || '') + '\n\n→ ' + note }).catch(() => {});
    }
    tgApi('answerCallbackQuery', { callback_query_id: q.id, text: note }).catch(() => {});
  }
}
setInterval(() => { const now = Date.now(); for (const [k, v] of tgCodes) if (now - v.at > 20 * 60e3) tgCodes.delete(k); }, 60e3);
function approveStudent(st, groupId) {
  delete st.status; st.v = (st.v || 1) + 1;
  const g = groupId && db.groups[groupId]; if (g && !g.studentIds.includes(st.id)) g.studentIds.push(st.id);
  save();
  if (st.tgId) tgSend(st.tgId, '🎉 Your teacher approved your account. Open the website — you are in.');
  if (typeof io !== 'undefined') io.to('t').emit('requests');
}
function rejectStudent(st) {
  if (st.tgId) tgSend(st.tgId, 'Your request was declined. Ask your teacher if this is a mistake.');
  delete db.students[st.id]; save();
  if (typeof io !== 'undefined') io.to('t').emit('requests');
}
const setCookie = (req, res, name, val, maxAge) => res.append('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` + (req.secure ? '; Secure' : ''));
app.get('/api/tg/info', (req, res) => res.json({ enabled: !GUEST_ONLY && !!tg.username, bot: GUEST_ONLY ? '' : tg.username || '', guestOnly: GUEST_ONLY }));
app.post('/api/tg/start', async (req, res) => {
  if (!tg.username) return bad(res, 'Telegram sign-in is not set up yet');
  const purpose = req.body.purpose === 'link' ? 'link' : 'login';
  if (purpose === 'link') { const s = session(req); if (!s || s.r !== 't') return bad(res, 'Please sign in', 401); }
  const code = crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x'), secret = crypto.randomBytes(16).toString('hex');
  tgCodes.set(code, { secret, at: Date.now(), purpose, user: null });
  setCookie(req, res, 'tgc', code + '.' + secret, 1800);
  const link = 'https://t.me/' + tg.username + '?start=' + code;
  let qr = ''; try { qr = await QRCode.toString(link, { type: 'svg', margin: 1, color: { dark: '#1E1E1C', light: '#FFFFFF' } }); } catch (e) {}
  res.json({ code, link, qr });
});
app.get('/api/tg/poll', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const [code, secret] = String(cookies(req.headers.cookie).tgc || '').split('.');
  const e = code && tgCodes.get(code);
  if (!e || e.secret !== secret) return res.json({ expired: true });
  if (!e.user) return res.json({ wait: true });
  const u = e.user; tgCodes.delete(code);
  setCookie(req, res, 'tgc', '', 0);
  if (e.purpose === 'link') {
    const s = session(req); if (!s || s.r !== 't') return res.json({ expired: true });
    db.teacher.tgId = u.id; db.teacher.tgUsername = u.username; save();
    return res.json({ linked: true, name: tgName({ first_name: u.first, last_name: u.last }) });
  }
  if (db.teacher && db.teacher.tgId === u.id) { setSid(req, res, { r: 't', v: db.teacher.v }); return res.json({ role: 't' }); }
  const st = Object.values(db.students).find(x => x.tgId === u.id);
  if (st && st.status === 'blocked') return res.json({ blocked: true });
  if (st && st.status === 'pending') { setSid(req, res, { r: 'p', id: st.id, v: st.v }); return res.json({ pending: true, name: st.name }); }
  if (st) { if (u.username) st.tgUsername = u.username; save(); setSid(req, res, { r: 's', id: st.id, v: st.v }); return res.json({ role: 's' }); }
  setCookie(req, res, 'reg', sign({ tg: u, exp: Date.now() + 30 * 60e3 }), 1800);
  res.json({ register: true, first: u.first, last: u.last });
});
app.post('/api/tg/register', (req, res) => {
  const p = verifyPlain(cookies(req.headers.cookie).reg);
  if (!p || !p.tg) return bad(res, 'Please sign in with Telegram again', 401);
  const first = str(req.body.first, 60).trim(), last = str(req.body.last, 60).trim();
  if (!first || !last) return bad(res, 'Write your first and last name');
  const u = p.tg;
  let st = Object.values(db.students).find(x => x.tgId === u.id);
  if (!st) {
    let login = (u.username || 'tg' + u.id).toLowerCase().replace(/[^\w.\-]/g, '').slice(0, 30) || 'tg' + u.id;
    while (loginTaken(login)) login = login.slice(0, 26) + Math.floor(Math.random() * 1000);
    st = { id: newId(), name: (first + ' ' + last).slice(0, 80), login, hash: hashPw(crypto.randomBytes(12).toString('hex')), v: 1, createdAt: Date.now(), status: 'pending', tgId: u.id, tgUsername: u.username || '' };
    db.students[st.id] = st; save();
    if (db.teacher && db.teacher.tgId) tgSend(db.teacher.tgId, '🆕 New student wants to join: ' + st.name + (u.username ? ' (@' + u.username + ')' : ''), { reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: 'ap:' + st.id }, { text: '✖ Decline', callback_data: 'rj:' + st.id }]] } });
    io.to('t').emit('requests');
  }
  setCookie(req, res, 'reg', '', 0);
  setSid(req, res, { r: st.status === 'pending' ? 'p' : 's', id: st.id, v: st.v });
  res.json(st.status === 'pending' ? { pending: true, name: st.name } : { role: 's' });
});
app.get('/api/tg/pending', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const raw = verifyPlain(cookies(req.headers.cookie).sid);
  if (!raw || (raw.r !== 'p' && raw.r !== 's')) return res.json({ none: true });
  const st = db.students[raw.id];
  if (!st) return res.json({ rejected: true });
  if (st.status === 'pending') return res.json({ pending: true, name: st.name });
  if (st.status === 'blocked') return res.json({ rejected: true });
  setSid(req, res, { r: 's', id: st.id, v: st.v }); res.json({ role: 's' });
});
/* настройки бота и привязка Telegram учителя */
app.post('/api/t/tg/token', auth('t'), async (req, res) => {
  const token = str(req.body.token, 100).trim();
  if (token && !/^\d+:[\w-]{20,}$/.test(token)) return bad(res, 'This does not look like a bot token');
  db.tg = Object.assign({}, db.tg, { token }); save();
  await startBot();
  if (token && !tg.username) return bad(res, 'Telegram did not accept the token: ' + (tg.error || 'check it and try again'));
  res.json({ bot: tg.username });
});
app.get('/api/t/tg', auth('t'), (req, res) => res.json({ bot: tg.username, env: !!process.env.TELEGRAM_BOT_TOKEN, linked: !!db.teacher.tgId, tgUsername: db.teacher.tgUsername || '', error: tg.error || '' }));
app.post('/api/t/tg/unlink', auth('t'), (req, res) => { delete db.teacher.tgId; delete db.teacher.tgUsername; save(); res.json({ ok: true }); });
app.post('/api/t/students/:id/approve', auth('t'), (req, res) => {
  const st = db.students[req.params.id]; if (!st) return bad(res, 'Student not found', 404);
  approveStudent(st, req.body.groupId); res.json(pubStudent(st));
});
app.post('/api/t/students/:id/block', auth('t'), (req, res) => {
  const st = db.students[req.params.id]; if (!st) return bad(res, 'Student not found', 404);
  if (req.body.block === false) { if (st.status === 'blocked') delete st.status; }
  else { st.status = 'blocked'; st.v = (st.v || 1) + 1; io.in('s:' + st.id).disconnectSockets(true); kickEverywhere(st.id); }
  save(); res.json(pubStudent(st));
});
app.post('/api/t/students/:id/reject', auth('t'), (req, res) => {
  const st = db.students[req.params.id]; if (!st) return bad(res, 'Student not found', 404);
  rejectStudent(st); res.json({ ok: true });
});

/* ---------- импорт из Miro ---------- */
const Miro = require('./miro');
const miroJobs = {};
const IMG_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
async function saveRemoteImage(url) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    let ext = IMG_EXT[type];
    if (!ext) { const m = /\.(jpe?g|png|webp|gif)(\?|$)/i.exec(url); ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : null; }
    if (!r.ok || !ext) throw new Error('not an image');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 15e6) throw new Error('too big');
    const file = newId() + '.' + ext;
    fs.writeFileSync(path.join(IMG_DIR, file), buf);
    return '/img/' + file;
  } finally { clearTimeout(tm); }
}
function embedSaver(boardId) {
  return (url, title) => {
    const hid = newId(), safe = String(url).replace(/"/g, '%22');
    fs.writeFileSync(path.join(BOARD_DIR, 'h_' + hid + '.html'), '<!doctype html><html><head><meta charset="utf-8"><title>' + String(title).replace(/</g, '&lt;') + '</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="' + safe + '" allow="autoplay; fullscreen; clipboard-write" allowfullscreen></iframe></body></html>');
    return '/bh/' + boardId + '/' + hid;
  };
}
function newLibraryBoard(title, folderId, data) {
  const ex = { id: newId(), lessonId: null, library: true, title: str(title, 160) || 'Board', kind: 'board', createdAt: Date.now(), folderId: db.folders[folderId] ? folderId : null };
  const b = Boards.makeBoard(data || null, ex.title); b.title = ex.title;
  boards[ex.id] = b; writeBoard(ex.id);
  db.exercises[ex.id] = ex; db.library.unshift(ex.id); save();
  return ex;
}
app.get('/api/t/miro/token', auth('t'), (req, res) => res.json({ has: !!db.miroToken }));
app.post('/api/t/miro/boards', auth('t'), async (req, res) => {
  const token = str(req.body.token, 400).trim() || db.miroToken;
  if (!token) return bad(res, 'Paste your Miro token');
  try { const list = await Miro.boards(token, str(req.body.query, 100).trim()); if (req.body.token) { db.miroToken = token; save(); } res.json(list); }
  catch (e) { bad(res, e.message); }
});
app.post('/api/t/miro/frames', auth('t'), async (req, res) => {
  const token = str(req.body.token, 400).trim() || db.miroToken;
  if (!token) return bad(res, 'Paste your Miro token');
  try {
    const r = await Miro.frames(token, req.body.link);
    if (req.body.token && req.body.remember !== false) { db.miroToken = token; save(); }
    res.json(r);
  } catch (e) { bad(res, e.message); }
});
app.post('/api/t/miro/import', auth('t'), (req, res) => {
  const token = str(req.body.token, 400).trim() || db.miroToken;
  if (!token) return bad(res, 'Paste your Miro token');
  const board = Miro.boardIdFrom(req.body.link);
  const frameIds = Array.isArray(req.body.frameIds) ? req.body.frameIds.map(String).slice(0, 500) : [];
  const titles = req.body.titles && typeof req.body.titles === 'object' ? req.body.titles : {};
  const separate = !!req.body.separate && frameIds.length > 0;
  const job = { id: newId(), status: 'running', text: 'Starting…', done: 0, total: 1, boards: [], stats: null, error: '' };
  miroJobs[job.id] = job;
  (async () => {
    let folderId = db.folders[req.body.folderId] ? req.body.folderId : null;
    const name = str(req.body.title, 120).trim() || 'From Miro';
    if (separate) { const f = { id: newId(), name, parentId: folderId, createdAt: Date.now() }; db.folders[f.id] = f; folderId = f.id; save(); }
    const groups = separate ? frameIds.map(id => [id]) : [frameIds];
    const total = { items: 0, images: 0, failedImages: 0, skipped: 0 };
    job.text = 'Reading the Miro board…';
    const all = await Miro.listAll(token, board), connectors = await Miro.listConnectors(token, board);
    for (let i = 0; i < groups.length; i++) {
      const placeholder = newId();
      const title = separate ? str(titles[groups[i][0]] || 'Frame', 160) : name;
      job.text = (separate ? '(' + (i + 1) + '/' + groups.length + ') ' + title + ': ' : '') + 'reading…';
      const r = await Miro.importBoard({ token, board, all, connectors, frameIds: groups[i], saveImage: saveRemoteImage, saveEmbed: embedSaver(placeholder),
        progress: (t, d, n) => { job.text = (separate ? '(' + (i + 1) + '/' + groups.length + ') ' + title + ': ' : '') + t; job.done = d; job.total = n; } });
      const ex = newLibraryBoard(title, folderId, { title, elements: r.elements });
      // встроенные сайты были сохранены до появления id доски — переписываем ссылки
      const b = loadBoard(ex.id); b.elements.forEach(e => { if (e.type === 'html') e.src = e.src.replace('/bh/' + placeholder + '/', '/bh/' + ex.id + '/'); }); b.template = Boards.clone(b.elements); writeBoard(ex.id);
      job.boards.push({ id: ex.id, title });
      Object.keys(total).forEach(k => { total[k] += r.stats[k] || 0; });
    }
    job.stats = total; job.status = 'done'; job.text = 'Done'; job.folderId = folderId;
  })().catch(e => { job.status = 'error'; job.error = e.message; console.error('miro import', e); });
  res.json({ job: job.id });
});
app.get('/api/t/miro/job/:id', auth('t'), (req, res) => { const j = miroJobs[req.params.id]; if (!j) return bad(res, 'Not found', 404); res.json(j); });

/* ---------- резервные копии досок ---------- */
app.get('/api/t/boards/:id/backups', auth('t'), (req, res) => {
  const dir = path.join(BACKUP_DIR, req.params.id.replace(/\W/g, ''));
  let list = []; try { list = fs.readdirSync(dir).filter(x => /^\d+\.json$/.test(x)).map(x => ({ id: x.replace('.json', ''), at: Number(x.replace('.json', '')), size: fs.statSync(path.join(dir, x)).size })).sort((a, b) => b.at - a.at); } catch (e) {}
  res.json(list);
});
app.post('/api/t/boards/:id/backups', auth('t'), (req, res) => {
  const id = req.params.id.replace(/\W/g, ''); if (!loadBoard(id)) return bad(res, 'Board not found', 404);
  writeBoard(id); lastBackup[id] = 0; backupBoard(id, path.join(BOARD_DIR, id + '.json')); res.json({ ok: true });
});
app.post('/api/t/boards/:id/restore', auth('t'), (req, res) => {
  const id = req.params.id.replace(/\W/g, ''), v = String(req.body.version || '').replace(/\D/g, '');
  const ex = db.exercises[id]; if (!ex || !v) return bad(res, 'Not found', 404);
  let data; try { data = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, id, v + '.json'), 'utf8')); } catch (e) { return bad(res, 'Backup not found', 404); }
  writeBoard(id); lastBackup[id] = 0; backupBoard(id, path.join(BOARD_DIR, id + '.json'));   // текущее состояние тоже сохраняем
  boards[id] = data; writeBoard(id); emitBoard(id, { full: true });
  res.json({ ok: true });
});
/* ---------- моя палитра ---------- */
app.get('/api/t/palette', auth('t'), (req, res) => res.json(db.palette || []));
app.put('/api/t/palette', auth('t'), (req, res) => {
  db.palette = (Array.isArray(req.body.colors) ? req.body.colors : []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 40); save(); res.json(db.palette);
});
/* ---------- кабинет ученика: мои слова и банк идей ---------- */
function addVocab(sid, words, from) {
  const list = db.vocab[sid] || (db.vocab[sid] = []);
  words.forEach(w => { w = str(w, 120).trim(); if (w && !list.some(x => x.w.toLowerCase() === w.toLowerCase())) list.unshift({ id: newId(), w, ex: '', used: false, from: str(from, 160), at: Date.now() }); });
  if (list.length > 2000) list.length = 2000;
}
function addIdea(sid, idea) {
  const list = db.ideas[sid] || (db.ideas[sid] = []);
  list.unshift({ id: newId(), text: str(idea.text, 2000), note: str(idea.note, 600).trim(), src: /^\/img\/\w+\.(jpg|png|webp|gif)$/.test(String(idea.src || '')) ? idea.src : '', from: str(idea.from, 160), at: Date.now() });
  if (list.length > 1000) list.length = 1000;
}
app.get('/api/s/cabinet', auth('s'), (req, res) => res.json({ vocab: db.vocab[req.s.id] || [], ideas: db.ideas[req.s.id] || [], stars: starOf(req.s.id) }));
/* очки и звёзды ученика (без рейтинга: каждый видит только свои) */
function starOf(sid) { const s = db.stars[sid] || {}; return { pts: s.pts || 0, stars: s.stars || 0, log: (s.log || []).slice(-30).reverse() }; }
function giveStars(sid, pts, stars, why, boardId) {
  if (!db.students[sid] || (!pts && !stars)) return null;
  const s = db.stars[sid] || (db.stars[sid] = { pts: 0, stars: 0, log: [] });
  s.pts = Math.max(0, (s.pts || 0) + pts); s.stars = Math.max(0, (s.stars || 0) + stars);
  s.log = s.log || []; s.log.push({ t: Date.now(), pts, stars, why: String(why || '').slice(0, 160), board: boardId || '' }); if (s.log.length > 200) s.log.shift();
  save();
  if (boardId) for (const sock of Object.keys(boardPeople[boardId] || {})) { const so = io.sockets.sockets.get(sock); if (so && so.who && so.who.id === sid) so.emit('b:star', { pts, stars, why, total: starOf(sid) }); }
  return s;
}
app.get('/api/t/stars/:sid', auth('t'), (req, res) => res.json(starOf(req.params.sid)));
app.post('/api/s/vocab', auth('s'), (req, res) => { addVocab(req.s.id, [req.body.w], req.body.from || 'added by me'); save(); res.json(db.vocab[req.s.id]); });
app.patch('/api/s/vocab/:id', auth('s'), (req, res) => {
  const it = (db.vocab[req.s.id] || []).find(x => x.id === req.params.id); if (!it) return bad(res, 'Not found', 404);
  if ('ex' in req.body) it.ex = str(req.body.ex, 1000); if ('used' in req.body) it.used = !!req.body.used; if (req.body.w) it.w = str(req.body.w, 120);
  save(); res.json(it);
});
app.delete('/api/s/vocab/:id', auth('s'), (req, res) => { db.vocab[req.s.id] = (db.vocab[req.s.id] || []).filter(x => x.id !== req.params.id); save(); res.json({ ok: true }); });
app.post('/api/s/ideas', auth('s'), (req, res) => { addIdea(req.s.id, req.body); save(); res.json(db.ideas[req.s.id]); });
app.delete('/api/s/ideas/:id', auth('s'), (req, res) => { db.ideas[req.s.id] = (db.ideas[req.s.id] || []).filter(x => x.id !== req.params.id); save(); res.json({ ok: true }); });

/* ---------- папки для «Моих досок» ---------- */
app.post('/api/t/folders', auth('t'), (req, res) => {
  const name = str(req.body.name, 100).trim() || 'New folder';
  const parentId = db.folders[req.body.parentId] ? req.body.parentId : null;
  const f = { id: newId(), name, parentId, createdAt: Date.now() };
  db.folders[f.id] = f; save(); res.json(f);
});
app.patch('/api/t/folders/:id', auth('t'), (req, res) => {
  const f = db.folders[req.params.id]; if (!f) return bad(res, 'Folder not found', 404);
  const name = str(req.body.name, 100).trim(); if (name) f.name = name;
  if ('parentId' in req.body) {
    let p = db.folders[req.body.parentId] ? req.body.parentId : null, x = p;
    while (x) { if (x === f.id) return bad(res, 'A folder cannot go inside itself'); x = db.folders[x] && db.folders[x].parentId; }
    f.parentId = p;
  }
  save(); res.json(f);
});
app.delete('/api/t/folders/:id', auth('t'), (req, res) => {
  const f = db.folders[req.params.id]; if (!f) return bad(res, 'Folder not found', 404);
  for (const o of Object.values(db.folders)) if (o.parentId === f.id) o.parentId = f.parentId;
  for (const id of db.library) { const e = db.exercises[id]; if (e && e.folderId === f.id) e.folderId = f.parentId; }
  delete db.folders[f.id]; save(); res.json({ ok: true });
});

/* ---------- учитель ---------- */
app.get('/api/t/state', auth('t'), (req, res) => {
  const summaries = {};
  for (const k in db.progress) summaries[k] = summaryOf(db.progress[k]);
  const threadCounts = {};
  for (const k in db.threads) threadCounts[k] = db.threads[k].length;
  const students = {};
  for (const s of Object.values(db.students)) students[s.id] = pubStudent(s);
  res.json({
    teacher: { login: db.teacher.login }, guestOnly: GUEST_ONLY, storageWarn: STORAGE_WARN,
    groups: db.groupOrder.map(g => db.groups[g]).filter(Boolean),
    lessons: db.lessons,
    exercises: db.exercises,
    students, summaries, threadCounts, library: db.library.filter(id => db.exercises[id]), folders: db.folders,
    presence: Object.keys(db.students).map(presOut)
  });
});
app.post('/api/t/password', auth('t'), (req, res) => {
  if (!checkPw(str(req.body.old, 200), db.teacher.hash)) return bad(res, 'Current password is wrong');
  const pw = str(req.body.password, 200);
  if (pw.length < 6) return bad(res, 'New password: at least 6 characters');
  db.teacher.hash = hashPw(pw); db.teacher.v++; save();
  setSid(req, res, { r: 't', v: db.teacher.v });
  res.json({ ok: true });
});

/* группы */
app.post('/api/t/groups', auth('t'), (req, res) => {
  const name = str(req.body.name, 80).trim();
  if (!name) return bad(res, 'Enter a group name');
  const g = { id: newId(), name, studentIds: [], lessonIds: [], createdAt: Date.now() };
  db.groups[g.id] = g; db.groupOrder.push(g.id); save();
  res.json(g);
});
app.patch('/api/t/groups/:id', auth('t'), (req, res) => {
  const g = db.groups[req.params.id]; if (!g) return bad(res, 'Group not found', 404);
  const name = str(req.body.name, 80).trim(); if (name) g.name = name;
  save(); notifyGroup(g.id); res.json(g);
});
app.delete('/api/t/groups/:id', auth('t'), (req, res) => {
  const g = db.groups[req.params.id]; if (!g) return bad(res, 'Group not found', 404);
  const members = g.studentIds.slice();
  g.lessonIds.forEach(dropLesson);
  delete db.groups[g.id];
  db.groupOrder = db.groupOrder.filter(x => x !== g.id);
  members.forEach(sid => io.to('s:' + sid).emit('refresh'));
  save(); res.json({ ok: true });
});
app.post('/api/t/groups/:id/members', auth('t'), (req, res) => {
  const g = db.groups[req.params.id]; const st = db.students[req.body.studentId];
  if (!g || !st) return bad(res, 'Not found', 404);
  if (!g.studentIds.includes(st.id)) g.studentIds.push(st.id);
  save(); notifyGroup(g.id); res.json({ ok: true });
});
app.delete('/api/t/groups/:id/members/:sid', auth('t'), (req, res) => {
  const g = db.groups[req.params.id]; if (!g) return bad(res, 'Group not found', 404);
  g.studentIds = g.studentIds.filter(x => x !== req.params.sid);
  const st0 = db.students[req.params.sid];
  if (st0 && st0.link && !inGroup(st0.id)) { delete st0.link; delete st0.linkAt; delete st0.linkUsed; io.in('s:' + st0.id).disconnectSockets(true); }   // ушёл из последней группы — ссылка больше не работает
  io.to('s:' + req.params.sid).emit('refresh');
  save(); res.json({ ok: true });
});

/* уроки */
app.post('/api/t/groups/:id/lessons', auth('t'), (req, res) => {
  const g = db.groups[req.params.id]; if (!g) return bad(res, 'Group not found', 404);
  const title = str(req.body.title, 120).trim(); if (!title) return bad(res, 'Enter a lesson name');
  const l = { id: newId(), groupId: g.id, title, exerciseIds: [], createdAt: Date.now() };
  db.lessons[l.id] = l; g.lessonIds.unshift(l.id); save(); notifyGroup(g.id);
  res.json(l);
});
app.patch('/api/t/lessons/:id', auth('t'), (req, res) => {
  const l = db.lessons[req.params.id]; if (!l) return bad(res, 'Lesson not found', 404);
  const title = str(req.body.title, 120).trim(); if (title) l.title = title;
  if (req.body.move) {
    const g = db.groups[l.groupId]; const i = g.lessonIds.indexOf(l.id);
    const j = i + (req.body.move === 'up' ? -1 : 1);
    if (j >= 0 && j < g.lessonIds.length) { g.lessonIds[i] = g.lessonIds[j]; g.lessonIds[j] = l.id; }
  }
  save(); notifyLesson(l.id); res.json(l);
});
app.delete('/api/t/lessons/:id', auth('t'), (req, res) => {
  const l = db.lessons[req.params.id]; if (!l) return bad(res, 'Lesson not found', 404);
  const g = db.groups[l.groupId]; if (g) g.lessonIds = g.lessonIds.filter(x => x !== l.id);
  dropLesson(l.id); save(); if (g) notifyGroup(g.id); res.json({ ok: true });
});

/* задания */
app.post('/api/t/lessons/:id/exercises', auth('t'), (req, res) => {
  const l = db.lessons[req.params.id]; if (!l) return bad(res, 'Lesson not found', 404);
  const html = String(req.body.html || '');
  if (!html.trim()) return bad(res, 'The file is empty');
  if (html.length > 15e6) return bad(res, 'File is larger than 15 MB');
  const title = str(req.body.title, 160).trim() || titleFromHtml(html) || 'Task';
  const ex = { id: newId(), lessonId: l.id, title, kind: 'html', createdAt: Date.now() };
  fs.writeFileSync(path.join(EX_DIR, ex.id + '.html'), html);
  db.exercises[ex.id] = ex; l.exerciseIds.push(ex.id); save(); notifyLesson(l.id);
  res.json(ex);
});
app.post('/api/t/lessons/:id/boards', auth('t'), (req, res) => {
  const l = db.lessons[req.params.id]; if (!l) return bad(res, 'Lesson not found', 404);
  const data = req.body.data && typeof req.body.data === 'object' ? req.body.data : null;
  const title = str(req.body.title, 160).trim() || (data && str(data.title, 160)) || 'Board';
  const b = Boards.makeBoard(data, title);
  b.title = title;
  const ex = { id: newId(), lessonId: l.id, title, kind: 'board', createdAt: Date.now() };
  boards[ex.id] = b; writeBoard(ex.id);
  db.exercises[ex.id] = ex; l.exerciseIds.push(ex.id); save(); notifyLesson(l.id);
  res.json(ex);
});
app.post('/api/t/exercises/:id/copy', auth('t'), (req, res) => {
  const ex = db.exercises[req.params.id]; const toLib = req.body.lessonId === '__lib'; const l = toLib ? null : db.lessons[req.body.lessonId];
  if (!ex || (!l && !toLib)) return bad(res, 'Not found', 404);
  if (toLib && ex.kind !== 'board') return bad(res, 'Only boards can go to My boards');
  const copy = { id: newId(), lessonId: l ? l.id : null, library: toLib || undefined, title: ex.title, kind: ex.kind || 'html', createdAt: Date.now() };
  if (copy.kind === 'board') {
    const src = loadBoard(ex.id); if (!src) return bad(res, 'Board file not found', 404);
    const b = Boards.makeBoard({ title: src.title, width: src.width, height: src.height, elements: src.template || src.elements }, src.title);
    boards[copy.id] = b; writeBoard(copy.id);
  } else {
    try { fs.copyFileSync(path.join(EX_DIR, ex.id + '.html'), path.join(EX_DIR, copy.id + '.html')); } catch (e) { return bad(res, 'Task file not found', 404); }
  }
  db.exercises[copy.id] = copy;
  if (l) { l.exerciseIds.push(copy.id); notifyLesson(l.id); } else db.library.unshift(copy.id);
  save(); res.json(copy);
});
app.get('/api/t/boards/:id/export', auth('t'), (req, res) => {
  const ex = db.exercises[req.params.id]; const b = ex && loadBoard(ex.id);
  if (!b) return bad(res, 'Board not found', 404);
  const out = { title: b.title, width: b.width, height: b.height, elements: b.template || b.elements };
  res.set('Content-Disposition', 'attachment; filename="board-' + ex.id + '.json"');
  res.type('application/json').send(JSON.stringify(out, null, 1));
});
app.patch('/api/t/exercises/:id', auth('t'), (req, res) => {
  const ex = db.exercises[req.params.id]; if (!ex) return bad(res, 'Task not found', 404);
  const title = str(req.body.title, 160).trim(); if (title) ex.title = title;
  if (ex.kind === 'board' && req.body.board && typeof req.body.board === 'object') {
    const old = loadBoard(ex.id);
    const b = Boards.makeBoard(req.body.board, ex.title);
    if (old) b.title = old.title;
    boards[ex.id] = b; writeBoard(ex.id);
    emitBoard(ex.id, { full: true });
  }
  if (ex.kind === 'board' && title) { const b = loadBoard(ex.id); if (b) { b.title = title; saveBoard(ex.id); io.to('b:' + ex.id).emit('b:upd', { meta: { title: b.title, height: b.height, width: b.width } }); } }
  if (ex.kind !== 'board' && typeof req.body.html === 'string' && req.body.html.trim()) {
    if (req.body.html.length > 15e6) return bad(res, 'File is larger than 15 MB');
    fs.writeFileSync(path.join(EX_DIR, ex.id + '.html'), req.body.html);
    ex.updatedAt = Date.now();
  }
  if ('cover' in req.body) { ex.cover = /^\/img\/\w+\.(jpg|png|webp|gif)$/.test(String(req.body.cover || '')) ? req.body.cover : null; const g = groupOfExercise(ex.id); if (g) notifyGroup(g.id); for (const sid of ex.access || []) io.to('s:' + sid).emit('refresh'); }
  if ('folderId' in req.body && ex.library) ex.folderId = db.folders[req.body.folderId] ? req.body.folderId : null;
  if (Array.isArray(req.body.access)) {
    const before = ex.access || [];
    ex.access = [...new Set(req.body.access.filter(id => db.students[id] && db.students[id].status !== 'pending'))];
    for (const sid of new Set(before.concat(ex.access))) io.to('s:' + sid).emit('refresh');
  }
  if (req.body.move && db.lessons[ex.lessonId]) {
    const l = db.lessons[ex.lessonId]; const i = l.exerciseIds.indexOf(ex.id);
    const j = i + (req.body.move === 'up' ? -1 : 1);
    if (j >= 0 && j < l.exerciseIds.length) { l.exerciseIds[i] = l.exerciseIds[j]; l.exerciseIds[j] = ex.id; }
  }
  save(); notifyLesson(ex.lessonId); res.json(ex);
});
app.delete('/api/t/exercises/:id', auth('t'), (req, res) => {
  const ex = db.exercises[req.params.id]; if (!ex) return bad(res, 'Task not found', 404);
  const l = db.lessons[ex.lessonId]; if (l) l.exerciseIds = l.exerciseIds.filter(x => x !== ex.id);
  db.library = db.library.filter(x => x !== ex.id);
  dropExercise(ex.id); save(); if (l) notifyLesson(l.id); res.json({ ok: true });
});

/* мои (приватные) доски учителя */
app.post('/api/t/library/boards', auth('t'), (req, res) => {
  const title = str(req.body.title, 160).trim() || 'My board';
  const b = Boards.makeBoard(req.body.data && typeof req.body.data === 'object' ? req.body.data : null, title);
  b.title = title;
  const ex = { id: newId(), lessonId: null, library: true, title, kind: 'board', createdAt: Date.now(), folderId: db.folders[req.body.folderId] ? req.body.folderId : null };
  boards[ex.id] = b; writeBoard(ex.id);
  db.exercises[ex.id] = ex; db.library.unshift(ex.id); save();
  res.json(ex);
});
app.get('/api/t/boards', auth('t'), (req, res) => {
  const out = [];
  db.library.forEach(id => { const e = db.exercises[id]; if (e) out.push({ id, title: e.title, where: 'My boards' }); });
  db.groupOrder.forEach(gid => {
    const g = db.groups[gid]; if (!g) return;
    g.lessonIds.forEach(lid => { const l = db.lessons[lid]; if (!l) return; l.exerciseIds.forEach(eid => { const e = db.exercises[eid]; if (e && e.kind === 'board') out.push({ id: eid, title: e.title, where: g.name + ' · ' + l.title }); }); });
  });
  res.json(out);
});
app.post('/api/t/boards/:id/paste', auth('t'), (req, res) => {
  const ex = db.exercises[req.params.id]; const b = ex && ex.kind === 'board' && loadBoard(ex.id);
  if (!b) return bad(res, 'Board not found', 404);
  // кладём ниже всего, что уже есть
  let maxY = -Infinity, minX = Infinity;
  b.elements.forEach(e => { maxY = Math.max(maxY, e.y + (e.h || e.size || 80)); minX = Math.min(minX, e.x); });
  const els = Array.isArray(req.body.els) ? req.body.els : [];
  let sx = Infinity, sy = Infinity;
  els.forEach(e => { if (e && Number.isFinite(e.x)) { sx = Math.min(sx, e.x); sy = Math.min(sy, e.y); } });
  if (!Number.isFinite(sx)) return bad(res, 'Nothing to paste');
  const dx = (Number.isFinite(minX) ? minX : 0) - sx, dy = (Number.isFinite(maxY) ? maxY + 200 : 0) - sy;
  const r = Boards.applyOp(b, { t: 'paste', els, strokes: req.body.strokes, dx, dy }, { role: 't', id: 't', name: 'Teacher' });
  if (!r) return bad(res, 'Nothing to paste');
  saveBoard(ex.id); emitBoard(ex.id, r.upd);
  res.json({ ok: true, count: r.upd.made.length });
});

/* ученики */
app.post('/api/t/students', auth('t'), (req, res) => {
  const name = str(req.body.name, 80).trim();
  const login = str(req.body.login, 40).trim();
  const password = str(req.body.password, 200);
  if (!name) return bad(res, 'Enter the student’s name');
  if (!/^[\w.\-а-яё]{3,40}$/i.test(login)) return bad(res, 'Login: at least 3 characters — letters, digits, dot or dash');
  if (loginTaken(login)) return bad(res, 'This login is taken');
  if (password.length < 4) return bad(res, 'Password: at least 4 characters');
  const st = { id: newId(), name, login, hash: hashPw(password), v: 1, createdAt: Date.now() };
  db.students[st.id] = st;
  const g = db.groups[req.body.groupId];
  if (g) g.studentIds.push(st.id);
  save(); res.json(pubStudent(st));
});
app.patch('/api/t/students/:id', auth('t'), (req, res) => {
  const st = db.students[req.params.id]; if (!st) return bad(res, 'Student not found', 404);
  const name = str(req.body.name, 80).trim(); if (name) st.name = name;
  if (req.body.password != null) {
    const pw = str(req.body.password, 200);
    if (pw.length < 4) return bad(res, 'Password: at least 4 characters');
    st.hash = hashPw(pw); st.v++;
    io.in('s:' + st.id).disconnectSockets(true);
  }
  save(); res.json(pubStudent(st));
});
app.delete('/api/t/students/:id', auth('t'), (req, res) => {
  const st = db.students[req.params.id]; if (!st) return bad(res, 'Student not found', 404);
  for (const g of Object.values(db.groups)) g.studentIds = g.studentIds.filter(x => x !== st.id);
  for (const k of Object.keys(db.progress)) if (k.startsWith(st.id + ':')) delete db.progress[k];
  for (const k of Object.keys(db.threads)) if (k.startsWith(st.id + ':')) delete db.threads[k];
  delete db.students[st.id];
  io.in('s:' + st.id).disconnectSockets(true);
  delete presence[st.id];
  save(); res.json({ ok: true });
});

app.get('/api/t/progress/:sid/:exId', auth('t'), (req, res) => {
  const k = pk(req.params.sid, req.params.exId);
  res.json({ prog: db.progress[k] || null, thread: db.threads[k] || [], doc: (db.docs[k] || {}).html || '' });
});

/* ---------- ученик ---------- */
app.get('/api/s/state', auth('s'), (req, res) => {
  const sid = req.s.id; const st = db.students[sid];
  const groups = db.groupOrder.map(g => db.groups[g]).filter(g => g && g.studentIds.includes(sid)).map(g => ({
    id: g.id, name: g.name,
    lessons: g.lessonIds.map(l => db.lessons[l]).filter(Boolean).map(l => ({
      id: l.id, title: l.title,
      exercises: l.exerciseIds.map(e => db.exercises[e]).filter(e => e && e.kind === 'board' && !(Array.isArray(e.blocked) && e.blocked.includes(sid))).map(e => ({ id: e.id, title: e.title, kind: 'board', cover: e.cover || null, updatedAt: e.updatedAt || e.createdAt }))
    }))
  }));
  const inGroups = new Set(); groups.forEach(g => g.lessons.forEach(l => l.exercises.forEach(e => inGroups.add(e.id))));
  const shared = Object.values(db.exercises).filter(e => e.kind === 'board' && Array.isArray(e.access) && e.access.includes(sid) && !inGroups.has(e.id)).map(e => ({ id: e.id, title: e.title, kind: 'board', cover: e.cover || null, updatedAt: e.updatedAt || e.createdAt }));
  if (shared.length) groups.unshift({ id: 'shared', name: 'Shared with you', lessons: [{ id: 'shared', title: 'Boards', exercises: shared }] });
  const progress = {}, unread = {};
  for (const g of groups) for (const l of g.lessons) for (const e of l.exercises) {
    const k = pk(sid, e.id);
    if (db.progress[k]) progress[e.id] = summaryOf(db.progress[k]);
    if (db.threads[k]) unread[e.id] = db.threads[k].filter(m => m.from === 't').length;
  }
  res.json({ me: { id: sid, name: st.name }, groups, progress, teacherMsgs: unread });
});
app.get('/api/s/thread/:exId', auth('s'), (req, res) => {
  if (!canStudent(req.s.id, req.params.exId)) return bad(res, 'No access', 403);
  res.json({ thread: db.threads[pk(req.s.id, req.params.exId)] || [] });
});

/* ---------- картинки ---------- */
app.post('/api/image', auth(), (req, res) => {
  const m = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.dataUrl || ''));
  if (!m) return bad(res, 'Use a JPG, PNG, WebP or GIF image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8e6) return bad(res, 'Image is larger than 8 MB');
  const file = newId() + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(IMG_DIR, file), buf);
  res.json({ url: '/img/' + file });
});
app.get('/img/:file', (req, res) => {
  if (!session(req)) return res.status(401).end();
  if (!/^[\w]+\.(jpg|png|webp|gif)$/.test(req.params.file)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000');
  res.sendFile(path.join(IMG_DIR, req.params.file), err => { if (err && !res.headersSent) res.status(404).end(); });
});

/* интерактивные HTML-блоки на доске */
app.post('/api/t/boards/:id/html', auth('t'), (req, res) => {
  const ex = db.exercises[req.params.id]; if (!ex || ex.kind !== 'board') return bad(res, 'Board not found', 404);
  const html = String(req.body.html || '');
  if (!html.trim()) return bad(res, 'Empty HTML');
  if (html.length > 8e6) return bad(res, 'HTML is larger than 8 MB');
  const hid = newId();
  fs.writeFileSync(path.join(BOARD_DIR, 'h_' + hid + '.html'), html);
  res.json({ src: '/bh/' + ex.id + '/' + hid, title: titleFromHtml(html) });
});
app.get('/bh/:bid/:hid', (req, res) => {
  const s = session(req); const ex = db.exercises[req.params.bid];
  if (!s) return res.status(401).send('Sign in first');
  if (!/^\w+$/.test(req.params.hid)) return res.status(404).send('Not found');
  let html; try { html = fs.readFileSync(path.join(BOARD_DIR, 'h_' + req.params.hid + '.html'), 'utf8'); } catch (e) { return res.status(404).send('Not found'); }
  const tag = '<script src="/static/bsync.js"></script>';
  const i = html.toLowerCase().lastIndexOf('</body>');
  html = i >= 0 ? html.slice(0, i) + tag + html.slice(i) : html + tag;
  res.set('Cache-Control', 'no-store').type('html').send(html);
});
/* картинка по ссылке (например, при вставке из Miro или другого сайта) */
const dns = require('dns').promises;
const net = require('net');
function privateIp(ip) {
  if (net.isIPv6(ip)) return /^(::1|fc|fd|fe80|::ffff:(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(ip) || ip === '::';
  const p = ip.split('.').map(Number);
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || p[0] >= 224;
}
app.post('/api/image-url', auth(), async (req, res) => {
  let u;
  try { u = new URL(String(req.body.url || '')); } catch (e) { return bad(res, 'Bad link'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return bad(res, 'Bad link');
  try {
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some(a => privateIp(a.address))) return bad(res, 'This address is not allowed');
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch(u.href, { signal: ctl.signal, redirect: 'error' });
    clearTimeout(tm);
    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type];
    if (!r.ok || !ext) return bad(res, 'The link is not an image');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8e6) return bad(res, 'Image is larger than 8 MB');
    const file = newId() + '.' + ext;
    fs.writeFileSync(path.join(IMG_DIR, file), buf);
    res.json({ url: '/img/' + file });
  } catch (e) { bad(res, 'Could not download the image'); }
});

/* ---------- аудио и видео ---------- */
const MEDIA_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/webm': 'webm', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v' };
const MEDIA_MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4' };
app.post('/api/media', auth(), express.raw({ type: () => true, limit: '40mb' }), (req, res) => {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = MEDIA_TYPES[type];
  if (!ext) return bad(res, 'Use MP3, M4A, WAV, OGG, MP4, WebM or MOV');
  if (!Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Empty file');
  const file = newId() + '.' + ext;
  fs.writeFileSync(path.join(MEDIA_DIR, file), req.body);
  res.json({ url: '/media/' + file, kind: type.startsWith('video') && ext !== 'webm' ? 'video' : type.startsWith('video') ? 'video' : 'audio' });
});
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return bad(res, 'File is too big (up to 40 MB)', 413);
  next(err);
});
app.get('/media/:file', (req, res) => {
  if (!session(req)) return res.status(401).end();
  const m = /^\w+\.(mp3|m4a|ogg|oga|wav|webm|mp4|mov|m4v)$/.exec(req.params.file);
  if (!m) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000');
  res.type(MEDIA_MIME[m[1]]);
  res.sendFile(path.join(MEDIA_DIR, req.params.file), err => { if (err && !res.headersSent) res.status(404).end(); });
});

/* ---------- мои шаблоны фреймов ---------- */
app.get('/api/t/templates', auth('t'), (req, res) => {
  res.json(db.templates.map(t => ({ id: t.id, title: t.title, count: t.els.length, at: t.at })));
});
app.get('/api/t/templates/:id', auth('t'), (req, res) => {
  const t = db.templates.find(x => x.id === req.params.id); if (!t) return bad(res, 'Template not found', 404);
  res.json(t);
});
app.post('/api/t/templates', auth('t'), (req, res) => {
  const els = (Array.isArray(req.body.els) ? req.body.els : []).slice(0, 1500).map(Boards.sanitizeEl).filter(Boolean);
  if (!els.length) return bad(res, 'Nothing to save');
  const strokes = (Array.isArray(req.body.strokes) ? req.body.strokes : []).slice(0, 2000).filter(s => s && Array.isArray(s.pts)).map(s => ({ pts: s.pts.slice(0, 3000).map(p => [Number(p[0]) || 0, Number(p[1]) || 0]), color: str(s.color, 12), w: Number(s.w) || 3, kind: s.kind === 'marker' ? 'marker' : 'pen' }));
  const t = { id: newId(), title: str(req.body.title, 120).trim() || 'Template', els, strokes, at: Date.now() };
  db.templates.unshift(t); if (db.templates.length > 200) db.templates.pop();
  save(); res.json({ id: t.id, title: t.title, count: els.length });
});
app.delete('/api/t/templates/:id', auth('t'), (req, res) => {
  db.templates = db.templates.filter(x => x.id !== req.params.id); save(); res.json({ ok: true });
});

/* ---------- журнал группы: баланс занятий и посещаемость ---------- */
function cleanJournal(j) {
  j = j && typeof j === 'object' ? j : {};
  const num = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)) : d; };
  const rows = (Array.isArray(j.rows) ? j.rows : []).slice(0, 100).map(r => ({
    id: str(r && r.id, 20) || newId(), name: str(r && r.name, 80).trim(), sid: r && db.students[r.sid] ? r.sid : null,
    start: num(r && r.start, 0, -999, 9999),
    topups: (Array.isArray(r && r.topups) ? r.topups : []).slice(0, 300).map(t => ({ at: num(t && t.at, Date.now(), 0, 1e15), n: num(t && t.n, 0, -999, 9999) })).filter(t => t.n)
  })).filter(r => r.name);
  const ids = new Set(rows.map(r => r.id));
  const entries = (Array.isArray(j.entries) ? j.entries : []).slice(0, 2000).map(e => {
    const att = {};
    if (e && e.att && typeof e.att === 'object') for (const k of Object.keys(e.att)) if (ids.has(k) && ['p', 'a', 'ac'].includes(e.att[k])) att[k] = e.att[k];
    return { id: str(e && e.id, 20) || newId(), date: str(e && e.date, 10), topic: str(e && e.topic, 300), note: str(e && e.note, 600), att };
  });
  return { rows, entries };
}
app.get('/api/t/groups/:id/journal', auth('t'), (req, res) => {
  const g = db.groups[req.params.id]; if (!g) return bad(res, 'Group not found', 404);
  res.json(db.journals[g.id] || { rows: [], entries: [] });
});
app.put('/api/t/groups/:id/journal', auth('t'), (req, res) => {
  const g = db.groups[req.params.id]; if (!g) return bad(res, 'Group not found', 404);
  db.journals[g.id] = cleanJournal(req.body); save();
  res.json(db.journals[g.id]);
});

/* ---------- переезд: полная копия всех данных одним файлом (.tar) и восстановление ---------- */
function allFiles(dir, base, out) {
  for (const n of fs.readdirSync(dir)) {
    if (n.startsWith('.restore') || n.endsWith('.tmp')) continue;
    const f = path.join(dir, n), rel = base ? base + '/' + n : n, st = fs.statSync(f);
    if (st.isDirectory()) allFiles(f, rel, out); else if (st.isFile()) out.push({ f, rel, size: st.size, mtime: st.mtimeMs });
  }
  return out;
}
function tarHeader(name, size, mtime) {
  const h = Buffer.alloc(512);
  let pre = '';
  if (Buffer.byteLength(name) > 100) { const i = name.lastIndexOf('/', 154); pre = name.slice(0, i); name = name.slice(i + 1); }
  h.write(name, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124); h.write(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136);
  h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263); h.write(pre, 345, 155);
  let sum = 0; for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}
app.get('/api/t/export-all', auth('t'), async (req, res) => {
  try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } writeNow(); for (const id of Object.keys(boardTimers)) { clearTimeout(boardTimers[id]); delete boardTimers[id]; writeBoard(id); } } catch (e) {}
  const files = allFiles(DATA, '', []);
  const d = new Date(), stamp = d.toISOString().slice(0, 10);
  res.set({ 'Content-Type': 'application/x-tar', 'Content-Disposition': 'attachment; filename="speak-and-teach-' + stamp + '.tar"', 'Cache-Control': 'no-store' });
  for (const x of files) {
    res.write(tarHeader(x.rel, x.size, x.mtime));
    await new Promise((ok, bad) => { const rs = fs.createReadStream(x.f); rs.on('end', ok); rs.on('error', bad); rs.pipe(res, { end: false }); }).catch(() => {});
    const pad = (512 - (x.size % 512)) % 512; if (pad) res.write(Buffer.alloc(pad));
  }
  res.end(Buffer.alloc(1024));
});
// восстановить можно сразу после установки (учителя ещё нет) или будучи учителем
app.post('/api/restore-all', (req, res) => {
  const s0 = session(req);
  if (db.teacher && !(s0 && s0.r === 't')) return bad(res, 'Sign in as the teacher first', 403);
  if (restoring) return bad(res, 'Already restoring');
  restoring = true;
  const tmp = path.join(DATA, '.restore.tar'), ws = fs.createWriteStream(tmp);
  req.pipe(ws);
  ws.on('error', e => { restoring = false; bad(res, 'Could not save the file: ' + e.message); });
  ws.on('finish', () => {
    try {
      const fd = fs.openSync(tmp, 'r'), total = fs.fstatSync(fd).size, hdr = Buffer.alloc(512), list = [];
      let pos = 0;
      while (pos + 512 <= total) {
        fs.readSync(fd, hdr, 0, 512, pos);
        if (hdr.every(b => b === 0)) break;
        const cut = (b, o, l) => b.toString('utf8', o, o + l).replace(/\0.*$/s, '');
        let name = cut(hdr, 0, 100); const pre = cut(hdr, 345, 155); if (pre) name = pre + '/' + name;
        const size = parseInt(cut(hdr, 124, 12).trim() || '0', 8), type = String.fromCharCode(hdr[156] || 48);
        pos += 512;
        if ((type === '0' || type === '\0') && name && !name.includes('..') && !path.isAbsolute(name)) list.push({ name, size, at: pos });
        pos += Math.ceil(size / 512) * 512;
      }
      if (!list.some(x => x.name === 'db.json')) { fs.closeSync(fd); fs.unlinkSync(tmp); restoring = false; return bad(res, 'This is not a Speak&Teach backup (no db.json inside)'); }
      const newDb = JSON.parse((() => { const b = Buffer.alloc(list.find(x => x.name === 'db.json').size); fs.readSync(fd, b, 0, b.length, list.find(x => x.name === 'db.json').at); return b.toString('utf8'); })());
      if (!newDb || typeof newDb !== 'object' || !newDb.secret) { fs.closeSync(fd); fs.unlinkSync(tmp); restoring = false; return bad(res, 'The backup looks damaged'); }
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      for (const id of Object.keys(boardTimers)) { clearTimeout(boardTimers[id]); delete boardTimers[id]; }
      for (const x of list) {
        const out = path.join(DATA, x.name); fs.mkdirSync(path.dirname(out), { recursive: true });
        const buf = Buffer.alloc(x.size); if (x.size) fs.readSync(fd, buf, 0, x.size, x.at);
        fs.writeFileSync(out + '.tmp', buf); fs.renameSync(out + '.tmp', out);
      }
      fs.closeSync(fd); fs.unlinkSync(tmp);
      for (const k of Object.keys(boards)) delete boards[k];
      db = Object.assign({ students: {}, groups: {}, groupOrder: [], lessons: {}, exercises: {}, progress: {}, threads: {}, docs: {}, library: [], templates: [], journals: {}, folders: {}, tg: {}, guests: {}, vocab: {}, ideas: {}, exits: {}, palette: [], stars: {} }, newDb);
      restoring = false;
      io.disconnectSockets(true);
      setSid(req, res, { r: 'x' });
      res.json({ ok: true, files: list.length, students: Object.keys(db.students).length, boards: Object.values(db.exercises).filter(e => e.kind === 'board').length });
      if (!GUEST_ONLY) setTimeout(() => { try { startBot(); } catch (e) {} }, 500);
    } catch (e) { restoring = false; try { fs.unlinkSync(tmp); } catch (e2) {} bad(res, 'Restore failed: ' + e.message); }
  });
});

/* ---------- пароль на доску: спрашивается у всех, кроме учителя, один раз на ученика или гостя ---------- */
function pwOk(who, ex) {
  if (!ex || !ex.pw || who.role === 't') return true;
  if (who.guest) { const g = db.guests[who.id]; return !!g && g.pwv === ex.pw.v && g.boardId === ex.id; }
  const st = db.students[who.id]; return !!st && !!st.unlocked && st.unlocked[ex.id] === ex.pw.v;
}
app.post('/api/t/boards/:id/password', auth('t'), (req, res) => {
  const ex = db.exercises[req.params.id]; if (!ex || ex.kind !== 'board') return bad(res, 'Board not found', 404);
  const pw = str(req.body.password, 100).trim();
  if (!pw) delete ex.pw;
  else { if (pw.length < 3) return bad(res, 'At least 3 characters'); ex.pw = { hash: hashPw(pw), v: newId() }; }
  save(); res.json({ on: !!ex.pw });
});

/* ---------- доска ---------- */
/* ---------- гости: вход на доску по имени ---------- */
const knocks = {};
const teacherOnBoard = bid => Object.values(boardPeople[bid] || {}).some(p => p.role === 't');
function inviteOk(ex, token) { return !!(ex.invite && ex.invite.on && token && ex.invite.token === token); }
function makeGuest(req, res, ex, name, via) {
  const g = { id: 'g' + newId(), name, boardId: ex.id, at: Date.now(), via, pwv: ex.pw ? ex.pw.v : undefined };
  db.guests[g.id] = g;
  ex.visits = (ex.visits || []).concat({ name, at: Date.now(), via }).slice(-300);
  save();
  setSid(req, res, { r: 'g', id: g.id, v: 1 });
  const b = loadBoard(ex.id);
  if (b) { const entry = { t: Date.now(), who: name, color: '#7A7975', a: 'joined as a guest' + (via === 'invite' ? ' (invite link)' : '') }; b.log = (b.log || []).concat(entry).slice(-200); saveBoard(ex.id); emitBoard(ex.id, { log: entry }); }
  return g;
}
app.get('/api/guest/info/:bid', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ex = db.exercises[req.params.bid]; if (!ex || ex.kind !== 'board') return bad(res, 'Board not found', 404);
  const s = session(req);
  res.json({ title: ex.title, pw: !!ex.pw, invite: inviteOk(ex, req.query.invite), approve: !!(ex.invite && ex.invite.approve), teacherHere: teacherOnBoard(ex.id), signedIn: !!(s && (s.r === 's' || s.r === 't')), tg: !!tg.username });
});
app.post('/api/guest/join', (req, res) => {
  const ex = db.exercises[req.body.boardId]; if (!ex || ex.kind !== 'board') return bad(res, 'Board not found', 404);
  const first = str(req.body.first, 60).trim(), last = str(req.body.last, 60).trim();
  if (!first || !last) return bad(res, 'Write your first and last name');
  const name = first + ' ' + last;
  if (ex.pw && !checkPw(str(req.body.password, 100), ex.pw.hash)) return setTimeout(() => bad(res, 'Wrong board password', 403), 400);
  if (inviteOk(ex, req.body.invite) && !ex.invite.approve) { makeGuest(req, res, ex, name, 'invite'); return res.json({ ok: true }); }
  if (!teacherOnBoard(ex.id)) return res.json({ needLogin: true });
  const k = { id: newId(), secret: crypto.randomBytes(12).toString('hex'), name, boardId: ex.id, at: Date.now(), state: 'wait', via: inviteOk(ex, req.body.invite) ? 'invite' : 'link' };
  knocks[k.id] = k;
  setCookie(req, res, 'knk', k.id + '.' + k.secret, 3600);
  for (const sock of Object.keys(boardPeople[ex.id] || {})) { const so = io.sockets.sockets.get(sock); if (so && so.who && so.who.role === 't') so.emit('b:knock', { rid: k.id, name }); }
  res.json({ wait: true });
});
app.get('/api/guest/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const [id, sec] = String(cookies(req.headers.cookie).knk || '').split('.');
  const k = knocks[id]; if (!k || k.secret !== sec) return res.json({ none: true });
  if (k.state === 'wait') return res.json({ wait: true });
  delete knocks[id]; setCookie(req, res, 'knk', '', 0);
  if (k.state === 'no') return res.json({ denied: true });
  const ex = db.exercises[k.boardId]; if (!ex) return res.json({ denied: true });
  makeGuest(req, res, ex, k.name, k.via); res.json({ ok: true });
});
setInterval(() => { const now = Date.now(); for (const k of Object.keys(knocks)) if (now - knocks[k].at > 3600e3) delete knocks[k]; }, 600e3);
app.post('/api/t/boards/:id/invite', auth('t'), (req, res) => {
  const ex = db.exercises[req.params.id]; if (!ex || ex.kind !== 'board') return bad(res, 'Board not found', 404);
  ex.invite = ex.invite || { token: crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x') };
  if ('on' in req.body) ex.invite.on = !!req.body.on;
  if ('approve' in req.body) ex.invite.approve = !!req.body.approve;
  if (req.body.reset) ex.invite.token = crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x');
  save(); res.json({ invite: ex.invite, pw: !!ex.pw, visits: (ex.visits || []).slice(-100).reverse() });
});
app.get('/api/t/boards/:id/invite', auth('t'), (req, res) => {
  const ex = db.exercises[req.params.id]; if (!ex) return bad(res, 'Board not found', 404);
  res.json({ invite: ex.invite || { on: false }, pw: !!ex.pw, visits: (ex.visits || []).slice(-100).reverse() });
});
function kickEverywhere(uid) {
  for (const bid of Object.keys(boardPeople)) for (const sock of Object.keys(boardPeople[bid] || {})) {
    if (boardPeople[bid][sock].id !== uid) continue;
    const so = io.sockets.sockets.get(sock); if (so) { so.emit('b:kicked'); so.disconnect(true); }
  }
}

app.get('/b/:id', (req, res) => {
  const s = session(req); const ex = db.exercises[req.params.id];
  if (!ex || ex.kind !== 'board') return res.status(404).send('Board not found');
  if (!s || s.r === 'p' || ((s.r === 's' || s.r === 'g') && !canStudent(s.id, ex.id))) return res.set('Cache-Control', 'no-store').sendFile(path.join(PUB, 'guest.html'));
  res.set('Cache-Control', 'no-store').sendFile(path.join(PUB, 'board.html'));
});

/* ---------- задание с датчиком ---------- */
app.get('/x/:id', (req, res) => {
  const s = session(req);
  const ex = db.exercises[req.params.id];
  if (!s) return res.redirect('/');
  if (!ex) return res.status(404).send('Task not found');
  if (s.r === 's' && !canStudent(s.id, ex.id)) return res.status(403).send('No access to this task');
  let html;
  try { html = fs.readFileSync(path.join(EX_DIR, ex.id + '.html'), 'utf8'); } catch (e) { return res.status(404).send('Task file not found'); }
  const tag = '<script src="/static/sensor.js"></script>';
  const i = html.toLowerCase().lastIndexOf('</body>');
  html = i >= 0 ? html.slice(0, i) + tag + html.slice(i) : html + tag;
  res.set('Cache-Control', 'no-store').type('html').send(html);
});

/* ---------- реальное время ---------- */
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 });
const presence = {};
const pres = sid => presence[sid] || (presence[sid] = { sockets: 0, exerciseId: null, visible: false, at: null });
function presOut(sid) {
  const p = presence[sid]; const st = db.students[sid];
  return {
    studentId: sid, online: !!(p && p.sockets > 0), exerciseId: p ? p.exerciseId : null,
    visible: !!(p && p.visible), at: p ? p.at : null, lastSeen: st ? st.lastSeen || null : null
  };
}
const emitPres = sid => io.to('t').emit('presence', presOut(sid));
function touch(sid) { const st = db.students[sid]; if (st) { st.lastSeen = Date.now(); save(); } }

const MSG_TYPES = { text: 1, sticker: 1, image: 1 };
function addMsg(sid, exId, from, m) {
  if (!m || !MSG_TYPES[m.type]) return null;
  let body = m.body;
  if (m.type === 'text') { body = str(body, 4000).trim(); if (!body) return null; }
  if (m.type === 'sticker') { body = str(body, 16); if (!body) return null; }
  if (m.type === 'image' && !/^\/img\/\w+\.(jpg|png|webp|gif)$/.test(String(body))) return null;
  const k = pk(sid, exId);
  const arr = db.threads[k] || (db.threads[k] = []);
  const msg = { id: newId(), from, type: m.type, body, ts: Date.now() };
  arr.push(msg); if (arr.length > 500) arr.shift();
  save();
  const out = { studentId: sid, exerciseId: exId, msg };
  io.to('t').emit('msg', out);
  io.to('s:' + sid).emit('msg', out);
  return msg;
}

io.use((socket, next) => {
  const s = verify(cookies(socket.handshake.headers.cookie).sid);
  if (!s || s.r === 'p') return next(new Error('auth'));
  socket.s = s; next();
});

const boardPeople = {};
const PALETTE = ['#C0392B', '#2E86AB', '#7D5BA6', '#D68910', '#1E8449', '#B03A7A', '#5D6D7E', '#A04000', '#117A65', '#2C3E91'];
const colorFor = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return id === 't' ? '#B4461D' : PALETTE[h % PALETTE.length]; };
function boardProgress(boardId, b, sid, action) {
  const st = db.students[sid];
  const who = { role: 's', id: sid, name: st ? st.name : '' };
  const fields = Boards.evaluate(b, e => Boards.visibleTo(b, e, who));
  const k = pk(sid, boardId);
  const prev = db.progress[k] || {};
  const log = Array.isArray(prev.log) ? prev.log : [];
  if (action) { log.push({ t: Date.now(), a: action }); if (log.length > 80) log.shift(); }
  const prog = {
    fields, total: fields.length, filled: fields.filter(f => f.v !== '').length,
    correct: fields.filter(f => f.ok === true).length, wrong: fields.filter(f => f.ok === false).length,
    scroll: 0, near: 0, action: action || prev.action || '', seq: (prev.seq || 0) + 1, log, updatedAt: Date.now(), board: true
  };
  db.progress[k] = prog; save();
  const p = presence[sid]; if (p) { p.exerciseId = boardId; p.at = Date.now(); }
  io.to('t').emit('progress', { studentId: sid, exerciseId: boardId, prog });
}
/* размножить фрейм: на каждого ученика, на пары или на N комнат */
function dupFrame(boardId, b, op, who) {
  if (who.role !== 't') return null;
  const g = groupOfExercise(boardId); if (!g) return null;
  let ids = g.studentIds.filter(id => db.students[id]);
  if (op.onlineOnly) { const on = ids.filter(id => presence[id] && presence[id].online); if (on.length) ids = on; }
  const person = id => ({ id, name: db.students[id].name });
  const f = b.elements.find(e => e.id === op.id && e.type === 'frame'); if (!f) return null;
  const base = (f.title || 'Task').replace(/\s+—\s+.*$/, '');
  let copies = [];
  if (op.mode === 'each') copies = ids.map(id => ({ title: base + ' — ' + db.students[id].name, owners: [person(id)] }));
  else if (op.mode === 'pairs') {
    const list = ids.slice();
    if (op.shuffle) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    for (let i = 0; i < list.length; i += 2) copies.push(list.slice(i, i + 2));
    if (copies.length > 1 && copies[copies.length - 1].length === 1) copies[copies.length - 2].push(copies.pop()[0]);
    copies = copies.map((grp, i) => ({ title: base + ' — pair ' + (i + 1) + ': ' + grp.map(id => db.students[id].name.split(' ')[0]).join(' + '), owners: grp.map(person) }));
  } else {
    const n = Math.max(1, Math.min(30, Number(op.n) || 2));
    for (let i = 0; i < n; i++) copies.push({ title: base + ' — room ' + (i + 1), owners: [], claim: true });
  }
  if (!copies.length) return null;
  copies.forEach(c => { c.private = !!op.private; });
  const made = Boards.duplicateFrame(b, f.id, copies);
  if (!made) return null;
  if (op.hideOriginal) f.hidden = true;
  return { upd: { full: true }, action: null };
}

/* после проверки: владельцы фреймов получают очко за каждый новый верный ответ и звезду за фрейм без ошибок */
function awardChecks(boardId, b) {
  b.scored = b.scored || {};
  Boards.ownedScores(b).forEach(sc => {
    const k = sc.frame, prev = b.scored[k] || { pts: 0, star: false };
    const gain = Math.max(0, sc.correct - prev.pts);
    const star = !prev.star && sc.correct === sc.total && sc.total > 0;
    if (!gain && !star) return;
    b.scored[k] = { pts: Math.max(prev.pts, sc.correct), star: prev.star || star };
    sc.owners.forEach(o => giveStars(o.id, gain, star ? 1 : 0, (star ? 'All correct' : gain + ' correct') + (sc.title ? ' · ' + sc.title.slice(0, 60) : ''), boardId));
  });
}
/* комнаты для работы в парах: копии фрейма, каждый ученик — только в своей */
function openRooms(boardId, b, d) {
  const g = groupOfExercise(boardId);
  const ex = db.exercises[boardId] || {};
  let ids = [...new Set((g ? g.studentIds : []).concat(ex.access || []))].filter(id => db.students[id] && db.students[id].status !== 'pending');
  const online = new Set(Object.values(boardPeople[boardId] || {}).map(p => p.id));
  if (d.onlineOnly !== false) ids = ids.filter(id => online.has(id));
  if (Array.isArray(d.ids) && d.ids.length) ids = d.ids.map(String).filter(id => db.students[id]);
  if (!ids.length) return 'No students on the board right now';
  const size = Math.max(1, Math.min(6, Number(d.size) || 2));
  const f = b.elements.find(e => e.id === d.frame && e.type === 'frame'); if (!f) return 'Choose a frame';
  const list = ids.slice();
  if (d.shuffle !== false) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  let groups = [];
  for (let i = 0; i < list.length; i += size) groups.push(list.slice(i, i + size));
  if (groups.length > 1 && groups[groups.length - 1].length === 1 && size > 1) groups[groups.length - 2].push(groups.pop()[0]);
  const base = (f.title || 'Task').replace(/\s+—\s+.*$/, '');
  const person = id => ({ id, name: db.students[id].name });
  const copies = groups.map((grp, i) => ({ title: base + ' — room ' + (i + 1) + ': ' + grp.map(id => db.students[id].name.split(' ')[0]).join(' + '), owners: grp.map(person), private: true }));
  const made = Boards.duplicateFrame(b, f.id, copies); if (!made) return 'Could not copy the frame';
  const frs = made.filter(e => e.type === 'frame');
  const mins = Math.max(0, Math.min(180, Number(d.minutes) || 0));
  b.rooms = { on: true, src: f.id, at: Date.now(), until: mins ? Date.now() + mins * 60000 : null, list: frs.map((fr, i) => ({ frame: fr.id, n: i + 1, owners: fr.owners })) };
  if (mins) b.timer = { end: b.rooms.until, dur: mins * 60000 };
  return null;
}

function notifyLessonOf(exId) { const ex = db.exercises[exId]; if (ex && ex.lessonId && db.lessons[ex.lessonId] && typeof notifyLesson === 'function') notifyLesson(ex.lessonId); }

/* разослать участникам доски — каждому только то, что ему видно */
function emitBoard(id, upd) {
  const b = loadBoard(id); if (!b) return;
  for (const sock of Object.keys(boardPeople[id] || {})) {
    const so = io.sockets.sockets.get(sock); if (!so || !so.who) continue;
    if (upd.full) so.emit('b:full', Boards.publicBoard(b, so.who));
    else so.emit('b:upd', Boards.filterUpd(b, upd, so.who));
  }
}
function boardHandlers(socket, who) {
  socket.who = who;
  let cur = null;
  const room = () => 'b:' + cur;
  const people = id => Object.values(boardPeople[id] || {});
  function leave() {
    if (!cur) return;
    const id = cur;
    socket.leave('b:' + id);
    if (boardPeople[id]) { delete boardPeople[id][socket.id]; if (!Object.keys(boardPeople[id]).length) delete boardPeople[id]; }
    io.to('b:' + id).emit('b:people', people(id));
    io.to('b:' + id).emit('b:gone', socket.id);
    cur = null;
  }
  socket.on('b:join', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const id = d && d.boardId; const ex = db.exercises[id];
    if (!ex || ex.kind !== 'board') return ack({ error: 'Board not found' });
    if (who.role === 's' && !canStudent(who.id, id)) return ack({ error: 'No access to this board' });
    if (!pwOk(who, ex)) return ack({ needPassword: true, title: ex.title });
    const b = loadBoard(id); if (!b) return ack({ error: 'Board file not found' });
    leave(); cur = id; socket.join(room());
    (boardPeople[id] = boardPeople[id] || {})[socket.id] = { sock: socket.id, id: who.id, name: who.name, role: who.role, color: colorFor(who.id), guest: !!who.guest };
    io.to(room()).emit('b:people', people(id));
    const g = groupOfExercise(id);
    let roster, share;
    if (who.role === 't') {
      const ids = new Set((g ? g.studentIds : []).concat(ex.access || []));
      roster = [...ids].filter(x => db.students[x] && db.students[x].status !== 'pending').map(x => ({ id: x, name: db.students[x].name }));
      share = { blocked: (ex.blocked || []).filter(x => db.students[x]).map(x => ({ id: x, name: db.students[x].name })), access: ex.access || [], group: g ? g.name : '', all: Object.values(db.students).filter(x => x.status !== 'pending').map(x => ({ id: x.id, name: x.name })).sort((a, c) => a.name.localeCompare(c.name)) };
    }
    ack({ board: Boards.publicBoard(b, who), me: { id: who.id, role: who.role, name: who.name, sock: socket.id, color: colorFor(who.id), guest: !!who.guest }, people: people(id), roster, share, now: Date.now(), palette: who.role === 't' ? db.palette || [] : undefined });
  });
  socket.on('b:unlock', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const ex = d && db.exercises[d.boardId]; if (!ex || !ex.pw) return ack(true);
    if (who.role === 's' && !canStudent(who.id, ex.id)) return ack(false);
    if (!checkPw(str(d.password, 100), ex.pw.hash)) return setTimeout(() => ack(false), 600);
    if (who.guest) { const g = db.guests[who.id]; if (g) g.pwv = ex.pw.v; }
    else if (db.students[who.id]) { const st = db.students[who.id]; st.unlocked = st.unlocked || {}; st.unlocked[ex.id] = ex.pw.v; }
    save(); ack(true);
  });
  socket.on('b:op', (op, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    if (!cur) return ack(false);
    if (who.role === 's' && !canStudent(who.id, cur)) return ack(false);
    const b = loadBoard(cur); if (!b) return ack(false);
    let r;
    if (op && op.t === 'dup-frame') r = dupFrame(cur, b, op, who);
    else r = Boards.applyOp(b, op, who);
    if (!r) return ack(false);
    if (r.action) {
      b.log = b.log || [];
      const anon = who.role === 's' && b.anon && b.anon.on;
      const entry = { t: Date.now(), who: anon ? 'Someone' : who.name, color: anon ? '#7A7975' : colorFor(who.id), a: anon && /note/.test(r.action) ? r.action.replace(/:.*$/, '') : r.action };
      const lastE = b.log[b.log.length - 1];
      if (lastE && lastE.who === entry.who && lastE.a === entry.a && entry.t - lastE.t < 30000) lastE.t = entry.t; else b.log.push(entry);
      if (b.log.length > 200) b.log.shift();
      r.upd.log = entry;
    }
    if (op && op.t === 'check') awardChecks(cur, b);
    if (op && op.t === 'meta' && op.title) { const exT = db.exercises[cur]; if (exT && exT.title !== b.title) { exT.title = b.title; save(); io.to('t').emit('boards-changed'); notifyLessonOf(cur); } }
    saveBoard(cur);
    { const ex0 = db.exercises[cur]; if (ex0 && (!ex0.updatedAt || Date.now() - ex0.updatedAt > 60000)) { ex0.updatedAt = Date.now(); save(); } }
    emitBoard(cur, r.upd);
    if (who.role === 's' && !who.guest) boardProgress(cur, b, who.id, b.anon && b.anon.on && /note/.test(r.action || '') ? null : r.action);
    ack(r.upd.made || true);
  });
  socket.on('b:drag', d => {
    if (!cur || !d) return;
    const b = loadBoard(cur); if (!b) return;
    const e = b.elements.find(x => x.id === d.id); if (!e) return;
    const msg = { id: str(d.id, 40), x: Number(d.x) || 0, y: Number(d.y) || 0 };
    for (const sock of Object.keys(boardPeople[cur] || {})) {
      if (sock === socket.id) continue;
      const so = io.sockets.sockets.get(sock);
      if (so && so.who && Boards.visibleTo(b, e, so.who) && Boards.pointVisible(b, [msg.x, msg.y], so.who)) so.emit('b:drag', msg);
    }
  });
  socket.on('b:cursor', d => { if (cur && d) socket.to(room()).emit('b:cursor', { sock: socket.id, name: who.name, color: colorFor(who.id), x: Number(d.x) || 0, y: Number(d.y) || 0 }); });
  socket.on('b:ink', d => {
    if (!cur || !d || !Array.isArray(d.pts)) return;
    const b = loadBoard(cur); if (!b) return;
    const msg = { sock: socket.id, id: str(d.id, 40), pts: d.pts.slice(0, 200), color: str(d.color, 12), w: Number(d.w) || 4, kind: d.kind === 'marker' ? 'marker' : 'pen' };
    const p0 = Array.isArray(d.p0) ? d.p0 : msg.pts[0];
    if (!Array.isArray(p0)) return;
    for (const sock of Object.keys(boardPeople[cur] || {})) {
      if (sock === socket.id) continue;
      const so = io.sockets.sockets.get(sock);
      if (so && so.who && Boards.pointVisible(b, p0, so.who)) so.emit('b:ink', msg);
    }
  });
  /* заметки на доске: общие (пишет учитель, видят все) и личные */
  const docKey = kind => kind === 'all' ? pk('all', cur) : kind === 'me' || who.role !== 't' ? pk(who.id === 't' ? 't' : who.id, cur) : (db.students[kind] ? pk(kind, cur) : null);
  socket.on('bdoc:get', (d, ack) => {
    if (typeof ack !== 'function' || !cur || !d) return;
    const k = docKey(d.kind); ack({ html: k ? (db.docs[k] || {}).html || '' : '' });
  });
  socket.on('bdoc:set', d => {
    if (!cur || !d) return;
    if (d.kind === 'all' && who.role !== 't') return;
    const k = docKey(d.kind); if (!k) return;
    const html = cleanDoc(d.html);
    db.docs[k] = { html, at: Date.now(), by: who.id }; save();
    if (d.kind === 'all') socket.to(room()).emit('bdoc', { kind: 'all', html });
    else if (who.role === 't' && d.kind !== 'me') { io.to('s:' + d.kind).emit('doc', { studentId: d.kind, exerciseId: cur, html, by: 't' }); for (const sock of Object.keys(boardPeople[cur] || {})) if (boardPeople[cur][sock].id === d.kind) io.to(sock).emit('bdoc', { kind: 'me', html }); }
    else if (who.role === 's') { io.to('t').emit('doc', { studentId: who.id, exerciseId: cur, html, by: 's' }); }
  });
  socket.on('b:exit-submit', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    if (!cur || !d || who.role !== 's') return ack(false);
    const b = loadBoard(cur); if (!b || !b.exit || b.exit.id !== d.id) return ack(false);
    const words = (Array.isArray(d.words) ? d.words : []).filter(w => b.exit.words.includes(w)).concat((Array.isArray(d.extra) ? d.extra : []).map(x => str(x, 120).trim()).filter(Boolean)).slice(0, 100);
    const fav = (Array.isArray(d.fav) ? d.fav : []).filter(a => b.exit.acts.includes(a)).concat((Array.isArray(d.favExtra) ? d.favExtra : []).map(x => str(x, 300).trim()).filter(Boolean)).slice(0, 40);
    db.exits[pk(who.id, b.exit.id)] = { at: Date.now(), board: cur, title: b.exit.title, words, fav, comment: str(d.comment, 1000) };
    if (!who.guest) { addVocab(who.id, words, b.exit.title); fav.forEach(a => addIdea(who.id, { text: a, from: b.exit.title })); }
    save();
    const entry = { t: Date.now(), who: who.name, color: colorFor(who.id), a: 'exit ticket: ' + words.length + ' new words' + (fav.length ? '; favourite — ' + fav.join(', ').slice(0, 120) : '') + (d.comment ? '; “' + str(d.comment, 120) + '”' : '') };
    b.log = (b.log || []).concat(entry).slice(-200); saveBoard(cur); emitBoard(cur, { log: entry });
    ack(true);
  });
  socket.on('idea:add', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    if (!cur || !d || who.role !== 's' || who.guest) return ack(false);
    const b = loadBoard(cur);
    (Array.isArray(d.items) ? d.items : []).slice(0, 30).forEach(it => addIdea(who.id, { text: it.text, src: it.src, note: d.note, from: b ? b.title : '' }));
    save(); ack(true);
  });
  socket.on('b:admit', d => {
    if (who.role !== 't' || !d) return;
    const k = knocks[d.rid]; if (!k || k.state !== 'wait') return;
    k.state = d.ok ? 'yes' : 'no';
    for (const sock of Object.keys(boardPeople[k.boardId] || {})) { const so = io.sockets.sockets.get(sock); if (so && so.who && so.who.role === 't') so.emit('b:knock-done', { rid: k.id }); }
  });
  socket.on('b:kick', d => {
    if (who.role !== 't' || !cur || !d || !d.id) return;
    const ex = db.exercises[cur]; if (!ex) return;
    if (db.guests[d.id]) delete db.guests[d.id];
    else if (db.students[d.id]) { ex.blocked = [...new Set((ex.blocked || []).concat(d.id))]; if (ex.access) ex.access = ex.access.filter(x => x !== d.id); }
    save();
    for (const sock of Object.keys(boardPeople[cur] || {})) { if (boardPeople[cur][sock].id !== d.id) continue; const so = io.sockets.sockets.get(sock); if (so) { so.emit('b:kicked'); so.disconnect(true); } }
    io.to('s:' + d.id).emit('refresh');
  });
  socket.on('b:unblock', d => {
    if (who.role !== 't' || !cur || !d) return;
    const ex = db.exercises[cur]; if (ex && ex.blocked) { ex.blocked = ex.blocked.filter(x => x !== d.id); save(); io.to('s:' + d.id).emit('refresh'); }
  });
  socket.on('b:rooms', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    if (who.role !== 't' || !cur || !d) return ack({ error: 'Not allowed' });
    const b = loadBoard(cur); if (!b) return ack({ error: 'No board' });
    if (d.open) { const err = openRooms(cur, b, d); if (err) return ack({ error: err }); }
    else if (d.close) { const src = b.rooms && b.rooms.src; b.rooms = null; if (d.stopTimer !== false) b.timer = null; saveBoard(cur); emitBoard(cur, { full: true }); io.to(room()).emit('b:rooms-end', { frame: src }); return ack({ ok: true }); }
    else if (d.msg) { io.to(room()).emit('b:rooms-msg', { text: str(d.msg, 300) }); return ack({ ok: true }); }
    else if (d.extend && b.rooms) { b.rooms.until = Math.max(Date.now(), b.rooms.until || Date.now()) + Math.round(Number(d.extend) || 2) * 60000; b.timer = { end: b.rooms.until, dur: b.rooms.until - b.rooms.at }; }
    else return ack({ error: 'Nothing to do' });
    saveBoard(cur); emitBoard(cur, { full: true });
    ack({ ok: true, rooms: b.rooms });
  });
  socket.on('b:star', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    if (who.role !== 't' || !cur || !d) return ack(false);
    const s0 = giveStars(String(d.id || ''), Math.round(Number(d.pts) || 0), Math.round(Number(d.stars) || 0), str(d.why || 'From the teacher', 160), cur);
    ack(s0 ? starOf(String(d.id)) : false);
  });
  socket.on('b:mystars', (d, ack) => { if (typeof ack === 'function') ack(who.role === 's' && !who.guest ? starOf(who.id) : null); });
  socket.on('b:summon', d => {
    if (who.role !== 't' || !cur || !d || !d.view) return;
    const v = { x: Number(d.view.x) || 0, y: Number(d.view.y) || 0, w: Math.max(50, Number(d.view.w) || 800), h: Math.max(50, Number(d.view.h) || 600) };
    if (d.sock) io.to(String(d.sock)).emit('b:goto', v); else socket.to(room()).emit('b:goto', v);
  });
  let lastReact = 0;
  socket.on('b:react', d => {
    if (!cur || !d) return;
    const now = Date.now(); if (now - lastReact < 250) return; lastReact = now;
    const em = str(d.emoji, 8); if (!em.trim()) return;
    const b = loadBoard(cur); const anon = who.role === 's' && b && b.anon && b.anon.on;
    io.to(room()).emit('b:react', { emoji: em, name: anon ? '' : who.role === 't' ? 'Teacher' : who.name.split(' ')[0], color: colorFor(who.id), x: Number(d.x) || null, y: Number(d.y) || null });
  });
  socket.on('b:leave', leave);
  socket.on('disconnect', leave);
}

io.on('connection', socket => {
  const s = socket.s;
  if (s.r === 'g') { const g = db.guests[s.id]; boardHandlers(socket, { role: 's', id: s.id, name: g ? g.name : 'Guest', guest: true }); return; }
  if (s.r === 't') boardHandlers(socket, { role: 't', id: 't', name: 'Teacher' });
  else boardHandlers(socket, { role: 's', id: s.id, name: (db.students[s.id] || {}).name || 'Student' });

  if (s.r === 't') {
    socket.join('t');
    socket.emit('presence-all', Object.keys(db.students).map(presOut));
    socket.on('msg', (d, ack) => {
      if (!d || !db.students[d.studentId] || !db.exercises[d.exerciseId]) return;
      const msg = addMsg(d.studentId, d.exerciseId, 't', d);
      if (typeof ack === 'function') ack(!!msg);
    });
    socket.on('doc:get', (d, ack) => {
      if (typeof ack !== 'function' || !d || !db.exercises[d.exerciseId]) return;
      ack({ html: (db.docs[pk(d.studentId === 't' ? 't' : String(d.studentId), d.exerciseId)] || {}).html || '' });
    });
    socket.on('doc:set', d => {
      if (d && d.studentId === 't' && db.exercises[d.exerciseId]) { db.docs[pk('t', d.exerciseId)] = { html: cleanDoc(d.html), at: Date.now(), by: 't' }; save(); return; }
      if (!d || !db.students[d.studentId] || !db.exercises[d.exerciseId]) return;
      const k = pk(d.studentId, d.exerciseId), html = cleanDoc(d.html);
      db.docs[k] = { html, at: Date.now(), by: 't' }; save();
      const out = { studentId: d.studentId, exerciseId: d.exerciseId, html, by: 't' };
      io.to('s:' + d.studentId).emit('doc', out); socket.to('t').emit('doc', out);
    });
    socket.on('push', d => {
      const ex = d && db.exercises[d.exerciseId]; if (!ex) return;
      const g = groupOfExercise(ex.id); if (!g) return;
      const targets = d.studentId ? [d.studentId].filter(x => g.studentIds.includes(x)) : g.studentIds;
      for (const sid of targets) io.to('s:' + sid).emit('goto', { exerciseId: ex.id, title: ex.title });
    });
    return;
  }

  const sid = s.id;
  socket.join('s:' + sid);
  const p = pres(sid);
  p.sockets++; p.visible = true; p.at = Date.now();
  touch(sid); emitPres(sid);

  socket.on('where', d => {
    const exId = d && d.exerciseId;
    p.exerciseId = exId && canStudent(sid, exId) ? exId : null;
    p.visible = true; p.at = Date.now();
    emitPres(sid);
  });
  socket.on('vis', v => { p.visible = !!v; p.at = Date.now(); emitPres(sid); });
  socket.on('progress', d => {
    if (!d || !canStudent(sid, d.exerciseId)) return;
    const snap = d.snap || {};
    const fields = (Array.isArray(snap.fields) ? snap.fields : []).slice(0, 300).map(f => ({
      k: str(f && f.k, 80), ctx: str(f && f.ctx, 200), v: str(f && f.v, 2000),
      ok: f && f.ok === true ? true : f && f.ok === false ? false : null
    }));
    const k = pk(sid, d.exerciseId);
    const prev = db.progress[k] || {};
    const log = Array.isArray(prev.log) ? prev.log : [];
    const action = str(snap.action, 200);
    const seq = Number(snap.seq) || 0;
    if (action && seq !== prev.seq) { log.push({ t: Date.now(), a: action }); if (log.length > 80) log.shift(); }
    const prog = {
      fields, total: fields.length,
      filled: fields.filter(f => f.v !== '').length,
      correct: fields.filter(f => f.ok === true).length,
      wrong: fields.filter(f => f.ok === false).length,
      scroll: clampPct(snap.scroll), near: Math.max(0, Number(snap.near) || 0),
      action, seq, log, updatedAt: Date.now()
    };
    db.progress[k] = prog; save();
    p.exerciseId = d.exerciseId; p.at = Date.now();
    io.to('t').emit('progress', { studentId: sid, exerciseId: d.exerciseId, prog });
  });
  socket.on('doc:get', (d, ack) => {
    if (typeof ack !== 'function') return;
    if (!d || !canStudent(sid, d.exerciseId)) return ack({ html: '' });
    ack({ html: (db.docs[pk(sid, d.exerciseId)] || {}).html || '' });
  });
  socket.on('doc:set', d => {
    if (!d || !canStudent(sid, d.exerciseId)) return;
    const k = pk(sid, d.exerciseId), html = cleanDoc(d.html);
    db.docs[k] = { html, at: Date.now(), by: sid }; save();
    io.to('t').emit('doc', { studentId: sid, exerciseId: d.exerciseId, html, by: 's' });
    socket.to('s:' + sid).emit('doc', { studentId: sid, exerciseId: d.exerciseId, html, by: 's' });
  });
  socket.on('draft', d => {
    if (!d || !canStudent(sid, d.exerciseId)) return;
    io.to('t').emit('draft', { studentId: sid, exerciseId: d.exerciseId, text: str(d.text, 600) });
  });
  socket.on('msg', (d, ack) => {
    if (!d || !canStudent(sid, d.exerciseId)) return;
    const msg = addMsg(sid, d.exerciseId, 's', d);
    if (typeof ack === 'function') ack(!!msg);
  });
  socket.on('disconnect', () => {
    p.sockets = Math.max(0, p.sockets - 1);
    if (!p.sockets) p.visible = false;
    p.at = Date.now();
    touch(sid); emitPres(sid);
  });
});

server.listen(PORT, () => { console.log(`Speak&Teach is running on port ${PORT}, data in ${DATA}` + (GUEST_ONLY ? ' — guest-only mode' : '')); if (!GUEST_ONLY) startBot(); });
if (GUEST_ONLY) {
  // гостевой режим: через сутки имя гостя и его вход забываются, в журнале посещений остаётся только время
  const purge = () => {
    const old = Date.now() - 24 * 3600e3; let ch = false;
    for (const [id, g] of Object.entries(db.guests || {})) if ((g.at || 0) < old) { delete db.guests[id]; ch = true; }
    for (const ex of Object.values(db.exercises)) (ex.visits || []).forEach(v => { if (v.at < old && v.name) { v.name = 'Guest'; ch = true; } });
    if (ch) save();
  };
  purge(); setInterval(purge, 3600e3);
}
