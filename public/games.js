/* Игры на доске: как выглядят и что делают кнопки. Логика и проверка ответов — на сервере (games.js). */
(function () {
  'use strict';
  var SB = null;   // доступ к доске (board.js отдаёт свои функции через window.SB)
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var T = function () { return SB.isT(); };
  var ME = function () { return SB.me() || {}; };
  var G = window.GAMES = {};
  function act(e, a, extra, cb) { SB.op(Object.assign({ t: 'game', id: e.id, a: a }, extra || {}), function (r) { if (r && r.err) SB.toast(r.err); if (cb) cb(r); }); }
  function fs(e, base) { return (e.w / base * 15).toFixed(2); }
  function shell(type, e, to, xs, inner, base) {
    var d = G[type];
    return '<div class="game g-' + type + (to || '') + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;font-size:' + fs(e, base || d.w) + 'px">' +
      '<div class="ghead"><span class="gico"><svg viewBox="0 0 24 24">' + d.svg + '</svg></span><b>' + esc(e.title || d.name) + '</b>' + (T() ? '<button class="gset" data-g="setup" type="button" data-tip="Set up: words, tasks, options">⚙ Set up</button>' : '') + '</div>' +
      inner + xs + '</div>';
  }
  var btn = function (a, label, cls, extra) { return '<button class="gb' + (cls ? ' ' + cls : '') + '" data-g="' + a + '" type="button"' + (extra || '') + '>' + label + '</button>'; };
  var tbar = function (h) { return T() ? '<div class="gtbar">' + h + '</div>' : ''; };
  var lines = function (t) { return String(t || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean); };
  var listAns = function (s) { return String(s || '').split(/\s*\/\s*/).map(function (x) { return x.trim(); }).filter(Boolean); };
  var teamsOpt = function (e) { return '<label class="f">Teams (comma separated)<input data-opt="teams" value="' + esc((e.teams || []).map(function (t) { return t.name; }).join(', ')) + '"></label>'; };
  var teamsFrom = function (v, old) { return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 8).map(function (n, i) { return { name: n, score: old && old[i] ? old[i].score || 0 : 0 }; }); };
  var people = function () { return (SB.people() || []).filter(function (p) { return p.role !== 't'; }); };

  /* ---------- 1. Would you rather ---------- */
  G.wyr = { svg: '<path d="M12 4v16M6 20h12M4 8h16"/><path d="M7 8l-3 6a3 3 0 0 0 6 0zM17 8l-3 6a3 3 0 0 0 6 0z"/>', name: 'Would you rather', ico: '⚖️', w: 620,
    defaults: { w: 620, items: [{ a: 'be able to speak every language', b: 'be able to talk to animals' }, { a: 'live without music', b: 'live without films' }] },
    html: function (e, xs, to) {
      var it = e.items[e.idx] || { a: '', b: '' }, my = (e.votes[ME().id] || {}).v, cnt = { a: [], b: [] };
      Object.keys(e.votes).forEach(function (k) { var v = e.votes[k]; cnt[v.v].push(v.name); });
      var tot = cnt.a.length + cnt.b.length || 1;
      var side = function (k) { return '<button class="wyr-opt' + (my === k ? ' me' : '') + '" data-g="vote" data-v="' + k + '" type="button"><span class="wyr-t">' + esc(it[k]) + '</span><span class="wyr-bar"><i style="width:' + Math.round(cnt[k].length / tot * 100) + '%"></i></span><span class="wyr-n">' + cnt[k].length + ' vote' + (cnt[k].length === 1 ? '' : 's') + '</span>' + ((e.show || T()) && cnt[k].length ? '<span class="wyr-names">' + cnt[k].filter(Boolean).map(esc).join(', ') + '</span>' : '') + '</button>'; };
      return shell('wyr', e, to, xs, '<div class="wyr-q">Would you rather…</div><div class="wyr-row">' + side('a') + '<span class="wyr-or">or</span>' + side('b') + '</div>' +
        tbar(btn('prev', '◀') + '<span class="gnum">' + (e.idx + 1) + ' / ' + e.items.length + '</span>' + btn('next', '▶') + btn('show', e.show ? 'Hide names' : 'Show names to all')));
    },
    click: function (e, b) { var a = b.dataset.g; if (a === 'vote') act(e, 'vote', { v: b.dataset.v }); else act(e, a); },
    setup: { help: 'One question per line: option A | option B', toText: function (e) { return e.items.map(function (x) { return x.a + ' | ' + x.b; }).join('\n'); },
      fromText: function (t) { return { items: lines(t).map(function (l) { var p = l.split('|'); return { a: (p[0] || '').trim(), b: (p[1] || '').trim() }; }), idx: 0, votes: {} }; } }
  };

  /* ---------- 2. Story cubes ---------- */
  G.cubes = { svg: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.1"/><circle cx="15" cy="15" r="1.1"/><circle cx="15" cy="9" r="1.1"/><circle cx="9" cy="15" r="1.1"/>', name: 'Story cubes', ico: '🎲', w: 620,
    defaults: { w: 620, n: 6, prompt: 'Tell a story using every picture. Use the Past Simple!' },
    html: function (e, xs, to) {
      var rolling = e.at && Date.now() - e.at < 1200, faces = e.faces.length ? e.faces : Array.from({ length: e.n }, function () { return '?'; });
      return shell('cubes', e, to, xs, (e.prompt ? '<div class="cub-p">' + esc(e.prompt) + '</div>' : '') +
        '<div class="cub-row">' + faces.map(function (f, i) { var emo = !/[a-z]/i.test(f); return '<span class="cube' + (rolling ? ' rolling' : '') + (emo ? ' emo' : ' word') + '" style="animation-delay:' + (i * 70) + 'ms">' + esc(f) + '</span>'; }).join('') + '</div>' +
        '<div class="gfoot">' + btn('roll', '🎲 Roll', 'solid') + (e.by ? '<span class="gmuted">rolled by ' + esc(e.by) + '</span>' : '') + '</div>');
    },
    click: function (e, b) { if (b.dataset.g === 'roll') act(e, 'roll'); },
    setup: { help: 'Your own words or emoji for the cubes, separated by commas (empty — built-in pictures).', toText: function (e) { return e.words.join(', '); },
      opts: function (e) { return '<label class="f">How many cubes<input type="number" min="1" max="9" data-opt="n" value="' + e.n + '"></label><label class="f">Task<input data-opt="prompt" value="' + esc(e.prompt) + '"></label>'; },
      fromText: function (t, o) { return { words: t.split(/[,\n]/).map(function (x) { return x.trim(); }).filter(Boolean), n: Number(o.n) || 6, prompt: o.prompt || '', faces: [] }; } }
  };

  /* ---------- 3. Two truths and a lie ---------- */
  var TTL_EDIT = {};
  G.ttl = { svg: '<path d="M4 5h16v11H10l-4 3v-3H4z"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1M12 14.4v.1"/>', name: 'Two truths and a lie', ico: '🤥', w: 640,
    defaults: { w: 640 },
    html: function (e, xs, to) {
      var me = ME(), mine = e.entries[me.id], h = '';
      if (!T() && (!mine || TTL_EDIT[e.id])) {
        h += '<div class="ttl-form"><div class="gmuted">Write three sentences about yourself: two true, one false. Tick the lie.</div>' + [0, 1, 2].map(function (i) { return '<label class="ttl-line"><input type="radio" name="lie_' + e.id + '" data-gin="lie' + i + '"' + (mine && mine.lie === i ? ' checked' : '') + ' title="This one is the lie"><input class="ginput" data-gin="s' + i + '" maxlength="240" placeholder="Sentence ' + (i + 1) + '" value="' + esc(mine ? mine.s[i] : '') + '"></label>'; }).join('') + btn('submit', 'Save', 'solid') + '</div>';
      } else if (!T()) h += '<div class="gok">✓ Your sentences are in. ' + btn('edit', 'Edit') + '</div>';
      var cur = e.cur && e.entries[e.cur];
      if (cur && cur.s) {
        var cnt = [0, 0, 0]; Object.keys(e.votes).forEach(function (k) { cnt[e.votes[k].i]++; });
        var myV = e.votes[me.id] ? e.votes[me.id].i : -1, canV = !T() && e.cur !== me.id && !e.shown;
        h += '<div class="ttl-cur"><div class="ttl-who">' + esc(cur.name) + ' says…</div>' + cur.s.map(function (s, i) {
          var cls = e.shown ? (i === cur.lie ? ' lie' : ' truth') : (myV === i ? ' me' : '');
          return '<button class="ttl-s' + cls + '"' + (canV ? ' data-g="vote" data-i="' + i + '"' : ' disabled') + ' type="button"><span>' + esc(s) + '</span>' + (e.shown ? '<b>' + (i === cur.lie ? 'LIE' : 'true') + '</b>' : T() && i === cur.lie ? '<b class="tl">lie</b>' : '') + ((e.shown || T()) ? '<i>' + cnt[i] + '</i>' : '') + '</button>';
        }).join('') + (canV ? '<div class="gmuted">Which one is the lie? Tap it.</div>' : '') + '</div>';
      } else h += '<div class="gmuted ttl-wait">' + (T() ? 'Choose whose sentences to play.' : 'Waiting for the teacher to start…') + '</div>';
      if (T()) {
        var ids = Object.keys(e.entries);
        h += '<div class="gtbar"><span class="gmuted">' + ids.length + ' ready:</span>' + ids.map(function (k) { return '<button class="gchip' + (k === e.cur ? ' on' : '') + (e.played.indexOf(k) >= 0 ? ' done' : '') + '" data-g="pick" data-sid="' + k + '" type="button">' + esc(e.entries[k].name) + '</button>'; }).join('') +
          '</div><div class="gtbar">' + btn('next', 'Random next') + btn('reveal', 'Reveal the lie', 'solid') + btn('reset', 'New round') + '</div>';
      }
      return shell('ttl', e, to, xs, h);
    },
    click: function (e, b, n) {
      var a = b.dataset.g;
      if (a === 'edit') { TTL_EDIT[e.id] = true; SB.render(); return; }
      if (a === 'submit') {
        var s = [0, 1, 2].map(function (i) { var x = n.querySelector('[data-gin="s' + i + '"]'); return x ? x.value.trim() : ''; }), lie = [0, 1, 2].filter(function (i) { var r = n.querySelector('[data-gin="lie' + i + '"]'); return r && r.checked; })[0];
        if (s.some(function (x) { return !x; })) { SB.toast('Write all three sentences'); return; }
        if (lie == null) { SB.toast('Tick which sentence is the lie'); return; }
        act(e, 'submit', { s: s, lie: lie }, function (r) { if (r && !r.err) { TTL_EDIT[e.id] = false; SB.toast('Saved'); } }); return;
      }
      if (a === 'vote') act(e, 'vote', { i: Number(b.dataset.i) });
      else if (a === 'pick') act(e, 'pick', { sid: b.dataset.sid });
      else if (a === 'reset') { if (confirm('Start a new round? (Students keep their sentences.)')) act(e, 'reset'); }
      else act(e, a);
    },
    setup: { help: 'Students write their own sentences right on the widget. Here you can rename it or clear everything.', toText: function () { return ''; }, noText: true,
      opts: function () { return '<label class="c"><input type="checkbox" data-opt="clear"> Delete all students’ sentences</label>'; },
      fromText: function (t, o) { return o.clear ? { entries: {}, cur: null, votes: {}, played: [], shown: false } : {}; } }
  };

  /* ---------- 4. Bingo ---------- */
  G.bingo = { svg: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>', name: 'Bingo', ico: '🔢', w: 560,
    defaults: { w: 560, size: 4 },
    html: function (e, xs, to) {
      var last = e.called.length ? e.items[e.called[e.called.length - 1]] : null, h = '';
      h += '<div class="bg-call">' + (last ? '<span class="gmuted">Now:</span> <b>' + esc(T() || !last.clue ? last.w : last.clue) + '</b>' + (T() && last.clue ? '<span class="gmuted"> — ' + esc(last.clue) + '</span>' : '') : '<span class="gmuted">' + (T() ? 'Press “Call next”.' : 'Wait for the first word…') + '</span>') + '</div>';
      if (!T() && e.card) {
        var m = (e.marks[ME().id] || []);
        h += '<div class="bg-grid" style="grid-template-columns:repeat(' + e.size + ',1fr);max-width:' + (e.size * 6.5) + 'em;margin:0 auto">' + e.card.map(function (it, i) { var w = it === -1 ? '★' : e.items[it] ? e.items[it].w : '?'; return '<button class="bg-c' + (m.indexOf(i) >= 0 || it === -1 ? ' on' : '') + '" data-g="mark" data-cell="' + i + '" type="button">' + esc(w) + '</button>'; }).join('') + '</div>';
      }
      if (T()) {
        h += '<div class="gtbar">' + btn('call', 'Call next', 'solid') + btn('undo', 'Undo') + btn('reset', 'New game') + '<span class="gmuted">' + e.called.length + ' / ' + e.items.length + ' called</span></div>' +
          '<div class="bg-called">' + e.called.map(function (i) { return '<span class="gchip">' + esc(e.items[i].w) + '</span>'; }).join('') + '</div>' +
          '<div class="bg-pl">' + Object.keys(e.marks).map(function (k) { return '<span class="gchip">' + esc(e.names[k] || 'Student') + ' · ' + e.marks[k].length + '</span>'; }).join('') + '</div>';
      }
      if (e.wins.length) h += '<div class="bg-win">🎉 BINGO: ' + e.wins.map(function (w) { return esc(w.name); }).join(', ') + '</div>';
      return shell('bingo', e, to, xs, h);
    },
    click: function (e, b) { var a = b.dataset.g; if (a === 'mark') act(e, 'mark', { cell: Number(b.dataset.cell) }); else if (a === 'reset') { if (confirm('Start a new game?')) act(e, 'reset'); } else act(e, a); },
    setup: { help: 'One word per line. Add a clue after “=” — students hear/see the clue and look for the word: kind = always ready to help others',
      toText: function (e) { return e.items.map(function (x) { return x.w + (x.clue ? ' = ' + x.clue : ''); }).join('\n'); },
      opts: function (e) { return '<label class="f">Card size<select data-opt="size">' + [3, 4, 5].map(function (n) { return '<option' + (e.size === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>'; },
      fromText: function (t, o) { return { items: lines(t).map(function (l) { var i = l.indexOf('='); return i < 0 ? { w: l, clue: '' } : { w: l.slice(0, i).trim(), clue: l.slice(i + 1).trim() }; }), size: Number(o.size) || 4, called: [], marks: {}, wins: [] }; } }
  };

  /* ---------- 5. Tic-tac-toe with tasks ---------- */
  G.ttt = { svg: '<path d="M9 4v16M15 4v16M4 9h16M4 15h16"/>', name: 'Tic-tac-toe', ico: '❌', w: 560,
    defaults: { w: 560, cells: ['Past of “go”=went', 'Opposite of “brave”=cowardly', 'Make a question: you / like / tea=Do you like tea?', 'Plural of “child”=children', '“A piece of cake” means…=very easy / easy', 'Past of “buy”=bought', 'Synonym of “big”=large / huge', 'She ___ (live) here since 2010.=has lived', 'Third form of “write”=written'].map(function (s) { var p = s.split('='); return { q: p[0], a: listAns(p[1]) }; }) },
    html: function (e, xs, to) {
      var me = ME(), my = T() ? e.turn : (e.teams[me.id] || {}).t, h = '';
      var team = function (t) { return Object.keys(e.teams).filter(function (k) { return e.teams[k].t === t; }).map(function (k) { return esc(e.teams[k].name.split(' ')[0]); }).join(', ') || '—'; };
      h += '<div class="ttt-top"><span class="ttt-team x' + (e.turn === 'x' && !e.win ? ' turn' : '') + '">✕ ' + team('x') + '</span><span class="ttt-team o' + (e.turn === 'o' && !e.win ? ' turn' : '') + '">◯ ' + team('o') + '</span></div>';
      if (!T() && !e.teams[me.id]) h += '<div class="gfoot">' + btn('join', 'Join ✕', 'solid', ' data-team="x"') + btn('join', 'Join ◯', 'solid', ' data-team="o"') + '</div>';
      h += '<div class="ttt-grid">' + e.marks.map(function (m, i) { return '<button class="ttt-c' + (m ? ' ' + m : '') + (e.open === i ? ' open' : '') + '"' + (!m && !e.win ? ' data-g="open" data-cell="' + i + '"' : ' disabled') + ' type="button">' + (m === 'x' ? '✕' : m === 'o' ? '◯' : '<small>' + (i + 1) + '</small>') + '</button>'; }).join('') + '</div>';
      if (e.open >= 0) {
        var c = e.cells[e.open];
        h += '<div class="ttt-task"><div class="gmuted">Task ' + (e.open + 1) + ' · team ' + (e.turn === 'x' ? '✕' : '◯') + '</div><div class="ttt-q">' + esc(c.q || '(no task)') + '</div>' + (T() && c.a.length ? '<div class="gmuted">Answer: ' + esc(c.a.join(' / ')) + '</div>' : '') +
          (my === e.turn && !e.pending ? '<div class="grow"><input class="ginput" data-gin="ans" placeholder="Your answer" data-enter="answer">' + btn('answer', 'Answer', 'solid') + '</div>' : '') + (T() ? btn('close', 'Close task') : '') + '</div>';
      }
      if (e.pending) h += '<div class="ttt-pend">' + esc(e.pending.name) + ': <b>' + esc(e.pending.text) + '</b>' + (T() ? btn('judge', '✓ Correct', 'solid', ' data-ok="1"') + btn('judge', '✗ Wrong', '', ' data-ok="0"') : '<span class="gmuted"> — the teacher is checking</span>') + '</div>';
      if (e.last && !e.pending) h += '<div class="ttt-last ' + (e.last.ok ? 'ok' : 'bad') + '">' + esc(e.last.name) + ' (' + (e.last.team === 'x' ? '✕' : '◯') + '): “' + esc(e.last.text) + '” — ' + (e.last.ok ? 'correct!' : 'wrong, the turn passes') + '</div>';
      if (e.win) h += '<div class="bg-win">' + (e.win === 'draw' ? 'Draw!' : (e.win === 'x' ? '✕' : '◯') + ' wins! 🎉') + '</div>';
      h += tbar(btn('turn', 'Switch turn') + btn('reset', 'New game'));
      return shell('ttt', e, to, xs, h);
    },
    click: function (e, b, n) {
      var a = b.dataset.g;
      if (a === 'join') act(e, 'join', { team: b.dataset.team });
      else if (a === 'open') act(e, 'open', { cell: Number(b.dataset.cell) });
      else if (a === 'answer') { var i = n.querySelector('[data-gin=ans]'); if (i && i.value.trim()) act(e, 'answer', { text: i.value.trim() }, function () { i.value = ''; }); }
      else if (a === 'judge') act(e, 'judge', { ok: b.dataset.ok === '1' });
      else if (a === 'reset') { if (confirm('New game?')) act(e, 'reset'); }
      else act(e, a);
    },
    setup: { help: '9 lines — one task per square: task = answer / other answer. No answer after “=” — you judge it yourself.',
      toText: function (e) { return e.cells.map(function (c) { return c.q + (c.a.length ? ' = ' + c.a.join(' / ') : ''); }).join('\n'); },
      fromText: function (t) { var L = lines(t).slice(0, 9); while (L.length < 9) L.push(''); return { cells: L.map(function (l) { var i = l.indexOf('='); return i < 0 ? { q: l, a: [] } : { q: l.slice(0, i).trim(), a: listAns(l.slice(i + 1)) }; }) }; } }
  };

  /* ---------- 6. Odd one out ---------- */
  G.odd = { svg: '<circle cx="6" cy="8" r="2.4"/><circle cx="12" cy="8" r="2.4"/><circle cx="18" cy="8" r="2.4"/><rect x="9.5" y="14" width="5" height="5" rx="1"/>', name: 'Odd one out', ico: '🧩', w: 620,
    defaults: { w: 620, items: [{ w: ['make a decision', 'make a mistake', 'make a photo', 'make an effort'], odd: 2, why: 'We TAKE a photo.' }, { w: ['happy', 'cheerful', 'delighted', 'gloomy'], odd: 3, why: 'Gloomy is sad.' }] },
    html: function (e, xs, to) {
      var it = e.items[e.idx] || { w: [] }, me = ME(), mine = e.picks[me.id], cnt = it.w.map(function () { return 0; });
      Object.keys(e.picks).forEach(function (k) { var p = e.picks[k]; if (p.i != null && cnt[p.i] != null) cnt[p.i]++; });
      var h = '<div class="odd-row">' + it.w.map(function (w, i) {
        var cls = e.shown ? (i === it.odd ? ' right' : '') : (mine && mine.i === i ? ' me' : '');
        return '<button class="odd-w' + cls + '"' + (e.shown || T() ? ' disabled' : ' data-g="pick" data-i="' + i + '"') + ' type="button">' + esc(w) + ((e.shown || T()) ? '<i>' + cnt[i] + '</i>' : '') + '</button>';
      }).join('') + '</div>';
      if (!T() && !e.shown) h += '<div class="grow"><input class="ginput" data-gin="why" maxlength="200" placeholder="Why? (optional)" value="' + esc(mine ? mine.why : '') + '" data-enter="send">' + btn('send', 'Send') + '</div>' + (mine ? '<div class="gok">✓ Your choice is in</div>' : '<div class="gmuted">Tap the word that doesn’t belong.</div>');
      if (e.shown) h += '<div class="odd-why"><b>' + esc(it.w[it.odd]) + '</b>' + (it.why ? ' — ' + esc(it.why) : '') + '</div>' + '<div class="odd-ans">' + Object.keys(e.picks).filter(function (k) { return e.picks[k].why; }).map(function (k) { var p = e.picks[k]; return '<div class="' + (p.i === it.odd ? 'ok' : 'bad') + '"><b>' + esc(p.name.split(' ')[0]) + ':</b> ' + esc(p.why) + '</div>'; }).join('') + '</div>';
      else if (T()) h += '<div class="gmuted">Odd: <b>' + esc(it.w[it.odd]) + '</b>' + (it.why ? ' — ' + esc(it.why) : '') + ' · ' + Object.keys(e.picks).length + ' answered</div>';
      h += tbar(btn('prev', '◀') + '<span class="gnum">' + (e.idx + 1) + ' / ' + e.items.length + '</span>' + btn('next', '▶') + btn('reveal', 'Reveal', 'solid'));
      return shell('odd', e, to, xs, h);
    },
    click: function (e, b, n) {
      var a = b.dataset.g, why = n.querySelector('[data-gin=why]'), mine = e.picks[ME().id];
      if (a === 'pick') act(e, 'pick', { i: Number(b.dataset.i), why: why ? why.value : '' });
      else if (a === 'send') { if (!mine) { SB.toast('Tap a word first'); return; } act(e, 'pick', { i: mine.i, why: why ? why.value : '' }, function () { SB.toast('Sent'); }); }
      else act(e, a);
    },
    setup: { help: 'One set per line: word, word, word, word | the odd one | why (optional)',
      toText: function (e) { return e.items.map(function (x) { return x.w.join(', ') + ' | ' + x.w[x.odd] + (x.why ? ' | ' + x.why : ''); }).join('\n'); },
      fromText: function (t) { return { items: lines(t).map(function (l) { var p = l.split('|').map(function (x) { return x.trim(); }), w = (p[0] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean), odd = Math.max(0, w.map(function (x) { return x.toLowerCase(); }).indexOf((p[1] || '').toLowerCase())); return { w: w, odd: odd, why: p[2] || '' }; }), idx: 0, picks: {}, shown: false }; } }
  };

  /* ---------- 7. Dominoes ---------- */
  G.domino = { svg: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M12 8v8"/><circle cx="7.5" cy="12" r=".9"/><circle cx="15.5" cy="10.8" r=".9"/><circle cx="17.5" cy="13.2" r=".9"/>', name: 'Dominoes', ico: '🁫', w: 820,
    defaults: { w: 820 },
    tiles: function (e) {
      if (e.tiles) return { tiles: e.tiles, placed: e.placed, chain: e.chainT, total: e.total };
      var n = e.pairs.length, tile = function (k) { return { l: k === 0 ? '▶ START' : e.pairs[k - 1].b, r: k === n ? 'END ■' : e.pairs[k].a }; };
      return { tiles: e.order.map(tile), placed: e.order.map(function (k) { return e.chain.indexOf(k) >= 0; }), chain: e.chain.map(tile), total: n + 1 };
    },
    html: function (e, xs, to) {
      var d = G.domino.tiles(e), fresh = e.last && Date.now() - e.last.at < 1500;
      var tl = function (t, extra, cls) { return '<span class="dom' + (cls || '') + '"' + (extra || '') + '><span>' + esc(t.l) + '</span><i></i><span>' + esc(t.r) + '</span></span>'; };
      var h = '<div class="gmuted">Join the halves: the end of one domino + the start of the next.</div><div class="dom-chain">' + d.chain.map(function (t) { return tl(t, '', ' in'); }).join('') + '</div>';
      if (d.chain.length >= d.total) h += '<div class="bg-win">🎉 Chain complete!</div>';
      else h += '<div class="dom-pool">' + d.tiles.map(function (t, i) { if (d.placed[i]) return ''; return tl(t, ' data-g="place" data-pos="' + i + '" role="button"', fresh && !e.last.ok && e.last.pos === i ? ' bad' : ''); }).join('') + '</div>';
      if (e.last && !e.last.ok && fresh) h += '<div class="ttt-last bad">' + esc(e.last.name) + ': not this one</div>';
      h += tbar(btn('reset', 'Shuffle and restart'));
      return shell('domino', e, to, xs, h);
    },
    click: function (e, b) { if (b.dataset.g === 'place') act(e, 'place', { pos: Number(b.dataset.pos) }); else if (b.dataset.g === 'reset') act(e, 'reset'); },
    setup: { help: 'One pair per line, in order: first part = second part. For collocations: make = a decision. For sentences: If I had more time = I would travel more.',
      toText: function (e) { return (e.pairs || []).map(function (p) { return p.a + ' = ' + p.b; }).join('\n'); },
      fromText: function (t) { return { pairs: lines(t).map(function (l) { var i = l.indexOf('='); return { a: l.slice(0, i).trim(), b: l.slice(i + 1).trim() }; }).filter(function (p) { return p.a && p.b; }), order: [], chain: [0], last: null }; } }
  };

  /* ---------- 8. Collocation fork ---------- */
  G.fork = { svg: '<circle cx="5" cy="12" r="2"/><path d="M7 12h4M11 12l7-6M11 12h8M11 12l7 6"/>', name: 'Collocation fork', ico: '🍴', w: 640,
    defaults: { w: 640 },
    html: function (e, xs, to) {
      var good = [], bad = [], pool = [];
      e.opts.forEach(function (o, i) { var p = e.picks[i]; if (p) (p.ok ? good : bad).push({ o: o, p: p }); else pool.push({ o: o, i: i }); });
      var total = T() ? e.opts.filter(function (o) { return o.ok; }).length : null;
      var h = '<div class="fork"><div class="fork-c">' + esc(e.center) + '</div><div class="fork-br">' + (good.length ? good.map(function (g) { return '<span class="fork-ok">' + esc(g.o.w) + '<small>' + esc(g.p.name.split(' ')[0]) + '</small></span>'; }).join('') : '<span class="gmuted">Tap the words that go with “' + esc(e.center) + '”</span>') + '</div></div>' +
        '<div class="fork-pool">' + pool.map(function (x) { return '<button class="gchip" data-g="pick" data-i="' + x.i + '" type="button">' + esc(x.o.w) + (T() && x.o.ok ? ' ✓' : '') + '</button>'; }).join('') + '</div>' +
        (bad.length ? '<div class="fork-bad">' + bad.map(function (g) { return '<s>' + esc(g.o.w) + '</s>'; }).join('') + '</div>' : '') +
        '<div class="gmuted">Found ' + good.length + (total != null ? ' of ' + total : '') + '</div>' + tbar(btn('reset', 'Start again'));
      return shell('fork', e, to, xs, h);
    },
    click: function (e, b) { if (b.dataset.g === 'pick') act(e, 'pick', { i: Number(b.dataset.i) }); else if (b.dataset.g === 'reset') act(e, 'reset'); },
    setup: { help: 'Lines starting with + go with the word, lines with − don’t:\n+ a decision\n− homework',
      toText: function (e) { return e.opts.map(function (o) { return (o.ok ? '+ ' : '- ') + o.w; }).join('\n'); },
      opts: function (e) { return '<label class="f">Main word<input data-opt="center" value="' + esc(e.center) + '"></label>'; },
      fromText: function (t, o) { return { center: o.center || 'make', opts: lines(t).map(function (l) { var ok = !/^[-−–]/.test(l); return { w: l.replace(/^[+\-−–✓✗]\s*/, ''), ok: ok }; }), picks: {} }; } }
  };

  /* ---------- 9. Sentence auction ---------- */
  G.auction = { svg: '<path d="M13.5 4.5l6 6M8.5 9.5l6 6M11 7l-4 4 6 6 4-4z"/><path d="M8 14l-4.5 4.5M3 21h9"/>', name: 'Sentence auction', ico: '🔨', w: 820,
    defaults: { w: 820 },
    html: function (e, xs, to) {
      var spent = e.teams.map(function () { return 0; }), got = e.teams.map(function () { return 0; }), good = e.teams.map(function () { return 0; });
      Object.keys(e.sold).forEach(function (k) { var s = e.sold[k]; spent[s.team] += s.price; got[s.team]++; if (e.items[k] && e.items[k].ok) good[s.team]++; });
      var h = '<table class="auc"><tbody>' + e.items.map(function (it, i) {
        var s = e.sold[i];
        return '<tr class="' + (i === e.lot ? 'lot' : '') + (e.shown ? (it.ok ? ' ok' : ' bad') : '') + '"><td class="n">' + (i + 1) + '</td><td>' + esc(it.s) + (e.shown && !it.ok && it.fix ? '<div class="fix">✎ ' + esc(it.fix) + '</div>' : '') + '</td><td class="st">' + (s ? '<b>' + esc(e.teams[s.team].name) + '</b> · ' + s.price : '—') + (e.shown ? (it.ok ? ' ✓' : ' ✗') : '') + '</td>' +
          (T() ? '<td class="ac">' + btn('sell', s ? 'Change' : 'Sold!', 'sm', ' data-i="' + i + '"') + (s ? btn('unsell', '×', 'sm', ' data-i="' + i + '"') : '') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>' +
        '<div class="auc-teams">' + e.teams.map(function (t, i) { return '<div class="auc-t"><b>' + esc(t.name) + '</b><span>💰 ' + (e.budget - spent[i]) + '</span><span>bought ' + got[i] + '</span>' + (e.shown ? '<span class="ok">correct ' + good[i] + '</span>' : '') + '</div>'; }).join('') + '</div>' +
        tbar(btn('reveal', e.shown ? 'Hide answers' : 'Reveal correct sentences', 'solid') + btn('reset', 'Reset'));
      return shell('auction', e, to, xs, h);
    },
    click: function (e, b) {
      var a = b.dataset.g, i = Number(b.dataset.i);
      if (a === 'sell') {
        SB.ctxPop('<div class="lbl">Sentence ' + (i + 1) + ' sold to…</div><div class="trow">' + e.teams.map(function (t, k) { return '<button class="cb" data-v="' + k + '" type="button">' + esc(t.name) + '</button>'; }).join('') + '</div><label class="f">Price<input id="aucP" type="number" min="0" value="100" style="width:120px"></label>', b, function (v, pop) {
          act(e, 'sell', { i: i, team: Number(v), price: Number($q('#aucP', pop).value) || 0 }); SB.closeCtxPop();
        }, true);
        return;
      }
      if (a === 'unsell') act(e, 'unsell', { i: i });
      else if (a === 'reset') { if (confirm('Reset the auction?')) act(e, 'reset'); }
      else act(e, a);
    },
    setup: { help: 'One sentence per line. + correct, − wrong. After “=>” — the correct version:\n+ If I had known, I would have called.\n− She has lived here since five years. => for five years',
      toText: function (e) { return e.items.map(function (x) { return (x.ok ? '+ ' : '- ') + x.s + (x.fix ? ' => ' + x.fix : ''); }).join('\n'); },
      opts: function (e) { return teamsOpt(e) + '<label class="f">Money for each team<input type="number" data-opt="budget" value="' + e.budget + '"></label>'; },
      fromText: function (t, o, e) { return { items: lines(t).map(function (l) { var ok = !/^[-−–✗]/.test(l), body = l.replace(/^[+\-−–✓✗]\s*/, ''), p = body.split('=>'); return { s: p[0].trim(), ok: ok, fix: (p[1] || '').trim() }; }), teams: teamsFrom(o.teams, e.teams), budget: Number(o.budget) || 1000, sold: {}, shown: false }; } }
  };

  /* ---------- 10. Race ---------- */
  G.race = { svg: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>', name: 'Race', ico: '🏁', w: 640,
    defaults: { w: 640 },
    html: function (e, xs, to) {
      var me = ME(), count = e.count || e.items.length, mine = e.prog[me.id] || { n: 0, wrong: 0, last: '' }, h = '';
      var done = Object.keys(e.prog).filter(function (k) { return e.prog[k].at; }).sort(function (a, b) { return e.prog[a].at - e.prog[b].at; });
      if (!T()) {
        if (!e.on && !mine.at) h += '<div class="gmuted">Wait for the teacher to start the race…</div>';
        else if (mine.n >= count) h += '<div class="bg-win">🏁 Finished! Place #' + (done.indexOf(me.id) + 1) + '</div>';
        else h += '<div class="race-q"><span class="gmuted">Question ' + (mine.n + 1) + ' of ' + count + '</span><b>' + esc((e.items[mine.n] || {}).q || '') + '</b></div><div class="grow"><input class="ginput" data-gin="ans" placeholder="Your answer" data-enter="answer" autocomplete="off">' + btn('answer', 'Go', 'solid') + '</div>' + (mine.last === 'bad' ? '<div class="ttt-last bad">Not quite — try again</div>' : mine.last === 'ok' ? '<div class="ttt-last ok">✓ Correct!</div>' : '');
      }
      h += '<div class="race-tr">' + Object.keys(e.prog).sort(function (a, b) { return e.prog[b].n - e.prog[a].n; }).map(function (k) {
        var p = e.prog[k], pl = done.indexOf(k);
        return '<div class="race-l' + (k === me.id ? ' me' : '') + '"><span class="race-n">' + (pl >= 0 ? ['🥇', '🥈', '🥉'][pl] || '#' + (pl + 1) : '') + ' ' + esc(p.name.split(' ')[0]) + '</span><span class="race-b"><i style="width:' + Math.round(p.n / count * 100) + '%"></i><em style="left:' + Math.round(p.n / count * 100) + '%">🏃</em></span><span class="gmuted">' + p.n + '/' + count + (p.wrong ? ' · ✗' + p.wrong : '') + '</span></div>';
      }).join('') + '</div>';
      h += tbar((e.on ? btn('stop', 'Stop') : btn('start', 'Start the race', 'solid')) + '<span class="gmuted">' + count + ' questions</span>');
      return shell('race', e, to, xs, h);
    },
    click: function (e, b, n) {
      var a = b.dataset.g;
      if (a === 'answer') { var i = n.querySelector('[data-gin=ans]'); if (i && i.value.trim()) { var v = i.value.trim(); i.value = ''; act(e, 'answer', { text: v }); } }
      else if (a === 'start') { if (Object.keys(e.prog).length && !confirm('Start again? Progress is cleared.')) return; act(e, 'start'); }
      else act(e, a);
    },
    setup: { help: 'One question per line: question = answer / other answer',
      toText: function (e) { return e.items.map(function (x) { return x.q + ' = ' + x.a.join(' / '); }).join('\n'); },
      fromText: function (t) { return { items: lines(t).map(function (l) { var i = l.lastIndexOf('='); return { q: l.slice(0, i).trim(), a: listAns(l.slice(i + 1)) }; }).filter(function (x) { return x.q && x.a.length; }), prog: {}, on: false }; } }
  };

  /* ---------- 11. Jeopardy ---------- */
  G.jeopardy = { svg: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>', name: 'Jeopardy', ico: '🏆', w: 900,
    defaults: { w: 900 },
    html: function (e, xs, to) {
      var rows = Math.max.apply(null, e.cats.map(function (c) { return c.qs.length; }).concat([1]));
      var h = '<div class="jp-grid" style="grid-template-columns:repeat(' + e.cats.length + ',1fr)">' + e.cats.map(function (c) { return '<div class="jp-h">' + esc(c.name) + '</div>'; }).join('');
      for (var r = 0; r < rows; r++) e.cats.forEach(function (c, ci) { var q = c.qs[r]; if (!q) { h += '<div></div>'; return; } var dn = e.done.indexOf(ci + ':' + r) >= 0; h += '<button class="jp-c' + (dn ? ' done' : '') + (e.open && e.open.c === ci && e.open.i === r ? ' open' : '') + '"' + (T() && !dn ? ' data-g="open" data-c="' + ci + '" data-i="' + r + '"' : ' disabled') + ' type="button">' + (dn ? '' : q.v) + '</button>'; });
      h += '</div>';
      if (e.open) {
        var q = e.cats[e.open.c].qs[e.open.i];
        h += '<div class="jp-open"><div class="gmuted">' + esc(e.cats[e.open.c].name) + ' · ' + q.v + '</div><div class="jp-q">' + esc(q.q) + '</div>' + (q.a ? '<div class="jp-a">' + esc(q.a) + '</div>' : '') +
          (T() ? '<div class="gtbar">' + btn('answer', e.showA ? 'Hide answer' : 'Show answer') + e.teams.map(function (t, i) { return '<span class="jp-tb">' + esc(t.name) + btn('score', '+', 'sm', ' data-team="' + i + '" data-ok="1"') + btn('score', '−', 'sm', ' data-team="' + i + '" data-ok="0"') + '</span>'; }).join('') + btn('close', 'Done', 'solid') + '</div>' : '') + '</div>';
      }
      h += '<div class="auc-teams">' + e.teams.map(function (t) { return '<div class="auc-t"><b>' + esc(t.name) + '</b><span class="jp-s">' + t.score + '</span></div>'; }).join('') + '</div>' + tbar(btn('reset', 'New game'));
      return shell('jeopardy', e, to, xs, h);
    },
    click: function (e, b) {
      var a = b.dataset.g;
      if (a === 'open') act(e, 'open', { c: Number(b.dataset.c), i: Number(b.dataset.i) });
      else if (a === 'score') act(e, 'score', { team: Number(b.dataset.team), ok: b.dataset.ok === '1' });
      else if (a === 'reset') { if (confirm('New game? Scores are cleared.')) act(e, 'reset'); }
      else act(e, a);
    },
    setup: { help: 'A category starts with #. Then questions: points | question | answer\n# Phrasal verbs\n100 | What does “give up” mean? | stop trying',
      toText: function (e) { return e.cats.map(function (c) { return '# ' + c.name + '\n' + c.qs.map(function (q) { return q.v + ' | ' + q.q + ' | ' + q.a; }).join('\n'); }).join('\n'); },
      opts: teamsOpt,
      fromText: function (t, o, e) { var cats = []; lines(t).forEach(function (l) { if (/^#/.test(l)) cats.push({ name: l.replace(/^#+\s*/, ''), qs: [] }); else { if (!cats.length) cats.push({ name: 'Questions', qs: [] }); var p = l.split('|').map(function (x) { return x.trim(); }); cats[cats.length - 1].qs.push({ v: Number(p[0]) || (cats[cats.length - 1].qs.length + 1) * 100, q: p[1] || p[0], a: p[2] || '' }); } }); return { cats: cats, teams: teamsFrom(o.teams, e.teams), done: [], open: null }; } }
  };

  /* ---------- 12. Buzzer ---------- */
  var beeped = {};
  G.buzzer = { svg: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>', name: 'Buzzer', ico: '🔔', w: 360,
    defaults: { w: 360 },
    html: function (e, xs, to) {
      var me = ME(), pressed = e.presses.some(function (p) { return p.sid === me.id; }), t0 = e.presses.length ? e.presses[0].t : 0;
      if (e.presses.length && beeped[e.id] !== e.presses[0].t) { beeped[e.id] = e.presses[0].t; if (T()) beep(); }
      var h = (!T() ? '<button class="buzz' + (e.armed && !pressed ? ' live' : '') + '"' + (e.armed && !pressed ? ' data-g="press"' : ' disabled') + ' type="button">' + (pressed ? 'Pressed' : e.armed ? 'BUZZ!' : 'Wait…') + '</button>' : '<div class="buzz-st">' + (e.armed ? '🟢 Ready — students can buzz' : '⚪ Locked') + '</div>') +
        '<ol class="buzz-l">' + e.presses.map(function (p, i) { return '<li class="' + (i === 0 ? 'first' : '') + '"><b>' + esc(p.name) + '</b>' + (i ? '<span>+' + ((p.t - t0) / 1000).toFixed(2) + ' s</span>' : '<span>first!</span>') + '</li>'; }).join('') + '</ol>' +
        tbar(btn('arm', e.armed ? 'Reset' : 'Ready!', 'solid') + (e.armed ? btn('lock', 'Lock') : ''));
      return shell('buzzer', e, to, xs, h);
    },
    click: function (e, b) { act(e, b.dataset.g); },
    setup: { help: 'Press “Ready!” — the first student to buzz is shown first, then everyone else with the delay.', noText: true, toText: function () { return ''; }, fromText: function () { return {}; } }
  };
  function beep() { try { var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(c.destination); o.start(); setTimeout(function () { o.stop(); c.close(); }, 220); } catch (er) {} }

  /* ---------- 13. Escape room ---------- */
  G.escape = { svg: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20M17 12v3M20 12v2"/>', name: 'Escape room', ico: '🗝️', w: 520,
    defaults: { w: 520, title: 'Escape room' },
    html: function (e, xs, to) {
      var h = '<div class="esc-rooms">' + e.rooms.map(function (r, i) { return '<span class="esc-r' + (i < e.open ? ' ok' : i === e.open ? ' cur' : '') + '">' + (i < e.open ? '🔓' : i === e.open ? '🚪' : '🔒') + ' ' + esc(r.name || 'Room ' + (i + 1)) + '</span>'; }).join('') + '</div>';
      if (!e.rooms.length) h += '<div class="gmuted">' + (T() ? 'Set up: list your frames in order with a code for each.' : 'Not ready yet.') + '</div>';
      else if (e.open >= e.rooms.length) h += '<div class="bg-win">🎉 You escaped!</div>';
      else {
        var r = e.rooms[e.open];
        h += '<div class="esc-lock"><div class="gmuted">Solve the tasks in “' + esc(r.name || 'Room ' + (e.open + 1)) + '” — the answers give you the code.</div>' + (r.hint ? '<div class="esc-hint">💡 ' + esc(r.hint) + '</div>' : '') +
          (T() ? '<div class="gmuted">Code: <b>' + esc(r.code) + '</b></div>' : '') + '<div class="grow"><input class="ginput" data-gin="code" placeholder="Enter the code" data-enter="code" autocomplete="off">' + btn('code', 'Unlock', 'solid') + '</div></div>';
      }
      if (e.tries.length) h += '<div class="esc-tries">' + e.tries.slice(-4).reverse().map(function (t) { return '<span class="' + (t.ok ? 'ok' : 'bad') + '">' + esc(t.name.split(' ')[0]) + ': ' + esc(t.code) + (t.ok ? ' ✓' : ' ✗') + '</span>'; }).join('') + '</div>';
      h += tbar(btn('lock', 'Lock all rooms again') + btn('openall', 'Open all'));
      return shell('escape', e, to, xs, h);
    },
    click: function (e, b, n) {
      var a = b.dataset.g;
      if (a === 'code') { var i = n.querySelector('[data-gin=code]'); if (i && i.value.trim()) act(e, 'code', { code: i.value.trim() }, function (r) { if (r && !r.err) { SB.toast('🔓 Unlocked!'); i.value = ''; var nx = e.rooms[e.open + 1], f = nx && SB.find(nx.frame); if (f) SB.goFrame(f); } }); }
      else if (a === 'lock') { if (confirm('Lock all rooms except the first one?')) act(e, 'lock'); }
      else act(e, a);
    },
    setup: { noText: true, help: 'Rooms are frames on this board. Tick the frames that are rooms, give each one the code that opens the NEXT room (the answer to its tasks). Rooms after the first stay hidden until the code is entered; the code of the last room means “escaped!”.',
      toText: function () { return ''; },
      opts: function (e) {
        var fr = SB.frames().slice().sort(function (a, b) { return Math.round(a.y / 50) - Math.round(b.y / 50) || a.x - b.x; }), byId = {};
        e.rooms.forEach(function (r, i) { byId[r.frame] = { r: r, i: i }; });
        if (!fr.length) return '<p class="gmuted">No frames yet. Create the rooms with one click:</p><button class="pb solid" data-gsact="rooms" type="button">＋ Create 3 room frames</button>';
        return '<div class="esc-set"><div class="esc-sh"><span>Room</span><span>Frame</span><span>Code to go on</span><span>Hint (optional)</span></div>' + fr.map(function (f) {
          var x = byId[f.id];
          return '<label class="esc-sr"><input type="checkbox" data-opt="inc_' + f.id + '"' + (x ? ' checked' : '') + '><input type="number" min="1" max="20" data-opt="ord_' + f.id + '" value="' + (x ? x.i + 1 : '') + '" placeholder="#"><b>' + esc(f.title || 'Frame') + '</b><input data-opt="code_' + f.id + '" value="' + esc(x ? x.r.code : '') + '" placeholder="e.g. 42"><input data-opt="hint_' + f.id + '" value="' + esc(x ? x.r.hint : '') + '" placeholder="hint"></label>';
        }).join('') + '</div><button class="pb" data-gsact="rooms" type="button">＋ Add 3 more room frames</button>';
      },
      after: function (e) { if (e.rooms.length > 1) act(e, 'lock'); },
      action: function (a, e, m) { if (a !== 'rooms') return; m.remove(); SB.makeFrames(['Room 1', 'Room 2', 'Room 3'], e, function () { G.escape.setupAgain(e.id); }); },
      fromText: function (t, o) {
        var fr = SB.frames().slice().sort(function (a, b) { return Math.round(a.y / 50) - Math.round(b.y / 50) || a.x - b.x; }), rooms = [];
        fr.forEach(function (f, i) { if (!o['inc_' + f.id]) return; rooms.push({ frame: f.id, name: f.title || 'Room', code: (o['code_' + f.id] || '').trim(), hint: (o['hint_' + f.id] || '').trim(), ord: Number(o['ord_' + f.id]) || 1000 + i }); });
        rooms.sort(function (a, b) { return a.ord - b.ord; }); rooms.forEach(function (r) { delete r.ord; });
        if (rooms.slice(0, -1).some(function (r) { return !r.code; })) SB.toast('Tip: every room except the last needs a code');
        return { rooms: rooms, open: 0, tries: [] };
      } },
    setupAgain: function (id) { setTimeout(function () { var e = SB.find(id); if (e) setup(e); }, 700); }
  };

  /* ---------- 14. Taboo ---------- */
  G.taboo = { svg: '<circle cx="12" cy="12" r="8"/><path d="M6.4 6.4l11.2 11.2"/>', name: 'Taboo', ico: '🚫', w: 620,
    defaults: { w: 620 },
    html: function (e, xs, to) {
      var me = ME(), isEx = e.ex && e.ex.sid === me.id, h = '', left = Math.max(0, Math.ceil((e.end - SB.now()) / 1000)), live = left > 0;
      if (e.mode === 'classic') {
        var k = e.deck[e.pos], card = k != null ? e.cards[k] : null, seeCard = T() || isEx, fresh = e.buzz && SB.now() - e.buzz.at < 2500;
        h += '<div class="tb-top"><span class="tb-time' + (live && left <= 10 ? ' hot' : '') + '" data-tbend="' + e.end + '">' + (live ? '⏱ ' + left + ' s' : '⏱ ' + e.sec + ' s') + '</span><span class="gmuted">Explains: <b>' + esc(e.ex ? e.ex.name : 'the teacher') + '</b></span>' + e.teams.map(function (t, i) { return '<span class="tb-team' + (i === e.team ? ' on' : '') + '">' + esc(t.name) + ' <b>' + t.score + '</b></span>'; }).join('') + '</div>';
        if (e.pos >= (e.count || e.cards.length)) h += '<div class="bg-win">No more cards!</div>';
        else if (seeCard && card && card.w) h += '<div class="tb-card' + (fresh ? ' buzzed' : '') + '"><div class="tb-w">' + esc(card.w) + '</div><div class="tb-ban">' + card.taboo.map(function (w) { return '<span>' + esc(w) + '</span>'; }).join('') + '</div></div>' +
          '<div class="gfoot">' + btn('got', '✓ Got it', 'solid') + btn('skip', 'Skip') + '</div>';
        else h += '<div class="tb-card back' + (fresh ? ' buzzed' : '') + '"><div class="tb-w">❓</div><div class="gmuted">Guess the word!</div></div>' + (live ? '<div class="gfoot">' + btn('buzz', '🚫 TABOO!', 'taboo') + '</div>' : '');
        if (fresh) h += '<div class="ttt-last bad">🚫 TABOO! — ' + esc(e.buzz.name) + '</div>';
        var last = e.log.slice(-6).reverse();
        if (last.length) h += '<div class="tb-log">' + last.map(function (l) { return '<span class="' + l.r + '">' + esc(l.w) + '</span>'; }).join('') + '</div>';
        if (T()) h += '<div class="gtbar">' + (live ? btn('stop', 'Stop') : btn('start', '▶ Start ' + e.sec + ' s', 'solid')) + btn('team', 'Next team') + '<select class="gsel" data-gsel="ex"><option value="">Explains: teacher</option>' + people().map(function (p) { return '<option value="' + esc(p.id) + '"' + (e.ex && e.ex.sid === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' + btn('reset', 'New game') + '</div>';
      } else {
        var my = e.myCard != null ? e.cards[e.myCard] : null, mine = e.defs[me.id];
        if (!T()) {
          if (my && my.w) h += '<div class="tb-card"><div class="tb-w">' + esc(my.w) + '</div><div class="tb-ban">' + my.taboo.map(function (w) { return '<span>' + esc(w) + '</span>'; }).join('') + '</div></div>';
          if (!e.shown) h += '<div class="gmuted">Explain your word in writing — without the word itself and the taboo words.</div><textarea class="ginput tb-ta" data-gin="def" rows="3" maxlength="600" placeholder="It’s something you…">' + esc(mine ? mine.text : '') + '</textarea><div class="gfoot">' + btn('write', mine ? 'Update' : 'Send', 'solid') + (mine ? '<span class="gok">✓ Sent</span>' : '') + '</div>';
        }
        var ds = Object.keys(e.defs);
        if (e.shown || T()) h += '<div class="tb-defs">' + ds.map(function (k) { var d = e.defs[k], w = d.w || (T() && e.cards[d.card] ? e.cards[d.card].w : ''); return '<div class="tb-def"><p>' + esc(d.text) + '</p>' + (w ? '<b>' + esc(w) + '</b>' : '') + (d.name ? '<small>' + esc(d.name) + '</small>' : '') + '</div>'; }).join('') + '</div>';
        else if (ds.length) h += '<div class="gmuted">' + ds.length + ' definitions sent</div>';
        if (T()) h += tbar(btn('reveal', e.shown ? 'Hide words' : 'Show all definitions with the words', 'solid') + btn('reset', 'Clear'));
      }
      return shell('taboo', e, to, xs, h);
    },
    click: function (e, b, n) {
      var a = b.dataset.g;
      if (a === 'write') { var t = n.querySelector('[data-gin=def]'); if (t && t.value.trim()) act(e, 'write', { text: t.value.trim() }, function (r) { if (r && !r.err) SB.toast('Sent'); }); }
      else if (a === 'reset') { if (confirm('New game? Scores and answers are cleared.')) act(e, 'reset'); }
      else act(e, a);
    },
    select: function (e, s) { if (s.dataset.gsel === 'ex') { var p = people().find(function (x) { return x.id === s.value; }); act(e, 'ex', { sid: s.value, name: p ? p.name : '' }); } },
    setup: { help: 'One card per line: word: taboo, taboo, taboo, taboo',
      toText: function (e) { return e.cards.map(function (c) { return c.w + ': ' + c.taboo.join(', '); }).join('\n'); },
      opts: function (e) { return '<label class="f">Mode<select data-opt="mode"><option value="classic"' + (e.mode === 'classic' ? ' selected' : '') + '>Classic — explain out loud, others guess</option><option value="written"' + (e.mode === 'written' ? ' selected' : '') + '>Written — each student writes a definition</option></select></label><label class="f">Seconds per round<input type="number" min="10" max="600" data-opt="sec" value="' + e.sec + '"></label>' + teamsOpt(e); },
      fromText: function (t, o, e) { return { cards: lines(t).map(function (l) { var i = l.indexOf(':'); return i < 0 ? { w: l, taboo: [] } : { w: l.slice(0, i).trim(), taboo: l.slice(i + 1).split(',').map(function (x) { return x.trim(); }).filter(Boolean) }; }), mode: o.mode || 'classic', sec: Number(o.sec) || 60, teams: teamsFrom(o.teams, e.teams), deck: [], pos: 0, log: [], defs: {}, end: 0 }; } }
  };

  // таймер Taboo тикает каждую секунду без перерисовки всей доски
  setInterval(function () { document.querySelectorAll('[data-tbend]').forEach(function (n) { var end = Number(n.dataset.tbend), left = Math.max(0, Math.ceil((end - SB.now()) / 1000)); if (end && end > SB.now() - 1500) { n.textContent = '⏱ ' + left + ' s'; n.classList.toggle('hot', left <= 10); if (!left && !n.dataset.over) { n.dataset.over = 1; SB.render(); } } }); }, 500);

  function $q(s, r) { return (r || document).querySelector(s); }
  /* ---------- окно настройки (учитель) ---------- */
  function setup(e) {
    var d = G[e.type], S = d.setup || {};
    var m = document.createElement('div'); m.className = 'gsetup';
    m.innerHTML = '<div class="gsbox"><div class="gshead"><span class="gico"><svg viewBox="0 0 24 24">' + d.svg + '</svg></span><b>' + esc(d.name) + '</b><button class="x" data-gs="close" type="button">×</button></div>' +
      '<label class="f">Title<input data-opt="title" value="' + esc(e.title || '') + '" placeholder="' + esc(d.name) + '"></label>' +
      (S.noText ? '' : '<p class="hint" style="white-space:pre-line">' + esc(S.help || '') + '</p><textarea data-gs="text" rows="12">' + esc(S.toText ? S.toText(e) : '') + '</textarea>') + (S.noText && S.help ? '<p class="hint">' + esc(S.help) + '</p>' : '') +
      (S.extra ? S.extra(e) : '') + (S.opts ? S.opts(e) : '') +
      '<div class="gsfoot"><button class="pb" data-gs="close" type="button">Cancel</button><button class="pb solid" data-gs="save" type="button">Save</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Escape') m.remove(); });
    m.addEventListener('click', function (ev) {
      if (ev.target === m) { m.remove(); return; }
      var ga = ev.target.closest('[data-gsact]'); if (ga && S.action) { S.action(ga.dataset.gsact, e, m); return; }
      var b = ev.target.closest('[data-gs]'); if (!b) return;
      if (b.dataset.gs === 'close') { m.remove(); return; }
      if (b.dataset.gs !== 'save') return;
      var o = {}; m.querySelectorAll('[data-opt]').forEach(function (i) { o[i.dataset.opt] = i.type === 'checkbox' ? i.checked : i.value; });
      var ta = m.querySelector('[data-gs=text]'), patch = S.fromText ? S.fromText(ta ? ta.value : '', o, e) : {};
      patch.title = (o.title || '').trim();
      SB.patch(e.id, patch); m.remove(); SB.toast('Saved'); if (S.after) setTimeout(function () { var e2 = SB.find(e.id); if (e2) S.after(e2); }, 400);
    });
    var ta = m.querySelector('textarea'); if (ta) ta.focus();
  }

  window.GAMES_API = {
    init: function (sb) { SB = sb; },
    click: function (e, b, n) { if (b.dataset.g === 'setup') { setup(e); return; } var d = G[e.type]; if (d && d.click) d.click(e, b, n); },
    change: function (e, s) { var d = G[e.type]; if (d && d.select) d.select(e, s); },
    setup: setup,
    list: function () { return Object.keys(G).map(function (k) { return [k, 'g_' + k, G[k].name]; }); },
    icons: function () { var o = { g_detective: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M14.5 14.5L20 20"/>' }; Object.keys(G).forEach(function (k) { o['g_' + k] = G[k].svg; }); return o; },
    add: function (type, c) { var d = G[type]; return Object.assign({ type: type, x: Math.round(c.x - (d.w || 600) / 2), y: Math.round(c.y - 160) }, JSON.parse(JSON.stringify(d.defaults || {}))); }
  };
})();
