/* ═══════════════════════════════════════════════════════
   LIVE SUPERSET — data wiring between a programme and a
   live session: group copy at start, programme index
   lookup, timing maps reordering, duration guard.
═══════════════════════════════════════════════════════ */

// Browser globals when defined, else require() under Node/vitest.
function _liveNormalize(name) {
  return typeof normalizeExerciseName === 'function'
    ? normalizeExerciseName(name)
    : require('./exercise-name.js').normalizeExerciseName(name);
}

function _liveBlocks(exercises) {
  return typeof exerciseBlocks === 'function'
    ? exerciseBlocks(exercises)
    : require('./supersets.js').exerciseBlocks(exercises);
}

function _liveEmptySeries(activities) {
  return {
    activityStates: {},
    values: activities.map(act =>
      act.type === 'weight'
        ? { reps: act.reps || 0, weight: act.weight || 0 }
        : { duration: act.duration || 0 }
    ),
  };
}

function _liveSeriesCount(ex, migrated) {
  if (ex.group) return ex.group.rounds;
  return ex.sets ?? migrated.series.length ?? (ex.count ?? 3);
}

// Live fonte exercise from a programme exercise; `migrated` is
// migrateExercise(ex) (injected: it lives in exercise-editor.js).
function liveFonteExercise(ex, migrated) {
  const count = _liveSeriesCount(ex, migrated);
  return {
    name:       ex.name,
    comment:    ex.comment || '',
    activities: migrated.activities,
    prevSeries: null,
    series:     Array.from({ length: count }, () => _liveEmptySeries(migrated.activities)),
    ...(ex.group ? { group: { ...ex.group } } : {}),
  };
}

function _liveOccurrenceRank(exercises, idx) {
  const key = _liveNormalize(exercises[idx].name);
  return exercises.slice(0, idx).filter(e => _liveNormalize(e.name) === key).length;
}

// Index in the programme of the session exercise `exIdx`: same normalized
// name and same occurrence rank; -1 when absent.
function programmeIndexOf(programmeExercises, sessionExercises, exIdx) {
  const key  = _liveNormalize(sessionExercises[exIdx].name);
  const rank = _liveOccurrenceRank(sessionExercises, exIdx);
  const hits = programmeExercises
    .map((e, i) => (_liveNormalize(e.name) === key ? i : -1))
    .filter(i => i >= 0);
  return hits[rank] ?? -1;
}

function _liveReindex(map, order) {
  const result = {};
  order.forEach((oldIdx, newIdx) => {
    if (map && map[oldIdx] !== undefined) result[newIdx] = map[oldIdx];
  });
  return result;
}

// `order[newIdx] = oldIdx`.
function reorderLiveTiming(maps, order) {
  return {
    exoStartedAt:   _liveReindex(maps.exoStartedAt, order),
    exoDurations:   _liveReindex(maps.exoDurations, order),
    serieStartedAt: _liveReindex(maps.serieStartedAt, order),
    serieDurations: _liveReindex(maps.serieDurations, order),
  };
}

// A member of a real group has no duration of its own.
function liveExerciseDurationAllowed(exercises, exIdx) {
  const block = _liveBlocks(exercises).find(b => b.indices.includes(exIdx));
  return !block || block.kind !== 'group';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { liveFonteExercise, programmeIndexOf, reorderLiveTiming, liveExerciseDurationAllowed };
}
if (typeof window !== 'undefined') {
  window.liveFonteExercise = liveFonteExercise;
  window.programmeIndexOf = programmeIndexOf;
  window.reorderLiveTiming = reorderLiveTiming;
  window.liveExerciseDurationAllowed = liveExerciseDurationAllowed;
}
