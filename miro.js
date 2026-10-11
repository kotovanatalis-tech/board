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
  f = String(f || '').toLowerCase();
  if (f.includes('unbounded')) return 'Unbounded';
  if (f.includes('montserrat')) return 'Montserrat';
  if (f.includes('mono')) return 'Roboto Mono';
  if (/caveat|marker|lemon|bangers|short/.test(f)) return 'Caveat';
  if (/pt_serif/.test(f)) return 'PT Serif';
  if (/serif|georgia|times|garamond|slab|tiempos/.test(f)) return 'Lora';
  if (/abril|playfair|gravitas|rammetto|titan/.test(f)) return 'Playfair Display';
  if (/nunito|fredoka/.test(f)) return 'Nunito';
  if (/rubik/.test(f)) return 'Rubik';
  return null;
}
const hex = v => /^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? String(v) : null;
function plain(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n+$/, '').trim();
}
const richHtml = html => /<(strong|b|em|i|u|s|span|ul|ol|li)[\s>]/i.test(String(html || '')) ? String(html).replace(/<a\b[^>]*>/gi, '').replace(/<\/a>/gi, '') : null;
const align = a => ({ left: 'left', center: 'center', right: 'right' })[a] || null;

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
  const stats = { items: 0, images: 0, skipped: 0, failedImages: 0 };
  const els = [];
  const map = {};
  const fx = (n) => Math.round(n * 10) / 10;
  // фреймы первыми, чтобы лежали под содержимым
  picked.sort((a, b) => (a.type === 'frame' ? 0 : 1) - (b.type === 'frame' ? 0 : 1));
  const images = [];
  for (const it of picked) {
    const b = absBox(it, byId), d = it.data || {}, st = it.style || {};
    const id = 'm' + it.id.slice(-9) + Math.random().toString(36).slice(2, 5);
    let e = null;
    switch (it.type) {
      case 'frame':
        e = { type: 'frame', x: b.x, y: b.y, w: b.w, h: b.h, title: d.title || 'Frame', fill: hex(st.fillColor) || '' };
        break;
      case 'sticky_note': {
        const w = b.w || 200, h = b.h || w;
        e = { type: 'note', x: b.x, y: b.y, w, h, text: plain(d.content), color: STICKY[st.fillColor] || hex(st.fillColor) || '#FFF1A8', align: align(st.textAlign) };
        const rh = richHtml(d.content); if (rh) e.html = rh;
        break;
      }
      case 'text': {
        const size = Number(st.fontSize) || 14;
        e = { type: 'text', x: b.x, y: b.y, w: b.w || 300, size, text: plain(d.content), fc: hex(st.color), font: font(st.fontFamily), align: align(st.textAlign) };
        const rh = richHtml(d.content); if (rh) e.html = rh;
        if (hex(st.fillColor) && st.fillColor !== '#ffffff' && Number(st.fillOpacity || 1) > 0.05) e.hl = st.fillColor;
        break;
      }
      case 'shape': {
        const shp = SHAPE[d.shape] || 'rect';
        const fill = st.fillColor && st.fillColor !== 'transparent' && Number(st.fillOpacity == null ? 1 : st.fillOpacity) > 0.02 ? hex(st.fillColor) : 'none';
        const bw = Number(st.borderOpacity == null ? 1 : st.borderOpacity) > 0.02 ? Math.round(Number(st.borderWidth) || 0) : 0;
        e = { type: 'shape', shape: shp, x: b.x, y: b.y, w: b.w || 100, h: b.h || 100, fill: fill || 'none', stroke: hex(st.borderColor) || '#1E1E1C', sw: Math.min(40, bw), dash: st.borderStyle === 'dashed' || st.borderStyle === 'dotted',
          text: plain(d.content), size: Number(st.fontSize) || 14, fc: hex(st.color), font: font(st.fontFamily), align: align(st.textAlign) };
        const rh = richHtml(d.content); if (rh) e.html = rh;
        break;
      }
      case 'image':
        if (!d.imageUrl) { stats.skipped++; break; }
        e = { type: 'image', x: b.x, y: b.y, w: b.w || 300, h: b.h || 200, src: '' };
        images.push({ e, url: d.imageUrl });
        break;
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
        stats.skipped++;
    }
    if (!e) continue;
    e.id = id; map[it.id] = id;
    ['x', 'y', 'w', 'h'].forEach(k => { if (e[k] != null) e[k] = fx(e[k]); });
    Object.keys(e).forEach(k => { if (e[k] == null || e[k] === '') delete e[k]; });
    if (e.type === 'image') e.src = '';
    els.push(e); stats.items++;
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
