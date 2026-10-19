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
  if (pause.kind === 'roundRest' && pause.seconds > 0) return `puis repos de tour ${_liveClock(pause.seconds)}`;
  if (pause.kind !== 'transition' && pause.kind !== 'roundRest') return null;
  const letter = _liveLetter(block.indices.indexOf(next.exIdx));
  const round  = pause.kind === 'roundRest' ? `tour ${next.sIdx + 1} · ` : '';
  return `puis ${round}${letter} · ${exercises[next.exIdx].name}`;
}

/* ── List by blocks and « Grouper » sheet ─────────────── */

function _liveSupersets() {
  return typeof groupExercises === 'function'
    ? { groupExercises, supersetOrder, defaultSupersetRounds, ungroupSuperset }
    : require('./supersets.js');
}

function _liveProgress(exercises, exIdx) {
  return typeof supersetProgress === 'function'
    ? supersetProgress(exercises, exIdx)
    : require('./superset-flow.js').supersetProgress(exercises, exIdx);
}

const _LIVE_MAX_PICKED = 4;
const _LIVE_EMPTY_DRAFT_ROUNDS = 4;

function _liveExerciseDone(ex) {
  return ex.series.every(s => ex.activities.every((_, a) => (s.activityStates || {})[a] === 'done'));
}

function _liveExerciseStarted(ex) {
  return ex.series.some(s => ex.activities.some((_, a) => (s.activityStates || {})[a]));
}

function _liveListBlock(exercises, block) {
  const members = block.indices.map(i => exercises[i]);
  return {
    ...block,
    done:    members.every(_liveExerciseDone),
    started: members.some(_liveExerciseStarted),
    ...(block.kind === 'group' ? { progress: _liveProgress(exercises, block.indices[0]) } : {}),
  };
}

// List entries: one per block, finished blocks last (stable order otherwise).
function liveListBlocks(exercises) {
  return _liveBlocks(exercises)
    .map(block => _liveListBlock(exercises, block))
    .sort((a, b) => Number(a.done) - Number(b.done));
}

// Adds at the end (at most 4) or removes, the next ones moving up.
function togglePickedExercise(picked, exIdx) {
  if (picked.includes(exIdx)) return picked.filter(i => i !== exIdx);
  return picked.length < _LIVE_MAX_PICKED ? [...picked, exIdx] : [...picked];
}

// Rounds shown in the sheet: the user's choice, else the longest picked exercise.
function groupDraftRounds(exercises, picked, override) {
  if (override != null) return override;
  if (!picked.length) return _LIVE_EMPTY_DRAFT_ROUNDS;
  return _liveSupersets().defaultSupersetRounds(picked.map(i => exercises[i]));
}

function _liveWithStates(ex) {
  return { ...ex, series: ex.series.map(s => (s.activityStates ? s : { ...s, activityStates: {} })) };
}

// New live exercises and timing maps once `picked` (session indices, in order) are grouped.
function applyLiveGrouping(session, picked, settings) {
  const { groupExercises, supersetOrder } = _liveSupersets();
  const exercises = groupExercises(session.exercises, picked, settings).map(_liveWithStates);
  const timing    = reorderLiveTiming(session, supersetOrder(session.exercises.length, picked));
  return { exercises, timing };
}

function _liveGroupable(exercises) {
  return typeof groupableLiveIndices === 'function'
    ? groupableLiveIndices(exercises)
    : require('./superset-flow.js').groupableLiveIndices(exercises);
}

// Grouping reorders indices: never while a countdown holds a step of the old order.
function canOpenLiveGrouping(exercises, countdownRunning) {
  return !countdownRunning && _liveGroupable(exercises).length >= 2;
}

// Same grouping on the programme, null when an exercise is missing or the programme refuses.
function programmeGrouping(programmeExercises, sessionExercises, picked, settings) {
  const indices = picked.map(i => programmeIndexOf(programmeExercises, sessionExercises, i));
  if (indices.includes(-1)) return null;
  try {
    return _liveSupersets().groupExercises(programmeExercises, indices, settings);
  } catch (_) {
    return null;
  }
}

/* ── « Dégrouper » dialog ─────────────────────────────── */

// Programme without the group carrying the first member, null when that member is missing or not grouped there.
function programmeUngrouping(programmeExercises, sessionExercises, memberIndices) {
  const idx = programmeIndexOf(programmeExercises, sessionExercises, memberIndices[0]);
  const group = idx >= 0 ? programmeExercises[idx].group : null;
  return group ? _liveSupersets().ungroupSuperset(programmeExercises, group.id) : null;
}

// Title and members line of the « Dégrouper » dialog.
function ungroupDialogText(exercises, memberIndices) {
  const kind = supersetKindLabel(memberIndices.length).toLowerCase();
  return {
    title:   `Dégrouper le ${kind} ?`,
    members: memberIndices.map(i => exercises[i].name).join(' + '),
  };
}

const _LIVE_SUPERSET_API = {
  liveFonteExercise, programmeIndexOf, reorderLiveTiming, liveExerciseDurationAllowed,
  supersetKindLabel, supersetSettingText, liveSupersetBlock, supersetRoundLog, livePauseView, supersetNextHint,
  liveListBlocks, togglePickedExercise, groupDraftRounds, applyLiveGrouping, programmeGrouping,
  canOpenLiveGrouping, programmeUngrouping, ungroupDialogText,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _LIVE_SUPERSET_API;
}
if (typeof window !== 'undefined') {
  Object.assign(window, _LIVE_SUPERSET_API);
}
