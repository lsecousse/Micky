/* ═══════════════════════════════════════════════════════
   SUPERSET FLOW — order of the steps of a live session
   block (single exercise or super set) and the pause
   between two steps.

   A step is { exIdx, sIdx, actIdx }. A group is walked
   round by round, member after member: A1 B1 A2 B2 …
═══════════════════════════════════════════════════════ */

// In the browser lib/supersets.js is loaded first and exposes globals;
// under Node/vitest we require it.
function _flowSupersets() {
  return typeof exerciseBlocks === 'function'
    ? { exerciseBlocks, isGroupSize }
    : require('./supersets.js');
}

function _flowIsCardio(ex) {
  return ex.type === 'cardio';
}

function _flowAnyDone(series) {
  return Object.values(series.activityStates || {}).includes('done');
}

function isExerciseStarted(ex) {
  if (_flowIsCardio(ex)) return (ex.state || 'pending') !== 'pending';
  return (ex.series || []).some(_flowAnyDone);
}

function _flowIsGroupable(ex) {
  return !_flowIsCardio(ex) && !isExerciseStarted(ex);
}

// Fonte exercises not started and not in a real group (an isolated member
// reads as a single exercise).
function groupableLiveIndices(exercises) {
  return _flowSupersets().exerciseBlocks(exercises)
    .filter(b => b.kind === 'single' && _flowIsGroupable(exercises[b.indices[0]]))
    .map(b => b.indices[0]);
}

function canGroupLive(exercises, indices) {
  const groupable = groupableLiveIndices(exercises);
  const distinct  = new Set(indices).size === indices.length;
  return _flowSupersets().isGroupSize(indices.length) && distinct && indices.every(i => groupable.includes(i));
}

function _flowBlockOf(exercises, exIdx) {
  return _flowSupersets().exerciseBlocks(exercises).find(b => b.indices.includes(exIdx));
}

// Rounds walked: the longest member (tolerates inconsistent members).
// lib/duration-estimate.js estimates a plan instead and uses group.rounds.
function _flowRoundCount(exercises, indices) {
  return Math.max(0, ...indices.map(i => exercises[i].series.length));
}

// Steps of series `sIdx` of an exercise; none when that series is missing.
function _flowSeriesSteps(exercises, exIdx, sIdx) {
  const ex = exercises[exIdx];
  if (!ex.series[sIdx]) return [];
  return ex.activities.map((_, actIdx) => ({ exIdx, sIdx, actIdx }));
}

// Every step of a block in walking order: round by round, member by member.
function _flowSteps(exercises, indices) {
  const steps = [];
  for (let r = 0; r < _flowRoundCount(exercises, indices); r++) {
    indices.forEach(i => steps.push(..._flowSeriesSteps(exercises, i, r)));
  }
  return steps;
}

function _flowIsDone(exercises, { exIdx, sIdx, actIdx }) {
  return (exercises[exIdx].series[sIdx].activityStates || {})[actIdx] === 'done';
}

function nextUndoneInBlock(exercises, exIdx) {
  if (_flowIsCardio(exercises[exIdx])) return null;
  const { indices } = _flowBlockOf(exercises, exIdx);
  return _flowSteps(exercises, indices).find(st => !_flowIsDone(exercises, st)) || null;
}

function _flowRest(exercises, { exIdx, actIdx }) {
  return { kind: 'rest', seconds: exercises[exIdx].activities[actIdx].rest || 0 };
}

// Same station (single exercise, or same member going back) → activity rest;
// later round → round rest; another member of this or an earlier round →
// station change, always confirmed.
function _flowPause(exercises, done, next) {
  const block = _flowBlockOf(exercises, done.exIdx);
  if (block.kind !== 'group' || (next.exIdx === done.exIdx && next.sIdx === done.sIdx)) {
    return _flowRest(exercises, done);
  }
  if (next.sIdx > done.sIdx) return { kind: 'roundRest', seconds: block.roundRest };
  if (next.exIdx === done.exIdx) return _flowRest(exercises, done);
  return { kind: 'transition', seconds: block.transition, confirm: true };
}

// Called once the step `done` has been marked done.
function nextLiveStep(exercises, done) {
  const next = nextUndoneInBlock(exercises, done.exIdx);
  return { next, pause: next && _flowPause(exercises, done, next) };
}

function _flowRoundDone(exercises, indices, round) {
  return indices.every(i => _flowSeriesSteps(exercises, i, round).every(st => _flowIsDone(exercises, st)));
}

// Null outside a real group (single or cardio exercise).
function supersetProgress(exercises, exIdx) {
  const { kind, indices } = _flowBlockOf(exercises, exIdx);
  if (kind !== 'group') return null;
  const rounds      = _flowRoundCount(exercises, indices);
  const roundsDone  = Array.from({ length: rounds }, (_, r) => r)
    .filter(r => _flowRoundDone(exercises, indices, r)).length;
  return { roundsDone, rounds };
}

const _SUPERSET_FLOW_API = {
  isExerciseStarted, groupableLiveIndices, canGroupLive, nextUndoneInBlock, nextLiveStep, supersetProgress,
};

// Exports: window globals for the browser + module.exports for Node/vitest.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _SUPERSET_FLOW_API;
}
if (typeof window !== 'undefined') {
  Object.assign(window, _SUPERSET_FLOW_API);
}
