import { describe, it, expect, vi } from 'vitest';
import { createSingleFlight, createLocalWriteTracker } from '../lib/watch-sync.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createSingleFlightShould', () => {
  it('notStartASecondCallWhileTheFirstIsInFlight', () => {
    // Arrange
    const pending = deferred();
    const fn = vi.fn(() => pending.promise);
    const guarded = createSingleFlight(fn);

    // Act
    guarded();
    guarded();

    // Assert
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allowANewCallOnceThePreviousOneHasSettled', async () => {
    // Arrange
    const fn = vi.fn(() => Promise.resolve());
    const guarded = createSingleFlight(fn);
    await guarded();

    // Act
    await guarded();

    // Assert
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('allowANewCallAfterThePreviousOneRejected', async () => {
    // Arrange
    const fn = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue();
    const guarded = createSingleFlight(fn);
    await guarded().catch(() => {});

    // Act
    await guarded();

    // Assert
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('createLocalWriteTrackerShould', () => {
  it('considerARemoteReadFreshWhenNoLocalWriteHappened', () => {
    // Arrange
    const tracker = createLocalWriteTracker(() => 1000);

    // Act
    const fresh = tracker.isRemoteFresh(500);

    // Assert
    expect(fresh).toBe(true);
  });

  it('considerARemoteReadStaleWhileALocalWriteIsInFlight', () => {
    // Arrange
    const tracker = createLocalWriteTracker(() => 1000);
    tracker.track(deferred().promise);

    // Act
    const fresh = tracker.isRemoteFresh(2000);

    // Assert
    expect(fresh).toBe(false);
  });

  it('considerARemoteReadStaleWhenRequestedBeforeTheLocalWriteSettled', async () => {
    // Arrange
    let clock = 1000;
    const tracker = createLocalWriteTracker(() => clock);
    const write = deferred();
    const tracked = tracker.track(write.promise);
    clock = 1500;
    write.resolve();
    await tracked;

    // Act
    const fresh = tracker.isRemoteFresh(1200);

    // Assert
    expect(fresh).toBe(false);
  });

  it('considerARemoteReadFreshWhenRequestedAfterTheLocalWriteSettled', async () => {
    // Arrange
    let clock = 1000;
    const tracker = createLocalWriteTracker(() => clock);
    const write = deferred();
    const tracked = tracker.track(write.promise);
    clock = 1500;
    write.resolve();
    await tracked;

    // Act
    const fresh = tracker.isRemoteFresh(1600);

    // Assert
    expect(fresh).toBe(true);
  });

  it('considerARemoteReadStaleAfterTheLastLocalWriteFailed', async () => {
    // Arrange
    let clock = 1000;
    const tracker = createLocalWriteTracker(() => clock);
    const write = deferred();
    const tracked = tracker.track(write.promise);
    clock = 1500;
    write.reject(new Error('offline'));
    await tracked.catch(() => {});

    // Act
    const fresh = tracker.isRemoteFresh(1600);

    // Assert
    expect(fresh).toBe(false);
  });

  it('propagateTheRejectionOfTheTrackedWrite', async () => {
    // Arrange
    const tracker = createLocalWriteTracker(() => 1000);

    // Act
    const tracked = tracker.track(Promise.reject(new Error('offline')));

    // Assert
    await expect(tracked).rejects.toThrow('offline');
  });
});
