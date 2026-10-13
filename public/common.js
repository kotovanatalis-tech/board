/* Shared helpers for teacher, student and board pages */
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function api(method, url, body) {
  var r = await fetch(url, {
    method: method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  var d = {};
  try { d = await r.json(); } catch (e) {}
  if (r.status === 401 && url.indexOf('/api/login') !== 0 && url.indexOf('/api/setup') !== 0 && url.indexOf('/api/t/password') !== 0) {
    location.href = '/'; throw new Error('Please sign in');
  }
  if (!r.ok) throw new Error(d.error || ('Error ' + r.status));
  return d;
}

function ago(ts) {
  if (!ts) return 'never signed in';
  var s = (Date.now() - ts) / 1000;
  if (s < 20) return 'just now';
  if (s < 60) return Math.round(s) + 's ago';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function clock(ts) { return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }

var STICKERS = ['👍', '👏', '🔥', '⭐', '💡', '✅', '❌', '❓', '🤔', '😅', '😊', '🎉', '🙌', '💪', '❤️', '👀', '🍁', '🍂', '☕', '🎯'];

function toast(text, onClick) {
  var box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  var t = document.createElement('div');
  t.className = 'toast'; t.textContent = text;
  t.addEventListener('click', function () { t.remove(); if (onClick) onClick(); });
  box.appendChild(t);
  setTimeout(function () { t.remove(); }, 5000);
}

function imageToDataUrl(file, max) {
  max = max || 1600;
  return new Promise(function (resolve, reject) {
    if (file.type === 'image/gif' && file.size < 4e6) {
      var fr = new FileReader(); fr.onload = function () { resolve(fr.result); }; fr.onerror = reject; fr.readAsDataURL(file); return;
    }
    var u = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var sc = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88));
    };
    img.onerror = function () { reject(new Error('Could not open the image')); };
    img.src = u;
  });
}
async function uploadImage(file) {
  var dataUrl = await imageToDataUrl(file);
  var r = await api('POST', '/api/image', { dataUrl: dataUrl });
  return r.url;
}

/*
 * Notes editor (like a Miro doc): bold, italic, underline, strike, bullet and numbered lists, highlight colours.
 * opts.onChange(html) is called (debounced) while typing.
 */
function makeNotes(root, opts) {
  root.innerHTML =
    '<div class="notes">' +
    '<div class="ntools" role="toolbar" aria-label="Formatting">' +
    '<button type="button" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>' +
    '<button type="button" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>' +
    '<button type="button" data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>' +
    '<button type="button" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>' +
    '<span class="vs"></span>' +
    '<button type="button" data-cmd="insertUnorderedList" title="Bulleted list">• List</button>' +
    '<button type="button" data-cmd="insertOrderedList" title="Numbered list (or type “1. ”)">1. List</button>' +
    '<button type="button" data-tog="1" title="Drop-down list that can be hidden (or type “> ”)">▸ Drop-down</button>' +
    '<button type="button" data-pic="1" title="Add a photo or screenshot (you can also paste or drop one)">🖼 Photo</button><input type="file" accept="image/*" hidden class="npicf">' +
    '<span class="vs"></span>' +
    ['h1', 'h2', 'h3', 'h4', 'h5'].map(function (h) { return '<button type="button" data-hl="' + h + '" title="Highlight"><span class="hsw ' + h + '"></span></button>'; }).join('') +
    '<button type="button" data-hl="" title="Clear formatting">⌫</button>' +
    '<span style="flex:1"></span><span class="nsaved"></span>' +
    '</div>' +
    '<div class="ndoc" contenteditable="true" data-ph="' + esc(opts.placeholder || 'Write your notes here…') + '"></div>' +
    '</div>';
  var doc = $('.ndoc', root), saved = $('.nsaved', root), timer = null, lastSet = '';
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  function changed() {
    saved.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(function () { lastSet = doc.innerHTML; opts.onChange(doc.innerHTML); saved.textContent = 'Saved'; }, 400);
  }
  $('.ntools', root).addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
  $('.ntools', root).addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    doc.focus();
    try { document.execCommand('styleWithCSS', false, false); } catch (err) {}
    if (b.dataset.pic) { $('.npicf', root).click(); return; }
    if (b.dataset.tog) { insertToggle(); }
    else if (b.dataset.cmd) document.execCommand(b.dataset.cmd, false, null);
    else if ('hl' in b.dataset) {
      var s = getSelection(); if (!s.rangeCount || s.isCollapsed) { if (!b.dataset.hl) document.execCommand('removeFormat'); return; }
      var txt = s.toString();
      if (!b.dataset.hl) { document.execCommand('removeFormat'); document.execCommand('insertText', false, txt); }
      else document.execCommand('insertHTML', false, '<mark class="' + b.dataset.hl + '">' + esc(txt).replace(/\n/g, '<br>') + '</mark>&#8203;');
    }
    changed();
  });
  // раскрывающийся список: заголовок + скрываемый текст
  function insertToggle() {
    var s = getSelection(), t = s && !s.isCollapsed ? s.toString().trim() : '';
    document.execCommand('insertHTML', false, '<details open><summary>' + esc(t || 'Title') + '</summary><div>Hidden text…</div></details><p><br></p>');
    var ss = doc.querySelectorAll('summary'), su = ss[ss.length - 1];
    if (!t) { ss = Array.prototype.filter.call(ss, function (x) { return x.textContent === 'Title'; }); su = ss[ss.length - 1]; }
    if (su) { var r = document.createRange(); r.selectNodeContents(su); s.removeAllRanges(); s.addRange(r); }
  }
  // «- » → точки, «1. » → нумерация, «> » → раскрывающийся список
  doc.addEventListener('keydown', function (e) {
    if (e.key !== ' ') return;
    var s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return;
    var r = s.getRangeAt(0), blk = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
    while (blk && blk !== doc && !/^(DIV|P|LI|SUMMARY)$/.test(blk.nodeName)) blk = blk.parentNode;
    if (!blk || blk.nodeName === 'LI' || blk.nodeName === 'SUMMARY') return;
    var pre = document.createRange(); pre.setStart(blk, 0); pre.setEnd(r.startContainer, r.startOffset);
    var t = pre.toString();
    if (t !== '-' && t !== '*' && t !== '•' && !/^1[.)]$/.test(t) && t !== '>') return;
    e.preventDefault();
    for (var i = 0; i < t.length; i++) document.execCommand('delete');
    if (t === '>') insertToggle(); else document.execCommand(/^1/.test(t) ? 'insertOrderedList' : 'insertUnorderedList');
    changed();
  });
  // клик по треугольнику свернёт или развернёт список
  doc.addEventListener('click', function (e) {
    var su = e.target.closest && e.target.closest('summary'); if (!su) return;
    var rc = su.getBoundingClientRect();
    if (e.clientX - rc.left < 22) { e.preventDefault(); su.parentNode.open = !su.parentNode.open; }
    else e.preventDefault();
  });
  doc.addEventListener('input', changed);
  function addPic(f) {
    if (!f || !/^image\//.test(f.type) || !doc.isContentEditable) return;
    saved.textContent = 'Uploading…';
    uploadImage(f).then(function (url) { doc.focus(); document.execCommand('insertHTML', false, '<img src="' + url + '" alt=""><br>'); changed(); }).catch(function (err) { saved.textContent = (err && err.message) || 'Upload failed'; });
  }
  $('.npicf', root).addEventListener('change', function () { addPic(this.files[0]); this.value = ''; });
  doc.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function (t) { return t === 'Files'; })) e.preventDefault(); });
  doc.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) { e.preventDefault(); addPic(f); } });
  doc.addEventListener('paste', function (e) {
    var fl = e.clipboardData && Array.prototype.filter.call(e.clipboardData.files || [], function (f) { return /^image\//.test(f.type); })[0];
    if (fl) { e.preventDefault(); addPic(fl); return; }
    e.preventDefault();
    var t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    document.execCommand('insertText', false, t);
  });
  return {
    set: function (html) { if (document.activeElement === doc && html === lastSet) return; if (document.activeElement !== doc || !doc.innerHTML.trim()) { doc.innerHTML = html || ''; lastSet = html; } },
    focus: function () { doc.focus(); },
    el: doc
  };
}

/* board card with cover photo and title */
function boardCard(e, href, actions, target) {
  var initials = String(e.title || 'Board').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase() || 'B';
  return '<div class="bcard" data-e="' + e.id + '"><a class="bcover' + (e.cover ? ' img' : '') + '" href="' + href + '"' + (target ? ' target="_blank" rel="noopener"' : '') + (e.cover ? ' style="background-image:url(\'' + esc(e.cover) + '\')"' : '') + ' aria-label="Open ' + esc(e.title) + '">' + (e.cover ? '' : '<span class="mono">' + esc(initials) + '</span>') + '</a>' +
    '<a class="btitle" href="' + href + '"' + (target ? ' target="_blank" rel="noopener"' : '') + ' title="' + esc(e.title) + '">' + esc(e.title) + '</a>' +
    '<div class="bsub">' + (e.updatedAt || e.createdAt ? 'Updated ' + ago(e.updatedAt || e.createdAt) : '') + '</div>' + (actions ? '<div class="bacts">' + actions + '</div>' : '') + '</div>';
}
document.addEventListener('click', function (e) { $$('details.bmore[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; }); });

/* название платформы и цвет панелей — из настроек владельца (кэшируем, чтобы не мигало) */
var BRAND = { name: 'Speak&Teach', theme: 'sage', font: 'Caveat', consent: '' };
var BRAND_FONTS = ['Caveat', 'Marck Script', 'Bad Script', 'Neucha', 'Pangolin', 'Amatic SC', 'Lobster', 'Pacifico', 'Dancing Script', 'Great Vibes', 'Cormorant Garamond', 'Playfair Display', 'Yeseva One', 'Comfortaa'];
function loadBrandFonts(all) {
  var fs = all ? BRAND_FONTS : [BRAND.font || 'Caveat'], id = all ? 'brandFontsAll' : 'brandFont1';
  if (document.getElementById(id) || (!all && fs[0] === 'Caveat')) return;
  var l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?' + fs.map(function (f) { return 'family=' + f.replace(/ /g, '+'); }).join('&') + '&display=swap';
  document.head.appendChild(l);
}
try { var _b = JSON.parse(localStorage.getItem('klass.brand') || 'null'); if (_b && _b.name) BRAND = _b; } catch (e) {}
var THEMES = {
  sage: ['#C3CAAA', '#E6DABA', '#F1BF4C'], peach: ['#F2B9A0', '#F6D9B8', '#F6CF6A'], lilac: ['#CDBFE3', '#EBD9E8', '#F2B9A0'],
  mint: ['#A9D6C2', '#D7ECDF', '#A7C7F2'], sky: ['#A7C7F2', '#D6E4F7', '#CDBFE3'], rose: ['#F4A7B9', '#F9D3D0', '#FFD39B'],
  ocean: ['#6FB1C8', '#A9D3DF', '#2F6FE0'], graphite: ['#9A978C', '#CFCBC0', '#3B3A33']
};
// смешать два цвета (#rrggbb), p — доля второго
function mixHex(a, b, p) { var A = parseInt(a.slice(1), 16), Bc = parseInt(b.slice(1), 16), o = [16, 8, 0].map(function (s) { var x = (A >> s) & 255, y = (Bc >> s) & 255; return Math.round(x + (y - x) * p); }); return '#' + o.map(function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
function themeColors() { return THEMES[BRAND.theme] || THEMES.sage; }
// палитра для игр и виджетов в цвете выбранной темы (8 оттенков)
function themePalette() { var c = themeColors(); return [c[0], c[2], c[1], mixHex(c[0], c[2], .5), mixHex(c[0], '#000000', .12), mixHex(c[2], '#000000', .12), mixHex(c[1], c[2], .5), mixHex(c[0], c[1], .5)]; }
function applyTheme(t) {
  var c = THEMES[t] || THEMES.sage, r = document.documentElement.style, W = '#FFFDF8';
  r.setProperty('--t1', c[0]); r.setProperty('--t2', c[1]); r.setProperty('--t3', c[2]);
  r.setProperty('--tpage', 'linear-gradient(115deg,' + mixHex(c[0], W, .4) + ' 0%,' + mixHex(c[1], W, .45) + ' 38%,' + mixHex(c[1], W, .2) + ' 64%,' + mixHex(c[2], W, .25) + ' 100%)');
  r.setProperty('--tside', 'linear-gradient(170deg,' + mixHex(c[0], W, .55) + ' 0%,' + mixHex(c[1], W, .5) + ' 55%,' + mixHex(c[2], W, .35) + ' 100%)');
  r.setProperty('--tdeck', 'linear-gradient(135deg,' + mixHex(c[0], W, .3) + ',' + mixHex(c[1], W, .2) + ' 55%,' + c[2] + ')');
  r.setProperty('--tsoft', mixHex(c[2], W, .85)); r.setProperty('--tacc', c[2]); r.setProperty('--mustard', c[2]); r.setProperty('--honey', c[2]);
  var fld = mixHex(c[1], W, .85), fi = parseInt(fld.slice(1), 16);
  r.setProperty('--field', fld); r.setProperty('--dotc', mixHex(mixHex(c[0], '#9A978C', .55), W, .4)); r.setProperty('--cardline', mixHex(c[1], '#B9B3A0', .35));
  r.setProperty('--solid', fld); r.setProperty('--glass', 'rgba(' + (fi >> 16 & 255) + ',' + (fi >> 8 & 255) + ',' + (fi & 255) + ',.86)');
  r.setProperty('--bg', mixHex(c[1], W, .82)); r.setProperty('--ui2', mixHex(c[1], W, .6)); r.setProperty('--uiline', mixHex(c[1], '#9A978C', .25));
  var g = 'linear-gradient(105deg,' + c[0] + ' 0%,' + c[1] + ' 48%,' + c[2] + ' 100%)';
  var soft = 'linear-gradient(105deg,color-mix(in srgb,' + c[0] + ' 55%,#fff) 0%,color-mix(in srgb,' + c[1] + ' 55%,#fff) 52%,color-mix(in srgb,' + c[2] + ' 60%,#fff) 100%)';
  r.setProperty('--leak', g); r.setProperty('--ring', g); r.setProperty('--leak-fill', soft); r.setProperty('--fillg', soft);
}
function brandText(s) { return String(s || '').replace(/Speak&(amp;)?Teach/g, BRAND.name); }
function applyBrand(b) {
  if (b) { BRAND = { name: b.name || 'Speak&Teach', theme: b.theme || 'sage', font: BRAND_FONTS.indexOf(b.font) >= 0 ? b.font : 'Caveat', consent: b.consent || '' }; try { localStorage.setItem('klass.brand', JSON.stringify(BRAND)); } catch (e) {} }
  applyTheme(BRAND.theme);
  document.title = brandText(document.title);
  $$('[aria-label*="Speak&"]').forEach(function (n) { n.setAttribute('aria-label', BRAND.name); });
  drawLogos();
  try { window.dispatchEvent(new Event('brandchange')); } catch (e) {}
}
// текст согласия: ссылки становятся кликабельными
function consentHtml(t) { return esc(t || '').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>'); }
/* логотип: рукописное название, которое «пишется карандашом» при загрузке */
function drawLogos() {
  loadBrandFonts(false);
  var nm = BRAND.name || 'Speak&Teach', len = Math.max(4, nm.length), tl = Math.min(400, Math.round(len * 30));
  var svg = '<svg class="logo" viewBox="0 0 420 110" role="img" aria-label="' + esc(nm) + '"><defs><filter id="pencil" x="-5%" y="-20%" width="110%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter></defs>' +
    '<text x="8" y="78" style="font-family:\'' + (BRAND.font || 'Caveat') + '\',cursive;font-weight:' + (/^(Caveat|Amatic SC)$/.test(BRAND.font || 'Caveat') ? 700 : 400) + '" textLength="' + tl + '" lengthAdjust="spacingAndGlyphs" filter="url(#pencil)">' + esc(nm) + '</text></svg>';
  $$('[data-logo]').forEach(function (el) { el.innerHTML = svg; });
  var go = function () { $$('.logo').forEach(function (l) { l.classList.add('go'); }); };
  if (document.fonts && document.fonts.load) Promise.race([document.fonts.load('64px "' + (BRAND.font || 'Caveat') + '"'), new Promise(function (r) { setTimeout(r, 1500); })]).then(go); else go();
}
function startBrand() { applyBrand(); fetch('/api/brand', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (b) { var ch = b.name !== BRAND.name || b.theme !== BRAND.theme || (b.font || 'Caveat') !== (BRAND.font || 'Caveat'); BRAND.consent = b.consent || ''; if (ch) applyBrand(b); else try { localStorage.setItem('klass.brand', JSON.stringify(b)); } catch (e) {} }).catch(function () {}); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBrand); else startBrand();

/* восстановление из резервной копии: файл уходит частями, чтобы не упереться в лимит хостинга на размер запроса */
async function uploadRestore(f, progress) {
  var up = Math.random().toString(36).slice(2, 12) + Date.now().toString(36), off = 0, size = 4 * 1048576;
  while (off < f.size) {
    var part = f.slice(off, off + size);
    var r = await fetch('/api/restore-chunk?up=' + up + '&off=' + off, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: part, credentials: 'same-origin' });
    if (r.status === 413 && size > 262144) { size = Math.floor(size / 2); continue; }   // хостинг режет большие куски — уменьшаем
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || (r.status === 413 ? 'The server does not accept the file (payload too large)' : 'Upload failed (' + r.status + ')'));
    off += part.size;
    if (progress) progress(Math.round(off / f.size * 100));
  }
  var r2 = await fetch('/api/restore-all?up=' + up, { method: 'POST', credentials: 'same-origin' });
  var j2 = await r2.json().catch(function () { return {}; });
  if (!r2.ok) throw new Error(j2.error || 'Restore failed');
  return j2;
}
