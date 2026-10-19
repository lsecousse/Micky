import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onLongPress } from '../lib/long-press.js';

function pointer(type, clientX = 0, clientY = 0) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { clientX, clientY });
  return event;
}

function pressed(ms = 500) {
  const el = new EventTarget();
  const onLong = vi.fn();
  onLongPress(el, ms, onLong);
  el.dispatchEvent(pointer('pointerdown', 100, 100));
  return { el, onLong };
}

describe('onLongPressShould', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('call back once the press lasted the given time', () => {
    const { onLong } = pressed();

    vi.advanceTimersByTime(500);

    expect(onLong).toHaveBeenCalledTimes(1);
  });

  it('not call back before the given time', () => {
    const { onLong } = pressed();

    vi.advanceTimersByTime(499);

    expect(onLong).not.toHaveBeenCalled();
  });

  it.each(['pointerup', 'pointerleave', 'pointercancel'])('cancel the press on %s', (type) => {
    const { el, onLong } = pressed();

    el.dispatchEvent(pointer(type, 100, 100));
    vi.advanceTimersByTime(500);

    expect(onLong).not.toHaveBeenCalled();
  });

  it('cancel the press when the pointer moves more than 10 px', () => {
    const { el, onLong } = pressed();

    el.dispatchEvent(pointer('pointermove', 100, 111));
    vi.advanceTimersByTime(500);

    expect(onLong).not.toHaveBeenCalled();
  });

  it('keep the press when the pointer moves 10 px or less', () => {
    const { el, onLong } = pressed();

    el.dispatchEvent(pointer('pointermove', 106, 108));
    vi.advanceTimersByTime(500);

    expect(onLong).toHaveBeenCalledTimes(1);
  });

  it('swallow the click that follows a long press', () => {
    const { el } = pressed();
    const onClick = vi.fn();
    el.addEventListener('click', onClick);
    vi.advanceTimersByTime(500);
    const click = pointer('click');

    el.dispatchEvent(click);

    expect([onClick.mock.calls.length, click.defaultPrevented]).toEqual([0, true]);
  });

  it('let the click of a short press through', () => {
    const { el } = pressed();
    const onClick = vi.fn();
    el.addEventListener('click', onClick);
    el.dispatchEvent(pointer('pointerup', 100, 100));

    el.dispatchEvent(pointer('click'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('swallow only the first click after a long press', () => {
    const { el } = pressed();
    const onClick = vi.fn();
    el.addEventListener('click', onClick);
    vi.advanceTimersByTime(500);
    el.dispatchEvent(pointer('click'));

    el.dispatchEvent(pointer('click'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('prevent the context menu', () => {
    const el = new EventTarget();
    onLongPress(el, 500, () => {});
    const menu = pointer('contextmenu');

    el.dispatchEvent(menu);

    expect(menu.defaultPrevented).toBe(true);
  });

  describe('at page level', () => {
    // Node's EventTarget has no capture phase: assert on the event, not on page listeners.
    function heldOnPage() {
      const el = new EventTarget();
      const page = new EventTarget();
      onLongPress(el, 500, () => {}, page);
      el.dispatchEvent(pointer('pointerdown', 100, 100));
      return { page };
    }

    function pageClick(page) {
      const click = pointer('click');
      page.dispatchEvent(click);
      return [click.defaultPrevented, click.cancelBubble];
    }

    it('swallow a click landing elsewhere on the page right after a long press', () => {
      const { page } = heldOnPage();
      vi.advanceTimersByTime(500);

      const result = pageClick(page);

      expect(result).toEqual([true, true]);
    });

    it('let page clicks through when no long press fired', () => {
      const { page } = heldOnPage();
      vi.advanceTimersByTime(499);

      const result = pageClick(page);

      expect(result).toEqual([false, false]);
    });

    it('swallow only one page click', () => {
      const { page } = heldOnPage();
      vi.advanceTimersByTime(500);
      pageClick(page);

      const result = pageClick(page);

      expect(result).toEqual([false, false]);
    });

    it('swallow the release click of a hold lasting well after the long press', () => {
      const { page } = heldOnPage();
      vi.advanceTimersByTime(500 + 1000);
      page.dispatchEvent(pointer('pointerup', 100, 100));

      const result = pageClick(page);

      expect(result).toEqual([true, true]);
    });

    it('stop swallowing page clicks 400 ms after the release', () => {
      const { page } = heldOnPage();
      vi.advanceTimersByTime(500);
      page.dispatchEvent(pointer('pointerup', 100, 100));
      vi.advanceTimersByTime(400);

      const result = pageClick(page);

      expect(result).toEqual([false, false]);
    });

    it('keep swallowing up to 400 ms after a pointercancel ending a long hold', () => {
      const { page } = heldOnPage();
      vi.advanceTimersByTime(500 + 1000);
      page.dispatchEvent(pointer('pointercancel', 100, 100));
      vi.advanceTimersByTime(399);

      const result = pageClick(page);

      expect(result).toEqual([true, true]);
    });

    it('stop swallowing page clicks 400 ms after a pointercancel', () => {
      const { page } = heldOnPage();
      vi.advanceTimersByTime(500);
      page.dispatchEvent(pointer('pointercancel', 100, 100));
      vi.advanceTimersByTime(400);

      const result = pageClick(page);

      expect(result).toEqual([false, false]);
    });

    it('stop swallowing page clicks on the next pointerdown', () => {
      const { page } = heldOnPage();
      vi.advanceTimersByTime(500);
      page.dispatchEvent(pointer('pointerdown', 10, 10));

      const result = pageClick(page);

      expect(result).toEqual([false, false]);
    });
  });
});
