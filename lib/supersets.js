/* ═══════════════════════════════════════════════════════
   SUPERSETS — group model and pure editing operations on
   an exercise list (programme or live session).

   Every member of a group carries the same `group` object
   { id, rounds, transition, roundRest }; members are
   contiguous and their array order is A, B, C, D.
   All operations return a new array and never mutate
   their input.
═══════════════════════════════════════════════════════ */

const SUPERSET_MIN_SIZE           = 2;
const SUPERSET_MAX_SIZE           = 4;
const SUPERSET_DEFAULT_TRANSITION = 15;
const SUPERSET_DEFAULT_ROUND_REST = 90;

// In the browser `plannedSeries` is a global (lib/planned-series.js is
// loaded first); under Node/vitest we require it.
function _ssPlannedSeries(ex) {
  const fn = typeof plannedSeries === 'function'
    ? plannedSeries
    : require('./planned-series.js').plannedSeries;
  return fn(ex);
}

// The group fields of a member `group` or of a group block.
function _ssGroupFields(src) {
  const { id, rounds, transition, roundRest } = src;
  return { id, rounds, transition, roundRest };
}

function _ssGroupBlock(group, index) {
  return { kind: 'group', indices: [index], ..._ssGroupFields(group) };
}

// A run of length 1 is read as a plain exercise.
function _ssSettle(block) {
  return block.indices.length > 1 ? block : { kind: 'single', indices: block.indices };
}

function exerciseBlocks(exercises) {
  const blocks = [];
  exercises.forEach((ex, i) => {
    const last = blocks[blocks.length - 1];
    const id   = ex.group && ex.group.id;
    if (id && last && last.id === id) last.indices.push(i);
    else blocks.push(id ? _ssGroupBlock(ex.group, i) : { kind: 'single', indices: [i] });
  });
  return blocks.map(_ssSettle);
}

function defaultSupersetRounds(members) {
  return Math.max(1, ...members.map(m => _ssPlannedSeries(m).length));
}

// Permutation of 0..length-1 where the chosen members, in the chosen order,
// take the place of the smallest chosen index.
function supersetOrder(length, indices) {
  const first = Math.min(...indices);
  const order = [];
  for (let i = 0; i < length; i++) {
    if (i === first) order.push(...indices);
    else if (!indices.includes(i)) order.push(i);
  }
  return order;
}

function _ssNextGroupId(exercises) {
  const taken = new Set(exercises.map(ex => ex.group && ex.group.id));
  let n = 1;
  while (taken.has(`g${n}`)) n++;
  return `g${n}`;
}

function _ssSettings(settings) {
  const out = {};
  ['rounds', 'transition', 'roundRest'].forEach(key => {
    if (settings[key] != null) out[key] = settings[key];
  });
  return out;
}

// Member copy carrying `group`, its series resized to the rounds.
function _ssWithGroup(ex, group) {
  const sets = group.rounds;
  return { ...ex, sets, series: _ssPlannedSeries({ ...ex, sets }), group: { ...group } };
}

function _ssApplyGroup(exercises, indices, group) {
  return exercises.map((ex, i) => indices.includes(i) ? _ssWithGroup(ex, group) : ex);
}

function isGroupSize(count) {
  return count >= SUPERSET_MIN_SIZE && count <= SUPERSET_MAX_SIZE;
}

function _ssAssertSize(count) {
  if (!isGroupSize(count)) throw new Error('Un super set compte 2 à 4 exercices');
}

function _ssAssertNotCardio(ex) {
  if (ex.type === 'cardio') throw new Error('Un exercice cardio ne peut pas être groupé');
}

function _ssAssertGroupable(exercises, i) {
  if (!Number.isInteger(i) || !exercises[i]) throw new Error(`Exercice introuvable : ${i}`);
  _ssAssertNotCardio(exercises[i]);
  if (exercises[i].group) throw new Error('Exercice déjà groupé');
}

function _ssAssertNewGroup(exercises, indices) {
  _ssAssertSize(indices.length);
  if (new Set(indices).size !== indices.length) throw new Error('Exercice en doublon');
  indices.forEach(i => _ssAssertGroupable(exercises, i));
}

function _ssDefaultGroup(exercises, indices) {
  return {
    id:         _ssNextGroupId(exercises),
    rounds:     defaultSupersetRounds(indices.map(i => exercises[i])),
    transition: SUPERSET_DEFAULT_TRANSITION,
    roundRest:  SUPERSET_DEFAULT_ROUND_REST,
  };
}

function groupExercises(exercises, indices, settings = {}) {
  _ssAssertNewGroup(exercises, indices);
  const group = { ..._ssDefaultGroup(exercises, indices), ..._ssSettings(settings) };
  const ordered = supersetOrder(exercises.length, indices).map(i => exercises[i]);
  const first   = Math.min(...indices);
  return _ssApplyGroup(ordered, indices.map((_, k) => first + k), group);
}

function _ssIsMember(ex, groupId) {
  return Boolean(ex.group) && ex.group.id === groupId;
}

function _ssWithoutGroup(ex) {
  const { group, ...rest } = ex;
  return rest;
}

function ungroupSuperset(exercises, groupId) {
  return exercises.map(ex => _ssIsMember(ex, groupId) ? _ssWithoutGroup(ex) : ex);
}

function setGroupSettings(exercises, groupId, patch) {
  return exercises.map(ex => _ssIsMember(ex, groupId)
    ? _ssWithGroup(ex, { ...ex.group, ..._ssSettings(patch) })
    : ex);
}

function _ssBlockIndexOf(blocks, index) {
  return blocks.findIndex(b => b.indices.includes(index));
}

// Group settings carried by the first group block of the list, if any.
function _ssLeadGroup(blocks) {
  const lead = blocks.find(b => b.kind === 'group');
  return lead && _ssGroupFields(lead);
}

// "Lier au suivant": merges the block of `index` with the next block.
function linkNextExercise(exercises, index) {
  const blocks = exerciseBlocks(exercises);
  const at     = _ssBlockIndexOf(blocks, index);
  const pair   = [blocks[at], blocks[at + 1]];
  if (!pair[1]) throw new Error('Aucun exercice suivant à lier');
  const indices = [...pair[0].indices, ...pair[1].indices];
  _ssAssertSize(indices.length);
  indices.forEach(i => _ssAssertNotCardio(exercises[i]));
  return _ssApplyGroup(exercises, indices, _ssLeadGroup(pair) || _ssDefaultGroup(exercises, indices));
}

function _ssSwap(items, i, j) {
  const out = items.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// Moves the whole block of `index` by one block (dir = -1 up, +1 down).
function moveExerciseBlock(exercises, index, dir) {
  const blocks = exerciseBlocks(exercises);
  const at     = _ssBlockIndexOf(blocks, index);
  if (!blocks[at + dir]) return exercises.slice();
  return _ssSwap(blocks, at, at + dir).flatMap(b => b.indices.map(i => exercises[i]));
}

function moveWithinSuperset(exercises, index, dir) {
  const ex       = exercises[index];
  const neighbor = exercises[index + dir];
  const inGroup  = Boolean(ex.group) && Boolean(neighbor) && _ssIsMember(neighbor, ex.group.id);
  return inGroup ? _ssSwap(exercises, index, index + dir) : exercises.slice();
}

// A group reduced to one member is dissolved.
function removeExerciseKeepingGroups(exercises, index) {
  const rest  = exercises.filter((_, i) => i !== index);
  const group = exercises[index].group;
  const alone = Boolean(group) && rest.filter(ex => _ssIsMember(ex, group.id)).length === 1;
  return alone ? ungroupSuperset(rest, group.id) : rest;
}

function _ssInsertAfter(items, index, item) {
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}

function _ssJoinGroup(exercises, block, dropped) {
  _ssAssertSize(block.indices.length + 1);
  const last = block.indices[block.indices.length - 1];
  return _ssApplyGroup(_ssInsertAfter(exercises, last, dropped), [...block.indices, last + 1], _ssLeadGroup([block]));
}

// Back-office drag and drop: dropping `from` onto `onto` forms a group
// [onto, from] or appends `from` at the end of the group of `onto`.
function dropExerciseOnto(exercises, from, onto) {
  if (from === onto) return exercises.slice();
  const dropped = _ssWithoutGroup(exercises[from]);
  const rest    = removeExerciseKeepingGroups(exercises, from);
  const target  = onto > from ? onto - 1 : onto;
  const blocks  = exerciseBlocks(rest);
  const block   = blocks[_ssBlockIndexOf(blocks, target)];
  return block.kind === 'group'
    ? _ssJoinGroup(rest, block, dropped)
    : groupExercises(_ssInsertAfter(rest, target, dropped), [target, target + 1]);
}

function supersetMemberLetter(position) {
  return String.fromCharCode(65 + position);
}

const _SUPERSETS_API = {
  exerciseBlocks, defaultSupersetRounds, supersetOrder, isGroupSize, groupExercises, ungroupSuperset, setGroupSettings,
  linkNextExercise, moveExerciseBlock, moveWithinSuperset, dropExerciseOnto, removeExerciseKeepingGroups, supersetMemberLetter,
};

// Exports: window globals for the browser + module.exports for Node/vitest.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _SUPERSETS_API;
}
if (typeof window !== 'undefined') {
  Object.assign(window, _SUPERSETS_API);
}
