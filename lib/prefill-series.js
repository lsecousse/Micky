/* ═══════════════════════════════════════════════════════
   PREFILL SERIES — initialise les valeurs d'une série
   live à partir de la dernière exécution (prevSeries)
   uniquement quand la valeur du template programme est 0.
   Le poids volontairement renseigné (ex. deload) est respecté.
═══════════════════════════════════════════════════════ */

function _isEmpty(v) {
  return v == null || v === 0;
}

function prefillSeriesFromPrev(exercises) {
  for (const ex of (exercises || [])) {
    const prevSeries = ex.prevSeries;
    if (!prevSeries) continue;
    const activities = ex.activities || [];
    const series     = ex.series     || [];

    for (let i = 0; i < series.length; i++) {
      const prevValues = prevSeries[i]?.values;
      if (!prevValues) continue;
      const values = series[i].values || [];

      for (let j = 0; j < values.length; j++) {
        const act  = activities[j];
        const cur  = values[j];
        const prev = prevValues[j];
        if (!act || !cur || !prev) continue;

        if (act.type === 'weight') {
          if (_isEmpty(cur.reps)   && !_isEmpty(prev.reps))   cur.reps   = prev.reps;
          if (_isEmpty(cur.weight) && !_isEmpty(prev.weight)) cur.weight = prev.weight;
        } else if (act.type === 'countdown') {
          if (_isEmpty(cur.duration) && !_isEmpty(prev.duration)) cur.duration = prev.duration;
        }
        // stopwatch : pas de prefill
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { prefillSeriesFromPrev };
}
if (typeof window !== 'undefined') {
  window.prefillSeriesFromPrev = prefillSeriesFromPrev;
}
