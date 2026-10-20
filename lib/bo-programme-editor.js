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

function _bpeMemberSummary(ex) {
  return typeof memberSummary === 'function'
    ? memberSummary(ex)
    : require('./programme-editor.js').memberSummary(ex);
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

// A stale target (its block is gone) means the end; an "onto" that became impossible means "after".
function _bpeSettledTarget(exercises, blocks, source, target) {
  if (!target || !blocks[target.blockPos]) return null;
  const blocked = target.intent === 'onto' && !boCanDropOnto(exercises, source, target.blockPos);
  return blocked ? { ...target, intent: 'after' } : target;
}

// New exercise list after a drop; the input is never mutated.
function boApplyDrop(exercises, source, target) {
  const blocks  = _bpeSupersets().exerciseBlocks(exercises);
  const settled = _bpeSettledTarget(exercises, blocks, source, target);
  return settled && settled.intent === 'onto'
    ? _bpeDropOnto(exercises, blocks, source, settled)
    : _bpeInsert(exercises, blocks, source, settled);
}

// 105 -> "1:45".
function boClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// "4 × 8 reps · 35 kg · repos 1:45": the member summary of the mobile editor, with the series count and rest.
function boRowSummary(ex) {
  const count = ex.sets || ex.series?.length || 0;
  const act   = (ex.activities || [])[0];
  const rest  = act && act.rest > 0 ? ` · repos ${boClock(act.rest)}` : '';
  return `${count} × ${_bpeMemberSummary(ex)}${rest}`;
}

const _BO_PROGRAMME_EDITOR_API = { boDropIntent, boCanDropOnto, boApplyDrop, boClock, boRowSummary };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _BO_PROGRAMME_EDITOR_API;
}
if (typeof window !== 'undefined') {
  Object.assign(window, _BO_PROGRAMME_EDITOR_API);
}
