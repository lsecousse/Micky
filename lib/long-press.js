/* ═══════════════════════════════════════════════════════
   LONG PRESS — calls back after a held press and swallows
   the click that ends it, on the element and on the page
   (a click after the hold must not hit what just opened).
═══════════════════════════════════════════════════════ */

const _LONG_PRESS_SLOP_PX = 10;
const _LONG_PRESS_PAGE_GUARD_MS = 400;
// Options object, not `true`: Node's EventTarget ignores a boolean on removeEventListener.
const _LONG_PRESS_CAPTURE = { capture: true };

function _swallowClick(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
}

// One-shot page click swallower, gone on the next pointerdown or after the guard delay.
function _guardPageClick(page) {
  if (!page) return;
  const disarm = () => {
    clearTimeout(timer);
    page.removeEventListener('click', swallow, _LONG_PRESS_CAPTURE);
    page.removeEventListener('pointerdown', disarm, _LONG_PRESS_CAPTURE);
  };
  const swallow = e => { disarm(); _swallowClick(e); };
  const timer = setTimeout(disarm, _LONG_PRESS_PAGE_GUARD_MS);
  page.addEventListener('click', swallow, _LONG_PRESS_CAPTURE);
  page.addEventListener('pointerdown', disarm, _LONG_PRESS_CAPTURE);
}

function onLongPress(el, ms, onLong, page = typeof document !== 'undefined' ? document : null) {
  let timer = null;
  let origin = null;
  let fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const moved = e => Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > _LONG_PRESS_SLOP_PX;
  const fire = () => { timer = null; fired = true; _guardPageClick(page); onLong(); };

  el.addEventListener('pointerdown', e => {
    cancel();
    fired = false;
    origin = { x: e.clientX, y: e.clientY };
    timer = setTimeout(fire, ms);
  });
  el.addEventListener('pointermove', e => { if (timer && moved(e)) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => el.addEventListener(type, cancel));
  el.addEventListener('click', e => {
    if (!fired) return;
    fired = false;
    _swallowClick(e);
  }, _LONG_PRESS_CAPTURE);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { onLongPress };
}
if (typeof window !== 'undefined') {
  window.onLongPress = onLongPress;
}
