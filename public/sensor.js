/*
 * Датчик задания. Платформа сама добавляет его в каждое загруженное HTML-задание.
 * Он собирает ответы (поля ввода, выпадающие списки, галочки, элементы .gap / [data-gap] / [data-answer]),
 * результат проверки (классы ok/correct и bad/wrong), положение на странице и последнее действие,
 * и передаёт всё странице ученика, а она — учителю.
 *
 * Для своих заданий можно сообщать ответы явно:
 *   window.classroom.report('q1', 'ответ', { correct: true, label: 'Вопрос 1' })
 * Часть страницы, которую не нужно отслеживать, пометьте атрибутом data-cls-ignore.
 */
(function () {
  if (window.parent === window || window.__clsSensor) return;
  window.__clsSensor = true;

  var SEL = 'input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]):not([type=file]),' +
    'textarea,select,[contenteditable]:not([contenteditable=false]),.gap,[data-gap],[data-answer]';
  var custom = {}, customOrder = [];
  var seq = 0, lastAction = '', lastSent = '', timer = null;

  window.classroom = {
    report: function (key, value, opts) {
      key = String(key);
      if (!custom[key]) customOrder.push(key);
      custom[key] = {
        v: value == null ? '' : String(value),
        ok: opts && typeof opts.correct === 'boolean' ? opts.correct : null,
        ctx: (opts && opts.label) || key
      };
      schedule(50);
    }
  };

  function clean(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  function ctxOf(el) {
    var p = el.closest('li,p,tr,label,.question,.q,.item,.task,.sent') || el.parentElement;
    return clean(p ? p.innerText : '').slice(0, 160);
  }
  function okOf(el) {
    for (var n = el, i = 0; n && n.classList && i < 2; n = n.parentElement, i++) {
      var c = n.classList;
      if (c.contains('ok') || c.contains('correct') || c.contains('right') || c.contains('is-correct')) return true;
      if (c.contains('bad') || c.contains('wrong') || c.contains('incorrect') || c.contains('is-wrong')) return false;
    }
    return null;
  }
  function valOf(el) {
    if (el.matches('input[type=checkbox]')) return el.checked ? '✓' : '';
    if (el.tagName === 'SELECT') { var o = el.options[el.selectedIndex]; return o && o.value !== '' ? clean(o.text) : ''; }
    if (el.matches('input,textarea')) return el.value;
    return clean(el.innerText);
  }
  function collect() {
    var els = Array.prototype.slice.call(document.querySelectorAll(SEL));
    var out = [], radios = {};
    els.forEach(function (el, i) {
      if (el.closest('[data-cls-ignore]')) return;
      if (el.matches('input[type=radio]')) {
        var n = el.name || ('r' + i);
        if (!radios[n]) { radios[n] = { k: 'radio:' + n, ctx: ctxOf(el), v: '', ok: null, el: el }; out.push(radios[n]); }
        if (el.checked) {
          var lab = el.labels && el.labels[0];
          radios[n].v = lab ? clean(lab.innerText) : el.value;
          radios[n].ok = okOf(lab || el);
        }
        return;
      }
      out.push({ k: el.id || el.name || (el.tagName.toLowerCase() + '#' + i), ctx: ctxOf(el), v: valOf(el), ok: okOf(el), el: el });
    });
    customOrder.forEach(function (k) { out.push({ k: 'report:' + k, ctx: custom[k].ctx, v: custom[k].v, ok: custom[k].ok }); });
    return out;
  }
  function nearest(list) {
    var mid = window.innerHeight / 2, best = 0, bd = Infinity;
    list.forEach(function (f, i) {
      if (!f.el) return;
      var r = f.el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      var d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bd) { bd = d; best = i + 1; }
    });
    return best;
  }
  function scrollPct() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    return h > 0 ? Math.round(window.scrollY / h * 100) : 0;
  }
  function send(force) {
    timer = null;
    var list = collect();
    var snap = {
      fields: list.map(function (f) { return { k: f.k, ctx: f.ctx, v: f.v, ok: f.ok }; }),
      scroll: scrollPct(), near: nearest(list), action: lastAction, seq: seq
    };
    var json = JSON.stringify(snap);
    if (!force && json === lastSent) return;
    lastSent = json;
    window.parent.postMessage({ __cls: 1, snap: snap }, location.origin);
  }
  function schedule(ms) { if (timer) clearTimeout(timer); timer = setTimeout(send, ms == null ? 300 : ms); }
  function act(text) { if (text !== lastAction) { lastAction = text; seq++; } schedule(); }
  function labelOf(el) {
    return clean(el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').slice(0, 60);
  }
  function itemNo(el) {
    var list = collect();
    for (var i = 0; i < list.length; i++) if (list[i].el === el || (list[i].el && list[i].el.contains && list[i].el.contains(el))) return i + 1;
    return 0;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button,a,[role=button],.chip,label,input[type=checkbox],input[type=radio]');
    if (b && !b.closest('[data-cls-ignore]')) {
      var t = labelOf(b);
      act(t ? 'pressed «' + t + '»' : 'pressed a button');
    } else schedule();
  }, true);
  document.addEventListener('input', function (e) {
    var n = itemNo(e.target);
    act(n ? 'typing in item ' + n : 'typing an answer');
  }, true);
  document.addEventListener('change', function () { schedule(); }, true);
  window.addEventListener('scroll', function () { schedule(500); }, { passive: true });
  new MutationObserver(function () { schedule(); }).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'value', 'aria-checked']
  });
  window.addEventListener('message', function (e) {
    if (e.origin === location.origin && e.data && e.data.__clsPing) send(true);
  });
  if (document.readyState === 'complete') schedule(200);
  else window.addEventListener('load', function () { schedule(200); });
})();
