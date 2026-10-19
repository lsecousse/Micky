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
});
