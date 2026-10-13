/* Speak&Teach board: infinite canvas, frames, shapes, connectors, Miro-style selection and inline rich-text editing, widgets, tasks */
(function () {
  'use strict';
  var BOARD_ID = location.pathname.split('/').pop();
  var socket = io();
  var B = null, ME = null, PEOPLE = [];
  var V = { x: 20, y: 20, z: 1 };
  var tool = 'select', inkColor = '#1E1E1C', stkEmoji = '👍', shapeKind = 'rect';
  var sel = [], editing = null, cropId = null, press = null, drag = null;
  var pendingRender = false, spaceDown = false;
  var remoteInk = {}, cursors = {}, ptrs = {}, pinch = null, lastTap = { id: null, t: 0 };
  var lastPointer = null, seenSpin = {}, seenRoll = {}, prevFlip = {}, mineIdx = 0;
  var ROSTER = [], SHARE = null, SKEW = 0, myTimer = null, beeped = {};
  var undoStack = [], selS = [];

  var vp = $('#vp'), world = $('#world'), ink = $('#ink'), links = $('#lk');
  var INK_COLORS = ['#1E1E1C', '#C2412D', '#2F6FE0', '#2E8B57', '#E08A1E', '#8E44AD', '#E0457B', '#13897B', '#FFFFFF', '#7A5A44', '#6B7785', '#F2C230'];
  var TEXT_COLORS = ['#1E1E1C', '#6B7785', '#C2412D', '#E08A1E', '#2E8B57', '#2F6FE0', '#8E44AD', '#E0457B', '#FFFFFF'];
  var HL_COLORS = ['', '#FFF07A', '#C8F5B4', '#BFE3FF', '#FFC9E0', '#FFD8A8', '#E2D4FF'];
  var NOTE_COLORS = ['#FFF1A8', '#FFD2B0', '#FFC2CF', '#D9C8F5', '#C3DAF7', '#BFE8D2', '#E6F0A8', '#FFFFFF', '#E3E2DE', '#3A3A37'];
  var SHAPE_FILLS = ['none', '#FFFFFF', '#F4F4F2', '#FFF1A8', '#FFD2B0', '#FFC2CF', '#D9C8F5', '#C3DAF7', '#BFE8D2', '#1E1E1C', '#2F6FE0', '#C2412D'];
  var STROKES = ['#1E1E1C', '#6B7785', '#C2412D', '#E08A1E', '#2E8B57', '#2F6FE0', '#8E44AD', '#FFFFFF'];
  var FRAME_FILLS = ['', '#FFF8E6', '#FDEDEA', '#F1EEFB', '#EAF2FD', '#EAF6EF', '#F4F4F2', '#2A2A28'];
  var ACCENTS = ['', '#C2412D', '#E08A1E', '#2E8B57', '#2F6FE0', '#8E44AD', '#E0457B', '#6B7785'];
  var WHEEL_COLORS = ['#F2B5A7', '#F6D79B', '#B9DDB0', '#A9C8EF', '#D2BDF0', '#F5B9D0', '#A8DDD6', '#E8E1A0'];
  var PALETTE = ['#F2B5A7', '#A9C8EF', '#D2BDF0', '#F6D79B', '#B9DDB0', '#F5B9D0', '#B7C4D0', '#E8C3A0', '#A8DDD6', '#C3C9F0'];
  var FONTS = ['Inter', 'Montserrat', 'Unbounded', 'Nunito', 'Rubik', 'Comfortaa', 'Lora', 'PT Serif', 'Playfair Display', 'Caveat', 'Pacifico', 'Roboto Mono', 'Marck Script', 'Bad Script', 'Neucha', 'Pangolin', 'Amatic SC', 'Lobster', 'Dancing Script', 'Great Vibes', 'Open Sans', 'Roboto', 'PT Sans', 'Noto Sans', 'Arimo', 'Roboto Slab', 'Roboto Condensed', 'EB Garamond', 'Permanent Marker', 'Fredoka'];
  var BGS = ['#F7F7F5', '#FFFFFF', '#FBF6EC', '#EEF3EA', '#EAF0F7', '#F4EEF6', '#2B2B29', '#1C2430'];
  var REACTS = ['👍', '❤️', '😂', '😮', '🔥', '✅', '❓', '💡', '👏', '🎉', '😢', '🙏'];
  var SHAPE_KINDS = ['rect', 'round', 'ellipse', 'diamond', 'triangle', 'hexagon', 'parallelogram', 'star', 'arrow', 'speech'];
  var POLY = {
    diamond: '50,0 100,50 50,100 0,50', triangle: '50,0 100,100 0,100', hexagon: '25,0 75,0 100,50 75,100 25,100 0,50',
    parallelogram: '22,0 100,0 78,100 0,100', arrow: '0,28 62,28 62,0 100,50 62,100 62,72 0,72', speech: '0,0 100,0 100,76 42,76 20,100 26,76 0,76',
    star: (function () { var p = []; for (var i = 0; i < 10; i++) { var r = i % 2 ? 21 : 50, a = -Math.PI / 2 + i * Math.PI / 5; p.push((50 + r * Math.cos(a)).toFixed(1) + ',' + (54 + r * Math.sin(a)).toFixed(1)); } return p.join(' '); })()
  };
  var isT = function () { return ME && ME.role === 't'; };
  var IC = {
    select: '<path d="M6 3l13 8-6 1.4L10 19z"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    diamondI: '<path d="M12 3l9 9-9 9-9-9z"/>', hexI: '<path d="M7.5 4h9l4.5 8-4.5 8h-9L3 12z"/>', triI: '<path d="M12 4l9 16H3z"/>', starI: '<path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z"/>',
    hand: '<path d="M8 12V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-4.5a1.5 1.5 0 013 0V14c0 4-2.6 7-6.2 7-2.7 0-4.4-1.7-5.8-4.2L3.2 13.4a1.5 1.5 0 012.6-1.5L8 15"/>',
    pen: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
    marker: '<path d="M14 4l6 6-8 8-6-6z"/><path d="M6 12l-2 6 6-2"/>',
    eraser: '<path d="M8 20h12"/><path d="M4.5 15.5l9-9a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H8z"/>',
    note: '<path d="M5 4h14v10l-6 6H5z"/><path d="M13 20v-6h6"/>',
    text: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    shape: '<rect x="3.5" y="10" width="10" height="10" rx="1"/><circle cx="15.5" cy="8" r="5"/>',
    line: '<path d="M5 19L19 5"/><path d="M12 5h7v7"/>',
    emoji: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.4"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M20 16l-5-5-8.5 8"/>',
    frame: '<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
    tasks: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
    card: '<rect x="3.5" y="7" width="17" height="10" rx="2"/><path d="M7.5 12h6"/>',
    zone: '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 2.6"/>',
    gaps: '<path d="M3 9h18"/><path d="M3 15h4M10 15h4M17 15h4"/>',
    wheel: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6M12 12L4.6 16"/>',
    flip: '<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M4 8L2.5 10 4 12M20 12l1.5 2-1.5 2"/>',
    scale: '<path d="M3 12h18"/><circle cx="15" cy="12" r="2.6"/><path d="M3 9v6M21 9v6"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M9 9h.01M15 15h.01M12 12h.01" stroke-width="2.6"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.6-1.8"/>',
    dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    more: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="2.8"/>',
    crop: '<path d="M6 2v16h16"/><path d="M2 6h16v16"/>',
    eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0112 6c6 0 9.5 6 9.5 6a16 16 0 01-3 3.6M6.4 7.6A16 16 0 002.5 12s3.5 6 9.5 6a9 9 0 004-.9"/>',
    send: '<path d="M4 12h13"/><path d="M12 6l6 6-6 6"/>',
    cover: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 5l16 14M20 5L4 19" opacity=".5"/>',
    view: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    group: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h4a2 2 0 012 2v4" stroke-dasharray="2 2"/>',
    ungroup: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    tnote: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    bullets: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.6"/>',
    hl: '<path d="M9 15l-3 3h4l2-2"/><path d="M8 13l7-9 4 4-9 7z"/><path d="M3 21h18" stroke-width="2.4"/>',
    al: '<path d="M4 4v16M8 8h11M8 16h6"/>', ac: '<path d="M12 4v16M6 8h12M8.5 16h7"/>', ar: '<path d="M20 4v16M5 8h11M10 16h6"/>',
    at: '<path d="M4 4h16M8 8v11M16 8v6"/>', am: '<path d="M4 12h16M8 6v12M16 8.5v7"/>', ab: '<path d="M4 20h16M8 5v11M16 10v6"/>',
    dh: '<path d="M4 4v16M20 4v16"/><rect x="9" y="8" width="6" height="8" rx="1"/>', dv: '<path d="M4 4h16M4 20h16"/><rect x="8" y="9" width="8" height="6" rx="1"/>',
    sw: '<path d="M4 12h16M7.5 8.5L4 12l3.5 3.5M16.5 8.5L20 12l-3.5 3.5"/>', sh: '<path d="M12 4v16M8.5 7.5L12 4l3.5 3.5M8.5 16.5L12 20l3.5-3.5"/>',
    tal: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', tac: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', tar: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    rect: '<rect x="4" y="5" width="16" height="14"/>', round: '<rect x="4" y="5" width="16" height="14" rx="4.5"/>', circle: '<circle cx="12" cy="12" r="8"/>', ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6.5"/>',
    dash: '<path d="M3 12h4M10 12h4M17 12h4"/>', curve: '<path d="M4 18C10 18 14 6 20 6"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
    pdfi: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M8.5 16v-4h1.3a1.2 1.2 0 010 2.4H8.5M13 16v-4h1a2 2 0 010 4zM17 12h-1.5v4M15.5 14H17" stroke-width="1.2"/>',
    vid: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    todo: '<rect x="3.5" y="4" width="6" height="6" rx="1.2"/><path d="M5 7l1.2 1.2L8.3 6M12.5 7H20M3.5 14h6v6h-6zM12.5 17H20"/>',
    olist: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5l1.5-1v5M3.8 13.2c.4-.8 2.4-.9 2.2.5-.1.7-2.2 1.9-2.2 2.8h2.4" stroke-width="1.4"/>',
    bring: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    react: '<path d="M12 21s-7-4.4-9-9.2C1.6 8.4 3.7 5 7 5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.3 0 5.4 3.4 4 6.8-2 4.8-9 9.2-9 9.2z"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    poll: '<path d="M4 6h10M4 12h16M4 18h7"/>',
    media: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/>',
    fix: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M10 3h4"/>',
    pdf: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h4"/>',
    notes: '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    linkI: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
    tpl: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9h17M9 9v11.5"/>',
    selin: '<rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke-dasharray="3 2.4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    eyedrop: '<path d="M14.5 4.5l5 5M17 2.5l4.5 4.5-3 3-4.5-4.5zM15 8L5.5 17.5 4 20l2.5-1.5L16 9"/>',
    veil: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9l5-5M4 15L15 4M4 20L20 4M10 20l10-10M16 20l4-4"/>',
    gamesI: '<path d="M7 9h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L14.5 15h-5l-1.1 1.8A3 3 0 0 1 3 15v-2a4 4 0 0 1 4-4z"/><path d="M8 11.5v3M6.5 13h3"/><circle cx="15.5" cy="12" r=".6"/><circle cx="17.5" cy="14" r=".6"/>',
    tableI: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.2 4.5v15M14.8 4.5v15"/>',
    kanbanI: '<rect x="3.5" y="4" width="5" height="14" rx="1.2"/><rect x="9.5" y="4" width="5" height="9" rx="1.2"/><rect x="15.5" y="4" width="5" height="11" rx="1.2"/>',
    kcardI: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M7.5 9.5h9M7.5 13h5"/><path d="M15 15.5l1.5 1.5 1.5-1.5"/>',
    dots4: '<circle cx="9" cy="9" r="1.6"/><circle cx="15" cy="9" r="1.6"/><circle cx="9" cy="15" r="1.6"/><circle cx="15" cy="15" r="1.6"/>',
    coinI: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5"/>',
    chartI: '<path d="M4 20h16"/><rect x="6" y="11" width="3" height="7" rx="1"/><rect x="11" y="6" width="3" height="12" rx="1"/><rect x="16" y="9" width="3" height="9" rx="1"/>',
    tags: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
    blurI: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 2.2"/><circle cx="12" cy="12" r="4"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>', rooms: '<rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/>',
    cloudI: '<path d="M7 18h10.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.3 9.1 4.5 4.5 0 0 0 7 18z"/>', openI: '<path d="M4 6h10M4 10h7"/><path d="M13 13.5h7v5h-4l-3 2.5z"/>',
    arrowEnd: '<path d="M4 12h15M14 7l5 5-5 5"/>', arrowBoth: '<path d="M5 12h14M9 7l-5 5 5 5M15 7l5 5-5 5"/>', arrowNone: '<path d="M4 12h16"/>'
  };
  SHAPE_KINDS.forEach(function (k) { if (!IC['sh_' + k]) IC['sh_' + k] = k === 'rect' ? IC.rect : k === 'round' ? IC.round : k === 'ellipse' ? IC.ellipse : '<polygon points="' + POLY[k].split(' ').map(function (p) { var a = p.split(','); return (2 + a[0] * 0.2).toFixed(1) + ',' + (2 + a[1] * 0.2).toFixed(1); }).join(' ') + '"/>'; });
  function svg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + '</svg>'; }

  /* ---------- connection ---------- */
  function join() {
    socket.emit('b:join', { boardId: BOARD_ID }, function (r) {
      if (r && r.needPassword) { askBoardPassword(r.title); return; }
      if (!r || r.error) { $('#errFull').textContent = (r && r.error) || 'Could not open the board'; $('#errFull').hidden = false; return; }
      var pwb = $('#pwGate'); if (pwb) pwb.remove();
      var first = !B;
      B = r.board; ME = r.me; PEOPLE = r.people; applyAccess(); ROSTER = r.roster || ROSTER; if (r.now) SKEW = r.now - Date.now();
      $('#notesBtn').hidden = false; renderLesson();
      if (r.palette) { MYPAL = r.palette; try { localStorage.setItem('klass.palette', JSON.stringify(MYPAL)); } catch (e) {} }
      if (r.palhide) { PALHIDE = r.palhide; try { localStorage.setItem('klass.palhide', JSON.stringify(PALHIDE)); } catch (e) {} }
      SHARE = r.share || null; $('#shareBtn').hidden = !SHARE; $('#balBtn').hidden = !(isT() && SHARE && SHARE.gid);
      if (isT()) $('#btitle').dataset.tip = 'Click to rename the board';
      $('#bringBtn').hidden = !isT(); $('#homeBtn').hidden = !!ME.guest || window.top !== window.self;
      buildTools(); markSeen(); renderPeople(); renderLog();
      if (first) fit();
      document.body.classList.toggle('canpick', !isT() && !!ME && !ME.guest); loadQuickLinks(); render(); renderModes(true); loadMyStars();
      if (first) openHashEl();
    });
  }
  // доска с паролем: спрашиваем один раз, потом платформа помнит
  function askBoardPassword(title) {
    if ($('#pwGate')) return;
    var g = document.createElement('div'); g.id = 'pwGate'; g.className = 'pwgate';
    g.innerHTML = '<form class="pwbox"><div class="label">Board password</div><h2>' + esc(title || 'Board') + '</h2><p>Your teacher protected this board. Enter the password once — next time it opens straight away.</p><input type="password" id="pwIn" autocomplete="off" placeholder="Password"><p class="err" id="pwErr"></p><button class="pb solid" type="submit">Open the board</button></form>';
    document.body.appendChild(g); $('#pwIn').focus();
    $('form', g).onsubmit = function (ev) {
      ev.preventDefault(); $('#pwErr').textContent = '';
      socket.emit('b:unlock', { boardId: BOARD_ID, password: $('#pwIn').value }, function (ok) { if (ok) { g.remove(); join(); } else { $('#pwErr').textContent = 'Wrong password'; $('#pwIn').select(); } });
    };
    $('#pwIn').addEventListener('keydown', function (ev) { ev.stopPropagation(); });
  }
  socket.on('connect', function () { $('#conn').hidden = true; join(); });
  socket.on('brand', function (b) { applyBrand(b); });
  socket.on('disconnect', function () { $('#conn').hidden = false; });
  socket.on('connect_error', function (e) { $('#conn').hidden = false; if (e && e.message === 'auth') location.href = '/'; });
  socket.on('b:people', function (p) { PEOPLE = p; renderPeople(); });
  socket.on('b:full', function (b) { var se = B && B.studentEdit; B = b; B.elements.forEach(noteFresh); sel = sel.filter(find); if (se !== B.studentEdit) buildTools(); render(); renderLog(); refreshPanels(); renderLesson(); renderModes(); });
  socket.on('b:upd', applyUpd);
  socket.on('b:drag', function (d) {
    if (drag && drag.ids && drag.ids.indexOf(d.id) >= 0) return;
    var el = $('#lc [data-id="' + d.id + '"]');
    if (el) { el.classList.add('remote'); el.style.left = d.x + 'px'; el.style.top = d.y + 'px'; }
  });
  socket.on('b:cursor', function (c) { cursors[c.sock] = Object.assign(c, { t: Date.now() }); drawCursors(); });
  socket.on('b:gone', function (s) { delete cursors[s]; drawCursors(); });
  socket.on('b:ink', function (d) {
    var r = remoteInk[d.id] || (remoteInk[d.id] = { pts: [], color: d.color, w: d.w, kind: d.kind, t: 0 });
    r.pts = r.pts.concat(d.pts); r.t = Date.now(); renderInk();
  });
  setInterval(function () {
    var now = Date.now(), ch = false;
    for (var k in cursors) if (now - cursors[k].t > 8000) { delete cursors[k]; ch = true; }
    for (var i in remoteInk) if (now - remoteInk[i].t > 5000) { delete remoteInk[i]; ch = true; }
    if (ch) { drawCursors(); renderInk(); }
  }, 2000);

  function viewOnly() { return !!(ME && ME.view && ME.role !== 't'); }
  function setStuView(on) {
    asStu = !!on; var c = $('#stuChip'); if (c) { c.classList.toggle('on', asStu); c.textContent = asStu ? '👁 Student view · back to teacher' : '👁 Student view'; }
    document.body.classList.toggle('stuview', asStu); render();
    if (asStu) toast('Games and cards now look as students see them. Actions still count as the teacher.');
  }
  function applyAccess() { document.body.classList.toggle('viewonly', viewOnly()); var c = $('#viewChip'); if (c) c.hidden = !viewOnly(); var sc = $('#stuChip'); if (sc) { sc.hidden = !isT(); sc.onclick = function () { setStuView(!asStu); }; } if (viewOnly() && typeof setTool === 'function') { try { setTool('select'); } catch (e) {} } }
  function op(o, cb) {
    if (viewOnly()) { toast('View only: the teacher has not given you editing rights'); if (cb) cb(false); return; }
    socket.emit('b:op', o, function (ok) {
      if (!ok && ['erase', 'spin', 'react', 'move', 'move-many', 'patch'].indexOf(o.t) < 0) toast('Not allowed or connection lost');
      if (cb) cb(ok);
    });
  }
  function find(id) { return B && B.elements.find(function (e) { return e.id === id; }); }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function colorOf(id) { if (id === 't') return '#EFA896'; var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; }
  function pushUndo(fn) { undoStack.push(fn); if (undoStack.length > 60) undoStack.shift(); }
  function undo() { var f = undoStack.pop(); if (f) f(); else toast('Nothing to undo'); }
  function markSeen() {
    B.elements.forEach(function (e) {
      if (e.type === 'wheel' && e.spin) seenSpin[e.id] = { at: e.spin.at, local: 0 };
      if (e.type === 'dice' && e.rolled) seenRoll[e.id] = { at: e.rolled.at, local: 0 };
    });
  }
  function noteFresh(e) {
    if (e.type === 'wheel' && e.spin && (!seenSpin[e.id] || seenSpin[e.id].at !== e.spin.at)) seenSpin[e.id] = { at: e.spin.at, local: Date.now() };
    if (e.type === 'dice' && e.rolled && (!seenRoll[e.id] || seenRoll[e.id].at !== e.rolled.at)) seenRoll[e.id] = { at: e.rolled.at, local: Date.now() };
  }
  function applyUpd(u) {
    if (!B) return;
    if (u.els) u.els.forEach(function (e) {
      noteFresh(e);
      var i = B.elements.findIndex(function (x) { return x.id === e.id; });
      if (i >= 0) B.elements[i] = e; else B.elements.push(e);
    });
    if (u.order) { var m = {}; B.elements.forEach(function (e) { m[e.id] = e; }); B.elements = u.order.map(function (id) { return m[id]; }).filter(Boolean); }
    if (u.del) { B.elements = B.elements.filter(function (e) { return u.del.indexOf(e.id) < 0; }); sel = sel.filter(find); }
    if (u.strokes) u.strokes.forEach(function (s) { if (!B.strokes.some(function (x) { return x.id === s.id; })) B.strokes.push(s); delete remoteInk[s.id]; });
    if (u.unstroke) B.strokes = B.strokes.filter(function (s) { return u.unstroke.indexOf(s.id) < 0; });
    if ('check' in u) B.check = u.check;
    if (u.meta) { B.title = u.meta.title; if ('bg' in u.meta) B.bg = u.meta.bg; if (u.meta.grid) B.grid = u.meta.grid; B.timer = u.meta.timer || null; B.anon = u.meta.anon || null; B.studentEdit = u.meta.studentEdit; B.copy = u.meta.copy; B.lesson = u.meta.lesson || null; B.exit = u.meta.exit || null; B.modules = u.meta.modules || []; if (!$('#navPanel').hidden && !navPick) renderNav(); B.rooms = u.meta.rooms || null; B.present = u.meta.present || null; renderLesson(); renderModes(); buildTools(); if (!$('#boardPanel').hidden) renderBoardPanel(); }
    if (u.log) { B.log = B.log || []; B.log.push(u.log); renderLog(); }
    if (u.strokes && !u.els && !u.del && !('check' in u)) { renderInk(); return; }
    scheduleRender();
  }
  // много учеников = много обновлений: перерисовываем доску не чаще одного раза за кадр
  var renderQueued = false;
  function scheduleRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(function () { renderQueued = false; render(); }); }
  function refreshPanels() { if (!$('#navPanel').hidden) renderNav(); if (!$('#props').hidden) renderProps(); }

  /* ---------- view ---------- */
  function applyView() {
    world.style.transform = 'translate(' + V.x + 'px,' + V.y + 'px) scale(' + V.z + ')';
    world.style.setProperty('--iz', String(Math.min(4, 1 / V.z)));
    var g = (B && B.grid === 'lines' ? 40 : 24) * V.z;
    vp.style.backgroundSize = g + 'px ' + g + 'px'; vp.style.backgroundPosition = V.x + 'px ' + V.y + 'px';
    drawCursors(); placeCtx(); scaleHandles();
    var zl = $('#zLvl'); if (zl) zl.textContent = Math.round(V.z * 100) + '%';
  }
  var ROT_TYPES = /^(image|shape|text|note|sticker|flip|deck|dice|zone|coin)$/;
  function canRotate(e) { return !!e && ROT_TYPES.test(e.type); }
  // рамка элемента без учёта поворота: размер из макета, центр — как у видимого прямоугольника
  function localBox(e) {
    var n = world.querySelector('[data-id="' + e.id + '"]:not(.lhit)'), b = boxOf(e);
    if (!n || !n.offsetWidth) return b;
    var w = n.offsetWidth, h = n.offsetHeight, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }
  function domBox(id) {
    var n = world.querySelector('[data-id="' + id + '"]:not(.lhit)'); if (!n) return null;
    var r = n.getBoundingClientRect(), vr = vp.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: (r.left - vr.left - V.x) / V.z, y: (r.top - vr.top - V.y) / V.z, w: r.width / V.z, h: r.height / V.z };
  }
  function lineBox(e) { var p = lineEnds(e); return { x: Math.min(p[0][0], p[1][0]), y: Math.min(p[0][1], p[1][1]), w: Math.abs(p[1][0] - p[0][0]) || 1, h: Math.abs(p[1][1] - p[0][1]) || 1 }; }
  function elBox(e) {
    if (e.type === 'line') return { x: Math.min(e.x, e.x2), y: Math.min(e.y, e.y2), w: Math.abs(e.x2 - e.x) || 1, h: Math.abs(e.y2 - e.y) || 1 };
    var c = e.type === 'card' || e.type === 'sticker' || e.type === 'dice';
    var w = e.w || e.size || 120, h = e.type === 'frame' ? (e.collapsed ? 4 : e.h) : (e.h || e.size || (e.type === 'scale' ? 140 : e.type === 'sentence' ? 60 : e.type === 'text' ? e.size * 1.4 : 50));
    return { x: c ? e.x - w / 2 : e.x, y: c ? e.y - h / 2 : e.y, w: w, h: h };
  }
  function boxOf(e) { return e.type === 'line' ? lineBox(e) : (domBox(e.id) || elBox(e)); }
  function union(boxes) {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    boxes.forEach(function (b) { if (!b) return; x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); });
    return x1 === Infinity ? null : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function bbox() { return union(B.elements.filter(function (e) { return !hiddenByCollapse(e); }).map(elBox)) || { x: 0, y: 0, w: 1600, h: 900 }; }
  function narrow() { return vp.clientWidth < 641; }
  function leftPad() { return narrow() ? 8 : 70; }
  function fitTo(r, maxZ) {
    var lp = leftPad(), w = vp.clientWidth - lp, h = vp.clientHeight - (narrow() ? 70 : 0) - 40;
    V.z = Math.max(0.05, Math.min(maxZ || 1.3, (w - 40) / r.w, (h - 60) / r.h));
    if (narrow() && V.z < 0.42) V.z = 0.42;
    V.x = lp + Math.max(10, (w - r.w * V.z) / 2) - r.x * V.z;
    V.y = 84 - r.y * V.z;
    applyView();
  }
  function fit() { fitTo(bbox()); }
  function zoomAt(f, cx, cy) {
    var r = vp.getBoundingClientRect();
    var px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
    var nz = Math.max(0.05, Math.min(5, V.z * f));
    V.x = px - (px - V.x) * nz / V.z; V.y = py - (py - V.y) * nz / V.z; V.z = nz;
    applyView();
  }
  function toWorld(cx, cy) { var r = vp.getBoundingClientRect(); return { x: (cx - r.left - V.x) / V.z, y: (cy - r.top - V.y) / V.z }; }
  function viewCenter() { var r = vp.getBoundingClientRect(); return toWorld(r.left + (r.width + leftPad()) / 2, r.top + r.height / 2.3); }
  vp.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (e.target.closest && e.target.closest('.ctx,.ctxpop,.pop,.zoombox')) return;
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    // колёсико мыши — масштаб (как в Miro), тачпад двумя пальцами — прокрутка, щипок — масштаб
    var mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(dy) >= 40 && Math.abs(dy) % 1 === 0 && !e.shiftKey);
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.01), e.clientX, e.clientY);
    else if (mouseWheel) zoomAt(Math.exp(-Math.max(-120, Math.min(120, dy)) * 0.0022), e.clientX, e.clientY);
    else { V.x -= e.shiftKey && !e.deltaX ? dy : e.deltaX; V.y -= e.shiftKey && !e.deltaX ? 0 : dy; applyView(); }
  }, { passive: false });
  /* интерфейс не должен «уезжать»: страницу не масштабирует браузер и её нельзя прокрутить */
  document.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (!vp.contains(e.target) && B) zoomAt(Math.exp(-Math.max(-60, Math.min(60, e.deltaY || 0)) * 0.01)); }
  }, { passive: false, capture: true });
  // Safari на Маке: щипок на тачпаде приходит как gesture-события, а не wheel+Ctrl
  /* iPad: во время письма не даём выделяться интерфейсу */
  document.addEventListener('selectstart', function (e) { var t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement); if (t && !t.closest('input,textarea,[contenteditable=true],[contenteditable=plaintext-only],.lbtext,.fed,.fw,.ntext,.btext')) e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { if (e.pointerType === 'touch' || e.pointerType === 'pen') e.preventDefault(); });
  var gLast = 1;
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      e.preventDefault();
      if (!B || pinch || Object.keys(ptrs).length || !vp.contains(e.target)) return;   // касания пальцами (iPad, iPhone) уже обрабатывает startPinch
      if (t === 'gesturestart') { gLast = 1; return; }
      if (t === 'gesturechange' && e.scale) { var f = e.scale / gLast; gLast = e.scale; if (f > 0.2 && f < 5) zoomAt(f, e.clientX || vp.clientWidth / 2, e.clientY || vp.clientHeight / 2); }
    }, { passive: false });
  });
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (/^(=|\+|-|_|0)$/.test(e.key) || /^(Equal|Minus|Digit0|NumpadAdd|NumpadSubtract|Numpad0)$/.test(e.code)) {
      e.preventDefault(); e.stopPropagation();
      if (!B) return;
      if (e.key === '0' || /0$/.test(e.code)) zoomAt(1 / V.z); else zoomAt(e.key === '-' || e.key === '_' || /Minus|Subtract/.test(e.code) ? 1 / 1.2 : 1.2);
    }
  }, true);
  function unscroll() {
    [document.scrollingElement, document.documentElement, document.body, $('#bapp'), vp].forEach(function (n) { if (n && (n.scrollTop || n.scrollLeft)) { n.scrollTop = 0; n.scrollLeft = 0; } });
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  }
  window.addEventListener('scroll', unscroll, true);
  document.addEventListener('scroll', unscroll, true);
  setInterval(unscroll, 1500);
  function measure() { document.documentElement.style.setProperty('--hh', ($('.hleft').offsetHeight + 10) + 'px'); }
  measure();
  window.addEventListener('resize', function () { measure(); if (B) applyView(); });

  /* ---------- frames & groups ---------- */
  function anchor(e) { return e.type === 'card' || e.type === 'sticker' || e.type === 'dice' ? [e.x, e.y] : [e.x + 8, e.y + 8]; }
  function inRect(p, f) { return p[0] >= f.x && p[0] <= f.x + f.w && p[1] >= f.y && p[1] <= f.y + f.h; }
  function frames() { return B.elements.filter(function (f) { return f.type === 'frame'; }); }
  function framesOf(e) { var a = anchor(e); return frames().filter(function (f) { return f !== e && inRect(a, f); }); }
  function hiddenByCollapse(e) { return framesOf(e).some(function (f) { return f.collapsed; }); }
  function mine(f) { return ME && f.owners && f.owners.some(function (o) { return o.id === ME.id; }); }
  function children(f) { return B.elements.filter(function (x) { return x !== f && inRect(anchor(x), f); }); }
  var soloG = null;   // группа, части которой правим по одной (двойной клик по части, Alt-перетаскивание или «Parts»)
  function expandGroups(ids) {
    var out = ids.slice(), gs = {};
    ids.forEach(function (id) { var e = find(id); if (e && e.g && e.g !== soloG) gs[e.g] = 1; });
    if (Object.keys(gs).length) B.elements.forEach(function (e) { if (e.g && gs[e.g] && out.indexOf(e.id) < 0) out.push(e.id); });
    return out;
  }

  /* ---------- permissions ---------- */
  function own(e) { return ME && e.by && e.by === ME.id; }
  // ученикам можно менять всё, что не заблокировано (если учитель не выключил это в настройках доски)
  function openEdit(e) { return !isT() && B && B.studentEdit !== false && e && !e.lock && e.type !== 'frame'; }
  function canMove(e) {
    if (!e) return false;
    if (isT()) return !e.lock;
    if (e.lock) return false;
    return (/^(note|sticker|image|media)$/.test(e.type) && own(e)) || e.type === 'card' || openEdit(e);
  }
  function canSelect(e) { return isT() || /^(note|image|sticker|media)$/.test(e.type) || openEdit(e); }
  function canStyle(e) { return isT() || (/^(note|image|sticker|media)$/.test(e.type) && own(e) && !e.lock) || openEdit(e); }
  function canDelete(e) { return isT() || (own(e) && /^(note|sticker|image|media)$/.test(e.type) && !e.lock) || openEdit(e); }
  function canEditText(e) { return isT() ? /^(text|note|shape|frame|zone|card)$/.test(e.type) : (/^(note|text|shape)$/.test(e.type) && (own(e) || openEdit(e)) && !e.lock); }
  function assignedToMe(e) { return ME && e.assign && e.assign.some(function (a) { return a.id === ME.id; }); }

  /* ---------- rendering ---------- */
  function tstyle(e) {
    var s = '';
    if (e.font) s += "font-family:'" + e.font + "',var(--uifont);";
    if (e.font === 'Unbounded' && !e.bold) s += 'font-weight:300;';
    if (e.fc) s += 'color:' + e.fc + ';';
    if (e.bold) s += 'font-weight:700;';
    if (e.italic) s += 'font-style:italic;';
    var d = []; if (e.underline) d.push('underline'); if (e.strike) d.push('line-through');
    if (d.length) s += 'text-decoration:' + d.join(' ') + ';';
    if (e.align && e.type !== 'note' && e.type !== 'shape') s += 'text-align:' + e.align + ';';
    return s;
  }
  // адреса в обычном тексте сразу становятся ссылками
  var URL_RE = /(^|[\s(«"])((?:https?:\/\/|www\.)[^\s<>"«»]+[^\s<>"«».,;:!?)])/g;
  function linkify(h) { return h.replace(URL_RE, function (m, pre, u) { var href = /^www\./.test(u) ? 'https://' + u : u; return pre + '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'; }); }
  function body(e) {
    if (e.masked) return '<span class="maskd" title="Hidden in private mode"><i></i><i></i><i></i></span>';
    var inner = e.html ? e.html.split(/(<a[\s>][\s\S]*?<\/a>)/i).map(function (seg, i) { return i % 2 ? seg : linkify(seg); }).join('') : linkify(esc(e.text || ''));
    return e.hl && inner ? '<span class="hlw" style="background:' + e.hl + '">' + inner + '</span>' : inner;
  }
  function noteFont(e) {
    if (e.size) return e.size;
    var L = Math.max(1, (e.text || '').length), base = Math.min(e.w, e.h) * 0.14;
    return Math.max(8, Math.round(base * Math.min(1, Math.sqrt(36 / L))));
  }
  var lockBadge = '<span class="lockb"><svg viewBox="0 0 24 24">' + IC.lock + '</svg></span>';
  function extras(e) {
    var s = '';
    if (e.lock && isT()) s += lockBadge;
    if ((e.tnote || e.tnimg) && isT()) s += '<span class="tnb' + (e.tnimg ? ' img' : '') + '" data-tnote="1" data-tip="' + esc((e.tnote || '') + (e.tnimg ? (e.tnote ? ' · ' : '') + '📷 ' + e.tnimg.length : '')) + '">' + (e.tnimg && !e.tnote ? '📷' : 'i') + '</span>';
    if (e.assign && e.assign.length) s += asgHtml(e);
    if (e.step && isT() && stepLead[e.id]) { var fr = framesOf(e)[0], hid = fr && fr.open != null && e.step > fr.open; s += '<span class="stepb' + (hid ? ' hid' : '') + '" title="' + (hid ? 'Hidden from students' : 'Open for students') + '">' + e.step + '</span>'; }
    return s;
  }

  // текст в коробке/карточке не должен обрезаться: уменьшаем шрифт, пока всё не поместится целыми словами
  function fitTexts() {
    // стикер сделали меньше, а шрифт задан — уменьшаем шрифт, чтобы текст не обрезался
    $$('.note .ntext, .shape .stext').forEach(function (n) {
      if (n.isContentEditable || !n.textContent.trim()) return;
      var fs = parseFloat(n.style.fontSize) || 16, min = Math.max(5, fs * 0.3), g = 0;
      while (n.scrollHeight > n.clientHeight + 1 && fs > min && g++ < 30) { fs *= 0.9; n.style.fontSize = fs.toFixed(1) + 'px'; }
    });
    $$('.bx.open .bxin, .dcard.face, .flip .face .fed').forEach(function (n) {
      if (n.isContentEditable) return;
      var box = n.classList.contains('fed') ? n.parentNode : n;
      n.style.fontSize = ''; var fs = parseFloat(getComputedStyle(n).fontSize), min = fs * 0.3, guard = 0;
      while ((box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) && fs > min && guard++ < 30) { fs *= 0.9; n.style.fontSize = fs + 'px'; }
    });
  }
  /* ---------- свой график: столбцы, полосы, линия, круг, кольцо ---------- */
  var CH_PAL = {
    brand: ['#C08A2E', '#7D8A68', '#D98E6F', '#8E7CC3', '#5E9AA8', '#E3AE35', '#A9B183', '#C2412D'],
    pastel: ['#F6CF6A', '#F2B9A0', '#CDBFE3', '#B8DCCB', '#A7C7F2', '#FFB5C5', '#EFD9B4', '#C9CFAE'],
    bold: ['#2F6FE0', '#C2412D', '#2E8B57', '#E3AE35', '#8E44AD', '#D0657A', '#3C8D93', '#B05B3B'],
    mono: ['#2E2F25', '#4A4B3F', '#6B6C5D', '#8C8D7C', '#ADAE9C', '#C9CAB9', '#3B3A33', '#5A594F']
  };
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function fmtNum(v, u) { var r = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : String(Math.round(v * 100) / 100); return r + (u || ''); }
  function chartSvg(e) {
    var W = e.w, H = Math.max(80, e.h - (e.title ? e.w * 0.075 + 14 : 10)), rows = e.rows || [], pal = CH_PAL[e.pal] || CH_PAL.brand, fs = Math.max(9, Math.min(W, H) * 0.045), dark = e.bg && isDark(e.bg.a);
    var ink = dark ? '#FFFDF6' : '#2E2F25', mut = dark ? 'rgba(255,253,246,.7)' : '#8A8576', grid = dark ? 'rgba(255,255,255,.18)' : 'rgba(46,47,37,.1)';
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="font-family:var(--uifont)">';
    if (!rows.length) return s + '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" font-size="' + fs + '" fill="' + mut + '">Add data in More settings</text></svg>';
    var T = function (x, y, t, o) { o = o || {}; return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + (o.fs || fs) + '" fill="' + (o.c || ink) + '" text-anchor="' + (o.a || 'middle') + '"' + (o.w ? ' font-weight="' + o.w + '"' : '') + '>' + esc(t) + '</text>'; };
    var short = function (t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
    if (e.kind === 'pie' || e.kind === 'donut') {
      var tot = rows.reduce(function (a, r) { return a + Math.max(0, r.v); }, 0) || 1, legW = W > H * 1.25 ? W * 0.38 : 0;
      var R = Math.min((W - legW) / 2, H / 2) * 0.86, cx = (W - legW) / 2, cy = H / 2, a0 = -Math.PI / 2;
      rows.forEach(function (r, i) {
        var f = Math.max(0, r.v) / tot, a1 = a0 + f * Math.PI * 2, c = pal[i % pal.length];
        if (f >= 0.9999) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + c + '"/>';
        else if (f > 0) { var lg = f > 0.5 ? 1 : 0; s += '<path d="M' + cx + ' ' + cy + 'L' + (cx + R * Math.cos(a0)).toFixed(1) + ' ' + (cy + R * Math.sin(a0)).toFixed(1) + 'A' + R + ' ' + R + ' 0 ' + lg + ' 1 ' + (cx + R * Math.cos(a1)).toFixed(1) + ' ' + (cy + R * Math.sin(a1)).toFixed(1) + 'Z" fill="' + c + '" stroke="' + (dark ? '#2E2F25' : '#FFFDF8') + '" stroke-width="2"/>'; }
        if (f > 0.06 && e.vals) { var am = (a0 + a1) / 2, rr = e.kind === 'donut' ? R * 0.78 : R * 0.62; s += T(cx + rr * Math.cos(am), cy + rr * Math.sin(am) + fs * 0.35, Math.round(f * 100) + '%', { c: isDark(c) ? '#fff' : '#2E2F25', w: 700, fs: fs * 0.95 }); }
        a0 = a1;
      });
      if (e.kind === 'donut') s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.55) + '" fill="' + (dark ? 'rgba(0,0,0,.25)' : '#FFFDF8') + '"/>' + (e.unit === '%' ? '' : T(cx, cy + fs * 0.4, fmtNum(tot, e.unit), { fs: fs * 1.5, w: 700 }) + T(cx, cy + fs * 1.6, 'total', { fs: fs * 0.8, c: mut }));
      var ly = legW ? cy - rows.length * fs * 0.8 : 0;
      if (legW) rows.forEach(function (r, i) { var y = ly + i * fs * 1.6; s += '<rect x="' + (W - legW + 8) + '" y="' + (y - fs * 0.75) + '" width="' + fs * 0.9 + '" height="' + fs * 0.9 + '" rx="' + fs * 0.2 + '" fill="' + pal[i % pal.length] + '"/>' + T(W - legW + 8 + fs * 1.4, y, short(r.l, 22) + (e.vals ? ' · ' + fmtNum(r.v, e.unit) : ''), { a: 'start', fs: fs * 0.9 }); });
      return s + '</svg>';
    }
    var vmax = niceMax(Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([0]))), vmin = Math.min(0, Math.min.apply(null, rows.map(function (r) { return r.v; })));
    if (vmin < 0) vmin = -niceMax(-vmin);
    var span = vmax - vmin || 1;
    if (e.kind === 'hbar') {
      var L = Math.min(W * 0.35, Math.max.apply(null, rows.map(function (r) { return String(r.l).length; })) * fs * 0.55 + 10), top = 6, bh = (H - top - fs * 1.6) / rows.length;
      for (var k = 0; k <= 4; k++) { var gx = L + (W - L - 16) * k / 4; s += '<line x1="' + gx + '" x2="' + gx + '" y1="' + top + '" y2="' + (H - fs * 1.4) + '" stroke="' + grid + '"/>' + T(gx, H - 2, fmtNum(vmin + span * k / 4, ''), { c: mut, fs: fs * 0.8 }); }
      rows.forEach(function (r, i) {
        var y = top + i * bh + bh * 0.15, x0 = L + (W - L - 16) * (0 - vmin) / span, x1 = L + (W - L - 16) * (r.v - vmin) / span, c = pal[i % pal.length];
        s += '<rect x="' + Math.min(x0, x1).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, Math.abs(x1 - x0)).toFixed(1) + '" height="' + (bh * 0.7).toFixed(1) + '" rx="' + Math.min(6, bh * 0.2) + '" fill="' + c + '"/>' + T(L - 6, y + bh * 0.35 + fs * 0.35, short(r.l, 26), { a: 'end', fs: fs * 0.9 });
        if (e.vals) s += T(Math.max(x0, x1) + 5, y + bh * 0.35 + fs * 0.35, fmtNum(r.v, e.unit), { a: 'start', fs: fs * 0.85, w: 600 });
      });
      return s + '</svg>';
    }
    var lm = fs * 3, bm = fs * 2.2, tm = fs * 1.4, cw = W - lm - 10, chh = H - bm - tm, Y = function (v) { return tm + chh * (1 - (v - vmin) / span); };
    for (var j = 0; j <= 4; j++) { var gv = vmin + span * j / 4, gy = Y(gv); s += '<line x1="' + lm + '" x2="' + (W - 6) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="' + grid + '"/>' + T(lm - 6, gy + fs * 0.3, fmtNum(gv, ''), { a: 'end', c: mut, fs: fs * 0.8 }); }
    var step = cw / rows.length, every = Math.ceil(rows.length / Math.max(1, Math.floor(cw / (fs * 5))));
    if (e.kind === 'line') {
      var pts = rows.map(function (r, i) { return [lm + step * (i + 0.5), Y(r.v)]; }), c0 = pal[0];
      s += '<path d="M' + pts[0][0] + ' ' + Y(Math.max(vmin, 0)) + pts.map(function (p) { return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('') + 'L' + pts[pts.length - 1][0] + ' ' + Y(Math.max(vmin, 0)) + 'Z" fill="' + c0 + '" opacity=".14"/>';
      s += '<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="' + c0 + '" stroke-width="' + Math.max(2, fs * 0.22) + '" stroke-linejoin="round" stroke-linecap="round"/>';
      pts.forEach(function (p, i) { s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + Math.max(3, fs * 0.3) + '" fill="' + (dark ? '#2E2F25' : '#fff') + '" stroke="' + c0 + '" stroke-width="2"/>'; if (e.vals) s += T(p[0], p[1] - fs * 0.7, fmtNum(rows[i].v, e.unit), { fs: fs * 0.82, w: 600 }); });
    } else {
      rows.forEach(function (r, i) {
        var x = lm + step * i + step * 0.17, bw = step * 0.66, y0 = Y(0), y1 = Y(r.v), c = pal[i % pal.length];
        s += '<rect x="' + x.toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, Math.abs(y1 - y0)).toFixed(1) + '" rx="' + Math.min(8, bw * 0.18) + '" fill="' + c + '"/>';
        if (e.vals) s += T(x + bw / 2, Math.min(y0, y1) - fs * 0.35, fmtNum(r.v, e.unit), { fs: fs * 0.82, w: 600 });
      });
    }
    rows.forEach(function (r, i) { if (i % every === 0) s += T(lm + step * (i + 0.5), H - fs * 0.7, short(r.l, Math.max(4, Math.floor(step * every / (fs * 0.55)))), { fs: fs * 0.85 }); });
    return s + '</svg>';
  }
  /* ---------- таблица ---------- */
  function tableHtml(e, xs, to) {
    var h = '<div class="tbl' + (e.head ? ' head' : '') + (to || '') + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;height:' + e.h + 'px;font-size:' + (e.size || 18) + 'px;' + (e.lc ? '--tl:' + e.lc + ';' : '') + '">' +
      (e.title ? '<div class="ttitle" data-ed="title">' + esc(e.title) + '</div>' : '') +
      '<div class="tgrid" style="grid-template-columns:' + e.cols.map(function (v) { return v + 'px'; }).join(' ') + ';grid-template-rows:' + e.rows.map(function (v) { return v + 'px'; }).join(' ') + '">';
    e.rows.forEach(function (_, r) { e.cols.forEach(function (__, c) { var t = (e.cells[r] || [])[c] || ''; h += '<div class="tc' + (e.head && r === 0 ? ' th' : '') + '" data-ed="cells.' + r + '.' + c + '">' + esc(t) + '</div>'; }); });
    return h + '</div>' + xs + '</div>';
  }
  var TBLPOS = null;
  function tableEdit(e, fn) { var t = clone({ cols: e.cols, rows: e.rows, cells: e.cells }); fn(t); patchSel(function () { return t; }, [e.id]); }
  /* ---------- канбан и раскрывающиеся карточки ---------- */
  var PRIO = { low: ['Low', '#7FB77E'], med: ['Medium', '#E3AE35'], high: ['High', '#D9534F'] }, KSTAT = ['Not Started', 'In Progress', 'Complete'], KSTC = { 'Not Started': '#D9D9D6', 'In Progress': '#B5CBF5', 'Complete': '#A9DFB1' };
  function kMeta(c) {
    var m = '';
    if (c.prio && PRIO[c.prio]) m += '<span class="kmc" style="--c:' + PRIO[c.prio][1] + '">' + PRIO[c.prio][0] + '</span>';
    if (c.who) m += '<span class="kmw">👤 ' + esc(c.who) + '</span>';
    if (c.start || c.end) m += '<span class="kmw">📅 ' + esc([c.start, c.end].filter(Boolean).map(function (d) { return d.slice(5).split('-').reverse().join('.'); }).join(' – ')) + '</span>';
    (c.tags || []).forEach(function (t) { m += '<span class="kmt">#' + esc(t) + '</span>'; });
    return m ? '<div class="kmeta">' + m + '</div>' : '';
  }
  function kanbanHtml(e, xs, to) {
    var canE = isT() || canStyle(e);
    var h = '<div class="kanban' + (to || '') + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px">' + (e.title ? '<div class="kbtitle" data-ed="title">' + esc(e.title) + '</div>' : '') +
      '<div class="kbcols" style="grid-template-columns:repeat(' + e.cols.length + ',minmax(0,1fr))">';
    e.cols.forEach(function (col) {
      var cs = e.cards.filter(function (c) { return c.col === col.id; });
      h += '<div class="kbcol" data-kcol="' + col.id + '"><div class="kbh"><span class="kbchip" style="background:' + col.color + '"' + (isT() ? ' data-kcolm="' + col.id + '"' : '') + '>' + esc(col.name || 'Column') + '</span><span class="kbn">' + cs.length + '</span></div>' +
        cs.map(function (c) { return '<div class="kbc" data-kc="' + c.id + '"' + (c.color ? ' style="border-top:4px solid ' + c.color + '"' : '') + '><div class="kbct' + (c.title ? '' : ' ph') + '">' + esc(c.title || 'Type something') + '</div>' + (c.desc ? '<div class="kbcd">' + esc(c.desc.slice(0, 140)) + '</div>' : '') + kMeta(c) + '</div>'; }).join('') +
        (canE ? '<button class="kbadd" data-kadd="' + col.id + '" type="button">＋ Add card</button>' : '') + '</div>';
    });
    return h + '</div>' + (isT() ? '<button class="kbaddcol" data-kaddcol="1" type="button" data-tip="Add a column">＋</button>' : '') + xs + '</div>';
  }
  var KEXP = {};
  function kcardHtml(e, xs, to) {
    var open = !!KEXP[e.id], st = e.status || 'Not Started';
    return '<div class="kcard' + (open ? ' open' : '') + (to || '') + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px' + (e.color ? ';border-top:5px solid ' + e.color : '') + '">' +
      '<div class="kch"><button class="kexp" data-kexp="1" type="button" aria-label="Expand">' + (open ? '▾' : '▸') + '</button><span class="kct">' + esc(e.title || 'Untitled') + '</span><span class="kbchip sm" style="background:' + (KSTC[st] || '#D9D9D6') + '">' + esc(st) + '</span></div>' +
      (open ? '<div class="kcb">' + (e.desc ? '<div class="kcd">' + esc(e.desc) + '</div>' : '<div class="kcd ph">No description</div>') + kMeta(e) + '<button class="kedit" data-kedit="1" type="button">Edit details</button></div>' : kMeta(e)) + xs + '</div>';
  }
  // окно карточки: заголовок, описание, статус, приоритет, исполнитель, даты, теги
  // карточка открывается большой панелью справа (как в Miro): крупное поле для текста, поля слева подписаны
  function kCardDialog(el, cardId, anchor) {
    var isKb = el.type === 'kanban', c = isKb ? el.cards.find(function (x) { return x.id === cardId; }) : el; if (!c) return;
    closeCtxPop(); var old = $('#kPanel'); if (old) old.remove();
    var canE = isT() || canStyle(el), dis = canE ? '' : ' disabled';
    var stOpts = isKb ? el.cols.map(function (k) { return '<option value="' + k.id + '"' + (k.id === c.col ? ' selected' : '') + '>' + esc(k.name) + '</option>'; }).join('') : KSTAT.map(function (k) { return '<option' + ((el.status || 'Not Started') === k ? ' selected' : '') + '>' + k + '</option>'; }).join('');
    var names = ROSTER.map(function (r) { return '<option value="' + esc(r.name) + '">'; }).join('');
    var row = function (ic, label, ctl) { return '<div class="kprow"><span class="kpl">' + ic + ' ' + label + '</span>' + ctl + '</div>'; };
    var pn = document.createElement('div'); pn.id = 'kPanel'; pn.className = 'kpanel';
    pn.innerHTML = '<div class="kphead"><span class="kpico">' + svg(isKb ? 'kanbanI' : 'kcardI') + '</span><input class="kpt" id="kdT" placeholder="Add a title…" value="' + esc(c.title || '') + '"' + dis + '>' +
      '<button class="kpbtn" data-kp="wide" type="button" data-tip="Wider / narrower">⤢</button><button class="kpbtn" data-kp="close" type="button" aria-label="Close">×</button></div>' +
      '<div class="kpbody">' +
      row('☰', 'Description', '<textarea id="kdD" placeholder="Add a description. Use - or 1. to start a list."' + dis + '>' + esc(c.desc || '') + '</textarea>') +
      row('◎', 'Status', '<select id="kdS"' + dis + '>' + stOpts + '</select>') +
      row('⌃', 'Priority', '<select id="kdP"' + dis + '>' + [['', '—'], ['low', 'Low'], ['med', 'Medium'], ['high', 'High']].map(function (o) { return '<option value="' + o[0] + '"' + ((c.prio || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>') +
      row('👤', 'Assignee', '<input id="kdW" list="kdWl" placeholder="—" value="' + esc(c.who || '') + '"' + dis + '><datalist id="kdWl">' + names + '</datalist>') +
      row('📅', 'Start date', '<input type="date" id="kdA" value="' + esc(c.start || '') + '"' + dis + '>') +
      row('📅', 'End date', '<input type="date" id="kdB" value="' + esc(c.end || '') + '"' + dis + '>') +
      row('#', 'Tags', '<input id="kdG" placeholder="grammar, homework" value="' + esc((c.tags || []).join(', ')) + '"' + dis + '>') +
      row('●', 'Colour', '<div class="kdc">' + ['', '#E3AE35', '#D9534F', '#2F6FE0', '#2E8B57', '#8E44AD'].map(function (k) { return '<button class="sw' + ((c.color || '') === k ? ' cur' : '') + '" data-kclr="' + k + '" type="button" style="--c:' + (k || 'transparent') + (k ? '' : ';box-shadow:inset 0 0 0 1px #aaa') + '"' + dis + '></button>'; }).join('') + '</div>') +
      '</div>' + (canE ? '<div class="kpfoot"><span class="hint">Saved when you close the panel</span>' + (isKb ? '<button class="cb" data-kp="del" type="button" style="color:#C2412D">Delete card</button>' : '') + '<button class="pb solid" data-kp="save" type="button">Done</button></div>' : '');
    document.body.appendChild(pn);
    var ta = $('#kdD', pn), clr = null;
    function grow() { ta.style.height = 'auto'; ta.style.height = Math.max(220, ta.scrollHeight + 4) + 'px'; }
    grow(); ta.addEventListener('input', grow);
    // «- » и «1. » в описании продолжают список по Enter
    ta.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' || ev.shiftKey) return;
      var v = ta.value, i = ta.selectionStart, ls = v.lastIndexOf('\n', i - 1) + 1, line = v.slice(ls, i), m = /^(\s*)(- |• |(\d+)\. )/.exec(line);
      if (!m) return;
      ev.preventDefault();
      if (line.trim() === m[2].trim()) { ta.value = v.slice(0, ls) + v.slice(i); ta.selectionStart = ta.selectionEnd = ls; grow(); return; }
      var next = m[3] ? (Number(m[3]) + 1) + '. ' : m[2];
      ta.value = v.slice(0, i) + '\n' + m[1] + next + v.slice(i); ta.selectionStart = ta.selectionEnd = i + 1 + m[1].length + next.length; grow();
    });
    var start = JSON.stringify(read());
    function read() { return { title: $('#kdT', pn).value.trim(), desc: ta.value, prio: $('#kdP', pn).value, who: $('#kdW', pn).value.trim(), start: $('#kdA', pn).value, end: $('#kdB', pn).value, tags: $('#kdG', pn).value.split(',').map(function (t) { return t.trim(); }).filter(Boolean), color: clr != null ? clr : (c.color || ''), st: $('#kdS', pn).value }; }
    function save() {
      if (!canE) return; var d = read(); if (JSON.stringify(d) === start) return;
      var st = d.st; delete d.st;
      if (isKb) { d.col = st; patchSel(function (x) { return { cards: x.cards.map(function (k) { return k.id === cardId ? Object.assign({}, k, d) : k; }) }; }, [el.id]); }
      else { d.status = st; patchSel(function () { return d; }, [el.id]); }
      start = JSON.stringify(read());
    }
    function close() { save(); pn.remove(); document.removeEventListener('keydown', esc1, true); }
    function esc1(ev) { if (ev.key === 'Escape' && document.body.contains(pn)) { ev.stopPropagation(); close(); } }
    document.addEventListener('keydown', esc1, true);
    pn.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
    pn.addEventListener('click', function (ev) {
      var k = ev.target.closest('[data-kclr]'); if (k && canE) { clr = k.dataset.kclr; $$('[data-kclr]', pn).forEach(function (b2) { b2.classList.toggle('cur', b2 === k); }); return; }
      var b = ev.target.closest('[data-kp]'); if (!b) return;
      if (b.dataset.kp === 'close' || b.dataset.kp === 'save') close();
      else if (b.dataset.kp === 'wide') pn.classList.toggle('wide');
      else if (b.dataset.kp === 'del') { if (!confirm('Delete this card?')) return; patchSel(function (x) { return { cards: x.cards.filter(function (k2) { return k2.id !== cardId; }) }; }, [el.id]); pn.remove(); document.removeEventListener('keydown', esc1, true); }
    });
    $$('input,textarea,select', pn).forEach(function (i) { i.addEventListener('keydown', function (ev) { if (ev.key !== 'Escape') ev.stopPropagation(); }); });
    if (canE) setTimeout(function () { var t = $('#kdT', pn); if (t && !t.value) t.focus(); else ta.focus(); }, 30);
  }
  function kColMenu(el, colId, anchor) {
    var col = el.cols.find(function (k) { return k.id === colId; }); if (!col) return;
    ctxPop('<button class="mi" data-v="ren" type="button">Rename</button><div class="dcols" style="padding:4px 8px">' + ['#D9D9D6', '#B5CBF5', '#A9DFB1', '#F6CF6A', '#F2B9A0', '#CDBFE3', '#FFC2CF'].map(function (k) { return '<button class="sw" data-v="c' + k + '" style="--c:' + k + '" type="button"></button>'; }).join('') + '</div><button class="mi" data-v="left" type="button">Move left</button><button class="mi" data-v="right" type="button">Move right</button><button class="mi" data-v="del" type="button" style="color:#C2412D">Delete column</button>', anchor, function (v) {
      var cols = clone(el.cols), i = cols.findIndex(function (k) { return k.id === colId; }), cards = el.cards;
      if (v === 'ren') { var nm = prompt('Column name', col.name); if (!nm || !nm.trim()) return; cols[i].name = nm.trim(); }
      else if (v[0] === 'c') cols[i].color = v.slice(1);
      else if (v === 'left' && i > 0) { var t = cols[i]; cols[i] = cols[i - 1]; cols[i - 1] = t; }
      else if (v === 'right' && i < cols.length - 1) { var t2 = cols[i]; cols[i] = cols[i + 1]; cols[i + 1] = t2; }
      else if (v === 'del') { if (cols.length < 2) { toast('A kanban needs at least one column'); return; } if (!confirm('Delete the column “' + col.name + '”? Its cards move to the first column.')) return; cols.splice(i, 1); cards = cards.map(function (k) { return k.col === colId ? Object.assign({}, k, { col: cols[0].id }) : k; }); }
      patchSel(function () { return { cols: cols, cards: cards }; }, [el.id]);
    }, false, 'menu');
  }
  // нажатия внутри канбана и карточки: свои, не двигают весь элемент
  var kDrag = null;
  function kanbanDown(ev, el) {
    var t = ev.target, canE = isT() || canStyle(el);
    if (el.type === 'kcard') {
      if (t.closest('[data-kexp]')) { KEXP[el.id] = !KEXP[el.id]; render(); return true; }
      if (t.closest('[data-kedit]')) { var kb0 = t.closest('[data-kedit]'); setTimeout(function () { kCardDialog(find(el.id) || el, null, kb0); }, 0); return true; }
      return false;
    }
    var add = t.closest('[data-kadd]'); if (add && canE) { var nc = { id: rid(), col: add.dataset.kadd, title: '' }; patchSel(function (x) { return { cards: x.cards.concat(nc) }; }, [el.id]); setTimeout(function () { var n = world.querySelector('[data-kc="' + nc.id + '"]'); var e2 = find(el.id); if (n && e2) kCardDialog(e2, nc.id, n); }, 250); return true; }
    if (t.closest('[data-kaddcol]')) { var nm = prompt('Column name', 'New column'); if (nm && nm.trim()) patchSel(function (x) { return { cols: x.cols.concat({ id: rid(), name: nm.trim(), color: '#F6CF6A' }), w: Math.round(x.w * (x.cols.length + 1) / x.cols.length) }; }, [el.id]); return true; }
    var cm = t.closest('[data-kcolm]'); if (cm) { setTimeout(function () { kColMenu(el, cm.dataset.kcolm, cm); }, 0); return true; }
    var kc = t.closest('[data-kc]'); if (!kc) return false;
    kDrag = { el: el.id, id: kc.dataset.kc, node: kc, sx: ev.clientX, sy: ev.clientY, moved: false, canE: canE };
    return true;
  }
  window.addEventListener('pointermove', function (ev) {
    if (!kDrag) return;
    if (!kDrag.moved && Math.abs(ev.clientX - kDrag.sx) + Math.abs(ev.clientY - kDrag.sy) < 6) return;
    if (!kDrag.canE) return;
    if (!kDrag.moved) { kDrag.moved = true; kDrag.node.classList.add('kdrag'); }
    kDrag.node.style.transform = 'translate(' + (ev.clientX - kDrag.sx) / V.z + 'px,' + (ev.clientY - kDrag.sy) / V.z + 'px) rotate(2deg)';
    $$('.kbcol.hot').forEach(function (n) { n.classList.remove('hot'); });
    var col = document.elementsFromPoint(ev.clientX, ev.clientY).map(function (n) { return n.closest && n.closest('.kbcol'); }).find(Boolean); if (col) col.classList.add('hot');
  });
  window.addEventListener('pointerup', function (ev) {
    if (!kDrag) return; var d = kDrag; kDrag = null;
    $$('.kbcol.hot').forEach(function (n) { n.classList.remove('hot'); });
    var el = find(d.el); if (!el) return;
    if (!d.moved) { kCardDialog(el, d.id, d.node); return; }
    var col = document.elementsFromPoint(ev.clientX, ev.clientY).map(function (n) { return n.closest && n.closest('.kbcol'); }).find(Boolean);
    var to = col && col.closest('[data-id]') && col.closest('[data-id]').dataset.id === el.id ? col.dataset.kcol : null;
    if (!to) { render(); return; }
    // место в колонке: перед карточкой, над серединой которой отпустили
    var others = $$('.kbc', col).filter(function (n) { return n.dataset.kc !== d.id; }), before = others.find(function (n) { var r = n.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
    patchSel(function (x) {
      var card = Object.assign({}, x.cards.find(function (k) { return k.id === d.id; }), { col: to }), rest = x.cards.filter(function (k) { return k.id !== d.id; });
      var at = before ? rest.findIndex(function (k) { return k.id === before.dataset.kc; }) : -1;
      if (at < 0) rest.push(card); else rest.splice(at, 0, card);
      return { cards: rest };
    }, [el.id]);
  });
  function chartHtml(e, xs) {
    return '<div class="chart' + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;height:' + e.h + 'px">' + (e.title ? '<div class="chtitle" data-ed="title" style="font-size:' + (e.w * 0.045).toFixed(1) + 'px">' + esc(e.title) + '</div>' : '') + chartSvg(e) + xs + '</div>';
  }

  /* ---------- поворот и размытие ---------- */
  function fxPop(e, btn) {
    var ids = sel.slice(), rot = e.rot || 0, bl = e.blur || 0, canR = ids.map(find).every(canRotate);
    var p = ctxPop((canR ? '<div class="lbl">Rotate <span class="slv" id="fxRv">' + rot + '°</span></div><input class="sl" type="range" min="-180" max="180" step="1" value="' + rot + '" id="fxR"><div class="trow"><button class="cb" data-v="r-90" type="button">↺ 90°</button><button class="cb" data-v="r0" type="button">0°</button><button class="cb" data-v="r90" type="button">↻ 90°</button></div>' : '') +
      '<div class="lbl">Blur <span class="slv" id="fxBv">' + bl + '</span></div><input class="sl" type="range" min="0" max="30" step="1" value="' + bl + '" id="fxB"><div class="trow"><button class="cb" data-v="b12" type="button">Blur it</button><button class="cb" data-v="b0" type="button">Clear</button></div>' +
      '<p class="hint" style="margin:4px 0 0;max-width:230px">Tip: blur a picture, let students guess, then clear it. You can also rotate with the round handle above the item.</p>', btn, function (v) {
        if (v[0] === 'r') setFx({ rot: v === 'r0' ? 0 : ((rot + Number(v.slice(1)) + 540) % 360) - 180 });
        if (v[0] === 'b') setFx({ blur: Number(v.slice(1)) });
      }, true);
    var live = function (k, val) { ids.forEach(function (id) { var x = find(id); if (x) x[k] = val || 0; }); applyFx(); };
    var r = $('#fxR', p), bb = $('#fxB', p);
    if (r) { r.oninput = function () { $('#fxRv', p).textContent = this.value + '°'; live('rot', Number(this.value)); renderSel(); }; r.onchange = function () { setFx({ rot: Number(this.value) }); }; }
    bb.oninput = function () { $('#fxBv', p).textContent = this.value; live('blur', Number(this.value)); }; bb.onchange = function () { setFx({ blur: Number(this.value) }); };
    function setFx(o) {
      if ('rot' in o) { rot = o.rot; if (r) { r.value = rot; $('#fxRv', p).textContent = rot + '°'; } }
      if ('blur' in o) { bl = o.blur; bb.value = bl; $('#fxBv', p).textContent = bl; }
      patchSel(function () { var q = {}; if ('rot' in o) q.rot = o.rot || null; if ('blur' in o) q.blur = o.blur || null; return q; }, ids);
    }
  }
  /* ---------- цвет и градиент для виджетов ---------- */
  function bgCss(e) { var g = e && e.bg; if (!g || !g.a) return ''; return g.b ? 'linear-gradient(' + (g.ang == null ? 135 : g.ang) + 'deg,' + g.a + ',' + g.b + ')' : g.a; }
  var GRADS = [['#DCDDC6', '#F8D270'], ['#F6CF6A', '#F2B9A0'], ['#F2B9A0', '#CDBFE3'], ['#B8DCCB', '#A7C7F2'], ['#CDBFE3', '#A7C7F2'], ['#FFE38A', '#FFB5C5'], ['#2E2F25', '#5B4BC4'], ['#1F3B57', '#3C8D93'], ['#C2412D', '#F6CF6A'], ['#FFFFFF', '#EFE3C4']];
  var BG_SOLID = ['#FFFDF8', '#FFF1C2', '#F6CF6A', '#F2B9A0', '#FFB5C5', '#CDBFE3', '#A7C7F2', '#B8DCCB', '#C9CFAE', '#EFD9B4', '#2E2F25', '#1F3B57'];
  // поворот и размытие — поверх обычной отрисовки
  var fxNodes = [];
  function applyFx() {
    fxNodes.forEach(function (n) { n.style.rotate = ''; n.style.filter = ''; }); fxNodes = [];
    B.elements.forEach(function (e) {
      if (!e.rot && !e.blur) return;
      $$('[data-id="' + e.id + '"]', world).forEach(function (n) {
        if (n.closest('#lsel') || n.classList.contains('lhit')) return;
        if (e.rot && canRotate(e)) n.style.rotate = e.rot + 'deg';
        if (e.blur) n.style.filter = 'blur(' + e.blur + 'px)';
        fxNodes.push(n);
      });
    });
  }
  function applyBgs() {
    B.elements.forEach(function (e) {
      // обводка
      if (e.ow || e._ow) { var on = world.querySelector('[data-id="' + e.id + '"]:not(.lhit)'); if (on) { on.style.outline = e.ow ? e.ow + 'px solid ' + (e.oc || '#2E2F25') : ''; on.style.outlineOffset = e.ow ? '0px' : ''; } }
      if (!/^(deck|boxes|cloud|open|todo|poll|rating|frame|card|zone|chart|table|kanban|kcard)$/.test(e.type) && !isGame(e)) return;
      var css = bgCss(e);
      $$('[data-id="' + e.id + '"]', world).forEach(function (n) {
        if (!n.classList.contains(e.type === 'open' ? 'cloud' : e.type === 'table' ? 'tbl' : isGame(e) ? 'game' : e.type)) return;
        n.classList.toggle('hasbg', !!css); n.classList.toggle('bgdark', !!css && isDark(e.bg.a) && (!e.bg.b || isDark(e.bg.b)));
        if (css) n.style.setProperty('--wbg', css); else n.style.removeProperty('--wbg');
        if (e.type === 'cloud' || e.type === 'open') {
          var sv = $('.cshape', n), gid = 'cg_' + e.id; if (!sv) return;
          var df = sv.querySelector('defs'); if (!df) { df = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); sv.insertBefore(df, sv.firstChild); }
          df.innerHTML = css ? '<linearGradient id="' + gid + '" gradientTransform="rotate(' + (((e.bg.ang == null ? 135 : e.bg.ang) - 90)) + ' .5 .5)"><stop offset="0" stop-color="' + e.bg.a + '"/><stop offset="1" stop-color="' + (e.bg.b || e.bg.a) + '"/></linearGradient>' : '';
          $('path', sv).style.fill = css ? 'url(#' + gid + ')' : '';
        }
      });
    });
  }
  function bgPop(e, btn) {
    var g = e.bg || {}, a = g.a || '#F6CF6A', b2 = g.b || '#F2B9A0', ang = g.ang == null ? 135 : g.ang;
    var p = ctxPop('<div class="lbl">Colour</div><div class="dcols">' + BG_SOLID.concat(myPalette()).map(function (c) { return '<button class="sw" data-v="s' + c + '" style="--c:' + c + '" type="button"></button>'; }).join('') + '</div>' +
      '<div class="lbl">Gradient</div><div class="dcols">' + GRADS.map(function (q) { return '<button class="sw grad" data-v="g' + q[0] + ',' + q[1] + '" style="--c:transparent;background:linear-gradient(135deg,' + q[0] + ',' + q[1] + ')" type="button"></button>'; }).join('') + '</div>' +
      '<div class="lbl">Your own gradient</div><div class="gcust"><input type="color" data-gc="a" value="' + a + '"><span>→</span><input type="color" data-gc="b" value="' + b2 + '">' +
      [[90, '→'], [135, '↘'], [180, '↓'], [45, '↗']].map(function (x) { return '<button class="cb' + (x[0] === ang ? ' on' : '') + '" data-ga="' + x[0] + '" type="button">' + x[1] + '</button>'; }).join('') + '<button class="pb solid" data-gapply="1" type="button">Apply</button></div>' +
      '<button class="mi" data-v="none" type="button">Default look</button>', btn, function (v) {
        if (v === 'none') return setBg(null);
        if (v[0] === 's') return setBg({ a: v.slice(1), b: '', ang: ang });
        if (v[0] === 'g') { var q = v.slice(1).split(','); return setBg({ a: q[0], b: q[1], ang: ang }); }
      }, true, 'bgpop');
    p.addEventListener('change', function (ev) { if (ev.target.dataset.gc) ev.stopImmediatePropagation(); }, true);
    p.addEventListener('click', function (ev) {
      var ga = ev.target.closest('[data-ga]'); if (ga) { ang = Number(ga.dataset.ga); $$('[data-ga]', p).forEach(function (x) { x.classList.toggle('on', x === ga); }); if (e.bg && e.bg.b) setBg({ a: e.bg.a, b: e.bg.b, ang: ang }); return; }
      if (ev.target.closest('[data-gapply]')) setBg({ a: $('[data-gc=a]', p).value.toUpperCase(), b: $('[data-gc=b]', p).value.toUpperCase(), ang: ang });
    });
    function setBg(v) { patchSel(function () { return { bg: v }; }); }
  }
  function asgHtml(e) {
    var me = assignedToMe(e);
    return '<span class="asg' + (me ? ' me' : '') + '">' + (me ? 'You' + (e.assign.length > 1 ? ' + ' + (e.assign.length - 1) : '') : e.assign.map(function (a) { return esc(a.name.split(' ')[0]); }).join(', ')) + '</span>';
  }
  function asgCls(e) { return e.assign && e.assign.length ? (assignedToMe(e) ? ' asgme' : isT() ? ' asgd' : '') : ''; }
  // номер задания показываем один раз — на самом верхнем элементе этого задания во фрейме
  var stepLead = {};
  function calcStepLead() {
    stepLead = {}; var best = {};
    B.elements.forEach(function (x) {
      if (!x.step || x.type === 'frame' || x.type === 'line') return;
      var f = framesOf(x)[0], k = (f ? f.id : '-') + ':' + x.step, b = boxOf(x), cur = best[k];
      if (!cur || b.y < cur.y - 1 || (Math.abs(b.y - cur.y) <= 1 && b.x < cur.x)) best[k] = { id: x.id, y: b.y, x: b.x };
    });
    Object.keys(best).forEach(function (k) { stepLead[best[k].id] = 1; });
  }
  function render() {
    if (!B) return;
    if (drag && !/^(resize|gresize|crop|lineEnd|newLine|rotate)$/.test(drag.kind)) { pendingRender = true; return; }
    pendingRender = false;
    if (isT()) calcStepLead();
    var ae = document.activeElement, tadd = ae && ae.dataset && ae.dataset.tadd ? { id: ae.dataset.tadd, v: ae.value, s: ae.selectionStart } : null;
    // поля в играх: то, что ученик начал печатать, не пропадает при обновлении доски
    var gin = {}, gfocus = null;
    $$('#world .game [data-gin]').forEach(function (n) { var host = n.closest('[data-id]'), k = host.dataset.id + ':' + n.dataset.gin; gin[k] = n.type === 'radio' || n.type === 'checkbox' ? n.checked : n.value; if (n === ae) gfocus = { k: k, s: n.selectionStart, e2: n.selectionEnd }; });
    $('#btitle').textContent = B.title; document.title = B.title + ' · ' + BRAND.name;
    vp.style.backgroundColor = B.bg || '';
    vp.classList.toggle('g-dots', (B.grid || 'dots') === 'dots'); vp.classList.toggle('g-lines', B.grid === 'lines');
    var hidden = {};
    if (frames().some(function (f) { return f.collapsed; })) B.elements.forEach(function (e) { if (hiddenByCollapse(e)) hidden[e.id] = 1; });
    var res = (B.check && B.check.res) || {}, fill = {};
    var zoneHasCards = {};
    B.elements.forEach(function (c) { if (c.type === 'card' && c.slot) fill[c.slot] = c; if (c.type === 'card' && c.answer) zoneHasCards[c.answer] = 1; });
    var L = { f: '', z: '', t: '', n: '', c: '', s: '' }, animate = [];
    B.elements.forEach(function (e) {
      if (hidden[e.id] || e.type === 'line' || e.type === 'html') return;
      var pos = 'left:' + e.x + 'px;top:' + e.y + 'px;', xs = extras(e), to = (e.tonly && isT() ? ' tonlyb' : '') + asgCls(e);
      if (e.type === 'media' || e.type === 'input' || e.type === 'cloud' || e.type === 'open' || e.type === 'video') return;
      switch (e.type) {
        case 'frame': L.f += frameHtml(e); break;
        case 'zone': L.z += '<div class="zone' + to + '" data-id="' + e.id + '" style="' + pos + 'width:' + e.w + 'px;height:' + e.h + 'px;' + (e.color ? '--c:' + e.color + ';' : '') + '"><div class="ztitle" style="font-size:' + (e.size || 16) + 'px;' + tstyle(e) + '">' + esc(e.title) + '</div>' + (zoneHasCards[e.id] && !e.tk ? checkPill(e) : '') + xs + '</div>'; break;
        case 'image': L.z += imageHtml(e, xs, to); break;
        case 'shape': L.z += shapeHtml(e, xs, to); break;
        case 'text': L.t += '<div class="btext' + to + '" data-id="' + e.id + '" style="' + pos + 'width:' + e.w + 'px;font-size:' + e.size + 'px;' + tstyle(e) + '">' + body(e) + xs + '</div>'; break;
        case 'sentence':
          L.t += '<div class="sent' + to + '" data-id="' + e.id + '" style="' + pos + 'width:' + e.w + 'px;font-size:' + e.size + 'px;' + tstyle(e) + '">' +
            e.parts.map(function (p) {
              if (typeof p === 'string') return esc(p);
              var card = fill[p.slot], mark = res[p.slot] === true ? ' ok' : res[p.slot] === false ? ' bad' : '';
              var mw = Math.max(3, Math.min(18, (p.answer || '').length * 0.62 + 1.6));
              var hint = !card && p.hint ? (p.hk === 'letter' ? '<i class="shint">' + esc((p.answer || '').slice(0, 1)) + '…</i>' : '<i class="shint q" data-tip="' + esc(p.hint) + '">?</i>') : '';
              return '<span class="slot' + (card ? ' filled' : '') + mark + '" data-slot="' + p.slot + '"' + (card ? ' data-card="' + card.id + '"' : '') + (!card && p.hint && p.hk !== 'letter' ? ' data-tip="' + esc(p.hint) + '"' : '') + ' style="min-width:' + mw + 'em">' + (card ? esc(card.text) : hint || '&nbsp;') + '</span>';
            }).join('') + (e.parts.some(function (p) { return p && p.answer; }) && !e.tk ? checkPill(e) : '') + xs + '</div>';
          break;
        case 'note':
          L.n += '<div class="note' + (e.pin ? ' pinned' : '') + to + '" data-id="' + e.id + '" style="' + pos + 'width:' + e.w + 'px;height:' + e.h + 'px;' + (e.color ? '--c:' + e.color + ';' : '') + (!e.fc && isDark(e.color) ? 'color:#fff;' : '') + '"><div class="ntext' + (e.align && e.align !== 'center' ? ' al-' + e.align : '') + (e.va ? ' va-' + e.va : '') + '" style="font-size:' + noteFont(e) + 'px;' + tstyle(e) + '">' + body(e) + '</div>' + reactsHtml(e) + xs + (isT() && (e.by || e.anon) && e.by !== 't' ? '<span class="nby">' + (e.anon ? 'anonymous' : esc(nameOf(e.by))) + '</span>' : '') + '</div>';
          break;
        case 'card':
          if (e.slot) break;
          var mk = res[e.id] === true ? ' ok' : res[e.id] === false ? ' bad' : '';
          L.c += '<div class="card' + mk + to + ((e.text || '').length > 28 ? ' long' : '') + '" data-id="' + e.id + '" style="' + pos + 'font-size:' + (e.size || 18) + 'px;' + (e.color ? '--c:' + e.color + ';' : '') + tstyle(e) + '">' + esc(e.text) + xs + '</div>';
          break;
        case 'sticker': L.s += '<div class="bsticker' + to + '" data-id="' + e.id + '" style="' + pos + 'font-size:' + e.size + 'px">' + esc(e.emoji) + xs + '</div>'; break;
        case 'wheel': L.t += wheelHtml(e, animate, xs); break;
        case 'flip': L.t += flipHtml(e, animate, xs); break;
        case 'scale': L.t += scaleHtml(e, xs); break;
        case 'dice': L.t += diceHtml(e, xs); break;
        case 'rating': L.t += ratingHtml(e, xs); break;
        case 'poll': L.t += pollHtml(e, xs); break;
        case 'todo': L.t += todoHtml(e, xs); break;
        case 'deck': L.t += deckHtml(e, xs); break;
        case 'boxes': L.t += boxesHtml(e, xs); break;
        case 'chart': L.t += chartHtml(e, xs); break;
        case 'table': L.t += tableHtml(e, xs, to); break;
        case 'kanban': L.t += kanbanHtml(e, xs, to); break;
        case 'kcard': L.t += kcardHtml(e, xs, to); break;
        default: if (isGame(e)) L.t += window.GAMES[e.type].html(e, xs, to); break;
        case 'coin': L.t += coinHtml(e, xs); break;
        case 'link': L.t += linkHtml(e, xs, to); break;
        case 'ball': L.t += ballHtml(e, xs); break;
      }
    });
    var keep = editing && editing.elNode, rng = null;
    if (keep) { var gs = getSelection(); if (gs.rangeCount && editing.node.contains(gs.anchorNode)) rng = saveRange(editing.node, gs.getRangeAt(0)); }
    $('#lf').innerHTML = L.f; $('#lz').innerHTML = L.z; $('#lt').innerHTML = L.t; $('#ln').innerHTML = L.n; $('#lc').innerHTML = L.c + L.s;
    if (keep) {
      var fresh = world.querySelector('[data-id="' + editing.id + '"]'); if (fresh) { keep.style.cssText = fresh.style.cssText; keep.className = fresh.className; fresh.replaceWith(keep); }
      // узел пересобранного слоя потерял фокус — возвращаем курсор туда, где он был
      editing.node.focus({ preventScroll: true });
      if (rng) restoreRange(editing.node, rng);
    }
    if (animate.length) requestAnimationFrame(function () { requestAnimationFrame(function () { animate.forEach(function (f) { f(); }); }); });
    fitTexts();
    $$('#world .game [data-gin]').forEach(function (n) { var k = n.closest('[data-id]').dataset.id + ':' + n.dataset.gin; if (!(k in gin)) return; if (n.type === 'radio' || n.type === 'checkbox') n.checked = gin[k]; else n.value = gin[k]; if (gfocus && gfocus.k === k) { n.focus({ preventScroll: true }); try { n.setSelectionRange(gfocus.s, gfocus.e2); } catch (err) {} } });
    if (tadd) { var ti0 = world.querySelector('[data-tadd="' + tadd.id + '"]'); if (ti0) { ti0.value = tadd.v; ti0.focus({ preventScroll: true }); try { ti0.setSelectionRange(tadd.s, tadd.s); } catch (err) {} } }
    renderHtmlBlocks(hidden); applyBgs(); applyFx(); placeTaskPills(hidden); applyDetails();
    // слои: порядок элементов на доске = порядок наложения (Bring to front / Send to back)
    var zi = {}; B.elements.forEach(function (e, i) { zi[e.id] = i + 1; });
    $$('#lz>[data-id],#lt>[data-id],#ln>[data-id],#lh>[data-id]').forEach(function (n) { n.style.zIndex = zi[n.dataset.id] || 1; });
    renderLinks(); renderInk(); renderResult(); applyView(); renderSel();
    $('#mineBtn').hidden = !myTargets().length;
    renderTimer(); renderAnon();
  }
  // выделение запоминаем как путь от корня поля: живые Range сбрасываются, когда узел переносят
  function isDark(c) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); if (!m) return false; var n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5; }
  function nameOf(id) { var r = ROSTER.find(function (x) { return x.id === id; }); return r ? r.name.split(' ')[0] : ''; }
  function pathTo(root, n) { var p = []; while (n && n !== root) { var i = 0, c = n; while ((c = c.previousSibling)) i++; p.unshift(i); n = n.parentNode; } return p; }
  function nodeAt(root, p) { var n = root; for (var i = 0; i < p.length && n; i++) n = n.childNodes[p[i]]; return n; }
  function saveRange(root, r) { return { s: pathTo(root, r.startContainer), so: r.startOffset, e: pathTo(root, r.endContainer), eo: r.endOffset }; }
  function restoreRange(root, d) {
    try { var a = nodeAt(root, d.s), b = nodeAt(root, d.e); if (!a || !b) return; var r = document.createRange(); r.setStart(a, d.so); r.setEnd(b, d.eo); var g = getSelection(); g.removeAllRanges(); g.addRange(r); } catch (err) {}
  }
  function reactsHtml(e) {
    var r = e.reacts || {}, k = Object.keys(r);
    if (!k.length) return '';
    return '<div class="rxs">' + k.map(function (em) { var me = ME && r[em].indexOf(ME.id) >= 0; return '<span class="rx' + (me ? ' me' : '') + '" data-react="' + esc(em) + '">' + esc(em) + ' ' + r[em].length + '</span>'; }).join('') + '</div>';
  }
  function frameHtml(f) {
    var T = isT();
    var own = f.owners && f.owners.length ? '<span class="fown">' + f.owners.map(function (o) { return esc(o.name.split(' ')[0]); }).join(', ') + '</span>' : '';
    var flags = T ? (f.hidden ? '<span class="fflag">invisible</span>' : '') + (f.veil ? '<span class="fflag">shows “Hidden”</span>' : '') + (f.private ? '<span class="fflag">private</span>' : '') + (f.ro ? '<span class="fflag">view only</span>' : '') + (f.lock ? '<span class="fflag">locked</span>' : '') + (f.owners && f.owners.length ? '<button class="fmini fvis" data-fvis="1" type="button" data-tip="Click to switch who sees this task">' + (f.private ? 'Only assigned see it' : 'Everyone sees it') + '</button>' : '') + (f.tnote || f.tnimg ? '<span class="tnb" data-tnote="1" style="position:static" title="' + esc((f.tnote || '') + (f.tnimg ? ' 📷' : '')) + '">' + (f.tnimg && !f.tnote ? '📷' : 'i') + '</span>' : '') : '';
    return '<div class="frame' + (f.tex === 'cork' ? ' cork' : f.tex ? ' tx-' + f.tex : '') + (f.collapsed ? ' coll' : '') + (f.lite ? ' lite' : '') + (f.hidden ? ' fhid' : '') + (mine(f) || assignedToMe(f) ? ' mine' : '') + (T ? ' tch' : '') + '" data-id="' + f.id + '" style="left:' + f.x + 'px;top:' + f.y + 'px;width:' + f.w + 'px;height:' + f.h + 'px;' + (f.fill ? '--fill:' + f.fill + ';' : '') + (f.color ? 'border-color:' + f.color + ';' : '') + '">' +
      '<div class="fhead">' +
      (T ? '<button class="fcol" data-fcoll="1" type="button" title="Collapse / expand">' + (f.collapsed ? '▸' : '▾') + '</button>' : '') +
      '<span class="ftitle" data-ftitle="1" style="' + tstyle(f) + '">' + esc(f.title || 'Frame') + '</span>' + own + flags +
      (f.claim && !T && !f.collapsed ? '<button class="fmini' + (mine(f) ? '' : ' solid') + '" data-fclaim="1" type="button">' + (mine(f) ? 'Leave' : 'Join') + '</button>' : '') +
      (!f.collapsed && hasChecks(f) ? '<button class="fmini fcheck" data-fcheck="1" type="button" data-tip="Check the answers in this frame">✓ Check answers</button>' : '') +
      (!T && f.sq && !f.collapsed ? seqHtml(f) : '') +
      (T && !f.collapsed ? stepChips(f) : '') +
      (f.assign && f.assign.length ? asgHtml(f) : '') + '</div>' + (f.veil && !f.collapsed ? '<div class="fveil' + (T ? ' peek' : '') + '">Hidden</div>' : '') + '</div>';
  }
  function stepsIn(f) { var st = {}; B.elements.forEach(function (x) { if (x.step && x.type !== 'frame' && framesOf(x)[0] === f) st[x.step] = 1; }); return Object.keys(st).map(Number).sort(function (a, b) { return a - b; }); }
  var seqTm = null, seqAt = 0;
  function seqDue(t) { if (seqTm && seqAt <= t) return; clearTimeout(seqTm); seqAt = t; seqTm = setTimeout(function () { seqTm = null; seqAt = 0; op({ t: 'step-sync' }); }, Math.max(500, t - (Date.now() + SKEW) + 800)); }
  function seqHtml(f) {
    var q = f.sq; if (!q) return '';
    var h = '<span class="fseqp">Step ' + q.i + ' / ' + q.of + (q.fin ? ' ✓' : '') + '</span>';
    if (q.fin) return h;
    if (q.k === 'next') return h + '<button class="fmini solid" data-fnext="1" type="button">Next step ▸</button>';
    if (q.k === 'check') return h + '<span class="fseqh">Answer correctly and press Check to continue</span>';
    if (q.k === 'try') return h + '<span class="fseqh">Press Check to continue</span>';
    if (q.k === 'time') { seqDue(q.due); var d = new Date(q.due); return h + '<span class="fseqh">Next step opens at ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '</span>'; }
    return h + '<span class="fseqh">Waiting for your teacher</span>';
  }
  var GATE_LABEL = { next: 'Student presses “Next step”', check: 'All answers correct (after Check)', 'try': 'Student presses Check (any result)', time: 'After a timer', teacher: 'Only when I allow it' };
  function openSeq(btn, f) {
    var st = stepsIn(f);
    if (st.length < 2) { toast('Mark at least two tasks as Task 1, Task 2… first (select an element → Task #)'); return; }
    var rows = st.slice(0, -1).map(function (n) {
      var g = (f.gates && f.gates[n]) || { k: 'next' };
      return '<div class="sqrow"><span>After Task ' + n + '</span><select data-gk="' + n + '">' + Object.keys(GATE_LABEL).map(function (k) { return '<option value="' + k + '"' + (g.k === k ? ' selected' : '') + '>' + GATE_LABEL[k] + '</option>'; }).join('') + '</select>' +
        '<span class="sqm"' + (g.k === 'time' ? '' : ' hidden') + ' data-gm="' + n + '"><input type="number" min="1" max="43200" value="' + (g.m || 10) + '"> min</span></div>';
    }).join('');
    var pr = (B.prog && B.prog[f.id]) || {};
    var people = f.seq ? ROSTER.map(function (r) {
      var p = pr[r.id], i = p ? st.indexOf(p.n) : -1;
      return '<div class="sqst"><span>' + esc(r.name) + '</span><i>' + (p ? 'Task ' + p.n + ' (' + (i + 1) + '/' + st.length + ')' : 'not started') + '</i>' + (i >= 0 && i < st.length - 1 ? '<button class="cb" data-v="g:' + r.id + '" type="button" title="Open the next task for this student">+1</button>' : '') + '</div>';
    }).join('') : '';
    var p = ctxPop('<div class="lbl">Self-paced tasks</div>' +
      '<label class="chk"><input type="checkbox" id="sqOn"' + (f.seq ? ' checked' : '') + '> Every student moves on at their own pace</label>' +
      '<div class="lbl">When does the next task open?</div>' + rows +
      '<div style="display:flex;gap:6px;margin-top:6px"><button class="pb solid" data-v="save" type="button">Save</button>' + (f.seq ? '<button class="pb" data-v="reset" type="button">Reset progress</button>' : '') + '</div>' +
      (people ? '<div class="lbl">Students</div><div class="sqlist">' + people + '</div>' : '') +
      '<p class="hint" style="margin:6px 0 0;max-width:300px">The first task is open at the start. “Correct answers” needs the Check button, and works per student when each one has their own copy (Assign students…).</p>', btn,
      function (v, pop) {
        if (v === 'save') {
          var gates = {}; $$('[data-gk]', pop).forEach(function (sel0) { var n = sel0.dataset.gk, g = { k: sel0.value }; if (g.k === 'time') g.m = Number(($('[data-gm="' + n + '"] input', pop) || {}).value) || 10; gates[n] = g; });
          var on = $('#sqOn', pop).checked;
          op({ t: 'step-seq', frame: f.id, on: on, gates: gates }, function (ok) { if (ok) { closeCtxPop(); toast(on ? 'Self-paced mode is on' : 'Self-paced mode is off'); } });
        } else if (v === 'reset') { op({ t: 'step-seq', frame: f.id, reset: true }, function () { closeCtxPop(); toast('Progress reset'); }); }
        else if (/^g:/.test(v)) { var pe = pr[v.slice(2)], i = pe ? st.indexOf(pe.n) : 0; op({ t: 'step-grant', frame: f.id, student: v.slice(2), n: st[Math.min(st.length - 1, i + 1)] }, function () { closeCtxPop(); toast('Next task opened for this student'); }); }
      }, true);
    $$('[data-gk]', p).forEach(function (se) { se.addEventListener('change', function () { var m = $('[data-gm="' + se.dataset.gk + '"]', p); if (m) m.hidden = se.value !== 'time'; }); });
    return p;
  }
  function stepChips(f) {
    var st = stepsIn(f); if (!st.length) return '';
    if (f.seq) return '<span class="fsteps"><button class="fstep open" data-fseq="1" type="button" data-tip="Each student moves on at their own pace — click to set up">Self-paced ✓</button></span>';
    var open = f.open == null ? 999 : f.open;
    return '<span class="fsteps">' + st.map(function (n) { return '<button class="fstep' + (n <= open ? ' open' : '') + '" data-fstep="' + n + '" type="button" data-tip="' + (n <= open ? 'Open for students — click to take everyone there' : 'Open for students and take everyone there') + '">Task ' + n + '</button>'; }).join('') +
      '<button class="fstep ghost" data-fstep="all" type="button" data-tip="Show all tasks to students">Show all</button><button class="fstep ghost" data-fstep="none" type="button" data-tip="Hide all tasks from students">Hide all</button><button class="fstep ghost" data-fseq="1" type="button" data-tip="Open tasks one after another, each student at their own pace">Self-paced…</button></span>';
  }
  /* карточка-ссылка: сайт, другая доска или элемент доски */
  function linkHost(u) { if (/^\//.test(u)) return location.host; try { return new URL(u).host.replace(/^www\./, ''); } catch (er) { return ''; } }
  function linkHtml(e, xs, to) {
    var inner = /^\/b\//.test(e.url) || linkHost(e.url) === location.host, k = e.w / 340;
    return '<div class="lcard' + (inner ? ' inner' : '') + (to || '') + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;font-size:' + (14 * k).toFixed(1) + 'px">' +
      (e.img ? '<div class="limg" style="background-image:url(' + esc(e.img) + ')"></div>' : '') +
      '<div class="lbody"><div class="lsite">' + (inner ? svg('frame') : '<img src="https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(linkHost(e.url)) + '" alt="" onerror="this.remove()">') + '<span>' + esc(inner ? (e.site || 'Board') : (e.site || linkHost(e.url))) + '</span></div>' +
      '<a class="ltitle" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">' + esc(e.title || e.url) + '</a>' +
      (e.desc ? '<div class="ldesc">' + esc(e.desc) + '</div>' : '') +
      '<a class="lopen" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">' + (inner ? 'Go there →' : 'Open ↗') + '</a></div>' + xs + '</div>';
  }
  // ссылка в тексте: на выделенные слова (при редактировании) или в конец текста
  function linkTextDialog(e, btn, ed) {
    var g = ed && getSelection(), hasSel = !!(g && g.rangeCount && !g.isCollapsed && editing.node.contains(g.anchorNode));
    if (ed && g && g.rangeCount) editing.lastRange = saveRange(editing.node, g.getRangeAt(0));
    var p = ctxPop('<div class="lbl">' + (hasSel ? 'Link for the selected words' : 'Add a link') + '</div><input id="tlUrl" placeholder="https://… or a board / element link" style="width:320px">' +
      (hasSel ? '' : '<input id="tlTxt" placeholder="Link text (optional)" style="width:320px;margin-top:6px">') +
      '<p class="hint" style="margin:4px 0 0;max-width:320px">Link to a board element: select it → ⋯ → Copy link to this element.</p><button class="pb" data-v="ok" type="button">Add link</button>', btn, function () { go(); }, true);
    function go() {
      var u = ($('#tlUrl', p).value || '').trim(); if (/^www\./.test(u)) u = 'https://' + u;
      try { var uu = new URL(u); if (uu.host === location.host && /^\/b\//.test(uu.pathname)) u = uu.pathname + uu.hash; } catch (er) {}
      if (!/^(https?:\/\/\S+|\/b\/[\w-]+(#[\w=&-]*)?)$/.test(u)) { toast('Paste a link that starts with https://'); return; }
      var tx = $('#tlTxt', p) ? $('#tlTxt', p).value.trim() : '';
      closeCtxPop();
      if (ed && editing) {
        if (hasSel) exec('createLink', u);
        else exec('insertHTML', '<a href="' + esc(u) + '">' + esc(tx || u) + '</a>&nbsp;');
        return;
      }
      var cur = e.html || esc(e.text || '').replace(/\n/g, '<br>');
      patchSel(function () { return { html: cur + (cur ? '<br>' : '') + '<a href="' + esc(u) + '">' + esc(tx || u) + '</a>', text: (e.text ? e.text + '\n' : '') + (tx || u) }; }, [e.id]);
    }
    setTimeout(function () { var i = $('#tlUrl', p); if (!i) return; i.focus(); $$('input', p).forEach(function (x) { x.onkeydown = function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') go(); }; }); }, 30);
  }
  function linkPreview(url) { return api('POST', '/api/link-preview', { url: url }).catch(function () { return { url: url, title: '', desc: '', site: '', img: '' }; }); }
  function addLinkCard(url, at) {
    url = String(url || '').trim(); if (/^www\./.test(url)) url = 'https://' + url;
    if (!/^https?:\/\/\S+$/.test(url)) { toast('Paste a link that starts with https://'); return; }
    at = at || viewCenter(); toast('Getting the link preview…');
    linkPreview(url).then(function (p) {
      var rel = url; try { var uu = new URL(url); if (uu.host === location.host && /^\/b\//.test(uu.pathname)) rel = uu.pathname + uu.hash; } catch (er) {}
      var el = { id: rid(), type: 'link', url: rel, title: p.title || '', desc: p.desc || '', site: p.site || '', img: p.img || '', internal: !!p.internal, x: Math.round(at.x - 170), y: Math.round(at.y - 60), w: 340 };
      op({ t: 'add', el: el }, function (ok) { if (ok) { pushUndo(function () { op({ t: 'del', id: el.id }); }); setTimeout(function () { select([el.id]); }, 150); } else toast('Could not add this link'); });
    });
  }
  function addLinkDialog(anchorBtn) {
    var p = ctxPop('<div class="lbl">Link</div><input id="lnUrl" placeholder="https://… — a website, a board or a board element" style="width:340px"><p class="hint" style="margin:0;max-width:340px">You get a card with a preview. Link to a board element: select it → ⋯ → <b>Copy link to this element</b>. Tip: you can also just paste a link on the board with Ctrl+V.</p><button class="pb" data-v="add" type="button">Add to board</button>', anchorBtn || $('[data-fly="widgets"]') || $('#moreBtn'),
      function (v, pop) { var u = $('#lnUrl', pop).value.trim(); closeCtxPop(); addLinkCard(u); }, true);
    setTimeout(function () { var i = $('#lnUrl', p); if (i) { i.focus(); i.onkeydown = function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') { var u = i.value.trim(); closeCtxPop(); addLinkCard(u); } }; } }, 30);
  }
  // ссылка на доску или на её элемент
  function elLink(id) { return location.origin + '/b/' + BOARD_ID + (id ? '#el=' + id : ''); }
  function copyText(t, msg) {
    var done = function () { toast(msg); };
    try { navigator.clipboard.writeText(t).then(done, function () { prompt('Copy the link', t); }); } catch (er) { prompt('Copy the link', t); }
  }
  function focusEl(id) {
    var e = find(id); if (!e) { toast('This element is no longer on the board'); return false; }
    if (hiddenByCollapse(e)) { var fr = framesOf(e)[0]; if (fr && isT()) setFrame(fr, { collapsed: null }); }
    var b = boxOf(e); fitTo({ x: b.x - 80, y: b.y - 80, w: b.w + 160, h: b.h + 160 }, e.type === 'frame' ? 1.3 : 1.6);
    if (isT() || canStyle(e)) select([id]);
    setTimeout(function () { var n = world.querySelector('[data-id="' + id + '"]'); if (n) { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); setTimeout(function () { n.classList.remove('flash'); }, 2200); } }, 120);
    return true;
  }
  function openHashEl() { var m = /el=([\w-]+)/.exec(location.hash || ''); if (m && B) setTimeout(function () { focusEl(m[1]); }, 200); }
  window.addEventListener('hashchange', openHashEl);
  // клик по ссылке на доске: внутренние открываем здесь же, внешние — в новой вкладке
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('#world a[href]'); if (!a || (editing && editing.node && editing.node.contains(a))) { if (a) ev.preventDefault(); return; }
    var href = a.getAttribute('href'), u; try { u = new URL(href, location.href); } catch (er) { return; }
    if (u.host !== location.host || !/^\/b\//.test(u.pathname)) return;   // внешняя — браузер откроет сам
    ev.preventDefault();
    var bid = u.pathname.split('/')[2], m = /el=([\w-]+)/.exec(u.hash || '');
    if (bid === BOARD_ID) { if (m) { history.replaceState(null, '', '#el=' + m[1]); focusEl(m[1]); } else fit(); }
    else location.href = u.pathname + u.hash;
  }, true);
  function hasChecks(f) { return B.elements.some(function (e) { return inRect(anchor(e), f) && ((e.type === 'card' && e.answer) || (e.type === 'input' && e.answers && e.answers.length) || (e.type === 'sentence' && e.parts.some(function (p) { return p && p.slot && p.answer; }))); }); }
  function shapeHtml(e, xs, to) {
    var fillc = e.fill === 'none' ? 'transparent' : (e.fill || '#FFFFFF'), bw = e.sw || 0, bs = e.dash ? 'dashed' : 'solid';
    var bg;
    if (e.shape === 'rect' || e.shape === 'round' || e.shape === 'ellipse') {
      var rad = e.shape === 'ellipse' ? '50%' : e.shape === 'round' ? (e.radius || Math.min(e.w, e.h) * 0.18) + 'px' : (e.radius || 0) + 'px';
      bg = '<div class="sbg" style="background:' + fillc + ';border:' + bw + 'px ' + bs + ' ' + (bw ? e.stroke : 'transparent') + ';border-radius:' + rad + '"></div>';
    } else {
      bg = '<svg class="sp" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="' + POLY[e.shape] + '" fill="' + fillc + '" stroke="' + (bw ? e.stroke : 'none') + '" stroke-width="' + bw + '" vector-effect="non-scaling-stroke" stroke-linejoin="round"' + (e.dash ? ' stroke-dasharray="' + (bw * 3) + ' ' + (bw * 2) + '"' : '') + '/></svg>';
    }
    var al = (e.align && e.align !== 'center' ? ' al-' + e.align : '') + (e.va ? ' va-' + e.va : '');
    var pad = e.shape === 'triangle' ? 'padding:38% 22% 6%;' : e.shape === 'speech' ? 'padding:6% 10% 30%;' : e.shape === 'arrow' ? 'padding:12% 30% 12% 6%;' : '';
    return '<div class="shape' + to + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;height:' + e.h + 'px;opacity:' + (e.opacity == null ? 1 : e.opacity) + '">' + bg +
      '<div class="stext' + al + '" style="font-size:' + (e.size || 18) + 'px;' + pad + (!e.fc && e.fill !== 'none' && isDark(e.fill) ? 'color:#fff;' : '') + tstyle(e) + '">' + body(e) + '</div>' + xs + '</div>';
  }
  function imageHtml(e, xs, to) {
    var cr = e.crop || { x: 0, y: 0, w: 1, h: 1 }, fw = e.w / cr.w, fh = e.h / cr.h;
    var poly = { diamond: POLY.diamond, hexagon: POLY.hexagon, triangle: POLY.triangle, star: POLY.star }[e.shape];
    var rad = e.shape === 'circle' ? '50%' : e.shape === 'round' ? Math.max(6, Math.min(e.w, e.h) * 0.08) + 'px' : (e.radius || 0) + 'px';
    var bw = e.bw || 0, bc = e.bc || '#1E1E1C';
    var clipStyle = poly ? 'clip-path:polygon(' + poly.split(' ').map(function (p) { var a = p.split(','); return a[0] + '% ' + a[1] + '%'; }).join(',') + ');' : 'border-radius:' + rad + ';';
    var ring = bw && !poly ? '<div style="position:absolute;inset:0;border-radius:' + rad + ';box-shadow:inset 0 0 0 ' + bw + 'px ' + bc + ';pointer-events:none"></div>' : '';
    var bord = bw && poly ? '<svg class="ibord" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="' + poly + '" fill="none" stroke="' + bc + '" stroke-width="' + (bw * 2) + '" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>' : '';
    var cover = e.cover ? '<div class="cover' + (isT() ? ' peek' : '') + '" style="--cc:' + (e.coverColor || '#4A5A6A') + '">' + (isT() ? 'Hidden from students' : '?') + '</div>' : '';
    return '<div class="bimgw' + to + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;height:' + e.h + 'px;opacity:' + (e.opacity == null ? 1 : e.opacity) + '">' +
      '<div class="iclip" style="' + clipStyle + '"><img src="' + esc(e.src) + '" alt="" draggable="false" style="left:' + (-cr.x * fw) + 'px;top:' + (-cr.y * fh) + 'px;width:' + fw + 'px;height:' + fh + 'px' + (e.irot ? ';transform:rotate(' + e.irot + 'deg);transform-origin:' + (cr.x * fw + e.w / 2) + 'px ' + (cr.y * fh + e.h / 2) + 'px' : '') + '">' + cover + ring + '</div>' + bord +
      reactsHtml(e) + xs + '</div>';
  }
  function wheelHtml(e, animate, xs) {
    var n = e.items.length, R = 480, seg = 360 / Math.max(1, n), s = '';
    if (n < 2) s = '<circle cx="500" cy="500" r="490" fill="' + WHEEL_COLORS[0] + '"/><text x="500" y="330" text-anchor="middle" font-size="56" fill="#333">Add options</text>';
    else e.items.forEach(function (it, i) {
      var a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180;
      var x0 = 500 + R * Math.cos(a0), y0 = 500 + R * Math.sin(a0), x1 = 500 + R * Math.cos(a1), y1 = 500 + R * Math.sin(a1);
      var col = WHEEL_COLORS[i % WHEEL_COLORS.length]; if (n % WHEEL_COLORS.length === 1 && i === n - 1) col = WHEEL_COLORS[2];
      s += '<path d="M500 500L' + x0.toFixed(1) + ' ' + y0.toFixed(1) + 'A' + R + ' ' + R + ' 0 ' + (seg > 180 ? 1 : 0) + ' 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'Z" fill="' + col + '" stroke="#fff" stroke-width="4"/>';
      var am = (i + 0.5) * seg - 90, label = it.length > 16 ? it.slice(0, 15) + '…' : it;
      var fs = Math.min(54, Math.max(22, 380 / Math.max(5, label.length)), seg * 3.2);
      s += '<text transform="rotate(' + am.toFixed(2) + ' 500 500)" x="930" y="500" dominant-baseline="central" text-anchor="end" font-size="' + fs.toFixed(0) + '" font-weight="600" font-family="Inter,system-ui,sans-serif" fill="#1E1E1C">' + esc(label) + '</text>';
    });
    var ss = seenSpin[e.id], dur = 4200, el = ss && ss.local ? Date.now() - ss.local : dur + 1;
    var start = e.angle, spinning = e.spin && el < dur;
    if (spinning) {
      var t = el / dur, ease = 1 - Math.pow(1 - t, 3);
      start = e.spin.from + (e.angle - e.spin.from) * ease;
      (function (id, to, left) {
        animate.push(function () { var r = $('[data-id="' + id + '"] .wrot'); if (r) { r.style.transition = 'transform ' + left + 'ms cubic-bezier(.22,.61,.36,1)'; r.style.transform = 'rotate(' + to + 'deg)'; } });
        setTimeout(function () { if (!drag) render(); }, left + 80);
      })(e.id, e.angle, dur - el);
    }
    var result = e.spin && !spinning && e.items[e.spin.res] ? '<div class="wres" style="font-size:' + Math.max(8, e.size * 0.06) + 'px">' + esc(e.items[e.spin.res]) + '</div>' : '';
    return '<div class="wheel' + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.size + 'px;height:' + e.size + 'px">' +
      '<svg viewBox="0 0 40 40" style="position:absolute;left:50%;top:-' + (e.size * 0.05) + 'px;width:' + (e.size * 0.1) + 'px;height:' + (e.size * 0.1) + 'px;transform:translateX(-50%);z-index:2;overflow:visible"><path d="M4 4h32L20 36z" fill="#1E1E1C" stroke="#fff" stroke-width="3"/></svg>' +
      '<div class="wrot" style="transform:rotate(' + start + 'deg)"><svg viewBox="0 0 1000 1000">' + s + '</svg></div>' +
      '<button class="wbtn" data-act="spin" type="button" style="font-size:' + Math.max(5, e.size * 0.05) + 'px;border-width:' + Math.max(1, e.size * 0.008) + 'px">Spin</button>' + result + xs + '</div>';
  }
  function face(s, side) { return (s.src ? '<img src="' + esc(s.src) + '" alt="" draggable="false">' : '') + (s.text || !s.src ? '<div class="fed" data-ed="' + side + '.text">' + esc(s.text || '') + '</div>' : ''); }
  function flipHtml(e, animate, xs) {
    var was = prevFlip[e.id], on = e.flipped; prevFlip[e.id] = on;
    var showOn = was !== undefined && was !== on ? was : on;
    if (was !== undefined && was !== on) (function (id, v) { animate.push(function () { var n = $('[data-id="' + id + '"]'); if (n) n.classList.toggle('on', v); }); })(e.id, on);
    var fs = Math.max(4, Math.min(e.w * 0.085, e.h * 0.12));
    return '<div class="flip' + (showOn ? ' on' : '') + asgCls(e) + '" data-id="' + e.id + '" data-act="flip" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;height:' + e.h + 'px;font-size:' + fs.toFixed(1) + 'px;' + (e.color ? '--c:' + e.color + ';' : '') + (e.fill ? '--f:' + e.fill + ';' : '') + '">' +
      '<div class="fin"><div class="face front' + (isDark(e.fill) ? ' dark' : '') + '">' + face(e.front, 'front') + '</div><div class="face back' + (isDark(e.color) ? ' dark' : '') + '">' + face(e.back, 'back') + '</div></div>' +
      flipWritesHtml(e) +
      '<button class="fturn" data-act="flip" type="button">Flip</button>' + xs + '</div>';
  }
  /* приватные записи на обратной стороне: свои видны автору, чужие — после «раскрыть» */
  var asStu = false;
  function flipWritesHtml(e) {
    var T = isT() && !asStu, ws = e.writes || [], h = '';
    ['front', 'back'].forEach(function (sd) {
      var show = ws.filter(function (w) { return (w.side || 'back') === sd && (T || w.shown || (ME && w.by === ME.id)); });
      var cls = 'sd-' + sd.charAt(0);
      if (show.length) h += '<div class="fws ' + cls + '">' + show.map(function (w) { return '<span class="fw' + (w.shown ? '' : ' priv') + '">' + (w.shown ? '' : '🔒 ') + esc(w.text) + (w.shown || T ? '<small>' + esc((w.name || '').split(' ')[0]) + (T && !w.shown ? ' · hidden' : '') + '</small>' : '<small>only you</small>') + '</span>'; }).join('') + '</div>';
      if (ME) h += '<button class="fwbtn fwrite ' + cls + '" data-fwrite="' + sd + '" type="button">✎ Write on the ' + sd + '</button>';
    });
    if (!T && e.whid) h += '<div class="fws sd-b"><span class="fw priv">🔒 ' + e.whid + ' hidden</span></div>';
    if (T && ws.length) h += '<button class="fwbtn freveal" data-freveal="1" type="button">' + (ws.some(function (w) { return !w.shown; }) ? 'Reveal all' : 'Hide again') + '</button>';
    return h;
  }
  function openFlipWrite(btn, e, side) {
    side = side === 'front' ? 'front' : 'back';
    var mine = (e.writes || []).filter(function (w) { return ME && w.by === ME.id && (w.side || 'back') === side; })[0] || null;
    var p = ctxPop('<div class="lbl">Write on the ' + side + '</div>' +
      '<textarea id="fwText" rows="3" maxlength="300" placeholder="Your answer…" style="width:260px">' + esc(mine ? mine.text : '') + '</textarea>' +
      '<label class="chk"><input type="radio" name="fwVis" value="all"' + (!mine || mine.shown ? ' checked' : '') + '> Show to everyone</label>' +
      '<label class="chk"><input type="radio" name="fwVis" value="priv"' + (mine && !mine.shown ? ' checked' : '') + '> ' + (isT() ? 'Hidden — students see only a lock' : 'Private — only I and the teacher see it') + '</label>' +
      '<div style="display:flex;gap:6px;margin-top:6px"><button class="pb solid" data-v="save" type="button">Save</button>' + (mine ? '<button class="pb" data-v="del" type="button">Remove</button>' : '') + '</div>' +
      '<p class="hint" style="margin:6px 0 0;max-width:260px">If you choose private, others see only that something is written. You can show it later, or the teacher can reveal all at once.</p>', btn,
      function (v, pop) {
        if (v !== 'save' && v !== 'del') return;
        var txt = v === 'del' ? '' : $('#fwText', pop).value.trim(), shown = ($('input[name=fwVis]:checked', pop) || {}).value === 'all';
        op({ t: 'flip-write', id: e.id, side: side, text: txt, shown: shown }, function () { closeCtxPop(); toast(v === 'del' ? 'Removed' : shown ? 'Shown to everyone' : 'Saved — only you and the teacher see it'); });
      }, true);
    var ta = $('#fwText', p); if (ta) { ta.addEventListener('keydown', function (ev) { ev.stopPropagation(); }); setTimeout(function () { ta.focus(); }, 30); }
    return p;
  }
  function scaleHtml(e, xs) {
    var ids = Object.keys(e.votes || {});
    var avg = ids.length ? ids.reduce(function (a, k) { return a + e.votes[k].v; }, 0) / ids.length : null;
    var dots = ids.map(function (k) { var v = e.votes[k]; return '<span class="sdot' + (ME && k === ME.id ? ' me' : '') + '" style="left:' + v.v + '%;--c:' + colorOf(k) + '" title="' + esc(v.name) + '">' + esc((v.name || '?').slice(0, 1)) + '</span>'; }).join('');
    return '<div class="scale' + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;font-size:' + Math.max(3, e.w / 44).toFixed(1) + 'px">' +
      (e.title ? '<div class="stitle" data-ed="title">' + esc(e.title) + '</div>' : '') +
      '<div class="strack" data-act="vote">' + (avg != null && isT() ? '<span class="savg" style="left:' + avg + '%" title="Average"></span>' : '') + dots + '</div>' +
      '<div class="slabels"><span data-ed="left">' + esc(e.left) + '</span><span>' + (isT() ? ids.length + ' vote' + (ids.length === 1 ? '' : 's') : 'tap the line to vote') + '</span><span data-ed="right">' + esc(e.right) + '</span></div>' + xs + '</div>';
  }
  var PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };
  function diceHtml(e, xs) {
    var sr = seenRoll[e.id], rolling = sr && sr.local && Date.now() - sr.local < 650;
    if (rolling) setTimeout(function () { if (!drag) render(); }, 700);
    return '<div class="dice' + (rolling ? ' roll' : '') + asgCls(e) + '" data-id="' + e.id + '" data-act="roll" style="left:' + e.x + 'px;top:' + e.y + 'px;font-size:' + Math.max(5, e.size * 0.15).toFixed(1) + 'px;gap:' + (e.size * 0.12).toFixed(1) + 'px">' +
      e.values.map(function (v) { return '<span class="die" style="width:' + e.size + 'px;height:' + e.size + 'px">' + PIPS[v].map(function (p) { return '<i class="pip" style="left:' + p[0] + '%;top:' + p[1] + '%"></i>'; }).join('') + '</span>'; }).join('') +
      '<span class="dby">' + (e.rolled ? esc(e.rolled.by) + ' rolled ' + e.values.reduce(function (a, b) { return a + b; }, 0) : 'click to roll') + '</span>' + xs + '</div>';
  }

  function ratingHtml(e, xs) {
    var ids = Object.keys(e.votes || {}), mine = ME && e.votes[ME.id] ? e.votes[ME.id].v : 0;
    var avg = ids.length ? ids.reduce(function (a, k) { return a + e.votes[k].v; }, 0) / ids.length : 0;
    var stars = '';
    for (var i = 1; i <= e.max; i++) stars += '<button class="rstar' + (i <= mine ? ' on' : '') + (!mine && i <= Math.round(avg) ? ' avg' : '') + '" data-act="rate" data-v="' + i + '" type="button" data-tip="' + i + ' of ' + e.max + '">★</button>';
    return '<div class="rating' + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;font-size:' + Math.max(3, e.w / 26).toFixed(1) + 'px">' +
      (e.title ? '<div class="stitle" data-ed="title">' + esc(e.title) + '</div>' : '') + '<div class="rstars">' + stars + '</div>' +
      '<div class="rinfo">' + (ids.length ? 'average ' + avg.toFixed(1) + ' · ' + ids.length + ' vote' + (ids.length === 1 ? '' : 's') : 'tap a star to vote') + (isT() && ids.length ? ' · ' + ids.map(function (k) { return esc((e.votes[k].name || '?').split(' ')[0]) + ' ' + e.votes[k].v; }).join(', ') : '') + '</div>' + xs + '</div>';
  }
  function deckHtml(e, xs) {
    var top = e.dealt ? e.items[e.order[e.dealt - 1]] : null, left = e.items.length - e.dealt;
    var fs = Math.max(6, Math.min(e.w * 0.075, e.h * 0.13));
    return '<div class="deck' + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;height:' + e.h + 'px;font-size:' + fs.toFixed(1) + 'px">' +
      '<div class="dstack' + (top == null ? ' back' : '') + '"><div class="dcard' + (top != null ? ' face' : '') + '">' + (top != null ? esc(top) : '<span>' + esc(e.title || 'Random cards') + '</span>') + '</div></div>' +
      '<div class="dbar"><button class="dbtn" data-act="deal" type="button"' + (left ? '' : ' disabled') + '>' + (e.dealt ? 'Next card' : 'Deal') + ' · ' + left + '</button><button class="dbtn ghost" data-act="shuffle" type="button">Shuffle</button></div>' + xs + '</div>';
  }
  // коробочки-подарки: закрытая — с лентой и бантом, открытая — крышка слетает, из коробки выглядывает карточка
  // цвета игр и виджетов берём из темы платформы (Platform settings → цвет панелей)
  function refreshThemePalettes() {
    var P = themePalette(), c = themeColors();
    WHEEL_COLORS = P.map(function (x) { return mixHex(x, '#FFFFFF', .25); });
    BXC = P.slice(0, 6).map(function (x) { return [mixHex(x, '#FFFFFF', .15), mixHex(x, '#000000', .12)]; });
    CH_PAL.brand = [mixHex(c[2], '#000000', .15), mixHex(c[0], '#000000', .25), c[2], mixHex(c[0], '#000000', .05), mixHex(c[1], '#000000', .3), mixHex(c[2], c[0], .5), mixHex(c[0], '#000000', .45), mixHex(c[2], '#000000', .4)];
    GRADS[0] = [c[0], c[2]]; GRADS[1] = [c[1], c[2]];
    BG_SOLID[2] = c[2]; BG_SOLID[1] = mixHex(c[2], '#FFFFFF', .7);
  }
  var BXC = [['#C9CFAE', '#A9B183'], ['#F6CF6A', '#E3AE35'], ['#F2B9A0', '#DB8C6C'], ['#CDBFE3', '#A897C9'], ['#B8DCCB', '#86BCA3'], ['#EFD9B4', '#D6B47E']];
  function giftSvg(i, open, bg, uid) {
    var c = bg && bg.a ? [bg.a, bg.b || bg.a] : BXC[i % BXC.length], g = 'bg' + (uid || '') + i;
    var defs = '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>';
    var body = '<rect x="16" y="50" width="68" height="44" rx="5" fill="url(#' + g + ')"/><rect x="16" y="50" width="68" height="7" fill="#000" opacity=".08"/><rect x="45" y="50" width="10" height="44" fill="#FFF8E4"/><rect x="45" y="50" width="3" height="44" fill="#fff" opacity=".7"/>';
    if (!open) return '<svg class="gift" viewBox="0 0 100 100" aria-hidden="true">' + defs + '<ellipse cx="50" cy="95" rx="36" ry="3.5" fill="#000" opacity=".12"/>' + body +
      '<rect x="10" y="38" width="80" height="15" rx="4" fill="url(#' + g + ')"/><rect x="10" y="38" width="80" height="4" rx="2" fill="#fff" opacity=".35"/><rect x="45" y="38" width="10" height="15" fill="#FFF8E4"/>' +
      '<path d="M50 38 C38 22 22 26 30 36 C34 40 44 39 50 38Z" fill="#FFF8E4" stroke="#E8D9A8" stroke-width="1.2"/><path d="M50 38 C62 22 78 26 70 36 C66 40 56 39 50 38Z" fill="#FFF8E4" stroke="#E8D9A8" stroke-width="1.2"/><circle cx="50" cy="37.5" r="4.2" fill="#FFF3CF" stroke="#E8D9A8" stroke-width="1.2"/></svg>';
    return '<svg class="gift" viewBox="0 0 100 100" aria-hidden="true">' + defs + '<ellipse cx="50" cy="95" rx="36" ry="3.5" fill="#000" opacity=".12"/>' + body +
      '<g transform="rotate(-24 14 46)"><rect x="4" y="34" width="80" height="14" rx="4" fill="url(#' + g + ')"/><rect x="39" y="34" width="10" height="14" fill="#FFF8E4"/></g>' +
      '<g class="spark" fill="#F6CF6A"><path d="M86 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M76 16l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z"/></g></svg>';
  }
  function boxesHtml(e, xs) {
    var cols = e.cols || 4, fs = Math.max(5, e.w / cols * 0.15);
    return '<div class="boxes' + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;font-size:' + fs.toFixed(1) + 'px">' + (e.title ? '<div class="stitle" data-ed="title">' + esc(e.title) + '</div>' : '') +
      '<div class="bxgrid" style="grid-template-columns:repeat(' + cols + ',1fr)">' + e.items.map(function (it, i) { var o = e.open[i]; return '<button class="bx' + (o ? ' open' : '') + '" data-act="box" data-v="' + i + '" type="button">' + giftSvg(i, o, e.bg, e.id) + (o ? '<span class="bxin">' + esc(it) + '</span>' : '<span class="bxn">' + (i + 1) + '</span>') + '</button>'; }).join('') + '</div>' + xs + '</div>';
  }
  // магический шар: стеклянная сфера с фиолетовым дымом на тёмной подставке; ответ проявляется из тумана
  var PEDESTAL = '<svg class="bped" viewBox="0 0 100 46" aria-hidden="true"><defs><linearGradient id="pg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0c0c0e"/><stop offset=".35" stop-color="#3a3a40"/><stop offset=".6" stop-color="#1d1d21"/><stop offset="1" stop-color="#08080a"/></linearGradient></defs>' +
    '<path d="M8 6 Q50 -2 92 6 L90 14 Q50 22 10 14 Z" fill="url(#pg1)"/><path d="M8 6 Q50 14 92 6" fill="none" stroke="rgba(255,255,255,.18)" stroke-width=".8"/>' +
    '<path d="M16 14 Q50 22 84 14 Q76 24 80 32 L20 32 Q24 24 16 14 Z" fill="url(#pg1)"/>' +
    '<path d="M24 20 q6 -3 10 1 t10 0 t10 0 t10 0 t10 -1" fill="none" stroke="rgba(255,255,255,.14)" stroke-width=".7"/><path d="M26 26 q5 3 9 -1 t9 1 t9 -1 t9 1 t9 -1" fill="none" stroke="rgba(255,255,255,.1)" stroke-width=".7"/>' +
    '<path d="M12 32 L88 32 L94 40 Q50 48 6 40 Z" fill="url(#pg1)"/><path d="M12 32 Q50 37 88 32" fill="none" stroke="rgba(255,255,255,.16)" stroke-width=".7"/><path d="M14 38 q8 -3 14 0 t14 0 t14 0 t14 0 t14 0" fill="none" stroke="rgba(255,255,255,.1)" stroke-width=".7"/></svg>';
  function ballHtml(e, xs) {
    var fresh = e.res && seenBall[e.id] !== e.res.at; if (e.res) seenBall[e.id] = e.res.at;
    var ans = e.res && e.items[e.res.i] != null ? e.items[e.res.i] : '';
    return '<div class="ball' + (fresh && seenBall._init ? ' shake' : '') + (ans ? ' has' : '') + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.size + 'px;height:' + e.size + 'px;font-size:' + (e.size * 0.06).toFixed(1) + 'px">' +
      '<div class="bsph"><i class="smk s1"></i><i class="smk s2"></i><i class="smk s3"></i><i class="bglint"></i><i class="brefl"></i>' +
      '<div class="bans">' + (ans ? '<span' + (fresh && seenBall._init ? ' class="rise"' : '') + '>' + esc(ans) + '</span>' : '<b class="sp a">✦</b><b class="sp b">✧</b><b class="sp c">✦</b>') + '</div></div>' + PEDESTAL +
      '<button class="bask" data-act="ball" type="button">' + esc(e.title || 'Ask the ball') + '</button>' + (e.res ? '<span class="dby" style="font-size:.9em">' + esc(e.res.by) + '</span>' : '') + xs + '</div>';
  }
  var seenBall = {};
  // монетка: подбрасывается с переворотами, у всех одинаковый результат
  var seenCoin = {};
  function coinHtml(e, xs) {
    var r = e.res, fresh = r && seenCoin[e.id] !== undefined && seenCoin[e.id] !== r.n; if (r) seenCoin[e.id] = r.n; else seenCoin[e.id] = 0;
    var side = r ? r.side : 0;
    return '<div class="coin' + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.size + 'px;height:' + e.size + 'px;font-size:' + (e.size * 0.1).toFixed(1) + 'px">' +
      '<div class="cjump' + (fresh ? ' go' : '') + '"><div class="c3d s' + side + (fresh ? ' toss' + side : '') + '" data-act="coin"><div class="cf ch"><span>' + esc(e.heads) + '</span></div><div class="cf ct"><span>' + esc(e.tails) + '</span></div></div></div>' +
      '<div class="cres">' + (r ? '<b>' + esc(side ? e.tails : e.heads) + '</b> · ' + esc(String(r.by || '').split(' ')[0]) : '&nbsp;') + '</div><button class="bask" data-act="coin" type="button">Toss</button>' + xs + '</div>';
  }
  world.addEventListener('keydown', function (ev) {
    var t = ev.target; if (!t.dataset || !t.dataset.tadd) return;
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); var v = t.value.trim(); if (v) { op({ t: 'todo-add', id: t.dataset.tadd, text: v }); t.value = ''; } }
    if (ev.key === 'Escape') t.blur();
  });
  function todoEditable(e) { return isT() || (B.studentEdit !== false && !e.lock); }
  function todoHtml(e, xs) {
    var done = e.items.filter(function (x) { return x.done; }).length;
    return '<div class="todo' + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;font-size:' + e.size + 'px">' +
      (e.title ? '<div class="ttitle"><span data-ed="title">' + esc(e.title) + '</span><span class="tcnt">' + done + '/' + e.items.length + '</span></div>' : '') +
      e.items.map(function (it, i) { return '<div class="titem' + (it.done ? ' done' : '') + '"' + (it.by ? ' data-tip="' + esc(it.by) + '"' : '') + '><button class="tbox" data-act="todo" data-v="' + i + '" type="button">' + (it.done ? '✓' : '') + '</button><span class="tt" data-ti="' + i + '">' + (it.h || esc(it.t)) + '</span>' + (todoEditable(e) ? '<button class="tdel" data-act="tododel" data-v="' + i + '" type="button" aria-label="Delete">×</button>' : '') + '</div>'; }).join('') +
      (todoEditable(e) ? '<div class="tadd"><input data-tadd="' + e.id + '" maxlength="300" placeholder="+ Add an item"></div>' : (e.items.length ? '' : '<div class="rinfo">No items yet</div>')) + xs + '</div>';
  }
  function pollHtml(e, xs) {
    var ids = Object.keys(e.votes || {}), n = ids.length, mine = ME && e.votes[ME.id] ? e.votes[ME.id].v : -1;
    var rows = e.options.map(function (o, i) {
      var who = ids.filter(function (k) { return e.votes[k].v === i; }), pct = n ? Math.round(who.length / n * 100) : 0;
      return '<button class="prow' + (i === mine ? ' me' : '') + '" data-act="poll" data-v="' + i + '" type="button"><span class="pbar" style="width:' + pct + '%"></span><span class="ptxt">' + esc(o) + '</span><span class="pcnt">' + who.length + (n ? ' · ' + pct + '%' : '') + '</span>' +
        (isT() && !e.hideNames && who.length ? '<span class="pwho">' + who.map(function (k) { return esc((e.votes[k].name || '?').split(' ')[0]); }).join(', ') + '</span>' : '') + '</button>';
    }).join('');
    return '<div class="poll' + asgCls(e) + '" data-id="' + e.id + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;font-size:' + Math.max(3, e.w / 30).toFixed(1) + 'px">' +
      (e.title ? '<div class="stitle" data-ed="title">' + esc(e.title) + '</div>' : '') + (rows || '<div class="rinfo">Add options in More settings</div>') + '<div class="rinfo">' + n + ' vote' + (n === 1 ? '' : 's') + (mine >= 0 ? ' · tap your answer again to take it back' : '') + '</div>' + xs + '</div>';
  }

  /* ---------- interactive HTML blocks (iframes are kept between renders) ---------- */
  function renderHtmlBlocks(hidden) {
    var layer = $('#lh'), seen = {};
    B.elements.forEach(function (e) {
      if (hidden[e.id]) return;
      if (e.type === 'media') { seen[e.id] = 1; renderMedia(e, layer); return; }
      if (e.type === 'video') { seen[e.id] = 1; renderVideo(e, layer); return; }
      if (e.type === 'input') { seen[e.id] = 1; renderInput(e, layer); return; }
      if (e.type === 'cloud') { seen[e.id] = 1; renderCloud(e, layer); return; }
      if (e.type === 'open') { seen[e.id] = 1; renderOpen(e, layer); return; }
      if (e.type !== 'html') return;
      seen[e.id] = 1;
      var n = layer.querySelector('[data-id="' + e.id + '"]');
      if (!n) {
        n = document.createElement('div'); n.className = 'hblk'; n.dataset.id = e.id;
        n.innerHTML = '<div class="hbar" data-hbar="1"><b></b><span class="hby"></span></div><iframe title="Interactive task"></iframe>';
        layer.appendChild(n);
        $('iframe', n).src = e.src;
      }
      n.style.left = e.x + 'px'; n.style.top = e.y + 'px'; n.style.width = e.w + 'px'; n.style.height = e.h + 'px';
      var z = e.zoom || 1, fr = $('iframe', n);
      fr.style.width = (e.w / z) + 'px'; fr.style.height = ((e.h - 30) / z) + 'px'; fr.style.transform = 'scale(' + z + ')';
      n.classList.toggle('tonlyb', !!(e.tonly && isT()));
      n.classList.toggle('asgme', assignedToMe(e)); n.classList.toggle('asgd', !!(isT() && e.assign && e.assign.length));
      var ab = $('.asg', n); if (ab) ab.remove();
      if (e.assign && e.assign.length) n.insertAdjacentHTML('beforeend', asgHtml(e));
      $('b', n).textContent = e.title || 'Interactive task';
      $('.hby', n).textContent = e.state && e.state.by ? 'last change: ' + e.state.by + ' · ' + clock(e.state.at) : 'everyone sees the same answers';
      var key = e.state ? String(e.state.at) : '0';
      if (n.dataset.applied !== key && e.state) {
        n.dataset.applied = key;
        try { $('iframe', n).contentWindow.postMessage({ __bsyncApply: 1, f: e.state.f }, location.origin); } catch (err) {}
      }
    });
    $$('.hblk,.media,.vblk,.answ,.cloud', layer).forEach(function (n) { if (!seen[n.dataset.id]) n.remove(); });
  }
  /* поле для ответа (перефраз, исправление ошибки): ввод не сбивается при обновлениях */
  function renderInput(e, layer) {
    var n = layer.querySelector('[data-id="' + e.id + '"]');
    if (!n) {
      n = document.createElement('div'); n.className = 'answ'; n.dataset.id = e.id;
      n.innerHTML = '<div class="alabel" data-hbar="1"></div><div class="arow"><input class="ain" type="text" autocomplete="off" spellcheck="false" placeholder="Type your answer"><span class="amark"></span><button class="echeck" data-echeck="" type="button" data-tip="Check this answer">✓ Check</button></div><div class="ahint"></div>';
      layer.appendChild(n);
      var inp = $('.ain', n), t = 0;
      inp.addEventListener('input', function () { clearTimeout(t); var id = n.dataset.id; t = setTimeout(function () { op({ t: 'input-set', id: id, value: inp.value }); }, 450); });
      inp.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') { clearTimeout(t); op({ t: 'input-set', id: n.dataset.id, value: inp.value }); inp.blur(); } });
    }
    var res = (B.check && B.check.res) || {}, r = res[e.id];
    n.style.left = e.x + 'px'; n.style.top = e.y + 'px'; n.style.width = e.w + 'px'; n.style.fontSize = e.size + 'px';
    $('.alabel', n).textContent = e.label || '';
    var inp2 = $('.ain', n); if (document.activeElement !== inp2) inp2.value = e.value || '';
    inp2.disabled = !!(e.lock && !isT());
    n.classList.toggle('ok', r === true); n.classList.toggle('bad', r === false);
    $('.amark', n).textContent = r === true ? '✓' : r === false ? '✗' : '';
    $('.echeck', n).hidden = !e.answers.length || !!e.tk; $('.echeck', n).dataset.echeck = e.id;
    $('.ahint', n).textContent = e.hint ? 'Hint: ' + e.hint : '';
    $('.ahint', n).hidden = !e.hint;
    n.title = isT() && e.answers.length ? 'Correct: ' + e.answers.join(' / ') : '';
    n.classList.toggle('tonlyb', !!(e.tonly && isT())); n.classList.toggle('asgme', assignedToMe(e));
    n.style.zIndex = '';
  }
  /* облако слов: настоящее «облако»; новые слова встают в случайное свободное место внутри, разного размера и цвета */
  var CLOUD_COLS = ['#7D8A68', '#C08A2E', '#5B4BC4', '#C2412D', '#2E8B57', '#2F6FE0', '#8E44AD', '#B05B3B', '#D0657A', '#3C8D93'];
  var CLOUD_PATH = 'M190 560 C80 560 30 480 60 410 C10 370 20 270 110 255 C100 160 210 110 290 150 C330 60 470 40 540 120 C610 50 760 70 790 180 C900 170 970 260 930 340 C1000 390 980 520 860 540 C840 580 780 590 730 560 Z';
  function hashStr(t) { var h = 2166136261; for (var j = 0; j < t.length; j++) { h ^= t.charCodeAt(j); h = Math.imul(h, 16777619) >>> 0; } return h; }
  // раскладка: от «случайной» (по хешу — у всех одинаково) точки ищем по спирали свободное место внутри эллипса облака
  function placeItems(items, W, H, prev) {
    var cx = W / 2, cy = H * 0.53, rx = W * 0.4, ry = H * 0.33, placed = [], out = {};
    function inside(x, y, w, h) { return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].every(function (p) { var dx = (p[0] - cx) / rx, dy = (p[1] - cy) / ry; return dx * dx + dy * dy <= 1; }); }
    function free(x, y, w, h) { for (var i = 0; i < placed.length; i++) { var q = placed[i]; if (x < q.x + q.w + 4 && x + w + 4 > q.x && y < q.y + q.h + 2 && y + h + 2 > q.y) return false; } return true; }
    items.forEach(function (it) {
      var w = it.w, h = it.h, p = prev && prev[it.k];
      if (p && Math.abs(p.w - w) < 2 && Math.abs(p.h - h) < 2 && inside(p.x, p.y, w, h) && free(p.x, p.y, w, h)) { placed.push(p); out[it.k] = p; return; }
      var hs = hashStr(it.k), a0 = (hs % 360) * Math.PI / 180, r0 = ((hs >>> 9) % 100) / 100;
      var sx = cx - w / 2, sy = cy - h / 2, got = null;   // от центра по спирали: крупные слова в середине, мелкие вокруг
      for (var t = 0; t < 2400 && !got; t++) {
        var ang = t * 0.35 + a0, rad = t * Math.max(W, H) / 2400 * 0.9;
        var x = sx + Math.cos(ang) * rad, y = sy + Math.sin(ang) * rad * (ry / rx);
        if (inside(x, y, w, h) && free(x, y, w, h)) got = { x: x, y: y, w: w, h: h };
      }
      void r0;
      if (!got) got = { x: cx - w / 2, y: cy - h / 2, w: w, h: h, over: true };
      placed.push(got); out[it.k] = got;
    });
    return out;
  }
  function cloudShell(n, cls, ph, max) {
    n.innerHTML = '<div class="ctitle" data-hbar="1" data-ed="title"></div><div class="cbody"><svg class="cshape" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><path d="' + CLOUD_PATH + '"/></svg><div class="cwords"></div></div>' +
      '<form class="cadd">' + (cls === 'open' ? '<textarea rows="1" maxlength="' + max + '" placeholder="' + ph + '"></textarea>' : '<input maxlength="' + max + '" placeholder="' + ph + '">') + '<button type="submit">Add</button></form>';
    var f = $('.cadd', n), fld = f.querySelector('input,textarea');
    fld.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.shiftKey && fld.tagName === 'TEXTAREA') { ev.preventDefault(); f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true })); } });
  }
  function layoutCloud(n, e, items, pop) {
    var box = $('.cwords', n), W = box.clientWidth, H = box.clientHeight;
    if (!W || !H) return;
    var key = W + 'x' + H; if (n._lk !== key) { n._pos = {}; n._lk = key; }
    // если всё не помещается без наложений — уменьшаем всё облако текста и раскладываем заново
    for (var pass = 0, k = 1; pass < 10; pass++) {
      box.style.fontSize = k === 1 ? '' : k + 'em';
      var sizes = items.map(function (it) { var s = box.querySelector('[data-k="' + CSS.escape(it.k) + '"]'); if (!s) return null; s.style.width = ''; s.style.left = '0px'; s.style.top = '0px'; return { k: it.k, w: Math.ceil(s.offsetWidth) + 1, h: s.offsetHeight, n: s }; }).filter(Boolean);
      var pos = placeItems(sizes, W, H, pass ? null : n._pos);
      if (!sizes.some(function (q) { return pos[q.k].over; }) || pass === 9) break;
      k *= 0.86;
    }
    n._pos = pos;
    sizes.forEach(function (s) { var p = pos[s.k]; s.n.style.left = p.x + 'px'; s.n.style.top = p.y + 'px'; s.n.style.width = Math.ceil(p.w) + 'px'; s.n.style.visibility = ''; if (pop[s.k]) s.n.classList.add('pop'); });
  }
  function renderCloud(e, layer) {
    var n = layer.querySelector('[data-id="' + e.id + '"]');
    if (!n) {
      n = document.createElement('div'); n.className = 'cloud'; n.dataset.id = e.id; cloudShell(n, 'cloud', 'Add a word or phrase', 60); layer.appendChild(n);
      $('.cadd', n).addEventListener('submit', function (ev) { ev.preventDefault(); var i = $('input', this), w = i.value.trim(); if (!w) return; op({ t: 'cloud-add', id: n.dataset.id, w: w }); i.value = ''; });
      $('.cwords', n).addEventListener('click', function (ev) { var w = ev.target.closest('[data-w]'); if (w && isT() && ev.altKey) op({ t: 'cloud-del', id: n.dataset.id, w: w.dataset.w }); });
      n._seen = null;
    }
    n.style.left = e.x + 'px'; n.style.top = e.y + 'px'; n.style.width = e.w + 'px'; n.style.height = e.h + 'px';
    n.style.fontSize = Math.max(6, Math.min(e.w / 34, e.h / 20)) + 'px';
    if (!(editing && editing.node && n.contains(editing.node))) $('.ctitle', n).textContent = e.title || 'Word cloud';
    var max = Math.max.apply(null, [1].concat(e.words.map(function (w) { return w.by.length; })));
    var sig = JSON.stringify(e.words) + e.w + 'x' + e.h;
    if (n._sig !== sig) {
      n._sig = sig;
      var first = !n._seen, seen = n._seen || {}, pop = {};
      var items = e.words.slice().sort(function (a, b) { return b.by.length - a.by.length; }).map(function (w) { return { k: w.t.toLowerCase(), w: w }; });
      $('.cwords', n).innerHTML = items.map(function (it) {
        var w = it.w, k = w.by.length / max, h = hashStr(w.t.toLowerCase()), rnd = (h >>> 3) % 5;
        if (!first && !seen[it.k]) pop[it.k] = 1;
        void rnd;
        return '<span class="cwd" data-k="' + esc(it.k) + '" data-w="' + esc(w.t) + '" style="visibility:hidden;font-size:' + (1 + Math.pow(k, 0.8) * 1.9).toFixed(2) + 'em;color:' + CLOUD_COLS[h % CLOUD_COLS.length] + ';font-weight:' + (k > 0.5 ? 800 : 650) + '" data-tip="' + w.by.length + (w.by.length === 1 ? ' person' : ' people') + (isT() ? ' · Alt+click to remove' : '') + '">' + esc(w.t) + '</span>';
      }).join('') || '<em class="cempty">Words appear here</em>';
      items.forEach(function (it) { seen[it.k] = 1; }); n._seen = seen;
      layoutCloud(n, e, items, pop);
    }
    $('.cadd', n).hidden = !!(e.lock && !isT());
    n.classList.toggle('tonlyb', !!(e.tonly && isT())); n.classList.toggle('asgme', assignedToMe(e));
  }
  /* Open ended: начало фразы — ученики пишут своё продолжение, ответы появляются в облаке */
  function renderOpen(e, layer) {
    var n = layer.querySelector('[data-id="' + e.id + '"]');
    if (!n) {
      n = document.createElement('div'); n.className = 'cloud open sq'; n.dataset.id = e.id; cloudShell(n, 'open', 'Finish the sentence…', 400); layer.appendChild(n);
      $('.cadd', n).addEventListener('submit', function (ev) { ev.preventDefault(); var i = $('textarea', this), w = i.value.trim(); if (!w) return; op({ t: 'open-add', id: n.dataset.id, text: w }); i.value = ''; });
      $('.cwords', n).addEventListener('click', function (ev) { var x = ev.target.closest('[data-adel]'); if (x) op({ t: 'open-del', id: n.dataset.id, aid: x.dataset.adel }); });
    }
    n.style.left = e.x + 'px'; n.style.top = e.y + 'px'; n.style.width = e.w + 'px'; n.style.height = e.h + 'px';
    n.style.fontSize = Math.max(6, Math.min(e.w / 40, e.h / 24)) + 'px';
    if (!(editing && editing.node && n.contains(editing.node))) $('.ctitle', n).textContent = e.title || 'Finish the sentence…';
    var sig = JSON.stringify(e.answers) + e.w + 'x' + e.h + (B.anon && B.anon.on ? 'a' : '');
    if (n._sig !== sig) {
      n._sig = sig;
      var first = !n._seen, seen = n._seen || {}, pop = {}, anon = B.anon && B.anon.on && !isT();
      var items = e.answers.map(function (a) { return { k: a.id, a: a }; });
      $('.cwords', n).innerHTML = items.map(function (it) {
        var a = it.a, h = hashStr(a.id), mine = ME && a.by === ME.id;
        if (!first && !seen[it.k]) pop[it.k] = 1;
        return '<span class="ob' + (!first && !seen[it.k] ? ' pop' : '') + '" data-k="' + esc(a.id) + '" style="--c:' + CLOUD_COLS[h % CLOUD_COLS.length] + '">' + esc(a.t) +
          (a.name && !anon ? '<small>' + esc(a.name.split(' ')[0]) + '</small>' : mine ? '<small>you</small>' : '') + (isT() || mine ? '<b class="odel" data-adel="' + esc(a.id) + '" title="Remove">×</b>' : '') + '</span>';
      }).join('') || '<em class="cempty">Answers appear here</em>';
      items.forEach(function (it) { seen[it.k] = 1; }); n._seen = seen;
      var cw = $('.cwords', n); cw.scrollTop = cw.scrollHeight;
    }
    $('.cadd', n).hidden = !!(e.lock && !isT());
    n.classList.toggle('tonlyb', !!(e.tonly && isT())); n.classList.toggle('asgme', assignedToMe(e));
  }
  function renderMedia(e, layer) {
    var n = layer.querySelector('[data-id="' + e.id + '"]');
    if (!n || n.dataset.src !== e.src) {
      if (n) n.remove();
      n = document.createElement('div'); n.className = 'media'; n.dataset.id = e.id; n.dataset.src = e.src;
      n.innerHTML = '<div class="mbar" data-hbar="1">' + svg('media') + '<b></b></div>' + (e.kind === 'video' ? '<video controls preload="metadata" playsinline></video>' : '<audio controls preload="metadata"></audio>');
      $('video,audio', n).src = e.src;
      layer.appendChild(n);
      wireMedia(n, $('video,audio', n));
    }
    n._e = e; applyPlay(n, e);
    n.classList.toggle('vid', e.kind === 'video');
    n.style.left = e.x + 'px'; n.style.top = e.y + 'px'; n.style.width = e.w + 'px'; n.style.height = (e.kind === 'video' ? e.h : 84) + 'px';
    n.style.fontSize = Math.max(6, Math.min(16, e.w / 30)) + 'px';
    $('b', n).textContent = e.title || (e.kind === 'video' ? 'Video' : 'Audio');
    n.classList.toggle('tonlyb', !!(e.tonly && isT()));
    n.classList.toggle('asgme', assignedToMe(e));
    var ab = $('.asg', n); if (ab) ab.remove(); var lb = $('.lockb', n); if (lb) lb.remove();
    if (e.assign && e.assign.length) n.insertAdjacentHTML('beforeend', asgHtml(e));
    if (e.lock && isT()) n.insertAdjacentHTML('beforeend', lockBadge);
  }
  /* совместный просмотр: пауза, продолжение и перемотка видны всем; обрезка играет только выбранный кусок */
  function wireMedia(n, m) {
    var send = function (on) { if (n._applying) return; var e = n._e; if (!e) return; n._sent = Date.now(); op({ t: 'msync', id: e.id, on: on, t: Math.round(m.currentTime * 10) / 10 }); };
    m.addEventListener('play', function () { var e = n._e; if (e && e.start && m.currentTime < e.start - 0.2) m.currentTime = e.start; send(true); });
    m.addEventListener('pause', function () { if (!m.seeking) send(false); });
    m.addEventListener('seeked', function () { send(!m.paused); });
    m.addEventListener('timeupdate', function () { var e = n._e; if (e && e.end && m.currentTime >= e.end) { m.pause(); m.currentTime = e.start || 0; } });
  }
  function applyPlay(n, e) {
    var m = $('video,audio', n); if (!m || !e.play || n._at === e.play.at) return;
    n._at = e.play.at;
    if (n._sent && Date.now() - n._sent < 1500) return;   // это сделали мы сами
    var target = e.play.t + (e.play.on ? Math.max(0, (Date.now() + SKEW - e.play.at) / 1000) : 0);
    n._applying = true;
    try { if (Math.abs(m.currentTime - target) > 1.2) m.currentTime = target; } catch (err) {}
    var done = function () { setTimeout(function () { n._applying = false; }, 300); };
    if (e.play.on) { var pr = m.play(); if (pr && pr.catch) pr.then(done).catch(function () { done(); joinHint(n, function () { m.play(); }); }); else done(); }
    else { m.pause(); done(); }
  }
  function joinHint(n, go) {
    if ($('.joinh', n)) return;
    var h = document.createElement('button'); h.className = 'joinh'; h.type = 'button'; h.textContent = '▶ Tap to watch together';
    h.onclick = function () { h.remove(); go(); }; n.appendChild(h);
  }
  window.addEventListener('message', function (ev) {
    if (ev.origin !== location.origin || !ev.data || !B) return;
    var blk = $$('#lh .hblk').find(function (n) { var f = $('iframe', n); return f && f.contentWindow === ev.source; });
    if (!blk) return;
    var e = find(blk.dataset.id); if (!e) return;
    if (ev.data.__bsyncReady) { ev.source.postMessage({ __bsyncApply: 1, f: e.state ? e.state.f : [] }, location.origin); blk.dataset.applied = String(e.state ? e.state.at : 0); return; }
    if (ev.data.__bsync) op({ t: 'html-state', id: e.id, f: ev.data.f, checked: !!ev.data.checked }, function (ok) { if (!ok) toast('This block is locked'); });
  });
  function addHtmlBlock(anchorBtn) {
    var p = ctxPop('<div class="lbl">Interactive HTML block</div>' +
      '<label class="pb" style="text-align:center">Upload .html file<input type="file" accept=".html,.htm,text/html" id="hbFile" hidden></label>' +
      '<div class="lbl">or paste the code</div><textarea id="hbCode" placeholder="<!doctype html>…" style="width:320px;min-height:140px;font-family:monospace;font-size:12px"></textarea>' +
      '<button class="pb" data-v="add" type="button">Add to board</button>' +
      '<p style="margin:0;font:12px var(--uifont);color:var(--uimuted);max-width:320px">Students work right inside the block. What they type or choose is saved and everyone sees the same answers.</p>',
      $('[data-fly="widgets"]'), function (val) { if (val === 'add') sendHtml($('#hbCode').value); }, true);
    $('#hbFile', p).addEventListener('change', async function () { var f = this.files[0]; if (f) sendHtml(await f.text()); });
  }
  async function sendHtml(code, at) {
    if (!code || !code.trim()) return toast('Paste the code or choose a file');
    try {
      var r = await api('POST', '/api/t/boards/' + BOARD_ID + '/html', { html: code });
      closeCtxPop();
      var c = at || viewCenter(), e = { id: rid(), type: 'html', x: Math.round(c.x - (at ? 0 : 360)), y: Math.round(c.y - (at ? 0 : 260)), w: 720, h: 540, zoom: 0.8, src: r.src, title: r.title || 'Interactive task' };
      freeSpot(e);
      op({ t: 'el-set', el: e }, function (ok) { if (ok) { pushUndo(function () { op({ t: 'del', id: e.id }); }); setTimeout(function () { selectOnly(e.id); }, 150); } });
    } catch (err) { toast(err.message); }
  }

  /* ---------- connectors ---------- */
  function centerOf(id) { var t = find(id); if (!t || hiddenByCollapse(t)) return null; var b = boxOf(t); return { b: b, c: [b.x + b.w / 2, b.y + b.h / 2] }; }
  function edgePt(b, toward) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = toward[0] - cx, dy = toward[1] - cy;
    if (!dx && !dy) return [cx, cy];
    var s = Math.min(dx ? (b.w / 2 + 6) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + 6) / Math.abs(dy) : Infinity);
    return [cx + dx * s, cy + dy * s];
  }
  function lineEnds(e) {
    var A = e.from && centerOf(e.from), Bc = e.to && centerOf(e.to);
    var c1 = A ? A.c : [e.x, e.y], c2 = Bc ? Bc.c : [e.x2, e.y2];
    return [A ? edgePt(A.b, c2) : c1, Bc ? edgePt(Bc.b, c1) : c2];
  }
  function lineD(e, p) {
    var a = p[0], b = p[1];
    if (!e.curve) return 'M' + a[0] + ' ' + a[1] + 'L' + b[0] + ' ' + b[1];
    var dx = (b[0] - a[0]) / 2;
    return 'M' + a[0] + ' ' + a[1] + 'C' + (a[0] + dx) + ' ' + a[1] + ' ' + (b[0] - dx) + ' ' + b[1] + ' ' + b[0] + ' ' + b[1];
  }
  function head(kind, tip, from, w, color) {
    if (kind === 'none') return '';
    var ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]), L = 8 + w * 2.4;
    if (kind === 'dot') return '<circle cx="' + tip[0] + '" cy="' + tip[1] + '" r="' + (3 + w) + '" fill="' + color + '"/>';
    var p1 = [tip[0] - L * Math.cos(ang - 0.42), tip[1] - L * Math.sin(ang - 0.42)], p2 = [tip[0] - L * Math.cos(ang + 0.42), tip[1] - L * Math.sin(ang + 0.42)];
    return '<path d="M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + 'L' + tip[0].toFixed(1) + ' ' + tip[1].toFixed(1) + 'L' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + '" fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function renderLinks(extra) {
    if (!B) return;
    var h = '';
    B.elements.forEach(function (e) {
      if (e.type !== 'line' || hiddenByCollapse(e)) return;
      var p = lineEnds(e), d = lineD(e, p), c = e.color || '#1E1E1C', w = e.sw || 2;
      var t1 = e.curve ? [p[0][0] + (p[1][0] - p[0][0]) / 2, p[0][1]] : p[1], t2 = e.curve ? [p[1][0] - (p[1][0] - p[0][0]) / 2, p[1][1]] : p[0];
      if (sel.indexOf(e.id) >= 0) h += '<path class="lsel" d="' + d + '" stroke-width="' + (w + 8) + '"/>';
      h += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round"' + (e.dash ? ' stroke-dasharray="' + (w * 4) + ' ' + (w * 3) + '"' : '') + (e.tonly && isT() ? ' stroke-opacity=".5"' : '') + '/>';
      h += head(e.end || 'arrow', p[1], e.curve ? t2 : p[0], w, c) + head(e.start || 'none', p[0], e.curve ? t1 : p[1], w, c);
      if (e.text) h += '<text x="' + ((p[0][0] + p[1][0]) / 2) + '" y="' + ((p[0][1] + p[1][1]) / 2 - 8) + '" text-anchor="middle">' + esc(e.text) + '</text>';
      h += '<path class="lhit" data-id="' + e.id + '" d="' + d + '" stroke-width="16"/>';
    });
    if (extra) h += extra;
    links.innerHTML = h;
  }

  function pathD(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return 'M' + pts[0][0] + ' ' + pts[0][1] + 'l0.01 0';
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) { var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += 'Q' + pts[i][0] + ' ' + pts[i][1] + ' ' + mx + ' ' + my; }
    var l = pts[pts.length - 1]; return d + 'L' + l[0] + ' ' + l[1];
  }
  function strokeSvg(s) { return '<path' + (s.by !== undefined || B.strokes.indexOf(s) >= 0 ? ' data-sid="' + s.id + '"' : '') + ' d="' + pathD(s.pts) + '" stroke="' + esc(s.color) + '" stroke-width="' + s.w + '"' + (s.kind === 'marker' ? ' stroke-opacity="0.35"' : '') + '/>'; }
  function renderInk() {
    if (!B) return;
    var coll = frames().filter(function (f) { return f.collapsed; });
    var h = B.strokes.filter(function (s) { return !coll.some(function (f) { return inRect(s.pts[0], f); }); }).map(strokeSvg).join('');
    for (var k in remoteInk) h += strokeSvg(remoteInk[k]);
    if (drag && drag.kind === 'draw') h += strokeSvg(drag.stroke);
    ink.innerHTML = h;
  }
  // плашка «Checked by … ✓ ✗» больше не показывается; отметки остаются на карточках
  function renderResult() { var r = $('#result'); if (r) r.hidden = true; }
  var resultHidden = null, resultTimer = 0;
  $('#result').addEventListener('click', function (e) {
    var b = e.target.closest('[data-r]'); if (!b) return;
    if (b.dataset.r === 'hide') { resultHidden = B.check && B.check.at; $('#result').hidden = true; }
    if (b.dataset.r === 'clear') op({ t: 'check-clear' });
  });
  // кто на доске: стопка кружков + число; по клику — список (у учителя — действия с каждым)
  function uniqPeople() { var seen = {}; return PEOPLE.filter(function (p) { if (seen[p.id]) return false; seen[p.id] = 1; return true; }); }
  function myHand() { return !!(ME && PEOPLE.some(function (p) { return p.id === ME.id && p.hand; })); }
  function handsUp() { var seen = {}; return PEOPLE.filter(function (p) { if (!p.hand || seen[p.id]) return false; seen[p.id] = 1; return true; }); }
  function renderHand() {
    var c = $('#handChip'); if (!c) return;
    var hs = handsUp();
    if (isT()) { c.hidden = !hs.length; c.textContent = hs.length ? '✋ ' + String(hs[0].name || '?').split(' ')[0] + (hs.length > 1 ? ' +' + (hs.length - 1) : '') : ''; c.dataset.tip = 'Raised hands — click to see who needs help and lower them'; }
    else { c.hidden = !myHand(); c.textContent = '✋ Lower hand'; c.dataset.tip = 'Your hand is up — the teacher can see it. Tap to lower it'; }
  }
  $('#handChip').onclick = function () {
    var c = this;
    if (!isT()) { socket.emit('b:hand', { on: false }); return; }
    var hs = handsUp(); if (!hs.length) return;
    setTimeout(function () { ctxPop(hs.map(function (p) { return '<button class="mi" data-v="d:' + esc(p.id) + '" type="button"><span class="ava sm" style="--c:' + p.color + '">' + esc((p.name || '?').slice(0, 1)) + '</span>✋ ' + esc(p.name) + ' · lower</button>'; }).join('') + (hs.length > 1 ? '<button class="mi" data-v="all" type="button">Lower all hands</button>' : ''), c, function (v) { if (v === 'all') socket.emit('b:hand-down', { all: true }); else if (v.indexOf('d:') === 0) socket.emit('b:hand-down', { id: v.slice(2) }); }, false, 'menu'); }, 0);
  };
  socket.on('b:hand-up', function (d) { if (isT()) { toast('✋ ' + (d.name || 'Someone').split(' ')[0] + ' needs help'); try { beep('h' + d.id + Date.now()); } catch (e) {} } });
  function renderPeople() {
    renderHand();
    var ppl = uniqPeople(), show = ppl.slice(0, 4);
    $('#people').innerHTML = '<button class="pstack" type="button" data-tip="Who is on the board">' + show.map(function (p) { return '<span class="pav' + (p.hand ? ' hand' : '') + '" style="--c:' + p.color + '">' + esc((p.name || (p.role === 't' ? 'T' : '?')).slice(0, 1)) + '</span>'; }).join('') + '<b>' + ppl.length + '</b><span class="car">▾</span></button>';
  }
  function renderLog() {
    if (!B) return;
    $('#blog').innerHTML = (B.log || []).slice().reverse().map(function (l) {
      return '<li><time>' + clock(l.t) + '</time><b style="--c:' + l.color + '">' + esc(l.who) + '</b> ' + esc(l.a) + '</li>';
    }).join('') || '<li style="color:var(--uimuted)">Nothing yet.</li>';
  }
  function drawCursors() {
    var h = '';
    for (var k in cursors) {
      var c = cursors[k];
      h += '<div class="cur-o" style="left:' + c.x + 'px;top:' + c.y + 'px;--c:' + c.color + ';transform:scale(' + (1 / V.z) + ')"><svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1l13 8-6 1.5L5 18z" fill="' + c.color + '" stroke="#fff" stroke-width="1.5"/></svg><span>' + esc(c.name.split(' ')[0]) + '</span></div>';
    }
    $('#lcur').innerHTML = h;
  }

  /* ---------- selection overlay & handles ---------- */
  function handleSet(e) {
    if (e.type === 'line') return ['p1', 'p2'];
    if (cropId === e.id) return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    if (e.type === 'image') return ['nw', 'ne', 'se', 'sw'];   // картинку не растягиваем — только пропорционально; обрезка — двойной клик
    if (/^(frame|zone|note|flip|shape|html)$/.test(e.type) || (e.type === 'media' && e.kind === 'video')) return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    if (/^(text|sentence|scale|rating|poll|media|todo|boxes|input)$/.test(e.type)) return ['nw', 'ne', 'e', 'se', 'sw', 'w'];
    if (/^(deck|cloud|open|video|chart)$/.test(e.type)) return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    if (e.type === 'ball' || e.type === 'coin') return ['nw', 'ne', 'se', 'sw'];
    if (e.type === 'link' || e.type === 'kanban' || e.type === 'kcard' || isGame(e)) return ['e', 'w'];
    if (e.type === 'table') return ['e', 's', 'se'];
    if (/^(wheel|dice|sticker)$/.test(e.type)) return ['nw', 'ne', 'se', 'sw'];
    return [];
  }
  function renderSel() {
    sel = sel.filter(function (id) { return find(id); });
    var h = '', single = sel.length === 1 ? find(sel[0]) : null;
    sel.forEach(function (id) {
      var e = find(id); if (e.type === 'line') return;
      if (single && canRotate(e)) return;   // одиночный — рисуем ниже вместе с ручками (с учётом поворота)
      var b = boxOf(e);
      h += '<div class="sbox' + (single ? '' : ' multi') + '" style="left:' + (b.x - 2) + 'px;top:' + (b.y - 2) + 'px;width:' + (b.w + 4) + 'px;height:' + (b.h + 4) + 'px"></div>';
    });
    if (!single && sel.length > 1 && groupScalable()) {
      var U = union(sel.map(function (id) { var x = find(id); return x.type === 'line' ? lineBox(x) : boxOf(x); }));
      h += '<div class="sbox gbox" style="left:' + (U.x - 6) + 'px;top:' + (U.y - 6) + 'px;width:' + (U.w + 12) + 'px;height:' + (U.h + 12) + 'px"></div>';
      ['nw', 'ne', 'se', 'sw'].forEach(function (d) {
        h += '<span class="hd" data-h="g' + d + '" style="left:' + (U.x - 6 + (d.indexOf('e') >= 0 ? U.w + 12 : 0)) + 'px;top:' + (U.y - 6 + (d.indexOf('s') >= 0 ? U.h + 12 : 0)) + 'px;cursor:' + (d === 'nw' || d === 'se' ? 'nwse' : 'nesw') + '-resize"></span>';
      });
      if (sel.map(find).every(function (x) { return x && canRotate(x); })) h += '<span class="hd hrot" data-h="rotg" data-tip="Turn the whole group (Shift — by 15°)" style="left:' + (U.x - 6 + (U.w + 12) / 2) + 'px;top:' + (U.y + U.h + 6 + 26 / V.z) + 'px"></span>';
      // кнопка с 4 точками сбоку: выровнять, распределить, поменять расстояние
      h += '<button class="alignbtn" type="button" data-tip="Align, distribute and spacing" style="left:' + (U.x + U.w + 6) + 'px;top:' + (U.y + U.h / 2) + 'px">' + svg('dots4') + '</button>';
      // как в Miro: если предметы стоят в ряд или столбиком — промежутки можно тянуть
      var lay = gapLayout();
      if (lay) lay.gaps.forEach(function (g, i) {
        h += lay.ax === 'x' ? '<span class="gaph v" data-gap="' + i + '" style="left:' + g + 'px;top:' + lay.U.y + 'px;height:' + lay.U.h + 'px"></span>' : '<span class="gaph h" data-gap="' + i + '" style="top:' + g + 'px;left:' + lay.U.x + 'px;width:' + lay.U.w + 'px"></span>';
      });
    }
    if (single && !single.lock && (isT() || canStyle(single))) {
      if (single.type === 'line') {
        var p = lineEnds(single);
        h += '<span class="hd" data-h="p1" style="left:' + p[0][0] + 'px;top:' + p[0][1] + 'px;border-radius:50%;cursor:move"></span><span class="hd" data-h="p2" style="left:' + p[1][0] + 'px;top:' + p[1][1] + 'px;border-radius:50%;cursor:move"></span>';
      } else if (canRotate(single)) {
        var lb = localBox(single), R = single.rot || 0;
        h += '<div class="rwrap" style="left:' + lb.x + 'px;top:' + lb.y + 'px;width:' + lb.w + 'px;height:' + lb.h + 'px;rotate:' + R + 'deg"><div class="sbox" style="left:-2px;top:-2px;width:' + (lb.w + 4) + 'px;height:' + (lb.h + 4) + 'px"></div>';
        handleSet(single).forEach(function (d) {
          var x = d.indexOf('w') >= 0 ? 0 : d.indexOf('e') >= 0 ? lb.w : lb.w / 2, y = d.indexOf('n') >= 0 ? 0 : d.indexOf('s') >= 0 ? lb.h : lb.h / 2;
          h += '<span class="hd' + (cropId === single.id ? ' crop' : '') + '" data-h="' + d + '" style="left:' + x + 'px;top:' + y + 'px;cursor:' + (d.length === 2 ? (d === 'nw' || d === 'se' ? 'nwse' : 'nesw') : (d === 'n' || d === 's' ? 'ns' : 'ew')) + '-resize"></span>';
        });
        if (cropId === single.id && single.type === 'image') h += '<span class="hd hrot" data-h="irot" data-tip="Turn the picture inside the frame (Shift — by 15°)" style="left:' + (lb.w / 2) + 'px;top:' + (-26 / V.z) + 'px"></span>';
        if (cropId !== single.id) h += '<span class="hd hrot" data-h="rot" data-tip="Rotate (Shift — by 15°)" style="left:' + (lb.w / 2) + 'px;top:' + (-26 / V.z) + 'px"></span>';
        h += '</div>';
      } else {
        var b = boxOf(single);
        handleSet(single).forEach(function (d) {
          var x = b.x + (d.indexOf('w') >= 0 ? 0 : d.indexOf('e') >= 0 ? b.w : b.w / 2);
          var y = b.y + (d.indexOf('n') >= 0 ? 0 : d.indexOf('s') >= 0 ? b.h : b.h / 2);
          h += '<span class="hd' + (cropId === single.id ? ' crop' : '') + (single.type === 'frame' && d.length === 2 ? ' fcorner' : '') + '" data-h="' + d + '"' + (single.type === 'frame' ? ' title="' + (d.length === 2 ? 'Corner: scale the frame with everything inside (Alt — frame only)' : 'Side: change the frame size only') + '"' : '') + ' style="left:' + x + 'px;top:' + y + 'px;cursor:' + (d.length === 2 ? (d === 'nw' || d === 'se' ? 'nwse' : 'nesw') : (d === 'n' || d === 's' ? 'ns' : 'ew')) + '-resize"></span>';
        });
      }
    }
    // заметка учителя сразу видна рядом с выделенным элементом
    if (single && isT() && (single.tnote || single.tnimg) && !editing && single.type !== 'line') {
      var nb0 = boxOf(single);
      h += '<div class="tnview" style="left:' + (nb0.x + nb0.w + 12) + 'px;top:' + nb0.y + 'px"><div class="tnvh">🗒 Teacher note <button type="button" data-tnedit="1">Edit</button></div>' + (single.tnote ? '<div class="tnvt">' + esc(single.tnote) + '</div>' : '') + (single.tnimg ? '<div class="tnvi">' + single.tnimg.map(function (u) { return '<img src="' + esc(u) + '" alt="" data-big="' + esc(u) + '">'; }).join('') + '</div>' : '') + '</div>';
    }
    if (single && single.type === 'table' && !single.lock && (isT() || canStyle(single))) {
      var tb0 = boxOf(single);
      h += '<button class="alignbtn tplus" data-tplus="col" type="button" data-tip="Add a column" style="left:' + (tb0.x + tb0.w + 6) + 'px;top:' + (tb0.y + tb0.h / 2) + 'px">＋</button>' +
        '<button class="alignbtn tplus" data-tplus="row" type="button" data-tip="Add a row" style="left:' + (tb0.x + tb0.w / 2) + 'px;top:' + (tb0.y + tb0.h + 6) + 'px">＋</button>';
    }
    if (single && single.type === 'frame') children(single).forEach(function (c) { if (c.type === 'line' || hiddenByCollapse(c)) return; var cbx = boxOf(c); h += '<div class="sbox kid" style="left:' + (cbx.x - 2) + 'px;top:' + (cbx.y - 2) + 'px;width:' + (cbx.w + 4) + 'px;height:' + (cbx.h + 4) + 'px"></div>'; });
    selS = selS.filter(function (id) { return findStroke(id); });
    selS.forEach(function (id) { var b = strokeBox(findStroke(id)); h += '<div class="sbox multi sstk" style="left:' + (b.x - 3) + 'px;top:' + (b.y - 3) + 'px;width:' + (b.w + 6) + 'px;height:' + (b.h + 6) + 'px"></div>'; });
    $('#lsel').innerHTML = h;
    scaleHandles(); renderCtx();
  }
  // ряд (x) или столбик (y): предметы не заходят друг на друга по этой оси
  function gapLayout() {
    var els = sel.map(find).filter(function (e) { return e && e.type !== 'line' && e.type !== 'frame' && !e.lock; });
    if (els.length < 2 || els.length !== sel.length) return null;
    var bx = els.map(function (e) { return { e: e, b: boxOf(e) }; });
    for (var a = 0; a < 2; a++) {
      var ax = a ? 'y' : 'x', sz = a ? 'h' : 'w', L = bx.slice().sort(function (p, q) { return p.b[ax] - q.b[ax]; }), ok = true;
      for (var i = 1; i < L.length; i++) if (L[i].b[ax] < L[i - 1].b[ax] + L[i - 1].b[sz] - 1) { ok = false; break; }
      if (!ok) continue;
      var gaps = []; for (var j = 1; j < L.length; j++) gaps.push((L[j - 1].b[ax] + L[j - 1].b[sz] + L[j].b[ax]) / 2);
      return { ax: ax, sz: sz, list: L, gaps: gaps, U: union(L.map(function (x) { return x.b; })) };
    }
    return null;
  }
  function groupScalable() { var els = sel.map(find).filter(Boolean); return els.length > 1 && els.every(function (x) { return !x.lock && (isT() ? true : canStyle(x)); }); }
  function scaleHandles() { $$('#lsel .hd').forEach(function (n) { n.style.transform = 'scale(' + (1 / V.z) + ')'; }); $$('#lsel .alignbtn').forEach(function (n) { n.style.transform = n.dataset.tplus === 'row' ? 'translate(-50%,8px) scale(' + (1 / V.z) + ')' : 'translate(14px,-50%) scale(' + (1 / V.z) + ')'; n.style.transformOrigin = n.dataset.tplus === 'row' ? 'top center' : 'left center'; }); $$('#lsel .tnview').forEach(function (n) { n.style.transform = 'scale(' + (1 / V.z) + ')'; }); $$('#lsel .gaph').forEach(function (n) { if (n.classList.contains('v')) { n.style.width = (10 / V.z) + 'px'; n.style.marginLeft = (-5 / V.z) + 'px'; } else { n.style.height = (10 / V.z) + 'px'; n.style.marginTop = (-5 / V.z) + 'px'; } }); $$('#lsel .sbox').forEach(function (n) { n.style.borderWidth = (1.5 / V.z) + 'px'; }); }
  /* ---------- drawings: select, move, delete ---------- */
  function strokeBox(s) { var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; s.pts.forEach(function (p) { x1 = Math.min(x1, p[0]); y1 = Math.min(y1, p[1]); x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]); }); var h = s.w / 2; return { x: x1 - h, y: y1 - h, w: x2 - x1 + s.w, h: y2 - y1 + s.w }; }
  function strokeCenter(s) { var b = strokeBox(s); return [b.x + b.w / 2, b.y + b.h / 2]; }
  function canStroke(s) { return isT() || (ME && s.by === ME.id); }
  function findStroke(id) { return B.strokes.find(function (s) { return s.id === id; }); }
  function strokeAt(w) {
    var rad = 8 / V.z, best = null;
    for (var k = B.strokes.length - 1; k >= 0 && !best; k--) {
      var s = B.strokes[k]; if (!canStroke(s)) continue;
      var r = rad + s.w / 2;
      for (var i = 0; i < s.pts.length; i++) { var a = s.pts[i], b = s.pts[i + 1] || a; if (segDist(w.x, w.y, a[0], a[1], b[0], b[1]) <= r) { best = s; break; } }
    }
    return best;
  }
  function selectStrokes(ids, add) {
    selS = add ? selS.concat(ids.filter(function (id) { return selS.indexOf(id) < 0; })) : ids.slice();
    renderSel();
  }
  function deleteStrokes() {
    var gone = selS.map(findStroke).filter(function (s) { return s && canStroke(s); });
    if (!gone.length) return false;
    var ids = gone.map(function (s) { return s.id; }), saved = gone.map(clone);
    B.strokes = B.strokes.filter(function (s) { return ids.indexOf(s.id) < 0; });
    selS = []; renderInk(); renderSel();
    op({ t: 'erase', ids: ids }, function (ok) { if (ok) pushUndo(function () { saved.forEach(function (st) { op({ t: 'stroke', stroke: st }); }); }); });
    return true;
  }
  function startStrokeMove(e, w) {
    var ids = selS.filter(function (id) { var s = findStroke(id); return s && canStroke(s); });
    if (!ids.length) return false;
    drag = { kind: 'smove', sids: ids, sx: w.x, sy: w.y, dx: 0, dy: 0, nodes: ids.map(function (id) { return ink.querySelector('[data-sid="' + id + '"]'); }).filter(Boolean), moved: false };
    $('#ctx').hidden = true; $('#lsel').innerHTML = ''; capture(e); return true;
  }
  function finishStrokeMove(ids, dx, dy) {
    dx = r1(dx); dy = r1(dy); if (!dx && !dy) return;
    ids.forEach(function (id) { var s = findStroke(id); if (s) s.pts.forEach(function (p) { p[0] = r1(p[0] + dx); p[1] = r1(p[1] + dy); }); });
    renderInk();
    op({ t: 'stroke-move', ids: ids, dx: dx, dy: dy }, function (ok) { if (ok) pushUndo(function () { op({ t: 'stroke-move', ids: ids, dx: -dx, dy: -dy }); }); });
  }
  function select(ids, add) {
    if (!add) selS = [];
    if (!Array.isArray(ids)) ids = ids ? [ids] : [];
    if (soloG && !ids.some(function (id) { var x = find(id); return x && x.g === soloG; })) soloG = null;
    ids = expandGroups(ids);
    if (add) ids.forEach(function (id) { var i = sel.indexOf(id); if (i >= 0) sel.splice(i, 1); else sel.push(id); });
    else sel = ids.slice();
    if (cropId && sel.indexOf(cropId) < 0) cropId = null;
    renderLinks(); renderSel();
    if (!$('#props').hidden) { if (sel.length === 1) renderProps(); else $('#props').hidden = true; }
  }

  /* ---------- context toolbar ---------- */
  function cb(act, content, title, on) { return '<button class="cb' + (on ? ' on' : '') + '" data-c="' + act + '" type="button" data-tip="' + esc(title) + '" aria-label="' + esc(title) + '">' + content + '</button>'; }
  var VS = '<span class="vs"></span>', MOREITEMS = [];
  function renderCtx() {
    var c = $('#ctx');
    if (drag && drag.kind !== 'resize' && drag.kind !== 'gresize') { c.hidden = true; return; }
    if (!sel.length && selS.length) { c._h = null; c.innerHTML = '<span class="num" style="padding:0 6px">' + selS.length + ' drawing' + (selS.length > 1 ? 's' : '') + '</span>' + cb('sdel', svg('trash'), 'Delete (Delete key)'); c.hidden = false; placeCtx(); return; }
    if (!sel.length) { c.hidden = true; return; }
    var els = sel.map(find).filter(Boolean), e = els[0], T = isT(), h = '';
    var ed = editing && sel.indexOf(editing.id) >= 0;
    var texty = els.every(function (x) { return /^(text|note|zone|frame|card|sentence|shape)$/.test(x.type); }) && els.every(canStyle);
    var grouped = els.length > 1 && els.every(function (x) { return x.g && x.g === e.g; });
    var more = [];
    var allType = function (t) { return els.every(function (x) { return x.type === t; }); };
    if (els.length > 1 && (T || els.every(canStyle)) && !grouped) h += cb('arr', svg('ac'), 'Align, distribute, line up in a row or column') + VS;
    if (els.length > 1 && T) more.push(grouped ? ['ungroup', 'Ungroup (Ctrl+Shift+G)', 'ungroup'] : ['group', 'Group (Ctrl+G)', 'group']);
    if (grouped && (T || els.every(canStyle))) h += cb('gparts', svg('ungroup'), 'Parts: move or turn one piece of the group separately (or double-click a piece, or hold Alt and drag)') + VS;
    if (allType('shape') && els.every(canStyle)) {
      h += cb('shk', svg('sh_' + e.shape), 'Shape') + cb('sfill', '<span class="sw" style="--c:' + (e.fill === 'none' ? 'transparent' : e.fill) + ';' + (e.fill === 'none' ? 'box-shadow:inset 0 0 0 1px #999' : '') + '"></span>', els.length > 1 ? 'Fill for all ' + els.length + ' shapes' : 'Fill') +
        cb('sstroke', '<span class="sw" style="--c:transparent;box-shadow:inset 0 0 0 3px ' + (e.sw ? e.stroke : '#ccc') + '"></span>', 'Border colour and thickness') +
        '<input type="range" min="10" max="100" value="' + Math.round((e.opacity == null ? 1 : e.opacity) * 100) + '" data-c="opacity" data-tip="Opacity">' + VS;
    }
    if (allType('line') && els.every(canStyle)) {
      h += cb('lcol', '<span class="sw" style="--c:' + (e.color || '#1E1E1C') + '"></span>', 'Colour') + cb('lw', '<span class="num" style="color:inherit">' + (e.sw || 2) + 'px</span>', 'Thickness') +
        cb('larrow', svg(e.start === 'arrow' ? 'arrowBoth' : e.end === 'none' ? 'arrowNone' : 'arrowEnd'), 'Arrow heads') + cb('ldash', svg('dash'), 'Dashed', e.dash) + cb('lcurve', svg('curve'), 'Curved', e.curve) + VS;
    }
    if (texty) {
      var font = e.font || 'Inter';
      h += '<select data-c="font" data-tip="Font" style="font-family:\'' + font + '\',var(--uifont)">' + FONTS.map(function (f) { return '<option' + (f === font ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select>';
      if (/^(text|note|card|sentence|shape)$/.test(e.type) && els.every(function (x) { return x.type === e.type; })) {
        var sz = e.type === 'note' ? (e.size || 0) : e.size || 18;
        h += cb('fs-', 'A−', 'Smaller') + '<span class="num">' + (sz ? Math.round(sz) : 'auto') + '</span>' + cb('fs+', 'A+', 'Bigger');
      }
      h += cb('fc', '<span class="sw" style="--c:' + (e.fc || '#1E1E1C') + '"></span>', ed ? 'Colour of selected text' : 'Text colour') +
        cb('hl', svg('hl'), ed ? 'Highlight selected text' : 'Highlight') +
        cb('bold', '<b>B</b>', 'Bold (Ctrl+B)', !ed && e.bold) + cb('italic', '<i>I</i>', 'Italic (Ctrl+I)', !ed && e.italic) + cb('underline', '<u>U</u>', 'Underline (Ctrl+U)', !ed && e.underline) + cb('strike', '<s>S</s>', 'Strikethrough', !ed && e.strike);
      if ((ed || (els.length === 1 && canEditText(e))) && /^(text|note|shape)$/.test(e.type)) h += cb('bullets', svg('bullets'), 'Bulleted list (or type “- ” at the start of a line)') + cb('olist', svg('olist'), 'Numbered list (or “1. ”)') + cb('tdet', '<b style="font-size:13px">▸≡</b>', 'Drop-down list that can be hidden (or “> ”)');
      if (els.length === 1 && /^(text|note|shape)$/.test(e.type) && canStyle(e)) h += cb('tlink', svg('linkI'), ed ? 'Make the selected words a link' : 'Add a link to this text');
      if (els.every(function (x) { return /^(text|note|shape)$/.test(x.type); })) h += cb('align', svg(e.align === 'left' ? 'tal' : e.align === 'right' ? 'tar' : 'tac'), 'Text alignment');
      h += VS;
    }
    if (els.every(function (x) { return OUTL.test(x.type) || isGame(x); }) && (T || els.every(canStyle))) h += cb('outl', '<span class="sw" style="--c:transparent;box-shadow:inset 0 0 0 3px ' + (e.ow ? (e.oc || '#2E2F25') : '#ccc') + '"></span>', 'Border: thickness and colour');
    if (els.every(function (x) { return (/^(deck|boxes|cloud|open|todo|poll|rating|frame|card|zone|chart|table|kanban|kcard)$/.test(x.type) || isGame(x)) && (T || canStyle(x)); })) h += cb('wbg', '<span class="sw" style="--c:transparent;background:' + (bgCss(e) || 'conic-gradient(#F6CF6A,#F2B9A0,#CDBFE3,#B8DCCB,#F6CF6A)') + '"></span>', e.type === 'frame' ? 'Gradient background' : 'Colour or gradient');
    if (els.length === 1 && isGame(e) && T) h += cb('gsetup', '<b style="font-size:12px">⚙ Set up</b>', 'Words, tasks and options') + VS;
    if (els.length === 1 && e.type === 'table' && (T || canStyle(e))) h += cb('trow', '<b style="font-size:12px">＋ Row</b>', 'Add a row (under the clicked cell)') + cb('tcol', '<b style="font-size:12px">＋ Col</b>', 'Add a column (right of the clicked cell)') + cb('tdrow', '<b style="font-size:12px">− Row</b>', 'Delete the row of the clicked cell') + cb('tdcol', '<b style="font-size:12px">− Col</b>', 'Delete the column of the clicked cell') + cb('thead', '<b style="font-size:12px">H</b>', 'Header row', e.head) + cb('tlc', '<span class="sw" style="--c:' + (e.lc || '#C9C6BC') + '"></span>', 'Line colour') + cb('fs-', 'A−', 'Smaller text') + cb('fs+', 'A+', 'Bigger text') + VS;
    if (allType('note') && els.every(canStyle)) h += cb('ncol', '<span class="sw" style="--c:' + (e.color || NOTE_COLORS[0]) + '"></span>', 'Sticky colour');
    if (allType('flip') && els.every(canStyle)) h += cb('flfront', '<span class="sw" style="--c:' + (e.fill || '#FFFDF8') + '"></span>', 'Front colour') + cb('flback', '<span class="sw" style="--c:' + (e.color || '#F1DFA0') + '"></span>', 'Back colour') + VS;
    if (els.length === 1 && e.type === 'frame' && T) {
      h += cb('ffill', '<span class="sw" style="--c:' + (e.fill || '#FFFFFF') + '"></span>', 'Frame colour') + cb('fsize', '<span class="flab">' + frameRatio(e) + '</span>', 'Frame size: square, 16:9, A4…') + cb('ftex', svg('notes'), 'Paper: plain, lined, squared, dotted') + (e.tex && e.tex !== 'cork' ? cb('fpage', svg('plus'), 'Add the next page below') : '') + cb('fhide', svg(e.veil ? 'veil' : e.hidden ? 'eyeoff' : 'eye'), 'Visibility for students', e.hidden || e.veil) +
        cb('lessonbtn', B.lesson && B.lesson.frame === e.id ? 'End lesson' : 'Start lesson', B.lesson && B.lesson.frame === e.id ? 'End the lesson — students get an exit ticket' : 'Start the lesson on this frame') + VS;
      more.push(['selin', 'Select everything inside', 'selin'], ['fpdf', 'Save this frame as PDF', 'pdf'], ['fhtml', 'Save this frame as HTML (with interactive blocks)', 'code'], ['ftpl', 'Save frame as template', 'tpl'], ['more', 'Copies for students, pairs or rooms…', 'dup']);
    }
    if (els.every(function (x) { return x.type === 'zone' || x.type === 'card'; }) && T) h += cb('acc', '<span class="sw" style="--c:' + (e.color || '#9A9890') + '"></span>', 'Colour') + VS;
    var allImg = els.every(function (x) { return x.type === 'image' && canStyle(x); });
    if (allImg) {
      h += (els.length === 1 ? cb('crop', svg('crop'), cropId === e.id ? 'Finish cropping (or double-click)' : 'Crop (or double-click the picture)', cropId === e.id) : '') + cb('iratio', '⤢', els.length > 1 ? 'Fix proportions of all selected pictures (if they look stretched)' : 'Original proportions (if the picture looks stretched)') +
        cb('ishape', svg(e.shape === 'circle' ? 'circle' : e.shape === 'round' ? 'round' : e.shape === 'diamond' ? 'diamondI' : e.shape === 'hexagon' ? 'hexI' : e.shape === 'triangle' ? 'triI' : e.shape === 'star' ? 'starI' : 'rect'), els.length > 1 ? 'Shape for all ' + els.length + ' images' : 'Image shape') +
        cb('ibord', '<span class="sw" style="--c:transparent;box-shadow:inset 0 0 0 3px ' + (e.bw ? (e.bc || '#1E1E1C') : '#ccc') + '"></span>', els.length > 1 ? 'Border for all selected images' : 'Image border') +
        '<input type="range" min="10" max="100" value="' + Math.round((e.opacity == null ? 1 : e.opacity) * 100) + '" data-c="opacity" data-tip="Opacity">' + VS;
    }
    if (els.length === 1 && e.type === 'html' && T) h += cb('hz-', svg('minus'), 'Make the content smaller') + '<span class="num">' + Math.round((e.zoom || 1) * 100) + '%</span>' + cb('hz+', svg('plus'), 'Make the content bigger') + VS;
    if (els.length === 1 && (e.type === 'media' || e.type === 'video') && canStyle(e)) h += cb('trim', '✂', 'Trim — play only a part') + VS;
    if (els.length === 1 && e.type === 'image' && (T || !e.lock)) h += cb('cover', svg('cover'), e.cover ? 'Reveal image' : 'Hide image under a cover', e.cover);
    if (els.length === 1 && e.type === 'image') h += cb('view', svg('view'), 'View full size');
    if (els.length === 1 && (e.type === 'note' || e.type === 'image')) h += cb('react', svg('emoji'), 'Add reaction');
    if (!T && ME && !ME.guest) h += cb('idea', '💡', 'Add to my Idea bank');
    if (!T && ME && !ME.guest && els.length === 1 && elText(e)) h += cb('lbox', '<b style="font-size:12px">Aa+</b>', 'Add a word or phrase to My language box');
    if (T && els.some(function (x) { return x.type !== 'frame'; }) && framesOf(e).length) { var st = e.step; h += cb('step', st ? 'Task ' + st : 'Task #', 'Make it a task you open step by step', !!st); }
    if (T) {
      var allLocked = els.every(function (x) { return x.lock; }), allTonly = els.every(function (x) { return x.tonly; });
      h += cb('lock', svg(allLocked ? 'lock' : 'unlock'), allLocked ? 'Unlock' : 'Lock (students can’t move, edit or delete it)', allLocked);
      more.push(['assign', 'Assign students…', 'user'], ['tnote', 'Teacher note (only you see it)…', 'tnote'], ['tonly', allTonly ? 'Show to students' : 'Only teacher sees this', 'eyeoff']);
    }
    if (els.some(function (x) { return x.type !== 'frame'; }) && (T || els.every(canStyle))) {
      if (els.every(function (x) { return x.type === 'image'; })) h += cb('fx', svg('blurI'), 'Blur and rotate');
      else more.push(['fx', (els.every(canRotate) ? 'Rotate and blur…' : 'Blur…'), 'blurI']);
      more.push(['layers', 'Layers: front / back…', 'layers']);
    }
    if (T || els.every(canDelete)) more.push(['dup', 'Duplicate (Ctrl+D)', 'dup']);
    if (T && copyMode() !== 'none') more.push(['send', 'Copy to another board…', 'send']);
    if (els.length === 1) more.push(['elink', 'Copy link to this element', 'linkI']);
    if (T && copyMode() !== 'none' && !(els.length === 1 && e.type === 'frame')) more.push(['seltpl', 'Save as template (with tags)…', 'tpl']);
    if (T && els.length === 1 && /^(card|sentence|wheel|flip|scale|dice|rating|poll|media|todo|video|deck|boxes|ball|cloud|open|chart|coin|input)$/.test(e.type)) more.push(['more', 'More settings…', 'settings']);
    if (els.every(canDelete)) h += cb('del', svg('trash'), 'Delete');
    if (more.length) { h += cb('cmore', svg('more'), 'More actions'); MOREITEMS = more; }
    h = h.replace(/^(<span class="vs"><\/span>)+/, '').replace(/(<span class="vs"><\/span>)+$/, '').replace(/(<span class="vs"><\/span>){2,}/g, VS);
    if (!h) { c.hidden = true; return; }
    var ae = document.activeElement;   // пока открыт список или поле на панели — не перерисовываем её, иначе список закрывается и «тупит»
    if (!c.hidden && ae && ae.closest && ae.closest('#ctx') && /^(SELECT|INPUT)$/.test(ae.tagName)) { placeCtx(); return; }
    if (c._h !== h) { c.innerHTML = h; c._h = h; fillRanges(c); }
    c.hidden = false;
    placeCtx();
  }
  function placeCtx() {
    var c = $('#ctx'); if (c.hidden || (!sel.length && !selS.length)) return;
    var vr = vp.getBoundingClientRect(), u = null;
    selS.forEach(function (id) { var st = findStroke(id); if (!st) return; var b = strokeBox(st); var r = { left: b.x * V.z + V.x + vr.left, top: b.y * V.z + V.y + vr.top, right: (b.x + b.w) * V.z + V.x + vr.left, bottom: (b.y + b.h) * V.z + V.y + vr.top }; u = u ? { l: Math.min(u.l, r.left), t: Math.min(u.t, r.top), r: Math.max(u.r, r.right), b: Math.max(u.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    sel.forEach(function (id) {
      var e = find(id); var r;
      if (e && e.type === 'line') { var b = lineBox(e); r = { left: b.x * V.z + V.x + vr.left, top: b.y * V.z + V.y + vr.top, right: (b.x + b.w) * V.z + V.x + vr.left, bottom: (b.y + b.h) * V.z + V.y + vr.top }; }
      else { var n = world.querySelector('[data-id="' + id + '"]'); if (!n) return; r = n.getBoundingClientRect(); }
      u = u ? { l: Math.min(u.l, r.left), t: Math.min(u.t, r.top), r: Math.max(u.r, r.right), b: Math.max(u.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    });
    if (!u) { c.hidden = true; return; }
    var w = c.offsetWidth, hgt = c.offsetHeight;
    var hasHead = sel.length === 1 && find(sel[0]) && (find(sel[0]).type === 'frame' || (canRotate(find(sel[0])) && !find(sel[0]).lock));
    var top = u.t - vr.top - hgt - (hasHead ? 44 : 14);
    if (top < 6) top = Math.min(u.b - vr.top + 14, vr.height - hgt - 6);
    var left = (u.l + u.r) / 2 - vr.left - w / 2;
    left = Math.max(narrow() ? 6 : 66, Math.min(vr.width - w - 6, left));
    c.style.left = left + 'px'; c.style.top = top + 'px';
  }
  function ctxPop(html, anchorBtn, onPick, form, cls) {
    closeCtxPop();
    var p = document.createElement('div'); p.className = 'ctxpop' + (form ? ' form' : '') + (cls ? ' ' + cls : ''); p.id = 'ctxpop'; p.innerHTML = html;
    vp.appendChild(p); fillRanges(p);
    var r = anchorBtn.getBoundingClientRect(), vr = vp.getBoundingClientRect();
    p.style.left = Math.max(6, Math.min(vr.width - p.offsetWidth - 6, r.left - vr.left)) + 'px';
    p.style.top = Math.max(6, Math.min(vr.height - p.offsetHeight - 6, r.bottom - vr.top + 6)) + 'px';
    p.addEventListener('mousedown', function (e) { if (!form && !e.target.closest('input,label,textarea,select')) e.preventDefault(); });
    p.addEventListener('click', function (e) {
      var ey = e.target.closest('[data-eye]');
      if (ey) { pickEye(function (c) { askPalette(c); onPick(c, p); if (!form) closeCtxPop(); }); return; }
      var b = e.target.closest('[data-v]'); if (b) { onPick(b.dataset.v, p); if (!form) closeCtxPop(); }
    });
    p.addEventListener('change', function (e) { if (e.target.matches('input[type=color]')) { var c = e.target.value.toUpperCase(); askPalette(c); onPick(c, p); if (!form) closeCtxPop(); } });
    return p;
  }
  // заливка бегунка до ручки (для тонкой дорожки)
  function fillRanges(root) { $$('input[type=range]', root).forEach(function (r) { var mn = Number(r.min || 0), mx = Number(r.max || 100); r.style.setProperty('--fill', ((Number(r.value) - mn) / (mx - mn) * 100) + '%'); }); }
  document.addEventListener('input', function (ev) { if (ev.target && ev.target.type === 'range') fillRanges(ev.target.parentNode); }, true);
  function slider(label, key, val, min, max) {
    return '<div class="lbl">' + label + ' <span class="slv" data-sv="' + key + '">' + val + ' px</span></div><input class="sl" type="range" min="' + min + '" max="' + max + '" step="1" value="' + val + '" data-sl="' + key + '">';
  }
  // бегунок: пока тянешь — видно сразу, отпустил — сохраняется (с отменой)
  function wireSlider(key, fn) {
    var inp = $('#ctxpop [data-sl="' + key + '"]'); if (!inp) return;
    var ids = sel.slice(), orig = ids.map(function (id) { var e = find(id), o = { id: id }, p0 = fn(0); Object.keys(p0).forEach(function (k) { o[k] = e && k in e ? clone(e[k]) : null; }); return o; });
    inp.addEventListener('input', function () {
      var n = Number(inp.value); $('#ctxpop [data-sv="' + key + '"]').textContent = n + ' px';
      ids.forEach(function (id) { var e = find(id); if (e) Object.assign(e, fn(n)); });
      if (!inp._raf) inp._raf = requestAnimationFrame(function () { inp._raf = 0; render(); });   // плавно: не чаще кадра
    });
    inp.addEventListener('change', function () {
      var n = Number(inp.value);
      var items = ids.map(function (id) { return Object.assign({ id: id }, fn(n)); });
      op({ t: 'patch', items: items }, function (ok) { if (ok) pushUndo(function () { op({ t: 'patch', items: orig }); }); });
    });
  }
  function openAssign(btn) {
    if (!ROSTER.length) { toast('Add students to this group first'); return; }
    var els = sel.map(find).filter(Boolean), has = {};
    els.forEach(function (x) { (x.assign || []).forEach(function (a) { has[a.id] = (has[a.id] || 0) + 1; }); });
    var p = ctxPop('<div class="lbl">Who works here</div>' + ROSTER.map(function (r) { return '<label class="chk"><input type="checkbox" value="' + r.id + '"' + (has[r.id] === els.length ? ' checked' : '') + '> ' + esc(r.name) + '</label>'; }).join('') +
      '<div style="display:flex;gap:6px;margin-top:4px"><button class="pb" data-v="save" type="button">Assign</button><button class="cb" data-v="clear" type="button">Clear</button></div>' +
      '<p class="hint" style="margin:0;max-width:240px">Students see “You” on these items, and the My tasks button takes them there.</p>', btn,
      function (v, pop) {
        var list = v === 'clear' ? [] : $$('input:checked', pop).map(function (i) { var r = ROSTER.find(function (x) { return x.id === i.value; }); return { id: r.id, name: r.name }; });
        patchSel(function () { return { assign: list.length ? list : null }; });
        closeCtxPop();
      }, true);
    return p;
  }
  // назначить задание ученикам и выбрать, кто его видит: только назначенные или все
  function openNominate(btn) {
    socket.emit('b:assignees', {}, function (list) {
      list = Array.isArray(list) ? list : [];
      if (!list.length) { toast('Nobody to assign yet — invite students or guests first'); return; }
      showNominate(btn, list);
    });
  }
  function showNominate(btn, list) {
    var ids = sel.slice(), els = ids.map(find).filter(Boolean);
    var fr = els.length === 1 && els[0].type === 'frame' ? els[0] : null;
    var has = {}; (fr && fr.owners || []).forEach(function (o) { has[o.id] = 1; });
    var vis = fr && fr.owners && fr.owners.length && !fr.private ? 'all' : 'owners';
    var groups = [['student', 'Students'], ['guest', 'Guests'], ['teacher', 'Teachers']];
    var rows = groups.map(function (g) {
      var xs = list.filter(function (r) { return r.kind === g[0]; }); if (!xs.length) return '';
      return '<div class="lbl" style="margin-top:4px">' + g[1] + '</div>' + xs.map(function (r) { return '<label class="chk"><input type="checkbox" value="' + esc(r.id) + '"' + (has[r.id] ? ' checked' : '') + '> ' + esc(r.name) + '</label>'; }).join('');
    }).join('');
    var p = ctxPop('<div class="lbl">Who works on this task</div>' +
      '<div class="sharelist" style="max-height:220px">' + rows + '</div>' +
      '<div style="display:flex;gap:6px;margin:4px 0"><button class="cb" data-v="all" type="button">Everyone</button><button class="cb" data-v="none" type="button">Nobody</button></div>' +
      '<div class="lbl">Who sees it</div>' +
      '<label class="chk"><input type="radio" name="nmVis" value="owners"' + (vis === 'owners' ? ' checked' : '') + '> Only the assigned people</label>' +
      '<label class="chk"><input type="radio" name="nmVis" value="all"' + (vis === 'all' ? ' checked' : '') + '> Everyone on the board</label>' +
      '<div style="display:flex;gap:6px;margin-top:6px"><button class="pb solid" data-v="save" type="button">Save</button></div>' +
      '<p class="hint" style="margin:6px 0 0;max-width:250px">Assigned people find it under “My tasks”. When everyone sees it, only the assigned people can change it. Guests who join through the guest link appear here too.</p>', btn,
      function (v, pop) {
        if (v === 'all' || v === 'none') { $$('.sharelist input', pop).forEach(function (i) { i.checked = v === 'all'; }); return; }
        if (v !== 'save') return;
        var who = $$('.sharelist input:checked', pop).map(function (i) { return i.value; });
        if (who.length > 12) { toast('Up to 12 people per task'); return; }
        var vv = ($('input[name=nmVis]:checked', pop) || {}).value || 'owners';
        if (!who.length && !fr) { toast('Tick at least one person'); return; }
        op({ t: 'nominate', ids: ids, students: who, vis: vv }, function (ok) { if (ok) { closeCtxPop(); select([]); toast(who.length ? 'Assigned — to change who sees it, use the button on the frame title' : 'Assignment removed'); } });
      }, true);
    return p;
  }
  // сохранить фрейм или выделенные задания как шаблон — с тегами для быстрого поиска
  async function saveFrameTemplate(f, ids) {
    ids = ids || [f.id];
    var all = []; try { all = await api('GET', '/api/t/templates'); } catch (e) {}
    var cnt = {}; all.forEach(function (t) { (t.tags || []).forEach(function (g) { cnt[g] = (cnt[g] || 0) + 1; }); });
    var known = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || a.localeCompare(b); });
    var p = ctxPop('<div class="lbl">Save as template</div><input id="stTitle" class="tin" value="' + esc((f && f.title) || 'Template') + '" placeholder="Name">' +
      '<div class="lbl">Tags — comma separated</div><input id="stTags" class="tin" placeholder="grammar, speaking, B1">' +
      (known.length ? '<div class="tagcloud">' + known.slice(0, 30).map(function (g) { return '<button class="tagc" data-tg="' + esc(g) + '" type="button">#' + esc(g) + ' <i>' + cnt[g] + '</i></button>'; }).join('') + '</div>' : '') +
      '<div class="trow"><button class="pb solid" data-v="save" type="button">Save to My templates</button></div>', $('#ctx [data-c=cmore]') || $('#ctx'), async function (v, pp) {
        if (v !== 'save') return;
        var set = collect(ids);
        try { await api('POST', '/api/t/templates', { title: $('#stTitle', pp).value, tags: $('#stTags', pp).value, els: set.els, strokes: set.strokes }); closeCtxPop(); toast('Saved to My templates (Tasks → My templates)'); }
        catch (err) { toast(err.message); }
      }, true);
    $$('input', p).forEach(function (i) { i.addEventListener('keydown', function (ev) { ev.stopPropagation(); }); });
    p.addEventListener('click', function (ev) { var c = ev.target.closest('[data-tg]'); if (!c) return; var inp = $('#stTags', p), cur = inp.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); if (cur.indexOf(c.dataset.tg) < 0) cur.push(c.dataset.tg); inp.value = cur.join(', '); c.classList.add('on'); });
    $('#stTitle', p).select();
  }
  function closeCtxPop() { var p = $('#ctxpop'); if (p) p.remove(); }
  function pickEye(cb2) {
    if (!window.EyeDropper) { toast('The colour picker pipette works in Chrome and Edge'); return; }
    var keep = editing && editing.lastRange;
    new window.EyeDropper().open().then(function (r) { if (keep && editing) editing.lastRange = keep; cb2(r.sRGBHex.toUpperCase()); }).catch(function () {});
  }
  function customColor(cur) {
    return '<label class="cw" data-tip="Any colour (colour wheel)"><input type="color" value="' + (/^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#3B6FE0') + '"></label>' +
      '<button class="cw eye" data-eye="1" type="button" data-tip="Pick a colour from the screen">' + svg('eyedrop') + '</button>' +
      '<button class="cw paled" data-paled="1" type="button" data-tip="Edit palette: remove colours you don\'t need">✎</button>';
  }
  /* палитра: свои цвета можно удалить, встроенные — спрятать */
  var PALHIDE = null;
  function palHidden() {
    if (PALHIDE) return PALHIDE;
    try { PALHIDE = JSON.parse(localStorage.getItem('klass.palhide') || '[]'); } catch (e) { PALHIDE = []; }
    return PALHIDE;
  }
  function visCols(list) { var h = palHidden(); return list.filter(function (c) { return !c || c === 'none' || h.indexOf(String(c).toUpperCase()) < 0; }); }
  function savePal() {
    try { localStorage.setItem('klass.palette', JSON.stringify(MYPAL)); localStorage.setItem('klass.palhide', JSON.stringify(PALHIDE)); } catch (e) {}
    if (isT()) api('PUT', '/api/t/palette', { colors: MYPAL, hidden: PALHIDE }).catch(function () {});
  }
  function paletteEditor() {
    closeCtxPop(); $('#colPal').hidden = true;
    var old = $('#palEd'); if (old) old.remove();
    var built = [], seen = {};
    INK_COLORS.concat(TEXT_COLORS, NOTE_COLORS, SHAPE_FILLS, STROKES).forEach(function (c) { var u = String(c).toUpperCase(); if (c !== 'none' && !seen[u]) { seen[u] = 1; built.push(u); } });
    var d = document.createElement('div'); d.id = 'palEd'; d.className = 'paled-wrap';
    function draw() {
      var mine = myPalette(), hid = palHidden();
      d.innerHTML = '<div class="paled-box"><div class="paled-h"><b>Palette</b><button class="x" data-pe="close" type="button" aria-label="Close">×</button></div>' +
        '<p class="hint">My colours — click × to delete. Add new ones with the colour wheel or the pipette.</p><div class="paled-row">' +
        (mine.length ? mine.map(function (c) { return '<span class="pchip" style="--c:' + c + '"><button data-pe="del" data-c="' + c + '" type="button" title="Delete ' + c + '">×</button></span>'; }).join('') : '<span class="hint">No colours of your own yet.</span>') + '</div>' +
        '<p class="hint">Built-in colours — click to hide or show again.</p><div class="paled-row">' +
        built.map(function (c) { return '<button class="pchip tog' + (hid.indexOf(c) >= 0 ? ' off' : '') + '" style="--c:' + c + '" data-pe="tog" data-c="' + c + '" type="button" title="' + c + '"></button>'; }).join('') + '</div>' +
        '<div class="paled-f"><button class="pb" data-pe="showall" type="button">Show all built-in</button><button class="pb solid" data-pe="close" type="button">Done</button></div></div>';
    }
    draw(); document.body.appendChild(d);
    d.addEventListener('click', function (e) {
      if (e.target === d) { d.remove(); return; }
      var b = e.target.closest('[data-pe]'); if (!b) return;
      var a = b.dataset.pe, c = b.dataset.c;
      if (a === 'close') { d.remove(); return; }
      if (a === 'del') MYPAL = myPalette().filter(function (x) { return x.toUpperCase() !== c.toUpperCase(); });
      if (a === 'tog') { var h = palHidden(), i = h.indexOf(c); if (i >= 0) h.splice(i, 1); else h.push(c); }
      if (a === 'showall') PALHIDE = [];
      myPalette(); palHidden(); savePal(); draw();
    });
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-paled]')) { e.preventDefault(); e.stopPropagation(); paletteEditor(); } }, true);
  function swatches(list, cur) { var mine = myPalette().filter(function (c) { return list.indexOf(c) < 0; }); return swatchesOnly(list) + (mine.length ? '<span class="vs"></span>' + swatchesOnly(mine) : '') + customColor(cur); }
  var MYPAL = null;
  function myPalette() {
    if (MYPAL) return MYPAL;
    try { MYPAL = JSON.parse(localStorage.getItem('klass.palette') || '[]'); } catch (e) { MYPAL = []; }
    return MYPAL;
  }
  // новый цвет из круга или пипетки — предлагаем сохранить в палитру
  function askPalette(c) {
    c = String(c || '').toUpperCase(); if (!/^#[0-9A-F]{6}$/.test(c)) return;
    var all = INK_COLORS.concat(TEXT_COLORS, NOTE_COLORS, SHAPE_FILLS, STROKES, myPalette()).map(function (x) { return String(x).toUpperCase(); });
    if (all.indexOf(c) >= 0) return;
    setTimeout(function () {
      if (!confirm('Add this colour (' + c + ') to your palette?')) return;
      MYPAL = myPalette().concat(c).slice(-24);
      try { localStorage.setItem('klass.palette', JSON.stringify(MYPAL)); } catch (e) {}
      if (isT()) api('PUT', '/api/t/palette', { colors: MYPAL }).catch(function () {});
      toast('Saved to your palette');
    }, 50);
  }
  function swatchesOnly(list) { return visCols(list).map(function (c) { return '<button class="sw" data-v="' + c + '" style="--c:' + (c === 'none' || !c ? 'transparent' : c) + ';' + (c === 'none' || !c ? 'box-shadow:inset 0 0 0 1px #aaa;background-image:linear-gradient(135deg,transparent 45%,#C2412D 46%,#C2412D 54%,transparent 55%)' : '') + '" title="' + (c || 'none') + '" type="button"></button>'; }).join(''); }

  function patchSel(fn, ids) {
    var items = [], before = [];
    (ids || sel).forEach(function (id) {
      var e = find(id); if (!e) return;
      var p = fn(e); if (!p) return;
      var b = { id: id };
      Object.keys(p).forEach(function (k) { b[k] = k in e ? clone(e[k]) : null; });
      Object.keys(p).forEach(function (k) { if (p[k] === null) delete e[k]; else e[k] = p[k]; });
      p.id = id; items.push(p); before.push(b);
    });
    if (!items.length) return;
    render();
    op({ t: 'patch', items: items }, function (ok) { if (ok) pushUndo(function () { op({ t: 'patch', items: before }); }); else toast('Not allowed'); });
  }
  // во время ввода текста кнопки форматируют выделенный кусок
  function exec(cmd, val) {
    if (!editing) return false;
    editing.node.focus({ preventScroll: true });
    if (editing.lastRange) restoreRange(editing.node, editing.lastRange);
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    document.execCommand(cmd, false, val);
    sendEdit(false);
    return true;
  }
  document.addEventListener('selectionchange', function () {
    if (!editing) return; var g = getSelection();
    if (g.rangeCount && editing.node.contains(g.anchorNode)) editing.lastRange = saveRange(editing.node, g.getRangeAt(0));
  });
  $('#ctx').addEventListener('mousedown', function (e) { if (!e.target.closest('select,input')) e.preventDefault(); });
  $('#ctx').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  $('#ctx').addEventListener('change', function (ev) {
    var t = ev.target, k = t.dataset.c;
    if (k === 'font') { try { t.blur(); } catch (er) {} patchSel(function () { return { font: t.value === 'Inter' ? null : t.value }; }); }
    if (k === 'opacity') patchSel(function () { return { opacity: Number(t.value) / 100 }; });
  });
  $('#ctx').addEventListener('input', function (ev) {
    var t = ev.target; if (t.dataset.c !== 'opacity') return;
    sel.forEach(function (id) { var n = world.querySelector('[data-id="' + id + '"]'); if (n) n.style.opacity = Number(t.value) / 100; });
  });
  $('#ctx').addEventListener('click', function (ev) {
    var b = ev.target.closest('.cb'); if (!b) return;
    ctxAction(b.dataset.c, b);
  });
  function ctxAction(k, b) {
    if (k === 'sdel') { deleteStrokes(); return; }
    var e = find(sel[0]); if (!e) return;
    var ed = editing && sel.indexOf(editing.id) >= 0;
    var toggle = function (f) { var on = !sel.map(find).every(function (x) { return x[f]; }); patchSel(function () { var o = {}; o[f] = on || null; return o; }); };
    switch (k) {
      case 'bold': case 'italic': case 'underline': case 'strike':
        if (ed && exec({ bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' }[k])) break;
        toggle(k); break;
      case 'bullets': case 'olist':
        if (!ed) { startEdit(e.id); setTimeout(function () { ctxAction(k, b); }, 80); return; }
        exec(k === 'bullets' ? 'insertUnorderedList' : 'insertOrderedList'); break;
      case 'trow': case 'tcol': case 'tdrow': case 'tdcol':
        var tp0 = TBLPOS && TBLPOS.id === e.id ? TBLPOS : { r: e.rows.length - 1, c: e.cols.length - 1 };
        tableEdit(e, function (t) {
          if (k === 'trow') { t.rows.splice(tp0.r + 1, 0, t.rows[tp0.r] || 150); t.cells.splice(tp0.r + 1, 0, t.cols.map(function () { return ''; })); }
          if (k === 'tcol') { t.cols.splice(tp0.c + 1, 0, t.cols[tp0.c] || 220); t.cells.forEach(function (row) { row.splice(tp0.c + 1, 0, ''); }); }
          if (k === 'tdrow' && t.rows.length > 1) { t.rows.splice(tp0.r, 1); t.cells.splice(tp0.r, 1); }
          if (k === 'tdcol' && t.cols.length > 1) { t.cols.splice(tp0.c, 1); t.cells.forEach(function (row) { row.splice(tp0.c, 1); }); }
        });
        TBLPOS = null; break;
      case 'outl':
        var OW = [0, 1, 2, 3, 5, 8], OC = ['#2E2F25', '#6B7785', '#C08A2E', '#2F6FE0', '#C2412D', '#2E8B57', '#8E44AD', '#E0457B', '#FFFFFF'];
        ctxPop('<div class="lbl">Border</div><div class="trow">' + OW.map(function (w) { return '<button class="cb' + ((e.ow || 0) === w ? ' on' : '') + '" data-v="w' + w + '" type="button">' + (w ? w + ' px' : 'None') + '</button>'; }).join('') + '</div><div class="lbl">Colour</div><div class="swrow">' + swatches(OC, e.oc || '#2E2F25') + '</div>', b, function (v) {
          if (v[0] === 'w' && /^w\d+$/.test(v)) { var wv = Number(v.slice(1)); patchSel(function (x) { return { ow: wv || null, oc: wv ? (x.oc || '#2E2F25') : null, _ow: 1 }; }); }
          else patchSel(function (x) { return { oc: v, ow: x.ow || 2 }; });
        }, false, 'vpop');
        break;
      case 'gsetup': window.GAMES_API.setup(e); break;
      case 'thead': patchSel(function (x) { return { head: !x.head || null }; }, [e.id]); break;
      case 'tlc': ctxPop(swatches(['#C9C6BC', '#1E1E1C', '#6B7785', '#2F6FE0', '#C2412D', '#2E8B57', '#E08A1E'], e.lc || '#C9C6BC'), b, function (v) { patchSel(function () { return { lc: v === '#C9C6BC' ? null : v }; }, [e.id]); }); break;
      case 'tdet': if (!ed) { startEdit(e.id); setTimeout(function () { ctxAction(k, b); }, 80); return; }
        exec('insertHTML', '<details open><summary>' + (editing && editing.lastRange && String(getSelection()).trim() ? esc(String(getSelection()).trim()) : 'Title') + '</summary><div>Hidden text…</div></details><div><br></div>'); if (editing) selectNewSummary(editing.node); break;
      case 'lock': case 'ldash': case 'lcurve': case 'tonly': toggle(k === 'ldash' ? 'dash' : k === 'lcurve' ? 'curve' : k); break;
      case 'fs-': case 'fs+':
        patchSel(function (x) { var cur = x.type === 'note' ? (x.size || noteFont(x)) : (x.size || 18); var n = Math.round(cur * (k === 'fs+' ? 1.15 : 1 / 1.15)); return { size: Math.max(6, Math.min(300, n)) }; }); break;
      case 'align':
        var vert = sel.map(find).every(function (x) { return x && (x.type === 'note' || x.type === 'shape'); }), curA = e.align || (e.type === 'text' ? 'left' : 'center'), curV = e.va || 'middle';
        ctxPop('<div class="lbl">Text</div><div class="trow">' + [['left', 'tal', 'Left'], ['center', 'tac', 'Centre'], ['right', 'tar', 'Right']].map(function (o) { return '<button class="cb' + (curA === o[0] ? ' on' : '') + '" data-v="h' + o[0] + '" type="button" data-tip="' + o[2] + '">' + svg(o[1]) + '</button>'; }).join('') + '</div>' +
          (vert ? '<div class="trow">' + [['top', 'at', 'Top'], ['middle', 'am', 'Middle'], ['bottom', 'ab', 'Bottom']].map(function (o) { return '<button class="cb' + (curV === o[0] ? ' on' : '') + '" data-v="v' + o[0] + '" type="button" data-tip="' + o[2] + '">' + svg(o[1]) + '</button>'; }).join('') + '</div>' : ''), b, function (v) {
            if (v[0] === 'h') patchSel(function () { return { align: v.slice(1) }; });
            else patchSel(function (x) { return x.type === 'note' || x.type === 'shape' ? { va: v.slice(1) === 'middle' ? null : v.slice(1) } : null; });
          }, false, 'vpop');
        break;
      case 'fc': ctxPop(swatches(TEXT_COLORS, e.fc), b, function (v) { if (ed) exec('foreColor', v); else patchSel(function () { return { fc: v === '#1E1E1C' ? null : v }; }); }); break;
      case 'hl': ctxPop(swatches(HL_COLORS, e.hl || '#FFF07A'), b, function (v) { if (ed) exec('hiliteColor', v || 'transparent'); else patchSel(function () { return { hl: v || null }; }); }); break;
      case 'ncol': ctxPop(swatches(NOTE_COLORS, e.color), b, function (v) { patchSel(function () { return { color: v }; }); }); break;
      case 'fsize': frameSizePop(e, b); break;
      case 'fpage': {
        var nf = Object.assign({}, clone(e), { id: rid(), y: e.y + e.h + 60 }), mt = /^(.*?)(\d+)$/.exec(e.title || 'Notebook');
        nf.title = mt ? mt[1] + (+mt[2] + 1) : (e.title || 'Notebook') + ' 2';
        op({ t: 'el-set', el: nf }, function (ok) { if (!ok) return; pushUndo(function () { op({ t: 'del', id: nf.id }); }); setTimeout(function () { select([nf.id]); var f2 = find(nf.id); if (f2) goFrame(f2); }, 200); });
        break; }
      case 'ftex': ctxPop([['', 'Plain'], ['lines', 'Lined'], ['grid', 'Squared'], ['dots', 'Dotted']].map(function (o) { return '<button class="mi" data-v="' + (o[0] || 'none') + '" type="button"><span style="flex:1">' + o[1] + (((e.tex || '') === o[0]) ? ' ✓' : '') + '</span></button>'; }).join(''), b, function (v) { patchSel(function (x) { return x.type === 'frame' ? { tex: v === 'none' ? null : v } : null; }); }, false, 'menu'); break;
      case 'wbg': bgPop(e, b); break;
      case 'fx': fxPop(e, b); break;
      case 'ffill': ctxPop(swatches(FRAME_FILLS, e.fill), b, function (v) { patchSel(function () { return { fill: v || null }; }); }); break;
      case 'acc': ctxPop(swatches(ACCENTS, e.color), b, function (v) { patchSel(function () { return { color: v || null }; }); }); break;
      case 'sfill': ctxPop(swatches(SHAPE_FILLS, e.fill), b, function (v) { patchSel(function () { return { fill: v }; }); }); break;
      case 'sstroke':
        ctxPop('<div class="lbl">Border colour</div><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">' + swatches(STROKES, e.stroke) + '</div>' + slider('Thickness', 'sw', e.sw || 0, 0, 40) +
          '<div class="lbl">Style</div><div style="display:flex;gap:4px"><button class="cb" data-v="solid" type="button" style="border:1px solid var(--uiline)">Solid</button><button class="cb" data-v="dash" type="button" style="border:1px solid var(--uiline)">Dashed</button></div>' +
          (e.shape === 'rect' || e.shape === 'round' ? '<div class="lbl">Corner radius</div><input type="range" min="0" max="80" value="' + (e.radius || 0) + '" data-rad="1">' : ''), b,
          function (v) {
            if (v === 'solid' || v === 'dash') patchSel(function () { return { dash: v === 'dash' || null }; });
            else patchSel(function (x) { return { stroke: v, sw: x.sw || 2 }; });
          }, true);
        var rr = $('#ctxpop [data-rad]'); if (rr) rr.addEventListener('change', function () { patchSel(function () { return { radius: Number(rr.value), shape: 'rect' }; }); });
        wireSlider('sw', function (n) { return { sw: n }; }, function (node, n) { var bg = $('.sbg', node), pg = $('polygon', node); if (bg) bg.style.borderWidth = n + 'px'; if (bg && n) bg.style.borderColor = e.stroke; if (pg) { pg.setAttribute('stroke-width', n); pg.setAttribute('stroke', n ? e.stroke : 'none'); } });
        break;
      case 'shk': ctxPop(SHAPE_KINDS.map(function (s) { return '<button class="cb" data-v="' + s + '" type="button" title="' + s + '">' + svg('sh_' + s) + '</button>'; }).join(''), b, function (v) { patchSel(function () { return { shape: v }; }); }); break;
      case 'lcol': ctxPop(swatches(INK_COLORS, e.color), b, function (v) { patchSel(function () { return { color: v }; }); }); break;
      case 'lw': ctxPop(slider('Thickness', 'lw', e.sw || 2, 1, 30), b, function () {}, true); wireSlider('lw', function (n) { return { sw: n }; }, null, true); break;
      case 'larrow': ctxPop('<button class="cb" data-v="none" type="button" title="No arrows">' + svg('arrowNone') + '</button><button class="cb" data-v="end" type="button" title="Arrow at the end">' + svg('arrowEnd') + '</button><button class="cb" data-v="both" type="button" title="Arrows at both ends">' + svg('arrowBoth') + '</button>', b,
        function (v) { patchSel(function () { return { start: v === 'both' ? 'arrow' : 'none', end: v === 'none' ? 'none' : 'arrow' }; }); }); break;
      case 'fhide':
        ctxPop('<button class="mi' + (!e.hidden && !e.veil ? ' on' : '') + '" data-v="vis" type="button">' + svg('eye') + 'Visible to students</button><button class="mi' + (e.veil ? ' on' : '') + '" data-v="veil" type="button">' + svg('veil') + 'Show as “Hidden” (contents covered)</button><button class="mi' + (e.hidden ? ' on' : '') + '" data-v="hide" type="button">' + svg('eyeoff') + 'Invisible to students</button>', b,
          function (v) { patchSel(function () { return { hidden: v === 'hide' || null, veil: v === 'veil' || null }; }); }, false, 'menu');
        break;
      case 'selin': select(children(e).filter(function (x) { return !hiddenByCollapse(x); }).map(function (x) { return x.id; })); break;
      case 'ftpl': saveFrameTemplate(e); break;
      case 'seltpl': saveFrameTemplate(sel.map(find).find(function (x) { return x && x.type === 'frame'; }) || { title: '' }, sel.slice()); break;
      case 'hz-': case 'hz+': patchSel(function (x) { return { zoom: Math.round(Math.max(0.2, Math.min(3, (x.zoom || 1) * (k === 'hz+' ? 1.15 : 1 / 1.15))) * 100) / 100 }; }); break;
      case 'assign': openNominate(b); break;
      case 'layers':
        ctxPop([['forward', 'Bring forward', 'Shift + PgUp'], ['front', 'Bring to front', 'PgUp'], ['backward', 'Send backward', 'Shift + PgDn'], ['back', 'Send to back', 'PgDn']].map(function (o) { return '<button class="mi" data-v="' + o[0] + '" type="button"><span style="flex:1">' + o[1] + '</span><span class="kbd">' + o[2] + '</span></button>'; }).join(''), b, function (v) { reorder(v); }, false, 'menu');
        break;
      case 'crop': cropId = cropId === e.id ? null : e.id; renderSel(); break;
      case 'iratio': fixRatios(sel.map(find).filter(function (x) { return x && x.type === 'image'; })); break;
      case 'ishape': ctxPop([['rect', 'rect'], ['round', 'round'], ['circle', 'circle'], ['diamond', 'diamondI'], ['hexagon', 'hexI'], ['triangle', 'triI'], ['star', 'starI']].map(function (s2) { return '<button class="cb" data-v="' + s2[0] + '" type="button" title="' + s2[0] + '">' + svg(s2[1]) + '</button>'; }).join(''), b, function (v2) { patchSel(function () { return { shape: v2 }; }); }); break;
      case 'ibord':
        ctxPop('<div class="lbl">Border colour</div><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">' + swatches(STROKES, e.bc) + '</div>' + slider('Thickness', 'bw', e.bw || 0, 0, 40), b,
          function (v2) { patchSel(function (x) { return { bc: v2, bw: x.bw || 4 }; }); }, true);
        wireSlider('bw', function (n) { return { bw: n }; }, null, true);
        break;
      case 'cover': op({ t: 'cover', id: e.id }); break;
      case 'view': openLightbox(e.src); break;
      case 'react': ctxPop(REACTS.map(function (r) { return '<button class="em" data-v="' + r + '" type="button">' + r + '</button>'; }).join(''), b, function (v) { op({ t: 'react', id: e.id, emoji: v }); }); break;
      case 'tnote':
        tnoteDialog(e, b);
        break;
      case 'group': var g = rid(); patchSel(function () { return { g: g }; }); break;
      case 'ungroup': patchSel(function () { return { g: null }; }); break;
      case 'gparts': enterGroup(sel[0], false); break;
      case 'dup': duplicateSel(); break;
      case 'send': openSend(); break;
      case 'del': deleteSel(); break;
      case 'more': openPanel('props'); break;
      case 'al': case 'ac': case 'ar': case 'at': case 'am': case 'ab': case 'dh': case 'dv': case 'sw': case 'sh': case 'row': case 'col': arrange(k); break;
      case 'arr':
        ctxPop([['row', 'sw', 'Line up in a row'], ['col', 'sh', 'Line up in a column'], ['al', 'al', 'Align left'], ['ac', 'ac', 'Align centre'], ['ar', 'ar', 'Align right'], ['at', 'at', 'Align top'], ['am', 'am', 'Align middle'], ['ab', 'ab', 'Align bottom'], ['dh', 'dh', 'Distribute horizontally'], ['dv', 'dv', 'Distribute vertically'], ['sw', 'sw', 'Same width'], ['sh', 'sh', 'Same height']].map(function (o) { return '<button class="mi" data-v="' + o[0] + '" type="button">' + svg(o[1]) + o[2] + '</button>'; }).join(''), b, function (v) { arrange(v); }, false, 'menu');
        break;
      case 'cmore':
        ctxPop(MOREITEMS.map(function (o) { return '<button class="mi" data-v="' + o[0] + '" type="button">' + (IC[o[2]] ? svg(o[2]) : '') + esc(o[1]) + '</button>'; }).join(''), b, function (v) { setTimeout(function () { ctxAction(v, $('#ctx [data-c="cmore"]') || b); }, 0); }, false, 'menu');
        break;
      case 'flfront': ctxPop(swatches(['#FFFDF8', '#FFF1A8', '#FFD2B0', '#FFC2CF', '#D9C8F5', '#C3DAF7', '#BFE8D2', '#E3E2DE', '#3A3A37'], e.fill), b, function (v) { patchSel(function () { return { fill: v === '#FFFDF8' ? null : v }; }); }); break;
      case 'flback': ctxPop(swatches(['#F1DFA0', '#FFF1A8', '#FFD2B0', '#FFC2CF', '#D9C8F5', '#C3DAF7', '#BFE8D2', '#E3E2DE', '#3A3A37'], e.color), b, function (v) { patchSel(function () { return { color: v }; }); }); break;
      case 'lessonbtn': if (B.lesson && B.lesson.frame === e.id) endLessonDialog(e); else { op({ t: 'lesson', frame: e.id }); goFrame(e); socket.emit('b:summon', { view: { x: e.x, y: e.y - 40, w: e.w, h: e.h + 40 } }); toast('Lesson started — everyone is on this frame'); } break;
      case 'fpdf': exportPdf(e.id); break;
      case 'fhtml': exportHtml([e.id]); break;
      case 'elink': copyText(elLink(e.id), 'Link copied — paste it into a text, a chat or on any board'); break;
      case 'tlink': linkTextDialog(e, b, ed); break;
      case 'trim': trimDialog(e, b); break;
      case 'idea': addToIdeas(); break;
      case 'lbox': langBoxDialog(e, b); break;
      case 'step':
        var fr0 = framesOf(e)[0], used = {};
        B.elements.forEach(function (x) { if (x.step && fr0 && framesOf(x)[0] === fr0) used[x.step] = 1; });
        var nmax = Math.max(6, Object.keys(used).length + 2);
        ctxPop('<div class="lbl">Which task is this?</div><div class="trow">' + Array.from({ length: nmax }, function (_, i) { return '<button class="cb' + (e.step === i + 1 ? ' on' : '') + '" data-v="' + (i + 1) + '" type="button">Task ' + (i + 1) + (used[i + 1] ? ' •' : '') + '</button>'; }).join('') + '</div><button class="mi" data-v="0" type="button">Not a task</button><p class="hint" style="max-width:280px;margin:4px 0 0">On the frame title you get buttons Task 1, Task 2… to open each one for students, plus Show all / Hide all.</p>', b,
          function (v) { patchSel(function (x) { return x.type === 'frame' ? null : { step: Number(v) || null }; }); }, false, 'tpop');
        break;
    }
  }

  function reorder(how) {
    var ids = sel.filter(function (id) { var x = find(id); return x && x.type !== 'frame'; });
    if (!ids.length) return;
    var before = B.elements.map(function (e) { return e.id; });
    op({ t: 'order', ids: ids, how: how }, function (ok) { if (ok) pushUndo(function () { restoreOrder(before); }); });
  }
  function restoreOrder(before) { if (isT()) op({ t: 'order-set', order: before }); }
  function arrange(k) {
    var els = sel.map(find).filter(function (e) { return e && !e.lock && e.type !== 'line'; });
    var boxes = els.map(function (e) { return { e: e, b: boxOf(e) }; });
    var U = union(boxes.map(function (x) { return x.b; })), moves = [];
    if (k === 'sw' || k === 'sh') {
      var ref = boxes[0].b;
      return patchSel(function (e) {
        var b = boxOf(e);
        if (/^(image|frame|zone|note|flip|shape)$/.test(e.type)) {
          if (k === 'sw') return e.type === 'image' ? { w: r1(ref.w), h: r1(e.h * ref.w / b.w) } : { w: r1(ref.w) };
          return e.type === 'image' ? { h: r1(ref.h), w: r1(e.w * ref.h / b.h) } : { h: r1(ref.h) };
        }
        if (/^(text|sentence|scale)$/.test(e.type) && k === 'sw') return { w: r1(ref.w) };
        if (e.type === 'wheel') return { size: r1(k === 'sw' ? ref.w : ref.h) };
        return null;
      }, els.map(function (e) { return e.id; }));
    }
    if (k === 'row' || k === 'col') {
      var ax2 = k === 'row' ? 'x' : 'y', sz2 = k === 'row' ? 'w' : 'h', gap2 = 24, cur2 = U[ax2];
      boxes.sort(function (a, b) { return a.b[ax2] - b.b[ax2] || a.b[k === 'row' ? 'y' : 'x'] - b.b[k === 'row' ? 'y' : 'x']; });
      boxes.forEach(function (x) { var dxx = k === 'row' ? cur2 - x.b.x : U.x - x.b.x, dyy = k === 'row' ? U.y - x.b.y : cur2 - x.b.y; moves.push(mv(x.e, dxx, dyy)); cur2 += x.b[sz2] + gap2; });
      return sendMoves(moves);
    }
    if (k === 'dh' || k === 'dv') {
      var ax = k === 'dh' ? 'x' : 'y', sz = k === 'dh' ? 'w' : 'h';
      boxes.sort(function (a, b) { return a.b[ax] - b.b[ax]; });
      var total = boxes.reduce(function (s, x) { return s + x.b[sz]; }, 0), gap = (U[sz] - total) / (boxes.length - 1), cur = U[ax];
      boxes.forEach(function (x) { var d = cur - x.b[ax]; moves.push(mv(x.e, ax === 'x' ? d : 0, ax === 'y' ? d : 0)); cur += x.b[sz] + gap; });
    } else boxes.forEach(function (x) {
      var b = x.b, dx = 0, dy = 0;
      if (k === 'al') dx = U.x - b.x; if (k === 'ar') dx = U.x + U.w - (b.x + b.w); if (k === 'ac') dx = U.x + U.w / 2 - (b.x + b.w / 2);
      if (k === 'at') dy = U.y - b.y; if (k === 'ab') dy = U.y + U.h - (b.y + b.h); if (k === 'am') dy = U.y + U.h / 2 - (b.y + b.h / 2);
      moves.push(mv(x.e, dx, dy));
    });
    sendMoves(moves);
  }
  // расстояние между предметами: ось x — в ряд, y — в столбик; delta в пикселях доски
  function spacing(ax, delta) {
    var els = sel.map(find).filter(function (e) { return e && !e.lock && e.type !== 'line'; }); if (els.length < 2) return;
    var sz = ax === 'x' ? 'w' : 'h', boxes = els.map(function (e) { return { e: e, b: boxOf(e) }; }).sort(function (a, b) { return a.b[ax] - b.b[ax]; });
    var U = union(boxes.map(function (x) { return x.b; })), total = boxes.reduce(function (s0, x) { return s0 + x.b[sz]; }, 0);
    var g = Math.max(0, (U[sz] - total) / (boxes.length - 1) + delta), cur = boxes[0].b[ax], moves = [];
    boxes.forEach(function (x) { var d = cur - x.b[ax]; moves.push(mv(x.e, ax === 'x' ? d : 0, ax === 'y' ? d : 0)); cur += x.b[sz] + g; });
    sendMoves(moves);
  }
  function alignPop(btn) {
    var A = [['row', 'sw', 'In a row'], ['col', 'sh', 'In a column'], ['al', 'al', 'Left'], ['ac', 'ac', 'Centre'], ['ar', 'ar', 'Right'], ['at', 'at', 'Top'], ['am', 'am', 'Middle'], ['ab', 'ab', 'Bottom'], ['dh', 'dh', 'Even ↔'], ['dv', 'dv', 'Even ↕']];
    var p = ctxPop('<div class="lbl">Align</div><div class="algrid">' + A.map(function (o) { return '<button class="cb" data-v="' + o[0] + '" type="button" data-tip="' + o[2] + '">' + svg(o[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="lbl">Spacing</div><div class="sprow"><span>↔</span><button class="cb" data-v="x-" type="button" data-tip="Closer">−</button><button class="cb" data-v="x0" type="button" data-tip="No gaps">0</button><button class="cb" data-v="x+" type="button" data-tip="Further apart">＋</button></div>' +
      '<div class="sprow"><span>↕</span><button class="cb" data-v="y-" type="button" data-tip="Closer">−</button><button class="cb" data-v="y0" type="button" data-tip="No gaps">0</button><button class="cb" data-v="y+" type="button" data-tip="Further apart">＋</button></div>', btn,
      function (v) {
        var st = Math.max(4, Math.round(16 / Math.max(0.25, V.z)));
        if (/^[xy][-+0]$/.test(v)) { if (v[1] === '0') spacing(v[0], -1e6); else spacing(v[0], v[1] === '+' ? st : -st); }
        else arrange(v);
      }, true, 'alpop');
    return p;
  }
  document.addEventListener('click', function (ev) {
    var tv = ev.target.closest && ev.target.closest('.tnview');
    if (tv) { ev.stopPropagation(); var big = ev.target.closest('[data-big]'); if (big) openLightbox(big.dataset.big); else if (ev.target.closest('[data-tnedit]')) { var te0 = find(sel[0]); if (te0) tnoteDialog(te0, ev.target); } return; }
    var b = ev.target.closest && ev.target.closest('.alignbtn'); if (!b) return; ev.stopPropagation();
    if (b.dataset.tplus) { var te = find(sel[0]); if (te && te.type === 'table') tableEdit(te, function (t) { if (b.dataset.tplus === 'col') { t.cols.push(t.cols[t.cols.length - 1] || 220); t.cells.forEach(function (r) { r.push(''); }); } else { t.rows.push(t.rows[t.rows.length - 1] || 150); t.cells.push(t.cols.map(function () { return ''; })); } }); return; }
    alignPop(b);
  }, true);
  function mv(e, dx, dy) { return { id: e.id, x: r1(e.x + dx), y: r1(e.y + dy), ox: e.x, oy: e.y }; }
  function sendMoves(moves) {
    moves = moves.filter(function (m) { return m.x !== m.ox || m.y !== m.oy; });
    if (!moves.length) return;
    var ids = moves.map(function (m) { return m.id; }), skipS = {};
    (drag && drag.sids || []).forEach(function (id) { skipS[id] = 1; });
    moves.forEach(function (m) {
      var e = find(m.id); if (!e) return;
      var dx = m.x - m.ox, dy = m.y - m.oy;
      if (e.type === 'frame') {
        // содержимое фрейма сразу едет вместе с ним, без «отставания» до ответа сервера
        children(e).forEach(function (c) { if (ids.indexOf(c.id) >= 0) return; c.x = r1(c.x + dx); c.y = r1(c.y + dy); if (c.type === 'line') { c.x2 += dx; c.y2 += dy; } if (c.type === 'card') { c.hx += dx; c.hy += dy; } });
        B.strokes.forEach(function (st) { if (inRect(st.pts[0], e)) { skipS[st.id] = 1; st.pts.forEach(function (p) { p[0] += dx; p[1] += dy; }); } });
      } else if (/^(image|shape|note|zone|text)$/.test(e.type)) {
        // пометки ручкой на картинке, фигуре или стикере едут вместе с ними
        var bx = elBox(Object.assign({}, e, { x: m.ox, y: m.oy })), carry = [];
        B.strokes.forEach(function (st) { if (skipS[st.id] || !canStroke(st)) return; if (st.pts.every(function (p) { return p[0] >= bx.x - 4 && p[0] <= bx.x + bx.w + 4 && p[1] >= bx.y - 4 && p[1] <= bx.y + bx.h + 4; })) { carry.push(st.id); skipS[st.id] = 1; } });
        if (carry.length) finishStrokeMove(carry, dx, dy);
      }
      if (e.type === 'line') { e.x2 += m.x - e.x; e.y2 += m.y - e.y; } e.x = m.x; e.y = m.y;
    });
    render();
    op({ t: 'move-many', items: moves.map(function (m) { return { id: m.id, x: m.x, y: m.y }; }) }, function (ok) {
      if (ok) pushUndo(function () { op({ t: 'move-many', items: moves.map(function (m) { return { id: m.id, x: m.ox, y: m.oy }; }) }); });
    });
  }

  /* ---------- copy, paste, duplicate, delete ---------- */
  function collect(ids) {
    var out = [], seen = {}, strokes = [];
    ids.forEach(function (id) {
      var e = find(id); if (!e || seen[id]) return;
      seen[id] = 1; out.push(clone(e));
      if (e.type === 'frame') {
        children(e).forEach(function (c) { if (!seen[c.id]) { seen[c.id] = 1; out.push(clone(c)); } });
        B.strokes.forEach(function (s) { if (inRect(s.pts[0], e)) strokes.push(clone(s)); });
      }
      if (e.type === 'sentence') B.elements.forEach(function (c) { if (c.type === 'card' && c.slot && e.parts.some(function (p) { return p && p.slot === c.slot; }) && !seen[c.id]) { seen[c.id] = 1; out.push(clone(c)); } });
    });
    // стрелки, у которых оба конца внутри копии, едут вместе
    B.elements.forEach(function (l) { if (l.type === 'line' && !seen[l.id] && l.from && l.to && seen[l.from] && seen[l.to]) { seen[l.id] = 1; out.push(clone(l)); } });
    out.forEach(function (e) { if (e.type === 'frame') e.owners = []; });
    return { els: out, strokes: strokes };
  }
  function minXY(els) { var x = Infinity, y = Infinity; els.forEach(function (e) { var b = elBox(e); x = Math.min(x, b.x); y = Math.min(y, b.y); }); return { x: x, y: y }; }
  function pasteSet(set, dx, dy) {
    if (!set.els.length) return;
    op({ t: 'paste', els: set.els, strokes: set.strokes, dx: dx, dy: dy }, function (ok) {
      if (ok && Array.isArray(ok)) { var made = ok; setTimeout(function () { select(made.filter(function (id) { var e = find(id); return e && !framesOf(e).some(function (f) { return made.indexOf(f.id) >= 0; }); })); }, 80); pushUndo(function () { made.forEach(function (id) { op({ t: 'del', id: id }); }); }); }
    });
  }
  function duplicateSel() {
    if (!sel.length) return;
    var set = collect(sel);
    if (!isT()) set.els = set.els.filter(canDelete);
    var u = union(sel.map(function (id) { return boxOf(find(id)); }));
    var single = sel.length === 1 && find(sel[0]).type === 'frame';
    pasteSet(set, single ? u.w + 80 : 30, single ? 0 : 30);
  }
  // правило доски: копировать можно везде / только внутри платформы / нельзя (владелец платформы может всегда)
  function copyMode() { return ME && ME.owner ? 'any' : (B && B.copy) || 'platform'; }
  function copySel() {
    if (!sel.length) return false;
    if (copyMode() === 'none') { toast('Copying is turned off on this board'); return false; }
    var set = collect(sel);
    try { localStorage.setItem('klass.clip', JSON.stringify({ at: Date.now(), els: set.els, strokes: set.strokes })); } catch (e) { toast('Too big to copy'); return false; }
    // в буфер обмена кладём всё вместе с картинками — так можно вставить и на другую доску
    var payload = { v: 2, origin: location.origin, at: Date.now(), els: set.els, strokes: set.strokes };
    var local = copyMode() !== 'any'; if (local) payload.local = true;   // только внутри этой платформы: картинки не упаковываем, другой сервер не вставит
    var plain = function () { return 'klass-clip2:' + JSON.stringify(payload); };
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        var blobP = (local ? Promise.resolve({}) : packAssets(set)).then(function (assets) { payload.assets = assets; return new Blob([plain()], { type: 'text/plain' }); });
        navigator.clipboard.write([new ClipboardItem({ 'text/plain': blobP })]).catch(function () { navigator.clipboard.writeText(plain()).catch(function () {}); });
      } else navigator.clipboard.writeText(plain()).catch(function () {});
    } catch (e) {}
    toast(local ? 'Copied. Paste with Ctrl+V on any board of this platform' : 'Copied. Paste with Ctrl+V on any board — on this site or another one');
    return true;
  }
  var ASSET_RE = /^\/(img|media)\/[\w]+\.\w+$|^\/bh\/\w+\/\w+$/;
  function assetUrls(obj, out) {
    if (typeof obj === 'string') { if (ASSET_RE.test(obj) && out.indexOf(obj) < 0) out.push(obj); }
    else if (obj && typeof obj === 'object') Object.keys(obj).forEach(function (k) { assetUrls(obj[k], out); });
    return out;
  }
  function blobToDataUrl(b) { return new Promise(function (ok, bad) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = bad; r.readAsDataURL(b); }); }
  async function packAssets(set) {
    var urls = assetUrls(set.els, []), out = {}, total = 0;
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], { credentials: 'same-origin' }); if (!r.ok) continue;
        if (/^\/bh\//.test(urls[i])) { out[urls[i]] = { html: (await r.text()).replace('<script src="/static/bsync.js"></script>', '') }; continue; }
        var b = await r.blob(); if (total + b.size > 30e6) continue; total += b.size;
        out[urls[i]] = { data: await blobToDataUrl(b), type: b.type };
      } catch (e) {}
    }
    return out;
  }
  // вставка с другого сервера: заново загружаем картинки, аудио и HTML-блоки сюда и меняем ссылки
  async function pasteForeign(c, at) {
    var urls = assetUrls(c.els, []), map = {}, miss = 0, assets = c.assets || {};
    if (urls.length) toast('Bringing ' + urls.length + ' file' + (urls.length > 1 ? 's' : '') + ' over…');
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i], a = assets[u];
      try {
        if (!a) { miss++; continue; }
        if (a.html != null) { if (!isT()) { miss++; continue; } var hr = await api('POST', '/api/t/boards/' + BOARD_ID + '/html', { html: a.html }); map[u] = hr.src; continue; }
        if (/^\/img\//.test(u)) { var ir = await api('POST', '/api/image', { dataUrl: a.data }); map[u] = ir.url; continue; }
        var bl = await (await fetch(a.data)).blob();
        var mr = await fetch('/api/media', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': a.type || bl.type }, body: bl });
        var mj = await mr.json(); if (!mr.ok) throw new Error(mj.error || 'upload'); map[u] = mj.url;
      } catch (e) { miss++; }
    }
    var txt = JSON.stringify({ els: c.els, strokes: c.strokes || [] });
    Object.keys(map).forEach(function (k) { txt = txt.split('"' + k + '"').join('"' + map[k] + '"'); });
    var d = JSON.parse(txt), m = minXY(d.els); at = at || viewCenter();
    pasteSet({ els: d.els, strokes: d.strokes }, at.x - m.x, at.y - m.y);
    if (miss) toast(miss + ' file' + (miss > 1 ? 's' : '') + ' could not be copied — add them again by hand');
  }
  function pasteKlass(text, at) {
    var c2; try { c2 = JSON.parse(text.slice(12)); } catch (err) { toast('Could not read what was copied'); return; }
    if (c2.origin === location.origin) { var m2 = minXY(c2.els); pasteSet({ els: c2.els, strokes: c2.strokes || [] }, at.x - m2.x, at.y - m2.y); }
    else if (c2.local) toast('That board allows copying only within its own platform');
    else pasteForeign(c2, at);
  }
  // вставка в текст: скопированные элементы доски не превращаем в строчку текста
  function textPaste(ev) {
    ev.preventDefault(); var t = (ev.clipboardData && ev.clipboardData.getData('text/plain')) || '';
    if (/^klass-clip2?:/.test(t)) { finishEdit(); if (/^klass-clip2:/.test(t)) pasteKlass(t, lastPointer || viewCenter()); else pasteClip(lastPointer || viewCenter()); return; }
    document.execCommand('insertText', false, t);
  }
  function pasteClip(at) {
    var c; try { c = JSON.parse(localStorage.getItem('klass.clip') || 'null'); } catch (e) { c = null; }
    if (!c || !c.els || !c.els.length) return false;
    var m = minXY(c.els); at = at || viewCenter();
    pasteSet({ els: c.els, strokes: c.strokes || [] }, at.x - m.x, at.y - m.y);
    return true;
  }
  function deleteSel() {
    var els = sel.map(find).filter(function (e) { return e && canDelete(e); });
    if (!els.length) return;
    if (els.some(function (e) { return e.lock; })) { toast('Unlock it first'); return; }
    var saved = collect(els.map(function (e) { return e.id; })).els;
    els.forEach(function (e) { op({ t: 'del', id: e.id, all: e.type === 'frame' }); });
    select([]);
    pushUndo(function () { op({ t: 'restore', els: saved }); });
  }

  /* ---------- tools ---------- */
  var TOOL_DEFAULT = { bar: ['select', 'hand', 'note', 'draw', 'text', 'shape', 'line', 'frame', 'sticker', 'image', 'undo'], more: ['mytpl', 'media', 'mic', 'tasks', 'widgets', 'games', 'settings'] };
  var TOOL_GROUP = { select: 0, hand: 0, note: 1, draw: 1, text: 1, shape: 1, line: 1, frame: 1, mytpl: 2, sticker: 2, image: 2, media: 2, mic: 2, tasks: 3, widgets: 3, games: 3, settings: 4, undo: 4 };
  var TOOL_NAME = { select: 'Select', hand: 'Pan', frame: 'Frame', draw: 'Draw', note: 'Sticky', text: 'Text', shape: 'Shape', line: 'Connector', mytpl: 'Templates', sticker: 'Emoji', image: 'Image', media: 'Audio/Video', mic: 'Voice', tasks: 'Tasks', widgets: 'Widgets', games: 'Games', settings: 'Settings', undo: 'Undo' };
  var moreOpen = false;
  // что на панели и что спрятано в «More»; хранится в браузере, лишнее при нехватке места уходит в More само
  function toolLayout() {
    var all = TOOL_DEFAULT.bar.concat(TOOL_DEFAULT.more), o = null;
    try { o = JSON.parse(localStorage.getItem('klass.tools2') || 'null'); } catch (e) {}
    if (!o || !Array.isArray(o.bar) || !Array.isArray(o.more)) {
      var old = null; try { old = JSON.parse(localStorage.getItem('klass.tools') || 'null'); } catch (e) {}
      o = Array.isArray(old) && old.length ? { bar: old, more: [] } : { bar: TOOL_DEFAULT.bar.slice(), more: TOOL_DEFAULT.more.slice() };
    }
    var seen = {}, ok = function (k) { if (all.indexOf(k) < 0 || seen[k]) return false; seen[k] = 1; return true; };
    o = { bar: o.bar.filter(ok), more: o.more.filter(ok) };
    all.forEach(function (k) { if (!seen[k]) o.more.push(k); });   // новые инструменты — в More
    return o;
  }
  function saveToolLayout(o) { try { localStorage.setItem('klass.tools2', JSON.stringify(o)); localStorage.removeItem('klass.tools'); } catch (e) {} }
  function resetTools() { try { localStorage.removeItem('klass.tools2'); localStorage.removeItem('klass.tools'); } catch (e) {} buildTools(); toast('Toolbar is back to default'); }
  function setMore(on) { moreOpen = !!on; var m = $('#tmore'); if (m) m.hidden = !moreOpen; }
  function syncMoreCur() { var mb = $('#moreTools'); if (mb) mb.classList.toggle('cur', !!$('#tmore .tb.cur')); }
  // перетаскивание: зажать кнопку (на панели или в More) и перенести — внутри панели, в More и обратно
  (function toolDrag() {
    var bar = $('#tools'), st = null, suppress = false;
    function kids(zone) { return Array.prototype.filter.call(zone.children, function (n) { return n.dataset && n.dataset.k && n !== st.el; }); }
    function startDrag(x, y) {
      st.on = true; clearTimeout(st.timer);
      setMore(true);
      $$('.tmempty', bar).forEach(function (n) { n.remove(); });
      st.el.classList.add('tdrag-src');
      var g = st.el.cloneNode(true); g.classList.add('tghost'); g.removeAttribute('id'); g.removeAttribute('data-tip');
      $$('[id]', g).forEach(function (n) { n.removeAttribute('id'); }); $$('input', g).forEach(function (n) { n.remove(); });
      document.body.appendChild(g); st.ghost = g;
      st.ph = document.createElement('div'); st.ph.className = 'tph';
      st.el.parentNode.insertBefore(st.ph, st.el.nextSibling);
      document.body.classList.add('tdragging'); place(x, y);
    }
    function place(x, y) {
      st.ghost.style.left = x + 'px'; st.ghost.style.top = y + 'px';
      var t = document.elementFromPoint(x, y), mb = $('#moreTools'), grid = $('.tmgrid', bar), zone = null;
      if (!t) return;
      if (t.closest('#moreTools')) { zone = grid; }
      else if (t.closest('#tmore')) zone = grid;
      else if (t.closest('#tools')) zone = bar;
      if (!zone) return;
      var list = kids(zone), ref = null, nar = narrow();
      if (list.length) {
        var best = null, bd = 1e9;
        list.forEach(function (n) { var r = n.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = { n: n, r: r, cx: cx, cy: cy }; } });
        var before = zone === bar ? (nar ? x < best.cx : y < best.cy) : (Math.abs(y - best.cy) > best.r.height / 2 ? y < best.cy : x < best.cx);
        ref = before ? best.n : best.n.nextSibling;
      } else ref = zone === bar ? mb : null;
      if (zone === bar && (!ref || !ref.parentNode || ref.parentNode !== bar)) ref = mb;
      if (st.ph.parentNode === zone && st.ph.nextSibling === ref) return;
      if (ref === st.ph) return;
      zone.insertBefore(st.ph, ref);
    }
    function end(commit) {
      document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', cancel, true);
      var s = st; st = null; if (!s) return; clearTimeout(s.timer);
      if (!s.on) return;
      suppress = true; setTimeout(function () { suppress = false; }, 350);
      if (s.ghost) s.ghost.remove();
      document.body.classList.remove('tdragging');
      if (commit && s.ph && s.ph.parentNode) {
        var lay0 = toolLayout(), nb = [], nm = [], inDom = {};
        var take = function (zone, out) { Array.prototype.forEach.call(zone.children, function (n) { if (n === s.ph) { out.push(s.el.dataset.k); inDom[s.el.dataset.k] = 1; } else if (n.dataset && n.dataset.k && n !== s.el) { out.push(n.dataset.k); inDom[n.dataset.k] = 1; } }); };
        take(bar, nb); take($('.tmgrid', bar), nm);
        lay0.bar.forEach(function (k) { if (!inDom[k]) nb.push(k); }); lay0.more.forEach(function (k) { if (!inDom[k]) nm.push(k); });
        saveToolLayout({ bar: nb, more: nm });
      }
      if (s.ph) s.ph.remove();
      buildTools();
    }
    function cancel() { end(false); }
    function mv(e) {
      if (!st || e.pointerId !== st.id) return;
      if (!st.on) {
        var d = Math.hypot(e.clientX - st.sx, e.clientY - st.sy);
        if (st.touch) { if (d > 9) { clearTimeout(st.timer); end(false); } return; }
        if (d > 5) startDrag(e.clientX, e.clientY);
        return;
      }
      e.preventDefault(); place(e.clientX, e.clientY);
    }
    function up(e) { if (!st || e.pointerId !== st.id) return; end(true); }
    bar.addEventListener('pointerdown', function (e) {
      if (st || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var k = e.target.closest('[data-k]'); if (!k || !bar.contains(k)) return;
      st = { el: k, id: e.pointerId, sx: e.clientX, sy: e.clientY, on: false, touch: e.pointerType !== 'mouse', timer: 0, ph: null, ghost: null };
      if (st.touch) st.timer = setTimeout(function () { if (st && !st.on) { startDrag(st.sx, st.sy); if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) {} } }, 320);
      document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', cancel, true);
    });
    bar.addEventListener('contextmenu', function (e) { if (st) e.preventDefault(); });
    document.addEventListener('click', function (e) { if (suppress && e.target.closest && e.target.closest('#tools')) { e.preventDefault(); e.stopPropagation(); } }, true);
    // клик вне панели закрывает More; выбор инструмента из More — тоже
    document.addEventListener('pointerdown', function (e) { if (moreOpen && !st && !e.target.closest('#tools')) setMore(false); });
    bar.addEventListener('click', function (e) {
      if (e.target.closest('#tmReset')) { resetTools(); return; }
      if (e.target.closest('#moreTools')) { setMore(!moreOpen); return; }
      if (moreOpen && e.target.closest('#tmore .tb')) setTimeout(function () { if (!st) setMore(false); }, 80);
    });
    var rz = 0; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (!st && ME && B) buildTools(); }, 150); });
  })();
  function buildTools() {
    if (document.body.classList.contains('tdragging')) return;
    var T = isT();
    var tb = function (id, icon, tip, extra) { return '<button class="tb' + (tool === id ? ' cur' : '') + '" data-tool="' + id + '" type="button" data-tip="' + tip + '" aria-label="' + tip + '"' + (extra || '') + '>' + svg(icon) + '</button>'; };
    var ad = function (type, icon, tip) { return '<button class="tb" data-add="' + type + '" type="button" data-tip="' + tip + '" aria-label="' + tip + '">' + svg(icon) + '</button>'; };
    var drawing = /^(pen|marker|eraser)$/.test(tool), canMake = T || (B && B.studentEdit !== false);
    // панель инструментов: порядок по умолчанию, свой порядок можно собрать в ⋯ → Arrange toolbar
    var ITEMS = {
      select: tb('select', 'select', 'Select (V)'), hand: tb('hand', 'hand', 'Pan (H or hold Space)'),
      frame: T ? ad('frame', 'frame', 'Frame (F)') : '',
      draw: '<button class="tb drawb' + (drawing ? ' cur' : '') + '" id="colBtn" type="button" data-tip="Pen, highlighter, eraser and colours (P / E)" aria-label="Draw">' + svg(drawTool === 'marker' ? 'marker' : drawTool === 'eraser' ? 'eraser' : 'pen') + '<span class="dot mini" id="colDot" style="--c:' + inkColor + '"></span></button>',
      note: tb('note', 'note', 'Sticky note (N)'),
      text: canMake ? tb('text', 'text', 'Text (T)') : '', shape: canMake ? tb('shape', 'shape', 'Shape (S)', ' id="shpBtn"') : '', line: canMake ? tb('line', 'line', 'Connector (L)') : '',
      mytpl: T ? '<button class="tb" data-panel="mytplPanel" type="button" data-tip="My templates" aria-label="My templates">' + svg('tpl') + '</button>' : '',
      sticker: tb('sticker', 'emoji', 'Emoji', ' id="stkBtn"'),
      image: '<label class="tb" data-tip="Image — or paste a screenshot with Ctrl+V" aria-label="Image">' + svg('image') + '<input type="file" accept="image/*" id="imgIn" multiple hidden></label>',
      media: '<label class="tb" data-tip="Audio or video file (up to 40 MB)" aria-label="Audio or video">' + svg('media') + '<input type="file" accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm" id="mediaIn" hidden></label>',
      mic: '<button class="tb" id="micBtn" type="button" data-tip="Record a voice message" aria-label="Voice message">' + svg('mic') + '</button>',
      tasks: T ? '<button class="tb" data-fly="tasks" type="button" data-tip="Auto-checked tasks" aria-label="Auto-checked tasks">' + svg('tasks') + '</button>' : '',
 games: T ? '<button class="tb" data-fly="games" type="button" data-tip="Games: Taboo, Bingo, Jeopardy, Buzzer…" aria-label="Games">' + svg('gamesI') + '</button>' : '',
      widgets: T ? '<button class="tb" data-fly="widgets" type="button" data-tip="Interactive widgets: wheel, poll, table, kanban…" aria-label="Interactive widgets">' + svg('wheel') + '</button>' : '',
      settings: T ? '<button class="tb" data-panel="boardPanel" type="button" data-tip="Board settings">' + svg('settings') + '</button>' : '',
      undo: '<button class="tb" id="undoBtn" type="button" data-tip="Undo (Ctrl+Z)" aria-label="Undo">' + svg('undo') + '</button>'
    };
    var lay = toolLayout(), barKeys = lay.bar.filter(function (k) { return ITEMS[k]; }), moreKeys = lay.more.filter(function (k) { return ITEMS[k]; });
    var mk = function (k, inMore) { var it = ITEMS[k].replace(/^<(button|label)/, '<$1 data-k="' + k + '"'); if (inMore) it = it.replace(/<\/(button|label)>$/, '<span class="tl">' + TOOL_NAME[k] + '</span></$1>'); return it; };
    var draw = function (bk, mkeys, open) {
      var h = '', prev = -1;
      bk.forEach(function (k) { var g = TOOL_GROUP[k]; if (prev !== -1 && g !== prev) h += '<span class="sep"></span>'; h += mk(k, false); prev = g; });
      h += '<button class="tb tmorebtn" id="moreTools" type="button" data-tip="More tools — hold a button and drag to rearrange" aria-label="More tools"><svg viewBox="0 0 24 24"><path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="2.8"/></svg></button>';
      h += '<div class="tmore" id="tmore"' + (open ? '' : ' hidden') + '><div class="tmh"><span>More tools</span><button type="button" id="tmReset" data-tip="Back to the default toolbar">Reset</button></div><div class="tmgrid">' + (mkeys.length ? mkeys.map(function (k) { return mk(k, true); }).join('') : '<div class="tmempty">Drop tools here</div>') + '</div><p class="tmhint">Hold a button and drag: reorder, or move it between the panel and here.</p></div>';
      return h;
    };
    var barEl = $('#tools'), keep = { select: 1, hand: 1, undo: 1, note: 1 }, guard = 0;
    barEl.innerHTML = draw(barKeys, moreKeys, false);
    // не помещается по высоте (или по ширине на телефоне) — последние кнопки сами уходят в More
    while (guard++ < 30 && (narrow() ? barEl.scrollWidth > barEl.clientWidth + 1 : barEl.scrollHeight > barEl.clientHeight + 1)) {
      var li = -1; for (var q = barKeys.length - 1; q >= 0; q--) if (!keep[barKeys[q]]) { li = q; break; }
      if (li < 0) break;
      moreKeys.unshift(barKeys.splice(li, 1)[0]);
      barEl.innerHTML = draw(barKeys, moreKeys, false);
    }
    if (moreOpen) $('#tmore').hidden = false;
    syncMoreCur();
    $('#undoBtn').onclick = undo;
    if ($('#mediaIn')) $('#mediaIn').addEventListener('change', function () { var f = this.files[0]; this.value = ''; if (f) addMediaFile(f, viewCenter()); });
    var mic = $('#micBtn'); if (mic) mic.onclick = function () { if (rec) stopVoice(false); else startVoice(); };
    $('#colBtn').onclick = function () {
      var p = $('#colPal');
      if (!/^(pen|marker|eraser)$/.test(tool)) { setTool(drawTool); p.hidden = false; } else p.hidden = !p.hidden;
      renderDrawPal(); placePop(p, this);
      $('#stkPal').hidden = true; $('#shpPal').hidden = true;
    };
    $('#imgIn').addEventListener('change', function () {
      var fs = Array.prototype.slice.call(this.files), c = viewCenter();
      addFiles(fs, c);
      this.value = '';
    });
  }
  /* одна кнопка рисования: ручка, маркер, ластик, цвет и толщина */
  var drawTool = 'pen', penW = 3, markW = 20, penSeen = false;
  function pencilOnly() { try { return localStorage.getItem('pencilOnly') === '1'; } catch (e) { return false; } }
  function renderDrawPal() {
    var cur = tool === 'marker' ? 'marker' : tool === 'eraser' ? 'eraser' : 'pen', w = cur === 'marker' ? markW : penW;
    $('#colPal').innerHTML = '<div class="drow">' + [['pen', 'Pen'], ['marker', 'Highlighter'], ['eraser', 'Eraser']].map(function (t) { return '<button class="dtool' + (cur === t[0] ? ' on' : '') + '" data-dt="' + t[0] + '" type="button" data-tip="' + t[1] + '">' + svg(t[0]) + '</button>'; }).join('') + '</div>' +
      '<label class="chk" style="margin:6px 2px 4px"><input type="checkbox" id="pencilOnlyCb"' + (pencilOnly() || penSeen ? ' checked' : '') + '> Pencil only — fingers move the board</label>' +
      (cur === 'eraser' ? '<p class="hint" style="margin:4px 2px 0;max-width:200px">Tip: you can also click a drawing with Select and press Delete.</p>' :
      '<div class="dcols">' + visCols(INK_COLORS).concat(myPalette()).map(function (c) { return '<button class="sw' + (c === inkColor ? ' cur' : '') + '" data-c="' + c + '" style="--c:' + c + '" type="button" aria-label="' + c + '"></button>'; }).join('') + customColor(inkColor) + '</div>' +
      '<div class="drow">' + (cur === 'marker' ? [12, 20, 32] : [2, 3, 6, 10]).map(function (n) { return '<button class="dw' + (n === w ? ' on' : '') + '" data-w="' + n + '" type="button" data-tip="' + n + ' px"><i style="width:' + Math.min(22, n + 2) + 'px;height:' + Math.min(22, n + 2) + 'px;background:' + inkColor + (cur === 'marker' ? ';opacity:.45' : '') + '"></i></button>'; }).join('') + '</div>');
  }
  function setInk(c) { inkColor = c; var d = $('#colDot'); if (d) d.style.setProperty('--c', inkColor); if (tool !== 'pen' && tool !== 'marker') setTool(drawTool === 'eraser' ? 'pen' : drawTool); renderDrawPal(); }
  $('#colPal').addEventListener('change', function (e) { if (e.target.id !== 'pencilOnlyCb') return; try { localStorage.setItem('pencilOnly', e.target.checked ? '1' : '0'); } catch (err) {} if (!e.target.checked) penSeen = false; });
  $('#colPal').addEventListener('click', function (e) {
    if (e.target.closest('[data-eye]')) { pickEye(function (c) { askPalette(c); setInk(c); }); return; }
    var t = e.target.closest('[data-dt]'); if (t) { drawTool = t.dataset.dt; setTool(drawTool); buildTools(); renderDrawPal(); $('#colPal').hidden = false; return; }
    var w = e.target.closest('[data-w]'); if (w) { if (tool === 'marker') markW = Number(w.dataset.w); else penW = Number(w.dataset.w); renderDrawPal(); return; }
    var b = e.target.closest('[data-c]'); if (!b) return;
    setInk(b.dataset.c);
  });
  $('#colPal').addEventListener('change', function (e) { if (e.target.matches('input[type=color]')) { var c = e.target.value.toUpperCase(); askPalette(c); setInk(c); } });
  $('#stkPal').innerHTML = STICKERS.map(function (s) { return '<button type="button" data-e="' + s + '">' + s + '</button>'; }).join('');
  $('#stkPal').addEventListener('click', function (e) { var b = e.target.closest('[data-e]'); if (!b) return; stkEmoji = b.dataset.e; $('#stkPal').hidden = true; setTool('sticker'); });
  $('#shpPal').innerHTML = SHAPE_KINDS.map(function (k) { return '<button type="button" data-s="' + k + '" title="' + k + '">' + svg('sh_' + k) + '</button>'; }).join('');
  $('#shpPal').addEventListener('click', function (e) { var b = e.target.closest('[data-s]'); if (!b) return; shapeKind = b.dataset.s; $('#shpPal').hidden = true; setTool('shape'); });
  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('#stkPal,#stkBtn')) $('#stkPal').hidden = true;
    if (!e.target.closest('#colPal,#colBtn')) $('#colPal').hidden = true;
    if (!e.target.closest('#shpPal,#shpBtn')) $('#shpPal').hidden = true;
    if (!e.target.closest('#flyPal,[data-fly]')) $('#flyPal').hidden = true;
    if (!e.target.closest('#ctxpop,.ctx')) closeCtxPop();
  });
  function setTool(t) {
    tool = t;
    if (/^(pen|marker|eraser)$/.test(t)) { drawTool = t; var db0 = $('#colBtn'); if (db0) { db0.classList.add('cur'); db0.firstElementChild.outerHTML = svg(t === 'marker' ? 'marker' : t === 'eraser' ? 'eraser' : 'pen'); } }
    else { var db1 = $('#colBtn'); if (db1) db1.classList.remove('cur'); }
    $$('.tb[data-tool]').forEach(function (b) { b.classList.toggle('cur', b.dataset.tool === t); }); syncMoreCur();
    vp.style.cursor = t === 'hand' ? 'grab' : /^(pen|marker|line)$/.test(t) ? 'crosshair' : t === 'eraser' ? 'cell' : /^(note|sticker|text|shape)$/.test(t) ? 'copy' : '';
  }
  $('#tools').addEventListener('click', function (e) {
    var b = e.target.closest('.tb[data-tool]');
    if (b) {
      setTool(b.dataset.tool);
      if (b.id === 'stkBtn') { $('#stkPal').hidden = !$('#stkPal').hidden; placePop($('#stkPal'), b); }
      if (b.id === 'shpBtn') { var p = $('#shpPal'); p.hidden = !p.hidden; placePop(p, b); }
    }
    var a = e.target.closest('[data-add]'); if (a) { if (a.dataset.add === 'html') addHtmlBlock(a); else addEl(a.dataset.add); }
    var fl = e.target.closest('[data-fly]'); if (fl) openFly(fl);
  });
  var OUTL = /^(deck|boxes|cloud|open|todo|poll|rating|card|zone|chart|table|kanban|kcard|scale|wheel|dice|coin|link|media|video|html|input|sentence|text|image|flip|ball)$/;
  function isGame(e) { return !!(e && window.GAMES && window.GAMES[e.type]); }
  if (window.GAMES_API) Object.assign(IC, window.GAMES_API.icons());
  var FLY = {
    games: (window.GAMES_API ? window.GAMES_API.list() : []).concat([['detective', 'g_detective', 'Detective board (with threads)']]),
    tasks: [['tpl', 'tasks', 'Task from vocabulary…'], ['mytpl', 'tpl', 'My templates…'], ['card', 'card', 'Drag card'], ['zone', 'zone', 'Drop zone'], ['sentence', 'gaps', 'Sentence with gaps']],
    widgets: [['notebook', 'notes', 'Notebook page (lined, for pen / Apple Pencil)'], ['wheel', 'wheel', 'Spinner wheel'], ['flip', 'flip', 'Flip card'], ['scale', 'scale', 'Opinion scale'], ['rating', 'star', 'Rating (stars)'], ['poll', 'poll', 'Poll / vote'], ['todo', 'todo', 'Checklist'], ['deck', 'card', 'Random cards (shuffled deck)'], ['boxes', 'tasks', 'Open the box'], ['ball', 'emoji', 'Magic ball'], ['cloud', 'cloudI', 'Word cloud'], ['open', 'openI', 'Open ended (finish the sentence)'], ['chart', 'chartI', 'Chart (bar, line, pie)'], ['coin', 'coinI', 'Coin toss'], ['dice', 'dice', 'Dice'], ['table', 'tableI', 'Table'], ['kanban', 'kanbanI', 'Kanban board'], ['kcard', 'kcardI', 'Expandable card'], ['video', 'vid', 'Video by link (Kinescope, YouTube)'], ['link', 'linkI', 'Link with preview (website, board, element)'], ['pdf', 'pdfi', 'PDF pages…'], ['html', 'code', 'Interactive HTML block']]
  };
  function openFly(btn) {
    var p = $('#flyPal'); var same = !p.hidden && p.dataset.k === btn.dataset.fly;
    if (same) { p.hidden = true; return; }
    p.dataset.k = btn.dataset.fly;
    p.innerHTML = FLY[btn.dataset.fly].map(function (x) { return '<button type="button" class="flyi" data-fa="' + x[0] + '">' + (IC[x[1]] ? svg(x[1]) : '<span class="flyemo">' + x[1] + '</span>') + '<span>' + x[2] + '</span></button>'; }).join('');
    p.hidden = false;
    placePop(p, btn);
  }
  // всплывающее меню рядом с кнопкой, но целиком на экране: если не помещается вниз — поднимаем, если выше экрана — прокрутка внутри
  function placePop(p, btn) {
    if (narrow()) { p.style.top = ''; p.style.maxHeight = ''; return; }
    var vr = vp.getBoundingClientRect(), br = btn.getBoundingClientRect();
    p.style.maxHeight = (vr.height - 16) + 'px'; p.style.overflowY = 'auto';
    var h = p.offsetHeight, top = br.top - vr.top + br.height / 2 - 24;
    p.style.top = Math.max(8, Math.min(vr.height - h - 8, top)) + 'px';
  }
  $('#flyPal').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fa]'); if (!b) return;
    $('#flyPal').hidden = true;
    var k = b.dataset.fa;
    if (k === 'detective') { addDetective(); return; }
    if (k === 'notebook') { addNotebook(); return; }
    if (window.GAMES && window.GAMES[k]) { addGame(k); return; }
    if (k === 'tpl') openPanel('tplPanel'); else if (k === 'mytpl') openPanel('mytplPanel'); else if (k === 'html') addHtmlBlock(b); else if (k === 'video') addVideoDialog(); else if (k === 'link') addLinkDialog(); else if (k === 'pdf') pdfDialog(); else addEl(k);
  });

  /* ---------- panels ---------- */
  var PANELS = ['logPanel', 'navPanel', 'tplPanel', 'mytplPanel', 'boardPanel', 'sendPanel', 'props', 'notesPanel', 'roomsPanel', 'journalPanel'];   // exitPanel живёт отдельно — не закрывается, когда открываешь Notes
  function openPanel(id) {
    PANELS.forEach(function (p) { $('#' + p).hidden = p !== id; });
    if (id === 'navPanel') renderNav();
    if (id === 'tplPanel') renderTpl();
    if (id === 'boardPanel') { renderBoardPanel(); loadBackups(); }
    if (id === 'props') renderProps();
    if (id === 'mytplPanel') renderMyTpl();
    if (id === 'notesPanel') openNotes();
    if (id === 'roomsPanel') renderRooms();
    if (id === 'journalPanel') loadJournalPanel();
  }
  function togglePanel(id) { if ($('#' + id).hidden) openPanel(id); else $('#' + id).hidden = true; }
  $('#logBtn').onclick = function () { togglePanel('logPanel'); };
  $('#navBtn').onclick = function () { togglePanel('navPanel'); };
  if ($('#checkBtn')) $('#checkBtn').onclick = function () { op({ t: 'check' }); };
  // кнопка Check прямо на задании: проверяет только это задание
  // задание из шаблона: одна кнопка «✓ Check» под ним, где бы оно ни лежало (и во фрейме тоже)
  function placeTaskPills(hidden) {
    var G = {};
    B.elements.forEach(function (e) {
      if (!e.tk || hidden[e.id]) return;
      var g = G[e.tk] || (G[e.tk] = { ids: [], ok: false });
      g.ids.push(e.id);
      if ((e.type === 'card' && e.answer) || (e.type === 'input' && e.answers && e.answers.length) || (e.type === 'sentence' && e.parts.some(function (p) { return p && p.answer; }))) g.ok = true;
    });
    var h = '';
    Object.keys(G).forEach(function (k) {
      var g = G[k]; if (!g.ok) return;
      var u = union(g.ids.map(function (id) { var e = find(id); return e.type === 'card' && e.slot ? null : boxOf(e); }).filter(Boolean)); if (!u) return;
      h += '<button class="echeck tpill" data-echeck="' + k + '" type="button" data-tip="Check this task" style="left:' + u.x + 'px;top:' + (u.y + u.h + 14) + 'px">✓ Check</button>';
    });
    var lay = $('#lpills'); if (!lay) { lay = document.createElement('div'); lay.id = 'lpills'; world.appendChild(lay); }
    lay.innerHTML = h;
  }
  function checkPill(e) { return '<button class="echeck" data-echeck="' + e.id + '" type="button" data-tip="Check this task">✓ Check</button>'; }
  document.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('[data-echeck]'); if (!b || !b.dataset.echeck) return; ev.preventDefault(); ev.stopPropagation(); op({ t: 'check', id: b.dataset.echeck }); }, true);
  document.addEventListener('pointerdown', function (ev) { if (ev.target.closest && ev.target.closest('.echeck')) ev.stopPropagation(); }, true);
  function myTargets() { return B ? B.elements.filter(function (x) { return (x.type === 'frame' && mine(x)) || assignedToMe(x); }) : []; }
  $('#mineBtn').onclick = function () {
    var my = myTargets(); if (!my.length) return;
    var t = my[mineIdx++ % my.length], b = t.type === 'frame' ? null : boxOf(t);
    if (t.type === 'frame') goFrame(t); else fitTo({ x: b.x - 80, y: b.y - 80, w: b.w + 160, h: b.h + 160 });
  };
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-close]'); if (c) $('#' + c.dataset.close).hidden = true;
    var p = e.target.closest('[data-panel]'); if (p) togglePanel(p.dataset.panel);
  });
  function goFrame(f) { fitTo({ x: f.x, y: f.y - 40, w: f.w, h: (f.collapsed ? 4 : f.h) + 40 }); }
  function setFrame(f, patch) { patchSel(function () { return patch; }, [f.id]); }
  /* ---------- панель фреймов: поиск, модули (группы фреймов) ---------- */
  var navQ = '', navPick = null, navOpen = {};
  function modsOf() { return (B.modules || []).map(function (m) { return Object.assign({}, m, { frames: m.frames.filter(find) }); }); }
  function saveMods(list) { op({ t: 'modules', modules: list }); }
  function renderNav() {
    var fs = frames().slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    if (!isT()) fs = fs.filter(function (f) { return !f.hidden; });
    if (!fs.length) { $('#navBody').innerHTML = '<p class="hint">No frames yet.' + (isT() ? ' Press F to add one per lesson or task.' : '') + '</p>'; return; }
    var eye = function (off) { return svg(off ? 'eyeoff' : 'eye').replace('<svg', '<svg style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7"'); };
    var q = navQ.trim().toLowerCase(), mods = modsOf(), inMod = {};
    mods.forEach(function (m) { m.frames.forEach(function (id) { inMod[id] = m; }); });
    function row(f) {
      var own = f.owners && f.owners.length ? f.owners.map(function (o) { return o.name.split(' ')[0]; }).join(', ') : '';
      return '<div class="navrow' + (framesOf(f).length ? ' sub' : '') + '">' + (navPick ? '<input type="checkbox" class="npick" data-pick="' + f.id + '"' + (navPick[f.id] ? ' checked' : '') + '>' : '') +
        '<button class="navitem' + (mine(f) ? ' mine' : '') + '" data-go="' + f.id + '" type="button"><span class="nt">' + esc(f.title || 'Frame') + '</span><span class="sm">' + esc([own, f.collapsed ? 'collapsed' : '', f.hidden ? 'hidden' : ''].filter(Boolean).join(' · ')) + '</span></button>' +
        (isT() && !navPick ? '<button class="hbtn" data-ncoll="' + f.id + '" type="button" title="Collapse / expand">' + (f.collapsed ? '▸' : '▾') + '</button><button class="hbtn" data-nhide="' + f.id + '" type="button" title="Hide from students / show">' + eye(f.hidden) + '</button>' : '') + '</div>';
    }
    function match(f) { if (!q) return true; var m = inMod[f.id]; return (f.title || '').toLowerCase().indexOf(q) >= 0 || (m && m.name.toLowerCase().indexOf(q) >= 0); }
    var h = '<div class="navtop"><input id="navQ" type="search" placeholder="Search frames and modules" value="' + esc(navQ) + '">' +
      (isT() ? (navPick ? '<button class="pb solid" id="navMake" type="button">Make module</button><button class="pb" id="navCancel" type="button">Cancel</button>' : '<button class="pb" id="navSel" type="button" data-tip="Tick frames and join them into a module">Modules…</button>') : '') + '</div>';
    if (navPick) h += '<p class="hint" style="margin:0 0 6px">Tick the frames for the module.' + (mods.length ? ' Or add them to <select id="navTo"><option value="">— new module —</option>' + mods.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('') + '</select>' : '') + '</p>';
    mods.forEach(function (m) {
      var list = m.frames.map(find).filter(function (f) { return f && fs.indexOf(f) >= 0 && match(f); });
      if (!list.length && (q || !isT())) return;
      var open = q ? true : navOpen[m.id] !== false;
      h += '<div class="nmod" style="--c:' + (m.color || '#C08A2E') + '"><div class="nmodh"><button class="nmodt" data-mtog="' + m.id + '" type="button">' + (open ? '▾' : '▸') + ' <b>' + esc(m.name) + '</b><span class="sm">' + list.length + '</span></button>' +
        '<button class="hbtn" data-mgo="' + m.id + '" type="button" title="Show the whole module">' + svg('selin').replace('<svg', '<svg style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7"') + '</button>' +
        (isT() && !navPick ? '<button class="hbtn" data-mmenu="' + m.id + '" type="button" title="Rename, colour, PDF, remove">⋯</button>' : '') + '</div>' +
        (open ? '<div class="nmodb">' + (list.map(row).join('') || '<p class="hint" style="margin:4px 8px">Empty — tick frames with “Modules…” to add them.</p>') + '</div>' : '') + '</div>';
    });
    var rest = fs.filter(function (f) { return !inMod[f.id] && match(f); });
    if (rest.length) h += (mods.length ? '<div class="nrest">' + (navPick ? 'Frames' : 'Not in a module') + '</div>' : '') + rest.map(row).join('');
    if (q && !rest.length && !mods.some(function (m) { return m.frames.some(function (id) { var f = find(id); return f && match(f); }); })) h += '<p class="hint">Nothing found.</p>';
    $('#navBody').innerHTML = h;
    var qi = $('#navQ'); qi.oninput = function () { navQ = this.value; var p = this.selectionStart; renderNav(); var n2 = $('#navQ'); n2.focus(); try { n2.setSelectionRange(p, p); } catch (e) {} };
    qi.onkeydown = function (e) { e.stopPropagation(); };
  }
  var MOD_COLS = ['#C08A2E', '#7D8A68', '#5B4BC4', '#C2412D', '#2E8B57', '#2F6FE0', '#D0657A'];
  $('#navBody').addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'navSel') { navPick = {}; renderNav(); return; }
    if (t.id === 'navCancel') { navPick = null; renderNav(); return; }
    if (t.dataset.pick) { navPick[t.dataset.pick] = t.checked; return; }
    if (t.id === 'navMake') {
      var ids = Object.keys(navPick).filter(function (k) { return navPick[k]; }); if (!ids.length) { toast('Tick at least one frame'); return; }
      var mods = modsOf().map(function (m) { return Object.assign({}, m, { frames: m.frames.filter(function (id) { return ids.indexOf(id) < 0; }) }); });
      var to = $('#navTo') && $('#navTo').value;
      if (to) mods.forEach(function (m) { if (m.id === to) m.frames = m.frames.concat(ids); });
      else { var nm = prompt('Module name', 'Module ' + (mods.length + 1)); if (!nm || !nm.trim()) return; mods.push({ id: rid(), name: nm.trim(), color: MOD_COLS[mods.length % MOD_COLS.length], frames: ids }); }
      navPick = null; saveMods(mods); setTimeout(renderNav, 250); return;
    }
    var mt = t.closest('[data-mtog]'); if (mt) { navOpen[mt.dataset.mtog] = navOpen[mt.dataset.mtog] === false; renderNav(); return; }
    var mg = t.closest('[data-mgo]'); if (mg) { var mm = modsOf().find(function (m) { return m.id === mg.dataset.mgo; }); var u = mm && union(mm.frames.map(find).filter(Boolean).map(elBox)); if (u) { fitTo({ x: u.x - 60, y: u.y - 60, w: u.w + 120, h: u.h + 120 }, 2); if (narrow()) $('#navPanel').hidden = true; } return; }
    var mn = t.closest('[data-mmenu]'); if (mn) {
      var id = mn.dataset.mmenu;
      ctxPop('<button class="mi" data-v="ren" type="button">Rename</button><div class="dcols" style="padding:4px 8px">' + MOD_COLS.map(function (c) { return '<button class="sw" data-v="c' + c + '" style="--c:' + c + '" type="button"></button>'; }).join('') + '</div><button class="mi" data-v="pdf" type="button">Save module as PDF</button><button class="mi" data-v="html" type="button">Save module as HTML</button><button class="mi" data-v="del" type="button" style="color:#C2412D">Remove module (frames stay)</button>', mn, function (v) {
        var mods = modsOf(), m = mods.find(function (x) { return x.id === id; }); if (!m) return;
        if (v === 'pdf') { exportPdf(m.frames); return; }
        if (v === 'html') { exportHtml(m.frames); return; }
        if (v === 'ren') { var nm = prompt('Module name', m.name); if (!nm || !nm.trim()) return; m.name = nm.trim(); }
        else if (v === 'del') mods = mods.filter(function (x) { return x !== m; });
        else if (v[0] === 'c') m.color = v.slice(1);
        saveMods(mods); setTimeout(renderNav, 250);
      }, false, 'menu');
      return;
    }
    var g = t.closest('[data-go]'); if (g && !navPick) { var f = find(g.dataset.go); if (f) goFrame(f); if (narrow()) $('#navPanel').hidden = true; return; }
    if (g && navPick) { var cb0 = g.parentNode.querySelector('[data-pick]'); if (cb0) { cb0.checked = !cb0.checked; navPick[cb0.dataset.pick] = cb0.checked; } return; }
    var c = t.closest('[data-ncoll]'); if (c) { var f1 = find(c.dataset.ncoll); setFrame(f1, { collapsed: !f1.collapsed || null }); setTimeout(renderNav, 200); return; }
    var hh = t.closest('[data-nhide]'); if (hh) { var f2 = find(hh.dataset.nhide); setFrame(f2, { hidden: !f2.hidden || null }); setTimeout(renderNav, 200); }
  });

  /* ---------- images & pasting ---------- */
  function addImageUrl(url, at) {
    var img = new Image();
    img.onload = function () {
      var sc = Math.min(1, 480 / Math.max(img.width, img.height)), c = at || viewCenter();
      var el = { id: rid(), type: 'image', x: Math.round(c.x - img.width * sc / 2), y: Math.round(c.y - img.height * sc / 2), w: Math.round(img.width * sc), h: Math.round(img.height * sc), src: url };
      op({ t: 'add', el: el }, function (ok) { if (ok) { setTimeout(function () { select(el.id); }, 60); pushUndo(function () { op({ t: 'del', id: el.id }); }); } });
    };
    img.onerror = function () { toast('Could not load that image'); };
    img.src = url;
  }
  // несколько картинок сразу — аккуратной сеткой, без наложения
  // перетаскивание файлов с компьютера: картинки, PDF, аудио, видео, HTML-задания, доски (.json)
  async function addFiles(files, at) {
    var ext = function (f) { return (f.name.split('.').pop() || '').toLowerCase(); };
    var pdf = files.find(function (f) { return f.type === 'application/pdf' || ext(f) === 'pdf'; });
    if (pdf && isT()) { pdfDialog(pdf); files = files.filter(function (f) { return f !== pdf; }); if (!files.length) return; }
    var htmls = files.filter(function (f) { return /^html?$/.test(ext(f)) || f.type === 'text/html'; });
    if (htmls.length) {
      if (!isT()) toast('Only the teacher can add interactive HTML blocks');
      else for (var hi = 0; hi < htmls.length; hi++) { var hp = { x: at.x + hi * 60, y: at.y + hi * 60 }; await sendHtml(await htmls[hi].text(), hp); }
    }
    var jsons = files.filter(function (f) { return ext(f) === 'json'; });
    for (var ji = 0; ji < jsons.length && isT(); ji++) {
      try { var bd = JSON.parse(await jsons[ji].text()), els = bd.elements || bd.els; if (!Array.isArray(els) || !els.length) throw new Error('no elements'); var m0 = minXY(els); pasteSet({ els: els, strokes: bd.strokes || [] }, at.x - m0.x, at.y - m0.y); toast('Board content added: ' + els.length + ' items'); }
      catch (err) { toast(jsons[ji].name + ': not a board file'); }
    }
    var known = /^(png|jpe?g|gif|webp|heic|mp3|m4a|wav|ogg|oga|mp4|mov|m4v|webm|pdf|html?|json)$/;
    var odd = files.filter(function (f) { return !/^(image|audio|video)\//.test(f.type) && !known.test(ext(f)); });
    if (odd.length) toast('Can’t add ' + odd.map(function (f) { return f.name; }).join(', ') + ' — use pictures, PDF, audio, video or HTML');
    var media = files.filter(function (f) { return /^(audio|video)\//.test(f.type) || /^(mp3|m4a|wav|ogg|oga|mp4|mov|m4v|webm)$/.test(ext(f)); }), imgs = files.filter(function (f) { return /^image\//.test(f.type); }).slice(0, 60);
    media.forEach(function (f, i) { addMediaFile(f, { x: at.x + i * 40, y: at.y + i * 40 }); });
    if (imgs.length === 1) return addImageFile(imgs[0], at);
    if (!imgs.length) return;
    toast('Uploading ' + imgs.length + ' images…');
    var loaded = await Promise.all(imgs.map(async function (f) {
      try { var url = await uploadImage(f); return await new Promise(function (res) { var im = new Image(); im.onload = function () { res({ url: url, w: im.width, h: im.height }); }; im.onerror = function () { res(null); }; im.src = url; }); }
      catch (err) { toast(f.name + ': ' + err.message); return null; }
    }));
    loaded = loaded.filter(Boolean); if (!loaded.length) return;
    var cols = Math.ceil(Math.sqrt(loaded.length)), cell = 320, gap = 24, made = [];
    loaded.forEach(function (im, i) {
      var sc = Math.min(1, cell / Math.max(im.w, im.h)), w = Math.round(im.w * sc), h = Math.round(im.h * sc);
      var cx = at.x + (i % cols - (cols - 1) / 2) * (cell + gap), cy = at.y + (Math.floor(i / cols) - (Math.ceil(loaded.length / cols) - 1) / 2) * (cell + gap);
      made.push({ id: rid(), type: 'image', x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: w, h: h, src: im.url });
    });
    var done = 0;
    made.forEach(function (el) { op({ t: 'add', el: el }, function () { if (++done === made.length) { select(made.map(function (x) { return x.id; }).filter(find)); pushUndo(function () { made.forEach(function (x) { op({ t: 'del', id: x.id }); }); }); } }); });
  }
  async function addImageFile(f, at) { if (!f || !/^image\//.test(f.type)) return; try { addImageUrl(await uploadImage(f), at); } catch (err) { toast(err.message); } }
  async function addRemoteImage(src, at) { try { var r = await api('POST', '/api/image-url', { url: src }); addImageUrl(r.url, at); } catch (err) { toast('Image not copied: ' + err.message); } }
  function addNoteText(text, at) {
    var n = { id: rid(), type: 'note', x: r1(at.x - 100), y: r1(at.y - 100), w: 200, h: 200, text: text.slice(0, 3000), color: NOTE_COLORS[0] };
    op({ t: 'add', el: n }, function (ok) { if (ok) pushUndo(function () { op({ t: 'del', id: n.id }); }); });
  }
  // копирование из меню браузера (Правка → Копировать) тоже кладёт доску в буфер
  document.addEventListener('copy', function (e) {
    if (!B || !sel.length || editing) return;
    var t = e.target; if (t && t.closest && t.closest('input,textarea,[contenteditable=true],[contenteditable=plaintext-only]')) return;
    var g = getSelection(); if (g && String(g).trim()) return;
    if (copyMode() === 'none') { e.preventDefault(); return; }
    if (copySel()) e.preventDefault();
  });
  document.addEventListener('paste', function (e) {
    if (!B) return;
    var tgt = e.target;
    if (tgt.closest && tgt.closest('input,textarea,[contenteditable=true],[contenteditable=plaintext-only]')) return;
    var cd = e.clipboardData; if (!cd) return;
    var at = lastPointer || viewCenter(), text = cd.getData('text/plain') || '';
    if (/^klass-clip:/.test(text)) { e.preventDefault(); if (!pasteClip(at)) toast('This was copied on a site with the old version of the platform — update it there too, then copy again'); return; }
    if (/^klass-clip2:/.test(text)) { e.preventDefault(); pasteKlass(text, at); return; }
    var files = cd.files;
    if (files && files.length) { e.preventDefault(); addFiles(Array.prototype.slice.call(files), at); return; }
    var html = cd.getData('text/html') || '';
    if (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var imgs = Array.prototype.slice.call(doc.images).map(function (i) { return i.getAttribute('src'); }).filter(function (s) { return s && /^(https?:|data:image)/.test(s); });
      if (imgs.length) {
        e.preventDefault();
        imgs.slice(0, 20).forEach(function (s, i) {
          var p = { x: at.x + i * 60, y: at.y + i * 60 };
          if (/^data:image/.test(s)) fetch(s).then(function (r) { return r.blob(); }).then(function (bl) { addImageFile(new File([bl], 'paste.png', { type: bl.type }), p); });
          else addRemoteImage(s, p);
        });
        var txt = (doc.body.innerText || '').trim();
        if (txt) addNoteText(txt, { x: at.x - 260, y: at.y });
        return;
      }
    }
    if (/^\s*(https?:\/\/|www\.)\S+\s*$/.test(text) && !/miro\.com\/app\/board/.test(text)) { e.preventDefault(); addLinkCard(text.trim(), at); return; }
    if (text.trim()) {
      e.preventDefault();
      var parts = text.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 30);
      if (parts.length > 1) parts.forEach(function (p, i) { addNoteText(p, { x: at.x + (i % 5) * 230, y: at.y + Math.floor(i / 5) * 230 }); });
      else addNoteText(text.trim(), at);
      return;
    }
    if (!text && pasteClip(at)) e.preventDefault();
  });
  var dragDepth = 0;
  vp.addEventListener('dragenter', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) { dragDepth++; $('#dropHint').hidden = false; } });
  vp.addEventListener('dragleave', function () { if (--dragDepth <= 0) { dragDepth = 0; $('#dropHint').hidden = true; } });
  vp.addEventListener('dragover', function (e) { e.preventDefault(); });
  vp.addEventListener('drop', function (e) {
    e.preventDefault(); dragDepth = 0; $('#dropHint').hidden = true;
    var at = toWorld(e.clientX, e.clientY), files = Array.prototype.slice.call(e.dataTransfer.files || []);
    var onFlip = targetEl(e.clientX, e.clientY);
    if (files.length === 1 && /^image\//.test(files[0].type) && onFlip && onFlip.type === 'flip' && canStyle(onFlip)) {
      var side = onFlip.flipped ? 'back' : 'front', fid = onFlip.id;
      uploadImage(files[0]).then(function (url) { patchSel(function (x) { var o = {}; o[side] = Object.assign({}, x[side], { src: url }); return o; }, [fid]); toast('The picture is now on the card'); }).catch(function (err) { toast(err.message); });
      return;
    }
    if (files.length) addFiles(files, at);
    else { var u = e.dataTransfer.getData('text/uri-list'); if (u && /^https?:/.test(u)) addRemoteImage(u.split('\n')[0], at); }
  });
  function openLightbox(src) { $('#lbImg').src = src; $('#lightbox').hidden = false; }
  $('#lightbox').onclick = function () { $('#lightbox').hidden = true; };

  /* ---------- pointer ---------- */
  var lastCursor = 0, lastDragSend = 0, lastInkSend = 0;
  vp.addEventListener('pointermove', function (e) {
    if (!B) return;
    lastPointer = toWorld(e.clientX, e.clientY);
    var now = Date.now();
    if (now - lastCursor > 60 && e.pointerType === 'mouse') { lastCursor = now; socket.emit('b:cursor', lastPointer); }
  });
  function capture(e) { try { vp.setPointerCapture(e.pointerId); } catch (err) {} vp.classList.add('dragging-any'); }
  function startPan(e) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: V.x, vy: V.y }; vp.classList.add('panning'); capture(e); }
  function targetEl(cx, cy, exceptId) {
    var list = document.elementsFromPoint(cx, cy);
    for (var i = 0; i < list.length; i++) {
      var n = list[i].closest && list[i].closest('[data-id]'); if (!n || n.closest('#lsel')) continue;
      var e = find(n.dataset.id);
      if (e && e.id !== exceptId && e.type !== 'line' && e.type !== 'frame') return e;
    }
    return null;
  }

  vp.addEventListener('pointerdown', function (e) {
    if (!B) return;
    if (e.target.closest('.result,.pop,.ctx,.ctxpop,.reactbar,.knocks,.zoombox,.presbar,.roombar,.roommsg,.stargot,.echeck,.alignbtn,.tnview')) return;
    if (e.target.closest('#world a[href],#world summary') && !e.target.closest('[contenteditable=true]') && (tool === 'select' || tool === 'hand') && !e.shiftKey) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (Object.keys(ptrs).length === 2) { startPinch(); return; }
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'hand'))) { e.preventDefault(); startPan(e); return; }
    if (e.button > 0) return;
    if (editing && !editing.node.contains(e.target)) finishEdit();
    if (editing && editing.node.contains(e.target)) return;
    var w = toWorld(e.clientX, e.clientY);
    // Ctrl/Cmd + провести мышью: выделяется всё, чего коснулась линия (как «ластик», только выделяющий)
    if (e.pointerType === 'mouse' && tool === 'select' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.target.closest('.hd,button,[data-act],[contenteditable=true]')) {
      drag = { kind: 'sweep', ids: e.shiftKey ? sel.slice() : [], pts: [[e.clientX, e.clientY]] };
      if (!e.shiftKey) select([]);
      sweepHit(w); capture(e); edgePanStart(); return;
    }
    var elNode = e.target.closest('[data-id]');
    var id = elNode && elNode.dataset.id, el = id && find(id);

    var rx = e.target.closest('[data-react]');
    if (rx && el) { op({ t: 'react', id: id, emoji: rx.dataset.react }); return; }
    if (e.target.closest('[data-tnote]') && el && isT()) { select([id]); setTimeout(function () { var b = $('#ctx [data-c="tnote"]'); if (b) b.click(); }, 50); return; }

    if ((tool === 'pen' || tool === 'marker' || tool === 'eraser') && e.pointerType === 'touch' && (penSeen || pencilOnly())) { startPan(e); return; }
    if (tool === 'pen' || tool === 'marker') {
      drag = { kind: 'draw', stroke: { id: rid(), pts: [[r1(w.x), r1(w.y)]], color: inkColor, w: tool === 'marker' ? markW : penW, kind: tool }, sent: 0 };
      capture(e); renderInk(); return;
    }
    if (tool === 'eraser') { drag = { kind: 'erase', hit: {} }; capture(e); eraseAt(w); return; }
    if (tool === 'sticker' && !(el && el.type === 'sticker')) { var st = { id: rid(), type: 'sticker', x: r1(w.x), y: r1(w.y), emoji: stkEmoji, size: 56 }; op({ t: 'add', el: st }, function (ok) { if (ok) pushUndo(function () { op({ t: 'del', id: st.id }); }); }); return; }
    if ((tool === 'note' || tool === 'text' || tool === 'shape') && el && el.type === tool) setTool('select');   // клик по такому же элементу — выделить, а не создать новый
    else if ((tool === 'text' || tool === 'shape') && isT()) { e.preventDefault(); drag = { kind: 'shpdraw', tool: tool, w0: { x: w.x, y: w.y }, sx: e.clientX, sy: e.clientY, moved: false }; capture(e); return; }
    else if (tool === 'note') { e.preventDefault(); createAt(tool, w); setTool('select'); return; }
    if (tool === 'line' && isT()) {
      var from = targetEl(e.clientX, e.clientY);
      drag = { kind: 'newLine', from: from ? from.id : null, x: w.x, y: w.y, x2: w.x, y2: w.y };
      capture(e); return;
    }

    var gh = e.target.closest('.gaph');
    if (gh) {
      var lay = gapLayout(); if (!lay) return;
      var gi = Number(gh.dataset.gap), S = 0; for (var q = 0; q <= gi; q++) S += lay.list[q].b[lay.sz];
      drag = { kind: 'gap', lay: lay, i: gi, S: S, start: lay.list[0].b[lay.ax], h0: lay.gaps[gi], p0: lay.ax === 'x' ? w.x : w.y, orig: lay.list.map(function (x) { return { id: x.e.id, x: x.e.x, y: x.e.y }; }), moved: false };
      capture(e); return;
    }
    var hd = e.target.closest('[data-h]');
    if (hd && hd.dataset.h === 'rotg' && sel.length > 1) {
      var gels = sel.map(find).filter(Boolean), gbs = gels.map(function (x) { return boxOf(x); }), GU = union(gbs);
      drag = { kind: 'grotate', ids: sel.slice(), e0: gels.map(function (x) { return clone(x); }), cs: gbs.map(function (bx) { return [bx.x + bx.w / 2, bx.y + bx.h / 2]; }), C: [GU.x + GU.w / 2, GU.y + GU.h / 2], a0: Math.atan2(w.y - (GU.y + GU.h / 2), w.x - (GU.x + GU.w / 2)) * 180 / Math.PI, moved: false };
      capture(e); return;
    }
    if (hd && hd.dataset.h === 'irot' && sel.length === 1) {
      var ie = find(sel[0]), ib = localBox(ie);
      drag = { kind: 'irotate', id: ie.id, cx: ib.x + ib.w / 2, cy: ib.y + ib.h / 2, r0: ie.irot || 0, moved: false }; capture(e); return;
    }
    if (hd && hd.dataset.h[0] === 'g' && sel.length > 1) {
      var ids0 = sel.slice(), extra = [];
      ids0.forEach(function (id) { var x = find(id); if (x && x.type === 'frame') children(x).forEach(function (c) { if (ids0.indexOf(c.id) < 0 && extra.indexOf(c.id) < 0) extra.push(c.id); }); });
      var all = ids0.concat(extra), U0 = union(all.map(function (id) { var x = find(id); return x.type === 'line' ? lineBox(x) : boxOf(x); }));
      var sk = selS.slice(); B.strokes.forEach(function (st) { if (sk.indexOf(st.id) < 0 && canStroke(st) && all.some(function (id) { var f = find(id); return f.type === 'frame' && inRect(strokeCenter(st), f); })) sk.push(st.id); });
      drag = { kind: 'gresize', dir: hd.dataset.h.slice(1), ids: all, e0: all.map(function (id) { return clone(find(id)); }), s0: sk.map(function (id) { return clone(findStroke(id)); }).filter(Boolean), U: U0, sx: w.x, sy: w.y, moved: false };
      capture(e); return;
    }
    // фрейм за угол — масштабируем вместе со всем содержимым (как группу); за стороны — только размер фрейма
    if (hd && sel.length === 1 && find(sel[0]).type === 'frame' && hd.dataset.h.length === 2 && !e.altKey && cropId !== sel[0]) {
      var fr0 = find(sel[0]), all2 = [fr0.id].concat(children(fr0).map(function (c) { return c.id; }));
      var sk2 = B.strokes.filter(function (st) { return canStroke(st) && inRect(strokeCenter(st), fr0); }).map(function (st) { return clone(st); });
      drag = { kind: 'gresize', dir: hd.dataset.h, ids: all2, e0: all2.map(function (id) { return clone(find(id)); }), s0: sk2, U: boxOf(fr0), sx: w.x, sy: w.y, moved: false };
      capture(e); return;
    }
    if (hd && hd.dataset.h === 'rot' && sel.length === 1) {
      var re = find(sel[0]), rb = localBox(re);
      drag = { kind: 'rotate', id: re.id, cx: rb.x + rb.w / 2, cy: rb.y + rb.h / 2, r0: re.rot || 0, moved: false }; capture(e); return;
    }
    if (hd && sel.length === 1) {
      var se = find(sel[0]);
      if (se.type === 'line') { drag = { kind: 'lineEnd', end: hd.dataset.h, id: se.id, e0: clone(se) }; capture(e); return; }
      drag = { kind: cropId === se.id ? 'crop' : 'resize', dir: hd.dataset.h, id: se.id, sx: w.x, sy: w.y, e0: clone(se), moved: false }; capture(e); return;
    }

    if (e.target.closest('[data-fcoll]')) { setFrame(el, { collapsed: !el.collapsed || null }); return; }
    if (e.target.closest('[data-fcheck]')) { op({ t: 'check', frame: id }); return; }
    if (e.target.closest('[data-fnext]')) { op({ t: 'step-next', frame: id }); return; }
    var fwb = e.target.closest('[data-fwrite]');
    if (fwb && el && el.type === 'flip') { setTimeout(function () { openFlipWrite(fwb, el, fwb.dataset.fwrite); }, 0); return; }
    if (e.target.closest('[data-freveal]') && el && el.type === 'flip' && isT()) { var anyHid = (el.writes || []).some(function (w) { return !w.shown; }); op({ t: 'flip-reveal', id: id, shown: anyHid }); toast(anyHid ? 'Everything written on the back is now visible' : 'Hidden again'); return; }
    if (e.target.closest('[data-fvis]') && el && isT()) { op({ t: 'nominate', ids: [id], students: (el.owners || []).map(function (o) { return o.id; }), vis: el.private ? 'all' : 'owners' }); toast(el.private ? 'Now everyone sees this task (only assigned people can change it)' : 'Now only assigned people see this task'); return; }
    var fsq = e.target.closest('[data-fseq]');
    if (fsq && el && isT()) { setTimeout(function () { openSeq(fsq, el); }, 0); return; }
    var fsb = e.target.closest('[data-fstep]');
    if (fsb && el && isT()) {
      var v0 = fsb.dataset.fstep;
      if (v0 === 'all') { op({ t: 'step-open', frame: id, n: 999 }); toast('All tasks are open'); return; }
      if (v0 === 'none') { op({ t: 'step-open', frame: id, n: 0 }); toast('All tasks are hidden from students'); return; }
      var n0 = Number(v0), its = B.elements.filter(function (x) { return x.step === n0 && framesOf(x)[0] === el; });
      op({ t: 'step-open', frame: id, n: Math.max(n0, el.open == null || el.open >= 999 ? 0 : el.open) }, function () {
        var bb = union(its.map(boxOf)); if (bb) { var v = { x: bb.x - 60, y: bb.y - 60, w: bb.w + 120, h: bb.h + 120 }; fitTo(v, 3); setTimeout(function () { socket.emit('b:summon', { view: v }); }, 250); }
      });
      toast('Task ' + n0 + ' is open — everyone is there'); return;
    }
    if (e.target.closest('[data-fclaim]')) { op({ t: 'claim', id: id }); return; }
    if (el && el.type === 'frame' && !e.target.closest('[data-ftitle]') && !isT()) return;

    var act = e.target.closest('[data-act]');
    if (act && el && (act.tagName === 'BUTTON' || act.dataset.act === 'vote')) {
      var a = act.dataset.act;
      if (a === 'spin') { op({ t: 'spin', id: id }); return; }
      if (a === 'flip') { op({ t: 'flip', id: id }); return; }
      if (a === 'vote') { startVote(e, el, act); return; }
      if (a === 'deal' || a === 'shuffle') { op({ t: 'deck', id: id, act: a }); return; }
      if (a === 'box') { op({ t: 'box', id: id, i: Number(act.dataset.v) }); return; }
      if (a === 'coin') { op({ t: 'coin', id: id }); return; }
      if (a === 'ball') { seenBall._init = 1; op({ t: 'ball', id: id }); return; }
      if (a === 'tododel') { op({ t: 'todo-del', id: id, i: Number(act.dataset.v) }); return; }
      if (a === 'todo') { var ti = el.items[Number(act.dataset.v)]; if (ti) { ti.done = !ti.done; render(); } op({ t: 'todo-toggle', id: id, i: Number(act.dataset.v) }); return; }
      if (a === 'rate') { var cur = ME && el.votes[ME.id] ? el.votes[ME.id].v : 0, nv = Number(act.dataset.v); op({ t: 'vote', id: id, v: cur === nv ? null : nv }); return; }
      if (a === 'poll') { var cp = ME && el.votes[ME.id] ? el.votes[ME.id].v : -1, np = Number(act.dataset.v); op({ t: 'vote', id: id, v: cp === np ? null : np }); return; }
    }
    var slotNode = e.target.closest('.slot.filled');
    if (slotNode) {
      var card = find(slotNode.dataset.card);
      if (card && canMove(card)) { var o = { x: card.x, y: card.y, slot: card.slot }; card.slot = null; card.x = r1(w.x); card.y = r1(w.y); render(); startMove(e, [card.id], w, o); if (drag) drag.pulled = true; return; }
    }
    if (el && (el.type === 'html' || el.type === 'media' || el.type === 'video') && !e.target.closest('[data-hbar]')) return;
    if (el && (el.type === 'input' || el.type === 'cloud' || el.type === 'open') && e.target.closest('input,textarea,button,form,.odel')) return;
    if (el && el.type === 'todo' && e.target.closest('[data-tadd]')) return;
    if (el && (el.type === 'kanban' || el.type === 'kcard') && tool === 'select' && !e.shiftKey && kanbanDown(e, el)) return;
    if (el && isGame(el) && (tool === 'select' || tool === 'hand') && e.target.closest('[data-g],input,textarea,select,label,.ginput')) return;
    if (el && el.type === 'table') { var tcn = e.target.closest('[data-ed^="cells."]'); if (tcn) { var pp = tcn.dataset.ed.split('.'); TBLPOS = { id: el.id, r: Number(pp[1]), c: Number(pp[2]) }; } }
    // рисунки лежат поверх картинок, фигур и стикеров — клик по линии выделяет её
    var hitS = tool === 'select' && !(el && elNode.closest('#lc')) && !e.target.closest('button,[data-act],.hd') ? strokeAt(w) : null;
    if (el && !hitS) { press = { id: id, sx: e.clientX, sy: e.clientY, w: w, shift: e.shiftKey, title: !!e.target.closest('[data-ftitle]'), e: e }; capture(e); return; }
    if (tool === 'select') {
      if (hitS) {
        if (selS.indexOf(hitS.id) < 0) { if (e.shiftKey) selectStrokes([hitS.id], true); else { sel = []; renderLinks(); selectStrokes([hitS.id]); } }
        press = { stroke: true, sx: e.clientX, sy: e.clientY, w: w, e: e }; capture(e); return;
      }
    }
    if (!e.shiftKey) select([]);
    if (e.pointerType === 'mouse' && tool === 'select') { drag = { kind: 'marquee', sx: e.clientX, sy: e.clientY, shift: e.shiftKey, out: !frames().some(function (fr) { return w.x >= fr.x && w.x <= fr.x + fr.w && w.y >= fr.y && w.y <= fr.y + fr.h; }) }; capture(e); edgePanStart(); return; }
    startPan(e);
    if (e.pointerType !== 'mouse' && tool === 'select') lpArm(e);
  });
  /* долгое нажатие на пустом месте (палец / Pencil): вместо прокрутки — рамка выделения, чтобы выбрать и дублировать или двигать */
  var lpT = 0, lpX = 0, lpY = 0, lpId = 0;
  function lpArm(e) { lpCancel(); lpX = e.clientX; lpY = e.clientY; lpId = e.pointerId; lpT = setTimeout(lpFire, 450); }
  function lpCancel() { if (lpT) { clearTimeout(lpT); lpT = 0; } }
  function lpFire() {
    lpT = 0;
    if (!drag || drag.kind !== 'pan' || pinch || Object.keys(ptrs).length !== 1) return;
    var p = ptrs[lpId]; if (!p || Math.hypot(p.x - lpX, p.y - lpY) > 10) return;
    V.x = drag.vx; V.y = drag.vy; applyView(); vp.classList.remove('panning');
    drag = { kind: 'marquee', sx: p.x, sy: p.y, ex: p.x, ey: p.y, lx: p.x, ly: p.y, shift: false, out: true };
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (er) {}
    edgePanStart(); drawMarquee();
  }
  ['pointerup', 'pointercancel'].forEach(function (t) { window.addEventListener(t, lpCancel, true); });
  window.addEventListener('pointermove', function (e) { if (lpT && e.pointerId === lpId && Math.hypot(e.clientX - lpX, e.clientY - lpY) > 10) lpCancel(); }, true);

  function startMove(e, ids, w, origin) {
    var moving = [];
    ids.forEach(function (id) { var x = find(id); if (x && canMove(x)) moving.push(x); });
    if (!moving.length) return false;
    var nodes = [], kids = {};
    moving.forEach(function (x) {
      $$('[data-id="' + x.id + '"]', world).forEach(function (n) { nodes.push(n); });
      if (x.type === 'frame') children(x).forEach(function (c) { kids[c.id] = 1; });
    });
    Object.keys(kids).forEach(function (cid) { if (ids.indexOf(cid) < 0) $$('[data-id="' + cid + '"]', world).forEach(function (n) { nodes.push(n); }); });
    var single = moving.length === 1 && moving[0].type === 'card';
    if (single) { var cn = $('#lc [data-id="' + moving[0].id + '"]'); if (cn) { cn.classList.remove('remote', 'ok', 'bad'); cn.classList.add('dragging'); } }
    var sids = selS.filter(function (id) { var st = findStroke(id); return st && canStroke(st); }), vis = sids.slice();
    moving.forEach(function (x) {
      if (x.type === 'frame') { B.strokes.forEach(function (st) { if (inRect(st.pts[0], x) && vis.indexOf(st.id) < 0) vis.push(st.id); }); return; }
      if (!/^(image|shape|note|zone|text)$/.test(x.type)) return;
      var bx = elBox(x);
      B.strokes.forEach(function (st) { if (sids.indexOf(st.id) >= 0 || !canStroke(st)) return; if (st.pts.every(function (p) { return p[0] >= bx.x - 4 && p[0] <= bx.x + bx.w + 4 && p[1] >= bx.y - 4 && p[1] <= bx.y + bx.h + 4; })) { sids.push(st.id); vis.push(st.id); } });
    });
    drag = { sids: sids, snodes: vis.map(function (id) { return ink.querySelector('[data-sid="' + id + '"]'); }).filter(Boolean), kind: 'move', ids: moving.map(function (x) { return x.id; }), start: moving.map(function (x) { return { id: x.id, x: x.x, y: x.y, slot: x.slot }; }), origin: origin, sx: w.x, sy: w.y, nodes: nodes, dx: 0, dy: 0, card: single ? moving[0] : null, moved: false };
    $('#ctx').hidden = true; $('#lsel').innerHTML = '';
    if (!single) {
      var movingIds = {}; drag.ids.forEach(function (id) { movingIds[id] = 1; }); Object.keys(kids).forEach(function (id) { movingIds[id] = 1; });
      drag.box0 = union(moving.map(boxOf));
      var vr = vp.getBoundingClientRect(), va = toWorld(vr.left, vr.top), vb = toWorld(vr.right, vr.bottom);
      drag.targets = B.elements.filter(function (x) { return !movingIds[x.id] && x.type !== 'line' && !hiddenByCollapse(x); }).map(boxOf).filter(function (b) { return b.x < vb.x && b.x + b.w > va.x && b.y < vb.y && b.y + b.h > va.y; }).slice(0, 400);
    }
    capture(e); return true;
  }
  // умные направляющие: края и центры выравниваются по соседям (Alt — без прилипания)
  function snapMove(d) {
    if (!d.box0 || !d.targets || !d.targets.length) return;
    var b = d.box0, tol = 7 / V.z, bestX = null, bestY = null;
    var xs = [b.x + d.dx, b.x + b.w / 2 + d.dx, b.x + b.w + d.dx], ys = [b.y + d.dy, b.y + b.h / 2 + d.dy, b.y + b.h + d.dy];
    d.targets.forEach(function (t) {
      [t.x, t.x + t.w / 2, t.x + t.w].forEach(function (tx) { xs.forEach(function (x) { var df = tx - x; if (Math.abs(df) <= tol && (!bestX || Math.abs(df) < Math.abs(bestX.df))) bestX = { df: df, at: tx, t: t }; }); });
      [t.y, t.y + t.h / 2, t.y + t.h].forEach(function (ty) { ys.forEach(function (y) { var df = ty - y; if (Math.abs(df) <= tol && (!bestY || Math.abs(df) < Math.abs(bestY.df))) bestY = { df: df, at: ty, t: t }; }); });
    });
    var h = '';
    if (bestX) { d.dx += bestX.df; var y1 = Math.min(b.y + d.dy, bestX.t.y), y2 = Math.max(b.y + b.h + d.dy, bestX.t.y + bestX.t.h); h += '<div class="guide v" style="left:' + bestX.at + 'px;top:' + y1 + 'px;height:' + (y2 - y1) + 'px;width:' + (1 / V.z) + 'px"></div>'; }
    if (bestY) { d.dy += bestY.df; var x1 = Math.min(b.x + d.dx, bestY.t.x), x2 = Math.max(b.x + b.w + d.dx, bestY.t.x + bestY.t.w); h += '<div class="guide h" style="top:' + bestY.at + 'px;left:' + x1 + 'px;width:' + (x2 - x1) + 'px;height:' + (1 / V.z) + 'px"></div>'; }
    $('#lsel').innerHTML = h;
  }
  function startVote(e, el, track) { drag = { kind: 'vote', id: el.id, track: track, v: 50 }; capture(e); moveVote(e); }
  function moveVote(e) {
    var r = drag.track.getBoundingClientRect();
    drag.v = Math.max(0, Math.min(100, Math.round((e.clientX - r.left) / r.width * 100)));
    var dot = $('.sdot.me', drag.track);
    if (!dot) { dot = document.createElement('span'); dot.className = 'sdot me'; dot.style.setProperty('--c', colorOf(ME.id)); dot.textContent = (ME.name || '?').slice(0, 1); drag.track.appendChild(dot); }
    dot.style.left = drag.v + '%';
  }

  vp.addEventListener('pointerdown', function (e) { if (e.pointerType === 'pen') penSeen = true; }, true);
  vp.addEventListener('pointermove', function (e) {
    if (ptrs[e.pointerId]) ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch) { doPinch(); return; }
    var w = toWorld(e.clientX, e.clientY), now = Date.now();
    if (press && press.stroke && !drag) {
      if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) < 5) return;
      var ps = press; press = null; startStrokeMove(ps.e, ps.w); return;
    }
    if (press && !drag) {
      if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) < 5) return;
      var pe = find(press.id); var p = press; press = null;
      if (!pe) return;
      if (pe.type === 'frame' && !p.title && !p.shift && p.e && p.e.pointerType === 'mouse' && tool === 'select' && sel.indexOf(pe.id) < 0) {
        // тянем из пустого места фрейма — рамка выделения (фрейм двигается за заголовок или когда он уже выделен)
        select([]); drag = { kind: 'marquee', sx: p.sx, sy: p.sy, shift: false }; edgePanStart(); return;
      }
      if (pe.lock && isT()) { toast('Locked. Unlock it to move'); return; }
      if (pe.type === 'line' && (pe.from || pe.to)) { select([pe.id]); return; }
      var ids = sel.indexOf(pe.id) >= 0 && sel.length > 1 ? sel.slice() : expandGroups([pe.id]);
      if (p.e && p.e.altKey && pe.g && canSelect(pe)) { soloG = pe.g; ids = [pe.id]; select([pe.id]); }
      else if (sel.indexOf(pe.id) < 0 && canSelect(pe)) select(p.shift ? sel.concat(pe.id) : [pe.id]);
      if (!startMove(p.e, ids, p.w)) { if (!isT() && pe.type !== 'card') startPan(p.e); }
      return;
    }
    if (!drag) return;
    switch (drag.kind) {
      case 'gap':
        drag.moved = true;
        var L0 = drag.lay, pos = drag.h0 + ((L0.ax === 'x' ? w.x : w.y) - drag.p0);
        var g2 = Math.max(0, (pos - drag.start - drag.S) / (drag.i + 0.5)), cur = drag.start;
        L0.list.forEach(function (it, j) { var e2 = find(it.e.id), o2 = drag.orig[j]; if (!e2) return; var d2 = cur - it.b[L0.ax]; if (L0.ax === 'x') e2.x = r1(o2.x + d2); else e2.y = r1(o2.y + d2); cur += it.b[L0.sz] + g2; });
        drag.g = g2;
        if (!drag.raf) drag.raf = requestAnimationFrame(function () { if (drag) { drag.raf = 0; render(); } });
        return;
      case 'pan': V.x = drag.vx + e.clientX - drag.sx; V.y = drag.vy + e.clientY - drag.sy; applyView(); return;
      case 'sweep':
        var sp = drag.pts, sl = sp[sp.length - 1], steps = Math.max(1, Math.ceil(Math.hypot(e.clientX - sl[0], e.clientY - sl[1]) / 6));
        for (var si = 1; si <= steps; si++) sweepHit(toWorld(sl[0] + (e.clientX - sl[0]) * si / steps, sl[1] + (e.clientY - sl[1]) * si / steps));
        drag.lx = e.clientX; drag.ly = e.clientY; sp.push([e.clientX, e.clientY]); if (sp.length > 80) sp.shift(); sweepTrail(sp); return;
      case 'marquee':
        drag.ex = drag.lx = e.clientX; drag.ey = drag.ly = e.clientY; drawMarquee(); return;
      case 'draw':
        var pts = drag.stroke.pts, lp = pts[pts.length - 1], ce = (e.getCoalescedEvents && e.getCoalescedEvents()) || [], added = false;
        if (!ce.length) ce = [e];
        var fine = e.pointerType !== 'mouse';
        ce.forEach(function (q) {
          var wq = toWorld(q.clientX, q.clientY), l2 = pts[pts.length - 1];
          drag.raw = wq;
          // перо/палец: лёгкое сглаживание (каждая новая точка подтягивается к прошлой) и более частая выборка → линия плавная, без ступенек
          var nx = fine && pts.length > 1 ? l2[0] + (wq.x - l2[0]) * 0.55 : wq.x, ny = fine && pts.length > 1 ? l2[1] + (wq.y - l2[1]) * 0.55 : wq.y;
          if (Math.hypot(nx - l2[0], ny - l2[1]) * V.z < (fine ? 0.6 : 1.5)) return;
          pts.push([Math.round(nx * 100) / 100, Math.round(ny * 100) / 100]); added = true;
        });
        if (!added) return;
        renderInk();
        if (now - lastInkSend > 70) { lastInkSend = now; socket.emit('b:ink', { id: drag.stroke.id, p0: pts[0], pts: pts.slice(drag.sent), color: drag.stroke.color, w: drag.stroke.w, kind: drag.stroke.kind }); drag.sent = pts.length; }
        return;
      case 'erase': eraseAt(w); return;
      case 'vote': moveVote(e); return;
      case 'newLine':
        drag.x2 = w.x; drag.y2 = w.y;
        var tg = targetEl(e.clientX, e.clientY, drag.from);
        var tmp = { x: drag.x, y: drag.y, x2: w.x, y2: w.y, from: drag.from, to: tg ? tg.id : null, end: 'arrow', start: 'none', sw: 2, color: '#1E1E1C' };
        var pe2 = lineEnds(tmp);
        renderLinks('<path d="' + lineD(tmp, pe2) + '" fill="none" stroke="#3B6FE0" stroke-width="2" stroke-dasharray="6 4"/>');
        return;
      case 'lineEnd':
        var L0 = find(drag.id); if (!L0) return;
        if (drag.end === 'p1') { L0.from = null; L0.x = r1(w.x); L0.y = r1(w.y); } else { L0.to = null; L0.x2 = r1(w.x); L0.y2 = r1(w.y); }
        renderLinks(); renderSel(); return;
      case 'move':
        drag.dx = w.x - drag.sx; drag.dy = w.y - drag.sy; drag.moved = true;
        if (drag.card) {
          var c = drag.card, s0 = drag.start[0];
          c.x = r1(s0.x + drag.dx); c.y = r1(s0.y + drag.dy);
          var cn = $('#lc [data-id="' + c.id + '"]'); if (cn) { cn.style.left = c.x + 'px'; cn.style.top = c.y + 'px'; }
          highlight(e.clientX, e.clientY, { x: c.x, y: c.y });
          if (now - lastDragSend > 50) { lastDragSend = now; socket.emit('b:drag', { id: c.id, x: c.x, y: c.y }); }
        } else {
          if (!e.altKey) snapMove(drag);
          drag.nodes.forEach(function (n) { n.style.translate = drag.dx + 'px ' + drag.dy + 'px'; });
          (drag.snodes || []).forEach(function (n) { n.style.transform = 'translate(' + drag.dx + 'px,' + drag.dy + 'px)'; });
          // свободные концы двигаемых стрелок
          drag.start.forEach(function (s0) { var x = find(s0.id); if (x && x.type === 'line') { var ddx = r1(s0.x + drag.dx) - x.x, ddy = r1(s0.y + drag.dy) - x.y; x.x += ddx; x.y += ddy; x.x2 += ddx; x.y2 += ddy; } });
        }
        if (!drag.raf) drag.raf = requestAnimationFrame(function () { if (drag) { drag.raf = 0; renderLinks(); } });
        return;
      case 'smove':
        drag.dx = w.x - drag.sx; drag.dy = w.y - drag.sy; drag.moved = true;
        drag.nodes.forEach(function (n) { n.style.transform = 'translate(' + drag.dx + 'px,' + drag.dy + 'px)'; });
        return;
      case 'gresize':
        drag.moved = true; groupResize(drag, w.x - drag.sx, w.y - drag.sy);
        if (!drag.raf) drag.raf = requestAnimationFrame(function () { if (drag) { drag.raf = 0; render(); } });
        return;
      case 'shpdraw':
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        drag.moved = true;
        var ddx = w.x - drag.w0.x, ddy = w.y - drag.w0.y;
        if (e.shiftKey && drag.tool === 'shape') { var sz = Math.max(Math.abs(ddx), Math.abs(ddy)); ddx = ddx < 0 ? -sz : sz; ddy = ddy < 0 ? -sz : sz; }
        drag.box = { x: Math.min(drag.w0.x, drag.w0.x + ddx), y: Math.min(drag.w0.y, drag.w0.y + ddy), w: Math.abs(ddx), h: Math.abs(ddy) };
        var gh = $('#drawGhost'); if (!gh) { gh = document.createElement('div'); gh.id = 'drawGhost'; world.appendChild(gh); }
        gh.className = 'drawghost' + (drag.tool === 'shape' && /^(ellipse|circle)$/.test(shapeKind) ? ' round' : '') + (drag.tool === 'text' ? ' txt' : '');
        gh.style.left = drag.box.x + 'px'; gh.style.top = drag.box.y + 'px'; gh.style.width = drag.box.w + 'px'; gh.style.height = (drag.tool === 'text' ? Math.max(28, drag.box.h) : drag.box.h) + 'px';
        return;
      case 'grotate':
        drag.moved = true;
        var gd = Math.atan2(w.y - drag.C[1], w.x - drag.C[0]) * 180 / Math.PI - drag.a0;
        if (e.shiftKey) gd = Math.round(gd / 15) * 15;
        drag.d = gd;
        var gr = gd * Math.PI / 180, gc = Math.cos(gr), gs2 = Math.sin(gr);
        drag.ids.forEach(function (id, i) {
          var x = find(id), o = drag.e0[i], c0 = drag.cs[i]; if (!x) return;
          var vx = c0[0] - drag.C[0], vy = c0[1] - drag.C[1];
          var nx = drag.C[0] + vx * gc - vy * gs2, ny = drag.C[1] + vx * gs2 + vy * gc;
          x.x = r1(o.x + nx - c0[0]); x.y = r1(o.y + ny - c0[1]);
          x.rot = ((Math.round((o.rot || 0) + gd) % 360) + 540) % 360 - 180 || 0;
        });
        if (!drag.raf) drag.raf = requestAnimationFrame(function () { if (drag) { drag.raf = 0; render(); } });
        return;
      case 'irotate':
        drag.moved = true;
        var ia = Math.atan2(w.y - drag.cy, w.x - drag.cx) * 180 / Math.PI + 90 - ((find(drag.id) || {}).rot || 0);
        ia = e.shiftKey ? Math.round(ia / 15) * 15 : ia;
        [0, 90, 180, -90, -180].forEach(function (q) { if (Math.abs(ia - q) < 3) ia = q; });
        ia = ((Math.round(ia) + 540) % 360) - 180;
        var ie2 = find(drag.id); if (ie2) ie2.irot = ia || 0;
        if (!drag.raf) drag.raf = requestAnimationFrame(function () { if (drag) { drag.raf = 0; render(); } });
        return;
      case 'rotate':
        drag.moved = true;
        var ang = Math.atan2(w.y - drag.cy, w.x - drag.cx) * 180 / Math.PI + 90;
        ang = e.shiftKey ? Math.round(ang / 15) * 15 : ang;
        [0, 90, 180, 270, 360, -90, -180].forEach(function (q) { if (Math.abs(ang - q) < 3) ang = q; });
        ang = ((Math.round(ang) + 540) % 360) - 180;
        var ro = find(drag.id); if (ro) ro.rot = ang || 0;
        if (!drag.raf) drag.raf = requestAnimationFrame(function () { if (drag) { drag.raf = 0; render(); } });
        return;
      case 'resize': case 'crop':
        drag.moved = true;
        var rr = find(drag.id), RR = rr && rr.rot ? rr.rot * Math.PI / 180 : 0, ddx0 = w.x - drag.sx, ddy0 = w.y - drag.sy;
        if (RR) { var c0 = Math.cos(RR), s0 = Math.sin(RR); var lx = ddx0 * c0 + ddy0 * s0, ly = -ddx0 * s0 + ddy0 * c0; ddx0 = lx; ddy0 = ly; }
        applyResize(drag, ddx0, ddy0, e.shiftKey);
        if (RR && rr.w && rr.h && drag.e0.w && drag.e0.h) keepCorner(rr, drag.e0, drag.dir, RR);
        if (!drag.raf) drag.raf = requestAnimationFrame(function () { if (drag) { drag.raf = 0; render(); } });
        return;
    }
  });
  // у повёрнутого элемента противоположный угол остаётся на месте
  // вернуть картинкам настоящие пропорции: ширина и центр остаются, высота подстраивается
  function natSize(src) { return new Promise(function (ok) { var im = new Image(); im.onload = function () { ok([im.naturalWidth, im.naturalHeight]); }; im.onerror = function () { ok(null); }; im.src = src; }); }
  async function fixRatios(list) {
    var patches = {}, n = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], d = await natSize(e.src); if (!d || !d[0] || !d[1]) continue;
      var cr = e.crop || { w: 1, h: 1 }, nh = r1(e.w * (d[1] * cr.h) / (d[0] * cr.w));
      if (Math.abs(nh - e.h) < 1) continue;
      patches[e.id] = { h: nh, y: r1(e.y + (e.h - nh) / 2) }; n++;
    }
    if (!n) { toast('The proportions are already right'); return; }
    patchSel(function (x) { return patches[x.id] || null; }, Object.keys(patches));
    toast(n === 1 ? 'Proportions fixed' : 'Fixed ' + n + ' pictures');
  }
  function keepCorner(e, o, dir, R) {
    var fx = dir.indexOf('w') >= 0 ? 1 : dir.indexOf('e') >= 0 ? -1 : 0, fy = dir.indexOf('n') >= 0 ? 1 : dir.indexOf('s') >= 0 ? -1 : 0;
    var c = Math.cos(R), s = Math.sin(R);
    function anchorW(x, y, w, h) { var lx = fx * w / 2, ly = fy * h / 2; return [x + w / 2 + lx * c - ly * s, y + h / 2 + lx * s + ly * c]; }
    var a0 = anchorW(o.x, o.y, o.w, o.h), a1 = anchorW(e.x, e.y, e.w, e.h);
    e.x = r1(e.x + a0[0] - a1[0]); e.y = r1(e.y + a0[1] - a1[1]);
  }
  function applyResize(d, dx, dy, free) {
    var e = find(d.id), o = d.e0, dir = d.dir; if (!e) return;
    var hasW = dir.indexOf('w') >= 0, hasE = dir.indexOf('e') >= 0, hasN = dir.indexOf('n') >= 0, hasS = dir.indexOf('s') >= 0;
    if (d.kind === 'crop') {
      var cr = o.crop || { x: 0, y: 0, w: 1, h: 1 }, fw = o.w / cr.w, fh = o.h / cr.h, nc = clone(cr), x = o.x, y = o.y, ww = o.w, hh = o.h;
      if (hasW) { var ddx = Math.max(-cr.x * fw, Math.min(dx, o.w - 30)); x = o.x + ddx; ww = o.w - ddx; nc.x = cr.x + ddx / fw; }
      if (hasE) ww = Math.max(30, Math.min(o.w + dx, (1 - cr.x) * fw));
      if (hasN) { var ddy = Math.max(-cr.y * fh, Math.min(dy, o.h - 30)); y = o.y + ddy; hh = o.h - ddy; nc.y = cr.y + ddy / fh; }
      if (hasS) hh = Math.max(30, Math.min(o.h + dy, (1 - cr.y) * fh));
      nc.w = ww / fw; nc.h = hh / fh;
      e.x = r1(x); e.y = r1(y); e.w = r1(ww); e.h = r1(hh); e.crop = { x: +nc.x.toFixed(4), y: +nc.y.toFixed(4), w: +nc.w.toFixed(4), h: +nc.h.toFixed(4) };
      return;
    }
    if (/^(image|frame|zone|note|flip|shape|html|deck|cloud|open|video|chart)$/.test(e.type) || (e.type === 'media' && e.kind === 'video')) {
      var nx = o.x, ny = o.y, nw = o.w, nh = o.h;
      if (hasE) nw = o.w + dx; if (hasW) { nw = o.w - dx; nx = o.x + dx; }
      if (hasS) nh = o.h + dy; if (hasN) { nh = o.h - dy; ny = o.y + dy; }
      var keep = (e.type === 'image' && dir.length === 2) || (/^(note|flip|html|media)$/.test(e.type) && dir.length === 2 && !free);
      if (keep) { var r = o.w / o.h; if (Math.abs(nw - o.w) / o.w > Math.abs(nh - o.h) / o.h) nh = nw / r; else nw = nh * r; if (hasW) nx = o.x + o.w - nw; if (hasN) ny = o.y + o.h - nh; }
      var minW = e.type === 'html' ? 160 : e.type === 'flip' ? 40 : 20, minH = e.type === 'html' ? 100 : e.type === 'flip' ? 30 : 16;
      e.w = r1(Math.max(minW, nw)); e.h = r1(Math.max(minH, nh));
      if (hasW) nx = o.x + o.w - e.w; if (hasN) ny = o.y + o.h - e.h;
      e.x = r1(nx); e.y = r1(ny);
      if (e.type === 'shape' && dir.length === 2 && o.size && !free) e.size = r1(Math.max(6, o.size * Math.sqrt((e.w * e.h) / (o.w * o.h))));
      if (e.type === 'note' && dir.length === 2 && o.size && !free) e.size = r1(Math.max(4, o.size * e.w / o.w));
      if (e.type === 'html' && dir.length === 2 && !free) e.zoom = Math.round(Math.max(0.15, Math.min(3, (o.zoom || 1) * e.w / o.w)) * 100) / 100;
      return;
    }
    if (/^(text|sentence|todo|input)$/.test(e.type)) {
      var w2 = Math.max(40, hasE ? o.w + dx : o.w - dx);
      if (dir.length === 2) e.size = r1(Math.max(6, o.size * w2 / o.w));
      e.w = r1(w2); if (hasW) e.x = r1(o.x + o.w - w2);
      return;
    }
    if (e.type === 'table') {
      var kx = Math.max(0.2, (o.w + (hasE ? dx : 0)) / o.w), ky = Math.max(0.2, (o.h + (hasS ? dy : 0)) / o.h);
      e.cols = o.cols.map(function (v) { return r1(Math.max(40, v * kx)); }); e.rows = o.rows.map(function (v) { return r1(Math.max(24, v * ky)); });
      e.w = e.cols.reduce(function (a, v) { return a + v; }, 0); e.h = e.rows.reduce(function (a, v) { return a + v; }, 0);
      if (dir === 'se' && !free) e.size = r1(Math.max(6, (o.size || 18) * Math.sqrt(kx * ky)));
      return;
    }
    if (/^(scale|rating|poll|media|boxes|link|kanban|kcard)$/.test(e.type) || isGame(e)) { var w3 = Math.max(120, hasE ? o.w + dx : o.w - dx); e.w = r1(w3); if (hasW) e.x = r1(o.x + o.w - w3); return; }
    if (e.type === 'ball' || e.type === 'coin') { var sb = Math.max(80, o.size + (hasE ? dx : -dx)); e.size = r1(sb); if (hasW) e.x = r1(o.x + o.size - sb); if (hasN) e.y = r1(o.y + o.size - sb); return; }
    if (e.type === 'wheel') { var s = Math.max(60, o.size + (hasE ? dx : -dx)); e.size = r1(s); if (hasW) e.x = r1(o.x + o.size - s); if (hasN) e.y = r1(o.y + o.size - s); return; }
    if (e.type === 'dice' || e.type === 'sticker') { var k = (o.size + (hasE ? dx : -dx) * (e.type === 'dice' ? 2 / (e.count + 1) : 1)) / o.size; e.size = r1(Math.max(e.type === 'dice' ? 16 : 12, Math.min(400, o.size * k))); }
  }
  // общий масштаб нескольких элементов от противоположного угла
  function groupResize(d, dx, dy) {
    var U = d.U, dir = d.dir, hasW = dir.indexOf('w') >= 0, hasN = dir.indexOf('n') >= 0;
    var kx = (U.w + (hasW ? -dx : dx)) / U.w, ky = (U.h + (hasN ? -dy : dy)) / U.h;
    var k = Math.max(0.08, Math.min(12, Math.abs(kx - 1) > Math.abs(ky - 1) ? kx : ky));
    var ox = hasW ? U.x + U.w : U.x, oy = hasN ? U.y + U.h : U.y;
    var X = function (v) { return r1(ox + (v - ox) * k); }, Y = function (v) { return r1(oy + (v - oy) * k); };
    d.k = k; d.ox = ox; d.oy = oy;
    (d.s0 || []).forEach(function (o) {
      var st = findStroke(o.id); if (!st) return;
      st.pts = o.pts.map(function (p) { return [X(p[0]), Y(p[1])]; }); st.w = Math.max(0.5, Math.round(o.w * k * 10) / 10);
    });
    if (d.s0 && d.s0.length) renderInk();
    d.e0.forEach(function (o) {
      var e = find(o.id); if (!e) return;
      if (e.type === 'card' && o.slot) { e.size = r1(Math.max(6, (o.size || 18) * k)); return; }
      e.x = X(o.x); e.y = Y(o.y);
      if (e.type === 'line') { e.x2 = X(o.x2); e.y2 = Y(o.y2); if (o.sw) e.sw = Math.max(1, Math.round(o.sw * Math.sqrt(k))); return; }
      if (e.type === 'card') { e.hx = X(o.hx); e.hy = Y(o.hy); }
      if (o.w != null) e.w = r1(o.w * k);
      if (o.h != null) e.h = r1(o.h * k);
      if (o.size) e.size = r1(o.size * k);
      if (e.type === 'html') e.zoom = Math.round(Math.max(0.15, Math.min(3, (o.zoom || 1) * k)) * 100) / 100;
      if (e.type === 'table') { e.cols = o.cols.map(function (v) { return r1(v * k); }); e.rows = o.rows.map(function (v) { return r1(v * k); }); }
    });
  }
  function hitSlot(cx, cy) { var list = document.elementsFromPoint(cx, cy); for (var i = 0; i < list.length; i++) { var s = list[i].closest && list[i].closest('.slot'); if (s) return s; } return null; }
  function zoneAt(x, y) { var f = null; B.elements.forEach(function (z) { if (z.type === 'zone' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) f = z; }); return f; }
  function highlight(cx, cy, w) {
    var s = hitSlot(cx, cy);
    $$('.slot.hot,.zone.hot').forEach(function (x) { x.classList.remove('hot'); });
    if (s) { s.classList.add('hot'); return; }
    var z = zoneAt(w.x, w.y); if (z) { var zn = $('#lz [data-id="' + z.id + '"]'); if (zn) zn.classList.add('hot'); }
  }
  function eraseAt(w) {
    var rad = 10 / V.z, gone = [];
    B.strokes.forEach(function (s) {
      if (!isT() && s.by !== ME.id) return; if (drag.hit[s.id]) return;
      var r = rad + s.w / 2;
      for (var i = 0; i < s.pts.length; i++) { var a = s.pts[i], b = s.pts[i + 1] || a; if (segDist(w.x, w.y, a[0], a[1], b[0], b[1]) <= r) { gone.push(s.id); drag.hit[s.id] = clone(s); break; } }
    });
    if (gone.length) { B.strokes = B.strokes.filter(function (s) { return gone.indexOf(s.id) < 0; }); renderInk(); op({ t: 'erase', ids: gone }); }
  }
  function segDist(px, py, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; var t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); }

  function drawMarquee() {
    var d = drag, vr = vp.getBoundingClientRect(), m = $('#marquee');
    m.style.left = (Math.min(d.ex, d.sx) - vr.left) + 'px'; m.style.top = (Math.min(d.ey, d.sy) - vr.top) + 'px';
    m.style.width = Math.abs(d.ex - d.sx) + 'px'; m.style.height = Math.abs(d.ey - d.sy) + 'px'; m.hidden = false;
  }
  // у края экрана доска сама едет: можно тянуть рамку или линию выделения дальше видимой части
  function edgePanStart() {
    function tick() {
      var d = drag; if (!d || (d.kind !== 'marquee' && d.kind !== 'sweep')) return;
      if (d.lx != null) {
        var vr = vp.getBoundingClientRect(), M = 60, dx = 0, dy = 0;
        if (d.lx < vr.left + M) dx = (vr.left + M - d.lx) / M; else if (d.lx > vr.right - M) dx = -(d.lx - (vr.right - M)) / M;
        if (d.ly < vr.top + M) dy = (vr.top + M - d.ly) / M; else if (d.ly > vr.bottom - M) dy = -(d.ly - (vr.bottom - M)) / M;
        dx = Math.max(-1, Math.min(1, dx)) * 22; dy = Math.max(-1, Math.min(1, dy)) * 22;
        if (dx || dy) {
          V.x += dx; V.y += dy; applyView();
          if (d.kind === 'marquee') { d.sx += dx; d.sy += dy; d.ex = d.lx; d.ey = d.ly; drawMarquee(); }
          else sweepHit(toWorld(d.lx, d.ly));
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function sweepHit(w) {
    var pad = 3 / V.z, d = drag, add = [];
    B.elements.forEach(function (x) {
      if (x.type === 'frame' || x.type === 'line' || d.ids.indexOf(x.id) >= 0 || hiddenByCollapse(x) || !canSelect(x)) return;
      var b = boxOf(x); if (w.x >= b.x - pad && w.x <= b.x + b.w + pad && w.y >= b.y - pad && w.y <= b.y + b.h + pad) add.push(x.id);
    });
    if (!add.length) return;
    add = expandGroups(add).filter(function (id) { return d.ids.indexOf(id) < 0; });
    d.ids = d.ids.concat(add); select(d.ids.slice());
  }
  function sweepTrail(pts) {
    var sv = $('#sweepTrail');
    if (!sv) { sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.id = 'sweepTrail'; sv.setAttribute('class', 'sweeptrail'); sv.innerHTML = '<polyline fill="none"/>'; vp.appendChild(sv); }
    if (!pts) { sv.remove(); return; }
    var vr = vp.getBoundingClientRect();
    sv.firstChild.setAttribute('points', pts.map(function (p) { return (p[0] - vr.left) + ',' + (p[1] - vr.top); }).join(' '));
  }
  function endPointer(e) {
    delete ptrs[e.pointerId];
    vp.classList.remove('dragging-any');
    if (pinch) { if (Object.keys(ptrs).length < 2) pinch = null; return; }
    if (press && press.stroke && !drag) { press = null; renderSel(); return; }
    if (press && !drag) { var p = press; press = null; tap(p, e); return; }
    if (!drag) return;
    var d = drag; drag = null; vp.classList.remove('panning');
    switch (d.kind) {
      case 'gap':
        if (!d.moved) { render(); return; }
        var mvs = d.orig.map(function (o) { var e3 = find(o.id); if (!e3) return null; var m = { id: o.id, x: e3.x, y: e3.y, ox: o.x, oy: o.y }; e3.x = o.x; e3.y = o.y; return m; }).filter(Boolean);
        sendMoves(mvs); toast('Spacing ' + Math.round(d.g || 0) + ' px'); return;
      case 'draw':
        if (d.raw && d.stroke.pts.length > 1) { var lq = d.stroke.pts[d.stroke.pts.length - 1]; if (Math.hypot(d.raw.x - lq[0], d.raw.y - lq[1]) > 0.3) d.stroke.pts.push([Math.round(d.raw.x * 100) / 100, Math.round(d.raw.y * 100) / 100]); }
        if (d.stroke.pts.length) { d.stroke.by = ME.id; B.strokes.push(d.stroke); var sid = d.stroke.id; op({ t: 'stroke', stroke: d.stroke }, function (ok) { if (ok) pushUndo(function () { op({ t: 'erase', ids: [sid] }); }); }); }
        renderInk(); return;
      case 'erase': var gone = Object.keys(d.hit).map(function (k) { return d.hit[k]; }); if (gone.length) pushUndo(function () { gone.forEach(function (s) { op({ t: 'stroke', stroke: s }); }); }); return;
      case 'vote': op({ t: 'vote', id: d.id, v: d.v }); render(); return;
      case 'newLine':
        var to = targetEl(e.clientX, e.clientY, d.from);
        var len = Math.hypot(d.x2 - d.x, d.y2 - d.y);
        var ln = { id: rid(), type: 'line', x: r1(d.x), y: r1(d.y), x2: r1(len < 8 && !to ? d.x + 160 : d.x2), y2: r1(len < 8 && !to ? d.y : d.y2), from: d.from, to: to ? to.id : null, end: 'arrow', start: 'none', sw: 2, color: '#1E1E1C' };
        B.elements.push(ln); render();
        op({ t: 'el-set', el: ln }, function (ok) { if (ok) { pushUndo(function () { op({ t: 'del', id: ln.id }); }); select([ln.id]); } });
        setTool('select'); return;
      case 'lineEnd':
        var L0 = find(d.id); if (!L0) return;
        var hit = targetEl(e.clientX, e.clientY);
        var item = { id: d.id };
        if (d.end === 'p1') { if (hit && hit.id !== L0.to) { L0.from = hit.id; } item.from = L0.from || null; item.x = L0.x; item.y = L0.y; }
        else { if (hit && hit.id !== L0.from) { L0.to = hit.id; } item.to = L0.to || null; item.x2 = L0.x2; item.y2 = L0.y2; }
        var back = { id: d.id, from: d.e0.from || null, to: d.e0.to || null, x: d.e0.x, y: d.e0.y, x2: d.e0.x2, y2: d.e0.y2 };
        op({ t: 'patch', items: [item] }, function (ok) { if (ok) pushUndo(function () { op({ t: 'patch', items: [back] }); }); });
        render(); return;
      case 'sweep':
        sweepTrail(null); render(); return;
      case 'marquee':
        $('#marquee').hidden = true;
        if (d.ex == null) { render(); return; }
        var a = toWorld(Math.min(d.sx, d.ex), Math.min(d.sy, d.ey)), b = toWorld(Math.max(d.sx, d.ex), Math.max(d.sy, d.ey));
        var hits = B.elements.filter(function (x) {
          if (hiddenByCollapse(x)) return false;
          var bx = boxOf(x);
          if (x.type === 'frame' && !d.out) return bx.x >= a.x && bx.y >= a.y && bx.x + bx.w <= b.x && bx.y + bx.h <= b.y;
          return bx.x < b.x && bx.x + bx.w > a.x && bx.y < b.y && bx.y + bx.h > a.y;
        }).map(function (x) { return x.id; });
        var hf = hits.filter(function (id) { return find(id).type === 'frame'; });
        hits = hits.filter(function (id) { var x = find(id); return !framesOf(x).some(function (f) { return hf.indexOf(f.id) >= 0; }); });
        var keepS = d.shift ? selS.slice() : [];
        if (!isT()) hits = hits.filter(function (id) { var x = find(id); return canSelect(x); });
        select(d.shift ? sel.concat(hits.filter(function (id) { return sel.indexOf(id) < 0; })) : hits);
        selS = keepS.concat(B.strokes.filter(function (st) { if (!canStroke(st) || keepS.indexOf(st.id) >= 0) return false; var bx = strokeBox(st); return bx.x < b.x && bx.x + bx.w > a.x && bx.y < b.y && bx.y + bx.h > a.y; }).map(function (st) { return st.id; }));
        render(); return;
      case 'move':
        d.nodes.forEach(function (n) { n.style.translate = ''; });
        $$('.slot.hot,.zone.hot').forEach(function (x) { x.classList.remove('hot'); });
        if (d.card) {
          var c = d.card, origin = d.origin || d.start[0];
          if (!d.moved && !d.pulled) { render(); return; }
          var s = e.type === 'pointerup' ? hitSlot(e.clientX, e.clientY) : null, slot = s ? s.dataset.slot : null;
          if (slot) { var occ = B.elements.find(function (x) { return x.type === 'card' && x.slot === slot && x.id !== c.id; }); if (occ) { occ.slot = null; occ.x = occ.hx; occ.y = occ.hy; } c.slot = slot; }
          if (B.check && B.check.res) { delete B.check.res[c.id]; if (slot) delete B.check.res[slot]; }
          op({ t: 'move', id: c.id, x: c.x, y: c.y, slot: slot }, function (ok) { if (ok) pushUndo(function () { op({ t: 'move', id: c.id, x: origin.x, y: origin.y, slot: origin.slot }); }); });
          render(); return;
        }
        if (!d.moved) { render(); return; }
        if (d.start.length === 1) {
          var mvEl = find(d.start[0].id), tgt = mvEl && mvEl.type === 'image' ? targetEl(e.clientX, e.clientY, mvEl.id) : null;
          if (tgt && tgt.type === 'flip' && canStyle(tgt)) {
            var side = tgt.flipped ? 'back' : 'front', img = mvEl;
            patchSel(function (x) { var o = {}; o[side] = Object.assign({}, x[side], { src: img.src }); return o; }, [tgt.id]);
            var saved0 = clone(img); op({ t: 'del', id: img.id }); B.elements = B.elements.filter(function (x) { return x !== img; }); render();
            pushUndo(function () { op({ t: 'restore', els: [saved0] }); });
            toast('The picture is now on the card'); return;
          }
        }
        (d.snodes || []).forEach(function (n) { n.style.transform = ''; });
        if (d.sids && d.sids.length) finishStrokeMove(d.sids, d.dx, d.dy);
        d.start.forEach(function (s0) { var x = find(s0.id); if (x && x.type === 'line') { var ddx = s0.x - x.x, ddy = s0.y - x.y; x.x += ddx; x.y += ddy; x.x2 += ddx; x.y2 += ddy; } });
        sendMoves(d.start.map(function (s0) { return { id: s0.id, x: r1(s0.x + d.dx), y: r1(s0.y + d.dy), ox: s0.x, oy: s0.y }; }));
        return;
      case 'smove':
        d.nodes.forEach(function (n) { n.style.transform = ''; });
        if (d.moved) finishStrokeMove(d.sids, d.dx, d.dy);
        renderSel(); return;
      case 'gresize':
        if (!d.moved) { render(); return; }
        var its = [], bks = [], KS = ['x', 'y', 'w', 'h', 'size', 'x2', 'y2', 'hx', 'hy', 'zoom', 'sw', 'cols', 'rows'];
        d.e0.forEach(function (o) {
          var x = find(o.id); if (!x) return; var it = { id: o.id }, bk = { id: o.id }, ch = false;
          KS.forEach(function (k) { if (k in x && x[k] !== o[k]) { it[k] = x[k]; bk[k] = k in o ? o[k] : null; ch = true; } });
          if (ch) { its.push(it); bks.push(bk); }
        });
        var sids = (d.s0 || []).map(function (o) { return o.id; }), K = d.k, OX = d.ox, OY = d.oy;
        if (sids.length) op({ t: 'stroke-scale', ids: sids, ox: OX, oy: OY, k: K });
        if (its.length || sids.length) {
          var doPatch = function (cb) { if (its.length) op({ t: 'patch', items: its }, cb); else cb(true); };
          doPatch(function (ok) { if (ok) pushUndo(function () { if (bks.length) op({ t: 'patch', items: bks }); if (sids.length) op({ t: 'stroke-scale', ids: sids, ox: OX, oy: OY, k: 1 / K }); }); });
        }
        render(); return;
      case 'shpdraw':
        var gh0 = $('#drawGhost'); if (gh0) gh0.remove();
        createAt(d.tool, d.w0, d.moved && d.box && d.box.w > 8 ? d.box : null); setTool('select'); return;
      case 'grotate':
        if (!d.moved) { render(); return; }
        var gits = [], gbks = [];
        d.e0.forEach(function (o) { var x = find(o.id); if (!x) return; gits.push({ id: o.id, x: x.x, y: x.y, rot: x.rot || null }); gbks.push({ id: o.id, x: o.x, y: o.y, rot: o.rot || null }); });
        op({ t: 'patch', items: gits }, function (ok) { if (ok) pushUndo(function () { op({ t: 'patch', items: gbks }); }); });
        render(); return;
      case 'irotate':
        var ire = find(d.id); if (!ire || !d.moved) { render(); return; }
        var inr = ire.irot || 0, ior = d.r0;
        op({ t: 'patch', items: [{ id: ire.id, irot: inr || null }] }, function (ok) { if (ok) pushUndo(function () { op({ t: 'patch', items: [{ id: ire.id, irot: ior || null }] }); }); });
        render(); return;
      case 'rotate':
        var rel = find(d.id); if (!rel || !d.moved) { render(); return; }
        var nr = rel.rot || 0, or0 = d.r0;
        op({ t: 'patch', items: [{ id: rel.id, rot: nr || null }] }, function (ok) { if (ok) pushUndo(function () { op({ t: 'patch', items: [{ id: rel.id, rot: or0 || null }] }); }); });
        render(); return;
      case 'resize': case 'crop':
        var el = find(d.id); if (!el || !d.moved) { render(); return; }
        var keys = ['x', 'y', 'w', 'h', 'size', 'crop', 'zoom', 'cols', 'rows'], it = { id: d.id }, bk = { id: d.id };
        keys.forEach(function (k) { if (k in el && JSON.stringify(el[k]) !== JSON.stringify(d.e0[k])) { it[k] = el[k]; bk[k] = k in d.e0 ? d.e0[k] : null; } });
        op({ t: 'patch', items: [it] }, function (ok) { if (ok) pushUndo(function () { op({ t: 'patch', items: [bk] }); }); });
        render(); return;
    }
    render();
  }
  vp.addEventListener('pointerup', endPointer);
  vp.addEventListener('pointercancel', endPointer);

  function tap(p) {
    var e = find(p.id); if (!e) return;
    var now = Date.now(), dbl = lastTap.id === e.id && now - lastTap.t < 380;
    lastTap = { id: e.id, t: dbl ? 0 : now };   // после двойного клика счёт начинается заново (тройной клик не отменяет)
    if (p.shift && canSelect(e)) { select([e.id], true); return; }
    if (e.g && dbl && e.g !== soloG && canSelect(e) && !(canEditText(e) && /^(note|text|shape)$/.test(e.type))) { enterGroup(e.id, true); return; }
    if (e.g && !dbl && sel.indexOf(e.id) < 0) { select([e.id]); return; }       // первый клик по группе выделяет всю группу
    // название фрейма: клик — выделить весь фрейм (двигать, удалить), двойной клик — переименовать
    if (e.type === 'frame') { if (isT() && p.title) { if (dbl) { select([e.id]); startEdit(e.id); } else select([e.id]); } return; }
    if (e.type === 'line') { select([e.id]); return; }
    // один клик — выделить (можно сразу нажать Delete, тянуть, менять размер); двойной — печатать текст
    if (canEditText(e) && /^(note|text|shape)$/.test(e.type) && (!e.g || dbl)) {
      if (dbl) { selectOnly(e.id); startEdit(e.id); return; }
      select([e.id]); return;
    }
    if ((e.type === 'zone' || e.type === 'card') && isT() && dbl) { selectOnly(e.id); startEdit(e.id); return; }
    // двойной клик по пункту чек-листа — правим текст (B / I / U / маркер прямо здесь)
    var tiN = p.e && p.e.target && p.e.target.closest && p.e.target.closest('[data-ti]');
    if (tiN && e.type === 'todo' && todoEditable(e) && dbl) { selectOnly(e.id); editTodoItem(e, Number(tiN.dataset.ti)); return; }
    // ученик: двойной клик по слову в чужом тексте — выделяем слово, появляется «+ Language box»
    if (dbl && !isT() && ME && !ME.guest && p.e && p.e.target && p.e.target.closest && p.e.target.closest('.ntext,.btext,.stext,.fed,.tc,.card') && !p.e.target.closest('[contenteditable=true]')) pickWordAt(p.e.clientX, p.e.clientY);
    // двойной клик по подписи внутри виджета (заголовок, сторона флип-карточки, пункты) — правим прямо на доске
    var edN = p.e && p.e.target && p.e.target.closest && p.e.target.closest('[data-ed]');
    if (edN && dbl && !e.lock && (isT() || (canStyle(e) && e.type !== 'flip'))) { selectOnly(e.id); startEdit(e.id, false, edN); return; }
    // двойной клик по виджету — сразу его настройки (без «⋯ → More settings»)
    if (dbl && isT() && isGame(e)) { select([e.id]); window.GAMES_API.setup(e); return; }
    if (dbl && e.type === 'image' && canStyle(e) && !e.lock) { selectOnly(e.id); cropId = cropId === e.id ? null : e.id; renderSel(); if (cropId) toast('Crop: drag the handles. Double-click or Esc — done'); return; }
    if (dbl && isT() && !edN && !tiN && /^(sentence|wheel|flip|scale|dice|rating|poll|media|todo|video|deck|boxes|ball|cloud|open|chart|input|coin)$/.test(e.type)) { select([e.id]); openPanel('props'); return; }
    if (e.type === 'dice') { op({ t: 'roll', id: e.id }); if (isT()) select([e.id]); return; }
    if (e.type === 'flip' && !isT()) { op({ t: 'flip', id: e.id }); return; }
    if (e.type === 'image') {
      if (e.cover && !isT() && !e.lock) { op({ t: 'cover', id: e.id, value: false }); return; }
      if (dbl && !e.cover) { openLightbox(e.src); return; }
    }
    if (canSelect(e)) select([e.id]); else select([]);
  }
  function selectOnly(id) { var x = find(id); if (soloG && (!x || x.g !== soloG)) soloG = null; sel = [id]; renderLinks(); renderSel(); }
  function enterGroup(id, keepSel) {
    var x = find(id); if (!x || !x.g) return;
    soloG = x.g; sel = keepSel ? [id] : []; renderLinks(); renderSel();
    toast(keepSel ? 'Moving one part of the group. Click an empty place to finish' : 'Click a part to move or turn it separately. Click an empty place to finish');
  }

  function startPinch() {
    press = null;
    if (drag && drag.kind === 'draw') { drag = null; renderInk(); }
    else if (drag && drag.kind === 'move') { drag.nodes.forEach(function (n) { n.style.translate = ''; }); drag = null; render(); }
    else drag = null;
    var p = Object.values(ptrs);
    if (B && B.present && !isT() && B.present.follow && !followOff) { followOff = true; renderModes(); }
    pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, z: V.z, vx: V.x, vy: V.y };
  }
  function doPinch() {
    var p = Object.values(ptrs); if (p.length < 2) return;
    var r = vp.getBoundingClientRect();
    var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
    var nz = Math.max(0.05, Math.min(5, pinch.z * d / pinch.d));
    var ox = pinch.cx - r.left, oy = pinch.cy - r.top;
    V.z = nz; V.x = cx - r.left - (ox - pinch.vx) * nz / pinch.z; V.y = cy - r.top - (oy - pinch.vy) * nz / pinch.z;
    applyView();
  }

  /* ---------- inline editing (rich text for text, stickies and shapes) ---------- */
  function editTodoItem(e, i) {
    var node = world.querySelector('.todo[data-id="' + e.id + '"] [data-ti="' + i + '"]'); if (!node) return;
    var it = e.items[i]; if (!it) return;
    node.contentEditable = 'true'; node.focus();
    var r = document.createRange(); r.selectNodeContents(node); r.collapse(false); var sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
    var bar = document.createElement('div'); bar.className = 'tfmt';
    bar.innerHTML = '<button data-f="bold" type="button"><b>B</b></button><button data-f="italic" type="button"><i>I</i></button><button data-f="underline" type="button"><u>U</u></button><button data-f="strikeThrough" type="button"><s>S</s></button><button data-f="hl" type="button"><span style="background:#FFE38A;padding:0 3px">ab</span></button><button data-f="red" type="button"><span style="color:#C2412D">A</span></button>';
    vp.appendChild(bar);
    var nr = node.getBoundingClientRect(), vr = vp.getBoundingClientRect();
    bar.style.left = Math.max(6, nr.left - vr.left) + 'px'; bar.style.top = Math.max(6, nr.top - vr.top - 40) + 'px';
    bar.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    bar.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-f]'); if (!b) return; var f = b.dataset.f;
      document.execCommand('styleWithCSS', false, true);
      if (f === 'hl') document.execCommand('hiliteColor', false, '#FFE38A'); else if (f === 'red') document.execCommand('foreColor', false, '#C2412D'); else document.execCommand(f);
    });
    var done = false;
    editing = { id: e.id, node: node, todo: true, elNode: node.closest('.todo'), finish: function (sv) { finish(sv); } };
    function finish(save) {
      if (done) return; done = true; bar.remove(); editing = null; node.contentEditable = 'false';
      var text = node.innerText.replace(/\s+/g, ' ').trim();
      if (save && text && (text !== it.t || node.innerHTML !== (it.h || esc(it.t)))) op({ t: 'todo-edit', id: e.id, i: i, text: text, html: node.innerHTML });
      else if (save && !text) op({ t: 'todo-del', id: e.id, i: i });
      render();
    }
    node.onkeydown = function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } if (ev.key === 'Escape') finish(false); };
    node.onpointerdown = function (ev) { ev.stopPropagation(); };
    node.onblur = function () { setTimeout(function () { if (document.activeElement !== node) finish(true); }, 120); };
  }
  function getPath(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function startEdit(id, selectAll, sub) {
    var e = find(id); if (!e) return;
    if (viewOnly()) return;
    if (e.masked) { toast('Private mode: this text belongs to someone else'); return; }
    var elNode = world.querySelector('[data-id="' + id + '"]'); if (!elNode) return;
    if (sub) {
      var path = sub.dataset.ed; if (!document.body.contains(sub)) sub = elNode.querySelector('[data-ed="' + path + '"]'); if (!sub) return;
      try { sub.contentEditable = 'plaintext-only'; } catch (err) {} if (sub.contentEditable !== 'plaintext-only') sub.contentEditable = 'true';
      var top = path.split('.')[0];
      editing = { id: id, field: path, top: top, rich: false, node: sub, elNode: elNode, orig: JSON.parse(JSON.stringify(e[top] == null ? '' : e[top])), timer: 0 };
      renderSel(); sub.focus({ preventScroll: true });
      var r0 = document.createRange(); r0.selectNodeContents(sub); var s0 = getSelection(); s0.removeAllRanges(); s0.addRange(r0);
      sub.oninput = function () { clearTimeout(editing.timer); editing.timer = setTimeout(function () { sendEdit(false); }, 400); };
      sub.onpaste = textPaste;
      sub.onkeydown = function (ev) { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey)) { ev.preventDefault(); sub.blur(); } };
      sub.onpointerdown = function (ev) { ev.stopPropagation(); };
      sub.onblur = function () { setTimeout(function () { if (editing && editing.node === sub && document.activeElement !== sub) finishEdit(); }, 0); };
      return;
    }
    var node = e.type === 'note' ? $('.ntext', elNode) : e.type === 'shape' ? $('.stext', elNode) : e.type === 'zone' ? $('.ztitle', elNode) : e.type === 'frame' ? $('.ftitle', elNode) : elNode;
    if (!node) return;
    var rich = /^(text|note|shape)$/.test(e.type), field = e.type === 'zone' || e.type === 'frame' ? 'title' : 'text';
    $$('.lockb,.tnb,.rxs', node).forEach(function (n) { n.remove(); });
    var hlw = $('.hlw', node); if (hlw && rich) { hlw.replaceWith.apply(hlw, Array.prototype.slice.call(hlw.childNodes)); }
    if (rich) node.contentEditable = 'true';
    else { try { node.contentEditable = 'plaintext-only'; } catch (err) {} if (node.contentEditable !== 'plaintext-only') node.contentEditable = 'true'; }
    editing = { id: id, field: field, rich: rich, node: node, elNode: elNode, orig: rich ? { html: e.html || null, text: e.text || '' } : (e[field] || ''), timer: 0 };
    renderSel();
    node.focus({ preventScroll: true });
    var r = document.createRange(); r.selectNodeContents(node); if (!selectAll) r.collapse(false);
    var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    node.oninput = function () {
      if (e.type === 'note') { var tmp = Object.assign({}, find(id) || e, { text: node.innerText }); node.style.fontSize = noteFont(tmp) + 'px'; }
      clearTimeout(editing.timer);
      editing.timer = setTimeout(function () { sendEdit(false); }, 350);
    };
    node.onpaste = textPaste;
    node.onkeydown = function (ev) {
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (field === 'title' || e.type === 'card') && !ev.shiftKey)) { ev.preventDefault(); node.blur(); return; }
      if (rich && ev.key === ' ' && autoList(node)) { ev.preventDefault(); return; }
      if ((ev.ctrlKey || ev.metaKey) && /^[biu]$/i.test(ev.key)) {
        ev.preventDefault();
        var f = { b: 'bold', i: 'italic', u: 'underline' }[ev.key.toLowerCase()];
        if (rich && !getSelection().isCollapsed) exec(f); else patchSel(function (x) { var o = {}; o[f] = !x[f] || null; return o; }, [id]);
      }
    };
    node.onblur = function () { setTimeout(function () { if (editing && editing.node === node && document.activeElement !== node && !(document.activeElement && document.activeElement.closest('#ctx,#ctxpop'))) finishEdit(); }, 0); };
  }
  // «- » в начале строки → маркированный список, «1. » → нумерованный, «> » → раскрывающийся список
  function autoList(root) {
    var g = getSelection(); if (!g.rangeCount || !g.isCollapsed) return false;
    var r = g.getRangeAt(0), n = r.startContainer, blk = n.nodeType === 3 ? n.parentNode : n;
    while (blk && blk !== root && !/^(DIV|P|LI|SUMMARY)$/.test(blk.nodeName)) blk = blk.parentNode;
    if (!blk || blk.nodeName === 'LI' || blk.nodeName === 'SUMMARY') return false;
    var pre = document.createRange(); pre.setStart(blk, 0); pre.setEnd(r.startContainer, r.startOffset);
    var t = pre.toString();
    if (t !== '-' && t !== '*' && t !== '•' && !/^1[.)]$/.test(t) && t !== '>') return false;
    for (var i = 0; i < t.length; i++) document.execCommand('delete');
    if (t === '>') { document.execCommand('insertHTML', false, '<details open><summary>Title</summary><div>Hidden text…</div></details><div><br></div>'); selectNewSummary(root); }
    else document.execCommand(/^1/.test(t) ? 'insertOrderedList' : 'insertUnorderedList');
    if (editing) { clearTimeout(editing.timer); editing.timer = setTimeout(function () { sendEdit(false); }, 350); }
    return true;
  }
  function selectNewSummary(root) { var ss = $$('summary', root).filter(function (x) { return x.textContent === 'Title'; }), su = ss[ss.length - 1]; if (!su) return; var r = document.createRange(); r.selectNodeContents(su); var g = getSelection(); g.removeAllRanges(); g.addRange(r); }
  // раскрывающиеся списки: каждый сворачивает и разворачивает у себя
  var DET = {};
  function applyDetails() { $$('#world [data-id] details').forEach(function (d) { var host = d.closest('[data-id]'), i = Array.prototype.indexOf.call(host.querySelectorAll('details'), d), k = host.dataset.id + ':' + i; if (k in DET) d.open = DET[k]; }); }
  document.addEventListener('click', function (ev) {
    var su = ev.target.closest && ev.target.closest('#world summary'); if (!su || su.closest('[contenteditable=true]')) return;
    ev.preventDefault(); ev.stopPropagation();
    var d = su.parentNode, host = d.closest('[data-id]'); d.open = !d.open;
    DET[host.dataset.id + ':' + Array.prototype.indexOf.call(host.querySelectorAll('details'), d)] = d.open;
  }, true);
  function sendEdit(final) {
    if (!editing || editing.todo) return;
    var ed = editing, e = find(ed.id); if (!e) return;
    var item = { id: ed.id }, back = { id: ed.id };
    if (ed.rich) {
      var text = ed.node.innerText.replace(/\n$/, ''), html = ed.node.innerHTML;
      var plain = !/<(b|strong|i|em|u|s|strike|span|ul|ol|li|font|a|details|summary)[\s>]/i.test(html);
      if (e.text === text && (e.html || '') === (plain ? '' : html) && !final) return;
      e.text = text; if (plain) delete e.html; else e.html = html;
      item.text = text; item.html = plain ? null : html;
      back.text = ed.orig.text; back.html = ed.orig.html;
      if (final && text === ed.orig.text && (plain ? null : html) === ed.orig.html) return;
    } else if (ed.top) {
      var t3 = ed.node.innerText.replace(/\n$/, '').replace(/\n/g, ' ').trim();
      if (getPath(e, ed.field) === t3 && !final) return;
      var parts = ed.field.split('.'), val = JSON.parse(JSON.stringify(e[ed.top] == null ? '' : e[ed.top]));
      if (parts.length === 1) val = t3; else { var o = val; for (var i = 1; i < parts.length - 1; i++) o = o[parts[i]]; o[parts[parts.length - 1]] = t3; }
      e[ed.top] = val; item[ed.top] = val; back[ed.top] = ed.orig;
      if (final && JSON.stringify(val) === JSON.stringify(ed.orig)) return;
    } else {
      var t2 = ed.node.innerText.replace(/\n$/, '');
      if (ed.field === 'title') t2 = t2.replace(/\n/g, ' ').trim();
      if (e[ed.field] === t2 && !final) return;
      e[ed.field] = t2; item[ed.field] = t2; back[ed.field] = ed.orig;
      if (final && t2 === ed.orig) return;
    }
    op({ t: 'patch', items: [item] });
    if (final) pushUndo(function () { op({ t: 'patch', items: [back] }); });
  }
  function finishEdit() {
    if (!editing) return;
    if (editing.todo) { editing.finish(true); return; }
    clearTimeout(editing.timer);
    sendEdit(true);
    var ed = editing; editing = null;
    ed.node.contentEditable = 'false'; ed.node.oninput = ed.node.onkeydown = ed.node.onblur = ed.node.onpaste = ed.node.onpointerdown = null; ed.node.removeAttribute('contenteditable');
    var e = find(ed.id);
    if (e && e.type === 'text' && !(e.text || '').trim()) { op({ t: 'del', id: e.id }); select([]); }
    render();
  }

  /* ---------- creating ---------- */
  function createAt(kind, w, box) {
    var el;
    if (kind === 'note') el = { id: rid(), type: 'note', x: r1(w.x - 100), y: r1(w.y - 100), w: 200, h: 200, text: '', color: NOTE_COLORS[0] };
    else if (kind === 'shape') el = { id: rid(), type: 'shape', shape: shapeKind, x: r1(w.x - 100), y: r1(w.y - 65), w: 200, h: shapeKind === 'ellipse' || shapeKind === 'diamond' || shapeKind === 'star' || shapeKind === 'hexagon' ? 160 : 130, text: '', fill: '#FFFFFF', stroke: '#1E1E1C', sw: 2, size: 18 };
    else el = { id: rid(), type: 'text', x: r1(w.x), y: r1(w.y - 14), w: 360, text: '', size: 24 };
    if (box) {
      el.x = r1(box.x); el.w = r1(Math.max(kind === 'text' ? 80 : 24, box.w));
      if (kind === 'shape') { el.y = r1(box.y); el.h = r1(Math.max(24, box.h)); } else el.y = r1(box.y);
    }
    B.elements.push(Object.assign({}, el, { by: ME.id }));
    render(); selectOnly(el.id);
    setTimeout(function () { startEdit(el.id); }, 30);   // после mousedown, иначе фокус уйдёт с поля
    op(kind === 'note' ? { t: 'add', el: el } : { t: 'el-set', el: el }, function (ok) { if (ok) pushUndo(function () { op({ t: 'del', id: el.id }); }); });
  }
  function freeSpot(e) {
    var others = e.type === 'frame' ? frames().map(elBox) : B.elements.filter(function (x) { return x.type !== 'frame' && !hiddenByCollapse(x); }).map(elBox);
    for (var k = 0; k < 40; k++) {
      var bx = elBox(e);
      var hit = others.some(function (o) { return bx.x < o.x + o.w + 30 && bx.x + bx.w + 30 > o.x && bx.y < o.y + o.h + 60 && bx.y + bx.h + 60 > o.y; });
      if (!hit) break;
      if (e.type === 'frame') e.x += bx.w + 120;
      else if (k % 4 === 3) { e.x -= 3 * (bx.w + 40); e.y += bx.h + 40; } else e.x += bx.w + 40;
    }
  }
  function addNotebook() {
    var c = viewCenter(), el = { id: rid(), type: 'frame', x: Math.round(c.x - 450), y: Math.round(c.y - 300), w: 900, h: 1200, title: 'Notebook', fill: '#FFFEF8', tex: 'lines' };
    op({ t: 'el-set', el: el }, function (ok) { if (!ok) return; pushUndo(function () { op({ t: 'del', id: el.id }); }); setTimeout(function () { select([el.id]); }, 150); toast('Pick the pen (or the highlighter) and write. In the pen menu, turn on “Pencil only” — then fingers move the board and only the Pencil writes'); });
  }
  function addGame(type) {
    var el = Object.assign({ id: rid() }, window.GAMES_API.add(type, viewCenter()));
    op({ t: 'el-set', el: el }, function (ok) { if (!ok) return; pushUndo(function () { op({ t: 'del', id: el.id }); }); setTimeout(function () { select([el.id]); }, 150); toast('Double-click the game (or ⚙ Set up) to put in your words and tasks'); });
  }
  // доска детектива: пробковый фрейм, улики на кнопках и красные нити между ними
  function addDetective() {
    var c = viewCenter(), x0 = Math.round(c.x - 700), y0 = Math.round(c.y - 420), fid = rid(), els = [];
    els.push({ id: fid, type: 'frame', x: x0, y: y0, w: 1400, h: 840, title: 'Case file: who did it?', fill: '#C99A62', tex: 'cork' });
    var ev = [['Suspect 1', 'Was seen near the library at 9 pm', '#FFF1A8', 160, 140, -4], ['Suspect 2', 'Has no alibi for Friday night', '#FFD2B0', 560, 110, 3], ['Clue', 'A muddy footprint, size 42', '#C3DAF7', 980, 170, -2], ['Witness', '“I heard a door slam at 9:15”', '#BFE8D2', 340, 470, 2], ['Motive?', 'Write your theory here…', '#FFFFFF', 820, 500, -3]];
    var ids = ev.map(function (v) { var id = rid(); els.push({ id: id, type: 'note', x: x0 + v[3], y: y0 + v[4], w: 230, h: 210, text: v[0] + '\n\n' + v[1], color: v[2], pin: true, rot: v[5] }); return id; });
    [[0, 1], [1, 2], [0, 3], [3, 4]].forEach(function (p) { els.push({ id: rid(), type: 'line', x: 0, y: 0, x2: 0, y2: 0, from: ids[p[0]], to: ids[p[1]], color: '#C2412D', sw: 3, curve: true, start: 'dot', end: 'dot', thread: true }); });
    op({ t: 'el-many', els: els }, function (ok) { if (!ok) return; pushUndo(function () { els.forEach(function (x) { op({ t: 'del', id: x.id }); }); }); setTimeout(function () { var f = find(fid); if (f) goFrame(f); }, 300); toast('Detective board: add evidence (stickies, photos) and connect them with red threads — connector tool (L)'); });
  }
  function addEl(type) {
    var c = viewCenter(), e = { id: rid(), type: type };
    if (type === 'frame') Object.assign(e, { x: c.x - 600, y: c.y - 340, w: 1200, h: 680, title: 'Frame ' + (frames().length + 1) });
    if (type === 'card') Object.assign(e, { x: c.x, y: c.y, text: 'word' });
    if (type === 'zone') Object.assign(e, { x: c.x - 160, y: c.y - 120, w: 320, h: 240, title: 'Group' });
    if (type === 'sentence') Object.assign(e, { x: c.x - 400, y: c.y, w: 800, size: 22, parts: ['I have ', { slot: e.id + 's1', answer: 'never' }, ' seen it.'] });
    if (type === 'wheel') Object.assign(e, { x: c.x - 190, y: c.y - 190, size: 380, items: ['Anna', 'Ivan', 'Maria', 'Oleg', 'Sveta', 'Petr'], angle: 0 });
    if (type === 'flip') Object.assign(e, { x: c.x - 130, y: c.y - 90, w: 260, h: 180, front: { text: 'Word' }, back: { text: 'Meaning' } });
    if (type === 'scale') Object.assign(e, { x: c.x - 350, y: c.y - 40, w: 700, title: 'Is kindness a blessing or a curse?', left: 'a curse', right: 'a blessing', votes: {} });
    if (type === 'dice') Object.assign(e, { x: c.x, y: c.y, size: 80, count: 1, values: [1] });
    if (type === 'rating') Object.assign(e, { x: c.x - 210, y: c.y - 60, w: 420, title: 'How useful was today’s lesson?', max: 5, votes: {} });
    if (type === 'deck') Object.assign(e, { x: c.x - 150, y: c.y - 110, w: 300, h: 220, title: 'Random cards', items: ['Describe your ideal weekend', 'Talk about a recent purchase', 'Give advice to a new student', 'Tell a funny story', 'Explain a word without saying it'], dealt: 0 });
    if (type === 'boxes') Object.assign(e, { x: c.x - 260, y: c.y - 140, w: 520, cols: 4, title: 'Open the box', items: ['a time you were lucky', 'your favourite place', 'a skill you want', 'best advice ever', 'a guilty pleasure', 'your morning routine', 'a book you love', 'a dream trip'], open: [] });
    if (type === 'ball') Object.assign(e, { x: c.x - 130, y: c.y - 130, size: 260, title: 'Ask the ball', items: ['Definitely!', 'Ask again later', 'Not in a million years', 'It’s a tipping point', 'Go for it', 'Better not tell you now'] });
    if (type === 'coin') Object.assign(e, { x: c.x - 90, y: c.y - 90, size: 180, heads: 'Yes', tails: 'No' });
    if (type === 'table') Object.assign(e, { x: c.x - 330, y: c.y - 225, cols: [220, 220, 220], rows: [150, 150, 150], cells: [['', '', ''], ['', '', ''], ['', '', '']], size: 18 });
    if (type === 'kanban') Object.assign(e, { x: c.x - 540, y: c.y - 150, w: 1080, title: '', cols: [{ id: 'todo', name: 'Not Started', color: '#D9D9D6' }, { id: 'doing', name: 'In Progress', color: '#B5CBF5' }, { id: 'done', name: 'Complete', color: '#A9DFB1' }], cards: [{ id: rid(), col: 'todo', title: '' }] });
    if (type === 'kcard') Object.assign(e, { x: c.x - 160, y: c.y - 40, w: 320, title: 'New card', status: 'Not Started' });
    if (type === 'chart') Object.assign(e, { x: c.x - 310, y: c.y - 210, w: 620, h: 420, title: 'How often do you speak English?', kind: 'bar', pal: 'brand', unit: '', vals: true, rows: [{ l: 'Every day', v: 4 }, { l: 'Weekly', v: 7 }, { l: 'Monthly', v: 3 }, { l: 'Rarely', v: 2 }] });
    if (type === 'open') Object.assign(e, { x: c.x - 380, y: c.y - 260, w: 760, h: 520, title: 'If I could live anywhere, I would…', answers: [] });
    if (type === 'cloud') Object.assign(e, { x: c.x - 280, y: c.y - 170, w: 560, h: 340, title: 'One word about today’s lesson', words: [] });
    if (type === 'todo') Object.assign(e, { x: c.x - 180, y: c.y - 100, w: 360, size: 18, title: 'To do', items: [{ t: 'Read the text' }, { t: 'Underline new words' }, { t: 'Discuss with your partner' }] });
    if (type === 'poll') Object.assign(e, { x: c.x - 230, y: c.y - 120, w: 460, title: 'Which topic next?', options: ['Option A', 'Option B', 'Option C'], votes: {} });
    freeSpot(e);
    e.x = Math.round(e.x); e.y = Math.round(e.y);
    op(type === 'frame' ? { t: 'el-many', els: [e] } : { t: 'el-set', el: e }, function (ok) {
      if (!ok) return;
      pushUndo(function () { op({ t: 'del', id: e.id }); });
      setTimeout(function () {
        var b = elBox(e), vr = vp.getBoundingClientRect(), sx = b.x * V.z + V.x, sy = b.y * V.z + V.y;
        if (sx < 0 || sy < 0 || sx + b.w * V.z > vr.width || sy + b.h * V.z > vr.height) fitTo({ x: b.x - 100, y: b.y - 100, w: b.w + 200, h: b.h + 200 });
        selectOnly(e.id);
        if (type === 'card' || type === 'frame') startEdit(e.id, true);
      }, 140);
    });
  }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable=true],[contenteditable=plaintext-only]')) return;
    // буквы берём по физической клавише — тогда сочетания работают и в русской раскладке (Cmd+C, Cmd+Z, N, F…)
    var k = /^Key[A-Z]$/.test(e.code || '') ? e.code.slice(3).toLowerCase() : (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ') { spaceDown = true; vp.style.cursor = 'grab'; e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); undo(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (mod && k === 'c') { if (copySel()) e.preventDefault(); return; }
    if (mod && k === 'g' && isT() && sel.length) { e.preventDefault(); if (e.shiftKey) patchSel(function () { return { g: null }; }); else if (sel.length > 1) { var g = rid(); patchSel(function () { return { g: g }; }); } return; }
    if (mod && k === 'a' && isT()) { e.preventDefault(); sel = B.elements.filter(function (x) { return !hiddenByCollapse(x) && !framesOf(x).length; }).map(function (x) { return x.id; }); selS = B.strokes.filter(function (st) { return !frames().some(function (fr) { return inRect(strokeCenter(st), fr); }); }).map(function (st) { return st.id; }); renderLinks(); renderSel(); return; }
    if (mod && /^[biu]$/.test(k) && sel.length) { e.preventDefault(); var f = { b: 'bold', i: 'italic', u: 'underline' }[k]; var on = !sel.map(find).every(function (x) { return x[f]; }); patchSel(function (x) { return /^(text|note|zone|frame|card|sentence|shape)$/.test(x.type) && canStyle(x) ? (function () { var o = {}; o[f] = on || null; return o; })() : null; }); return; }
    if (mod) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && (sel.length || selS.length)) { e.preventDefault(); if (selS.length) deleteStrokes(); if (sel.length) deleteSel(); return; }
    if (e.key === 'Escape') { if (cropId) { cropId = null; renderSel(); } else if (sel.length) select([]); setTool('select'); return; }
    if (e.key === 'Enter' && sel.length === 1) { var se = find(sel[0]); if (se && canEditText(se)) { e.preventDefault(); startEdit(se.id); } return; }
    if (e.key.length === 1 && e.key !== ' ' && sel.length === 1 && !e.altKey) {
      var te = find(sel[0]);
      if (te && /^(note|text|shape)$/.test(te.type) && canEditText(te)) { e.preventDefault(); startEdit(te.id); document.execCommand('insertText', false, e.key); return; }
    }
    if (e.shiftKey && (k === '0' || k === ')')) { zoomAt(1 / V.z); return; }
    if ((e.key === 'PageUp' || e.key === 'PageDown') && sel.length) { e.preventDefault(); reorder(e.key === 'PageUp' ? (e.shiftKey ? 'forward' : 'front') : (e.shiftKey ? 'backward' : 'back')); return; }
    if (e.key.indexOf('Arrow') === 0 && sel.length) {
      e.preventDefault(); var st = e.shiftKey ? 10 : 1;
      var dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      sendMoves(sel.map(find).filter(canMove).map(function (x) { return mv(x, dx, dy); })); return;
    }
    if (e.shiftKey && (k === '1' || k === '!')) { fit(); return; }
    var map = { v: 'select', h: 'hand', p: 'pen', e: 'eraser', n: 'note' };
    if (map[k]) setTool(map[k]);
    if (isT()) { if (k === 't') setTool('text'); if (k === 's') setTool('shape'); if (k === 'l') setTool('line'); if (k === 'f') addEl('frame'); }
  });
  document.addEventListener('keyup', function (e) { if (e.key === ' ') { spaceDown = false; setTool(tool); } });

  /* ---------- advanced settings panel ---------- */
  var TYPE_NAMES = { wyr: 'Would you rather', cubes: 'Story cubes', ttl: 'Two truths and a lie', bingo: 'Bingo', ttt: 'Tic-tac-toe', odd: 'Odd one out', domino: 'Dominoes', fork: 'Collocation fork', auction: 'Sentence auction', race: 'Race', jeopardy: 'Jeopardy', buzzer: 'Buzzer', escape: 'Escape room', taboo: 'Taboo', table: 'Table', kanban: 'Kanban board', kcard: 'Card', link: 'Link', deck: 'Random cards', boxes: 'Open the box', ball: 'Magic ball', cloud: 'Word cloud', open: 'Open ended', chart: 'Chart', coin: 'Coin', input: 'Answer field', video: 'Video', todo: 'Checklist', rating: 'Rating', poll: 'Poll', media: 'Audio / video', frame: 'Frame', text: 'Text', card: 'Card', zone: 'Zone', sentence: 'Sentence', note: 'Sticky note', image: 'Image', sticker: 'Emoji', wheel: 'Spinner wheel', flip: 'Flip card', scale: 'Opinion scale', dice: 'Dice', shape: 'Shape', line: 'Connector', html: 'Interactive block' };
  function renderProps() {
    var e = sel.length === 1 && find(sel[0]);
    if (!isT() || !e) { $('#props').hidden = true; return; }
    $('#propsTitle').textContent = TYPE_NAMES[e.type] || 'Settings';
    var h = '';
    switch (e.type) {
      case 'frame':
        h += '<label class="f">Title<input id="pTitle" value="' + esc(e.title) + '"></label>' +
          '<label class="c"><input type="checkbox" id="pColl"' + (e.collapsed ? ' checked' : '') + '> Collapsed</label>' +
          '<label class="c"><input type="checkbox" id="pHid"' + (e.hidden ? ' checked' : '') + '> Hidden from students</label>' +
          '<label class="c"><input type="checkbox" id="pPriv"' + (e.private ? ' checked' : '') + '> Only owners see what\'s inside</label>' +
          '<label class="c"><input type="checkbox" id="pRo"' + (e.ro ? ' checked' : '') + '> Others can look but not change (owners only edit)</label>' +
          '<label class="c"><input type="checkbox" id="pClaim"' + (e.claim ? ' checked' : '') + '> Students can join this frame</label>' +
          (e.owners && e.owners.length ? '<p class="hint">Owners: ' + e.owners.map(function (o) { return esc(o.name); }).join(', ') + ' · <a href="#" id="pNoOwn">clear</a></p>' : '') +
          '<button class="pb solid" id="pSave" type="button">Save</button>' +
          '<div class="box"><div class="lbl">Make copies</div>' +
          '<select id="dMode"><option value="each">One per student</option><option value="pairs">One per pair</option><option value="rooms">N rooms (students join)</option></select>' +
          '<label class="f" id="dNwrap" hidden>Number of rooms<input id="dN" type="number" min="1" max="30" value="3"></label>' +
          '<label class="c"><input type="checkbox" id="dOnline" checked> Only students online now</label>' +
          '<label class="c" id="dShufW" hidden><input type="checkbox" id="dShuf" checked> Shuffle pairs</label>' +
          '<label class="c"><input type="checkbox" id="dPriv"> Each copy visible only to its owners</label>' +
          '<label class="c"><input type="checkbox" id="dHide" checked> Hide the original from students</label>' +
          '<button class="pb solid" id="dGo" type="button">Make copies</button>' +
          '<p class="hint">Copies appear to the right of everything in this row, named after students. Each keeps its own auto-check.</p></div>' +
          '<div class="btns"><button class="pb" data-panel="tplPanel" type="button">Add a task inside</button><button class="pb" id="fReset" type="button">Reset answers</button><button class="pb" id="fClean" type="button">Reset and clear student notes</button></div>';
        break;
      case 'card':
        var zones = B.elements.filter(function (z) { return z.type === 'zone'; });
        h += '<label class="f">Text<input id="pText" value="' + esc(e.text) + '"></label>' +
          '<label class="f">Correct zone<select id="pAns"><option value="">None (for gaps, or a distractor)</option>' + zones.map(function (z) { return '<option value="' + z.id + '"' + (z.id === e.answer ? ' selected' : '') + '>' + esc(z.title || 'untitled zone') + '</option>'; }).join('') + '</select></label>' +
          '<div class="btns"><button class="pb solid" id="pSave" type="button">Save</button><button class="pb" id="pHome" type="button">Send card back</button></div>';
        break;
      case 'sentence': h += '<label class="f">Sentence — put answers in [brackets]<textarea id="pSent">' + esc(sentenceToText(e)) + '</textarea></label><label class="c"><input type="checkbox" id="pMk" checked> Add cards for new gaps</label><button class="pb solid" id="pSave" type="button">Save</button>'; break;
      case 'wheel': h += '<label class="f">Options, one per line<textarea id="pItems" rows="8">' + esc(e.items.join('\n')) + '</textarea></label><button class="pb solid" id="pSave" type="button">Save</button><p class="hint">Anyone can spin; everyone sees the result.</p>'; break;
      case 'flip':
        ['front', 'back'].forEach(function (sd) {
          h += '<div class="box"><div class="lbl">' + (sd === 'front' ? 'Front' : 'Back') + '</div><textarea id="p_' + sd + '" rows="3">' + esc(e[sd].text) + '</textarea>' +
            (e[sd].src ? '<img src="' + esc(e[sd].src) + '" alt="" style="max-height:90px;object-fit:contain;align-self:flex-start"><button class="pb" data-rmimg="' + sd + '" type="button">Remove photo</button>' : '') +
            '<label class="pb">' + (e[sd].src ? 'Replace photo' : 'Add photo') + '<input type="file" accept="image/*" data-img="' + sd + '" hidden></label></div>';
        });
        h += '<div class="lbl">Back colour</div><div class="sws">' + ACCENTS.map(function (c) { return '<button class="sw' + ((e.color || '') === c ? ' cur' : '') + '" data-flipcol="' + c + '" style="--c:' + (c || '#E8C65A') + '" type="button"></button>'; }).join('') + '</div><button class="pb solid" id="pSave" type="button">Save</button>';
        break;
      case 'scale': h += '<label class="f">Question<input id="pTitle" value="' + esc(e.title) + '"></label><div class="row2"><label class="f">Left<input id="pLeft" value="' + esc(e.left) + '"></label><label class="f">Right<input id="pRight" value="' + esc(e.right) + '"></label></div><div class="btns"><button class="pb solid" id="pSave" type="button">Save</button><button class="pb" id="pClearVotes" type="button">Clear votes (' + Object.keys(e.votes || {}).length + ')</button></div>'; break;
      case 'rating': h += '<label class="f">Question<input id="pTitle" value="' + esc(e.title) + '"></label><label class="f">Number of stars<select id="pMax">' + [3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<option' + (n === e.max ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label><div class="btns"><button class="pb solid" id="pSave" type="button">Save</button><button class="pb" id="pClearVotes" type="button">Clear votes (' + Object.keys(e.votes || {}).length + ')</button></div>'; break;
      case 'poll': h += '<label class="f">Question<input id="pTitle" value="' + esc(e.title) + '"></label><label class="f">Options, one per line<textarea id="pOpts" rows="6">' + esc(e.options.join('\n')) + '</textarea></label><label class="c"><input type="checkbox" id="pHideN"' + (e.hideNames ? ' checked' : '') + '> Don’t show me who voted for what</label><div class="btns"><button class="pb solid" id="pSave" type="button">Save</button><button class="pb" id="pClearVotes" type="button">Clear votes (' + Object.keys(e.votes || {}).length + ')</button></div>'; break;
      case 'deck': h += '<label class="f">Title<input id="pTitle" value="' + esc(e.title) + '"></label><label class="f">Cards, one per line<textarea id="pDeck" rows="9">' + esc(e.items.join('\n')) + '</textarea></label><div class="btns"><button class="pb solid" id="pSave" type="button">Save</button></div><p class="hint">Anyone can deal the next card or shuffle; everyone sees the same card.</p>'; break;
      case 'boxes': h += '<label class="f">Title<input id="pTitle" value="' + esc(e.title) + '"></label><label class="f">What’s inside each box, one per line<textarea id="pBoxes" rows="9">' + esc(e.items.join('\n')) + '</textarea></label><label class="f">Columns<select id="pCols">' + [2, 3, 4, 5, 6].map(function (n) { return '<option' + (n === e.cols ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label><div class="btns"><button class="pb solid" id="pSave" type="button">Save</button><button class="pb" id="pCloseBoxes" type="button">Close all boxes</button></div><p class="hint">Students open boxes one by one; you can close a box again by clicking it.</p>'; break;
      case 'ball': h += '<label class="f">Button text<input id="pTitle" value="' + esc(e.title) + '"></label><label class="f">Answers, one per line — words or sentences<textarea id="pBall" rows="9">' + esc(e.items.join('\n')) + '</textarea></label><button class="pb solid" id="pSave" type="button">Save</button>'; break;
      case 'coin': h += '<div class="row2"><label class="f">Side 1<input id="pHeads" value="' + esc(e.heads) + '"></label><label class="f">Side 2<input id="pTails" value="' + esc(e.tails) + '"></label></div><button class="pb solid" id="pSave" type="button">Save</button><p class="hint">For example Heads / Tails, Yes / No, Agree / Disagree, Team A / Team B.</p>'; break;
      case 'chart': h += '<label class="f">Title<input id="pTitle" value="' + esc(e.title) + '"></label>' +
        '<div class="row2"><label class="f">Type<select id="pKind">' + [['bar', 'Columns'], ['hbar', 'Bars'], ['line', 'Line'], ['pie', 'Pie'], ['donut', 'Donut']].map(function (k) { return '<option value="' + k[0] + '"' + (e.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="f">Colours<select id="pPal">' + [['brand', 'Speak&Teach'], ['pastel', 'Pastel'], ['bold', 'Bright'], ['mono', 'Graphite']].map(function (k) { return '<option value="' + k[0] + '"' + (e.pal === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="f">Data — one per line: <b>label: number</b><textarea id="pRows" rows="9" placeholder="Every day: 4&#10;Weekly: 7">' + esc((e.rows || []).map(function (r) { return r.l + ': ' + r.v; }).join('\n')) + '</textarea></label>' +
        '<div class="row2"><label class="f">Unit after numbers<input id="pUnit" value="' + esc(e.unit || '') + '" placeholder="%, min, pts"></label><label class="c" style="align-self:end"><input type="checkbox" id="pVals"' + (e.vals !== false ? ' checked' : '') + '> Show numbers</label></div>' +
        '<button class="pb solid" id="pSave" type="button">Save</button><p class="hint">Tip: paste two columns straight from Excel or Google Sheets — tabs work too. Background colour or gradient: the colour button on the toolbar.</p>'; break;
      case 'open': h += '<label class="f">Beginning of the sentence<input id="pTitle" value="' + esc(e.title) + '"></label><div class="btns"><button class="pb solid" id="pSave" type="button">Save</button><button class="pb" id="pClearOpen" type="button">Clear answers (' + e.answers.length + ')</button></div><p class="hint">Students write their own ending — answers float in the cloud with their names (no names when the board is anonymous). Double-click the sentence to edit it right on the board.</p>'; break;
      case 'cloud': h += '<label class="f">Question<input id="pTitle" value="' + esc(e.title) + '"></label><div class="btns"><button class="pb solid" id="pSave" type="button">Save</button><button class="pb" id="pClearCloud" type="button">Clear the cloud</button></div><p class="hint">Words that more people add get bigger. Alt+click a word to remove it.</p>'; break;
      case 'input': h += '<label class="f">Text above the field<textarea id="pLabel" rows="3">' + esc(e.label) + '</textarea></label><label class="f">Correct answers, one per line<textarea id="pAnswers" rows="4">' + esc(e.answers.join('\n')) + '</textarea></label><label class="f">Hint (optional)<input id="pHint" value="' + esc(e.hint) + '"></label><button class="pb solid" id="pSave" type="button">Save</button><p class="hint">Checked with “Check answers”: capitals and full stops don’t matter.</p>'; break;
      case 'video': h += '<label class="f">Title<input id="pTitle" value="' + esc(e.title) + '"></label><button class="pb solid" id="pSave" type="button">Save</button>'; break;
      case 'todo': h += '<label class="f">Title<input id="pTitle" value="' + esc(e.title) + '"></label><label class="f">Items, one per line<textarea id="pTodo" rows="8">' + esc(e.items.map(function (x) { return x.t; }).join('\n')) + '</textarea></label><div class="btns"><button class="pb solid" id="pSave" type="button">Save</button><button class="pb" id="pUntick" type="button">Untick all</button></div><p class="hint">Everyone on the board can tick items; hover a ticked item to see who did it.</p>'; break;
      case 'media': h += '<label class="f">Title<input id="pTitle" value="' + esc(e.title) + '"></label><button class="pb solid" id="pSave" type="button">Save</button>'; break;
      case 'dice': h += '<label class="f">How many dice<select id="pCount">' + [1, 2, 3].map(function (n) { return '<option' + (n === e.count ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label><button class="pb solid" id="pSave" type="button">Save</button>'; break;
      default: h += '<p class="hint">Everything for this item is in the toolbar above it.</p>';
    }
    $('#propsBody').innerHTML = h;
    $('#props').hidden = false;
    PANELS.forEach(function (p) { if (p !== 'props') $('#' + p).hidden = true; });
  }
  function v(id) { var n = $('#' + id); return n ? n.value : undefined; }
  function chk(id) { var n = $('#' + id); return n ? n.checked : undefined; }
  $('#propsBody').addEventListener('change', async function (ev) {
    var t = ev.target;
    if (t.id === 'dMode') { $('#dNwrap').hidden = t.value !== 'rooms'; $('#dShufW').hidden = t.value !== 'pairs'; return; }
    if (t.dataset.img) {
      var f = t.files[0]; if (!f) return;
      try { var url = await uploadImage(f); var side = t.dataset.img; patchSel(function (x) { var o = {}; o[side] = Object.assign({}, x[side], { src: url }); return o; }); setTimeout(renderProps, 200); }
      catch (err) { toast(err.message); }
    }
  });
  $('#propsBody').addEventListener('click', function (ev) {
    var t = ev.target, e = find(sel[0]); if (!e) return;
    if (t.id === 'pNoOwn') { ev.preventDefault(); patchSel(function () { return { owners: [] }; }); setTimeout(renderProps, 200); return; }
    if (t.dataset.rmimg) { var sd = t.dataset.rmimg; patchSel(function (x) { var o = {}; o[sd] = Object.assign({}, x[sd], { src: '' }); return o; }); setTimeout(renderProps, 200); return; }
    if (t.dataset.flipcol != null) { patchSel(function () { return { color: t.dataset.flipcol || null }; }); setTimeout(renderProps, 200); return; }
    if (t.id === 'pHome') { op({ t: 'home', id: e.id }); return; }
    if (t.id === 'pCloseBoxes') { patchSel(function (x) { return { open: x.items.map(function () { return false; }) }; }); return; }
    if (t.id === 'pClearOpen') { if (confirm('Remove all answers?')) op({ t: 'open-del', id: e.id, all: true }); return; }
    if (t.id === 'pClearCloud') { if (confirm('Remove all words from the cloud?')) op({ t: 'cloud-del', id: e.id, all: true }); return; }
    if (t.id === 'pUntick') { patchSel(function (x) { return { items: x.items.map(function (it) { return { t: it.t, done: false }; }) }; }); setTimeout(renderProps, 200); return; }
    if (t.id === 'pClearVotes') { op({ t: 'scale-clear', id: e.id }); setTimeout(renderProps, 200); return; }
    if (t.id === 'fReset') { op({ t: 'frame-reset', id: e.id }); toast('Answers reset'); return; }
    if (t.id === 'fClean') { if (confirm('Send cards back and remove student notes, emoji, images and drawings in this frame?')) op({ t: 'frame-reset', id: e.id, clean: true }); return; }
    if (t.id === 'dGo') {
      op({ t: 'dup-frame', id: e.id, mode: v('dMode'), n: Number(v('dN')), onlineOnly: chk('dOnline'), shuffle: chk('dShuf'), private: chk('dPriv'), hideOriginal: chk('dHide') }, function (ok) { if (ok) { toast('Copies made'); setTimeout(fit, 250); } else toast('No students to copy for'); });
      return;
    }
    if (t.id !== 'pSave') return;
    var extra = [];
    patchSel(function (x) {
      var o = {};
      if (v('pTitle') != null) o.title = v('pTitle');
      if (v('pText') != null) o.text = v('pText');
      if (v('pAns') != null) o.answer = v('pAns') || null;
      if (v('pHeads') != null) { o.heads = v('pHeads') || 'Heads'; o.tails = v('pTails') || 'Tails'; }
      if (v('pRows') != null) { o.rows = v('pRows').split('\n').map(function (ln) { var m = /^(.*?)[\s]*[:\t;][\s]*(-?[\d.,\s]+)\s*%?\s*$/.exec(ln.trim()); if (!m) { var n2 = /^(-?[\d.,]+)$/.exec(ln.trim()); return n2 ? { l: '', v: parseFloat(n2[1].replace(',', '.')) } : null; } return { l: m[1].trim(), v: parseFloat(m[2].replace(/\s/g, '').replace(',', '.')) || 0 }; }).filter(Boolean); o.kind = v('pKind'); o.pal = v('pPal'); o.unit = v('pUnit'); o.vals = $('#pVals').checked; }
      if (v('pItems') != null) o.items = v('pItems').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (v('p_front') != null) o.front = Object.assign({}, x.front, { text: v('p_front') });
      if (v('p_back') != null) o.back = Object.assign({}, x.back, { text: v('p_back') });
      if (v('pLeft') != null) { o.left = v('pLeft'); o.right = v('pRight'); }
      if (v('pCount') != null) o.count = Number(v('pCount'));
      if (v('pMax') != null) o.max = Number(v('pMax'));
      if (v('pDeck') != null) { o.items = v('pDeck').split('\n').map(function (t2) { return t2.trim(); }).filter(Boolean); o.order = null; o.dealt = 0; }
      if (v('pBoxes') != null) { o.items = v('pBoxes').split('\n').map(function (t2) { return t2.trim(); }).filter(Boolean); o.cols = Number(v('pCols')); o.open = []; }
      if (v('pBall') != null) { o.items = v('pBall').split('\n').map(function (t2) { return t2.trim(); }).filter(Boolean); o.res = null; }
      if (v('pLabel') != null) { o.label = v('pLabel'); o.answers = v('pAnswers').split('\n').map(function (t2) { return t2.trim(); }).filter(Boolean); o.hint = v('pHint'); }
      if (v('pTodo') != null) { var old = {}; x.items.forEach(function (it) { old[it.t] = it; }); o.items = v('pTodo').split('\n').map(function (t2) { return t2.trim(); }).filter(Boolean).slice(0, 60).map(function (t2) { return old[t2] ? { t: t2, done: old[t2].done, by: old[t2].by } : { t: t2, done: false }; }); }
      if (v('pOpts') != null) { o.options = v('pOpts').split('\n').map(function (s2) { return s2.trim(); }).filter(Boolean).slice(0, 12); o.hideNames = chk('pHideN') || null; }
      if (x.type === 'frame') { o.collapsed = chk('pColl') || null; o.hidden = chk('pHid') || null; o.private = chk('pPriv') || null; o.ro = chk('pRo') || null; o.claim = chk('pClaim') || null; }
      if (x.type === 'sentence' && v('pSent') != null) {
        var oldA = x.parts.filter(function (p) { return typeof p !== 'string'; }).map(function (p) { return p.answer.toLowerCase(); });
        var g = parseGaps(v('pSent'), x.id); o.parts = g.parts;
        if (chk('pMk')) { var fresh = g.answers.filter(function (a) { var i = oldA.indexOf(a.toLowerCase()); if (i >= 0) { oldA.splice(i, 1); return false; } return true; }); if (fresh.length) extra = bank(fresh.map(function (t2) { return { text: t2 }; }), x.x, x.y + estLines(Object.assign({}, x, { parts: g.parts })) * x.size * 2.2, x.w).cards; }
      }
      return o;
    });
    if (extra.length) op({ t: 'el-many', els: extra });
    toast('Saved');
  });

  /* ---------- task templates ---------- */
  function estLines(e) { var len = e.parts.reduce(function (a, p) { return a + (typeof p === 'string' ? p.length : Math.max(6, (p.answer || '').length + 3)); }, 0); return Math.max(1, Math.ceil(len / (e.w / (e.size * 0.55)))); }
  function cardW(t) { return t.length * 9.6 + 40; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function bank(words, x0, y0, maxW) {
    var x = x0, y = y0 + 24, out = [];
    words.forEach(function (wd) { var cw = cardW(wd.text); if (x + cw > x0 + maxW && x > x0) { x = x0; y += 58; } out.push({ id: rid(), type: 'card', x: Math.round(x + cw / 2), y: y, text: wd.text, answer: wd.answer || null }); x += cw + 14; });
    return { cards: out, bottom: y + 30 };
  }
  function parseGaps(line, sid) {
    var parts = [], n = 0, re = /\[([^\]]+)\]/g, last = 0, m, answers = [];
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      // [answer|hint]: подсказка — определение, перевод; с галочкой «первая буква» показывается начало слова
      var bits = m[1].split('|'), ans = bits[0].trim(), hint = (bits[1] || '').trim(), q = { slot: sid + 's' + (++n), answer: ans };
      if (hint) { q.hint = hint; q.hk = 'text'; } else if (TPLOPT.letter) { q.hint = ans.slice(0, 1); q.hk = 'letter'; }
      parts.push(q); answers.push(ans); last = re.lastIndex;
    }
    if (last < line.length) parts.push(line.slice(last));
    return { parts: parts, answers: answers };
  }
  function sentenceToText(e) { return e.parts.map(function (p) { return typeof p === 'string' ? p : '[' + p.answer + (p.hint && p.hk === 'text' ? '|' + p.hint : '') + ']'; }).join(''); }
  var TPLOPT = {};
  function inputEl(label, answers, y, hint) { return { id: rid(), type: 'input', x: AX, y: y, w: Math.min(AW, 900), size: 20, label: label, answers: answers, hint: hint || '', value: '' }; }
  function textEl(t, y, size, extra) { return Object.assign({ id: rid(), type: 'text', x: AX, y: y, w: AW, text: t, size: size || 20 }, extra || {}); }
  var AX = 60, AW = 1480;
  function titleEl(title, y) { return { id: rid(), type: 'text', x: AX, y: y, w: AW, text: title, size: 24, bold: true }; }
  var TEMPLATES = {
    sort: { name: 'Sort into groups', hint: 'One line per group: group name, colon, items separated by commas.', sample: 'Kindness: helping without being asked, letting something go\nWeakness: saying yes when you mean no, suppressing your needs',
      build: function (txt, title, y0) {
        var rows = txt.split('\n').map(function (l) { var i = l.indexOf(':'); return i < 0 ? null : { t: l.slice(0, i).trim(), w: l.slice(i + 1).split(',').map(function (s) { return s.trim(); }).filter(Boolean) }; }).filter(function (r) { return r && r.t; });
        if (!rows.length) throw new Error('Add at least one line like “Group: word, word”');
        var els = [], y = y0; if (title) { els.push(titleEl(title, y)); y += 56; }
        var n = rows.length, gap = 20, zw = Math.floor((AW - gap * (n - 1)) / n), maxW = Math.max.apply(null, rows.map(function (r) { return r.w.length; })), zh = Math.max(220, maxW * 56 + 70), words = [];
        rows.forEach(function (r, i) { var z = { id: rid(), type: 'zone', x: AX + i * (zw + gap), y: y, w: zw, h: zh, title: r.t, color: ACCENTS[(i % 7) + 1] }; els.push(z); r.w.forEach(function (wd) { words.push({ text: wd, answer: z.id }); }); });
        var bk = bank(shuffle(words), AX, y + zh + 10, AW); return { els: els.concat(bk.cards), bottom: bk.bottom };
      } },
    pairs: { name: 'Match pairs', hint: 'One line per pair: word = definition (or translation).', sample: 'a tipping point = the moment a small change causes a big effect\ndetrimental = causing harm\nviable = able to work successfully',
      build: function (txt, title, y0) {
        var rows = txt.split('\n').map(function (l) { var i = l.indexOf('='); return i < 0 ? null : { w: l.slice(0, i).trim(), d: l.slice(i + 1).trim() }; }).filter(function (r) { return r && r.w && r.d; });
        if (!rows.length) throw new Error('Add at least one line like “word = definition”');
        var els = [], y = y0, words = []; if (title) { els.push(titleEl(title, y)); y += 56; }
        var cols = AW >= 1080 ? 2 : 1, gap = 20, zw = Math.floor((AW - gap * (cols - 1)) / cols), zh = 112;
        rows.forEach(function (r, i) { var z = { id: rid(), type: 'zone', x: AX + (i % cols) * (zw + gap), y: y + Math.floor(i / cols) * (zh + 14), w: zw, h: zh, title: r.d }; els.push(z); words.push({ text: r.w, answer: z.id }); });
        var bk = bank(shuffle(words), AX, y + Math.ceil(rows.length / cols) * (zh + 14) + 6, AW); return { els: els.concat(bk.cards), bottom: bk.bottom };
      } },
    gaps: { name: 'Fill the gaps', hint: 'One sentence per line, answers in [brackets]. Add a hint after a bar: [taste|вкус] or [taste|the ability to judge quality]. Extra (wrong) words on the last line: “Extra: word, word”.', opts: '<label class="c"><input type="checkbox" id="optLetter"> Show the first letter of every answer</label>', sample: "She's [looking after] the needs of her students instead of her own.\nThis price cut could be a [tipping] point.\nOver time, working for less could become [detrimental] to her wellbeing.\nExtra: viable",
      build: function (txt, title, y0) {
        var lines = txt.split('\n').map(function (s) { return s.trim(); }).filter(Boolean), extra = [];
        lines = lines.filter(function (l) { var m = /^(extra|лишние)\s*:(.*)$/i.exec(l); if (m) { extra = m[2].split(',').map(function (s) { return s.trim(); }).filter(Boolean); return false; } return true; });
        var els = [], y = y0, words = []; if (title) { els.push(titleEl(title, y)); y += 56; }
        lines.forEach(function (l, i) { var sid = rid(), g = parseGaps((i + 1) + '. ' + l, sid); if (!g.answers.length) return; var e = { id: sid, type: 'sentence', x: AX, y: y, w: AW, size: 22, parts: g.parts }; els.push(e); y += estLines(e) * 22 * 2.2 + 10; g.answers.forEach(function (a) { words.push({ text: a }); }); });
        if (!words.length) throw new Error('Mark answers with [brackets], e.g. [taste]');
        extra.forEach(function (x) { words.push({ text: x }); });
        var bk = bank(shuffle(words), AX, y + 6, AW); return { els: els.concat(bk.cards), bottom: bk.bottom };
      } },
    three: { name: 'One word, three sentences', hint: 'One task per line: three sentences with ___ separated by /, then = and the answer. Extra words on the last line: “Extra: word, word”.', sample: 'He has a good ___ for music. / Play it by ___. / I’m all ___. = ear\nShe took a deep ___. / Don’t hold your ___. / I ran out of ___. = breath\nExtra: hand, eye',
      build: function (txt, title, y0) {
        var lines = txt.split('\n').map(function (s) { return s.trim(); }).filter(Boolean), extra = [], els = [], y = y0, words = [];
        lines = lines.filter(function (l) { var m = /^(extra|лишние)\s*:(.*)$/i.exec(l); if (m) { extra = m[2].split(',').map(function (s) { return s.trim(); }).filter(Boolean); return false; } return true; });
        if (title) { els.push(titleEl(title, y)); y += 56; }
        lines.forEach(function (l, i) {
          var m = /^(.*)=\s*(.+)$/.exec(l); if (!m) return;
          var sents = m[1].split('/').map(function (x) { return x.trim(); }).filter(Boolean), ans = m[2].trim();
          els.push(textEl((i + 1) + '.', y, 22, { bold: true, w: 60 }));
          sents.forEach(function (st, k) { els.push(Object.assign(textEl(String.fromCharCode(97 + k) + ') ' + st.replace(/_{2,}/g, '______'), y, 20), { x: AX + 50, w: AW - 50 })); y += 34; });
          var sid = rid(), g = parseGaps('Answer: [' + ans + ']', sid); els.push({ id: sid, type: 'sentence', x: AX + 50, y: y + 4, w: AW - 50, size: 20, parts: g.parts }); y += 64;
          words.push({ text: ans });
        });
        if (!words.length) throw new Error('Write lines like “sentence / sentence / sentence = answer”');
        extra.forEach(function (x) { words.push({ text: x }); });
        var bk = bank(shuffle(words), AX, y, AW); return { els: els.concat(bk.cards), bottom: bk.bottom };
      } },
    para: { name: 'Paraphrase', hint: 'One per line: sentence => correct answer. Several correct answers: separate with |. Put a key word in CAPITALS in brackets if you like: (MIND).', sample: 'I don’t care whether we go or not. (MIND) => I don’t mind whether we go or not | I don’t mind if we go or not\nIt’s possible that she missed the train. (MAY) => She may have missed the train',
      build: function (txt, title, y0) { return typedBuild(txt, title, y0, 'Rewrite the sentence:'); } },
    fix: { name: 'Correct the mistake', hint: 'One per line: sentence with a mistake => corrected sentence (several correct versions with |).', sample: 'She is agree with me. => She agrees with me\nI am living here since 2019. => I have been living here since 2019 | I have lived here since 2019',
      build: function (txt, title, y0) { return typedBuild(txt, title, y0, 'Find and correct the mistake:'); } },
    dialog: { name: 'Dialogue with gaps', hint: 'One line per speech bubble: “Name: text with [gaps]”. Speakers take turns left and right. Extra words: “Extra: word, word”.', sample: 'Anna: Hi! [How] was your weekend?\nMax: Great, thanks. I finally [took] up yoga.\nAnna: Good for you! Did it [live up] to your expectations?\nMax: Totally. I’m [hooked].\nExtra: made, look',
      build: function (txt, title, y0) {
        var lines = txt.split('\n').map(function (s) { return s.trim(); }).filter(Boolean), extra = [], els = [], y = y0, words = [], who = [];
        lines = lines.filter(function (l) { var m = /^(extra|лишние)\s*:(.*)$/i.exec(l); if (m) { extra = m[2].split(',').map(function (s) { return s.trim(); }).filter(Boolean); return false; } return true; });
        if (title) { els.push(titleEl(title, y)); y += 56; }
        var bw = Math.min(760, AW * 0.62), cols = ['#FFF1A8', '#C3DAF7', '#FFD2B0', '#BFE8D2'];
        lines.forEach(function (l) {
          var m = /^([^:]{1,30}):\s*(.*)$/.exec(l), name = m ? m[1].trim() : '', body = m ? m[2] : l;
          var k = who.indexOf(name); if (k < 0) { who.push(name); k = who.length - 1; }
          var right = k % 2 === 1, x = right ? AX + AW - bw : AX, sid = rid(), g = parseGaps(body, sid);
          var sent = { id: sid, type: 'sentence', x: x + 34, y: y + 40, w: bw - 68, size: 20, parts: g.parts }, h = estLines(sent) * 20 * 2.2 + 64;
          els.push({ id: rid(), type: 'shape', shape: 'speech', x: x, y: y, w: bw, h: h + 26, fill: cols[k % cols.length], stroke: '#2E2F25', sw: 0, text: '', size: 16 });
          if (name) els.push(Object.assign(textEl(name, y + 10, 16, { bold: true, w: bw - 68 }), { x: x + 34 }));
          els.push(sent); y += h + 44;
          g.answers.forEach(function (a) { words.push({ text: a }); });
        });
        if (!lines.length) throw new Error('Write lines like “Anna: Hi! [How] are you?”');
        extra.forEach(function (x) { words.push({ text: x }); });
        var bk = bank(shuffle(words), AX, y, AW); return { els: els.concat(bk.cards), bottom: bk.bottom };
      } },
    rank: { name: 'Put in order / rank', hint: 'Lines in the correct order (sentences or words). For ranking where there is no single right order, tick the box below — students just arrange.', opts: '<label class="c"><input type="checkbox" id="optRank"> Ranking — no single right order (no checking)</label><label class="f">Top label<input id="optTop" placeholder="e.g. Most important"></label><label class="f">Bottom label<input id="optBottom" placeholder="e.g. Least important"></label>', sample: 'Wake up and check your phone.\nMake a cup of coffee.\nAnswer the most urgent emails.\nStart deep work.',
      build: function (txt, title, y0) {
        var lines = txt.split('\n').map(function (s) { return s.trim(); }).filter(Boolean), els = [], y = y0;
        if (!lines.length) throw new Error('Write at least two lines');
        if (title) { els.push(titleEl(title, y)); y += 56; }
        if (TPLOPT.top) { els.push(textEl('▲ ' + TPLOPT.top, y, 18, { bold: true, fc: '#7D8A68' })); y += 36; }
        var cards = [];
        lines.forEach(function (l, i) {
          var sid = rid(), slot = sid + 's1', parts = [(i + 1) + '. ', { slot: slot, answer: TPLOPT.rank ? '' : l }];
          els.push({ id: sid, type: 'sentence', x: AX, y: y, w: AW, size: 20, parts: parts }); y += 58;
          cards.push({ text: l });
        });
        if (TPLOPT.bottom) { els.push(textEl('▼ ' + TPLOPT.bottom, y, 18, { bold: true, fc: '#7D8A68' })); y += 40; }
        var bk = bank(shuffle(cards), AX, y + 10, AW); return { els: els.concat(bk.cards), bottom: bk.bottom };
      } },
    order: { name: 'Build the sentence', hint: 'One correct sentence per line. Keep a phrase together with [brackets].', sample: 'Kindness needs to start with yourself.\nPut your own [oxygen mask] on first.',
      build: function (txt, title, y0) {
        var lines = txt.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!lines.length) throw new Error('Type at least one sentence');
        var els = [], y = y0, all = []; if (title) { els.push(titleEl(title, y)); y += 56; }
        lines.forEach(function (l, i) {
          var tokens = [], re = /\[([^\]]+)\]|(\S+)/g, m; while ((m = re.exec(l))) tokens.push((m[1] || m[2]).trim());
          var sid = rid(), parts = [(i + 1) + '. ']; tokens.forEach(function (t, k) { parts.push({ slot: sid + 's' + (k + 1), answer: t }); if (k < tokens.length - 1) parts.push(' '); });
          var wide = tokens.reduce(function (a, t) { return a + Math.max(3, t.length * 0.62 + 1.6) * 22 + 12; }, 40);
          els.push({ id: sid, type: 'sentence', x: AX, y: y, w: AW, size: 22, parts: parts }); y += Math.max(1, Math.ceil(wide / AW)) * 22 * 2.2 + 16;
          var bk = bank(shuffle(tokens.map(function (t) { return { text: t }; })), AX + 30, y, AW - 60); all = all.concat(bk.cards); y = bk.bottom + 30;
        });
        return { els: els.concat(all), bottom: y };
      } }
  };
  function typedBuild(txt, title, y0, lead) {
    var lines = txt.split('\n').map(function (s) { return s.trim(); }).filter(Boolean), els = [], y = y0;
    if (title) { els.push(titleEl(title, y)); y += 56; }
    lines.forEach(function (l, i) {
      var m = /^(.*?)=>(.*)$/.exec(l); if (!m) return;
      var src = m[1].trim(), answers = m[2].split('|').map(function (x) { return x.trim(); }).filter(Boolean);
      els.push(inputEl((i + 1) + '. ' + src, answers, y)); y += 120;
    });
    if (!els.length || (title && els.length === 1)) throw new Error('Write lines like “sentence => answer”');
    return { els: els, bottom: y };
  }
  var tplKey = 'gaps';
  function renderTpl() {
    $('#tplPanel h2').textContent = 'Auto-checked tasks';
    var f = sel.length === 1 && find(sel[0]), fr = f && f.type === 'frame' ? f : null, T = TEMPLATES[tplKey];
    $('#tplBody').innerHTML = '<p class="hint">Students drag the cards and press Check. Answers are checked automatically.</p>' +
      '<div class="btns">' + Object.keys(TEMPLATES).map(function (k) { return '<button class="pb' + (k === tplKey ? ' on' : '') + '" data-tk="' + k + '" type="button">' + esc(TEMPLATES[k].name) + '</button>'; }).join('') + '</div>' +
      '<p class="hint">' + esc(T.hint) + '</p>' +
      '<label class="f">Instruction<input id="tplTitle" placeholder="e.g. Fill in the gaps"></label>' +
      '<label class="f">Content<textarea id="tplText" rows="9">' + esc(T.sample) + '</textarea></label>' + (T.opts || '') +
      (fr ? '<p class="hint">Goes inside the frame “' + esc(fr.title) + '”.</p>' : '<label class="c"><input type="checkbox" id="tplFrame"> Put it in a new frame</label><p class="hint" style="margin-top:-4px">Tip: select a frame first — the task goes inside it.</p>') +
      '<button class="pb solid" id="tplGo" type="button">Add to board</button>';
  }
  $('#tplBody').addEventListener('click', function (ev) {
    var k = ev.target.closest('[data-tk]'); if (k) { tplKey = k.dataset.tk; renderTpl(); return; }
    if (ev.target.id !== 'tplGo') return;
    try {
      var f = sel.length === 1 && find(sel[0]), fr = f && f.type === 'frame' ? f : null;
      var title = v('tplTitle').trim(), y0, out, grow = null, nf = null;
      if (fr) {
        var inner = children(fr);
        y0 = Math.max(fr.y + 40, inner.length ? Math.max.apply(null, inner.map(function (x) { var b = boxOf(x); return b.y + b.h; })) + 50 : 0);
        AX = fr.x + 40; AW = fr.w - 80;
      } else {
        var bb = B.elements.length ? bbox() : { x: 0, y: 0, w: 0, h: -120 };
        AX = bb.x + 40; AW = 1480; y0 = bb.y + bb.h + 180;
        if (chk('tplFrame')) nf = { id: rid(), type: 'frame', x: AX - 40, y: y0 - 40, w: AW + 80, h: 400, title: title || TEMPLATES[tplKey].name };
      }
      TPLOPT = { letter: !!chk('optLetter'), rank: !!chk('optRank'), top: v('optTop') || '', bottom: v('optBottom') || '' };
      var r = TEMPLATES[tplKey].build(v('tplText'), nf ? '' : title, y0);
      out = r.els;
      var tkid = rid(); out.forEach(function (x) { if (x.type !== 'frame') x.tk = tkid; });   // одно задание — одна кнопка Check
      if (fr && r.bottom + 40 > fr.y + fr.h) grow = { id: fr.id, h: r.bottom + 60 - fr.y };
      if (nf) { nf.h = r.bottom + 60 - nf.y; out = [nf].concat(out); }
      op({ t: 'el-many', els: out, grow: grow }, function (ok) {
        if (!ok) return;
        toast('Task added and selected — drag or use the corner handles to move or resize it all');
        var ids = out.map(function (x) { return x.id; });
        pushUndo(function () { ids.forEach(function (id) { op({ t: 'del', id: id }); }); });
        setTimeout(function () { fitTo({ x: AX - 40, y: y0 - 90, w: AW + 80, h: r.bottom - y0 + 140 }); select(nf ? [nf.id] : ids.filter(find)); $('#tplPanel').hidden = true; }, 200);
      });
    } catch (err) { toast(err.message); }
  });

  /* ---------- board settings ---------- */

  /* горячие клавиши: таблица «клавиши — действие», а не сплошной текст */
  function keysHtml() {
    var G = [
      ['Tools', [['V', 'Select'], ['H or Space', 'Pan (move around)'], ['P', 'Pen'], ['E', 'Eraser'], ['N', 'Sticky note'], ['T', 'Text'], ['S', 'Shape'], ['L', 'Connector'], ['F', 'Frame']]],
      ['Edit', [['Ctrl C / Ctrl V', 'Copy and paste (also between boards)'], ['Ctrl D', 'Duplicate'], ['Ctrl G', 'Group'], ['Ctrl Shift G', 'Ungroup'], ['Ctrl Z', 'Undo'], ['Delete', 'Delete'], ['Arrows', 'Nudge'], ['PgUp / PgDn', 'Bring to front / send to back'], ['Alt + drag', 'Turn off snapping']]],
      ['View', [['Mouse wheel', 'Zoom'], ['Trackpad', 'Scroll to pan, pinch to zoom'], ['Shift 1', 'Fit everything'], ['Shift 0', 'Zoom 100%']]]
    ];
    return G.map(function (g) {
      return '<div class="lbl">' + g[0] + '</div><div class="kbl">' + g[1].map(function (r) {
        return '<div class="kbr"><span class="kbk">' + r[0].split(' ').map(function (k) { return /^(or|\/|\+|and)$/.test(k) ? '<i>' + k + '</i>' : '<kbd>' + esc(k) + '</kbd>'; }).join(' ') + '</span><span class="kbd">' + esc(r[1]) + '</span></div>';
      }).join('') + '</div>';
    }).join('') + '<div class="lbl">Good to know</div><ul class="kbtips"><li>Click a sticky, text or shape and just type.</li><li>Select words to make them bold, coloured or highlighted.</li><li>Paste screenshots or images straight onto the board.</li><li>Text copied from Miro becomes sticky notes.</li></ul>';
  }
  function renderBoardPanel() {
    var wasOpen = {}; $$('#boardBody details[data-sec]').forEach(function (d) { wasOpen[d.dataset.sec] = d.open; });
    $('#boardBody').innerHTML =
      '<label class="f">Board name<input id="bTitle" value="' + esc(B.title) + '"></label>' +
      '<div class="lbl">Background</div><div class="sws">' + BGS.map(function (c) { return '<button class="sw' + ((B.bg || '#F7F7F5') === c ? ' cur' : '') + '" data-bg="' + c + '" style="--c:' + c + '" type="button" title="' + c + '"></button>'; }).join('') + '</div>' +
      '<div class="lbl">Grid</div><div class="btns">' + [['dots', 'Dots'], ['lines', 'Lines'], ['none', 'None']].map(function (g) { return '<button class="pb' + ((B.grid || 'dots') === g[0] ? ' on' : '') + '" data-grid="' + g[0] + '" type="button">' + g[1] + '</button>'; }).join('') + '</div>' +
      '<details class="bset" data-sec="all"><summary>Settings</summary><details class="bset sub" data-sec="stu"><summary>Students and copying</summary>' +
      (ME && ME.owner ? '<div class="lbl">Copying from this board</div><div class="cpopt">' + [['platform', 'Only to boards of this platform', 'Default. Ctrl+C / Ctrl+V works between boards here.'], ['any', 'To different boards', 'Copying works between different boards — pictures and audio go too.'], ['none', 'Not allowed', 'Students and other teachers can’t copy anything from this board.']].map(function (o) { return '<label class="c"><input type="radio" name="bCopy" value="' + o[0] + '"' + ((B.copy || 'platform') === o[0] ? ' checked' : '') + '> <span><b>' + o[1] + '</b><br><span class="hint">' + o[2] + '</span></span></label>'; }).join('') + '</div><p class="hint">You as the owner can always copy.</p>' : '') +
      '<div class="lbl">What students can do</div><label class="c"><input type="checkbox" id="bEdit"' + (B.studentEdit !== false ? ' checked' : '') + '> Edit, move and delete everything that isn’t locked</label><p class="hint">Lock what must stay as it is (padlock on the toolbar). Off: students change only their own stickies, pictures and drawings.</p>' +
      '<div class="lbl">Anonymous stickies</div><div class="btns">' + [['off', 'Off'], ['on', 'On — names hidden'], ['hide', 'On + hidden until I reveal'], ['priv', 'Private mode — text hidden until I reveal']].map(function (a) { var cur = !B.anon || !B.anon.on ? 'off' : B.anon.priv ? 'priv' : B.anon.hide ? 'hide' : 'on'; return '<button class="pb' + (cur === a[0] ? ' on' : '') + '" data-anon="' + a[0] + '" type="button">' + a[1] + '</button>'; }).join('') + '</div>' +
      '<p class="hint">New stickies from students are written anonymously: nobody, including you, sees who wrote them. With “hidden until I reveal” students see only their own stickies until you switch to “On — names hidden”. <b>Private mode</b> (like in Miro): everyone sees that stickies and shapes exist, but not what is written in them, except their own. Switch it off to show all the text — without names.</p>' +
      '</details><details class="bset sub" data-sec="exp"><summary>Export and reset</summary>' +
      '<div class="lbl">Export</div><div class="btns"><button class="pb" id="bPdf" type="button">Save as PDF (one page per frame)</button></div>' +
      '<div class="lbl">Whole board</div><div class="btns"><button class="pb" id="bSaveTpl" type="button">Save current layout as the start</button><button class="pb" id="bReset" type="button">Back to the start layout</button><button class="pb" id="bClearInk" type="button">Erase all drawings</button></div>' +
      '<p class="hint">For one lesson, select its frame and use More settings → Reset answers.</p>' +
      '</details><details class="bset sub" data-sec="bk"><summary>Backups and file</summary>' +
      '<div class="lbl" id="bkList">Backups</div><p class="hint">The board saves a copy by itself every few hours of work (the last 30 are kept). Restoring keeps a copy of the current state too.</p><div class="btns"><button class="pb" id="bkNow" type="button">Make a backup now</button></div><div id="bkItems" class="hint">Loading…</div>' +
      '<div class="lbl">File</div><div class="btns"><a class="pb" href="/api/t/boards/' + BOARD_ID + '/export" target="_blank" rel="noopener">Download (JSON)</a><label class="pb">Replace from file<input type="file" accept=".json,application/json" id="bImport" hidden></label></div>' +
      '</details><details class="bset sub" data-sec="keys"><summary>Shortcuts</summary>' +
            keysHtml() + '</details></details>';
    Object.keys(wasOpen).forEach(function (k) { var d = $('#boardBody details[data-sec="' + k + '"]'); if (d) d.open = wasOpen[k]; });
  }
  function loadBackups() {
    api('GET', '/api/t/boards/' + BOARD_ID + '/backups').then(function (list) {
      var box = $('#bkItems'); if (!box) return;
      box.innerHTML = list.length ? list.slice(0, 30).map(function (b) { return '<div class="bkrow"><span>' + new Date(b.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</span><button class="pb" data-bk="' + b.id + '" type="button">Restore</button></div>'; }).join('') : 'No backups yet — they appear after some work on the board.';
    }).catch(function () {});
  }
  $('#boardBody').addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.id === 'bkNow') { api('POST', '/api/t/boards/' + BOARD_ID + '/backups').then(function () { toast('Backup saved'); loadBackups(); }); return; }
    if (t.dataset.bk) { if (confirm('Put the board back to this version? The current state is saved as a backup first.')) api('POST', '/api/t/boards/' + BOARD_ID + '/restore', { version: t.dataset.bk }).then(function () { toast('Board restored'); setTimeout(loadBackups, 500); }).catch(function (err) { toast(err.message); }); return; }
    if (t.id === 'bPdf') { exportPdf(); return; }
    if (t.dataset.anon) { var m = t.dataset.anon; op({ t: 'anon', on: m !== 'off', hide: m === 'hide', priv: m === 'priv' }, function () { setTimeout(renderBoardPanel, 150); }); return; }
    if (t.dataset.bg) { op({ t: 'meta', bg: t.dataset.bg === '#F7F7F5' ? '' : t.dataset.bg }, function () { setTimeout(renderBoardPanel, 150); }); return; }
    if (t.dataset.grid) { op({ t: 'meta', grid: t.dataset.grid }, function () { setTimeout(renderBoardPanel, 150); }); return; }
    if (t.id === 'bSaveTpl') op({ t: 'save-template' }, function (ok) { if (ok) toast('Start layout saved'); });
    if (t.id === 'bReset' && confirm('Put the whole board back to its start layout?')) op({ t: 'reset', ink: confirm('Also erase all drawings?') });
    if (t.id === 'bClearInk' && confirm('Erase every drawing on the board?')) op({ t: 'clear-ink' });
  });
  $('#boardBody').addEventListener('change', async function (ev) {
    var t = ev.target;
    if (t.name === 'bCopy') { op({ t: 'perm', copy: t.value }); toast(t.value === 'none' ? 'Copying from this board is turned off' : t.value === 'any' ? 'Copying to different boards is allowed' : 'Copying only within this platform'); return; }
    if (t.id === 'bEdit') { op({ t: 'perm', studentEdit: t.checked }); toast(t.checked ? 'Students can edit everything that isn’t locked' : 'Students change only their own things'); return; }
    if (t.id === 'bTitle') op({ t: 'meta', title: t.value });
    if (t.id === 'bImport' && t.files[0]) {
      try { var data = JSON.parse(await t.files[0].text()); if (!confirm('Replace everything on this board with the file?')) return; await api('PATCH', '/api/t/exercises/' + BOARD_ID, { board: data }); toast('Board replaced'); setTimeout(fit, 300); }
      catch (err) { toast('Could not read the file: ' + err.message); }
      t.value = '';
    }
  });

  /* ---------- copy to another board ---------- */
  async function openSend() {
    if (!sel.length) return;
    var ids = sel.slice();
    openPanel('sendPanel');
    $('#sendBody').innerHTML = '<p class="hint">Loading boards…</p>';
    try {
      var list = (await api('GET', '/api/t/boards')).filter(function (b) { return b.id !== BOARD_ID; });
      $('#sendBody').dataset.ids = ids.join(',');
      $('#sendBody').innerHTML = '<p class="hint">' + ids.length + ' item' + (ids.length > 1 ? 's' : '') + ' (frames with everything inside) will be copied below everything on the board you pick.</p>' +
        (list.length ? list.map(function (b) { return '<button class="navitem" data-send="' + b.id + '" type="button"><span class="nt">' + esc(b.title) + '</span><span class="sm">' + esc(b.where) + '</span></button>'; }).join('') : '<p class="hint">No other boards yet.</p>') +
        '<p class="hint">Or: Ctrl+C here, then Ctrl+V on the other board.</p>';
      $('#sendBody').dataset.ids = ids.join(',');
    } catch (err) { $('#sendBody').innerHTML = '<p class="hint">' + esc(err.message) + '</p>'; }
  }
  $('#sendBody').addEventListener('click', async function (ev) {
    var b = ev.target.closest('[data-send]'); if (!b) return;
    var set = collect(($('#sendBody').dataset.ids || '').split(',').filter(Boolean));
    try { var r = await api('POST', '/api/t/boards/' + b.dataset.send + '/paste', { els: set.els, strokes: set.strokes }); toast('Copied ' + r.count + ' items'); $('#sendPanel').hidden = true; }
    catch (err) { toast(err.message); }
  });

  /* ---------- audio & video ---------- */
  /* ---------- голосовое сообщение прямо с доски (ученик и учитель) ---------- */
  var rec = null;
  async function startVoice() {
    if (rec) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('This browser can’t record sound — try Chrome or Safari'); return; }
    var stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { toast('Allow the microphone in the browser to record a voice message'); return; }
    var mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(function (m) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m); }) || '';
    var mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream), chunks = [], t0 = Date.now(), at = viewCenter();
    var bar = document.createElement('div'); bar.className = 'recbar';
    bar.innerHTML = '<span class="rdot"></span><b class="rtime">0:00</b><span class="rlbl">Recording…</span><button class="pbn wide" data-r="stop" type="button">Stop and add</button><button class="pbn" data-r="cancel" type="button" aria-label="Cancel">✕</button>';
    vp.appendChild(bar);
    rec = { mr: mr, stream: stream, bar: bar, cancel: false, tick: setInterval(function () { var sec = Math.floor((Date.now() - t0) / 1000); $('.rtime', bar).textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); if (sec >= 180) stopVoice(false); }, 250) };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = function () {
      var r0 = rec; rec = null; clearInterval(r0.tick); r0.stream.getTracks().forEach(function (t) { t.stop(); }); r0.bar.remove();
      if (r0.cancel || !chunks.length) return;
      var type = (mr.mimeType || chunks[0].type || 'audio/webm').split(';')[0], ext = /mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
      var who = ME && ME.name ? ME.name.split(' ')[0] : 'Voice';
      addMediaFile(new File(chunks, 'voice.' + ext, { type: type }), at, '🎙 ' + who + ' · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    bar.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    bar.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) stopVoice(b.dataset.r === 'cancel'); });
    mr.start(250);
  }
  function stopVoice(cancel) { if (!rec) return; rec.cancel = cancel; try { rec.mr.stop(); } catch (e) {} }
  async function addMediaFile(f, at, title0) {
    if (f.size > 40e6) { toast('The file is bigger than 40 MB'); return; }
    var type = f.type || ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' })[(f.name.split('.').pop() || '').toLowerCase()] || '';
    toast('Uploading ' + f.name + '…');
    try {
      var r = await fetch('/api/media', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': type }, body: f });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      var vid = d.kind === 'video', el = { id: rid(), type: 'media', kind: d.kind, src: d.url, title: (title0 || f.name.replace(/\.[^.]+$/, '')).slice(0, 120), w: vid ? 480 : 380, h: vid ? 300 : 84 };
      el.x = Math.round(at.x - el.w / 2); el.y = Math.round(at.y - el.h / 2); freeSpot(el);
      op({ t: 'add', el: el }, function (ok) { if (ok) { pushUndo(function () { op({ t: 'del', id: el.id }); }); setTimeout(function () { select([el.id]); }, 120); } });
    } catch (err) { toast(err.message); }
  }

  /* ---------- my templates ---------- */
  var TPLS = [], tplTag = '', tplQ = '';
  async function renderMyTpl(keep) {
    var body = $('#mytplBody');
    if (!keep) { body.innerHTML = '<p class="hint">Loading…</p>'; try { TPLS = await api('GET', '/api/t/templates'); } catch (err) { body.innerHTML = '<p class="hint">' + esc(err.message) + '</p>'; return; } }
    var cnt = {}; TPLS.forEach(function (t) { (t.tags || []).forEach(function (g) { cnt[g] = (cnt[g] || 0) + 1; }); });
    var tags = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || a.localeCompare(b); });
    var q = tplQ.trim().toLowerCase();
    var list = TPLS.filter(function (t) { return (!tplTag || (t.tags || []).indexOf(tplTag) >= 0) && (!q || t.title.toLowerCase().indexOf(q) >= 0 || (t.tags || []).some(function (g) { return g.indexOf(q) >= 0; })); });
    var ico = function (n) { return svg(n).replace('<svg', '<svg style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7"'); };
    body.innerHTML = '<input id="tplQ" class="tin" type="search" placeholder="Search by name or tag" value="' + esc(tplQ) + '">' +
      (tags.length ? '<div class="tagcloud"><button class="tagc' + (tplTag ? '' : ' on') + '" data-ftg="" type="button">All <i>' + TPLS.length + '</i></button>' + tags.map(function (g) { return '<button class="tagc' + (tplTag === g ? ' on' : '') + '" data-ftg="' + esc(g) + '" type="button">#' + esc(g) + ' <i>' + cnt[g] + '</i></button>'; }).join('') + '</div>' : '') +
      (list.length ? list.map(function (t) { return '<div class="navrow tplrow"><button class="navitem" data-tins="' + t.id + '" type="button"><span class="nt">' + esc(t.title) + '</span><span class="sm">' + t.count + ' items · ' + ago(t.at) + '</span>' + ((t.tags || []).length ? '<span class="ttags">' + t.tags.map(function (g) { return '#' + esc(g); }).join(' ') + '</span>' : '') + '</button><button class="hbtn" data-tedit="' + t.id + '" type="button" data-tip="Edit tags">' + ico('tags') + '</button><button class="hbtn" data-tdel="' + t.id + '" type="button" data-tip="Delete template">' + ico('trash') + '</button></div>'; }).join('') : '<p class="hint">' + (TPLS.length ? 'Nothing found.' : 'No templates yet.') + '</p>') +
      '<p class="hint">Save a frame (frame → ⋯ → Save frame as template) or any selected tasks (⋯ → Save as template) — add tags like <i>grammar, warm-up, B1</i> to find ideas fast. Templates are shared between all your boards.</p>';
    var qi = $('#tplQ'); qi.oninput = function () { tplQ = this.value; var p0 = this.selectionStart; renderMyTpl(true); var n2 = $('#tplQ'); n2.focus(); try { n2.setSelectionRange(p0, p0); } catch (e) {} }; qi.onkeydown = function (e) { e.stopPropagation(); };
  }
  $('#mytplBody').addEventListener('click', async function (ev) {
    var ft = ev.target.closest('[data-ftg]'); if (ft) { tplTag = ft.dataset.ftg; renderMyTpl(true); return; }
    var te = ev.target.closest('[data-tedit]');
    if (te) { var tt = TPLS.find(function (x) { return x.id === te.dataset.tedit; }); var nv = prompt('Tags for «' + tt.title + '» — comma separated', (tt.tags || []).join(', ')); if (nv == null) return; try { var r = await api('PATCH', '/api/t/templates/' + tt.id, { tags: nv }); tt.tags = r.tags; renderMyTpl(true); } catch (err) { toast(err.message); } return; }
    var i = ev.target.closest('[data-tins]'), d = ev.target.closest('[data-tdel]');
    if (d) { if (confirm('Delete this template?')) { await api('DELETE', '/api/t/templates/' + d.dataset.tdel); renderMyTpl(); } return; }
    if (!i) return;
    try {
      var t = await api('GET', '/api/t/templates/' + i.dataset.tins);
      var m = minXY(t.els), bb = B.elements.length ? bbox() : { x: 0, y: 0, w: 0, h: -160 };
      var tx = bb.x, ty = bb.y + bb.h + 160;
      var u = union(t.els.map(elBox));
      pasteSet({ els: t.els, strokes: t.strokes || [] }, tx - m.x, ty - m.y);
      setTimeout(function () { fitTo({ x: tx - 60, y: ty - 80, w: u.w + 120, h: u.h + 140 }); }, 250);
      if (narrow()) $('#mytplPanel').hidden = true;
    } catch (err) { toast(err.message); }
  });

  /* ---------- notes: class notes (teacher writes, everyone reads) and my notes ---------- */
  var notesTab = 'all', notesWho = 'me', notesEd = null;
  function openNotes() {
    $('#notesTabs').innerHTML = '<button type="button" data-ntab="all" class="' + (notesTab === 'all' ? 'on' : '') + '">Class notes</button><button type="button" data-ntab="me" class="' + (notesTab === 'me' ? 'on' : '') + '">' + (isT() ? 'Private' : 'My notes') + '</button>';
    $('#notesWhoRow').hidden = !(isT() && notesTab === 'me');
    if (isT()) { var se = $('#notesWho'); se.innerHTML = '<option value="me">My private notes</option>' + ROSTER.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + '’s notes</option>'; }).join(''); se.value = notesWho; }
    loadNotes();
  }
  function loadNotes() {
    var kind = notesTab === 'all' ? 'all' : (isT() ? notesWho : 'me'), ro = kind === 'all' && !isT();
    notesEd = makeNotes($('#notesEd'), { placeholder: kind === 'all' ? (isT() ? 'Write here for the whole class: new words, rules, links. Everyone sees it live.' : 'Your teacher hasn’t written anything here yet.') : kind === 'me' ? 'Your own notes — only you' + (isT() ? '' : ' and your teacher') + ' can see them.' : 'The student hasn’t written anything yet. You can add a comment.', onChange: function (html) { if (!ro) socket.emit('bdoc:set', { kind: kind, html: html }); } });
    if (ro) { notesEd.el.contentEditable = 'false'; $('#notesEd .ntools').hidden = true; }
    socket.emit('bdoc:get', { kind: kind }, function (r) { if (notesEd) notesEd.set((r && r.html) || ''); });
    $('#notesEd').dataset.kind = kind;
  }
  $('#notesTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-ntab]'); if (!b) return; notesTab = b.dataset.ntab; openNotes(); });
  $('#notesWho').addEventListener('change', function () { notesWho = this.value; loadNotes(); });
  $('#notesBtn').onclick = function () { togglePanel('notesPanel'); };
  $('#balBtn').onclick = function () { togglePanel('journalPanel'); };
  var QL = [];
  function loadQuickLinks() { if (!isT()) return; api('GET', '/api/t/links').then(function (ls) { QL = ls || []; $('#linksBtn').hidden = !QL.length; }).catch(function () {}); }
  $('#linksBtn').onclick = function () {
    var b = this;
    ctxPop(QL.map(function (l, i) { var host = ''; try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch (e) {} return '<button class="mi" data-v="' + i + '" type="button"><span style="flex:1;text-align:left">' + esc(l.title) + '</span><span class="kbd">' + esc(host) + '</span></button>'; }).join('') +
      '<div class="lbl" style="margin:6px 8px 2px;font-weight:400">Add or change links: cabinet → Platform settings</div>', b, function (v) { var l = QL[Number(v)]; if (l) window.open(l.url, '_blank', 'noopener'); }, false, 'menu');
  };
  socket.on('bdoc', function (d) { if (!$('#notesPanel').hidden && notesEd && $('#notesEd').dataset.kind === d.kind && document.activeElement !== notesEd.el) notesEd.set(d.html); });
  socket.on('doc', function (d) { if (d.exerciseId === BOARD_ID && d.studentId === notesWho && d.by === 's' && notesEd && !$('#notesPanel').hidden) notesEd.set(d.html); });
  $('#notesPdf').onclick = function () {
    var html = notesEd ? notesEd.el.innerHTML : '', title = (notesTab === 'all' ? 'Class notes' : 'My notes') + ' — ' + B.title;
    var w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to save the notes'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>body{font:15px/1.6 Manrope,Inter,system-ui,sans-serif;color:#2E2F25;max-width:720px;margin:40px auto;padding:0 24px}h1{font:600 22px Unbounded,Manrope,sans-serif;margin:0 0 4px}.d{color:#86826F;font-size:13px;margin-bottom:24px}mark{border-radius:3px;padding:0 2px}mark.h1{background:#FFF07A}mark.h2{background:#C8F5B4}mark.h3{background:#BFE3FF}mark.h4{background:#FFC9E0}mark.h5{background:#FFD8A8}</style></head><body><h1>' + esc(title) + '</h1><div class="d">' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '</div>' + html + '</body></html>');
    w.document.close(); setTimeout(function () { w.focus(); w.print(); }, 300);
  };

  /* ---------- lesson: start, end, exit ticket ---------- */
  function renderLesson() {
    var c = $('#lessonChip'); if (!c || !B) return;
    var L = B.lesson;
    c.hidden = !L;
    if (L) { c.textContent = (isT() ? 'Lesson on · ' : 'Lesson · ') + L.title + (isT() ? ' · End' : ''); c.dataset.tip = isT() ? 'End the lesson and send the exit ticket' : 'The lesson is on'; }
    if (!isT() && B.exit && Date.now() + SKEW - B.exit.at < 86400e3) {
      var done = false; try { done = !!localStorage.getItem('klass.exit.' + B.exit.id); } catch (e) {}
      if (!done && !exitShown[B.exit.id]) { exitShown[B.exit.id] = 1; openExit(); }
    }
  }
  var exitShown = {}, exitDone = {};
  $('#exitChip').onclick = openExit;
  document.querySelector('[data-close="exitPanel"]').addEventListener('click', function () { if (B && B.exit && !exitDone[B.exit.id]) $('#exitChip').hidden = false; });
  $('#lessonChip').onclick = function () { if (!isT() || !B.lesson) return; var f = find(B.lesson.frame); endLessonDialog(f); };
  function lessonMaterial(f) {
    var inside = f ? children(f) : B.elements, words = [], acts = [];
    inside.forEach(function (x) {
      if (x.type === 'card' && x.text && words.indexOf(x.text) < 0) words.push(x.text);
      if (x.type === 'sentence') x.parts.forEach(function (p) { if (p && p.answer && words.indexOf(p.answer) < 0) words.push(p.answer); });
      if ((x.type === 'text' && (x.bold || x.size >= 24)) || (x.type === 'frame')) { var t = (x.text || x.title || '').trim().split('\n')[0]; if (t && t.length < 120 && acts.indexOf(t) < 0) acts.push(t); }
    });
    B.elements.forEach(function (x) { if (x.type === 'frame' && f && framesOf(x)[0] === f) { var t = (x.title || '').trim(); if (t && acts.indexOf(t) < 0) acts.push(t); } });
    return { words: words.slice(0, 60), acts: acts.slice(0, 20) };
  }
  function endLessonDialog(f) {
    if (!confirm('End the lesson? Every student gets an exit ticket: they write the new language and the ideas they liked.')) return;
    op({ t: 'lesson-end', title: f ? f.title : (B.lesson && B.lesson.title) || B.title }, function (ok) { if (ok) toast('Exit ticket sent'); });
  }
  function openExit() {
    var X = B.exit; if (!X) return;
    $('#exitPanel').hidden = false; $('#exitChip').hidden = true; $('#exitPanel h2').textContent = 'Exit ticket';
    $('#exitBody').innerHTML = '<p class="hint">' + esc(X.title) + '. You can zoom around the board or open Notes while you write.</p>' +
      '<label class="f"><b>New language from today’s lesson</b><span class="hint">Words, phrases, chunks — one per line</span><textarea id="xWords" rows="7" placeholder="take at face value&#10;a tipping point"></textarea></label>' +
      '<label class="f"><b>Ideas, strategies, activities I liked</b><span class="hint">One per line</span><textarea id="xFav" rows="5" placeholder="Learning words in chunks"></textarea></label>' +
      '<label class="f">Anything to tell the teacher<textarea id="xComment" rows="2"></textarea></label>' +
      '<button class="pb solid" id="xGo" type="button">Send</button>';
    setTimeout(function () { var t = $('#xWords'); if (t) t.focus(); }, 100);
    $('#xWords').addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    $('#xFav').addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    $('#xGo').onclick = function () {
      var lines = function (id) { return $('#' + id).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
      socket.emit('b:exit-submit', { id: X.id, words: [], extra: lines('xWords'), fav: [], favExtra: lines('xFav'), comment: $('#xComment').value }, function (ok) {
        if (!ok) { toast('Could not send — try again'); return; }
        try { localStorage.setItem('klass.exit.' + X.id, '1'); } catch (e) {}
        exitDone[X.id] = 1; $('#exitChip').hidden = true;
        $('#exitBody').innerHTML = '<p>Thank you! ' + (ME.guest ? '' : 'Your new language is in <b>My language box</b> and your ideas in the <b>Idea bank</b> on your home page.') + '</p>';
      });
    };
  }

  /* ---------- trim audio / video ---------- */
  function fmtT(t) { t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function parseT(v) { v = String(v || '').trim(); if (!v) return 0; var p = v.split(':').map(Number); return p.length === 2 ? p[0] * 60 + p[1] : Number(v) || 0; }
  function trimDialog(e, b) {
    var node = $('#lh [data-id="' + e.id + '"]'), m = node && $('video,audio', node);
    if (!m && node && node._pl) m = { get currentTime() { return node._ct || 0; } };   // видео по ссылке: время берём из плеера
    if (node && node._pl) { node._pl.time().then(function (t) { node._ct = t; }); var tk = setInterval(function () { if (!$('#trS')) { clearInterval(tk); return; } node._pl.time().then(function (t) { node._ct = t; }); }, 400); }
    var p = ctxPop('<div class="lbl">Play only a part</div><div class="trow"><label class="chk">From <input id="trS" value="' + fmtT(e.start) + '" style="width:64px"></label><button class="cb" data-v="nowS" type="button">Use current time</button></div>' +
      '<div class="trow"><label class="chk">To <input id="trE" value="' + (e.end ? fmtT(e.end) : '') + '" placeholder="end" style="width:64px"></label><button class="cb" data-v="nowE" type="button">Use current time</button></div>' +
      '<div style="display:flex;gap:6px"><button class="pb" data-v="save" type="button">Save</button><button class="cb" data-v="clear" type="button">' + (e.type === 'video' ? 'Whole video' : 'Whole file') + '</button></div><p class="hint" style="margin:0;max-width:260px">' + (e.type === 'video' ? 'Time like 1:25. The video starts at “From” and stops at “To” for everyone. The video itself on YouTube / Kinescope stays untouched.' : 'The original file stays untouched — you can change the part any time.') + '</p>', b,
      function (v, pop) {
        if (v === 'nowS' && m) $('#trS', pop).value = fmtT(m.currentTime);
        if (v === 'nowE' && m) $('#trE', pop).value = fmtT(m.currentTime);
        if (v === 'save' || v === 'clear') { var st = v === 'clear' ? 0 : parseT($('#trS', pop).value), en = v === 'clear' ? 0 : parseT($('#trE', pop).value); if (en && en <= st) { toast('“To” must be after “From”'); return; } patchSel(function () { return { start: st || null, end: en || null }; }, [e.id]); closeCtxPop(); }
      }, true);
    return p;
  }

  /* ---------- Idea bank (students) ---------- */
  function addToIdeas() {
    var items = sel.map(find).filter(Boolean).map(function (x) {
      if (x.type === 'image') return { text: '', src: x.src };
      var t = x.type === 'sentence' ? sentenceToText(x) : x.type === 'todo' ? (x.title ? x.title + ': ' : '') + x.items.map(function (i) { return i.t; }).join('; ') : x.type === 'poll' || x.type === 'rating' || x.type === 'scale' ? x.title : x.type === 'flip' ? (x.front.text + ' — ' + x.back.text) : (x.text || x.title || '');
      return { text: String(t || '').trim() };
    }).filter(function (i) { return i.text || i.src; });
    if (!items.length) { toast('Nothing to save here'); return; }
    var p = ctxPop('<div class="lbl">Your idea in a few words <span class="hint" style="font-weight:400">(optional)</span></div><textarea id="ideaNote" rows="3" maxlength="600" placeholder="e.g. use this game to revise phrasal verbs" style="width:260px;font:inherit;border:1px solid var(--uiline);border-radius:10px;padding:8px"></textarea><div class="trow"><button class="pb solid" data-v="save" type="button">Add to Idea bank 💡</button></div>', $('#ctx [data-c=idea]') || $('#ctx'), function (v, pp) {
      if (v !== 'save') return;
      socket.emit('idea:add', { items: items, note: $('#ideaNote', pp).value }, function (ok) { toast(ok ? 'Added to your Idea bank 💡' : 'Sign in with your account to keep an Idea bank'); });
      closeCtxPop();
    }, true);
    var ta = $('#ideaNote', p); ta.focus(); ta.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
  }

  /* ---------- video by link (Kinescope, YouTube): watch together ---------- */
  var scriptCache = {};
  function loadScript(src) { return scriptCache[src] || (scriptCache[src] = new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = function () { delete scriptCache[src]; sc.remove(); rej(new Error('could not load ' + src.split('/').pop())); }; document.head.appendChild(sc); setTimeout(function () { if (!window.pdfjsLib && /pdf/.test(src)) { delete scriptCache[src]; rej(new Error('the PDF reader is taking too long to load')); } }, 30000); })); }
  function ytId(u) { var m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(u); return m ? m[1] : ''; }
  function renderVideo(e, layer) {
    var n = layer.querySelector('[data-id="' + e.id + '"]');
    if (!n || n.dataset.url !== e.url) {
      if (n) n.remove();
      n = document.createElement('div'); n.className = 'vblk'; n.dataset.id = e.id; n.dataset.url = e.url;
      n.innerHTML = '<div class="hbar" data-hbar="1"><b></b><span class="hby">play, pause and seek are shared</span></div><div class="vbox"><div id="vp_' + e.id + '"></div></div>';
      layer.appendChild(n);
      mountPlayer(n, e);
    }
    n._e = e;
    n.style.left = e.x + 'px'; n.style.top = e.y + 'px'; n.style.width = e.w + 'px'; n.style.height = e.h + 'px';
    $('b', n).textContent = (e.title || (e.provider === 'kinescope' ? 'Kinescope video' : e.provider === 'youtube' ? 'YouTube video' : 'Video')) + (e.start || e.end ? ' · ✂ ' + fmtT(e.start || 0) + '–' + (e.end ? fmtT(e.end) : 'end') : '');
    n.classList.toggle('tonlyb', !!(e.tonly && isT()));
    if (n._pl && e.play && n._at !== e.play.at) applyRemote(n, e);
  }
  function mountPlayer(n, e) {
    var box = $('#vp_' + e.id, n), fallback = function () {
      var src = e.provider === 'youtube' ? 'https://www.youtube.com/embed/' + ytId(e.url) : e.provider === 'kinescope' ? e.url.replace('kinescope.io/', 'kinescope.io/embed/').replace('/embed/embed/', '/embed/') : e.url;
      if (e.provider === 'youtube') src += '?rel=0' + (e.start ? '&start=' + Math.floor(e.start) : '') + (e.end ? '&end=' + Math.floor(e.end) : '');
      else if (e.provider === 'kinescope' && e.start) src += (src.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(e.start);
      box.outerHTML = '<iframe src="' + esc(src) + '" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe>';
      $('.hby', n).textContent = 'shared controls unavailable';
    };
    var hooks = function (pl) {
      n._pl = pl;
      var send = function (on) { if (n._applying) return; pl.time().then(function (t) { n._sent = Date.now(); op({ t: 'msync', id: e.id, on: on, t: Math.round(t * 10) / 10 }); }); };
      pl.onPlay = function () { send(true); }; pl.onPause = function () { send(false); }; pl.onSeek = function () { pl.playing().then(function (p) { send(p); }); };
      if (n._e && n._e.play) applyRemote(n, n._e);
      else if (n._e && n._e.start) { var sk = pl.seek(n._e.start); if (sk && sk.catch) sk.catch(function () {}); try { pl.pause(); } catch (er) {} }
      // обрезка: держим воспроизведение внутри «From — To» у всех
      clearInterval(n._clip);
      n._clip = setInterval(function () {
        if (!document.body.contains(n)) { clearInterval(n._clip); return; }
        var c = n._e || {}; if (!c.start && !c.end) return;
        pl.playing().then(function (on) {
          if (!on) return;
          pl.time().then(function (t) {
            if (c.start && t < c.start - 1) { n._applying = true; pl.seek(c.start); setTimeout(function () { n._applying = false; }, 800); }
            else if (c.end && t >= c.end) { n._applying = true; pl.pause(); pl.seek(c.start || 0); setTimeout(function () { n._applying = false; }, 800); }
          });
        }).catch(function () {});
      }, 400);
    };
    if (e.provider === 'youtube' && ytId(e.url)) {
      loadScript('https://www.youtube.com/iframe_api').then(function () {
        var ready = function () {
          var ip = null, pl = { time: function () { return Promise.resolve(ip.getCurrentTime()); }, playing: function () { return Promise.resolve(ip.getPlayerState() === 1); }, play: function () { ip.playVideo(); }, pause: function () { ip.pauseVideo(); }, seek: function (t) { ip.seekTo(t, true); } };
          var last = -1;
          ip = new YT.Player(box, { videoId: ytId(e.url), width: '100%', height: '100%', playerVars: { rel: 0, playsinline: 1, start: Math.floor(e.start || 0) }, events: { onReady: function () { hooks(pl); }, onStateChange: function (ev) { if (ev.data === last) return; last = ev.data; if (ev.data === 1 && pl.onPlay) pl.onPlay(); if (ev.data === 2 && pl.onPause) pl.onPause(); } } });
        };
        if (window.YT && YT.Player) ready(); else { var prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = function () { if (prev) prev(); ready(); }; }
      }).catch(fallback);
    } else if (e.provider === 'kinescope') {
      loadScript('https://player.kinescope.io/latest/iframe.player.js').then(function () {
        return Kinescope.IframePlayer.create('vp_' + e.id, { url: e.url, size: { width: '100%', height: '100%' } });
      }).then(function (kp) {
        var EV = kp.Events || {};
        var pl = { time: function () { return Promise.resolve(kp.getCurrentTime()); }, playing: function () { return Promise.resolve(kp.isPaused ? kp.isPaused().then(function (p) { return !p; }) : true); }, play: function () { return kp.play(); }, pause: function () { return kp.pause(); }, seek: function (t) { return kp.seekTo(t); } };
        if (EV.Play || EV.Playing) kp.on(EV.Play || EV.Playing, function () { if (pl.onPlay) pl.onPlay(); });
        if (EV.Pause) kp.on(EV.Pause, function () { if (pl.onPause) pl.onPause(); });
        if (EV.Seeked) kp.on(EV.Seeked, function () { if (pl.onSeek) pl.onSeek(); });
        hooks(pl);
      }).catch(fallback);
    } else fallback();
  }
  function applyRemote(n, e) {
    n._at = e.play.at;
    if (n._sent && Date.now() - n._sent < 1500) return;
    var pl = n._pl, target = e.play.t + (e.play.on ? Math.max(0, (Date.now() + SKEW - e.play.at) / 1000) : 0);
    n._applying = true;
    pl.time().then(function (t) {
      if (Math.abs(t - target) > 1.5) pl.seek(target);
      var r = e.play.on ? pl.play() : pl.pause();
      if (r && r.catch) r.catch(function () { joinHint(n, function () { pl.play(); }); });
      setTimeout(function () { n._applying = false; }, 800);
    });
  }
  function addVideoDialog() {
    var p = ctxPop('<div class="lbl">Video link</div><input id="vUrl" placeholder="https://kinescope.io/… or https://youtu.be/…" style="width:320px"><p class="hint" style="margin:0;max-width:320px">Kinescope and YouTube play in sync: when you pause, everyone pauses; when you go on, everyone goes on from the same moment.</p><button class="pb" data-v="add" type="button">Add to board</button>', $('[data-fly="widgets"]'),
      function (v, pop) {
        var u = $('#vUrl', pop).value.trim(); if (!/^https:\/\//.test(u)) { toast('Paste a link that starts with https://'); return; }
        var c = viewCenter(), el = { id: rid(), type: 'video', url: u, x: Math.round(c.x - 320), y: Math.round(c.y - 195), w: 640, h: 390, title: '' };
        var tm = /[?&#](?:t|start)=(\d+)/.exec(u); if (tm) el.start = Number(tm[1]);   // ссылка «с этой секунды» сразу задаёт начало
        freeSpot(el); closeCtxPop();
        op({ t: 'add', el: el }, function (ok) { if (ok) { pushUndo(function () { op({ t: 'del', id: el.id }); }); setTimeout(function () { select([el.id]); }, 150); } else toast('Could not add this link'); });
      }, true);
    setTimeout(function () { var i = $('#vUrl', p); if (i) i.focus(); }, 30);
  }

  /* ---------- PDF: pick pages, they become images you can draw on ---------- */
  var PDFJS = '/static/vendor/pdfjs/';   // pdf.js лежит у нас на сервере: внешние CDN в России работают нестабильно
  function pdfDialog(file0) {
    openPanel('tplPanel');
    $('#tplPanel h2').textContent = 'PDF pages';
    $('#tplBody').innerHTML = '<p class="hint">Choose a PDF, tick the pages you need — they go onto the board as pictures. Draw and underline on them: your marks move together with the page.</p><label class="pb" style="text-align:center">Choose PDF<input type="file" accept="application/pdf,.pdf" id="pdfIn" hidden></label><div id="pdfPages" class="pdfgrid"></div>';
    $('#pdfIn').onchange = function () { if (this.files[0]) openPdf(this.files[0]); };
    if (file0) openPdf(file0);
    async function openPdf(f) {
      $('#pdfPages').innerHTML = '<p class="hint">Opening…</p>';
      try {
        await loadScript(PDFJS + 'pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        var doc = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        PDFDOC = doc; var h = '';
        for (var i = 1; i <= Math.min(doc.numPages, 80); i++) h += '<label class="pdfp"><canvas data-pg="' + i + '"></canvas><span><input type="checkbox" checked value="' + i + '"> ' + i + '</span></label>';
        $('#pdfPages').innerHTML = '<div class="btns" style="grid-column:1/-1"><button class="pb" id="pdfAll" type="button">All</button><button class="pb" id="pdfNone" type="button">None</button><button class="pb solid" id="pdfAdd" type="button">Add pages to the board</button></div>' + h;
        $('#pdfAll').onclick = function () { $$('#pdfPages input').forEach(function (c) { c.checked = true; }); };
        $('#pdfNone').onclick = function () { $$('#pdfPages input').forEach(function (c) { c.checked = false; }); };
        $('#pdfAdd').onclick = addPdfPages;
        for (var j = 1; j <= Math.min(doc.numPages, 80); j++) { var pg = await doc.getPage(j), vp0 = pg.getViewport({ scale: 1 }), sc = 150 / vp0.width, vv = pg.getViewport({ scale: sc }), cv = $('#pdfPages canvas[data-pg="' + j + '"]'); if (!cv) break; cv.width = vv.width; cv.height = vv.height; await pg.render({ canvasContext: cv.getContext('2d'), viewport: vv }).promise; }
      } catch (err) { $('#pdfPages').innerHTML = '<p class="hint">Could not open this PDF' + (err && err.message ? ' (' + esc(err.message) + ')' : ' — the PDF reader did not load. Refresh the page and try again') + '.</p>'; }
    }
  }
  var PDFDOC = null;
  async function addPdfPages() {
    var pages = $$('#pdfPages input:checked').map(function (c) { return Number(c.value); }); if (!pages.length || !PDFDOC) return;
    toast('Adding ' + pages.length + ' page' + (pages.length > 1 ? 's' : '') + '…');
    var c = viewCenter(), y = c.y - 300, made = [];
    for (var i = 0; i < pages.length; i++) {
      var pg = await PDFDOC.getPage(pages[i]), v1 = pg.getViewport({ scale: 1 }), sc = Math.min(2, 1600 / v1.width), vv = pg.getViewport({ scale: sc });
      var cv = document.createElement('canvas'); cv.width = vv.width; cv.height = vv.height;
      var ctx2 = cv.getContext('2d'); ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: ctx2, viewport: vv }).promise;
      var blob = await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', 0.9); });
      try {
        var url = await uploadImage(new File([blob], 'page' + pages[i] + '.jpg', { type: 'image/jpeg' }));
        var w = 800, h = Math.round(800 * v1.height / v1.width), el = { id: rid(), type: 'image', x: Math.round(c.x - w / 2), y: Math.round(y), w: w, h: h, src: url };
        y += h + 40; made.push(el);
        op({ t: 'add', el: el });
      } catch (err) { toast(err.message); }
    }
    $('#tplPanel').hidden = true;
    setTimeout(function () { select(made.map(function (x) { return x.id; }).filter(find)); var u = union(made.map(elBox)); if (u) fitTo(u); }, 600);
    pushUndo(function () { made.forEach(function (x) { op({ t: 'del', id: x.id }); }); });
  }

  /* ---------- header menus: More, Bring to me ---------- */
  $('#moreBtn').onclick = function () {
    var T = isT();
    ctxPop('<button class="mi" data-v="timer" type="button">' + svg('timer') + 'Timer</button><button class="mi" data-v="pdf" type="button">' + svg('pdf') + 'Save as PDF</button><button class="mi" data-v="log" type="button">' + svg('notes') + 'History</button><button class="mi" data-v="blink" type="button">' + svg('linkI') + 'Copy link to this board</button><button class="mi" data-v="arrange" type="button">' + svg('hand') + 'Reset toolbar</button>' +
      (T && SHARE && SHARE.gid ? '<button class="mi" data-v="journal" type="button">' + svg('notes') + 'Journal — attendance and balance</button>' : '') +
      (T ? '<button class="mi" data-v="priv" type="button">' + svg('lock') + (B.anon && B.anon.priv ? 'Private mode is ON — reveal text' : 'Private mode (hidden anonymous text)') + '</button>' : '') +
      (T ? '<button class="mi" data-v="present" type="button">' + svg('play') + (B.present ? 'Stop presenting' : 'Present (slides by frames)') + '</button><button class="mi" data-v="rooms" type="button">' + svg('rooms') + 'Pair rooms' + (B.rooms ? ' · on' : '…') + '</button>' : '') +
      (T ? '<button class="mi" data-v="ifix" type="button">' + svg('fix') + 'Fix stretched pictures</button>' : '') + (T ? '<button class="mi" data-v="backup" type="button">' + svg('dup') + 'Backups and earlier versions</button><button class="mi" data-v="settings" type="button">' + svg('settings') + 'Board settings</button>' : ''), this,
      function (v) { if (v === 'journal') { openPanel('journalPanel'); return; } if (v === 'priv') { var pon = !(B.anon && B.anon.priv); op({ t: 'anon', on: pon, priv: pon }, function () { toast(pon ? 'Private mode is on: students write anonymously and nobody sees the others’ text' : 'Revealed: everyone sees the text, nobody sees who wrote it'); setTimeout(renderBoardPanel, 150); }); return; } if (v === 'ifix') fixRatios(B.elements.filter(function (x) { return x.type === 'image'; })); if (v === 'arrange') resetTools(); if (v === 'blink') copyText(elLink(''), 'Board link copied — put it in a text or paste it on another board'); if (v === 'present') { if (B.present) stopPresent(); else startPresent(); } if (v === 'rooms') openPanel('roomsPanel'); if (v === 'timer') setTimeout(function () { timerPop($('#moreBtn')); }, 0); if (v === 'pdf') $('#pdfBtn').click(); if (v === 'log') togglePanel('logPanel'); if (v === 'backup' || v === 'settings') { openPanel('boardPanel'); if (v === 'backup') setTimeout(function () { $$('#boardBody details[data-sec=all],#boardBody details[data-sec=bk]').forEach(function (d) { d.open = true; }); var bk = $('#bkList'); if (bk) bk.scrollIntoView(); }, 300); } }, false, 'menu');
  };
  $('#bringBtn').onclick = function () {
    var ppl = PEOPLE.filter(function (p) { return p.role !== 't'; }), seen = {};
    ppl = ppl.filter(function (p) { if (seen[p.id]) return false; seen[p.id] = 1; return true; });
    ctxPop('<button class="mi" data-v="*" type="button">' + svg('bring') + 'Everyone</button>' + (ppl.length ? '<div class="lbl" style="margin:4px 8px">Or one person</div>' + ppl.map(function (p) { return '<button class="mi" data-v="' + esc(p.sock) + '" type="button"><span class="ava sm" style="--c:' + p.color + '">' + esc((p.name || '?').slice(0, 1)) + '</span>' + esc(p.name) + (p.guest ? ' (guest)' : '') + '</button>'; }).join('') : '<p class="hint" style="margin:6px 10px">Nobody else is on the board yet.</p>'), this,
      function (v) { if (v === '*') { socket.emit('b:summon', { view: myView() }); toast('Everyone now sees what you see'); } else { var p = PEOPLE.find(function (x) { return x.sock === v; }); socket.emit('b:summon', { sock: v, view: myView() }); toast((p ? p.name.split(' ')[0] : 'They') + ' now sees what you see'); } }, false, 'menu');
  };


  /* ---------- журнал группы прямо на доске: посещаемость и баланс ---------- */
  var JN = null;
  function jnToday() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function jnUsed(r) { return JN.entries.reduce(function (a, e) { return a + (e.att[r.id] === 'p' || e.att[r.id] === 'ac' ? 1 : 0); }, 0); }
  function jnBal(r) { return Math.round((r.start + r.topups.reduce(function (a, t) { return a + t.n; }, 0) - jnUsed(r)) * 100) / 100; }
  function jnFmt(d) { var p = String(d || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0].slice(2) : d || ''; }
  async function loadJournalPanel() {
    var b = $('#journalBody'); if (!SHARE || !SHARE.gid) { b.innerHTML = '<p class="hint">This board is not in a group, so there is no journal.</p>'; return; }
    b.innerHTML = '<p class="hint">Loading…</p>';
    try { JN = await api('GET', '/api/t/groups/' + SHARE.gid + '/journal'); renderJournalPanel(); } catch (err) { b.innerHTML = '<p class="hint">' + esc(err.message) + '</p>'; }
  }
  async function saveJn() { try { JN = await api('PUT', '/api/t/groups/' + SHARE.gid + '/journal', JN); renderJournalPanel(); } catch (err) { toast(err.message); } }
  function renderJournalPanel() {
    var b = $('#journalBody'); if (!b || !JN) return;
    var online = {}; PEOPLE.forEach(function (p) { online[p.id] = 1; });
    var inJ = JN.rows.map(function (r) { return r.sid; }), missing = ROSTER.filter(function (r) { return inJ.indexOf(r.id) < 0; });
    var h = '<p class="hint" style="margin-top:0">' + esc(SHARE.group || 'Group') + ' · the same journal as in your cabinet.</p>';
    if (JN.rows.length) {
      h += '<div class="lbl">Lessons left</div><div class="jnl">' + JN.rows.map(function (r) {
        var bl = jnBal(r);
        return '<div class="jnr" data-jr="' + esc(r.id) + '"><span class="jnn">' + esc(r.name) + '</span><span class="jnb' + (bl < 0 ? ' neg' : bl <= 1 ? ' low' : '') + '">' + bl + '</span><button class="pb" data-jn="top" type="button" title="Add paid lessons">+ paid</button></div>';
      }).join('') + '</div>';
    }
    if (missing.length) h += '<button class="pb" data-jn="addall" type="button">Add group students (' + missing.length + ')</button>';
    if (JN.rows.length) {
      h += '<div class="lbl">After the lesson</div><input type="date" id="jnDate" value="' + jnToday() + '" class="tin"><input id="jnTopic" class="tin" maxlength="300" placeholder="Topic of the lesson">' +
        '<div class="jnatt">' + JN.rows.map(function (r) { return '<div class="jnr"><span class="jnn">' + esc(r.name) + '</span><select data-ja="' + esc(r.id) + '"><option value="p" selected>was there</option><option value="a">absent</option><option value="ac">absent, charge</option></select></div>'; }).join('') + '</div>' +
        '<button class="pb solid" data-jn="save" type="button">Charge lesson</button>';
      if (JN.entries.length) {
        var es = JN.entries.slice().sort(function (a, c) { return (c.date || '').localeCompare(a.date || ''); }).slice(0, 5);
        h += '<div class="lbl">Recent lessons</div><div class="jnh">' + es.map(function (e) {
          var p = JN.rows.filter(function (r) { return e.att[r.id] === 'p'; }).length;
          return '<div class="jne"><b>' + esc(jnFmt(e.date)) + '</b> ' + esc(e.topic || '—') + '<small>' + p + ' of ' + JN.rows.length + ' there</small></div>';
        }).join('') + '</div>';
      }
    }
    h += '<p class="hint"><a href="/teacher" target="_blank" rel="noopener">Open the full journal</a> to edit marks, rename or remove students.</p>';
    b.innerHTML = h;
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-jn]'); if (!t || !JN || $('#journalPanel').hidden) return;
    var k = t.dataset.jn;
    if (k === 'addall') { ROSTER.forEach(function (r) { if (!JN.rows.some(function (x) { return x.sid === r.id; })) JN.rows.push({ id: Math.random().toString(36).slice(2, 10), name: r.name, sid: r.id, start: 0, topups: [] }); }); saveJn(); }
    else if (k === 'top') { var row = JN.rows.find(function (r) { return r.id === t.closest('[data-jr]').dataset.jr; }); if (!row) return; var n = Number(prompt('How many lessons did ' + row.name + ' pay for?', '8')); if (n) { row.topups.push({ at: Date.now(), n: n }); saveJn(); } }
    else if (k === 'save') {
      var att = {}; $$('#journalBody [data-ja]').forEach(function (s2) { att[s2.dataset.ja] = s2.value; });
      var topic = $('#jnTopic').value.trim(); if (!topic && !confirm('Save without a topic?')) return;
      JN.entries.push({ id: Math.random().toString(36).slice(2, 10), date: $('#jnDate').value || jnToday(), topic: topic, att: att });
      saveJn().then(function () { toast('Done: lesson charged, balance updated'); });
    }
  });
  /* ---------- timers ---------- */
  function now() { return Date.now() + SKEW; }
  function mmss(ms) { var t = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(t / 60), s2 = t % 60; return (m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0'); }
  function beep(key) {
    if (beeped[key]) return; beeped[key] = 1;
    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach(function (t) { var o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.2); o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.22); });
    } catch (e) {}
    if (key[0] === 's' || key[0] === 'm') toast(key[0] === 's' ? 'Time’s up!' : 'Your timer: time’s up!');
  }
  function renderTimer() {
    if (!B) return;
    var t = B.timer, a = $('#tShared'), m = $('#tMine');
    if (t) {
      var left = t.paused ? t.left : t.end - now();
      a.hidden = false; a.classList.toggle('done', left <= 0); a.classList.toggle('paused', !!t.paused);
      a.innerHTML = svg('timer') + '<span>' + (left <= 0 ? 'Time’s up' : mmss(left)) + '</span>';
      if (left <= 0 && !t.paused) beep('s' + t.end);
    } else a.hidden = true;
    if (myTimer) {
      var l2 = myTimer.end - Date.now();
      m.hidden = false; m.classList.toggle('done', l2 <= 0);
      m.innerHTML = '<span class="me">me</span><span>' + (l2 <= 0 ? 'Time’s up' : mmss(l2)) + '</span>';
      if (l2 <= 0) beep('m' + myTimer.end);
    } else m.hidden = true;
  }
  setInterval(renderTimer, 250);
  function timerPop(btn) {
    var T = isT(), t = B.timer, pre = [1, 2, 3, 5, 10, 15];
    var row = function (pfx) { return '<div class="trow">' + pre.map(function (n) { return '<button class="cb" data-v="' + pfx + (n * 60) + '" type="button">' + n + ' min</button>'; }).join('') + '<input type="number" min="1" max="360" placeholder="min" data-cm="' + pfx + '"><button class="cb" data-v="' + pfx + 'c" type="button">Start</button></div>'; };
    var h = '';
    if (T) {
      h += '<div class="lbl">For everyone</div>';
      if (t) h += '<div class="trow">' + (t.paused ? '<button class="cb" data-v="resume" type="button">Resume</button>' : '<button class="cb" data-v="pause" type="button">Pause</button>') + '<button class="cb" data-v="add" type="button">+1 min</button><button class="cb" data-v="stop" type="button">Stop</button></div>';
      h += row('s:');
    }
    h += '<div class="lbl">Just for me</div>' + (myTimer ? '<div class="trow"><button class="cb" data-v="mstop" type="button">Stop my timer</button></div>' : '') + row('m:');
    ctxPop(h, btn, function (v, p) {
      var sec;
      if (v === 'pause' || v === 'resume' || v === 'stop') { var o = { t: 'timer' }; o[v] = true; op(o); closeCtxPop(); return; }
      if (v === 'add') { var left = t.paused ? t.left : t.end - now(); op({ t: 'timer', sec: Math.max(0, left) / 1000 + 60 }); closeCtxPop(); return; }
      if (v === 'mstop') { myTimer = null; renderTimer(); closeCtxPop(); return; }
      var pf = v.slice(0, 2), rest = v.slice(2);
      sec = rest === 'c' ? Number(($('[data-cm="' + pf + '"]', p) || {}).value) * 60 : Number(rest);
      if (!sec || sec < 1) { toast('Type the number of minutes'); return; }
      if (pf === 's:') op({ t: 'timer', sec: sec }); else { myTimer = { end: Date.now() + sec * 1000 }; renderTimer(); }
      closeCtxPop();
    }, true, 'tpop');
  }
  $('#timerBtn').onclick = function () { timerPop(this); };
  $('#tShared').onclick = function () { timerPop(this); };
  $('#tMine').onclick = function () { timerPop(this); };

  /* ---------- anonymous mode chip ---------- */
  function renderAnon() {
    var c = $('#anonChip'), a = B && B.anon;
    c.hidden = !(a && a.on);
    if (a && a.on) c.textContent = a.priv ? 'Private mode' : a.hide ? 'Anonymous · hidden' : 'Anonymous';
    c.dataset.tip = a && a.on ? (a.priv ? 'Private mode: students see their own text only. The teacher reveals everything at once, without names.' : a.hide ? 'Stickies are anonymous and hidden from other students until the teacher reveals them' : 'New student stickies are anonymous') : '';
  }
  $('#anonChip').onclick = function () { if (isT()) openPanel('boardPanel'); };

  /* ---------- PDF ---------- */
  function exportPdf(onlyId) {
    finishEdit(); select([]);
    $$('#printRoot').forEach(function (n) { n.remove(); });
    var fs = Array.isArray(onlyId) ? onlyId.map(find).filter(Boolean).sort(function (a, b) { return a.y - b.y || a.x - b.x; }) : onlyId ? [find(onlyId)] : frames().filter(function (f) { return !f.collapsed && !hiddenByCollapse(f); }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var pages = fs.length ? fs.map(function (f) { return { x: f.x - 20, y: f.y - 50, w: f.w + 40, h: f.h + 70 }; }) : [(function () { var b = bbox(); return { x: b.x - 40, y: b.y - 40, w: b.w + 80, h: b.h + 80 }; })()];
    var PW = 1040, PH = 700, src = world.cloneNode(true);
    $$('[id]', src).forEach(function (n) { n.removeAttribute('id'); });
    src.removeAttribute('id');
    $$('.hblk', src).forEach(function (n) { var t = $('b', n); var fr = $('iframe', n); if (fr) fr.outerHTML = '<div class="hph">Interactive task' + (t ? ': ' + esc(t.textContent) : '') + '<br><small>open the board to work on it</small></div>'; });
    $$('.cur-o,.hd,.sbox', src).forEach(function (n) { n.remove(); });
    var root = document.createElement('div'); root.id = 'printRoot';
    pages.forEach(function (p) {
      var k = Math.min(PW / p.w, PH / p.h), pg = document.createElement('div'); pg.className = 'ppage';
      pg.style.background = B.bg || '#FFFFFF';
      var inner = src.cloneNode(true); inner.className = 'world';
      inner.style.transform = 'translate(' + ((PW - p.w * k) / 2 - p.x * k) + 'px,' + ((PH - p.h * k) / 2 - p.y * k) + 'px) scale(' + k + ')';
      pg.appendChild(inner); root.appendChild(pg);
    });
    document.body.appendChild(root); document.body.classList.add('printing');
    var done = function () { document.body.classList.remove('printing'); root.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    toast('In the print window choose “Save as PDF”');
    setTimeout(function () { window.print(); setTimeout(function () { if (document.body.classList.contains('printing') && !matchMedia('print').matches) done(); }, 1500); }, 400);
  }
  /* ---------- фрейм в один HTML-файл: картинки и интерактивные блоки внутри, открывается где угодно ---------- */
  async function exportHtml(ids) {
    finishEdit(); select([]);
    var fs = ids.map(find).filter(Boolean).sort(function (a, b) { return a.y - b.y || a.x - b.x; }); if (!fs.length) return;
    toast('Preparing the HTML file…');
    var css = '';
    try { css = (await (await fetch('/static/app.css')).text()) + '\n' + (await (await fetch('/static/board.css')).text()); } catch (e) {}
    var cache = {};
    async function asData(u) {
      if (cache[u] !== undefined) return cache[u];
      try { var r = await fetch(u, { credentials: 'same-origin' }); var b = await r.blob(); cache[u] = b.size < 15e6 ? await blobToDataUrl(b) : location.origin + u; } catch (e) { cache[u] = location.origin + u; }
      return cache[u];
    }
    var pages = '';
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i], P = { x: f.x - 20, y: f.y - 46, w: f.w + 40, h: f.h + 66 };
      var src = world.cloneNode(true);
      $$('[id]', src).forEach(function (n) { n.removeAttribute('id'); }); src.removeAttribute('id');
      $$('.cur-o,.hd,.sbox,.rwrap,.tfmt', src).forEach(function (n) { n.remove(); });
      // убираем всё, что не попадает во фрейм
      $$('[data-id]', src).forEach(function (n) { var el = find(n.dataset.id); if (!el || el === f) return; var bx = elBox(el); if (!bx || bx.x > P.x + P.w || bx.x + bx.w < P.x || bx.y > P.y + P.h || bx.y + bx.h < P.y) n.remove(); });
      $$('[data-id]', src).forEach(function (n) { var el = find(n.dataset.id); if (el && el.type === 'frame' && el !== f) n.remove(); });
      var imgs = $$('img[src]', src);
      for (var k = 0; k < imgs.length; k++) { var u = imgs[k].getAttribute('src'); if (/^\/(img|media)\//.test(u)) imgs[k].setAttribute('src', await asData(u)); }
      var meds = $$('audio[src],video[src],source[src]', src);
      for (var m = 0; m < meds.length; m++) { var mu = meds[m].getAttribute('src'); if (/^\/media\//.test(mu)) meds[m].setAttribute('src', await asData(mu)); }
      var ifs = $$('.hblk iframe', src);
      for (var q = 0; q < ifs.length; q++) {
        var hid = ifs[q].closest('[data-id]'), he = hid && find(hid.dataset.id);
        if (he && he.src) { try { var ht = await (await fetch(he.src, { credentials: 'same-origin' })).text(); ifs[q].removeAttribute('src'); ifs[q].setAttribute('srcdoc', ht.replace('<script src="/static/bsync.js"></script>', '')); } catch (e) {} }
      }
      $$('[style*="url("]', src).forEach(function (n) { n.style.backgroundImage = n.style.backgroundImage.replace(/url\("?\/(img)\//g, 'url("' + location.origin + '/img/'); });
      src.style.transform = 'translate(' + (-P.x) + 'px,' + (-P.y) + 'px)';
      pages += '<section class="xpage" data-w="' + P.w + '" style="width:' + P.w + 'px;height:' + P.h + 'px;background:' + (B.bg || '#FFFDF8') + '">' + src.outerHTML + '</section>';
    }
    var title = fs.length === 1 ? (fs[0].title || B.title) : B.title;
    var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Unbounded:wght@300;400;500;600&family=Inter:wght@400;500;600&family=Caveat:wght@400;700&display=swap">' +
      '<style>' + css + '\nhtml,body{height:auto!important;overflow:auto!important;background:#EEE9DA!important}body{margin:0;padding:24px 12px;display:flex;flex-direction:column;align-items:center;gap:24px}' +
      '.xwrap{position:relative}.xpage{position:relative;overflow:hidden;border-radius:14px;box-shadow:0 20px 40px -24px rgba(0,0,0,.35);transform-origin:0 0}.xpage .world{position:absolute;left:0;top:0;transform-origin:0 0}' +
      '.xpage .tnb,.xpage .lockb,.xpage .stepb{display:none!important}.xfoot{font:12px Manrope,sans-serif;color:#8a857a}</style></head><body>' +
      pages.replace(/<section/g, '<div class="xwrap"><section').replace(/<\/section>/g, '</section></div>') +
      '<div class="xfoot">' + esc(B.title) + ' · saved ' + new Date().toLocaleDateString() + '</div>' +
      '<script>function fit(){document.querySelectorAll(".xpage").forEach(function(p){var w=+p.dataset.w,k=Math.min(1,(innerWidth-24)/w);p.style.transform="scale("+k+")";p.parentNode.style.width=(w*k)+"px";p.parentNode.style.height=(p.offsetHeight*k)+"px";});}addEventListener("resize",fit);fit();<\/script></body></html>';
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = (title || 'frame').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) + '.html'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('HTML saved — it opens in any browser, even without internet for the pictures');
  }
  $('#pdfBtn').onclick = function () {
    var f = sel.length === 1 && find(sel[0]), selF = sel.map(find).filter(function (x) { return x && x.type === 'frame'; }), mods = modsOf().filter(function (m) { return m.frames.length; });
    var h = (f && f.type === 'frame' ? '<button class="mi" data-v="one" type="button">' + svg('frame') + 'Only “' + esc(f.title || 'Frame') + '”</button>' : '') +
      (selF.length > 1 ? '<button class="mi" data-v="sel" type="button">' + svg('frame') + 'The ' + selF.length + ' selected frames</button>' : '') +
      mods.map(function (m) { return '<button class="mi" data-v="m' + m.id + '" type="button">' + svg('pdf') + 'Module “' + esc(m.name) + '” · ' + m.frames.length + '</button>'; }).join('') +
      '<button class="mi" data-v="all" type="button">' + svg('pdf') + 'All frames, one per page</button>';
    if (!f && selF.length < 2 && !mods.length) return exportPdf();
    ctxPop(h, $('#moreBtn'), function (v) {
      if (v === 'one') exportPdf(f.id); else if (v === 'sel') exportPdf(selF.map(function (x) { return x.id; }));
      else if (v[0] === 'm') { var m = mods.find(function (q) { return q.id === v.slice(1); }); if (m) exportPdf(m.frames); } else exportPdf();
    }, false, 'menu');
  };

  /* ---------- share board with students ---------- */
  var invUrl = '', ginvUrl = '', lastInv = null;
  // две ссылки: для учеников (имя, логин, пароль → в группу) и для гостей (только имя)
  function linkBox(r, type) {
    var g = type === 'guest', inv = (g ? r.ginvite : r.invite) || {}, k = g ? 'g' : 's';
    var url = inv.token ? location.origin + '/b/' + BOARD_ID + '?' + (g ? 'guest=' : 'invite=') + inv.token : '';
    if (g) ginvUrl = url; else invUrl = url;
    if (!g && r.guestOnly) return '';
    var h = '';
    if (inv.on) {
      h += '<div style="word-break:break-all;margin-bottom:6px">' + esc(url) + '</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="cb" data-v="' + k + '-copy" type="button">Copy</button><button class="cb" data-v="' + k + '-reset" type="button">New link</button><button class="cb" data-v="' + k + '-off" type="button">Turn off</button></div>';
      h += g || r.guestOnly ? '<label class="chk"><input type="checkbox" data-opt="' + k + '-approve"' + (inv.approve ? ' checked' : '') + '> I let each guest in myself</label>'
        : '<label class="chk"><input type="checkbox" data-opt="' + k + '-auto"' + (inv.auto ? ' checked' : '') + '> Let students in without my approval</label>';
    } else h += '<button class="cb" data-v="' + k + '-on" type="button">Create the link</button>';
    return h;
  }
  function renderInv(r) {
    var box = $('#invBox'); if (!box) return;
    lastInv = r;
    box.innerHTML = (r.guestOnly ? '' : '<div class="lbl">Link for students</div><p class="hint" style="margin:0 0 4px">They enter name, login and password and become students of this board.</p>' + linkBox(r, 'student')) +
      '<div class="lbl" style="margin-top:10px">Link for guests</div><p class="hint" style="margin:0 0 4px">Only a name — they work on the board as a guest.</p>' + linkBox(r, 'guest') +
      (r.visits && r.visits.length ? '<div class="lbl" style="margin-top:8px">Who came as a guest</div><div class="visits">' + r.visits.slice(0, 40).map(function (x) { return '<div>' + esc(x.name) + ' <span>' + ago(x.at) + (x.via === 'invite' ? ' · link' : '') + '</span></div>'; }).join('') + '</div>' : '');
    $$('[data-opt]', box).forEach(function (c) {
      c.onchange = async function () {
        var o = c.dataset.opt, g = o.charAt(0) === 'g', body = { type: g ? 'guest' : 'student' };
        body[/approve$/.test(o) ? 'approve' : 'auto'] = c.checked;
        renderInv(await api('POST', '/api/t/boards/' + BOARD_ID + '/invite', body));
      };
    });
  }
  $('#shareBtn').onclick = function () {
    if (!SHARE) return;
    var acc = SHARE.access || [];
    ctxPop('<div class="lbl">Who can open this board</div>' + (SHARE.group ? '<p class="hint" style="margin:0;max-width:260px">Everyone in “' + esc(SHARE.group) + '” already has it. Tick extra students:</p>' : '') +
      (SHARE.all.length ? '<div class="sharelist">' + SHARE.all.map(function (st) { return '<label class="chk"><input type="checkbox" value="' + st.id + '"' + (acc.indexOf(st.id) >= 0 ? ' checked' : '') + '> ' + esc(st.name) + '</label>'; }).join('') + '</div>' : '<p class="hint">No students yet.</p>') +
      (SHARE.blocked && SHARE.blocked.length ? '<div class="lbl">Removed from this board</div>' + SHARE.blocked.map(function (st) { return '<div class="chk">' + esc(st.name) + ' <button class="cb" data-v="unb:' + st.id + '" type="button">Let back in</button></div>'; }).join('') : '') +
      '<div style="display:flex;gap:6px;margin-top:4px"><button class="pb" data-v="save" type="button">Save</button><button class="cb" data-v="link" type="button">Copy link</button></div>' +
      '<div class="lbl" style="margin-top:8px">Invitation links</div><div id="invBox" class="hint">Loading…</div>' +
      '<div class="lbl" style="margin-top:8px">Rights and privacy</div><div id="accBox" class="hint">Loading…</div>' +
      '<div class="lbl" style="margin-top:8px">Board password</div><div id="pwBoxB" class="hint">Loading…</div>', this,
      async function (v, pop) {
        if (v === 'link') { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('Link copied'); } catch (err) { toast(location.href); } return; }
        if (v.indexOf('unb:') === 0) { socket.emit('b:unblock', { id: v.slice(4) }); SHARE.blocked = SHARE.blocked.filter(function (x) { return x.id !== v.slice(4); }); toast('They can open the board again'); closeCtxPop(); return; }
        if (v === 'pw-set') { var np = $('#bpwIn', pop).value.trim(); if (np.length < 3) { toast('At least 3 characters'); return; } try { var pr = await api('POST', '/api/t/boards/' + BOARD_ID + '/password', { password: np }); renderPw(pr.on); toast('Password set — students and guests enter it once'); } catch (err) { toast(err.message); } return; }
        if (v === 'pw-off') { var pr2 = await api('POST', '/api/t/boards/' + BOARD_ID + '/password', { password: '' }); renderPw(pr2.on); toast('Password removed'); return; }
        var lk = /^([sg])-(copy|on|off|reset)$/.exec(v);
        if (lk) {
          var gt = lk[1] === 'g', u = gt ? ginvUrl : invUrl;
          if (lk[2] === 'copy') { try { await navigator.clipboard.writeText(u); toast((gt ? 'Guest' : 'Student') + ' link copied'); } catch (err) { toast(u); } return; }
          renderInv(await api('POST', '/api/t/boards/' + BOARD_ID + '/invite', Object.assign({ type: gt ? 'guest' : 'student' }, lk[2] === 'reset' ? { reset: true, on: true } : { on: lk[2] === 'on' })));
          return;
        }
        if (v !== 'save') return;
        var ids = $$('.sharelist input:checked', pop).map(function (i) { return i.value; });
        try {
          await api('PATCH', '/api/t/exercises/' + BOARD_ID, { access: ids }); SHARE.access = ids;
          ids.forEach(function (id) { if (!ROSTER.some(function (r) { return r.id === id; })) { var st = SHARE.all.find(function (x) { return x.id === id; }); if (st) ROSTER.push(st); } });
          closeCtxPop(); toast('Saved — they see it under “Shared with you”');
        } catch (err) { toast(err.message); }
      }, true);
    api('GET', '/api/t/boards/' + BOARD_ID + '/invite').then(function (r) { renderInv(r); renderPw(r.pw); renderAcc(r); }).catch(function () {});
  };
  function renderAcc(r) {
    var box = $('#accBox'); if (!box) return;
    var sel = function (k, v) { return '<select data-acc="' + k + '" style="font:inherit;border:1px solid var(--uiline);border-radius:8px;padding:3px 6px"><option value="0"' + (v ? '' : ' selected') + '>Can edit</option><option value="1"' + (v ? ' selected' : '') + '>View only</option></select>'; };
    box.innerHTML = '<label class="chk"><input type="checkbox" data-acc="studentsOnly"' + (r.studentsOnly ? ' checked' : '') + '> Only for my students — nobody else can open it or ask to join, even with a link</label>' +
      '<div style="display:flex;align-items:center;gap:8px;margin:6px 0">Students: ' + sel('sView', r.sView) + '</div>' +
      (r.studentsOnly ? '' : '<div style="display:flex;align-items:center;gap:8px;margin:6px 0">Guests: ' + sel('gView', r.gView) + '</div>') +
      '<label class="chk"><input type="checkbox" data-acc="pwSkip"' + (r.pwSkip ? ' checked' : '') + '> Students of this group skip the password (it is for everybody else)</label>';
    $$('[data-acc]', box).forEach(function (c) {
      c.onchange = async function () {
        var k = c.dataset.acc, body = {}; body[k] = c.type === 'checkbox' ? c.checked : c.value === '1';
        try { var r2 = await api('POST', '/api/t/boards/' + BOARD_ID + '/access', body); renderAcc(r2); toast('Saved'); } catch (err) { toast(err.message); }
      };
    });
    box.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
  }
  function renderPw(on) {
    var box = $('#pwBoxB'); if (!box) return;
    box.innerHTML = (on ? '<p style="margin:0 0 6px">🔒 The board has a password. Students and guests enter it once.</p>' : '<p style="margin:0 0 6px">No password. Add one if the board should open only for people who know it.</p>') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><input id="bpwIn" type="text" autocomplete="off" placeholder="' + (on ? 'New password' : 'Password') + '" style="flex:1;min-width:120px;font:inherit;border:1px solid var(--uiline);border-radius:8px;padding:5px 8px"><button class="cb" data-v="pw-set" type="button">' + (on ? 'Change' : 'Set') + '</button>' + (on ? '<button class="cb" data-v="pw-off" type="button">Remove</button>' : '') + '</div>';
    var i = $('#bpwIn'); if (i) i.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
  }

  /* ---------- guests at the door, bring to me, remove ---------- */
  function myView() { var r = vp.getBoundingClientRect(), a = toWorld(r.left + leftPad(), r.top), b = toWorld(r.right, r.bottom); return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }; }
  var knockId = function (rid) { return 'knock-' + String(rid).replace(/[^\w-]/g, '_'); };
  socket.on('b:knock', function (k) {
    if (document.getElementById(knockId(k.rid))) return;
    var d = document.createElement('div'); d.className = 'knock'; d.id = knockId(k.rid);
    d.innerHTML = '<div><b>' + esc(k.name) + '</b><br><span>' + (k.bid && k.bid !== BOARD_ID ? 'wants to join «' + esc(k.board || 'another board') + '»' : 'wants to join this board') + '</span></div><button class="kb yes" type="button">Let in</button><button class="kb" type="button">Decline</button>';
    $('#knocks').appendChild(d);
    $$('button', d).forEach(function (b, i) { b.onclick = function () { socket.emit('b:admit', { rid: k.rid, ok: i === 0 }); d.remove(); }; });
    beep('k' + k.rid);
  });
  socket.on('b:view', function (d) { if (!ME) return; ME.view = !!(d && d.view); applyAccess(); toast(ME.view ? 'The teacher switched this board to view-only' : 'You can edit this board again'); });
  socket.on('b:hello', function (h) { if (isT()) toast('👋 ' + (h.name || 'Someone').split(' ')[0] + (h.guest ? ' (guest)' : '') + ' joined the board'); });
  socket.on('b:knock-done', function (k) { var d = document.getElementById(knockId(k.rid)); if (d) d.remove(); });
  socket.on('b:goto', function (v) { fitTo(v, 5); toast('The teacher brought you here'); });
  socket.on('b:kicked', function () { $('#errFull').textContent = 'You were removed from this board.'; $('#errFull').hidden = false; });
  $('#people').addEventListener('click', function (e) {
    var btn = e.target.closest('.pstack'); if (!btn) return;
    var ppl = uniqPeople();
    ctxPop('<div class="lbl">On the board · ' + ppl.length + '</div>' + ppl.map(function (p) { return '<button class="mi" data-v="' + esc(p.sock) + '" type="button"' + (isT() && p.role !== 't' ? '' : ' style="cursor:default"') + '><span class="ava sm" style="--c:' + p.color + '">' + esc((p.name || '?').slice(0, 1)) + '</span>' + esc(p.role === 't' ? (p.name && p.name !== 'Teacher' ? 'Teacher ' + p.name : 'Teacher') : (p.name || '')) + (p.guest ? ' <span class="hint">guest</span>' : '') + (isT() && p.role !== 't' ? '<span class="car" style="margin-left:auto">›</span>' : '') + '</button>'; }).join(''), btn, function (sock) {
      var p = PEOPLE.find(function (x) { return x.sock === sock; }); if (!p || !isT() || p.role === 't') return;
      setTimeout(function () { personMenu(p, btn); }, 30);
    }, false, 'menu');
  });
  function personMenu(p, a) {
    var uid = p.id, sock = p.sock;
    ctxPop('<div class="lbl">' + esc(p.name || '') + (p.guest ? ' · guest' : '') + '</div><button class="mi" data-v="bring" type="button">' + svg('bring') + 'Bring to me</button>' + (p.guest ? '' : '<button class="mi" data-v="star" type="button"><span class="mie">⭐</span>Give a star</button>') + '<button class="mi" data-v="kick" type="button" style="color:#C2412D">' + svg('trash') + 'Remove from this board</button>', a, function (v) {
      if (v === 'bring') { socket.emit('b:summon', { sock: sock, view: myView() }); toast((p.name || 'Student').split(' ')[0] + ' now sees what you see'); }
      if (v === 'star') setTimeout(function () { starNote(p, a, v); }, 30);
      if (v === 'kick' && confirm('Remove ' + (p.name || 'this person') + ' from the board? ' + (p.guest ? 'They will need to ask again to come back.' : 'They lose access to this board until you let them back in Share.'))) socket.emit('b:kick', { id: uid });
    }, false, 'menu');
  }

  // заметка учителя: текст + фото или скриншоты (вставка Ctrl+V прямо в поле)
  function tnoteDialog(e, b) {
    var imgs = (e.tnimg || []).slice();
    var p = ctxPop('<div class="lbl">Teacher note — students never see it</div><textarea id="tnText" placeholder="Text — or paste a screenshot here (Ctrl+V)">' + esc(e.tnote || '') + '</textarea><div class="tnimgs" id="tnImgs"></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><label class="cb" style="cursor:pointer">📷 Add photo<input type="file" accept="image/*" id="tnFile" multiple hidden></label><button class="pb" data-v="save" type="button">Save</button>' + (e.tnote || e.tnimg ? '<button class="cb" data-v="clear" type="button">Remove</button>' : '') + '</div>', b,
      function (v, pop) {
        if (v === 'save' || v === 'clear') { var txt = v === 'clear' ? '' : $('#tnText', pop).value.trim(); var im = v === 'clear' ? [] : imgs; patchSel(function () { return { tnote: txt || null, tnimg: im.length ? im : null }; }, [e.id]); closeCtxPop(); }
      }, true);
    p.classList.add('tnpop');
    function draw() { $('#tnImgs', p).innerHTML = imgs.map(function (u, i) { return '<span class="tnth"><img src="' + esc(u) + '" alt="" data-big="' + esc(u) + '"><button type="button" data-rm="' + i + '" title="Remove">×</button></span>'; }).join(''); }
    function add(files) {
      files = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); }); if (!files.length) return;
      if (imgs.length + files.length > 6) { toast('Up to 6 pictures in a note'); files = files.slice(0, Math.max(0, 6 - imgs.length)); }
      toast('Uploading…');
      Promise.all(files.map(function (f) { return uploadImage(f).catch(function () { return null; }); })).then(function (urls) { urls.forEach(function (u) { if (u) imgs.push(u); }); draw(); });
    }
    draw();
    $('#tnFile', p).onchange = function () { add(this.files); this.value = ''; };
    var ta = $('#tnText', p);
    ta.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    ta.addEventListener('paste', function (ev) { var fs = ev.clipboardData && ev.clipboardData.files; if (fs && fs.length) { ev.preventDefault(); add(fs); } });
    p.addEventListener('click', function (ev) {
      var rm = ev.target.closest('[data-rm]'); if (rm) { imgs.splice(Number(rm.dataset.rm), 1); draw(); return; }
      var bg = ev.target.closest('[data-big]'); if (bg) openLightbox(bg.dataset.big);
    });
    ta.focus();
  }
  /* ---------- My language box: слово или фраза из текста на доске ---------- */
  function elText(e) {
    if (!e) return '';
    var t = e.type === 'sentence' ? sentenceToText(e) : e.type === 'flip' ? [e.front && e.front.text, e.back && e.back.text].filter(Boolean).join(' — ') : e.type === 'todo' ? e.items.map(function (i) { return i.t; }).join('\n') : (e.text || e.title || e.label || '');
    return String(t || '').trim();
  }
  function selectedText() { var g = getSelection(); return g && g.rangeCount ? String(g).replace(/\s+/g, ' ').trim().slice(0, 120) : ''; }
  /* выделил слово или фразу в тексте — рядом появляется кнопка «в Language box» */
  function pickWordAt(x, y) {
    var node, off;
    if (document.caretRangeFromPoint) { var r0 = document.caretRangeFromPoint(x, y); if (r0) { node = r0.startContainer; off = r0.startOffset; } }
    else if (document.caretPositionFromPoint) { var cp = document.caretPositionFromPoint(x, y); if (cp) { node = cp.offsetNode; off = cp.offset; } }
    if (!node || node.nodeType !== 3) return;
    var s = node.nodeValue, isW = function (ch) { return /[\p{L}\p{N}'’\-]/u.test(ch || ''); }, a = off, z = off;
    while (a > 0 && isW(s[a - 1])) a--; while (z < s.length && isW(s[z])) z++;
    if (a === z) return;
    var rg = document.createRange(); rg.setStart(node, a); rg.setEnd(node, z); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg);
  }
  (function lbSel() {
    var chip = null, tm = null;
    function hide() { if (chip) chip.hidden = true; }
    function show() {
      if (isT() || !ME || ME.guest || !B) return hide();
      var g = getSelection(); if (!g || !g.rangeCount || g.isCollapsed) return hide();
      var t = String(g).replace(/\s+/g, ' ').trim(); if (!t || t.length > 120) return hide();
      var an = g.anchorNode && (g.anchorNode.nodeType === 1 ? g.anchorNode : g.anchorNode.parentElement);
      if (!an || !world.contains(an) || !an.closest('.ntext,.stext,.btext,.ztitle,.card,.fed,.tc,[contenteditable],.lbtext')) return hide();
      var r = g.getRangeAt(0).getBoundingClientRect(); if (!r || (!r.width && !r.height)) return hide();
      if (!chip) {
        chip = document.createElement('button'); chip.type = 'button'; chip.className = 'lbchip'; chip.textContent = '+ Language box';
        chip.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); });
        chip.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
        chip.addEventListener('click', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          var w = String(getSelection()).replace(/\s+/g, ' ').trim().slice(0, 120); if (!w) return;
          api('POST', '/api/s/vocab', { w: w, from: B.title }).then(function () { toast('«' + w + '» is in My language box'); }).catch(function (err) { toast(err.message); });
          hide();
        });
        document.body.appendChild(chip);
      }
      chip.hidden = false;
      chip.style.left = Math.max(8, Math.min(innerWidth - chip.offsetWidth - 8, r.left + r.width / 2 - chip.offsetWidth / 2)) + 'px';
      chip.style.top = Math.max(70, r.top - 38) + 'px';
    }
    document.addEventListener('selectionchange', function () { clearTimeout(tm); tm = setTimeout(show, 120); });
    document.addEventListener('pointerdown', function (ev) { if (!ev.target.closest('.lbchip')) hide(); });
  })();
  function langBoxDialog(e, btn) {
    var pre = editing ? selectedText() : '';
    var p = ctxPop('<div class="lbl">My language box</div><p class="hint" style="margin:0 0 6px;max-width:300px">Select a word or phrase in the text below — or type it.</p><div class="lbtext" id="lbText">' + esc(elText(e)).replace(/\n/g, '<br>') + '</div>' +
      '<input id="lbWord" maxlength="120" placeholder="Word or phrase" value="' + esc(pre) + '" style="width:300px"><button class="pb solid" data-v="add" type="button">Add to My language box</button>', btn, function (v, pop) {
        if (v !== 'add') return;
        var w = $('#lbWord', pop).value.trim(); if (!w) { toast('Select or type a word first'); return; }
        api('POST', '/api/s/vocab', { w: w, from: B.title }).then(function () { toast('«' + w + '» is in My language box'); $('#lbWord', pop).value = ''; }).catch(function (err) { toast(err.message); });
      }, true);
    var tx = $('#lbText', p);
    tx.addEventListener('mouseup', function () { var t = selectedText(); if (t) $('#lbWord', p).value = t; });
    tx.addEventListener('touchend', function () { setTimeout(function () { var t = selectedText(); if (t) $('#lbWord', p).value = t; }, 50); });
    $('#lbWord', p).addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') $('[data-v=add]', p).click(); });
  }
  // звезда или балл с коротким комментарием — ученик увидит его вместе с наградой
  function starNote(p, a, kind) {
    var first = (p.name || 'Student').split(' ')[0];
    var quick = ['Great job!', 'Well done!', 'Brilliant answer!', 'Nice idea!', 'Great progress!', 'Thanks for helping!'];
    var pop = ctxPop('<div class="lbl">' + '⭐ Star' + ' for ' + esc(first) + '</div><textarea id="stNote" rows="2" maxlength="150" placeholder="A short note (optional)" style="width:250px;font:inherit;border:1px solid var(--uiline);border-radius:10px;padding:8px;resize:none"></textarea>' +
      '<div class="qchips">' + quick.map(function (q) { return '<button class="qchip" data-q="' + esc(q) + '" type="button">' + esc(q) + '</button>'; }).join('') + '</div><button class="pb solid" data-v="send" type="button">Send</button>', a, function (v, pp) {
        if (v !== 'send') return;
        var note = ($('#stNote', pp).value || '').trim(); closeCtxPop();
        socket.emit('b:star', { id: p.id, stars: 1, pts: 0, why: note || 'From the teacher', note: !!note }, function (r) { if (r) toast(first + ' — ⭐ ' + r.stars); });
      }, true);
    pop.addEventListener('click', function (ev) { var q = ev.target.closest('[data-q]'); if (q) { $('#stNote', pop).value = q.dataset.q; $('#stNote', pop).focus(); } });
    var ta = $('#stNote', pop); ta.focus(); ta.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); $('[data-v=send]', pop).click(); } });
  }

  /* ---------- flying reactions ---------- */
  var FLY_EMO = ['👍', '❤️', '😂', '🎉', '👏', '🔥', '😮', '🤔', '✅', '❓'];
  $('#reactBtn').onclick = function () {
    var btn = this;
    setTimeout(function () {
      ctxPop('<button class="pb handbtn" data-v="hand" type="button">✋ ' + (myHand() ? 'Lower my hand' : 'Raise hand') + '</button><div class="rlist">' + FLY_EMO.map(function (x) { return '<button type="button" data-v="' + x + '">' + x + '</button>'; }).join('') + '</div>', btn, function (v) { if (v === 'hand') { socket.emit('b:hand', { on: !myHand() }); closeCtxPop(); return; } if (v) socket.emit('b:react', { emoji: v }); }, true, 'rpop');
    }, 0);
  };
  socket.on('b:react', function (r) {
    var n = document.createElement('div'); n.className = 'flyemo';
    n.innerHTML = '<span class="fe">' + esc(r.emoji) + '</span>' + (r.name ? '<span class="fn" style="--c:' + esc(r.color) + '">' + esc(r.name) + '</span>' : '');
    var w = vp.clientWidth; n.style.left = Math.round(w * 0.15 + Math.random() * w * 0.7) + 'px';
    n.style.setProperty('--dx', Math.round(Math.random() * 160 - 80) + 'px');
    vp.appendChild(n); setTimeout(function () { n.remove(); }, 3600);
  });

  /* ---------- размер фрейма: готовые пропорции ---------- */
  var FSIZES = [['16:9', 'Wide 16:9 (slide)', 1600, 900], ['4:3', 'Classic 4:3', 1400, 1050], ['1:1', 'Square', 1200, 1200], ['A4', 'A4 portrait', 1000, 1414], ['A4↔', 'A4 landscape', 1414, 1000], ['9:16', 'Phone 9:16 (stories)', 900, 1600], ['4:5', 'Instagram post 4:5', 1080, 1350]];
  function frameRatio(f) {
    var r = f.w / f.h, best = null;
    FSIZES.forEach(function (z) { if (!best && Math.abs(r - z[2] / z[3]) < 0.02) best = z[0]; });
    return best || 'Size';
  }
  function frameSizePop(f, btn) {
    ctxPop('<div class="lbl">Frame size</div>' + FSIZES.map(function (z) {
      var k = 18 / Math.max(z[2], z[3]);
      return '<button class="mi" data-v="' + z[0] + '" type="button"><span class="fshape"><i style="width:' + Math.round(z[2] * k) + 'px;height:' + Math.round(z[3] * k) + 'px"></i></span>' + z[1] + '</button>';
    }).join('') + '<button class="mi" data-v="fit" type="button"><span class="fshape">⤢</span>Fit to what’s inside</button><p class="hint" style="margin:4px 8px 2px;max-width:240px">Keeps the frame’s area about the same. Content stays where it is.</p>', btn, function (v) {
      var nw, nh, kids = children(f).map(elBox).filter(Boolean);
      var u = kids.length ? union(kids) : null;
      if (v === 'fit') { if (!u) return; nw = u.x + u.w - f.x + 60; nh = u.y + u.h - f.y + 60; }
      else {
        var z = FSIZES.find(function (q) { return q[0] === v; }); if (!z) return;
        var area = f.w * f.h, rr = z[2] / z[3]; nw = Math.sqrt(area * rr); nh = nw / rr;
        if (u) { var need = Math.max((u.x + u.w - f.x + 40) / nw, (u.y + u.h - f.y + 40) / nh, 1); nw *= need; nh *= need; }
      }
      var old = { id: f.id, w: f.w, h: f.h };
      op({ t: 'patch', items: [{ id: f.id, w: Math.round(nw), h: Math.round(nh) }] }, function (ok) { if (ok) pushUndo(function () { op({ t: 'patch', items: [old] }); }); });
    }, false, 'menu');
  }

  /* ---------- режим презентации ---------- */
  function slideOrder() { return frames().filter(function (f) { return !framesOf(f).length && (isT() || !f.hidden); }).sort(function (a, b) { var ra = Math.round(a.y / 300), rb = Math.round(b.y / 300); return ra - rb || a.x - b.x; }); }
  function presFit(f) {
    if (!f) return;
    var W = vp.clientWidth, H = vp.clientHeight - 64, pad = narrow() ? 8 : 30;
    V.z = Math.max(0.05, Math.min(4, (W - pad * 2) / f.w, (H - pad * 2) / f.h));
    V.x = (W - f.w * V.z) / 2 - f.x * V.z; V.y = (H - f.h * V.z) / 2 - f.y * V.z + 8;
    applyView(); render();
  }
  function curSlide() { var fs = slideOrder(), c = viewCenter(), best = null, bd = Infinity; fs.forEach(function (f) { var d = Math.hypot(f.x + f.w / 2 - c.x, f.y + f.h / 2 - c.y); if (d < bd) { bd = d; best = f; } }); return best; }
  function startPresent() {
    var s0 = sel.length === 1 ? find(sel[0]) : null;
    var f = s0 && s0.type === 'frame' ? s0 : curSlide();
    if (!f) { toast('Add a frame first — each frame is a slide'); return; }
    select([]); op({ t: 'present', frame: f.id, follow: true });
  }
  function stopPresent() { op({ t: 'present', off: true }); }
  function goSlide(d) {
    var fs = slideOrder(); if (!fs.length) return;
    var i = fs.findIndex(function (f) { return B.present && f.id === B.present.frame; });
    var n = Math.max(0, Math.min(fs.length - 1, (i < 0 ? 0 : i) + d));
    op({ t: 'present', frame: fs[n].id });
  }
  var presSeen = null, followOff = false, roomSeen = null, starsMine = null;
  function renderModes(firstJoin) {
    if (!B) return;
    var P = B.present, bar = $('#presBar');
    document.body.classList.toggle('presenting', !!P && isT());
    document.body.classList.toggle('pres-st', !!P && !isT());
    if (!P) { bar.hidden = true; presSeen = null; followOff = false; }
    else {
      var fs = slideOrder(), i = fs.findIndex(function (f) { return f.id === P.frame; }), f = find(P.frame);
      bar.hidden = false;
      if (isT()) bar.innerHTML = '<button class="pbn" data-pv="prev" type="button" aria-label="Previous slide">‹</button><span class="pnum">' + (i + 1) + ' / ' + fs.length + '</span><button class="pbn" data-pv="next" type="button" aria-label="Next slide">›</button><span class="ptitle">' + esc(f ? f.title || 'Frame' : '') + '</span>' +
        '<label class="pfol"><input type="checkbox" data-pv="follow"' + (P.follow ? ' checked' : '') + '> Students follow me</label><button class="pbn wide" data-pv="end" type="button">End</button>';
      else bar.innerHTML = followOff || !P.follow ? '<span class="ptitle">Presentation · ' + (i + 1) + ' / ' + fs.length + '</span><button class="pbn wide" data-pv="back" type="button">Back to the teacher’s slide</button>' : '<span class="ptitle">Following the teacher · ' + (i + 1) + ' / ' + fs.length + '</span><button class="pbn wide" data-pv="free" type="button">Look around</button>';
      if (P.frame !== presSeen) { presSeen = P.frame; if (isT() || (P.follow && !followOff) || firstJoin) { if (!isT()) followOff = false; presFit(f); } }
    }
    var R = B.rooms, rb = $('#roomBar');
    if (!R) { rb.hidden = true; roomSeen = null; }
    else {
      var my = isT() ? null : R.list.find(function (r) { return r.owners.some(function (o) { return o.id === ME.id; }); });
      if (isT()) { rb.hidden = false; rb.innerHTML = '<span>' + svg('rooms') + 'Pair rooms are on · ' + R.list.length + '</span><button class="pbn wide" data-rv="panel" type="button">Manage</button>'; }
      else if (my) {
        var mates = my.owners.filter(function (o) { return o.id !== ME.id; }).map(function (o) { return o.name.split(' ')[0]; });
        rb.hidden = false; rb.innerHTML = '<span>' + svg('rooms') + 'Room ' + my.n + (mates.length ? ' · with ' + esc(mates.join(', ')) : '') + '</span><button class="pbn wide" data-rv="go" data-f="' + my.frame + '" type="button">Go to my room</button>';
        if (roomSeen !== my.frame) { roomSeen = my.frame; var rf = find(my.frame); if (rf) { presFit(rf); toast('You are in room ' + my.n + (mates.length ? ' with ' + mates.join(', ') : '')); } }
      } else rb.hidden = true;
    }
    if (!$('#roomsPanel').hidden) renderRooms();
  }
  $('#presBar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pv]'); if (!b) return; var v = b.dataset.pv;
    if (v === 'prev') goSlide(-1); else if (v === 'next') goSlide(1); else if (v === 'end') stopPresent();
    else if (v === 'follow') op({ t: 'present', follow: b.checked });
    else if (v === 'free') { followOff = true; renderModes(); }
    else if (v === 'back') { followOff = false; presFit(find(B.present.frame)); renderModes(); }
  });
  $('#roomBar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-rv]'); if (!b) return;
    if (b.dataset.rv === 'panel') openPanel('roomsPanel'); else presFit(find(b.dataset.f));
  });
  document.addEventListener('keydown', function (e) {
    if (!B || !B.present || !isT() || /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable || sel.length) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); goSlide(1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); e.stopPropagation(); goSlide(-1); }
    if (e.key === 'Escape') stopPresent();
  }, true);
  // ученик сам крутит доску — перестаём «следовать», пока не нажмёт «Back»
  vp.addEventListener('wheel', function () { if (B && B.present && !isT() && B.present.follow && !followOff) { followOff = true; renderModes(); } }, { passive: true });

  /* ---------- комнаты для работы в парах ---------- */
  function renderRooms() {
    var R = B.rooms, h = '';
    if (!R) {
      var fs = frames().slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }).filter(function (f) { return !(f.owners && f.owners.length); });
      var s0 = sel.length === 1 ? find(sel[0]) : null, cur0 = s0 && s0.type === 'frame' ? s0.id : (curSlide() || {}).id;
      var on = {}; PEOPLE.forEach(function (p) { if (p.role === 's' && !p.guest) on[p.id] = p.name; });
      h = '<p class="hint" style="margin-top:0">Students are split into rooms. Each room gets its own copy of the task frame — only its members (and you) see it, and everyone is taken there.</p>' +
        '<label class="f">Task frame<select id="rmFrame">' + fs.map(function (f) { return '<option value="' + f.id + '"' + (f.id === cur0 ? ' selected' : '') + '>' + esc(f.title || 'Frame') + '</option>'; }).join('') + '</select></label>' +
        '<label class="f">People in a room<select id="rmSize"><option value="2" selected>Pairs (2)</option><option value="3">Threes (3)</option><option value="4">Fours (4)</option><option value="1">Each alone</option></select></label>' +
        '<label class="f">Time<select id="rmMin"><option value="0">No timer</option><option value="3">3 min</option><option value="5" selected>5 min</option><option value="7">7 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="20">20 min</option></select></label>' +
        '<label class="c"><input type="checkbox" id="rmShuf" checked> Mix students randomly</label>' +
        '<label class="c"><input type="checkbox" id="rmOnline" checked> Only students on the board now (' + Object.keys(on).length + ')</label>' +
        '<button class="pb solid" id="rmOpen" type="button"' + (fs.length ? '' : ' disabled') + '>Open rooms</button>' + (fs.length ? '' : '<p class="hint">Add a frame with the task first.</p>');
    } else {
      var online = {}; PEOPLE.forEach(function (p) { online[p.id] = 1; });
      var left = R.until ? Math.max(0, Math.ceil((R.until - Date.now() - SKEW) / 60000)) : null;
      h = '<div class="rmhead">' + R.list.length + ' rooms' + (left != null ? ' · ' + left + ' min left' : '') + '</div>' +
        R.list.map(function (r) {
          return '<div class="rmrow"><b>Room ' + r.n + '</b><span class="rmppl">' + r.owners.map(function (o) { return '<span class="' + (online[o.id] ? 'on' : '') + '">' + esc(o.name.split(' ')[0]) + '</span>'; }).join('') + '</span><button class="pb" data-visit="' + r.frame + '" type="button">Visit</button></div>';
        }).join('') +
        '<label class="f" style="margin-top:12px">Message to all rooms<span style="display:flex;gap:6px"><input id="rmMsg" placeholder="e.g. 2 minutes left — swap roles!"><button class="pb" id="rmSend" type="button">Send</button></span></label>' +
        '<div class="btns"><button class="pb" data-ext="2" type="button">+2 min</button><button class="pb" data-ext="5" type="button">+5 min</button></div>' +
        '<button class="pb solid" id="rmClose" type="button" style="margin-top:10px">Close rooms — everyone back</button><p class="hint">Room copies stay on the board, to the right of the task, so you can look at the answers later.</p>';
    }
    $('#roomsBody').innerHTML = h;
  }
  $('#roomsBody').addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'rmOpen') {
      t.disabled = true;
      socket.emit('b:rooms', { open: true, frame: $('#rmFrame').value, size: Number($('#rmSize').value), minutes: Number($('#rmMin').value), shuffle: $('#rmShuf').checked, onlineOnly: $('#rmOnline').checked }, function (r) { t.disabled = false; if (r && r.error) toast(r.error); else toast('Rooms are open'); });
    }
    if (t.id === 'rmClose') socket.emit('b:rooms', { close: true }, function () { toast('Rooms closed'); });
    if (t.id === 'rmSend') { var m = $('#rmMsg').value.trim(); if (m) socket.emit('b:rooms', { msg: m }, function () { $('#rmMsg').value = ''; toast('Sent to all rooms'); }); }
    if (t.dataset.ext) socket.emit('b:rooms', { extend: Number(t.dataset.ext) });
    if (t.dataset.visit) { presFit(find(t.dataset.visit)); if (narrow()) $('#roomsPanel').hidden = true; }
  });
  socket.on('b:rooms-msg', function (m) { if (isT()) return; var n = document.createElement('div'); n.className = 'roommsg'; n.innerHTML = '<b>Teacher:</b> ' + esc(m.text); vp.appendChild(n); setTimeout(function () { n.classList.add('out'); }, 7000); setTimeout(function () { n.remove(); }, 7600); });
  socket.on('b:rooms-end', function (m) { roomSeen = null; var f = m && find(m.frame); if (!isT()) { if (f) presFit(f); toast('Rooms are closed — everyone is back'); } });

  /* ---------- звёзды и очки (без рейтинга: каждый видит только свои) ---------- */
  function renderStars() {
    var c = $('#starChip'); if (!c) return;
    if (isT() || !starsMine || (ME && ME.guest)) { c.hidden = true; return; }
    c.hidden = false; c.innerHTML = '<span class="st">⭐</span>' + starsMine.stars;
  }
  var balMine = null;
  function loadBalance() {
    var c = $('#balChip'); if (!c) return;
    if (isT() || !ME || ME.guest) { c.hidden = true; return; }
    api('GET', '/api/s/balance').then(function (r) {
      balMine = r || []; if (!balMine.length) { c.hidden = true; return; }
      var m = balMine.find(function (x) { return SHARE && x.gid === SHARE.gid; }) || balMine[0];
      c.hidden = false; c.className = 'starchip coinchip' + (m.bal < 0 ? ' neg' : m.bal <= 1 ? ' low' : '');
      c.innerHTML = '<span class="st">🪙</span>' + m.bal;
    }).catch(function () { c.hidden = true; });
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest('#balChip'); if (!c || !balMine) return;
    var h = '<div class="balpop"><h4>Lessons left</h4>' + balMine.map(function (x) { return '<div class="r"><span>' + esc(x.group) + '</span><b>' + x.bal + '</b></div>'; }).join('') + '</div>';
    setTimeout(function () { ctxPop(h, c, function () {}, true); }, 0);
  });
  function loadMyStars() { loadBalance(); if (isT() || !ME || ME.guest) { renderStars(); return; } socket.emit('b:mystars', {}, function (r) { if (r) { starsMine = r; renderStars(); } }); }
  socket.on('b:star', function (d) {
    starsMine = d.total; renderStars();
    var c = $('#starChip'); if (c) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    var n = document.createElement('div'); n.className = 'stargot';
    var personal = !!d.note;   // фраза учителя; у игр и автопроверки — просто подпись
    n.innerHTML = '<div class="big">' + '⭐' + '</div><div>' + 'You got a star!' + '</div>' + (personal ? '<div class="snote">“' + esc(d.why) + '”<span>— your teacher</span></div>' : '<small>' + esc(d.why || '') + '' + '</small>');
    if (personal) n.classList.add('withnote');
    n.onclick = function () { n.remove(); };
    vp.appendChild(n); setTimeout(function () { n.remove(); }, personal ? 7000 : 3200);
  });

  /* название доски в шапке: учитель нажимает и переименовывает (меняется и в списке досок) */
  $('#btitle').addEventListener('click', function () {
    if (!isT() || this.isContentEditable) return;
    var h = this, old = B.title;
    try { h.contentEditable = 'plaintext-only'; } catch (err) {} if (h.contentEditable !== 'plaintext-only') h.contentEditable = 'true';
    h.classList.add('editing'); h.focus(); var r = document.createRange(); r.selectNodeContents(h); var sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
    function done(save) { h.onkeydown = h.onblur = null; h.contentEditable = 'false'; h.classList.remove('editing'); var v = h.innerText.replace(/\s+/g, ' ').trim(); if (save && v && v !== old) op({ t: 'meta', title: v }); else h.textContent = old; }
    h.onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') done(false); };
    h.onblur = function () { done(true); };
  });
  /* ---------- zoom box ---------- */
  $('#zIn').onclick = function () { zoomAt(1.25); };
  $('#zOut').onclick = function () { zoomAt(0.8); };
  $('#zFit').onclick = function () { fit(); };
  $('#zLvl').onclick = function () { if (Math.abs(V.z - 1) < 0.01) fit(); else zoomAt(1 / V.z); };

  /* ---------- hover hints ---------- */
  var tipEl = document.createElement('div'), tipT = 0, tipFor = null; tipEl.className = 'tip'; tipEl.hidden = true; document.body.appendChild(tipEl);
  function hideTip() { clearTimeout(tipT); tipEl.hidden = true; tipFor = null; }
  var lastTouch = 0; document.addEventListener('touchstart', function () { lastTouch = Date.now(); }, { passive: true, capture: true });
  document.addEventListener('mouseover', function (e) {
    if (Date.now() - lastTouch < 1500) return;   // на телефоне и планшете подсказки не всплывают
    var n = e.target.closest && e.target.closest('[data-tip]');
    if (n === tipFor) return; hideTip(); if (!n || !n.dataset.tip) return;
    tipFor = n;
    tipT = setTimeout(function () {
      if (!document.body.contains(n)) return;
      tipEl.textContent = n.dataset.tip; tipEl.hidden = false;
      var r = n.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, x, y;
      if (n.closest('.lbar') && !narrow()) { x = r.right + 8; y = r.top + r.height / 2 - h / 2; }
      else { x = r.left + r.width / 2 - w / 2; y = r.bottom + 8; if (y + h > innerHeight - 4) y = r.top - h - 8; }
      tipEl.style.left = Math.max(4, Math.min(innerWidth - w - 4, x)) + 'px'; tipEl.style.top = Math.max(4, y) + 'px';
    }, 280);
  });
  document.addEventListener('pointerdown', hideTip, true);
  document.addEventListener('wheel', hideTip, true);

  // игры (games.js) получают доступ к доске
  if (window.GAMES_API) window.GAMES_API.init({ isT: function () { return isT() && !asStu; }, me: function () { return ME; }, op: op, toast: toast, render: render, find: find, frames: frames, goFrame: goFrame, ctxPop: ctxPop, closeCtxPop: closeCtxPop, people: function () { return uniqPeople(); }, now: function () { return Date.now() + (SKEW || 0); }, patch: function (id, p) { patchSel(function () { return p; }, [id]); },
    makeFrames: function (titles, near, cb) {
      var b0 = boxOf(near), x = Math.round(b0.x + b0.w + 120), y = Math.round(b0.y), els = titles.map(function (t, i) { return { id: rid(), type: 'frame', x: x + i * 1080, y: y, w: 1000, h: 640, title: t }; });
      op({ t: 'el-many', els: els }, function (ok) { if (ok) { pushUndo(function () { els.forEach(function (f) { op({ t: 'del', id: f.id, all: true }); }); }); toast('Rooms created — put the tasks for each room inside its frame'); } if (cb) cb(); });
    } });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('#world .game [data-g]'); if (!b || b.disabled) return;
    var n = b.closest('[data-id]'), e = n && find(n.dataset.id); if (!e || !isGame(e)) return;
    ev.preventDefault(); ev.stopPropagation(); window.GAMES_API.click(e, b, n);
  }, true);
  document.addEventListener('keydown', function (ev) {
    var i = ev.target; if (!i.closest || !i.closest('#world .game')) return;
    ev.stopPropagation();
    if (ev.key === 'Enter' && !ev.shiftKey && i.dataset.enter) { ev.preventDefault(); var n = i.closest('[data-id]'), b = n.querySelector('[data-g="' + i.dataset.enter + '"]'); if (b) b.click(); }
  }, true);
  document.addEventListener('change', function (ev) { var s = ev.target.closest && ev.target.closest('#world .game [data-gsel]'); if (!s) return; var n = s.closest('[data-id]'), e = n && find(n.dataset.id); if (e) window.GAMES_API.change(e, s); }, true);
  refreshThemePalettes();
  window.addEventListener('brandchange', function () { refreshThemePalettes(); if (B) render(); });
  setTool('select');
})();
