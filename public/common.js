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
    '<button type="button" data-cmd="insertOrderedList" title="Numbered list">1. List</button>' +
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
    if (b.dataset.cmd) document.execCommand(b.dataset.cmd, false, null);
    else if ('hl' in b.dataset) {
      var s = getSelection(); if (!s.rangeCount || s.isCollapsed) { if (!b.dataset.hl) document.execCommand('removeFormat'); return; }
      var txt = s.toString();
      if (!b.dataset.hl) { document.execCommand('removeFormat'); document.execCommand('insertText', false, txt); }
      else document.execCommand('insertHTML', false, '<mark class="' + b.dataset.hl + '">' + esc(txt).replace(/\n/g, '<br>') + '</mark>&#8203;');
    }
    changed();
  });
  doc.addEventListener('input', changed);
  doc.addEventListener('paste', function (e) {
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

/* логотип: рукописный Speak&Teach, который «пишется карандашом» при загрузке */
function drawLogos() {
  var svg = '<svg class="logo" viewBox="0 0 420 110" role="img" aria-label="Speak&amp;Teach"><defs><filter id="pencil" x="-5%" y="-20%" width="110%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter></defs>' +
    '<text x="8" y="78" textLength="400" lengthAdjust="spacingAndGlyphs" filter="url(#pencil)">Speak&amp;Teach</text></svg>';
  $$('[data-logo]').forEach(function (el) { el.innerHTML = svg; });
  var go = function () { $$('.logo').forEach(function (l) { l.classList.add('go'); }); };
  if (document.fonts && document.fonts.load) Promise.race([document.fonts.load('700 64px Caveat'), new Promise(function (r) { setTimeout(r, 1500); })]).then(go); else go();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', drawLogos); else drawLogos();
