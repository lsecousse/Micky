/* ═══════════════════════════════════════════════════════
   RECOMPOSE SESSION — rebuild flat session object
   à partir des 2 tables sessions + session_exercises.
═══════════════════════════════════════════════════════ */

function recomposeExercise(row, category) {
  const common = {
    name:       row.name,
    comment:    row.comment ?? '',
  };
  const exec = row.execution || {};

  if (category === 'cardio' || exec.type === 'cardio') {
    return {
      ...common,
      type:     'cardio',
      duration: exec.duration ?? 0,
      power:    exec.power    ?? 0,
      done:     exec.done     ?? null,
      state:    exec.state    ?? 'pending',
      prev:     null,
    };
  }

  return {
    ...common,
    activities: row.activities ?? [],
    series:     exec.series,
    prevSeries: null,
  };
}

function recomposeSession(sessionRow, exerciseRows) {
  const exercises = (exerciseRows || [])
    .slice()
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    .map(r => recomposeExercise(r, sessionRow.category));

  return {
    id:            sessionRow.id,
    programmeName: sessionRow.programme_name,
    programmeId:   sessionRow.programme_id ?? null,
    category:      sessionRow.category ?? 'fonte',
    date:          sessionRow.date,
    startedAt:     sessionRow.started_at,
    duration:      sessionRow.duration,
    sync:          sessionRow.sync ?? null,
    feedbackIa:    sessionRow.feedback_ia ?? null,
    exercises,
  };
}

// Export ESM pour vitest + globals pour <script> dans le navigateur
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { recomposeSession, recomposeExercise };
}
if (typeof window !== 'undefined') {
  window.recomposeSession  = recomposeSession;
  window.recomposeExercise = recomposeExercise;
}
export { recomposeSession, recomposeExercise };
