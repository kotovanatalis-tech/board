'use strict';
/*
 * Перенос досок из Miro через REST API v2 (нужен токен Miro с правом boards:read).
 * Фреймы, стикеры, тексты, фигуры, картинки (скачиваются к нам), встроенные сайты и стрелки.
 */
const API = process.env.MIRO_API || 'https://api.miro.com';

function boardIdFrom(link) {
  const m = /board\/([^/?#\s]+)/.exec(String(link || ''));
  return m ? decodeURIComponent(m[1]) : String(link || '').trim();
}

async function call(token, pathAndQuery, tries) {
  tries = tries || 0;
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 30000);
  let r;
  try { r = await fetch(API + pathAndQuery, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: ctl.signal }); }
  catch (e) { clearTimeout(tm); if (tries < 3) { await sleep(1500 * (tries + 1)); return call(token, pathAndQuery, tries + 1); } throw new Error('Miro is not reachable'); }
  clearTimeout(tm);
  if (r.status === 429 && tries < 6) { await sleep(3000 * (tries + 1)); return call(token, pathAndQuery, tries + 1); }
  if (r.status === 401) throw new Error('Miro did not accept the token');
  if (r.status === 403) throw new Error('This token has no access to the board (it needs boards:read and the board must be in the team where the app is installed)');
  if (r.status === 404) throw new Error('Miro says this board is not in the team where the app is installed (or the link is wrong). Install the app into the board’s team and use that token — or move a copy of the board into that team.');
  if (!r.ok) { if (r.status >= 500 && tries < 3) { await sleep(2000); return call(token, pathAndQuery, tries + 1); } throw new Error('Miro error ' + r.status); }
  return r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bpath = id => '/v2/boards/' + encodeURIComponent(id);

async function listAll(token, board, extra) {
  const out = []; let cursor = '';
  for (let page = 0; page < 1000; page++) {
    const d = await call(token, bpath(board) + '/items?limit=50' + (extra || '') + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    (d.data || []).forEach(x => out.push(x));
    if (!d.cursor) break; cursor = d.cursor;
  }
  return out;
}
async function listConnectors(token, board) {
  const out = []; let cursor = '';
  for (let page = 0; page < 200; page++) {
    let d; try { d = await call(token, bpath(board) + '/connectors?limit=50' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')); } catch (e) { break; }
    (d.data || []).forEach(x => out.push(x));
    if (!d.cursor) break; cursor = d.cursor;
  }
  return out;
}

async function frames(token, link) {
  const board = boardIdFrom(link);
  const info = await call(token, bpath(board));
  const fr = await listAll(token, board, '&type=frame');
  return {
    board, title: info.name || 'Miro board',
    frames: fr.map(f => ({ id: String(f.id), title: (f.data && f.data.title) || 'Frame', w: Math.round((f.geometry && f.geometry.width) || 0), h: Math.round((f.geometry && f.geometry.height) || 0), x: (f.position && f.position.x) || 0, y: (f.position && f.position.y) || 0 }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
  };
}

/* ---------- перевод в наш формат ---------- */
const STICKY = { gray: '#E3E2DE', light_yellow: '#FFF1A8', yellow: '#FFE38A', orange: '#FFD2B0', light_green: '#E6F0A8', green: '#BFE8D2', dark_green: '#9ED6B5', cyan: '#C3EBF0', light_pink: '#FFC2CF', pink: '#F7B3D2', violet: '#D9C8F5', red: '#F7A9A0', light_blue: '#C3DAF7', blue: '#A9C4F2', dark_blue: '#8FA8E8', black: '#3A3A37', white: '#FFFFFF' };
const SHAPE = { rectangle: 'rect', round_rectangle: 'round', circle: 'ellipse', triangle: 'triangle', rhombus: 'diamond', parallelogram: 'parallelogram', hexagon: 'hexagon', octagon: 'hexagon', pentagon: 'hexagon', wedge_round_rectangle_callout: 'speech', star: 'star', right_arrow: 'arrow', flow_chart_process: 'rect', flow_chart_decision: 'diamond', flow_chart_terminator: 'round', flow_chart_connector: 'ellipse' };
function font(f) {
  f = String(f || '').toLowerCase().replace(/[\s-]+/g, '_');
  const map = [[/open_sans/, 'Open Sans'], [/noto_sans|noto/, 'Noto Sans'], [/^arial|helvetica/, 'Arimo'], [/roboto_condensed/, 'Roboto Condensed'], [/roboto_slab/, 'Roboto Slab'], [/roboto_mono|plex_mono|mono/, 'Roboto Mono'],
    [/^roboto/, 'Roboto'], [/pt_sans/, 'PT Sans'], [/pt_serif/, 'PT Serif'], [/eb_garamond|garamond/, 'EB Garamond'], [/georgia|times|tiempos|plex_serif|serif|slab/, 'Lora'],
    [/unbounded/, 'Unbounded'], [/montserrat|formular/, 'Montserrat'], [/permanent_marker|marker/, 'Permanent Marker'], [/caveat|lemon|bangers|short/, 'Caveat'],
    [/abril|playfair|gravitas|rammetto|titan/, 'Playfair Display'], [/fredoka/, 'Fredoka'], [/nunito/, 'Nunito'], [/rubik|plex_sans|spoof|nixie|graduate/, 'Rubik']];
  for (const [re, name] of map) if (re.test(f)) return name;
  return null;
}
const hex = v => /^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? String(v) : null;
function plain(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n+$/, '').trim();
}
const PH = /^\s*type something\s*$/i;
let OPT = { scale: 1, plain: false };
const richHtml = html => OPT.plain ? null : /<(strong|b|em|i|u|s|span|ul|ol|li)[\s>]/i.test(String(html || '')) ? String(html).replace(/<a\b[^>]*>/gi, '').replace(/<\/a>/gi, '') : null;
/* размер, цвет и шрифт часто лежат не в style элемента, а в span внутри текста — берём тот, что покрывает больше всего букв */
function spanProps(html) {
  const sizes = {}, cols = {}, fams = {}; const re = /<span\b[^>]*style\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi; let m;
  while ((m = re.exec(String(html || '')))) {
    const len = plain(m[2]).length; if (!len) continue;
    const fs = /font-size:\s*([\d.]+)\s*px/i.exec(m[1]); if (fs) sizes[fs[1]] = (sizes[fs[1]] || 0) + len;
    const c = /(?:^|;)\s*color:\s*(#[0-9a-f]{3,8})/i.exec(m[1]); if (c) cols[c[1]] = (cols[c[1]] || 0) + len;
    const ff = /font-family:\s*([^;]+)/i.exec(m[1]); if (ff) { const k = ff[1].replace(/["']/g, '').split(',')[0].trim(); fams[k] = (fams[k] || 0) + len; }
  }
  const top = o => Object.keys(o).sort((a, b) => o[b] - o[a])[0];
  return { size: Number(top(sizes)) || 0, color: top(cols) || null, family: top(fams) || null };
}
function leafStrings(o, out, key) {
  out = out || [];
  if (typeof o === 'string') { const t = plain(o); if (t && !/^https?:\/\//i.test(t) && !/^[0-9a-f-]{12,}$/i.test(t)) out.push({ k: key || '', t }); }
  else if (Array.isArray(o)) o.forEach(x => leafStrings(x, out, key));
  else if (o && typeof o === 'object') Object.keys(o).forEach(k => leafStrings(o[k], out, k));
  return out;
}
function emojiOf(d) {
  const raw = d && (d.code || d.emoji || d.unicode || d.char || d.value);
  if (!raw) return '';
  const str = String(raw);
  if (/[^\x00-\x7f]/.test(str)) return str.slice(0, 16);
  try { return str.split(/[-_ +]/).filter(Boolean).map(h => String.fromCodePoint(parseInt(h.replace(/^u\+?/i, ''), 16))).join(''); } catch (e) { return ''; }
}
/* Miro не всегда отдаёт настоящий размер шрифта (особенно для своих шрифтов) — прикидываем по высоте блока */
function estSize(text, w, h, base) {
  if (!h || !w || !text) return base;
  const paras = String(text).split('\n'); let best = base, bd = Infinity;
  for (let s = 8; s <= 200; s++) {
    const lines = paras.reduce((a, p) => a + Math.max(1, Math.ceil(p.length * 0.52 * s / w)), 0), d = Math.abs(lines * 1.25 * s - h);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
const tx = html => { const t = plain(html); return PH.test(t) ? '' : t; };
const align = a => ({ left: 'left', center: 'center', right: 'right' })[a] || null;

const rotOf = it => { let r = Number((it.geometry || {}).rotation) || 0; r = ((Math.round(r) % 360) + 540) % 360 - 180; return r || null; };
const valign = a => ({ top: 'top', bottom: 'bottom' })[a] || null;

/* абсолютная позиция левого верхнего угла */
function absBox(it, byId) {
  const g = it.geometry || {}, p = it.position || {};
  const w = Number(g.width) || 0, h = Number(g.height) || 0;
  let cx = Number(p.x) || 0, cy = Number(p.y) || 0;
  if (p.origin && p.origin !== 'center') { cx += w / 2; cy += h / 2; }
  if (p.relativeTo === 'parent_top_left' && it.parent && byId[it.parent.id]) {
    const pb = absBox(byId[it.parent.id], byId);
    cx += pb.x; cy += pb.y;
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/*
 * opts: { token, board, frameIds:[...]|null(all), saveImage(url)->Promise<'/img/..'>, saveEmbed(url,title)->'/bh/..', progress(text,done,total) }
 * returns { title, elements, stats }
 */
async function importBoard(opts) {
  const { token, board } = opts;
  OPT = { scale: Math.max(0.5, Math.min(1.5, Number(opts.textScale) || 1)), plain: !!opts.plainText };
  const progress = opts.progress || (() => {});
  progress('Reading the board…', 0, 1);
  const all = opts.all || await listAll(token, board);
  const byId = {}; all.forEach(it => { byId[String(it.id)] = it; it.id = String(it.id); if (it.parent && it.parent.id) it.parent.id = String(it.parent.id); });
  const want = opts.frameIds && opts.frameIds.length ? new Set(opts.frameIds.map(String)) : null;
  const topFrame = it => { let p = it; const seen = new Set(); while (p && p.parent && byId[p.parent.id] && !seen.has(p.id)) { seen.add(p.id); p = byId[p.parent.id]; } return p; };
  const picked = all.filter(it => {
    if (!want) return true;
    const top = topFrame(it);
    return top && top.type === 'frame' && want.has(top.id);
  });
  const stats = { items: 0, images: 0, skipped: 0, failedImages: 0, types: {}, fonts: {}, samples: {} };
  const seenFont = (name) => { if (name && !font(name)) stats.fonts[name] = (stats.fonts[name] || 0) + 1; };
  const els = [];
  const map = {};
  const fx = (n) => Math.round(n * 10) / 10;
  // фреймы первыми, чтобы лежали под содержимым
  picked.sort((a, b) => (a.type === 'frame' ? 0 : 1) - (b.type === 'frame' ? 0 : 1));
  const images = [];
  // группы Miro (type: group, data.items = id участников) переносим как группы: участники двигаются вместе
  const gmap = {};
  all.forEach(it => { if (it.type === 'group' && it.data && Array.isArray(it.data.items)) it.data.items.forEach(x => { const k = String(x && x.id != null ? x.id : x); if (!gmap[k]) gmap[k] = 'mg' + String(it.id).slice(-8); }); });
  for (const it of picked) {
    const b = absBox(it, byId), d = it.data || {}, st = it.style || {};
    const id = 'm' + it.id.slice(-9) + Math.random().toString(36).slice(2, 5);
    let e = null;
    switch (it.type) {
      case 'frame':
        const fc0 = String(st.fillColor || '').toLowerCase(), al = /^#[0-9a-f]{8}$/.test(fc0) ? parseInt(fc0.slice(7), 16) / 255 : 1;
        const clear = !hex(st.fillColor) || al < 0.05 || Number(st.fillOpacity == null ? 1 : st.fillOpacity) < 0.05;   // у Miro фрейм может быть без заливки
        e = { type: 'frame', x: b.x, y: b.y, w: b.w, h: b.h, title: plain(d.title) || 'Frame', fill: clear ? '' : hex(st.fillColor), lite: clear ? true : undefined };
        break;
      case 'sticky_note': {
        const w = b.w || 200, h = b.h || w, sp = spanProps(d.content); seenFont(sp.family || st.fontFamily);
        e = { type: 'note', fc: sp.color && !OPT.plain ? hex(sp.color) : hex(st.color), x: b.x, y: b.y, w, h, text: tx(d.content), color: STICKY[st.fillColor] || hex(st.fillColor) || '#FFF1A8', align: align(st.textAlign), va: valign(st.textAlignVertical), font: font(sp.family) || font(st.fontFamily), rot: rotOf(it) };
        const rh = richHtml(d.content); if (rh && e.text) e.html = rh;
        break;
      }
      case 'text': {
        const sp = spanProps(d.content); seenFont(sp.family || st.fontFamily);
        let size0 = sp.size || Number(st.fontSize) || 14;
        if (!sp.size && String(st.fontFamily || '').toLowerCase() === 'unknown') { const eg = estSize(plain(d.content), b.w, b.h, size0); if (eg > size0 * 1.25) size0 = eg; }
        const size = Math.round(size0 * OPT.scale * 10) / 10;
        e = { type: 'text', x: b.x, y: b.y, w: b.w || 300, size, text: tx(d.content), fc: hex(sp.color) || hex(st.color), font: font(sp.family) || font(st.fontFamily), align: align(st.textAlign), rot: rotOf(it) };
        const rh = richHtml(d.content); if (rh && e.text) e.html = rh;
        if (hex(st.fillColor) && st.fillColor !== '#ffffff' && Number(st.fillOpacity || 1) > 0.05) e.hl = st.fillColor;
        break;
      }
      case 'shape': {
        const shp = SHAPE[d.shape] || 'rect';
        const sp = spanProps(d.content); seenFont(sp.family || st.fontFamily);
        const fill = st.fillColor && st.fillColor !== 'transparent' && Number(st.fillOpacity == null ? 1 : st.fillOpacity) > 0.02 ? hex(st.fillColor) : 'none';
        const bw = Number(st.borderOpacity == null ? 1 : st.borderOpacity) > 0.02 ? Math.round(Number(st.borderWidth) || 0) : 0;
        e = { type: 'shape', shape: shp, x: b.x, y: b.y, w: b.w || 100, h: b.h || 100, fill: fill || 'none', stroke: hex(st.borderColor) || '#1E1E1C', sw: Math.min(40, bw), dash: st.borderStyle === 'dashed' || st.borderStyle === 'dotted',
          text: tx(d.content), size: Math.round((sp.size || Number(st.fontSize) || 14) * OPT.scale * 10) / 10, fc: hex(sp.color) || hex(st.color), font: font(sp.family) || font(st.fontFamily), align: align(st.textAlign), va: valign(st.textAlignVertical), rot: rotOf(it) };
        const rh = richHtml(d.content); if (rh && e.text) e.html = rh;
        break;
      }
      case 'image':
        if (!d.imageUrl) { stats.skipped++; break; }
        e = { type: 'image', x: b.x, y: b.y, w: b.w || 300, h: b.h || 200, src: '', rot: rotOf(it) };
        images.push({ e, url: d.imageUrl, h0: b.h });
        break;
      case 'emoji': {
        const em = emojiOf(d);
        if (!em) { stats.skipped++; stats.types.emoji = (stats.types.emoji || 0) + 1; stats.samples.emoji = stats.samples.emoji || JSON.stringify(d).slice(0, 300); break; }
        e = { type: 'sticker', x: b.x, y: b.y, emoji: em, size: Math.round(Math.max(24, Math.min(400, (b.w || b.h || 56) * 0.85))) };
        break;
      }
      case 'flip_card': {
        const ls = leafStrings(d), fr = ls.filter(x => /front/i.test(x.k)).map(x => x.t), bk = ls.filter(x => /back/i.test(x.k)).map(x => x.t), rest = ls.map(x => x.t);
        const ft = fr.length ? fr.join('\n') : rest[0] || '', bt = bk.length ? bk.join('\n') : (fr.length ? '' : rest[1] || '');
        if (!stats.samples.flip_card) stats.samples.flip_card = JSON.stringify(d).slice(0, 300);
        e = { type: 'flip', x: b.x, y: b.y, w: b.w || 260, h: b.h || 180, front: { text: ft.slice(0, 1000) }, back: { text: bt.slice(0, 1000) } };
        break;
      }
      case 'embed':
      case 'preview':
        if (d.url && opts.saveEmbed && it.type === 'embed') {
          const src = await opts.saveEmbed(d.url, d.title || 'Embedded page');
          e = { type: 'html', x: b.x, y: b.y, w: Math.max(200, b.w || 640), h: Math.max(160, b.h || 480), zoom: 1, src, title: d.title || d.url.slice(0, 80) };
        } else if (d.url) e = { type: 'note', x: b.x, y: b.y, w: Math.max(200, b.w || 240), h: Math.max(120, b.h || 120), text: (d.title ? d.title + '\n' : '') + d.url, color: '#FFFFFF' };
        break;
      case 'card':
      case 'app_card':
        e = { type: 'note', x: b.x, y: b.y, w: b.w || 320, h: Math.max(100, b.h || 120), text: plain((d.title || '') + (d.description ? '\n' + d.description : '')), color: '#FFFFFF' };
        break;
      case 'document':
        e = { type: 'note', x: b.x, y: b.y, w: Math.max(200, b.w || 240), h: Math.max(120, b.h || 160), text: '📄 ' + (d.title || 'Document') + '\n(upload the file again)', color: '#FFFFFF' };
        break;
      default:
        stats.skipped++; stats.types[it.type] = (stats.types[it.type] || 0) + 1; if (!stats.samples[it.type]) stats.samples[it.type] = JSON.stringify({ d: d, st: st }).slice(0, 400);
    }
    if (!e) continue;
    if (gmap[it.id] && e.type !== 'frame') e.g = gmap[it.id];
    e.id = id; map[it.id] = id;
    ['x', 'y', 'w', 'h'].forEach(k => { if (e[k] != null) e[k] = fx(e[k]); });
    Object.keys(e).forEach(k => { if (e[k] == null || e[k] === '') delete e[k]; });
    if (e.type === 'image') e.src = '';
    els.push(e); stats.items++;
  }
  // Miro не отдаёт порядок слоёв: большие картинки и фигуры, закрывающие почти весь фрейм, — это фон, кладём их под остальное
  {
    const frs = els.filter(x => x.type === 'frame');
    const inFrame = x => frs.find(f => x.x + (x.w || 0) / 2 >= f.x && x.x + (x.w || 0) / 2 <= f.x + f.w && x.y + (x.h || 0) / 2 >= f.y && x.y + (x.h || 0) / 2 <= f.y + f.h);
    const isBg = x => { if (x.type !== 'image' && x.type !== 'shape') return false; const f = inFrame(x); return !!f && ((x.w || 0) * (x.h || 0)) >= 0.4 * f.w * f.h; };
    const front = els.filter(x => x.type === 'frame'), bg = els.filter(isBg), rest = els.filter(x => x.type !== 'frame' && !isBg(x));
    els.length = 0; front.concat(bg, rest).forEach(x => els.push(x));
  }
  // картинки: скачиваем к себе по 4 одновременно
  let done = 0;
  const queue = images.slice();
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      try {
        const uu = new URL(job.url); const res = await call(token, uu.pathname + uu.search);
        job.e.src = await opts.saveImage(res.url);
        // в Miro у картинки часто нет высоты — берём настоящие пропорции файла, центр оставляем на месте
        const dim = opts.imageSize ? opts.imageSize(job.e.src) : null;
        if (dim && dim[0] && dim[1]) { const cy = job.e.y + (job.h0 ? job.h0 / 2 : 0), nh = Math.round(job.e.w * dim[1] / dim[0]); job.e.h = nh; job.e.y = Math.round(cy - nh / 2); }
        stats.images++;
      } catch (err) { stats.failedImages++; job.e.failed = true; }
      done++;
      if (done % 5 === 0 || done === images.length) progress('Copying images ' + done + ' of ' + images.length + '…', done, images.length);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  const out = els.filter(e => !(e.type === 'image' && (!e.src || e.failed))).map(e => { delete e.failed; return e; });
  // стрелки между перенесёнными элементами
  progress('Connecting arrows…', 1, 1);
  const cons = opts.connectors || await listConnectors(token, board);
  cons.forEach(c => {
    const a = c.startItem && map[String(c.startItem.id)], z = c.endItem && map[String(c.endItem.id)];
    if (!a || !z) return;
    const st = c.style || {};
    out.push({ id: 'c' + String(c.id).slice(-9), type: 'line', x: 0, y: 0, x2: 100, y2: 0, from: a, to: z, color: hex(st.strokeColor) || '#1E1E1C', sw: Math.max(1, Math.min(30, Math.round(Number(st.strokeWidth) || 2))),
      start: st.startStrokeCap && st.startStrokeCap !== 'none' ? 'arrow' : 'none', end: st.endStrokeCap === 'none' ? 'none' : 'arrow', dash: st.strokeStyle === 'dashed' || st.strokeStyle === 'dotted', curve: c.shape === 'curved',
      text: c.captions && c.captions[0] ? plain(c.captions[0].content).slice(0, 300) : '' });
    stats.items++;
  });
  // сдвигаем всё к началу координат
  let mx = Infinity, my = Infinity;
  out.forEach(e => { if (e.type !== 'line') { mx = Math.min(mx, e.x); my = Math.min(my, e.y); } });
  if (mx !== Infinity) out.forEach(e => { if (e.type !== 'line') { e.x = fx(e.x - mx); e.y = fx(e.y - my); } });
  return { elements: out, stats };
}

async function boards(token, query) {
  const out = []; let offset = 0;
  for (let page = 0; page < 20; page++) {
    const d = await call(token, '/v2/boards?limit=50&offset=' + offset + (query ? '&query=' + encodeURIComponent(query) : '') + '&sort=last_modified');
    (d.data || []).forEach(b => out.push({ id: b.id, name: b.name || 'Untitled', link: b.viewLink || ('https://miro.com/app/board/' + b.id + '/'), modified: b.modifiedAt || '', team: b.team && b.team.name || '' }));
    offset += (d.data || []).length;
    if (!d.data || !d.data.length || offset >= (d.total || 0)) break;
  }
  return out;
}

module.exports = { boards, boardIdFrom, frames, importBoard, listAll, listConnectors };
