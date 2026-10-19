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

const _LONG_PRESS_RELEASES = ['pointerup', 'pointercancel'];

// One-shot page click swallower, armed while the finger is down; gone on the next
// pointerdown, on the first swallowed click, or 400 ms after the release.
function _guardPageClick(page) {
  if (!page) return;
  let timer = null;
  const expire = () => { clearTimeout(timer); timer = setTimeout(disarm, _LONG_PRESS_PAGE_GUARD_MS); };
  const swallow = e => { disarm(); _swallowClick(e); };
  const listeners = [['click', swallow], ['pointerdown', disarm], ..._LONG_PRESS_RELEASES.map(t => [t, expire])];
  function disarm() {
    clearTimeout(timer);
    listeners.forEach(([type, fn]) => page.removeEventListener(type, fn, _LONG_PRESS_CAPTURE));
  }
  listeners.forEach(([type, fn]) => page.addEventListener(type, fn, _LONG_PRESS_CAPTURE));
}

function onLongPress(el, ms, onLong, page = typeof document !== 'undefined' ? document : null) {
  let timer = null;
  let origin = null;
  let fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const moved = e => Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > _LONG_PRESS_SLOP_PX;
  // A re-render may detach the element while the finger is down: its release never comes.
  const fire = () => {
    timer = null;
    if (!el.isConnected) return;
    fired = true;
    _guardPageClick(page);
    onLong();
  };

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
