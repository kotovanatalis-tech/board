/* Игры на доске: данные (sanitize), ходы игроков (op) и что скрыть от учеников (strip).
 * Учитель видит всё; ответы, «ложь» и коды не уходят ученикам, пока их не откроют. */
'use strict';
const crypto = require('crypto');
let H = null; // помощники из boards.js: str, num, col, idOf, newId
const arr = (v, n) => (Array.isArray(v) ? v : []).slice(0, n);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const norm = s => String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/[.!?,;:"«»]/g, '').replace(/\s+/g, ' ').trim();
const answersOk = (list, text) => { const t = norm(text); return !!t && list.some(a => norm(a) === t); };
const rnd = n => crypto.randomInt(0, Math.max(1, n));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clone = o => JSON.parse(JSON.stringify(o));
// у каждого ученика своя карточка бинго — порядок слов зависит от id ученика
function seeded(seed, n) {
  let h = crypto.createHash('sha256').update(String(seed)).digest(); let k = 0;
  const next = () => { if (k + 4 > h.length) { h = crypto.createHash('sha256').update(h).digest(); k = 0; } const v = h.readUInt32BE(k); k += 4; return v / 4294967296; };
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const CUBE_EMOJI = ['🏠', '✈️', '🐶', '🎁', '🔑', '🌧️', '⏰', '📱', '🍕', '👑', '🌙', '🚲', '📚', '💡', '🎸', '🌳', '⚽', '🧳', '🗺️', '❤️', '🔥', '🐱', '🎂', '🚗', '☕', '💰', '🎭', '🏖️', '👻', '🧩', '🍎', '📷', '🎤', '🦁', '🌈', '🛒'];
const voters = v => { const o = {}; Object.keys(obj(v)).slice(0, 300).forEach(k => { const x = v[k]; if (x && typeof x === 'object') o[H.idOf(k)] = x; }); return o; };

const G = {
  /* 1. Would you rather */
  wyr: {
    san(e, o) {
      o.w = H.num(e.w, 620, 300, 3000); o.title = H.str(e.title, 120);
      o.items = arr(e.items, 60).map(x => ({ a: H.str(x && x.a, 200), b: H.str(x && x.b, 200) })).filter(x => x.a || x.b);
      if (!o.items.length) o.items = [{ a: 'live without music', b: 'live without films' }];
      o.idx = H.num(e.idx, 0, 0, o.items.length - 1); o.show = !!e.show;
      o.votes = {}; Object.entries(voters(e.votes)).forEach(([k, v]) => { if (v.v === 'a' || v.v === 'b') o.votes[k] = { v: v.v, name: H.str(v.name, 80) }; });
    },
    op(e, op, c) {
      if (op.a === 'vote') { if (op.v !== 'a' && op.v !== 'b') return null; if (e.votes[c.who.id] && e.votes[c.who.id].v === op.v) delete e.votes[c.who.id]; else e.votes[c.who.id] = { v: op.v, name: c.who.name }; return { action: 'voted in Would you rather' }; }
      if (!c.T) return null;
      if (op.a === 'next' || op.a === 'prev') { e.idx = Math.max(0, Math.min(e.items.length - 1, e.idx + (op.a === 'next' ? 1 : -1))); e.votes = {}; e.show = false; return {}; }
      if (op.a === 'show') { e.show = !e.show; return {}; }
      return null;
    },
    strip(e) { if (!e.show) { const c = clone(e); Object.keys(c.votes).forEach(k => { c.votes[k].name = ''; }); return c; } return e; }
  },
  /* 2. Story cubes */
  cubes: {
    san(e, o) {
      o.w = H.num(e.w, 620, 260, 3000); o.n = H.num(e.n, 6, 1, 9); o.prompt = H.str(e.prompt, 200);
      o.words = arr(e.words, 80).map(x => H.str(x, 40).trim()).filter(Boolean);
      o.faces = arr(e.faces, 9).map(x => H.str(x, 40)); o.by = H.str(e.by, 80); o.at = H.num(e.at, 0, 0, 1e15);
    },
    op(e, op, c) {
      if (op.a !== 'roll') return null;
      if (e.at && Date.now() - e.at < 1500) return null;
      const pool = e.words.length ? e.words : CUBE_EMOJI, pick = shuffle(pool);
      e.faces = Array.from({ length: e.n }, (_, i) => pick[i % pick.length]); e.by = c.who.name; e.at = Date.now();
      return { action: 'rolled the story cubes' };
    }
  },
  /* 3. Two truths and a lie */
  ttl: {
    san(e, o) {
      o.w = H.num(e.w, 640, 320, 3000); o.title = H.str(e.title, 120);
      o.entries = {}; Object.entries(obj(e.entries)).slice(0, 80).forEach(([k, v]) => { if (!v) return; const s = arr(v.s, 3).map(x => H.str(x, 240)); if (s.length !== 3) return; o.entries[H.idOf(k)] = { name: H.str(v.name, 80), s, lie: H.num(v.lie, 0, 0, 2) }; });
      o.cur = e.cur && o.entries[e.cur] ? H.idOf(e.cur) : null; o.shown = !!e.shown && !!o.cur;
      o.votes = {}; Object.entries(voters(e.votes)).forEach(([k, v]) => { o.votes[k] = { i: H.num(v.i, 0, 0, 2), name: H.str(v.name, 80) }; });
      o.played = arr(e.played, 80).map(x => H.idOf(x)).filter(x => o.entries[x]);
    },
    op(e, op, c) {
      if (op.a === 'submit') {
        const s = arr(op.s, 3).map(x => H.str(x, 240).trim()); if (s.length !== 3 || s.some(x => !x)) return null;
        e.entries[c.who.id] = { name: c.who.name, s, lie: H.num(op.lie, 0, 0, 2) }; return { action: 'wrote two truths and a lie' };
      }
      if (op.a === 'vote') { if (!e.cur || e.shown || e.cur === c.who.id) return null; e.votes[c.who.id] = { i: H.num(op.i, 0, 0, 2), name: c.who.name }; return {}; }
      if (!c.T) return null;
      if (op.a === 'pick' || op.a === 'next') {
        let id = op.a === 'pick' ? H.idOf(op.sid) : null;
        if (!id) { const left = Object.keys(e.entries).filter(k => !e.played.includes(k)); if (!left.length) return null; id = left[rnd(left.length)]; }
        if (!e.entries[id]) return null;
        e.cur = id; e.shown = false; e.votes = {}; if (!e.played.includes(id)) e.played.push(id); return {};
      }
      if (op.a === 'reveal') {
        if (!e.cur || e.shown) return null; e.shown = true;
        const lie = e.entries[e.cur].lie, award = Object.keys(e.votes).filter(k => e.votes[k].i === lie).map(sid => ({ sid, pts: 1, why: 'Spotted the lie' }));
        return { award };
      }
      if (op.a === 'reset') { e.cur = null; e.shown = false; e.votes = {}; e.played = []; if (op.all) e.entries = {}; return {}; }
      return null;
    },
    strip(e, who) {
      const c = clone(e);
      Object.keys(c.entries).forEach(k => { if (k === who.id) return; if (k === c.cur) { if (!c.shown) delete c.entries[k].lie; } else c.entries[k] = { name: c.entries[k].name, s: null }; });
      return c;
    }
  },
  /* 4. Bingo */
  bingo: {
    san(e, o) {
      o.w = H.num(e.w, 560, 300, 3000); o.size = [3, 4, 5].includes(Number(e.size)) ? Number(e.size) : 4; o.title = H.str(e.title, 120);
      o.items = arr(e.items, 80).map(x => ({ w: H.str(x && x.w, 60).trim(), clue: H.str(x && x.clue, 240) })).filter(x => x.w);
      if (!o.items.length) o.items = 'kind,brave,honest,curious,patient,generous,loyal,calm,funny,polite,shy,creative,friendly,clever,careful,cheerful'.split(',').map(w => ({ w, clue: '' }));
      o.called = arr(e.called, 80).map(Number).filter(i => i >= 0 && i < o.items.length);
      o.marks = {}; Object.entries(obj(e.marks)).slice(0, 300).forEach(([k, v]) => { o.marks[H.idOf(k)] = arr(v, 25).map(Number).filter(i => i >= 0 && i < 25); });
      o.wins = arr(e.wins, 50).map(x => ({ sid: H.idOf(x && x.sid), name: H.str(x && x.name, 80), at: H.num(x && x.at, 0, 0, 1e15) }));
      o.showClue = e.showClue !== false; o.names = obj(e.names); Object.keys(o.names).forEach(k => { o.names[k] = H.str(o.names[k], 80); });
    },
    card(e, sid) { const n = e.size * e.size, ord = seeded(e.id + ':' + sid, e.items.length); return Array.from({ length: n }, (_, i) => i < ord.length ? ord[i] : -1); },
    op(e, op, c) {
      if (op.a === 'mark') {
        const card = G.bingo.card(e, c.who.id), cell = H.num(op.cell, -1, -1, 24), it = card[cell]; if (cell < 0 || it === undefined) return null;
        const m = e.marks[c.who.id] || (e.marks[c.who.id] = []); e.names[c.who.id] = c.who.name;
        const at = m.indexOf(cell);
        if (at >= 0) { m.splice(at, 1); return {}; }
        if (it !== -1 && !e.called.includes(it)) return { err: 'Not called yet' };
        m.push(cell);
        // линия: ряд, столбец или диагональ, где всё отмечено
        const S = e.size, has = i => m.includes(i) || card[i] === -1, lines = [];
        for (let r = 0; r < S; r++) lines.push(Array.from({ length: S }, (_, k) => r * S + k));
        for (let q = 0; q < S; q++) lines.push(Array.from({ length: S }, (_, k) => k * S + q));
        lines.push(Array.from({ length: S }, (_, k) => k * S + k), Array.from({ length: S }, (_, k) => k * S + S - 1 - k));
        if (lines.some(L => L.every(has)) && !e.wins.some(w => w.sid === c.who.id)) { e.wins.push({ sid: c.who.id, name: c.who.name, at: Date.now() }); return { action: 'BINGO!', award: [{ sid: c.who.id, stars: 1, why: 'Bingo!' }] }; }
        return {};
      }
      if (!c.T) return null;
      if (op.a === 'call') { const left = e.items.map((_, i) => i).filter(i => !e.called.includes(i)); if (!left.length) return null; e.called.push(op.i != null && left.includes(Number(op.i)) ? Number(op.i) : left[rnd(left.length)]); return {}; }
      if (op.a === 'undo') { e.called.pop(); return {}; }
      if (op.a === 'reset') { e.called = []; e.marks = {}; e.wins = []; return {}; }
      return null;
    },
    strip(e) { if (e.showClue) return e; return e; }
  },
  /* 5. Крестики-нолики с заданиями */
  ttt: {
    san(e, o) {
      o.w = H.num(e.w, 560, 320, 3000); o.title = H.str(e.title, 120);
      o.cells = Array.from({ length: 9 }, (_, i) => { const x = arr(e.cells, 9)[i] || {}; return { q: H.str(x.q, 300), a: arr(x.a, 10).map(v => H.str(v, 120)).filter(Boolean) }; });
      o.marks = Array.from({ length: 9 }, (_, i) => ['x', 'o'].includes(arr(e.marks, 9)[i]) ? e.marks[i] : '');
      o.turn = e.turn === 'o' ? 'o' : 'x';
      o.teams = {}; Object.entries(obj(e.teams)).slice(0, 300).forEach(([k, v]) => { if (v && (v.t === 'x' || v.t === 'o')) o.teams[H.idOf(k)] = { t: v.t, name: H.str(v.name, 80) }; });
      o.win = ['x', 'o', 'draw'].includes(e.win) ? e.win : '';
      const l = obj(e.last); o.last = l.cell != null ? { cell: H.num(l.cell, 0, 0, 8), ok: !!l.ok, name: H.str(l.name, 80), text: H.str(l.text, 120), team: l.team === 'o' ? 'o' : 'x' } : null;
      const p = obj(e.pending); o.pending = p.cell != null ? { cell: H.num(p.cell, 0, 0, 8), name: H.str(p.name, 80), text: H.str(p.text, 200), team: p.team === 'o' ? 'o' : 'x' } : null;
      o.open = e.open != null && e.open !== '' ? H.num(e.open, -1, -1, 8) : -1;
    },
    win(m) { const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]; for (const l of L) if (m[l[0]] && m[l[0]] === m[l[1]] && m[l[1]] === m[l[2]]) return m[l[0]]; return m.every(Boolean) ? 'draw' : ''; },
    result(e, cell, ok, name, text, team) {
      if (ok) e.marks[cell] = team;
      e.last = { cell, ok, name, text, team }; e.pending = null; e.open = -1;
      e.turn = team === 'x' ? 'o' : 'x'; e.win = G.ttt.win(e.marks);
      return { action: (ok ? 'answered right — ' : 'answered wrong — ') + team.toUpperCase() };
    },
    op(e, op, c) {
      if (op.a === 'join') { if (op.team !== 'x' && op.team !== 'o') return null; e.teams[c.who.id] = { t: op.team, name: c.who.name }; return {}; }
      if (op.a === 'open') { const cell = H.num(op.cell, -1, -1, 8); if (cell < 0 || e.marks[cell] || e.win) return null; const my = c.T ? e.turn : (e.teams[c.who.id] || {}).t; if (my !== e.turn) return { err: 'Wait for your team’s turn' }; e.open = cell; return {}; }
      if (op.a === 'answer') {
        const cell = e.open; if (cell < 0 || e.marks[cell] || e.win) return null;
        const team = c.T ? e.turn : (e.teams[c.who.id] || {}).t; if (team !== e.turn) return { err: 'Wait for your team’s turn' };
        const text = H.str(op.text, 200).trim(); if (!text) return null;
        if (!e.cells[cell].a.length) { e.pending = { cell, name: c.who.name, text, team }; return { action: 'answered a tic-tac-toe task' }; }
        return G.ttt.result(e, cell, answersOk(e.cells[cell].a, text), c.who.name, text, team);
      }
      if (!c.T) return null;
      if (op.a === 'judge') { if (!e.pending) return null; const p = e.pending; return G.ttt.result(e, p.cell, !!op.ok, p.name, p.text, p.team); }
      if (op.a === 'close') { e.open = -1; return {}; }
      if (op.a === 'turn') { e.turn = e.turn === 'x' ? 'o' : 'x'; return {}; }
      if (op.a === 'reset') { e.marks = Array(9).fill(''); e.turn = 'x'; e.win = ''; e.last = null; e.pending = null; e.open = -1; return {}; }
      return null;
    },
    strip(e) { const c = clone(e); c.cells.forEach(x => { x.hasA = x.a.length > 0; x.a = []; }); return c; }
  },
  /* 6. Odd one out */
  odd: {
    san(e, o) {
      o.w = H.num(e.w, 620, 300, 3000); o.title = H.str(e.title, 120);
      o.items = arr(e.items, 40).map(x => ({ w: arr(x && x.w, 6).map(v => H.str(v, 60)).filter(Boolean), odd: H.num(x && x.odd, 0, 0, 5), why: H.str(x && x.why, 300) })).filter(x => x.w.length >= 3);
      if (!o.items.length) o.items = [{ w: ['make a decision', 'make a mistake', 'make a photo', 'make an effort'], odd: 2, why: 'We TAKE a photo.' }];
      o.items.forEach(x => { if (x.odd >= x.w.length) x.odd = 0; });
      o.idx = H.num(e.idx, 0, 0, o.items.length - 1); o.shown = !!e.shown;
      o.picks = {}; Object.entries(voters(e.picks)).forEach(([k, v]) => { o.picks[k] = { i: H.num(v.i, 0, 0, 5), why: H.str(v.why, 200), name: H.str(v.name, 80) }; });
    },
    op(e, op, c) {
      if (op.a === 'pick') { if (e.shown) return null; e.picks[c.who.id] = { i: H.num(op.i, 0, 0, 5), why: H.str(op.why, 200).trim(), name: c.who.name }; return { action: 'chose the odd one out' }; }
      if (!c.T) return null;
      if (op.a === 'next' || op.a === 'prev') { e.idx = Math.max(0, Math.min(e.items.length - 1, e.idx + (op.a === 'next' ? 1 : -1))); e.picks = {}; e.shown = false; return {}; }
      if (op.a === 'reveal') { if (e.shown) return null; e.shown = true; const it = e.items[e.idx]; return { award: Object.keys(e.picks).filter(k => e.picks[k].i === it.odd).map(sid => ({ sid, pts: 1, why: 'Odd one out' })) }; }
      return null;
    },
    strip(e, who) { if (e.shown) return e; const c = clone(e); c.items.forEach(x => { x.odd = null; x.why = ''; }); Object.keys(c.picks).forEach(k => { if (k !== who.id) c.picks[k] = { i: null, why: '', name: c.picks[k].name }; }); return c; }
  },
  /* 7. Домино: половинки коллокаций или предложений */
  domino: {
    san(e, o) {
      o.w = H.num(e.w, 820, 360, 4000); o.title = H.str(e.title, 120);
      o.pairs = arr(e.pairs, 30).map(x => ({ a: H.str(x && x.a, 100), b: H.str(x && x.b, 100) })).filter(x => x.a && x.b);
      if (!o.pairs.length) o.pairs = [['make', 'a decision'], ['take', 'a break'], ['pay', 'attention'], ['catch', 'a cold'], ['keep', 'a secret']].map(p => ({ a: p[0], b: p[1] }));
      const n = o.pairs.length + 1;
      o.order = arr(e.order, n).map(Number); if (o.order.length !== n || new Set(o.order).size !== n || o.order.some(i => !(i >= 0 && i < n))) o.order = shuffle(Array.from({ length: n }, (_, i) => i));
      o.chain = arr(e.chain, n).map(Number).filter(i => i >= 0 && i < n); if (!o.chain.length || o.chain[0] !== 0) o.chain = [0];
      const l = obj(e.last); o.last = l.pos != null ? { pos: H.num(l.pos, 0, 0, 40), ok: !!l.ok, name: H.str(l.name, 80), at: H.num(l.at, 0, 0, 1e15) } : null;
    },
    tile(e, k) { const n = e.pairs.length; return { l: k === 0 ? '▶ START' : e.pairs[k - 1].b, r: k === n ? 'END ■' : e.pairs[k].a }; },
    op(e, op, c) {
      if (op.a === 'place') {
        const pos = H.num(op.pos, -1, -1, 40), k = e.order[pos]; if (k === undefined || e.chain.includes(k)) return null;
        const ok = k === e.chain.length; if (ok) e.chain.push(k);
        e.last = { pos, ok, name: c.who.name, at: Date.now() };
        return { action: ok ? 'placed a domino' : null };
      }
      if (c.T && op.a === 'reset') { e.chain = [0]; e.order = shuffle(e.order); e.last = null; return {}; }
      return null;
    },
    strip(e) {
      const c = clone(e), n = e.pairs.length;
      c.tiles = e.order.map(k => G.domino.tile(e, k)); c.placed = e.order.map(k => e.chain.includes(k));
      c.chainT = e.chain.map(k => G.domino.tile(e, k)); c.total = n + 1;
      delete c.pairs; delete c.order; delete c.chain; return c;
    }
  },
  /* 8. Collocation fork */
  fork: {
    san(e, o) {
      o.w = H.num(e.w, 640, 320, 3000); o.center = H.str(e.center, 60) || 'make';
      o.opts = arr(e.opts, 24).map(x => ({ w: H.str(x && x.w, 60), ok: !!(x && x.ok) })).filter(x => x.w);
      if (!o.opts.length) o.opts = [['a decision', 1], ['a mistake', 1], ['homework', 0], ['an effort', 1], ['a photo', 0], ['friends', 1], ['a shower', 0], ['progress', 1]].map(p => ({ w: p[0], ok: !!p[1] }));
      o.picks = {}; Object.entries(obj(e.picks)).forEach(([k, v]) => { const i = Number(k); if (i >= 0 && i < o.opts.length && v) o.picks[i] = { ok: !!v.ok, name: H.str(v.name, 80) }; });
    },
    op(e, op, c) {
      if (op.a === 'pick') { const i = H.num(op.i, -1, -1, 23); if (i < 0 || !e.opts[i] || e.picks[i]) return null; e.picks[i] = { ok: e.opts[i].ok, name: c.who.name }; return { action: (e.opts[i].ok ? 'found a collocation: ' : 'tried: ') + e.center + ' ' + e.opts[i].w }; }
      if (c.T && op.a === 'reset') { e.picks = {}; return {}; }
      return null;
    },
    strip(e) { const c = clone(e); c.opts.forEach((x, i) => { if (!c.picks[i]) x.ok = null; }); return c; }
  },
  /* 9. Sentence auction */
  auction: {
    san(e, o) {
      o.w = H.num(e.w, 820, 400, 4000); o.title = H.str(e.title, 120); o.budget = H.num(e.budget, 1000, 10, 1e6);
      o.items = arr(e.items, 30).map(x => ({ s: H.str(x && x.s, 300), ok: !!(x && x.ok), fix: H.str(x && x.fix, 300) })).filter(x => x.s);
      if (!o.items.length) o.items = [{ s: 'She has lived here since five years.', ok: false, fix: 'She has lived here for five years.' }, { s: 'If I had known, I would have called you.', ok: true, fix: '' }];
      o.teams = arr(e.teams, 8).map(t => ({ name: H.str(t && t.name, 40) || 'Team' }));
      if (!o.teams.length) o.teams = [{ name: 'Team A' }, { name: 'Team B' }];
      o.sold = {}; Object.entries(obj(e.sold)).forEach(([k, v]) => { const i = Number(k); if (i >= 0 && i < o.items.length && v) o.sold[i] = { team: H.num(v.team, 0, 0, o.teams.length - 1), price: H.num(v.price, 0, 0, 1e6) }; });
      o.lot = H.num(e.lot, 0, 0, o.items.length - 1); o.shown = !!e.shown;
    },
    op(e, op, c) {
      if (!c.T) return null;
      if (op.a === 'sell') { const i = H.num(op.i, -1, -1, 29), t = H.num(op.team, -1, -1, 7); if (!e.items[i] || !e.teams[t]) return null; e.sold[i] = { team: t, price: H.num(op.price, 0, 0, 1e6) }; return {}; }
      if (op.a === 'unsell') { delete e.sold[H.num(op.i, -1, -1, 29)]; return {}; }
      if (op.a === 'lot') { e.lot = H.num(op.i, 0, 0, e.items.length - 1); return {}; }
      if (op.a === 'reveal') { e.shown = !e.shown; return {}; }
      if (op.a === 'reset') { e.sold = {}; e.shown = false; e.lot = 0; return {}; }
      return null;
    },
    strip(e) { if (e.shown) return e; const c = clone(e); c.items.forEach(x => { x.ok = null; x.fix = ''; }); return c; }
  },
  /* 10. Race */
  race: {
    san(e, o) {
      o.w = H.num(e.w, 640, 320, 3000); o.title = H.str(e.title, 120);
      o.items = arr(e.items, 40).map(x => ({ q: H.str(x && x.q, 300), a: arr(x && x.a, 10).map(v => H.str(v, 120)).filter(Boolean) })).filter(x => x.q && x.a.length);
      if (!o.items.length) o.items = [{ q: 'Past of “go”', a: ['went'] }, { q: 'Opposite of “generous”', a: ['mean', 'stingy'] }, { q: 'She ___ (live) here since 2010.', a: ['has lived', "'s lived"] }];
      o.prog = {}; Object.entries(obj(e.prog)).slice(0, 300).forEach(([k, v]) => { if (v) o.prog[H.idOf(k)] = { name: H.str(v.name, 80), n: H.num(v.n, 0, 0, 40), wrong: H.num(v.wrong, 0, 0, 1e4), at: H.num(v.at, 0, 0, 1e15), last: v.last === 'bad' ? 'bad' : v.last === 'ok' ? 'ok' : '' }; });
      o.on = !!e.on; o.start = H.num(e.start, 0, 0, 1e15);
    },
    op(e, op, c) {
      if (op.a === 'answer') {
        if (!e.on) return { err: 'The race hasn’t started yet' };
        const p = e.prog[c.who.id] || (e.prog[c.who.id] = { name: c.who.name, n: 0, wrong: 0, at: 0, last: '' });
        if (p.n >= e.items.length) return null;
        const ok = answersOk(e.items[p.n].a, op.text);
        if (ok) { p.n++; p.last = 'ok'; if (p.n === e.items.length) { p.at = Date.now(); const place = Object.values(e.prog).filter(x => x.at).length; return { action: 'finished the race (#' + place + ')', award: place <= 3 ? [{ sid: c.who.id, stars: place === 1 ? 1 : 0, pts: 4 - place, why: 'Race: place ' + place }] : null }; } }
        else { p.wrong++; p.last = 'bad'; }
        return {};
      }
      if (!c.T) return null;
      if (op.a === 'start') { e.on = true; e.start = Date.now(); e.prog = {}; return {}; }
      if (op.a === 'stop') { e.on = false; return {}; }
      return null;
    },
    strip(e, who) { const c = clone(e), mine = c.prog[who.id] || { n: 0 }; c.items = c.items.map((x, i) => ({ q: i === mine.n ? x.q : '', a: [] })); c.count = e.items.length; return c; }
  },
  /* 11. Jeopardy */
  jeopardy: {
    san(e, o) {
      o.w = H.num(e.w, 900, 480, 4000); o.title = H.str(e.title, 120);
      o.cats = arr(e.cats, 6).map(c0 => ({ name: H.str(c0 && c0.name, 60), qs: arr(c0 && c0.qs, 6).map(q => ({ v: H.num(q && q.v, 100, 0, 1e5), q: H.str(q && q.q, 400), a: H.str(q && q.a, 300) })) })).filter(c0 => c0.name || c0.qs.length);
      if (!o.cats.length) o.cats = [{ name: 'Phrasal verbs', qs: [{ v: 100, q: 'What does “give up” mean?', a: 'stop trying' }, { v: 200, q: 'Finish: “I look ___ to seeing you.”', a: 'forward' }] }, { name: 'Idioms', qs: [{ v: 100, q: '“A piece of cake” means…', a: 'very easy' }, { v: 200, q: '“Break the ice” means…', a: 'start a conversation' }] }];
      o.teams = arr(e.teams, 8).map(t => ({ name: H.str(t && t.name, 40) || 'Team', score: H.num(t && t.score, 0, -1e6, 1e6) }));
      if (!o.teams.length) o.teams = [{ name: 'Team A', score: 0 }, { name: 'Team B', score: 0 }];
      o.done = arr(e.done, 60).map(x => H.str(x, 8)); const op0 = obj(e.open);
      o.open = op0.c != null ? { c: H.num(op0.c, 0, 0, 5), i: H.num(op0.i, 0, 0, 5) } : null; o.showA = !!e.showA && !!o.open;
    },
    op(e, op, c) {
      if (!c.T) return null;
      if (op.a === 'open') { const ci = H.num(op.c, -1, -1, 5), qi = H.num(op.i, -1, -1, 5); if (!e.cats[ci] || !e.cats[ci].qs[qi]) return null; e.open = { c: ci, i: qi }; e.showA = false; return {}; }
      if (op.a === 'answer') { e.showA = !e.showA; return {}; }
      if (op.a === 'close') { if (e.open && op.done !== false) { const k = e.open.c + ':' + e.open.i; if (!e.done.includes(k)) e.done.push(k); } e.open = null; e.showA = false; return {}; }
      if (op.a === 'score') { const t = e.teams[H.num(op.team, -1, -1, 7)]; if (!t) return null; const v = e.open ? e.cats[e.open.c].qs[e.open.i].v : H.num(op.v, 100, -1e5, 1e5); t.score += op.ok ? v : -v; return {}; }
      if (op.a === 'reset') { e.done = []; e.open = null; e.showA = false; e.teams.forEach(t => { t.score = 0; }); return {}; }
      return null;
    },
    strip(e) { const c = clone(e); c.cats.forEach((cat, ci) => cat.qs.forEach((q, qi) => { const isOpen = c.open && c.open.c === ci && c.open.i === qi; if (!isOpen) q.q = ''; if (!(isOpen && c.showA)) q.a = ''; })); return c; }
  },
  /* 12. Buzzer */
  buzzer: {
    san(e, o) {
      o.w = H.num(e.w, 360, 220, 2000); o.title = H.str(e.title, 120);
      o.armed = !!e.armed; o.at = H.num(e.at, 0, 0, 1e15);
      o.presses = arr(e.presses, 60).map(p => ({ sid: H.idOf(p && p.sid), name: H.str(p && p.name, 80), t: H.num(p && p.t, 0, 0, 1e15) }));
    },
    op(e, op, c) {
      if (op.a === 'press') { if (!e.armed || e.presses.some(p => p.sid === c.who.id)) return null; e.presses.push({ sid: c.who.id, name: c.who.name, t: Date.now() }); return e.presses.length === 1 ? { action: 'buzzed first!' } : {}; }
      if (!c.T) return null;
      if (op.a === 'arm') { e.armed = true; e.at = Date.now(); e.presses = []; return {}; }
      if (op.a === 'lock') { e.armed = false; return {}; }
      return null;
    }
  },
  /* 14. Taboo: classic (объясняют вслух) и written (пишут определение без запрещённых слов) */
  taboo: {
    san(e, o) {
      o.w = H.num(e.w, 620, 320, 3000); o.title = H.str(e.title, 120); o.mode = e.mode === 'written' ? 'written' : 'classic';
      o.cards = arr(e.cards, 120).map(x => ({ w: H.str(x && x.w, 60).trim(), taboo: arr(x && x.taboo, 8).map(v => H.str(v, 40).trim()).filter(Boolean) })).filter(x => x.w);
      if (!o.cards.length) o.cards = [['kindness', 'nice', 'help', 'good', 'friendly'], ['holiday', 'vacation', 'travel', 'summer', 'rest'], ['teacher', 'school', 'student', 'lesson', 'teach'], ['umbrella', 'rain', 'wet', 'open', 'weather']].map(a => ({ w: a[0], taboo: a.slice(1) }));
      const n = o.cards.length;
      o.deck = arr(e.deck, n).map(Number); if (o.deck.length !== n || new Set(o.deck).size !== n || o.deck.some(i => !(i >= 0 && i < n))) o.deck = shuffle(Array.from({ length: n }, (_, i) => i));
      o.pos = H.num(e.pos, 0, 0, n);
      o.sec = H.num(e.sec, 60, 10, 600); o.end = H.num(e.end, 0, 0, 1e15);
      const ex = obj(e.ex); o.ex = ex.sid ? { sid: H.idOf(ex.sid), name: H.str(ex.name, 80) } : null;
      o.teams = arr(e.teams, 6).map(t => ({ name: H.str(t && t.name, 40) || 'Team', score: H.num(t && t.score, 0, -1e4, 1e4) }));
      if (!o.teams.length) o.teams = [{ name: 'Team A', score: 0 }, { name: 'Team B', score: 0 }];
      o.team = H.num(e.team, 0, 0, o.teams.length - 1);
      o.log = arr(e.log, 200).map(l => ({ w: H.str(l && l.w, 60), r: ['ok', 'skip', 'taboo'].includes(l && l.r) ? l.r : 'skip', team: H.num(l && l.team, 0, 0, 5), by: H.str(l && l.by, 80) }));
      const bz = obj(e.buzz); o.buzz = bz.at ? { name: H.str(bz.name, 80), at: H.num(bz.at, 0, 0, 1e15) } : null;
      o.defs = {}; Object.entries(obj(e.defs)).slice(0, 300).forEach(([k, v]) => { if (v) o.defs[H.idOf(k)] = { name: H.str(v.name, 80), text: H.str(v.text, 600), card: H.num(v.card, 0, 0, n - 1), guess: H.num(v.guess, 0, 0, 1e4) }; });
      o.shown = !!e.shown;
    },
    cardFor(e, sid) { return seeded(e.id + ':' + sid, e.cards.length)[0]; },
    // запрещённое слово или его форма (help → helps, helped, helpful)
    hit(text, words) {
      const toks = norm(text).split(/[^a-z0-9'а-яё-]+/i).filter(Boolean), t = ' ' + toks.join(' ') + ' ';
      for (const w0 of words) {
        const w = norm(w0); if (!w) continue;
        if (w.includes(' ')) { if (t.includes(' ' + w + ' ')) return w0; continue; }
        const stem = w.length > 4 ? w.replace(/(ing|ed|es|s|e|y)$/, '') : w;
        if (toks.some(x => x === w || (stem.length >= 3 && x.startsWith(stem) && x.length <= w.length + 4))) return w0;
      }
      return null;
    },
    next(e, r, by) { const c = e.cards[e.deck[e.pos]]; if (c) e.log.push({ w: c.w, r, team: e.team, by }); e.pos = Math.min(e.cards.length, e.pos + 1); },
    op(e, op, c) {
      const isEx = c.T || (e.ex && e.ex.sid === c.who.id), live = e.end > Date.now();
      if (op.a === 'got' || op.a === 'skip') {
        if (!isEx || e.mode !== 'classic' || e.pos >= e.cards.length) return null;
        if (op.a === 'got') e.teams[e.team].score++;
        G.taboo.next(e, op.a === 'got' ? 'ok' : 'skip', c.who.name); return {};
      }
      if (op.a === 'buzz') {
        if (e.mode !== 'classic' || (e.ex && e.ex.sid === c.who.id) || e.pos >= e.cards.length || !live) return null;
        if (e.buzz && Date.now() - e.buzz.at < 2500) return null;
        e.buzz = { name: c.who.name, at: Date.now() }; e.teams[e.team].score--; G.taboo.next(e, 'taboo', c.who.name);
        return { action: 'pressed TABOO!' };
      }
      if (op.a === 'write') {
        if (e.mode !== 'written' || e.shown) return null;
        const k = G.taboo.cardFor(e, c.who.id), card = e.cards[k], text = H.str(op.text, 600).trim(); if (!text) return null;
        const bad = G.taboo.hit(text, [card.w].concat(card.taboo)); if (bad) return { err: 'Taboo word: “' + bad + '” — try other words' };
        e.defs[c.who.id] = { name: c.who.name, text, card: k, guess: 0 }; return { action: 'wrote a Taboo definition' };
      }
      if (!c.T) return null;
      if (op.a === 'start') { e.end = Date.now() + e.sec * 1000; e.buzz = null; return {}; }
      if (op.a === 'stop') { e.end = 0; return {}; }
      if (op.a === 'ex') { const sid = H.idOf(op.sid); e.ex = sid ? { sid, name: H.str(op.name, 80) } : null; return {}; }
      if (op.a === 'team') { e.team = (e.team + 1) % e.teams.length; return {}; }
      if (op.a === 'reveal') { e.shown = !e.shown; return {}; }
      if (op.a === 'reset') { e.pos = 0; e.end = 0; e.log = []; e.buzz = null; e.defs = {}; e.shown = false; e.deck = shuffle(e.deck); e.teams.forEach(t => { t.score = 0; }); return {}; }
      return null;
    },
    strip(e, who) {
      const c = clone(e), isEx = e.ex && e.ex.sid === who.id;
      c.cards = c.cards.map((x, i) => ({ w: '', taboo: [] }));
      if (e.mode === 'classic') { const k = e.deck[e.pos]; if (isEx && k !== undefined) c.cards[k] = clone(e.cards[k]); }
      else { const k = G.taboo.cardFor(e, who.id); c.cards[k] = clone(e.cards[k]); c.myCard = k; }
      Object.keys(c.defs).forEach(k => { if (k === who.id) return; if (!e.shown) c.defs[k] = { name: '', text: c.defs[k].text, card: -1 }; else c.defs[k].w = e.cards[c.defs[k].card].w; });
      if (e.shown) Object.keys(c.defs).forEach(k => { c.defs[k].w = e.cards[e.defs[k].card].w; });
      c.count = e.cards.length; return c;
    }
  },
  /* 13. Escape room  /* 13. Escape room: фреймы-комнаты открываются кодом */
  escape: {
    san(e, o) {
      o.w = H.num(e.w, 520, 280, 2000); o.title = H.str(e.title, 120) || 'Escape room';
      o.rooms = arr(e.rooms, 20).map(r => ({ frame: H.idOf(r && r.frame), code: H.str(r && r.code, 80), hint: H.str(r && r.hint, 200), name: H.str(r && r.name, 120) })).filter(r => r.frame);
      o.open = H.num(e.open, 0, 0, 20); o.tries = arr(e.tries, 30).map(t => ({ name: H.str(t && t.name, 80), code: H.str(t && t.code, 80), ok: !!(t && t.ok), at: H.num(t && t.at, 0, 0, 1e15) }));
    },
    op(e, op, c) {
      const lockFrom = from => { e.rooms.forEach((r, i) => { const f = c.find(r.frame); if (f && f.type === 'frame' && i > 0) { f.veil = i > from; f.hidden = false; } }); };
      if (op.a === 'code') {
        if (e.open >= e.rooms.length) return null;
        const room = e.rooms[e.open], ok = norm(op.code) && norm(op.code) === norm(room.code);
        e.tries.push({ name: c.who.name, code: H.str(op.code, 80), ok, at: Date.now() }); if (e.tries.length > 30) e.tries.shift();
        if (!ok) return { err: 'Wrong code — try again' };
        e.open++; lockFrom(e.open);
        return { full: true, action: e.open >= e.rooms.length ? 'escaped! 🎉' : 'unlocked room ' + (e.open + 1) + ' of the escape room', award: [{ sid: c.who.id, pts: 1, why: 'Escape room code' }] };
      }
      if (!c.T) return null;
      if (op.a === 'lock') { e.open = 0; e.tries = []; lockFrom(0); return { full: true }; }
      if (op.a === 'openall') { e.open = e.rooms.length; lockFrom(e.open); return { full: true }; }
      return null;
    },
    strip(e) { const c = clone(e); c.rooms.forEach((r, i) => { r.code = ''; if (i !== c.open) r.hint = ''; }); c.tries = c.tries.map(t => Object.assign({}, t, { code: t.ok ? t.code : '•••' })); return c; }
  }
};

module.exports = {
  init(h) { H = h; },
  has: t => Object.prototype.hasOwnProperty.call(G, t),
  types: Object.keys(G),
  san(t, e, o) { G[t].san(e, o); return o; },
  op(b, e, op, ctx) {
    const g = G[e.type]; if (!g || !op || typeof op.a !== 'string') return null;
    const r = g.op(e, op, ctx); if (!r) return null;
    // повторная чистка: всё, что игра записала, остаётся в допустимых рамках
    const fresh = {}; g.san(e, fresh); Object.assign(e, fresh);
    return r;
  },
  strip(e, who) { const g = G[e.type]; return g && g.strip ? g.strip(e, who) : e; },
  bingoCard: (e, sid) => G.bingo.card(e, sid)
};
