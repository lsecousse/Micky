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
  const defaultActs = (catalogEntry.default_activities && catalogEntry.default_activities.length)
    ? catalogEntry.default_activities
    : FALLBACK_ACTIVITIES;

  const prevActs = clientPrev?.activities;
  const activities = defaultActs.map((act, j) => {
    const p = prevActs?.[j];
    if (!p) return act;
    const merged = { ...act };
    if (p.label != null) merged.label = p.label;
    if (p.name  != null) merged.name  = p.name;
    if (p.rest  != null) merged.rest  = p.rest;
    if (act.type === 'countdown' && act.duration == null && p.duration != null) {
      merged.duration = p.duration;
    }
    return merged;
  });

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

// Migration legacy → moderne : si un exercice n'a pas de `series`, on en génère
// à partir des valeurs stockées au niveau activité (reps/weight/duration).
// Avant cette migration, les vieux programmes affichaient 0 partout dans l'éditeur
// parce que makeExerciseCard lit seed.series[0].values[0] qui n'existait pas.
function ensureSeries(ex) {
  if (ex.series && ex.series.length > 0) return ex;
  const sets = ex.sets || 4;
  const series = Array.from({ length: sets }, () => ({
    activityStates: {},
    values: (ex.activities || []).map(act => {
      if (act.type === 'weight')    return { reps: act.reps || 0, weight: act.weight || 0 };
      if (act.type === 'countdown') return { duration: act.duration || 0 };
      return {};
    }),
  }));
  return { ...ex, series };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildProgrammeExerciseFromCatalog, ensureSeries };
}
if (typeof window !== 'undefined') {
  window.buildProgrammeExerciseFromCatalog = buildProgrammeExerciseFromCatalog;
  window.ensureSeries                       = ensureSeries;
}
