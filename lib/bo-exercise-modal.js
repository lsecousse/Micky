/* ═══════════════════════════════════════════════════════
   BACK-OFFICE EXERCISE MODAL — what the ✎ / catalogue
   modal shows and saves. The card gets the programme
   exercise as `source`, so saving keeps what it does not
   edit (super set group, per-series values, unknown
   fields), same rule as the mobile editor.
═══════════════════════════════════════════════════════ */

// Browser global when defined, else require() under Node/vitest.
function _boNormalizeName(name) {
  return typeof normalizeExerciseName === 'function'
    ? normalizeExerciseName(name)
    : require('./exercise-name.js').normalizeExerciseName(name);
}

// Card fields: the values of the first planned series, plus the exercise as source.
// A super set member card hides its series and rests: the group sets them.
function boModalCardOptions(seed) {
  return {
    name:       seed.name,
    sets:       seed.sets,
    activities: (seed.activities || []).map((a, i) => {
      const v = seed.series?.[0]?.values?.[i] || {};
      return {
        type:     a.type,
        label:    a.label ?? '',
        name:     a.name  ?? '',
        reps:     a.type === 'weight'    ? (v.reps     ?? '') : '',
        weight:   a.type === 'weight'    ? (v.weight   ?? '') : '',
        duration: a.type === 'countdown' ? (v.duration ?? a.duration ?? '') : '',
        rest:     a.rest ?? '',
      };
    }),
    comment:    seed.comment || '',
    source:     seed,
    member:     Boolean(seed.group),
  };
}

// Saved exercise: the card read-back, with its normalized name, filed in the programme category.
function boModalSavedExercise(readBack, category) {
  return { ...readBack, normalized_name: _boNormalizeName(readBack.name), category };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { boModalCardOptions, boModalSavedExercise };
}
if (typeof window !== 'undefined') {
  window.boModalCardOptions   = boModalCardOptions;
  window.boModalSavedExercise = boModalSavedExercise;
}
