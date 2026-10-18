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

function _liveNextStep(exercises, done) {
  return typeof nextLiveStep === 'function'
    ? nextLiveStep(exercises, done)
    : require('./superset-flow.js').nextLiveStep(exercises, done);
}

function _liveLetter(position) {
  return typeof supersetMemberLetter === 'function'
    ? supersetMemberLetter(position)
    : require('./supersets.js').supersetMemberLetter(position);
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

/* ── Walking a group in a live session ───────────────── */

const _LIVE_KIND_LABELS = { 2: 'Super set', 3: 'Tri-set', 4: 'Circuit' };

function supersetKindLabel(size) {
  return _LIVE_KIND_LABELS[size] || 'Super set';
}

// Group setting duration: "15 s", "1 min 30", "2 min".
function supersetSettingText(secs) {
  if (secs < 60) return `${secs} s`;
  const rest = secs % 60;
  return `${Math.floor(secs / 60)} min${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`;
}

function _liveClock(secs) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function _liveKg(value) {
  return String(value).replace('.', ',');
}

// Block of a member of a real group, null otherwise.
function liveSupersetBlock(exercises, exIdx) {
  const block = _liveBlocks(exercises).find(b => b.indices.includes(exIdx));
  return block && block.kind === 'group' ? block : null;
}

function _liveRoundCount(exercises, indices) {
  return Math.max(0, ...indices.map(i => exercises[i].series.length));
}

function _liveIsDone(exercises, exIdx, sIdx, actIdx) {
  const set = exercises[exIdx].series[sIdx];
  return Boolean(set) && (set.activityStates || {})[actIdx] === 'done';
}

function _liveRoundDone(exercises, indices, sIdx) {
  return indices.every(i => exercises[i].activities.every((_, a) => _liveIsDone(exercises, i, sIdx, a)));
}

// Value actually entered, else the planned one.
function _liveValue(ex, sIdx, actIdx) {
  const act = ex.activities[actIdx];
  const v   = (ex.series[sIdx] && ex.series[sIdx].values && ex.series[sIdx].values[actIdx]) || {};
  if (act.type === 'weight') {
    return { weight: v.weight ?? act.weight ?? 0, reps: v.reps ?? act.reps ?? 0, duration: null };
  }
  return { weight: null, reps: null, duration: v.duration ?? act.duration ?? 0 };
}

function _liveValueText(value) {
  return value.duration === null ? `${_liveKg(value.weight)} × ${value.reps}` : _liveClock(value.duration);
}

// "A 60 × 10 · B 50 × 10"; activities of one member joined by " + ".
function _liveRoundText(exercises, indices, sIdx) {
  return indices
    .map((i, pos) => exercises[i].series[sIdx] && `${_liveLetter(pos)} ${exercises[i].activities
      .map((_, a) => _liveValueText(_liveValue(exercises[i], sIdx, a))).join(' + ')}`)
    .filter(Boolean)
    .join(' · ');
}

// Planned pause after an activity of the current round.
function _liveAfter(exercises, indices, pos, actIdx, sIdx) {
  const ex    = exercises[indices[pos]];
  const group = ex.group || {};
  if (actIdx < ex.activities.length - 1) return null;
  if (pos < indices.length - 1) return { kind: 'transition', seconds: group.transition ?? 0 };
  return sIdx < _liveRoundCount(exercises, indices) - 1 ? { kind: 'roundRest', seconds: group.roundRest ?? 0 } : null;
}

function _liveRowState(exercises, focus, exIdx, actIdx) {
  if (focus.exIdx === exIdx && focus.actIdx === actIdx) return 'focus';
  return _liveIsDone(exercises, exIdx, focus.sIdx, actIdx) ? 'done' : 'todo';
}

function _liveCurrentRows(exercises, indices, focus) {
  return indices.flatMap((exIdx, pos) => {
    const ex = exercises[exIdx];
    if (!ex.series[focus.sIdx]) return [];
    return ex.activities.map((_, actIdx) => ({
      exIdx, actIdx, letter: _liveLetter(pos), name: ex.name,
      ..._liveValue(ex, focus.sIdx, actIdx),
      state: _liveRowState(exercises, focus, exIdx, actIdx),
      after: _liveAfter(exercises, indices, pos, actIdx, focus.sIdx),
    }));
  });
}

function _liveRemaining(exercises, indices, round, rounds) {
  if (round >= rounds) return null;
  return { from: round + 1, to: rounds, text: _liveRoundText(exercises, indices, round) };
}

// Logbook model of a group around the step `focus` (rounds are 1-based).
function supersetRoundLog(exercises, indices, focus) {
  const rounds = _liveRoundCount(exercises, indices);
  const round  = focus.sIdx + 1;
  const all    = Array.from({ length: rounds }, (_, r) => r);
  return {
    round, rounds,
    roundsDone: all.filter(r => _liveRoundDone(exercises, indices, r)).length,
    finished:   all.slice(0, focus.sIdx).map(r => ({ round: r + 1, text: _liveRoundText(exercises, indices, r) })),
    current:    _liveCurrentRows(exercises, indices, focus),
    remaining:  _liveRemaining(exercises, indices, round, rounds),
  };
}

// Screen of a pause: `pause` is { kind, seconds, stop? }.
function livePauseView(pause) {
  if (pause.kind !== 'transition') return pause.kind;
  return pause.stop || pause.seconds <= 0 ? 'transitionStop' : 'transitionCountdown';
}

function _liveWithDone(exercises, { exIdx, sIdx, actIdx }) {
  return exercises.map((ex, i) => i !== exIdx ? ex : {
    ...ex,
    series: ex.series.map((set, s) => s !== sIdx ? set : {
      ...set, activityStates: { ...(set.activityStates || {}), [actIdx]: 'done' },
    }),
  });
}

// Announce of the validate button of a group step; null when the usual
// hint applies (single exercise, or a rest on the same station).
function supersetNextHint(exercises, step) {
  const block = liveSupersetBlock(exercises, step.exIdx);
  if (!block) return null;
  const { next, pause } = _liveNextStep(_liveWithDone(exercises, step), step);
  if (!next) return 'puis retour à la liste';
  if (pause.kind === 'roundRest') return `puis repos de tour ${_liveClock(pause.seconds)}`;
  if (pause.kind !== 'transition') return null;
  return `puis ${_liveLetter(block.indices.indexOf(next.exIdx))} · ${exercises[next.exIdx].name}`;
}

const _LIVE_SUPERSET_API = {
  liveFonteExercise, programmeIndexOf, reorderLiveTiming, liveExerciseDurationAllowed,
  supersetKindLabel, supersetSettingText, liveSupersetBlock, supersetRoundLog, livePauseView, supersetNextHint,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _LIVE_SUPERSET_API;
}
if (typeof window !== 'undefined') {
  Object.assign(window, _LIVE_SUPERSET_API);
}
