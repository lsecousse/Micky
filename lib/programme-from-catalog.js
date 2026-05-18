/* ═══════════════════════════════════════════════════════
   BUILD PROGRAMME EXERCISE — combine catalog defaults +
   prev execution du client pour produire l'exo
   embarqué dans programmes.exercises (snapshot jsonb).
═══════════════════════════════════════════════════════ */

const DEFAULT_SETS = 4;
const FALLBACK_ACTIVITIES = [{ type: 'weight' }];

function _blankValueFor(act) {
  if (act.type === 'weight') return { reps: 0, weight: 0 };
  if (act.type === 'countdown') return { duration: act.duration ?? 0 };
  if (act.type === 'stopwatch') return {};
  return {};
}

function buildProgrammeExerciseFromCatalog(catalogEntry, clientPrev) {
  const activities = (catalogEntry.default_activities && catalogEntry.default_activities.length)
    ? catalogEntry.default_activities
    : FALLBACK_ACTIVITIES;

  const prevSeries = clientPrev?.execution?.series || [];

  const series = Array.from({ length: DEFAULT_SETS }, (_, i) => {
    const prev = prevSeries[i];
    const values = activities.map((act, j) => {
      const prevVal = prev?.values?.[j];
      const blank   = _blankValueFor(act);
      if (!prevVal) return blank;
      if (act.type === 'weight') {
        return {
          reps:   prevVal.reps   ?? blank.reps,
          weight: prevVal.weight ?? blank.weight,
        };
      }
      if (act.type === 'countdown') {
        return { duration: prevVal.duration ?? blank.duration };
      }
      return blank;
    });
    return { activityStates: {}, values };
  });

  return {
    name:            catalogEntry.name,
    normalized_name: catalogEntry.normalized_name,
    category:        catalogEntry.category,
    comment:         catalogEntry.notes || '',
    activities,
    sets:            DEFAULT_SETS,
    series,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildProgrammeExerciseFromCatalog };
}
if (typeof window !== 'undefined') {
  window.buildProgrammeExerciseFromCatalog = buildProgrammeExerciseFromCatalog;
}
