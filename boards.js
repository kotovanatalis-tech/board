'use strict';
/*
 * Логика общей доски: формат элементов, фреймы, видимость, проверка ответов и операции участников.
 * Доска безграничная: координаты могут быть любыми.
 *
 * Элементы (x,y — левый верхний угол, у карточек и стикеров — центр):
 *   frame     {x,y,w,h,title,color,collapsed,hidden,private,claim,owners:[{id,name}]}
 *             — фрейм: урок или задание. Всё, что внутри, двигается вместе с ним.
 *               collapsed — свёрнут до заголовка; hidden — скрыт от учеников;
 *               private — содержимое видят только владельцы и учитель; claim — ученик может «занять» фрейм
 *   text      {x,y,w,text,size,color,bold}
 *   zone      {x,y,w,h,title,color}                      — корзина / колонка / место для пары
 *   card      {x,y,text,color,answer,hx,hy,slot}         — карточка; answer — id зоны-ответа; hx,hy — исходное место
 *   sentence  {x,y,w,size,parts:[ 'text', {slot,answer}, ... ]}
 *   note      {x,y,w,h,text,color,by}
 *   image     {x,y,w,h,src,by}
 *   sticker   {x,y,emoji,size,by}
 *   wheel     {x,y,size,items:[...],angle,spin:{at,res,by,from}}   — колесо фортуны
 *   flip      {x,y,w,h,front:{text,src},back:{text,src},flipped}  — карточка-перевёртыш
 *   scale     {x,y,w,title,left,right,votes:{id:{v,name}}}         — шкала для голосования
 *   dice      {x,y,size,count,values:[...],rolled:{at,by}}         — кубики
 * Рисунки: strokes [{id,pts:[[x,y],...],color,w,kind,by}]
 */
const crypto = require('crypto');
const Games = require('./games');
Games.init({ str: (v, m) => String(v == null ? '' : v).slice(0, m), num: (v, d, min, max) => { v = Number(v); return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v * 10) / 10)) : d; }, col: (v, d) => (/^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? String(v) : (d || '')), idOf: v => String(v == null ? '' : v).slice(0, 40).replace(/[^\w-]/g, ''), newId: () => crypto.randomBytes(5).toString('hex') });

const LIM = 1e6;
const newId = () => crypto.randomBytes(5).toString('hex');
const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const num = (v, d, min, max) => { v = Number(v); return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v * 10) / 10)) : d; };
const col = (v, d) => (/^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? String(v) : (d || ''));
const idOf = v => str(v, 40).replace(/[^\w-]/g, '');
const norm = s => String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
const clone = o => JSON.parse(JSON.stringify(o));

/* разметка текста в элементах: жирный, курсив, подчёркивание, цвет, маркер */
const RT_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'div', 'p', 'span', 'ul', 'ol', 'li', 'font', 'a', 'details', 'summary']);
const okColor = v => /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)|transparent)$/i.test(String(v).trim());
function cleanRich(html) {
  html = String(html || '').slice(0, 20000).replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const keep = [];
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (m, close, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!RT_TAGS.has(tag)) return '';
    if (tag === 'font') tag = 'span';
    let out;
    if (close) out = '</' + tag + '>';
    else if (tag === 'span') {
      const st = []; const sm = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i.exec(attrs);
      const fc = /color\s*=\s*"?(#[0-9a-f]{3,8})/i.exec(attrs);
      if (sm) (sm[1] || sm[2]).split(';').forEach(d => {
        const i = d.indexOf(':'); if (i < 0) return;
        const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
        if ((k === 'color' || k === 'background-color') && okColor(v)) st.push(k + ':' + v);
        if (k === 'font-weight' && /^(bold|[6-9]00)$/.test(v)) st.push('font-weight:700');
        if (k === 'font-style' && v === 'italic') st.push('font-style:italic');
        if (k === 'text-decoration' || k === 'text-decoration-line') { const t = v.match(/underline|line-through/g); if (t) st.push('text-decoration:' + t.join(' ')); }
      });
      else if (fc) st.push('color:' + fc[1]);
      out = st.length ? '<span style="' + st.join(';') + '">' : '<span>';
    } else if (tag === 'details') { out = '<details open>';   // раскрывающийся список: свернуть может каждый у себя
    } else if (tag === 'a') {
      // ссылки в тексте: только http(s) и ссылки на доски этого сайта
      const hm = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(attrs); const href = hm ? (hm[1] || hm[2] || '').replace(/&amp;/g, '&') : '';
      if (!/^(https?:\/\/[^\s"'<>]+|\/b\/[\w-]+(#[\w=&-]*)?)$/.test(href)) return '';
      out = '<a href="' + href.replace(/&/g, '&amp;') + '" target="_blank" rel="noopener noreferrer">';
    } else out = '<' + tag + '>';
    keep.push(out); return '\u0000' + (keep.length - 1) + '\u0000';
  });
  return html.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
}
const SHAPES = ['rect', 'round', 'ellipse', 'diamond', 'triangle', 'hexagon', 'parallelogram', 'star', 'arrow', 'speech'];
const FONTS = ['Unbounded', 'Nunito', 'Montserrat', 'Lora', 'Playfair Display', 'Caveat', 'Comfortaa', 'Rubik', 'Roboto Mono', 'PT Serif', 'Pacifico', 'Marck Script', 'Bad Script', 'Neucha', 'Pangolin', 'Amatic SC', 'Lobster', 'Dancing Script', 'Great Vibes', 'Open Sans', 'Roboto', 'PT Sans', 'Noto Sans', 'Arimo', 'Roboto Slab', 'Roboto Condensed', 'EB Garamond', 'Permanent Marker', 'Fredoka'];
const WBG = { table: 1, kanban: 1, kcard: 1, chart: 1, deck: 1, boxes: 1, cloud: 1, open: 1, todo: 1, poll: 1, rating: 1, input: 1, frame: 1, card: 1, zone: 1, flip: 1, ball: 1, wheel: 0 };
const TEXTY = { text: 1, note: 1, zone: 1, card: 1, frame: 1, sentence: 1, shape: 1 };
function styleFields(o, e) {
  if (TEXTY[o.type]) {
    if (FONTS.includes(e.font)) o.font = e.font;
    if (col(e.fc)) o.fc = col(e.fc);
    ['bold', 'italic', 'underline', 'strike'].forEach(k => { if (e[k]) o[k] = true; });
    if (['left', 'center', 'right'].includes(e.align)) o.align = e.align;
    if ((o.type === 'note' || o.type === 'shape') && ['top', 'bottom'].includes(e.va)) o.va = e.va;
  }
  if (e.lock) o.lock = true;
  if (e.g) o.g = idOf(e.g);
  if (e.tonly) o.tonly = true;
  if (e.step && o.type !== 'frame') o.step = num(e.step, 0, 0, 50) || undefined;
  if (e.play && typeof e.play === 'object' && (o.type === 'media' || o.type === 'video')) o.play = { on: !!e.play.on, t: num(e.play.t, 0, 0, 1e6), at: num(e.play.at, 0, 0, 1e15), by: str(e.play.by, 80) };
  if (Array.isArray(e.assign) && e.assign.length) o.assign = e.assign.slice(0, 40).map(w => ({ id: idOf(w && w.id), name: str(w && w.name, 80) })).filter(w => w.id);
  if (e.anon) o.anon = true;
  if (e.priv) o.priv = true;
  if (o.type === 'shape' && e.by) o.by = idOf(e.by);
  if (e.tnote) o.tnote = str(e.tnote, 3000);
  if (e.tk) o.tk = idOf(e.tk);   // одно задание из шаблона: общая кнопка Check
  if (Array.isArray(e.tnimg)) { const im = e.tnimg.filter(u => /^\/img\/\w+\.(png|jpe?g|webp|gif)$/.test(String(u))).slice(0, 6); if (im.length) o.tnimg = im; }   // фото и скриншоты в заметке учителя
  if (TEXTY[o.type] && col(e.hl)) o.hl = col(e.hl);
  if ((o.type === 'text' || o.type === 'note' || o.type === 'shape') && e.html) o.html = cleanRich(e.html);
  if (o.type === 'image') {
    o.opacity = num(e.opacity, 1, 0.05, 1); o.radius = num(e.radius, 0, 0, 50);
    o.shape = ['rect', 'round', 'circle', 'diamond', 'hexagon', 'triangle', 'star'].includes(e.shape) ? e.shape : 'rect';
    o.bw = num(e.bw, 0, 0, 40); o.bc = col(e.bc, '#1E1E1C');
    if (e.crop && typeof e.crop === 'object') {
      const cx = num(e.crop.x, 0, 0, 0.95), cy = num(e.crop.y, 0, 0, 0.95);
      o.crop = { x: cx, y: cy, w: num(e.crop.w, 1, 0.05, 1 - cx), h: num(e.crop.h, 1, 0.05, 1 - cy) };
    }
    o.cover = !!e.cover; o.coverColor = col(e.coverColor);
  }
  if (o.type === 'note' || o.type === 'image') {
    o.reacts = {};
    if (e.reacts && typeof e.reacts === 'object') Object.keys(e.reacts).slice(0, 12).forEach(k => {
      const ids = (Array.isArray(e.reacts[k]) ? e.reacts[k] : []).slice(0, 200).map(idOf).filter(Boolean);
      if (ids.length) o.reacts[str(k, 8)] = ids;
    });
  }
  if (o.type === 'frame') { o.fill = col(e.fill); o.lite = !!e.lite; if (['cork', 'lines', 'grid', 'dots'].includes(e.tex)) o.tex = e.tex; }   // доска детектива: пробковая текстура
  if (o.type === 'note' && e.pin) o.pin = true;                                            // стикер «приколот кнопкой»
  if (o.type === 'line' && e.thread) o.thread = true;                                      // красная нить между уликами
  if (/^(image|shape|text|note|sticker|flip|card|deck|dice|zone|coin)$/.test(o.type) && Number(e.rot)) o.rot = num(e.rot, 0, -360, 360);
  if (o.type !== 'frame' && Number(e.blur) > 0) o.blur = num(e.blur, 0, 0, 40);
  // цвет или градиент для виджетов: {a, b, ang}
  // обводка у виджетов, таблиц, канбана и игр
  if ((WBG[o.type] || Games.has(o.type) || /^(scale|wheel|dice|coin|link|media|video|html|input|sentence|text|image|flip|ball)$/.test(o.type)) && num(e.ow, 0, 0, 30)) { o.ow = num(e.ow, 0, 0, 30); o.oc = col(e.oc, '#2E2F25'); }
  if ((WBG[o.type] || Games.has(o.type)) && e.bg && typeof e.bg === 'object' && col(e.bg.a)) o.bg = { a: col(e.bg.a), b: col(e.bg.b), ang: num(e.bg.ang, 135, 0, 360) };
  return o;
}
function sanitizeEl(e) {
  const o = sanitizeBase(e);
  return o ? styleFields(o, e) : null;
}
function sanitizeBase(e) {
  if (!e || typeof e !== 'object') return null;
  const t = e.type;
  const o = { id: idOf(e.id) || newId(), type: t, x: num(e.x, 100, -LIM, LIM), y: num(e.y, 100, -LIM, LIM) };
  if (t === 'frame') {
    o.w = num(e.w, 1400, 120, 40000); o.h = num(e.h, 900, 80, 40000); o.title = str(e.title, 200); if (/^klass-clip/.test(o.title)) o.title = 'Frame'; o.color = col(e.color);
    o.collapsed = !!e.collapsed; o.hidden = !!e.hidden; o.veil = !!e.veil; o.private = !!e.private; o.claim = !!e.claim; o.ro = !!e.ro; o.seq = !!e.seq; o.gates = cleanGates(e.gates);
    if (e.open != null && e.open !== '') o.open = num(e.open, 0, 0, 999);
    o.owners = (Array.isArray(e.owners) ? e.owners : []).slice(0, 12).map(w => ({ id: idOf(w && w.id), name: str(w && w.name, 80) })).filter(w => w.id);
  } else if (t === 'text') {
    o.w = num(e.w, 700, 20, 20000); o.text = str(e.text, 6000); o.size = num(e.size, 22, 4, 400);
    o.color = col(e.color); o.bold = !!e.bold;
  } else if (t === 'zone') {
    o.w = num(e.w, 320, 40, 20000); o.h = num(e.h, 280, 30, 20000); o.title = str(e.title, 300); o.color = col(e.color); o.size = num(e.size, 16, 3, 300);
  } else if (t === 'card') {
    o.text = str(e.text, 300); o.color = col(e.color); o.size = num(e.size, 18, 6, 200);
    o.answer = e.answer ? idOf(e.answer) : null;
    o.hx = num(e.hx, o.x, -LIM, LIM); o.hy = num(e.hy, o.y, -LIM, LIM);
    o.slot = e.slot ? idOf(e.slot) : null;
  } else if (t === 'sentence') {
    o.w = num(e.w, 1000, 40, 20000); o.size = num(e.size, 22, 6, 200);
    o.parts = (Array.isArray(e.parts) ? e.parts : []).slice(0, 300).map(p => {
      if (typeof p === 'string') return str(p, 3000);
      if (p && p.slot) { const q = { slot: idOf(p.slot), answer: str(p.answer, 300) }; if (p.hint) { q.hint = str(p.hint, 300); q.hk = p.hk === 'letter' ? 'letter' : 'text'; } return q; }
      return null;
    }).filter(p => p !== null);
  } else if (t === 'note') {
    o.w = num(e.w, 200, 60, 3000); o.h = num(e.h, 200, 50, 3000); o.text = str(e.text, 3000);
    o.color = col(e.color, '#FFE38A'); o.by = idOf(e.by); o.size = num(e.size, 0, 0, 200);
  } else if (t === 'image') {
    o.w = num(e.w, 320, 20, 20000); o.h = num(e.h, 220, 20, 20000);
    const src = String(e.src || '');
    if (!/^\/img\/\w+\.(jpg|png|webp|gif)$/.test(src) && !/^https:\/\/[^\s"'<>]+$/.test(src)) return null;
    o.src = str(src, 1500); o.by = idOf(e.by);
    if (Number(e.irot)) o.irot = num(e.irot, 0, -180, 180);
  } else if (t === 'sticker') {
    o.emoji = str(e.emoji, 16); if (!o.emoji.trim()) return null;
    o.size = num(e.size, 56, 12, 400); o.by = idOf(e.by);
  } else if (t === 'shape') {
    o.w = num(e.w, 200, 10, 20000); o.h = num(e.h, 140, 10, 20000);
    o.shape = SHAPES.includes(e.shape) ? e.shape : 'rect';
    o.fill = e.fill === 'none' ? 'none' : col(e.fill, '#FFFFFF'); o.stroke = col(e.stroke, '#1E1E1C'); o.sw = num(e.sw, 2, 0, 40);
    o.radius = num(e.radius, 0, 0, 500); o.text = str(e.text, 5000); o.size = num(e.size, 18, 6, 300);
    o.opacity = num(e.opacity, 1, 0.05, 1); o.dash = !!e.dash;
  } else if (Games.has(t)) {
    Games.san(t, e, o);
  } else if (t === 'line') {
    o.x2 = num(e.x2, o.x + 200, -LIM, LIM); o.y2 = num(e.y2, o.y, -LIM, LIM);
    o.from = e.from ? idOf(e.from) : null; o.to = e.to ? idOf(e.to) : null;
    o.color = col(e.color, '#1E1E1C'); o.sw = num(e.sw, 2, 1, 30);
    o.start = ['none', 'arrow', 'dot'].includes(e.start) ? e.start : 'none'; o.end = ['none', 'arrow', 'dot'].includes(e.end) ? e.end : 'arrow';
    o.dash = !!e.dash; o.curve = !!e.curve; o.text = str(e.text, 300);
  } else if (t === 'html') {
    o.w = num(e.w, 720, 160, 6000); o.h = num(e.h, 520, 100, 6000); o.title = str(e.title, 160);
    if (!/^\/bh\/\w+\/\w+$/.test(String(e.src || ''))) return null;
    o.src = String(e.src); o.zoom = num(e.zoom, 1, 0.15, 3);
    o.state = null;
    if (e.state && Array.isArray(e.state.f)) o.state = { at: num(e.state.at, 0, 0, 1e15), by: str(e.state.by, 80), f: e.state.f.slice(0, 600).map(x => ({ v: str(x && x.v, 2000), c: str(x && x.c, 300), k: x && x.k ? 1 : 0 })) };
  } else if (t === 'wheel') {
    o.size = num(e.size, 380, 60, 3000);
    o.items = (Array.isArray(e.items) ? e.items : []).slice(0, 40).map(x => str(x, 80)).filter(x => x.trim());
    o.angle = num(e.angle, 0, -1e9, 1e9);
    o.spin = e.spin && typeof e.spin === 'object' ? { at: num(e.spin.at, 0, 0, 1e15), res: num(e.spin.res, 0, 0, 40), by: str(e.spin.by, 80), from: num(e.spin.from, 0, -1e9, 1e9) } : null;
  } else if (t === 'flip') {
    o.w = num(e.w, 260, 40, 3000); o.h = num(e.h, 180, 30, 3000);
    const side = s => {
      s = s && typeof s === 'object' ? s : {};
      const src = String(s.src || '');
      return { text: str(s.text, 1000), src: /^\/img\/\w+\.(jpg|png|webp|gif)$/.test(src) ? src : '' };
    };
    o.writes = (Array.isArray(e.writes) ? e.writes : []).slice(0, 60).map(w => ({ by: idOf(w && w.by), name: str(w && w.name, 80), text: str(w && w.text, 300), shown: !!(w && w.shown) })).filter(w => w.by && w.text);   // приватные записи учеников на обратной стороне
    o.front = side(e.front); o.back = side(e.back); o.flipped = !!e.flipped; o.color = col(e.color); o.fill = col(e.fill);
  } else if (t === 'scale') {
    o.w = num(e.w, 700, 120, 6000); o.title = str(e.title, 300); o.left = str(e.left, 80); o.right = str(e.right, 80);
    o.votes = {};
    if (e.votes && typeof e.votes === 'object') Object.keys(e.votes).slice(0, 200).forEach(k => { const v = e.votes[k]; if (v) o.votes[idOf(k)] = { v: num(v.v, 50, 0, 100), name: str(v.name, 80) }; });
  } else if (t === 'rating') {
    o.w = num(e.w, 420, 120, 6000); o.title = str(e.title, 300); o.max = num(e.max, 5, 3, 10);
    o.votes = {};
    if (e.votes && typeof e.votes === 'object') Object.keys(e.votes).slice(0, 300).forEach(k => { const v = e.votes[k]; if (v) o.votes[idOf(k)] = { v: num(v.v, 1, 1, o.max), name: str(v.name, 80) }; });
  } else if (t === 'poll') {
    o.w = num(e.w, 460, 160, 6000); o.title = str(e.title, 300);
    o.options = (Array.isArray(e.options) ? e.options : []).slice(0, 12).map(x => str(x, 160)).filter(x => x.trim());
    o.votes = {}; o.hideNames = !!e.hideNames;
    if (e.votes && typeof e.votes === 'object') Object.keys(e.votes).slice(0, 300).forEach(k => { const v = e.votes[k]; if (v) o.votes[idOf(k)] = { v: num(v.v, 0, 0, Math.max(0, o.options.length - 1)), name: str(v.name, 80) }; });
  } else if (t === 'deck') {
    o.w = num(e.w, 300, 120, 3000); o.h = num(e.h, 200, 80, 3000); o.title = str(e.title, 200);
    o.items = (Array.isArray(e.items) ? e.items : []).slice(0, 200).map(x => str(x, 300)).filter(x => x.trim());
    o.order = (Array.isArray(e.order) ? e.order : []).map(n => num(n, 0, 0, 199)).filter(n => n < o.items.length);
    if (o.order.length !== o.items.length) o.order = o.items.map((_, i) => i);
    o.dealt = num(e.dealt, 0, 0, o.items.length); o.by = idOf(e.by);
  } else if (t === 'boxes') {
    o.w = num(e.w, 520, 160, 6000); o.title = str(e.title, 200); o.cols = num(e.cols, 4, 1, 10);
    o.items = (Array.isArray(e.items) ? e.items : []).slice(0, 60).map(x => str(x, 300));
    o.open = (Array.isArray(e.open) ? e.open : []).slice(0, o.items.length).map(Boolean);
    while (o.open.length < o.items.length) o.open.push(false);
  } else if (t === 'ball') {
    o.size = num(e.size, 260, 80, 2000); o.title = str(e.title, 200);
    o.items = (Array.isArray(e.items) ? e.items : []).slice(0, 200).map(x => str(x, 300)).filter(x => x.trim());
    o.res = e.res && typeof e.res === 'object' ? { i: num(e.res.i, 0, 0, 199), at: num(e.res.at, 0, 0, 1e15), by: str(e.res.by, 80) } : null;
  } else if (t === 'cloud') {
    o.w = num(e.w, 560, 160, 6000); o.h = num(e.h, 340, 100, 6000); o.title = str(e.title, 200);
    o.words = (Array.isArray(e.words) ? e.words : []).slice(0, 300).map(x => ({ t: str(x && x.t, 60), by: (Array.isArray(x && x.by) ? x.by : []).slice(0, 300).map(idOf) })).filter(x => x.t.trim() && x.by.length);
  } else if (t === 'table') {
    // простая таблица: ширины колонок, высоты строк, текст ячеек
    const cols = (Array.isArray(e.cols) ? e.cols : [220, 220, 220]).slice(0, 30).map(v => num(v, 220, 40, 2000));
    const rows = (Array.isArray(e.rows) ? e.rows : [150, 150, 150]).slice(0, 80).map(v => num(v, 150, 24, 2000));
    o.cols = cols.length ? cols : [220]; o.rows = rows.length ? rows : [150];
    o.cells = o.rows.map((_, r) => o.cols.map((__, c) => str(Array.isArray(e.cells) && Array.isArray(e.cells[r]) ? e.cells[r][c] : '', 1000)));
    o.title = str(e.title, 200); o.size = num(e.size, 18, 6, 200); o.head = !!e.head; o.lc = col(e.lc);
    o.w = o.cols.reduce((a, v) => a + v, 0); o.h = o.rows.reduce((a, v) => a + v, 0);
  } else if (t === 'kanban' || t === 'kcard') {
    // канбан: колонки и карточки с подробностями; kcard — одна такая карточка прямо на доске
    const card = c => ({ id: idOf(c && c.id) || newId(), col: idOf(c && c.col), title: str(c && c.title, 200), desc: str(c && c.desc, 4000), prio: ['', 'low', 'med', 'high'].includes(c && c.prio) ? c.prio : '', who: str(c && c.who, 80), start: /^\d{4}-\d\d-\d\d$/.test(c && c.start) ? c.start : '', end: /^\d{4}-\d\d-\d\d$/.test(c && c.end) ? c.end : '', tags: (Array.isArray(c && c.tags) ? c.tags : []).slice(0, 12).map(x => str(x, 30).trim()).filter(Boolean), color: col(c && c.color) });
    if (t === 'kanban') {
      o.title = str(e.title, 200); o.w = num(e.w, 1080, 360, 8000);
      o.cols = (Array.isArray(e.cols) ? e.cols : []).slice(0, 12).map(c => ({ id: idOf(c && c.id) || newId(), name: str(c && c.name, 60), color: col(c && c.color, '#D9D9D6') }));
      if (!o.cols.length) o.cols = [{ id: 'todo', name: 'Not Started', color: '#D9D9D6' }, { id: 'doing', name: 'In Progress', color: '#B5CBF5' }, { id: 'done', name: 'Complete', color: '#A9DFB1' }];
      const ids = new Set(o.cols.map(c => c.id));
      o.cards = (Array.isArray(e.cards) ? e.cards : []).slice(0, 300).map(card).map(c => { if (!ids.has(c.col)) c.col = o.cols[0].id; return c; });
    } else {
      Object.assign(o, card(e.card || e)); o.id = idOf(e.id) || newId(); o.w = num(e.w, 320, 160, 2000);
      o.status = str(e.status, 40);
    }
  } else if (t === 'chart') {
    // свой график: столбцы, полосы, линия, круг, кольцо
    o.w = num(e.w, 620, 160, 6000); o.h = num(e.h, 420, 120, 6000); o.title = str(e.title, 200);
    o.kind = ['bar', 'hbar', 'line', 'pie', 'donut'].includes(e.kind) ? e.kind : 'bar';
    o.pal = ['brand', 'pastel', 'bold', 'mono'].includes(e.pal) ? e.pal : 'brand';
    o.unit = str(e.unit, 12); o.vals = e.vals !== false;
    o.rows = (Array.isArray(e.rows) ? e.rows : []).slice(0, 40).map(r => ({ l: str(r && r.l, 80), v: num(r && r.v, 0, -1e9, 1e9) }));
  } else if (t === 'open') {
    // Open ended: начало фразы, ученики дописывают своё продолжение — ответы видны в облаке
    o.w = num(e.w, 760, 200, 6000); o.h = num(e.h, 520, 160, 6000); o.title = str(e.title, 300);
    o.answers = (Array.isArray(e.answers) ? e.answers : []).slice(0, 300).map(x => ({ id: idOf(x && x.id) || newId(), t: str(x && x.t, 400), by: idOf(x && x.by), name: str(x && x.name, 80), at: num(x && x.at, 0, 0, 1e15) })).filter(x => x.t.trim());
  } else if (t === 'input') {
    o.w = num(e.w, 600, 80, 6000); o.size = num(e.size, 20, 6, 200); o.label = str(e.label, 600);
    o.answers = (Array.isArray(e.answers) ? e.answers : []).slice(0, 12).map(x => str(x, 600)).filter(x => x.trim());
    o.value = str(e.value, 1000); o.vby = str(e.vby, 80); o.hint = str(e.hint, 300);
  } else if (t === 'todo') {
    o.w = num(e.w, 360, 120, 6000); o.title = str(e.title, 300); o.size = num(e.size, 18, 6, 200);
    o.items = (Array.isArray(e.items) ? e.items : []).slice(0, 80).map(x => { const it = { t: str(x && x.t, 300), done: !!(x && x.done), by: str(x && x.by, 80) }; if (x && x.h) it.h = cleanRich(str(x.h, 3000)); return it; }).filter(x => x.t.trim());
  } else if (t === 'media') {
    o.w = num(e.w, 420, 120, 6000); o.h = num(e.h, 80, 40, 6000);
    const src = String(e.src || '');
    if (!/^\/media\/\w+\.(mp3|m4a|ogg|oga|wav|webm|mp4|mov|m4v)$/.test(src)) return null;
    o.src = src; o.kind = /\.(mp4|mov|m4v|webm)$/.test(src) && e.kind !== 'audio' ? 'video' : 'audio'; o.title = str(e.title, 160);
    o.start = num(e.start, 0, 0, 1e6); o.end = num(e.end, 0, 0, 1e6);
  } else if (t === 'video') {
    o.w = num(e.w, 640, 160, 6000); o.h = num(e.h, 390, 100, 6000); o.title = str(e.title, 160);
    const u = String(e.url || '');
    if (!/^https:\/\/[^\s"'<>]+$/.test(u)) return null;
    o.url = str(u, 600);
    o.provider = /kinescope\.io/.test(u) ? 'kinescope' : /youtu\.?be/.test(u) ? 'youtube' : 'other';
    o.start = num(e.start, 0, 0, 1e6); o.end = num(e.end, 0, 0, 1e6);   // показываем только кусок видео
  } else if (t === 'link') {
    // карточка-ссылка с превью: сайт, другая доска или элемент доски
    const u = String(e.url || '');
    if (!/^(https?:\/\/[^\s"'<>]+|\/b\/[\w-]+(#[\w=&-]*)?)$/.test(u)) return null;
    o.url = str(u, 1000); o.w = num(e.w, 340, 140, 4000); o.h = num(e.h, 0, 0, 4000);
    o.title = str(e.title, 200); o.desc = str(e.desc, 300); o.site = str(e.site, 80);
    o.img = /^\/img\/\w+\.(png|jpe?g|webp|gif)$/.test(String(e.img || '')) ? e.img : '';
    o.internal = !!e.internal;
  } else if (t === 'coin') {
    // монетка: две стороны с подписями, результат последнего броска
    o.size = num(e.size, 180, 60, 1200); o.heads = str(e.heads || 'Heads', 40); o.tails = str(e.tails || 'Tails', 40);
    o.res = e.res && typeof e.res === 'object' ? { side: e.res.side ? 1 : 0, at: num(e.res.at, 0, 0, 1e15), by: str(e.res.by, 80), n: num(e.res.n, 0, 0, 1e9) } : null;
  } else if (t === 'dice') {
    o.size = num(e.size, 90, 16, 400); o.count = num(e.count, 1, 1, 3);
    o.values = (Array.isArray(e.values) ? e.values : []).slice(0, 3).map(v => num(v, 1, 1, 6));
    while (o.values.length < o.count) o.values.push(1);
    o.values = o.values.slice(0, o.count);
    o.rolled = e.rolled && typeof e.rolled === 'object' ? { at: num(e.rolled.at, 0, 0, 1e15), by: str(e.rolled.by, 80) } : null;
  } else return null;
  return o;
}

function sanitizeStroke(s, by) {
  if (!s || !Array.isArray(s.pts)) return null;
  const pts = s.pts.slice(0, 3000).map(p => [num(p && p[0], 0, -LIM, LIM), num(p && p[1], 0, -LIM, LIM)]);
  if (pts.length < 1) return null;
  return { id: idOf(s.id) || newId(), pts, color: col(s.color, '#2A251F'), w: num(s.w, 4, 1, 80), kind: s.kind === 'marker' ? 'marker' : 'pen', by };
}

/* Доска из файла или пустая */
function makeBoard(data, title) {
  data = data && typeof data === 'object' ? data : {};
  const elements = (Array.isArray(data.elements) ? data.elements : []).slice(0, 8000).map(sanitizeEl).filter(Boolean);
  const seen = new Set();
  elements.forEach(e => { while (seen.has(e.id)) e.id = newId(); seen.add(e.id); });
  elements.forEach(e => { if (e.type === 'card') { e.hx = e.x; e.hy = e.y; } });
  const b = { title: str(data.title || title || 'Board', 160), width: num(data.width, 1600, 400, 6000), elements, strokes: [], check: null, log: [] };
  b.template = clone(elements);
  return b;
}

/* ---------- фреймы и видимость ---------- */
// точка, по которой определяется, внутри какого фрейма лежит элемент
const anchor = e => (e.type === 'card' || e.type === 'sticker') ? [e.x, e.y] : [e.x + 8, e.y + 8];
const rnd = n => crypto.randomInt(n);
function shift(e, dx, dy) { e.x += dx; e.y += dy; if (e.type === 'card') { e.hx += dx; e.hy += dy; } if (e.type === 'line') { e.x2 += dx; e.y2 += dy; } }
const inRect = (p, f) => p[0] >= f.x && p[0] <= f.x + f.w && p[1] >= f.y && p[1] <= f.y + f.h;
const framesAt = (b, p, except) => b.elements.filter(f => f.type === 'frame' && f !== except && inRect(p, f));
const isOwner = (f, who) => f.owners.some(o => o.id === who.id);
function frameBlocks(f, who) {
  if (who.role === 't') return false;
  if (f.hidden || f.veil) return true;
  if (f.private && !isOwner(f, who)) return true;
  return false;
}

/* ---------- самостоятельный темп: у каждого ученика свой прогресс по шагам фрейма ---------- */
const GATES = ['next', 'check', 'try', 'time', 'teacher'];
function cleanGates(g) {
  const out = {};
  if (g && typeof g === 'object') Object.keys(g).slice(0, 60).forEach(k => {
    const n = Number(k), v = g[k]; if (!(n >= 1 && n <= 50) || !v || !GATES.includes(v.k)) return;
    out[n] = { k: v.k }; if (v.k === 'time') out[n].m = num(v.m, 5, 1, 43200);
  });
  return out;
}
function stepList(b, f) { const st = new Set(); b.elements.forEach(e => { if (e.step && e.type !== 'frame' && inRect(anchor(e), f)) st.add(e.step); }); return [...st].sort((a, c) => a - c); }
function seqN(b, f, who) { const p = b.prog && b.prog[f.id] && b.prog[f.id][who.id]; return p ? p.n : 0; }
function seqEntry(b, f, id) { return b.prog && b.prog[f.id] && b.prog[f.id][id]; }
function stepOfEl(b, e) { return e.step || (e.type === 'card' && e.answer ? ((b.elements.find(z => z.id === e.answer) || {}).step || 0) : 0); }
function gateOf(b, f, n) {
  const raw = (f.gates && f.gates[n]) || { k: 'next' };
  let k = raw.k, auto = false;
  if (k === 'check') {
    auto = evaluate(b, e => inRect(anchor(e), f) && stepOfEl(b, e) === n).length > 0;
    if (!auto) k = 'next';   // на шаге нечего проверять автоматически — нужна кнопка «Дальше»
  }
  return { k, m: raw.m || 0, auto };
}
function gateMet(b, f, p) {
  const g = gateOf(b, f, p.n);
  if (g.k === 'next') return !!(p.go && p.go[p.n]);
  if (g.k === 'try') return !!(p.tried && p.tried[p.n]);
  if (g.k === 'time') return Date.now() >= p.at + g.m * 60000;
  if (g.k === 'check') {
    const items = evaluate(b, e => inRect(anchor(e), f) && stepOfEl(b, e) === p.n);
    const res = (b.check && b.check.res) || {};
    return items.length > 0 && items.every(i => res[i.k] === true);
  }
  return false;   // 'teacher'
}
/* пересчитать прогресс одного ученика; true — если что-то изменилось */
function seqTick(b, who) {
  if (!who || who.role === 't') return false;
  let ch = false; const now = Date.now();
  b.elements.forEach(f => {
    if (f.type !== 'frame' || !f.seq || frameBlocks(f, who)) return;
    const steps = stepList(b, f); if (!steps.length) return;
    b.prog = b.prog || {}; const fp = b.prog[f.id] = b.prog[f.id] || {};
    let p = fp[who.id];
    if (!p) { p = fp[who.id] = { n: steps[0], at: now }; ch = true; }
    if (!steps.includes(p.n)) { p.n = steps.find(x => x >= p.n) || steps[steps.length - 1]; ch = true; }
    for (let guard = 0; guard < 60; guard++) {
      const i = steps.indexOf(p.n); if (i < 0 || i === steps.length - 1 || !gateMet(b, f, p)) break;
      const g = gateOf(b, f, p.n);
      p.at = g.k === 'time' ? Math.min(now, p.at + g.m * 60000) : now;
      p.n = steps[i + 1]; ch = true;
    }
  });
  return ch;
}
function visibleTo(b, e, who) {
  if (who.role === 't') return true;
  if (e.tonly) return false;
  if (e.type === 'note' && e.anon && b.anon && b.anon.hide && e.by !== who.id) return false;
  if (e.type === 'frame' && e.hidden) return false;
  const fs = framesAt(b, anchor(e), e);
  if (e.step && fs.some(f => f.seq ? e.step > seqN(b, f, who) : (f.open != null && e.step > f.open))) return false;
  return !fs.some(f => frameBlocks(f, who));
}
const strokeVisible = (b, s, who) => who.role === 't' || !framesAt(b, s.pts[0]).some(f => frameBlocks(f, who));
function inside(b, f) {
  return {
    els: b.elements.filter(e => e !== f && inRect(anchor(e), f)),
    strokes: b.strokes.filter(s => inRect(s.pts[0], f))
  };
}

const zoneAt = (b, x, y) => {
  let found = null;
  for (const z of b.elements) if (z.type === 'zone' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) found = z;
  return found;
};
function slotIndex(b) {
  const idx = {};
  b.elements.forEach(e => { if (e.type === 'sentence') e.parts.forEach(p => { if (p && p.slot) idx[p.slot] = { s: e, p }; }); });
  return idx;
}
function frameName(b, e) {
  const fs = framesAt(b, anchor(e), e);
  if (!fs.length) return '';
  fs.sort((a, c) => a.w * a.h - c.w * c.h);
  return fs[0].title || '';
}

/* Пункты проверки. filter(e) — какие предложения и карточки учитывать. */
/* счёт по «своим» фреймам (копии на ученика, пары, комнаты): сколько верно у владельцев */
function ownedScores(b) {
  return b.elements.filter(f => f.type === 'frame' && f.owners && f.owners.length).map(f => {
    const items = evaluate(b, e => inRect(anchor(e), f));
    return { frame: f.id, title: f.title || '', owners: f.owners, total: items.length, correct: items.filter(i => i.ok === true).length, wrong: items.filter(i => i.ok === false).length, empty: items.filter(i => i.ok === null).length };
  }).filter(x => x.total);
}
function evaluate(b, filter) {
  filter = filter || (() => true);
  const items = [];
  const fill = {};
  b.elements.forEach(c => { if (c.type === 'card' && c.slot) fill[c.slot] = c; });
  const tag = e => { const n = frameName(b, e); return n ? n + ': ' : ''; };
  const zoneCard = c => {
    const z = c.slot ? null : zoneAt(b, c.x, c.y);
    const placed = !!z || !!c.slot;
    const target = b.elements.find(e => e.id === c.answer);
    items.push({ k: c.id, ctx: tag(c) + '«' + c.text + '» → ' + (target && target.title ? target.title : 'zone'), v: z ? (z.title || 'zone') : c.slot ? 'in a gap' : '', ok: placed ? !!(z && z.id === c.answer) : null });
  };
  const done = new Set();
  b.elements.forEach(e => {
    if (e.type === 'sentence' && filter(e)) {
      const ctx = tag(e) + e.parts.map(p => typeof p === 'string' ? p : (fill[p.slot] ? '[' + fill[p.slot].text + ']' : ' ___ ')).join('').replace(/\s+/g, ' ').trim().slice(0, 200);
      e.parts.forEach(p => {
        if (!p || !p.slot || !p.answer) return;
        const c = fill[p.slot];
        items.push({ k: p.slot, ctx, v: c ? c.text : '', ok: c ? norm(c.text) === norm(p.answer) : null });
      });
    } else if (e.type === 'zone') {
      b.elements.forEach(c => { if (c.type === 'card' && c.answer === e.id && !done.has(c.id) && filter(c)) { done.add(c.id); zoneCard(c); } });
    }
  });
  b.elements.forEach(c => { if (c.type === 'card' && c.answer && !done.has(c.id) && filter(c)) zoneCard(c); });
  const loose = s => norm(s).replace(/[.!?,;:"'«»]/g, '').replace(/\s+/g, ' ').trim();
  b.elements.forEach(e => { if (e.type === 'input' && e.answers.length && filter(e)) items.push({ k: e.id, ctx: tag(e) + (e.label || 'Answer').slice(0, 200), v: e.value, ok: e.value.trim() ? e.answers.some(a => loose(a) === loose(e.value)) : null }); });
  return items;
}

function cardWhere(b, c) {
  const fn = frameName(b, c), pre = fn ? ' (' + fn + ')' : '';
  if (c.slot) {
    const s = slotIndex(b)[c.slot];
    if (s) {
      const before = [];
      for (const p of s.s.parts) { if (p === s.p) break; if (typeof p === 'string') before.push(p); }
      const tail = before.join('').replace(/\s+/g, ' ').trim().split(' ').slice(-4).join(' ');
      return 'into a gap' + (tail ? ' after «…' + tail + '»' : '') + pre;
    }
    return 'into a gap' + pre;
  }
  const z = zoneAt(b, c.x, c.y);
  return (z ? 'into «' + (z.title || 'zone') + '»' : 'on the board') + pre;
}

/* скопировать набор элементов со сдвигом, с новыми id и связями (пропуски, зоны-ответы) */
function remapCopy(src, dx, dy) {
  const map = {}, slotMap = {};
  const els = src.map(e => { const c = clone(e); map[e.id] = c.id = newId(); shift(c, dx, dy); return c; });
  const gmap = {};
  { const tkm = {}; els.forEach(c => { if (c.tk) c.tk = tkm[c.tk] || (tkm[c.tk] = newId()); }); }
  els.forEach(c => { if (c.g) c.g = gmap[c.g] || (gmap[c.g] = newId()); if (c.type === 'line') { c.from = c.from && map[c.from] ? map[c.from] : null; c.to = c.to && map[c.to] ? map[c.to] : null; } });
  els.forEach(c => { if (c.type === 'sentence') c.parts.forEach((p, k) => { if (p && p.slot) { const ns = c.id + 's' + k; slotMap[p.slot] = ns; p.slot = ns; } }); });
  els.forEach(c => {
    if (c.type === 'card') { if (c.answer && map[c.answer]) c.answer = map[c.answer]; c.slot = c.slot && slotMap[c.slot] ? slotMap[c.slot] : null; }
    if (c.type === 'scale' || c.type === 'rating' || c.type === 'poll') c.votes = {};
    if (c.reacts) c.reacts = {};
    delete c.assign;
  });
  return els;
}

/* «Лайт»-копия доски: только то, что добавили владелец и админы. Без учеников, гостей, их ответов, имён и истории */
const isStaffBy = by => !by || by === 't' || /^a_/.test(String(by));
function liteBoard(b) {
  const out = { title: b.title, width: b.width, bg: b.bg || '', grid: b.grid || 'dots', lite: true, elements: [], strokes: [] };
  out.elements = (b.elements || []).filter(e => isStaffBy(e.by)).map(e => {
    const c = clone(e);
    delete c.assign; delete c.vby; delete c.res;
    if (c.type === 'frame') c.owners = [];
    if (c.type === 'card') { c.slot = null; if (c.hx != null) { c.x = c.hx; c.y = c.hy; } }
    if (c.type === 'input') c.value = '';
    if (c.votes) c.votes = {};
    if (Array.isArray(c.words)) c.words = [];
    if (c.type === 'open' && Array.isArray(c.answers)) c.answers = [];
    if (c.type === 'flip') c.writes = [];
    if (c.type === 'boxes' && Array.isArray(c.items)) c.open = c.items.map(() => false);
    if (c.type === 'ball') c.res = null;
    if (c.type === 'todo' && Array.isArray(c.items)) c.items = c.items.map(it => { const o = { t: it.t, done: false }; if (it.h) o.h = it.h; return o; });
    return c;
  });
  out.strokes = (b.strokes || []).filter(s => isStaffBy(s.by)).map(s => { const o = clone(s); delete o.by; return o; });
  return out;
}

/* Обернуть выбранные элементы новым фреймом (чтобы потом размножить как задание). Возвращает фрейм или null */
function wrapFrame(b, ids, title) {
  const set = new Set(ids);
  const els = b.elements.filter(e => set.has(e.id) && e.type !== 'frame');
  if (!els.length) return null;
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  const grow = (x, y, w, h) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + h); };
  const dims = e => {
    const sz = e.size && (e.type === 'wheel' || e.type === 'ball' || e.type === 'dice' || e.type === 'coin') ? e.size : 0;
    const w = e.w || sz || 180;
    const lines = e.text ? String(e.text).split('\n').length : 1;
    const h = e.h || sz || (e.type === 'text' || e.type === 'sentence' ? Math.max(40, Math.round((e.size || 22) * 1.5 * lines)) : 100);
    return [w, h];
  };
  els.forEach(e => {
    const [w, h] = dims(e);
    if (e.type === 'card' && e.hx != null) grow(Math.min(e.x, e.hx), Math.min(e.y, e.hy), w + Math.abs(e.x - e.hx), h + Math.abs(e.y - e.hy));
    else grow(e.x, e.y, w, h);
    if (e.type === 'line') grow(Math.min(e.x, e.x2), Math.min(e.y, e.y2), Math.abs(e.x2 - e.x), Math.abs(e.y2 - e.y));
  });
  const pad = 12;   // плотно вокруг выбранного: небольшой отступ и место под заголовок
  const f = sanitizeEl({ type: 'frame', x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2, title: str(title, 200) || 'Task', lite: true });
  if (!f) return null;
  f.owners = [];
  b.elements.unshift(f);   // фрейм лежит под содержимым
  return f;
}

/* уже назначенный фрейм, внутри которого лежит всё выделенное (чтобы не оборачивать второй раз) */
function ownedFrameOf(b, ids) {
  const set = new Set(ids), els = b.elements.filter(e => set.has(e.id) && e.type !== 'frame');
  if (!els.length) return null;
  const fs = b.elements.filter(f => f.type === 'frame' && f.owners && f.owners.length && els.every(e => inRect(anchor(e), f)));
  return fs.sort((a, c) => a.w * a.h - c.w * c.h)[0] || null;
}

/* Размножить фрейм. copies: [{title, owners:[{id,name}], private, claim}] */
function duplicateFrame(b, frameId, copies) {
  const f = b.elements.find(e => e.id === frameId && e.type === 'frame');
  if (!f || !copies.length) return null;
  const src = inside(b, f).els;
  const cols = Math.min(4, copies.length), gap = 80;
  const made = [];
  // начинаем правее всех фреймов в этой полосе, чтобы копии не легли на старые
  const rows = Math.ceil(copies.length / cols);
  const band = [f.y, f.y + rows * (f.h + gap)];
  let right = f.x + f.w;
  b.elements.forEach(o => { if (o.type === 'frame' && o.y < band[1] && o.y + o.h > band[0]) right = Math.max(right, o.x + o.w); });
  const startDx = right + gap - f.x;
  copies.forEach((cp, i) => {
    const dx = startDx + (i % cols) * (f.w + gap), dy = Math.floor(i / cols) * (f.h + gap);
    const map = {};
    const nf = clone(f);
    nf.id = newId(); nf.x += dx; nf.y += dy; nf.title = cp.title; nf.owners = cp.owners || []; nf.private = !!cp.private; nf.ro = !!cp.ro; nf.claim = !!cp.claim; nf.hidden = false; nf.collapsed = false;
    made.push(nf);
    const els = src.map(e => { const c = clone(e); map[e.id] = c.id = newId(); shift(c, dx, dy); return c; });
    { const tkm = {}; els.forEach(c => { if (c.tk) c.tk = tkm[c.tk] || (tkm[c.tk] = newId()); }); }
    const slotMap = {};
    els.forEach(c => {
      if (c.type === 'sentence') c.parts.forEach((p, k) => { if (p && p.slot) { const ns = c.id + 's' + k; slotMap[p.slot] = ns; p.slot = ns; } });
    });
    els.forEach(c => {
      if (c.type === 'card') { if (c.answer && map[c.answer]) c.answer = map[c.answer]; c.slot = c.slot && slotMap[c.slot] ? slotMap[c.slot] : null; if (!c.slot) { c.x = c.hx; c.y = c.hy; } }
      if ((c.type === 'note' || c.type === 'sticker' || (c.type === 'image' && c.by)) && !isStaffBy(c.by)) c.drop = true;   // ответы учеников не копируем, материалы учителя — да
      if (c.type === 'input') c.value = '';
      if (c.type === 'flip') c.writes = [];
    });
    els.filter(c => !c.drop).forEach(c => made.push(c));
  });
  made.forEach(e => b.elements.push(e));
  return made;
}

/*
 * Применить операцию. who = {role:'t'|'s', id, name}.
 * Возвращает { upd, action } или null, если нельзя.
 * upd: { els, del, strokes, unstroke, check, meta, full, order }
 */
function applyOp(b, op, who) {
  if (!op || typeof op !== 'object') return null;
  const T = who.role === 't';
  const find = id => b.elements.find(e => e.id === id);
  const upd = {};
  // «только просмотр»: чужие копии задания (фрейм с владельцами и флагом ro) ученик видит, но не меняет
  if (!T && op.t !== 'react') {
    const locked = b.elements.filter(f => f.type === 'frame' && f.ro && f.owners && f.owners.length && !isOwner(f, who));
    if (locked.length) {
      const hit = p => Array.isArray(p) && locked.some(f => inRect(p, f));
      const pts = [];
      const addEl = e => { if (e && typeof e === 'object' && Number.isFinite(Number(e.x)) && Number.isFinite(Number(e.y))) pts.push([Number(e.x), Number(e.y)]); };
      const refs = [];
      Object.keys(op).forEach(k => { const v = op[k]; if (k === 't') return; if (typeof v === 'string') refs.push(v); else if (Array.isArray(v)) v.forEach(x => { if (typeof x === 'string') refs.push(x); else if (x && typeof x === 'object') { if (typeof x.id === 'string') refs.push(x.id); addEl(x); if (Array.isArray(x.pts)) pts.push(x.pts[0]); } }); });
      addEl(op); addEl(op.el); if (op.stroke && Array.isArray(op.stroke.pts)) pts.push(op.stroke.pts[0]); if (Array.isArray(op.pts)) pts.push(op.pts[0]);
      for (const id of refs) { const e = b.elements.find(x => x.id === id); if (e && e.type !== 'frame') { pts.push(anchor(e)); if (e.type === 'sentence' || e.type === 'zone') pts.push([e.x + 8, e.y + 8]); } const sl = slotIndex(b)[id]; if (sl) pts.push(anchor(sl.s)); }
      if (pts.some(hit)) return null;
    }
  }
  const clearMarks = ids => {
    if (!b.check) return;
    let changed = false;
    ids.forEach(i => { if (i && i in b.check.res) { delete b.check.res[i]; changed = true; } });
    if (changed) upd.check = b.check;
  };
  // ученик не может трогать то, чего не видит
  const canSee = e => visibleTo(b, e, who);
  // ученики меняют любые элементы, кроме фреймов и заблокированных (если учитель не выключил это в настройках)
  const open = b.studentEdit !== false;
  const editOK = e => T || (e && canSee(e) && !e.lock && e.type !== 'frame' && ((e.by && e.by === who.id) || open));
  const STUDENT_ADD = open ? ['note', 'sticker', 'image', 'media', 'text', 'shape', 'line', 'video', 'link'] : ['note', 'sticker', 'image', 'media', 'link'];

  switch (op.t) {
    case 'step-next': {
      if (T) return null;
      const f = find(idOf(op.frame)); if (!f || f.type !== 'frame' || !f.seq || !canSee(f)) return null;
      seqTick(b, who);
      const p = seqEntry(b, f, who.id); if (!p) return null;
      if (gateOf(b, f, p.n).k === 'next') { p.go = p.go || {}; p.go[p.n] = 1; }
      seqTick(b, who);
      upd.full = true;
      return { upd, action: null };
    }
    case 'step-sync': {
      if (T || !seqTick(b, who)) return null;
      upd.full = true;
      return { upd, action: null };
    }
    case 'move': {
      const c = find(idOf(op.id));
      if (!c || !canSee(c) || (!T && c.lock)) return null;
      const x = num(op.x, c.x, -LIM, LIM), y = num(op.y, c.y, -LIM, LIM);
      if (c.type === 'frame') {
        if (!T) return null;
        const dx = x - c.x, dy = y - c.y;
        const inn = inside(b, c);
        c.x = x; c.y = y;
        inn.els.forEach(e => shift(e, dx, dy));
        inn.strokes.forEach(s => s.pts.forEach(p => { p[0] += dx; p[1] += dy; }));
        upd.full = true;
        return { upd, action: null };
      }
      const own = c.by && c.by === who.id;
      if (((c.type === 'note' || c.type === 'sticker' || c.type === 'image' || c.type === 'media') && (T || own)) || (T && c.type !== 'card') || (!T && c.type !== 'card' && editOK(c))) {
        if (c.type === 'line') { c.x2 += x - c.x; c.y2 += y - c.y; }
        c.x = x; c.y = y; upd.els = [c];
        return { upd, action: null };
      }
      if (c.type !== 'card') return null;
      const old = c.slot;
      const touched = [c];
      let slot = op.slot ? idOf(op.slot) : null;
      const si = slotIndex(b);
      if (slot && (!si[slot] || !canSee(si[slot].s))) slot = null;
      if (slot) {
        const occ = b.elements.find(e => e.type === 'card' && e.slot === slot && e.id !== c.id);
        if (occ) { occ.slot = null; occ.x = occ.hx; occ.y = occ.hy; touched.push(occ); clearMarks([occ.id]); }
      }
      c.slot = slot; c.x = x; c.y = y;
      clearMarks([c.id, old, slot]);
      upd.els = touched;
      return { upd, action: '«' + c.text + '» → ' + cardWhere(b, c) };
    }
    case 'home': {
      const c = find(idOf(op.id)); if (!c || c.type !== 'card' || !canSee(c)) return null;
      const old = c.slot; c.slot = null; c.x = c.hx; c.y = c.hy;
      clearMarks([c.id, old]); upd.els = [c];
      return { upd, action: '«' + c.text + '» sent back' };
    }
    case 'add':
    case 'note-add': {
      const type = op.t === 'note-add' ? 'note' : op.el && op.el.type;
      if (!(T ? ['sticker', 'image', 'note', 'media', 'video', 'link'] : STUDENT_ADD).includes(type)) return null;
      const n = sanitizeEl(Object.assign({}, op.el, { type, by: who.id }));
      if (!n) return null;
      if ((type === 'note' || type === 'shape') && b.anon && b.anon.on && !T) { n.anon = true; if (b.anon.priv) n.priv = true; }   // режим Private mode: текст скрыт от остальных, пока учитель не раскроет
      if (find(n.id)) n.id = newId();
      b.elements.push(n); upd.els = [n];
      return { upd, action: type === 'sticker' ? 'added emoji ' + n.emoji : type === 'image' ? 'added an image' : type === 'link' ? 'added a link: ' + (n.title || n.url).slice(0, 80) : 'added a sticky note' };
    }
    case 'note-edit': {
      const n = find(idOf(op.id)); if (!n || n.type !== 'note' || !canSee(n) || !editOK(n)) return null;
      if (!T && n.priv && n.by !== who.id) return null;
      n.text = str(op.text, 3000);
      if (op.color) n.color = col(op.color, n.color);
      upd.els = [n];
      return { upd, action: n.text ? 'writes in a note: «' + n.text.slice(0, 60) + '»' : null };
    }
    case 'del': {
      const e = find(idOf(op.id)); if (!e) return null;
      if (!T && !editOK(e)) return null;
      if (e.type === 'frame' && op.all) {
        const inn = inside(b, e);
        const kill = new Set(inn.els.map(x => x.id)); kill.add(e.id);
        b.elements = b.elements.filter(x => !kill.has(x.id));
        const ks = new Set(inn.strokes.map(s => s.id));
        b.strokes = b.strokes.filter(s => !ks.has(s.id));
        upd.full = true;
        return { upd, action: null };
      }
      b.elements = b.elements.filter(x => x !== e);
      b.elements.forEach(l => { if (l.type === 'line' && (l.from === e.id || l.to === e.id)) { if (l.from === e.id) l.from = null; if (l.to === e.id) l.to = null; (upd.els = upd.els || []).push(l); } });
      if (e.type === 'sentence') b.elements.forEach(c => { if (c.type === 'card' && c.slot && !slotIndex(b)[c.slot]) { c.slot = null; c.x = c.hx; c.y = c.hy; (upd.els = upd.els || []).push(c); } });
      upd.del = [e.id];
      if (e.type === 'frame') upd.full = true;
      return { upd, action: e.type === 'note' ? 'deleted a note' : e.type === 'sticker' ? 'removed an emoji' : e.type === 'image' && !T ? 'removed an image' : null };
    }
    case 'stroke': {
      const s = sanitizeStroke(op.stroke, who.id); if (!s) return null;
      b.strokes.push(s); if (b.strokes.length > 8000) b.strokes.shift();
      upd.strokes = [s];
      return { upd, action: 'drawing' };
    }
    case 'erase': {
      const ids = (Array.isArray(op.ids) ? op.ids : []).map(idOf);
      const gone = [];
      b.strokes = b.strokes.filter(s => { const kill = ids.includes(s.id) && (T || s.by === who.id); if (kill) gone.push(s.id); return !kill; });
      if (!gone.length) return null;
      upd.unstroke = gone;
      return { upd, action: 'erasing' };
    }
    case 'stroke-move': {
      const ids = new Set((Array.isArray(op.ids) ? op.ids : []).slice(0, 2000).map(idOf));
      const dx = num(op.dx, 0, -LIM, LIM), dy = num(op.dy, 0, -LIM, LIM);
      let n = 0;
      b.strokes.forEach(s => { if (ids.has(s.id) && (T || s.by === who.id) && strokeVisible(b, s, who)) { s.pts.forEach(p => { p[0] += dx; p[1] += dy; }); n++; } });
      if (!n) return null;
      upd.full = true;
      return { upd, action: null };
    }
    case 'stroke-scale': {
      // масштаб рисунков вместе с фреймом: точка-опора (ox,oy), коэффициент k
      const ids = new Set((Array.isArray(op.ids) ? op.ids : []).slice(0, 4000).map(idOf));
      const ox = num(op.ox, 0, -LIM, LIM), oy = num(op.oy, 0, -LIM, LIM), k = Number(op.k);
      if (!(k > 0.01 && k < 100)) return null;
      let n = 0;
      b.strokes.forEach(s => { if (ids.has(s.id) && (T || s.by === who.id) && strokeVisible(b, s, who)) { s.pts.forEach(p => { p[0] = Math.round((ox + (p[0] - ox) * k) * 10) / 10; p[1] = Math.round((oy + (p[1] - oy) * k) * 10) / 10; }); s.w = Math.max(0.5, Math.min(200, Math.round(s.w * k * 10) / 10)); n++; } });
      if (!n) return null;
      upd.full = true;
      return { upd, action: null };
    }
    case 'check': {
      const fr = op.frame ? find(idOf(op.frame)) : null;
      if (fr && (fr.type !== 'frame' || !canSee(fr))) return null;
      const gid = op.id ? idOf(op.id) : '', tg = gid ? find(gid) : null;   // кнопка Check на самом задании (элемент или целое задание из шаблона)
      const grp = gid && !tg && b.elements.some(e => e.tk === gid && canSee(e));
      if (gid && !grp && (!tg || !canSee(tg) || !['sentence', 'zone', 'input'].includes(tg.type))) return null;
      const items = evaluate(b, e => canSee(e) && (!fr || inRect(anchor(e), fr)) && (!gid || (grp ? e.tk === gid : (e.id === tg.id || (tg.type === 'zone' && e.type === 'card' && e.answer === tg.id)))));
      const res = Object.assign({}, b.check && b.check.res);
      items.forEach(i => { if (i.ok !== null) res[i.k] = i.ok; else delete res[i.k]; });
      b.check = { at: Date.now(), by: who.name, res };
      upd.check = b.check;
      if (!T) {
        const tg2 = tg || (grp ? b.elements.find(e => e.tk === gid) : null);
        const frs = fr ? [fr] : tg2 ? framesAt(b, anchor(tg2)) : [];
        frs.forEach(f0 => { if (!f0.seq) return; const p = seqEntry(b, f0, who.id); if (p) { p.tried = p.tried || {}; p.tried[p.n] = 1; } });
        if (seqTick(b, who)) upd.full = true;
      }
      const ok = items.filter(i => i.ok === true).length;
      return { upd, action: 'pressed Check' + (fr ? ' in «' + (fr.title || 'frame') + '»' : gid ? ' on a task' : '') + ': correct ' + ok + ' of ' + items.length };
    }
    case 'spin': {
      const w = find(idOf(op.id)); if (!w || w.type !== 'wheel' || !canSee(w) || w.items.length < 2) return null;
      if (w.spin && Date.now() - w.spin.at < 4500) return null;
      const n = w.items.length, seg = 360 / n, res = rnd(n);
      const jitter = (rnd(60) - 30) / 100 * seg;
      const want = ((360 - (res + 0.5) * seg - jitter) % 360 + 360) % 360;
      const base = w.angle - (((w.angle % 360) + 360) % 360);
      w.spin = { at: Date.now(), res, by: who.name, from: w.angle };
      w.angle = base + 360 * 6 + want;
      upd.els = [w];
      return { upd, action: 'spun the wheel: «' + w.items[res] + '»' };
    }
    case 'flip': {
      const f = find(idOf(op.id)); if (!f || f.type !== 'flip' || !canSee(f)) return null;
      f.flipped = !f.flipped; upd.els = [f];
      return { upd, action: 'flipped a card' };
    }
    case 'flip-write': {
      const f = find(idOf(op.id)); if (!f || f.type !== 'flip' || !canSee(f)) return null;
      f.writes = f.writes || [];
      const side = op.side === 'front' ? 'front' : 'back', txt = str(op.text, 300).trim(), i = f.writes.findIndex(w => w.by === who.id && (w.side || 'back') === side);
      if (!txt) { if (i >= 0) f.writes.splice(i, 1); else return null; }
      else { const w = { by: who.id, name: who.name, side, text: txt, shown: !!op.shown }; if (i >= 0) f.writes[i] = w; else if (f.writes.length < 60) f.writes.push(w); else return null; }
      upd.els = [f];
      return { upd, action: null };
    }
    case 'flip-reveal': {
      if (!T) return null;
      const f = find(idOf(op.id)); if (!f || f.type !== 'flip') return null;
      f.writes = (f.writes || []).map(w => Object.assign({}, w, { shown: op.shown !== false }));
      upd.els = [f];
      return { upd, action: null };
    }
    case 'vote': {
      const sc = find(idOf(op.id)); if (!sc || !['scale', 'rating', 'poll'].includes(sc.type) || !canSee(sc)) return null;
      const hi = sc.type === 'scale' ? 100 : sc.type === 'rating' ? sc.max : Math.max(0, sc.options.length - 1);
      const lo = sc.type === 'rating' ? 1 : 0;
      if (op.v == null) delete sc.votes[who.id];
      else sc.votes[who.id] = { v: num(op.v, lo, lo, hi), name: who.name };
      upd.els = [sc];
      return { upd, action: op.v == null ? null : 'voted on «' + (sc.title || 'scale') + '»' };
    }
    case 'order': {
      const ids = new Set((Array.isArray(op.ids) ? op.ids : []).slice(0, 2000).map(idOf));
      const mineOnly = e => editOK(e);
      const selIdx = []; b.elements.forEach((e, i) => { if (ids.has(e.id) && canSee(e) && mineOnly(e) && e.type !== 'frame') selIdx.push(i); });
      if (!selIdx.length) return null;
      const picked = selIdx.map(i => b.elements[i]), pickedSet = new Set(picked);
      const how = op.how;
      const gid0 = picked[0].g, gmem = gid0 ? b.elements.filter(e => e.g === gid0) : [];
      if (gid0 && picked.every(e => e.g === gid0) && gmem.length > picked.length && ['front', 'back', 'forward', 'backward'].includes(how)) {
        // часть группы: порядок меняется только среди частей этой группы, место группы среди остальных не меняется
        const pos = []; b.elements.forEach((e, i) => { if (e.g === gid0) pos.push(i); });
        let M = gmem.slice();
        if (how === 'front') M = M.filter(e => !pickedSet.has(e)).concat(picked);
        else if (how === 'back') M = picked.concat(M.filter(e => !pickedSet.has(e)));
        else if (how === 'forward') { for (let i = M.length - 2; i >= 0; i--) if (pickedSet.has(M[i]) && !pickedSet.has(M[i + 1])) { const t = M[i]; M[i] = M[i + 1]; M[i + 1] = t; } }
        else { for (let i = 1; i < M.length; i++) if (pickedSet.has(M[i]) && !pickedSet.has(M[i - 1])) { const t = M[i]; M[i] = M[i - 1]; M[i - 1] = t; } }
        pos.forEach((p, k) => { b.elements[p] = M[k]; });
        upd.order = b.elements.map(e => e.id);
        return { upd, action: null };
      }
      if (how === 'front' || how === 'back') {
        const rest = b.elements.filter(e => !pickedSet.has(e));
        b.elements = how === 'front' ? rest.concat(picked) : rest.filter(e => e.type === 'frame').concat(picked, rest.filter(e => e.type !== 'frame'));
      } else if (how === 'forward') {
        for (let i = b.elements.length - 2; i >= 0; i--) if (pickedSet.has(b.elements[i]) && !pickedSet.has(b.elements[i + 1])) { const t = b.elements[i]; b.elements[i] = b.elements[i + 1]; b.elements[i + 1] = t; }
      } else if (how === 'backward') {
        for (let i = 1; i < b.elements.length; i++) if (pickedSet.has(b.elements[i]) && !pickedSet.has(b.elements[i - 1]) && b.elements[i - 1].type !== 'frame') { const t = b.elements[i]; b.elements[i] = b.elements[i - 1]; b.elements[i - 1] = t; }
      } else return null;
      upd.order = b.elements.map(e => e.id);
      return { upd, action: null };
    }
    case 'deck': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'deck' || !canSee(d) || (!T && d.lock)) return null;
      if (op.act === 'shuffle') { const o = d.items.map((_, i) => i); for (let i = o.length - 1; i > 0; i--) { const j = rnd(i + 1); [o[i], o[j]] = [o[j], o[i]]; } d.order = o; d.dealt = 0; }
      else if (d.dealt < d.items.length) d.dealt++;
      else return null;
      d.by = who.name.slice(0, 40);
      upd.els = [d];
      return { upd, action: op.act === 'shuffle' ? 'shuffled the cards' : 'took a card: «' + d.items[d.order[d.dealt - 1]].slice(0, 60) + '»' };
    }
    case 'box': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'boxes' || !canSee(d) || (!T && d.lock)) return null;
      const i = num(op.i, -1, -1, 99); if (i < 0 || i >= d.items.length) return null;
      if (op.reset && T) d.open = d.items.map(() => false); else d.open[i] = T ? !d.open[i] : true;
      upd.els = [d];
      return { upd, action: 'opened box ' + (i + 1) };
    }
    case 'ball': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'ball' || !canSee(d) || !d.items.length) return null;
      let i = rnd(d.items.length); if (d.items.length > 1 && d.res && i === d.res.i) i = (i + 1 + rnd(d.items.length - 1)) % d.items.length;
      d.res = { i, at: Date.now(), by: who.name };
      upd.els = [d];
      return { upd, action: 'asked the magic ball: «' + d.items[i].slice(0, 60) + '»' };
    }
    case 'cloud-add': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'cloud' || !canSee(d) || (!T && d.lock)) return null;
      const w = str(op.w, 60).trim().replace(/\s+/g, ' '); if (!w) return null;
      const ex = d.words.find(x => x.t.toLowerCase() === w.toLowerCase());
      if (ex) { if (!ex.by.includes(who.id)) ex.by.push(who.id); } else { if (d.words.length >= 300) return null; d.words.push({ t: w, by: [who.id] }); }
      upd.els = [d];
      return { upd, action: 'added «' + w + '» to the word cloud' };
    }
    case 'cloud-del': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'cloud' || !T) return null;
      d.words = op.all ? [] : d.words.filter(x => x.t !== str(op.w, 60));
      upd.els = [d];
      return { upd, action: null };
    }
    case 'open-add': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'open' || !canSee(d) || (!T && d.lock)) return null;
      const t = str(op.text, 400).trim().replace(/\s+/g, ' '); if (!t || d.answers.length >= 300) return null;
      d.answers.push({ id: newId(), t, by: who.id, name: str(who.name, 80), at: Date.now() });
      upd.els = [d];
      return { upd, action: 'finished the sentence: «' + t.slice(0, 60) + '»' };
    }
    case 'open-del': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'open') return null;
      if (op.all) { if (!T) return null; d.answers = []; }
      else { const a = d.answers.find(x => x.id === idOf(op.aid)); if (!a || (!T && a.by !== who.id)) return null; d.answers = d.answers.filter(x => x !== a); }
      upd.els = [d];
      return { upd, action: null };
    }
    case 'input-set': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'input' || !canSee(d) || (!T && d.lock)) return null;
      d.value = str(op.value, 1000); d.vby = who.name.slice(0, 80);
      clearMarks([d.id]); upd.els = [d];
      return { upd, action: d.value.trim() ? 'writes: «' + d.value.slice(0, 60) + '»' : null };
    }
    case 'msync': {
      const m = find(idOf(op.id)); if (!m || (m.type !== 'media' && m.type !== 'video') || !canSee(m)) return null;
      m.play = { on: !!op.on, t: num(op.t, 0, 0, 1e6), at: Date.now(), by: who.name };
      upd.els = [m];
      return { upd, action: null };
    }
    case 'todo-toggle': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'todo' || !canSee(d) || (!T && d.lock)) return null;
      const it = d.items[num(op.i, -1, -1, 100)]; if (!it) return null;
      it.done = !it.done; it.by = it.done ? who.name : '';
      upd.els = [d];
      return { upd, action: (it.done ? 'ticked «' : 'unticked «') + it.t.slice(0, 60) + '»' };
    }
    case 'todo-add': case 'todo-edit': case 'todo-del': {
      // пункты чек-листа: добавить, изменить (с выделением, подчёркиванием), удалить — учитель и ученики, если доска это разрешает
      const d = find(idOf(op.id)); if (!d || d.type !== 'todo' || !editOK(d)) return null;
      if (op.t === 'todo-add') {
        const t = str(op.text, 300).trim(); if (!t || d.items.length >= 80) return null;
        d.items.push({ t, done: false, by: '' }); upd.els = [d];
        return { upd, action: 'added «' + t.slice(0, 60) + '» to a checklist' };
      }
      const i = num(op.i, -1, -1, 100), it = d.items[i]; if (!it) return null;
      if (op.t === 'todo-del') { d.items.splice(i, 1); upd.els = [d]; return { upd, action: null }; }
      const t = str(op.text, 300).trim(); if (!t) return null;
      it.t = t; if (op.html && /<(b|strong|i|em|u|s|strike|span)[\s>]/i.test(String(op.html))) it.h = cleanRich(str(op.html, 3000)); else delete it.h;
      upd.els = [d];
      return { upd, action: null };
    }
    case 'coin': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'coin' || !canSee(d)) return null;
      const side = rnd(2);
      d.res = { side, at: Date.now(), by: who.name, n: ((d.res && d.res.n) || 0) + 1 };
      upd.els = [d];
      return { upd, action: 'tossed a coin: ' + (side ? d.tails : d.heads) };
    }
    case 'roll': {
      const d = find(idOf(op.id)); if (!d || d.type !== 'dice' || !canSee(d)) return null;
      d.values = d.values.map(() => 1 + rnd(6));
      d.rolled = { at: Date.now(), by: who.name };
      upd.els = [d];
      return { upd, action: 'rolled the dice: ' + d.values.join(' + ') };
    }
    case 'patch': {
      const items = (Array.isArray(op.items) ? op.items : []).slice(0, 600);
      const changed = []; let full = false, noteText = null;
      const STU = {
        note: ['text', 'html', 'hl', 'color', 'font', 'fc', 'bold', 'italic', 'underline', 'strike', 'align', 'va', 'size', 'w', 'h', 'x', 'y', 'rot', 'blur'],
        image: ['w', 'h', 'x', 'y', 'crop', 'irot', 'radius', 'shape', 'opacity', 'bw', 'bc', 'rot', 'blur'],
        media: ['w', 'h', 'x', 'y'],
        sticker: ['size', 'x', 'y']
      };
      items.forEach(it => {
        const e = it && find(idOf(it.id)); if (!e || !canSee(e)) return;
        if (!T && e.priv && e.by !== who.id) return;   // чужой скрытый текст не трогаем
        let keys = Object.keys(it).filter(k => k !== 'id' && k !== 'type' && k !== 'by');
        if (!T) {
          if (e.lock) return;
          const own = e.by && e.by === who.id;
          if (open && editOK(e)) keys = keys.filter(k => !['lock', 'tonly', 'tnote', 'tnimg', 'assign', 'step', 'anon', 'priv', 'g', 'answer', 'parts', 'hidden', 'veil', 'private', 'claim', 'owners', 'open'].includes(k));
          else {
            const allow = own && STU[e.type] ? STU[e.type] : null;
            if (!allow) return;
            keys = keys.filter(k => allow.includes(k));
          }
        }
        if (!keys.length) return;
        const merged = clone(e);
        keys.forEach(k => { if (it[k] === null) delete merged[k]; else merged[k] = it[k]; });
        const s2 = sanitizeEl(merged); if (!s2) return;
        if (s2.type === 'card') { s2.slot = e.slot; if (!('hx' in it)) { s2.hx = e.hx; s2.hy = e.hy; } }
        if (e.by) s2.by = e.by;
        if (!T && b.anon && b.anon.on && b.anon.priv && (s2.type === 'note' || s2.type === 'shape') && !e.priv && (keys.includes('text') || keys.includes('html')) && !(e.text || e.html) && (s2.text || s2.html)) { s2.priv = true; s2.anon = true; s2.by = who.id; }   // заполнил пустой шейп/стикер в приватном режиме
        const i = b.elements.indexOf(e); b.elements[i] = s2;
        if (s2.type === 'frame') full = true;
        if (s2.type === 'note' && keys.includes('text')) noteText = s2.text;
        changed.push(s2);
      });
      if (!changed.length) return null;
      if (full) upd.full = true; else upd.els = changed;
      return { upd, action: !T && noteText ? 'writes in a note: «' + noteText.slice(0, 60) + '»' : null };
    }
    case 'move-many': {
      const items = (Array.isArray(op.items) ? op.items : []).slice(0, 600);
      const changed = []; let full = false;
      items.forEach(it => {
        const e = it && find(idOf(it.id)); if (!e || !canSee(e)) return;
        if (!T && !editOK(e)) return;
        const x = num(it.x, e.x, -LIM, LIM), y = num(it.y, e.y, -LIM, LIM);
        if (e.type === 'frame') {
          const dx = x - e.x, dy = y - e.y, inn = inside(b, e);
          inn.els.forEach(c => { if (items.some(o => o.id === c.id)) return; shift(c, dx, dy); });
          inn.strokes.forEach(s => s.pts.forEach(p => { p[0] += dx; p[1] += dy; }));
          full = true;
        }
        if (e.type === 'card' && e.slot) { clearMarks([e.id, e.slot]); e.slot = null; }
        if (e.type === 'line') { e.x2 += x - e.x; e.y2 += y - e.y; }
        e.x = x; e.y = y; changed.push(e);
      });
      if (!changed.length) return null;
      if (full) upd.full = true; else upd.els = changed;
      return { upd, action: null };
    }
    case 'react': {
      const e = find(idOf(op.id)); if (!e || (e.type !== 'note' && e.type !== 'image') || !canSee(e)) return null;
      const em = str(op.emoji, 8); if (!em.trim()) return null;
      e.reacts = e.reacts || {};
      const list = e.reacts[em] || [];
      if (list.includes(who.id)) e.reacts[em] = list.filter(x => x !== who.id); else e.reacts[em] = list.concat(who.id);
      if (!e.reacts[em].length) delete e.reacts[em];
      if (Object.keys(e.reacts).length > 12) return null;
      upd.els = [e];
      return { upd, action: 'reacted ' + em };
    }
    case 'cover': {
      const e = find(idOf(op.id)); if (!e || e.type !== 'image' || !canSee(e) || (!T && e.lock)) return null;
      e.cover = op.value == null ? !e.cover : !!op.value; upd.els = [e];
      return { upd, action: e.cover ? 'covered an image' : 'revealed an image' };
    }
    case 'restore': {
      const add = (Array.isArray(op.els) ? op.els : []).slice(0, 600).map(x => {
        if (!x || find(idOf(x.id))) return null;
        if (!T) { if (!STUDENT_ADD.concat(open ? ['card', 'sentence', 'zone', 'flip', 'wheel', 'scale', 'rating', 'poll', 'todo', 'dice'] : []).includes(x.type)) return null; x = Object.assign({}, x, { by: x.by || who.id }); }
        return sanitizeEl(x);
      }).filter(Boolean);
      if (!add.length) return null;
      add.forEach(e => { if (e.type === 'frame') b.elements.unshift(e); else b.elements.push(e); });
      upd.full = true;
      return { upd, action: null };
    }
    case 'paste': {
      let src = (Array.isArray(op.els) ? op.els : []).slice(0, 1500).map(sanitizeEl).filter(Boolean);
      if (!T) src = src.filter(e => STUDENT_ADD.includes(e.type)).map(e => Object.assign(e, { by: who.id }));
      if (!src.length) return null;
      const dx = num(op.dx, 40, -LIM, LIM), dy = num(op.dy, 40, -LIM, LIM);
      const made = remapCopy(src, dx, dy);
      made.forEach(e => { if (e.type === 'frame') b.elements.unshift(e); else b.elements.push(e); });
      if (T && Array.isArray(op.strokes)) op.strokes.slice(0, 2000).forEach(s0 => {
        const s = sanitizeStroke(s0, who.id); if (!s) return;
        s.id = newId(); s.pts.forEach(p => { p[0] += dx; p[1] += dy; }); b.strokes.push(s);
      });
      upd.full = true; upd.made = made.map(e => e.id);
      return { upd, action: null };
    }
    case 'html-state': {
      const e = find(idOf(op.id)); if (!e || e.type !== 'html' || !canSee(e) || (!T && e.lock)) return null;
      const f = (Array.isArray(op.f) ? op.f : []).slice(0, 600).map(x => ({ v: str(x && x.v, 2000), c: str(x && x.c, 300), k: x && x.k ? 1 : 0 }));
      e.state = { at: Date.now(), by: who.name, f };
      upd.els = [e];
      return { upd, action: op.checked ? 'checked answers in «' + (e.title || 'interactive task') + '»' : null };
    }
    case 'game': {
      const ge = find(idOf(op.id)); if (!ge || !canSee(ge) || !Games.has(ge.type)) return null;
      const gr = Games.op(b, ge, op, { T, who, find });
      if (!gr) return null;
      if (gr.err) { upd.err = gr.err; return { upd, action: null }; }
      if (gr.full) upd.full = true; else upd.els = [ge];
      return { upd, action: gr.action || null, award: gr.award || null };
    }
    case 'claim': {
      const f = find(idOf(op.id));
      if (!f || f.type !== 'frame' || T || !f.claim || f.hidden) return null;
      if (isOwner(f, who)) f.owners = f.owners.filter(o => o.id !== who.id);
      else { if (f.owners.length >= 12) return null; f.owners.push({ id: who.id, name: who.name }); }
      upd.full = true;
      return { upd, action: (isOwner(f, who) ? 'joined ' : 'left ') + '«' + (f.title || 'frame') + '»' };
    }
  }

  if (!T) return null;
  /* только учитель */
  switch (op.t) {
    case 'el-set': {
      const e = sanitizeEl(op.el); if (!e) return null;
      const i = b.elements.findIndex(x => x.id === e.id);
      if (i >= 0) {
        if (e.type === 'card' && b.elements[i].type === 'card') e.slot = b.elements[i].slot;
        b.elements[i] = e;
      } else { if (e.type === 'card') { e.hx = e.x; e.hy = e.y; } b.elements.push(e); }
      upd.els = [e];
      if (op.front) { b.elements = b.elements.filter(x => x !== e); b.elements.push(e); upd.order = b.elements.map(x => x.id); }
      if (e.type === 'frame') upd.full = true;
      return { upd, action: null };
    }
    case 'el-many': {
      const add = (Array.isArray(op.els) ? op.els : []).slice(0, 1500).map(sanitizeEl).filter(Boolean);
      add.forEach(e => { while (find(e.id)) e.id = newId(); if (e.type === 'card') { e.hx = e.x; e.hy = e.y; } });
      // фреймы кладём под содержимое
      add.filter(e => e.type === 'frame').forEach(e => b.elements.unshift(e));
      add.filter(e => e.type !== 'frame').forEach(e => b.elements.push(e));
      if (op.grow) { const f = find(idOf(op.grow.id)); if (f && f.type === 'frame') { f.h = Math.max(f.h, num(op.grow.h, f.h, 80, 40000)); } }
      upd.full = true;
      return { upd, action: null };
    }
    case 'meta': {
      if (op.title) b.title = str(op.title, 160);
      if ('bg' in op) b.bg = col(op.bg);
      if (['dots', 'lines', 'none'].includes(op.grid)) b.grid = op.grid;
      upd.meta = metaOf(b);
      return { upd, action: null };
    }
    case 'perm': {
      if ('studentEdit' in op) b.studentEdit = op.studentEdit !== false;
      if (['any', 'platform', 'none'].includes(op.copy)) b.copy = op.copy;   // можно ли копировать с этой доски
      upd.full = true;
      return { upd, action: null };
    }
    case 'step-open': {
      const f = find(idOf(op.frame)); if (!f || f.type !== 'frame') return null;
      f.open = num(op.n, 0, 0, 999);
      upd.full = true;
      return { upd, action: null };
    }
    case 'step-seq': {
      if (!T) return null;
      const f = find(idOf(op.frame)); if (!f || f.type !== 'frame') return null;
      if ('on' in op) f.seq = !!op.on;
      if (op.gates) f.gates = cleanGates(op.gates);
      if (op.reset && b.prog) delete b.prog[f.id];
      upd.full = true;
      return { upd, action: null };
    }
    case 'step-grant': {
      if (!T) return null;
      const f = find(idOf(op.frame)); if (!f || f.type !== 'frame' || !f.seq) return null;
      const sid = idOf(op.student); if (!sid) return null;
      const steps = stepList(b, f); if (!steps.length) return null;
      b.prog = b.prog || {}; const fp = b.prog[f.id] = b.prog[f.id] || {};
      const n = steps.find(x => x >= num(op.n, 1, 0, 999)) || steps[steps.length - 1];
      fp[sid] = { n, at: Date.now() };
      upd.full = true;
      return { upd, action: null };
    }
    case 'lesson': {
      const f = op.frame ? find(idOf(op.frame)) : null;
      b.lesson = f ? { frame: f.id, title: f.title || 'Lesson', at: Date.now() } : null;
      upd.meta = metaOf(b);
      return { upd, action: f ? 'started the lesson «' + (f.title || 'Lesson') + '»' : null };
    }
    case 'lesson-end': {
      const words = (Array.isArray(op.words) ? op.words : []).map(x => str(x, 120).trim()).filter(Boolean).slice(0, 80);
      const acts = (Array.isArray(op.acts) ? op.acts : []).map(x => str(x, 160).trim()).filter(Boolean).slice(0, 40);
      b.exit = { id: newId(), at: Date.now(), title: str(op.title || (b.lesson && b.lesson.title) || b.title, 160), words, acts };
      b.lesson = null;
      upd.meta = metaOf(b);
      return { upd, action: 'ended the lesson — exit ticket sent' };
    }
    case 'modules': {
      // модули: учитель объединяет фреймы в группы для быстрого поиска
      if (!T) return null;
      const ids = new Set(b.elements.filter(e => e.type === 'frame').map(e => e.id));
      b.modules = (Array.isArray(op.modules) ? op.modules : []).slice(0, 100).map(m => ({ id: idOf(m && m.id) || newId(), name: str(m && m.name, 120).trim() || 'Module', color: col(m && m.color), open: m && m.open !== false, frames: (Array.isArray(m && m.frames) ? m.frames : []).map(idOf).filter(x => ids.has(x)).slice(0, 500) }));
      upd.meta = metaOf(b);
      return { upd, action: null };
    }
    case 'present': {
      // режим презентации: учитель листает фреймы, ученики следуют за ним (если follow)
      if (!T) return null;
      if (op.off) b.present = null;
      else {
        const f = op.frame ? find(idOf(op.frame)) : null;
        if (f && f.type !== 'frame') return null;
        const prev = b.present || {};
        b.present = { on: true, frame: f ? f.id : (prev.frame || null), follow: 'follow' in op ? !!op.follow : prev.follow !== false, at: Date.now() };
      }
      upd.meta = metaOf(b);
      return { upd, action: null };
    }
    case 'anon': {
      const wasPriv = !!(b.anon && b.anon.priv);
      b.anon = { on: !!op.on, hide: !!op.on && !!op.hide && !op.priv, priv: !!op.on && !!op.priv };
      if (wasPriv && !b.anon.priv) b.elements.forEach(e => { delete e.priv; });   // раскрыли: текст виден всем, авторы остаются анонимными
      upd.full = true;
      return { upd, action: null };
    }
    case 'timer': {
      if (op.stop) b.timer = null;
      else if (op.pause && b.timer && b.timer.end) b.timer = { left: Math.max(0, b.timer.end - Date.now()), dur: b.timer.dur, paused: true };
      else if (op.resume && b.timer && b.timer.paused) b.timer = { end: Date.now() + b.timer.left, dur: b.timer.dur };
      else { const sec = num(op.sec, 300, 5, 6 * 3600); b.timer = { end: Date.now() + sec * 1000, dur: sec * 1000 }; }
      upd.meta = metaOf(b);
      return { upd, action: null };
    }
    case 'order-set': {
      const pos = {}; (Array.isArray(op.order) ? op.order : []).slice(0, 20000).forEach((id, i) => { pos[idOf(id)] = i; });
      const big = 1e9;
      b.elements = b.elements.map((e, i) => [e, i]).sort((x, y) => ((pos[x[0].id] ?? big + x[1]) - (pos[y[0].id] ?? big + y[1]))).map(x => x[0]);
      upd.order = b.elements.map(e => e.id);
      return { upd, action: null };
    }
    case 'check-clear': {
      b.check = null; upd.check = null;
      return { upd, action: null };
    }
    case 'scale-clear': {
      const sc = find(idOf(op.id)); if (!sc || !['scale', 'rating', 'poll'].includes(sc.type)) return null;
      sc.votes = {}; upd.els = [sc];
      return { upd, action: null };
    }
    case 'frame-reset': {
      const f = find(idOf(op.id)); if (!f || f.type !== 'frame') return null;
      if (op.progress && b.prog) delete b.prog[f.id];
      const inn = inside(b, f);
      const ids = [];
      inn.els.forEach(e => { if (e.type === 'card') { ids.push(e.id); if (e.slot) ids.push(e.slot); e.slot = null; e.x = e.hx; e.y = e.hy; } if (e.type === 'input') { e.value = ''; ids.push(e.id); } if (e.type === 'boxes') e.open = e.items.map(() => false); if (e.type === 'deck') e.dealt = 0; if (e.type === 'cloud') e.words = []; if (e.type === 'open') e.answers = []; if (e.type === 'flip') e.writes = []; });
      if (op.clean) {
        const kill = new Set(inn.els.filter(e => e.by && (e.type === 'note' || e.type === 'sticker' || e.type === 'image')).map(e => e.id));
        b.elements = b.elements.filter(e => !kill.has(e.id));
        const ks = new Set(inn.strokes.map(s => s.id));
        b.strokes = b.strokes.filter(s => !ks.has(s.id));
      }
      if (b.check) inn.els.forEach(e => { delete b.check.res[e.id]; if (e.type === 'sentence') e.parts.forEach(p => { if (p && p.slot) delete b.check.res[p.slot]; }); });
      upd.full = true;
      return { upd, action: null };
    }
    case 'save-template': {
      b.elements.forEach(e => { if (e.type === 'card' && !e.slot) { e.hx = e.x; e.hy = e.y; } });
      b.template = clone(b.elements);
      upd.full = true;
      return { upd, action: null };
    }
    case 'reset': {
      b.elements = clone(b.template || []);
      b.check = null;
      if (op.ink) b.strokes = [];
      upd.full = true;
      return { upd, action: null };
    }
    case 'clear-ink': {
      b.strokes = []; upd.full = true;
      return { upd, action: null };
    }
  }
  return null;
}

const metaOf = b => ({ title: b.title, width: b.width, bg: b.bg || '', grid: b.grid || 'dots', timer: b.timer || null, anon: b.anon || null, studentEdit: b.studentEdit !== false, copy: ['any', 'none'].includes(b.copy) ? b.copy : 'platform', lesson: b.lesson || null, exit: b.exit || null, modules: b.modules || [], rooms: b.rooms && b.rooms.on ? b.rooms : null, present: b.present && b.present.on ? b.present : null });
/* что отправить конкретному участнику */
function publicBoard(b, who) {
  who = who || { role: 't' };
  seqTick(b, who);
  const els = b.elements.filter(e => visibleTo(b, e, who)).map(e => stripFor(e, who, b));
  const strokes = b.strokes.filter(s => strokeVisible(b, s, who));
  return Object.assign(metaOf(b), { elements: els, strokes, check: b.check, log: (b.log || []).slice(-60) }, who.role === 't' ? { prog: b.prog || {} } : {});
}
function stripFor(e, who, b) {
  if (e.type === 'flip' && who.role !== 't' && e.writes && e.writes.length) { const vis = e.writes.filter(w => w.shown || w.by === who.id); e = Object.assign({}, e, { writes: vis, whid: e.writes.length - vis.length }); }
  if (e.priv && who.role !== 't' && e.by !== who.id && (e.type === 'note' || e.type === 'shape')) { e = Object.assign({}, e, { text: '', masked: true }); delete e.html; }
  if (e.type === 'frame' && who.role !== 't' && (e.seq || e.gates)) {
    const c = Object.assign({}, e); delete c.gates;
    if (e.seq && b) {
      const steps = stepList(b, e), p = seqEntry(b, e, who.id);
      if (steps.length && p) { const i = steps.indexOf(p.n), g = gateOf(b, e, p.n); c.sq = { i: i + 1, of: steps.length, k: g.k, due: g.k === 'time' ? p.at + g.m * 60000 : 0, fin: i === steps.length - 1 }; }
    }
    e = c;
  }
  if (who.role !== 't' && Games.has(e.type)) { e = Games.strip(e, who); if (e.type === 'bingo') { e = Object.assign({}, e, { card: Games.bingoCard(e, who.id) }); } }
  if (e.type === 'open' && who.role !== 't' && b && b.anon && b.anon.on) { const c = Object.assign({}, e); c.answers = e.answers.map(a => a.by === who.id ? a : Object.assign({}, a, { name: '', by: '' })); return c; }
  if (who.role === 't' || (!e.tnote && !e.tnimg && !(e.anon && e.by && e.by !== who.id))) return e;
  const c = Object.assign({}, e); delete c.tnote; delete c.tnimg;
  if (c.anon && c.by !== who.id) c.by = '';
  return c;
}
function filterUpd(b, upd, who) {
  if (who.role === 't') return upd;
  const out = Object.assign({}, upd);
  if (upd.els) {
    out.els = []; out.del = (upd.del || []).slice();
    upd.els.forEach(e => { if (visibleTo(b, e, who)) out.els.push(stripFor(e, who, b)); else out.del.push(e.id); });
  }
  if (upd.strokes) out.strokes = upd.strokes.filter(s => strokeVisible(b, s, who));
  if (upd.order) out.order = upd.order.filter(id => { const e = b.elements.find(x => x.id === id); return e && visibleTo(b, e, who); });
  return out;
}
const pointVisible = (b, p, who) => who.role === 't' || !framesAt(b, p).some(f => frameBlocks(f, who));

module.exports = { ownedFrameOf, liteBoard, wrapFrame, ownedScores, metaOf, remapCopy, FONTS, makeBoard, applyOp, evaluate, publicBoard, filterUpd, visibleTo, pointVisible, duplicateFrame, sanitizeEl, clone };
