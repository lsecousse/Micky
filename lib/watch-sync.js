/* ═══════════════════════════════════════════════════════
   WATCH SYNC — guards for the live-session polling

   - createSingleFlight : never runs two polls at the same time.
   - createLocalWriteTracker : a remote read is trusted only if it was
     requested after every local push settled successfully. Otherwise
     the DB may still hold values older than the phone (edit in flight,
     rest skipped with « Passer »…) and must not overwrite them.
   Chargé dans index.html via <script>.
═══════════════════════════════════════════════════════ */

function createSingleFlight(fn) {
  let running = null;
  return () => {
    if (!running) running = new Promise(resolve => resolve(fn())).finally(() => { running = null; });
    return running;
  };
}

function createLocalWriteTracker(now) {
  let inFlight = 0;
  let settledAt = -Infinity;
  let lastFailed = false;

  const settle = failed => {
    inFlight--;
    settledAt = now();
    lastFailed = failed;
  };

  return {
    track(promise) {
      inFlight++;
      return promise.then(
        value => { settle(false); return value; },
        error => { settle(true); throw error; },
      );
    },
    isRemoteFresh(requestedAt) {
      return inFlight === 0 && !lastFailed && requestedAt > settledAt;
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createSingleFlight, createLocalWriteTracker };
}
if (typeof window !== 'undefined') {
  window.createSingleFlight = createSingleFlight;
  window.createLocalWriteTracker = createLocalWriteTracker;
}
