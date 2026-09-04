/* ═══════════════════════════════════════════════════════
   DURATION ESTIMATE — calcule la durée totale estimée
   d'un programme à partir de ses exercices.

   Priorité 1 : moyenne historique par exo (avgMap)
   Priorité 2 : 45s par série pour weight/stopwatch + rest
   Countdown  : durée planifiée de chaque série + rest
                (lib/planned-series.js, fallback legacy act.duration)
═══════════════════════════════════════════════════════ */

const DEFAULT_SET_SECONDS = 45;

// In the browser `plannedSeries` is a global (lib/planned-series.js is
// loaded first); under Node/vitest we require it.
function _plannedSeriesOf(ex) {
  const fn = typeof plannedSeries === 'function'
    ? plannedSeries
    : require('./planned-series.js').plannedSeries;
  return fn(ex);
}

function _exerciseDuration(ex, avgMap) {
  const normName = ex.normalized_name;
  if (normName && avgMap.has(normName)) {
    return Math.round(avgMap.get(normName));
  }

  const activities = ex.activities || [];
  const series     = _plannedSeriesOf(ex);
  let total = 0;
  activities.forEach((act, j) => {
    const rest = act.rest ?? 0;
    for (const s of series) {
      const work = act.type === 'countdown'
        ? (s.values[j]?.duration ?? 0)
        : DEFAULT_SET_SECONDS;
      total += work + rest;
    }
  });
  return total;
}

function computeEstimatedDuration(programme, avgMap) {
  const exos = (programme && programme.exercises) || [];
  let total = 0;
  for (const ex of exos) {
    total += _exerciseDuration(ex, avgMap || new Map());
  }
  return total;
}

// Exports : window global pour le browser + module.exports pour Node/vitest.
// Pas de `export` ESM ici parce que les <script> classiques ne supportent pas
// les directives ESM (syntax error sans type="module").
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeEstimatedDuration };
}
if (typeof window !== 'undefined') {
  window.computeEstimatedDuration = computeEstimatedDuration;
}
