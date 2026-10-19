/* ═══════════════════════════════════════════════════════
   LONG PRESS — calls back after a held press and swallows
   the click that ends it.
═══════════════════════════════════════════════════════ */

const _LONG_PRESS_SLOP_PX = 10;

function onLongPress(el, ms, onLong) {
  let timer = null;
  let origin = null;
  let fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const moved = e => Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > _LONG_PRESS_SLOP_PX;

  el.addEventListener('pointerdown', e => {
    cancel();
    fired = false;
    origin = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { timer = null; fired = true; onLong(); }, ms);
  });
  el.addEventListener('pointermove', e => { if (timer && moved(e)) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => el.addEventListener(type, cancel));
  el.addEventListener('click', e => {
    if (!fired) return;
    fired = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { onLongPress };
}
if (typeof window !== 'undefined') {
  window.onLongPress = onLongPress;
}
