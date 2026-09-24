/* ═══════════════════════════════════════════════════════
   LIVE RESUME — rebuild a live session from a stored one
   (server row or local snapshot) at startup / from history.
═══════════════════════════════════════════════════════ */

function isCardioExercise(ex, category) {
  return category === 'cardio' || ex.type === 'cardio';
}

function restoreCardioExercise(ex) {
  return {
    name:     ex.name,
    type:     'cardio',
    comment:  ex.comment || '',
    duration: ex.duration || 0,
    power:    ex.power    || 0,
    done:     ex.done || { duration: ex.duration || 0, power: ex.power || 0, km: 0 },
    prev:     null,
    state:    ex.state || 'pending',
  };
}

function restoreFonteExercise(e) {
  return {
    name:       e.name,
    comment:    e.comment || '',
    activities: e.activities,
    series:     e.series.map(s => ({
      state:          s.state || (s.done ? 'done' : 'pending'),
      activityStates: s.activityStates || {},
      values:         s.values,
    })),
  };
}

// `migrate` is injected (migrateExercise lives in exercise-editor.js).
function restoreLiveExercises(exercises, category, migrate) {
  return exercises.map(ex => isCardioExercise(ex, category)
    ? restoreCardioExercise(ex)
    : restoreFonteExercise(migrate(ex)));
}

// Chooses the session to resume and the local snapshot to push again.
// A snapshot finished offline (duration > 0) is pushed, never resumed.
function resolveResumeSession(inProgress, localSnap) {
  if (!localSnap) return { session: inProgress, repush: null };
  const sameSession = inProgress?.id === localSnap.id;
  if (localSnap.duration > 0) return { session: sameSession ? null : inProgress, repush: localSnap };
  if (!inProgress || sameSession) return { session: localSnap, repush: localSnap };
  return { session: inProgress, repush: null };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { restoreLiveExercises, resolveResumeSession };
}
if (typeof window !== 'undefined') {
  window.restoreLiveExercises = restoreLiveExercises;
  window.resolveResumeSession = resolveResumeSession;
}
