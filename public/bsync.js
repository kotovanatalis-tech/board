/*
 * Shared state for an interactive HTML block on the board.
 * Collects what people typed or chose (inputs, selects, gaps, chips, result text) and sends it to the board,
 * which saves it and shows the same state to everyone else.
 * Mark extra parts to share with data-sync; parts to ignore with data-cls-ignore.
 */
(function () {
  if (window.parent === window || window.__bsync) return;
  window.__bsync = true;
  var SEL = 'input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]),textarea,select,' +
    '[contenteditable]:not([contenteditable=false]),.gap,[data-gap],[data-answer],.score,[data-sync],[aria-pressed]';
  var applying = false, timer = null, last = '', checked = false, ready = false;
  function els() { return Array.prototype.slice.call(document.querySelectorAll(SEL)).filter(function (e) { return !e.closest('[data-cls-ignore]'); }); }
  function snap() {
    return els().map(function (e) {
      var v;
      if (e.matches('input[type=checkbox],input[type=radio]')) return { v: '', c: e.className, k: e.checked ? 1 : 0 };
      if (e.matches('input,textarea,select')) v = e.value;
      else v = e.textContent;
      return { v: v, c: e.className };
    });
  }
  function send() {
    timer = null; if (applying) return;
    var f = snap(), j = JSON.stringify(f);
    if (j === last) return;
    last = j;
    window.parent.postMessage({ __bsync: 1, f: f, checked: checked }, location.origin);
    checked = false;
  }
  function schedule() { if (applying || !ready) return; clearTimeout(timer); timer = setTimeout(send, 250); }
  function apply(f) {
    applying = true;
    try {
      var list = els();
      f.forEach(function (s, i) {
        var e = list[i]; if (!e || document.activeElement === e) return;
        if (e.matches('input[type=checkbox],input[type=radio]')) e.checked = !!s.k;
        else if (e.matches('input,textarea,select')) { if (e.value !== s.v) e.value = s.v; }
        else if (e.textContent !== s.v) e.textContent = s.v;
        if (typeof s.c === 'string' && e.className !== s.c) e.className = s.c;
      });
      last = JSON.stringify(snap());
    } finally { setTimeout(function () { applying = false; }, 50); }
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.__bsyncApply) { if (e.data.f && e.data.f.length) apply(e.data.f); else last = JSON.stringify(snap()); ready = true; }
  });
  document.addEventListener('input', schedule, true);
  document.addEventListener('change', schedule, true);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button,[role=button]');
    if (b && /check|провер/i.test(b.innerText || '')) checked = true;
    schedule();
  }, true);
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  window.parent.postMessage({ __bsyncReady: 1 }, location.origin);
})();
