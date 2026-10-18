/* ═══════════════════════════════════════════════════════
   DURATION ESTIMATE — calcule la durée totale estimée
   d'un programme à partir de ses exercices.

   Priorité 1 : moyenne historique par exo (avgMap)
   Priorité 2 : 45s par série pour weight/stopwatch + rest
   Countdown  : durée planifiée de chaque série + rest
                (lib/planned-series.js, fallback legacy act.duration)
   Super set  : always planned, round by round (group.rounds):
                activities (rest between activities), transition
                between members, round rest after the last one
                (lib/supersets.js). lib/superset-flow.js walks the
                longest member instead (live, tolerant).
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

// Same pattern for `exerciseBlocks` (lib/supersets.js). A page that does not
// load lib/supersets.js yet reads every exercise as a single block.
function _exerciseBlocksOf(exercises) {
  if (typeof exerciseBlocks === 'function') return exerciseBlocks(exercises);
  if (typeof require === 'function') return require('./supersets.js').exerciseBlocks(exercises);
  return exercises.map((_, i) => ({ kind: 'single', indices: [i] }));
}

function _workSeconds(act, value) {
  return act.type === 'countdown' ? (value?.duration ?? 0) : DEFAULT_SET_SECONDS;
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
    for (const s of series) total += _workSeconds(act, s.values[j]) + rest;
  });
  return total;
}

// One series of a group member: work of every activity, activity rest
// between activities only (the pause after the last one is the group's).
function _memberSeriesDuration(ex, values) {
  const activities = ex.activities || [];
  return activities.reduce((sum, act, j) => {
    const between = j < activities.length - 1 ? (act.rest ?? 0) : 0;
    return sum + _workSeconds(act, values[j]) + between;
  }, 0);
}

// Group: always planned (members' measured durations overlap). Per round,
// transition after each member but the last, round rest after the last.
function _groupDuration(members, block) {
  const pauses = (members.length - 1) * block.transition + block.roundRest;
  const work   = members.reduce((sum, ex) => sum + _memberDuration(ex, block.rounds), 0);
  return work + block.rounds * pauses;
}

function _memberDuration(ex, rounds) {
  return _plannedSeriesOf({ ...ex, sets: rounds })
    .reduce((sum, s) => sum + _memberSeriesDuration(ex, s.values), 0);
}

function _blockDuration(exos, block, avgMap) {
  const members = block.indices.map(i => exos[i]);
  return block.kind === 'group' ? _groupDuration(members, block) : _exerciseDuration(members[0], avgMap);
}

function computeEstimatedDuration(programme, avgMap) {
  const exos = (programme && programme.exercises) || [];
  return _exerciseBlocksOf(exos)
    .reduce((total, block) => total + _blockDuration(exos, block, avgMap || new Map()), 0);
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
