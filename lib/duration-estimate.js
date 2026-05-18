/* ═══════════════════════════════════════════════════════
   DURATION ESTIMATE — calcule la durée totale estimée
   d'un programme à partir de ses exercices.

   Priorité 1 : moyenne historique par exo (avgMap)
   Priorité 2 : 45s par série pour weight/stopwatch + rest
   Countdown  : act.duration + rest (toujours précis)
═══════════════════════════════════════════════════════ */

const DEFAULT_SET_SECONDS = 45;

function _exerciseDuration(ex, avgMap) {
  const sets       = ex.sets || 1;
  const activities = ex.activities || [];
  const normName   = ex.normalized_name;

  if (normName && avgMap.has(normName)) {
    return Math.round(avgMap.get(normName));
  }

  let total = 0;
  for (const act of activities) {
    const rest = act.rest ?? 0;
    if (act.type === 'countdown') {
      total += sets * ((act.duration ?? 0) + rest);
    } else {
      total += sets * (DEFAULT_SET_SECONDS + rest);
    }
  }
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
