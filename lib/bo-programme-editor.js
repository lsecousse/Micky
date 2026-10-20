/* ═══════════════════════════════════════════════════════
   BO PROGRAMME EDITOR — pure logic of the back-office
   programme editor: drag and drop (intent, onto rule,
   drop result) and the one-line summary of an exercise.

   A drag source is { blockPos } (programme block, index in
   exerciseBlocks) or { exercise } (new one from the catalog).
   A drop target is { blockPos, intent } with intent
   'before' | 'after' | 'onto', or null (at the end).
═══════════════════════════════════════════════════════ */

const BO_DROP_EDGE = 14;

// Browser globals when defined, else require() under Node/vitest.
function _bpeSupersets() {
  return typeof exerciseBlocks === 'function'
    ? { exerciseBlocks, isGroupSize, dropExerciseOnto }
    : require('./supersets.js');
}

function _bpePlannedSeries(ex) {
  return typeof plannedSeries === 'function'
    ? plannedSeries(ex)
    : require('./planned-series.js').plannedSeries(ex);
}

function _bpeEdgeIntent(rect, y) {
  const edge = Math.min(BO_DROP_EDGE, rect.height / 4);
  if (y < rect.top + edge) return 'before';
  if (y > rect.top + rect.height - edge) return 'after';
  return null;
}

// `rect` is the hovered row; above a group member row (not the first row
// of its block) "before" means after the whole block.
function boDropIntent(rect, y, { canJoin, firstRow }) {
  const intent = _bpeEdgeIntent(rect, y) || (canJoin ? 'onto' : 'after');
  return intent === 'before' && !firstRow ? 'after' : intent;
}

// The dragged exercise, or null when the source is a group block.
function _bpeDroppedExercise(exercises, blocks, source) {
  if (source.exercise) return source.exercise;
  const block = blocks[source.blockPos];
  return block.kind === 'single' ? exercises[block.indices[0]] : null;
}

function _bpeIsCardio(ex) {
  return ex.type === 'cardio';
}

function boCanDropOnto(exercises, source, ontoBlockPos) {
  const ss      = _bpeSupersets();
  const blocks  = ss.exerciseBlocks(exercises);
  const onto    = blocks[ontoBlockPos];
  const dropped = _bpeDroppedExercise(exercises, blocks, source);
  if (!dropped || source.blockPos === ontoBlockPos) return false;
  const members = onto.indices.map(i => exercises[i]);
  return ss.isGroupSize(onto.indices.length + 1) && ![dropped, ...members].some(_bpeIsCardio);
}

// A catalog exercise is appended first, then dropped like a programme one.
function _bpeDropOnto(exercises, blocks, source, target) {
  const list = source.exercise ? [...exercises, source.exercise] : exercises;
  const from = source.exercise ? list.length - 1 : blocks[source.blockPos].indices[0];
  return _bpeSupersets().dropExerciseOnto(list, from, blocks[target.blockPos].indices[0]);
}

function _bpeMoved(exercises, blocks, source) {
  return source.exercise ? [source.exercise] : blocks[source.blockPos].indices.map(i => exercises[i]);
}

// Exercises of the block at `pos`, with the moved ones placed around it
// when it is the target (the source block itself is left out).
function _bpePlaced(drop, block, pos) {
  const own = pos === drop.source.blockPos ? [] : block.indices.map(i => drop.exercises[i]);
  if (!drop.target || pos !== drop.target.blockPos) return own;
  return drop.target.intent === 'before' ? [...drop.moved, ...own] : [...own, ...drop.moved];
}

function _bpeInsert(exercises, blocks, source, target) {
  const drop = { exercises, source, target, moved: _bpeMoved(exercises, blocks, source) };
  const out  = blocks.flatMap((block, pos) => _bpePlaced(drop, block, pos));
  return target ? out : [...out, ...drop.moved];
}

// New exercise list after a drop; the input is never mutated.
function boApplyDrop(exercises, source, target) {
  const blocks = _bpeSupersets().exerciseBlocks(exercises);
  return target && target.intent === 'onto'
    ? _bpeDropOnto(exercises, blocks, source, target)
    : _bpeInsert(exercises, blocks, source, target);
}

// 105 -> "1:45".
function boClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function _bpeJoined(values) {
  return new Set(values).size === 1 ? String(values[0]) : values.join('/');
}

function _bpeWeightText(column) {
  const reps = _bpeJoined(column.map(v => v.reps ?? 0));
  const kg   = column.map(v => v.weight ?? 0);
  const load = kg.every(w => w === 0) ? 'poids du corps' : `${_bpeJoined(kg).replace(/\./g, ',')} kg`;
  return `${reps} · ${load}`;
}

function _bpeWorkText(act, column) {
  if (act && act.type === 'weight') return _bpeWeightText(column);
  if (act && act.type === 'countdown') return `${_bpeJoined(column.map(v => v.duration ?? 0))} s`;
  return 'chrono';
}

// "4 × 8 · 35 kg · repos 1:45", from the first activity.
function boRowSummary(ex) {
  const count  = ex.sets || ex.series?.length || 0;
  const act    = (ex.activities || [])[0];
  const column = _bpePlannedSeries(ex).map(s => s.values[0] || {});
  const rest   = act && act.rest > 0 ? ` · repos ${boClock(act.rest)}` : '';
  return `${count} × ${_bpeWorkText(act, column)}${rest}`;
}

const _BO_PROGRAMME_EDITOR_API = { boDropIntent, boCanDropOnto, boApplyDrop, boClock, boRowSummary };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _BO_PROGRAMME_EDITOR_API;
}
if (typeof window !== 'undefined') {
  Object.assign(window, _BO_PROGRAMME_EDITOR_API);
}
