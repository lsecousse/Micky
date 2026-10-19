/* ═══════════════════════════════════════════════════════
   PROGRAMME EDITOR — pure logic of the mobile programme
   editor: blocks with link state, group settings reading,
   save shape, member summary, list meta line.
═══════════════════════════════════════════════════════ */

// Browser globals when defined, else require() under Node/vitest.
function _peSupersets() {
  return typeof exerciseBlocks === 'function'
    ? { exerciseBlocks, isGroupSize, setGroupSettings }
    : require('./supersets.js');
}

function _pePlannedSeries(ex) {
  return typeof plannedSeries === 'function'
    ? plannedSeries(ex)
    : require('./planned-series.js').plannedSeries(ex);
}

function _peKindLabel(size) {
  return typeof supersetKindLabel === 'function'
    ? supersetKindLabel(size)
    : require('./live-superset.js').supersetKindLabel(size);
}

function _peKg(value) {
  return String(value).replace('.', ',');
}

function _peIsCardio(ex) {
  return ex.type === 'cardio';
}

function _peCanLink(exercises, block, next) {
  if (!next) return false;
  const indices = [...block.indices, ...next.indices];
  return _peSupersets().isGroupSize(indices.length)
    && !indices.some(i => _peIsCardio(exercises[i]));
}

function _peGroupSettings(block) {
  return { rounds: block.rounds, transition: block.transition, roundRest: block.roundRest };
}

// Programme blocks enriched for the editor.
function editorBlocks(exercises) {
  const blocks = _peSupersets().exerciseBlocks(exercises);
  return blocks.map((block, pos) => {
    const isGroup = block.kind === 'group';
    return {
      kind:        block.kind,
      indices:     block.indices,
      label:       isGroup ? _peKindLabel(block.indices.length) : null,
      canLinkNext: _peCanLink(exercises, block, blocks[pos + 1]),
      settings:    isGroup ? _peGroupSettings(block) : null,
    };
  });
}

function _peParseInt(text, min, fallback) {
  const trimmed = String(text ?? '').trim();
  const value   = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  return value >= min ? value : fallback;
}

// Typed strings -> settings; an invalid field keeps its previous value.
function readGroupSettings(raw, previous) {
  return {
    rounds:     _peParseInt(raw.rounds, 1, previous.rounds),
    transition: _peParseInt(raw.transition, 0, previous.transition),
    roundRest:  _peParseInt(raw.roundRest, 0, previous.roundRest),
  };
}

function _peGroupedIndices(exercises) {
  const groups = _peSupersets().exerciseBlocks(exercises).filter(b => b.kind === 'group');
  return new Set(groups.flatMap(b => b.indices));
}

function _peSavedExercise(ex, inGroup) {
  const { group, ...rest } = ex;
  const named = { ...rest, name: String(ex.name ?? '').trim() ? ex.name : 'Sans nom' };
  return inGroup ? { ...named, group, sets: group.rounds } : named;
}

// A blank name becomes « Sans nom »; a group member plays as many series as
// the group has rounds; a lone member (stale group of one) loses its group.
function programmeForSave(exercises) {
  const grouped = _peGroupedIndices(exercises);
  return exercises.map((ex, i) => _peSavedExercise(ex, grouped.has(i)));
}

function _peJoined(values) {
  return new Set(values).size === 1 ? String(values[0]) : values.join('/');
}

function _peWeightSummary(column) {
  const reps = _peJoined(column.map(v => v.reps ?? 0));
  const kg   = _peJoined(column.map(v => _peKg(v.weight ?? 0)));
  return `${reps} reps · ${kg} kg`;
}

// Summary without the series count: "10 reps · 60 kg", "45 s", "chrono".
function memberSummary(ex) {
  const act    = (ex.activities || [])[0];
  const column = _pePlannedSeries(ex).map(s => s.values[0] || {});
  if (act && act.type === 'weight') return _peWeightSummary(column);
  if (act && act.type === 'countdown') return `${_peJoined(column.map(v => v.duration ?? 0))} s`;
  return 'chrono';
}

function _pePlural(count, word) {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

// "Fonte · 5 exercices · 2 super sets".
function programmeListMeta(programme) {
  const exercises = programme.exercises || [];
  const groups    = _peSupersets().exerciseBlocks(exercises).filter(b => b.kind === 'group').length;
  const kind      = programme.category === 'cardio' ? 'Cardio' : 'Fonte';
  const parts     = [kind, _pePlural(exercises.length, 'exercice')];
  if (groups) parts.push(_pePlural(groups, 'super set'));
  return parts.join(' · ');
}

// Arrows of a group member row: ↓ for the first, ↑ for the last, both in between.
function memberMoveDirs(position, count) {
  const dirs = [];
  if (position > 0) dirs.push(-1);
  if (position < count - 1) dirs.push(1);
  return dirs;
}

// Typed group settings (strings) applied to every member of the group.
function applyGroupSettingsInput(exercises, groupId, raw) {
  const member = exercises.find(ex => ex.group && ex.group.id === groupId);
  if (!member) return exercises;
  const settings = readGroupSettings(raw, member.group);
  return _peSupersets().setGroupSettings(exercises, groupId, settings);
}

// Exercise appended by « + Exercice »: complete, so an untouched card saves every field.
function newEditorExercise() {
  const activity = { type: 'weight', label: '', name: '', reps: 0, weight: 0, duration: 0, rest: 0 };
  return { name: '', sets: 3, activities: [activity], comment: '' };
}

// A missing or zero value shows an empty field (its « 0 » placeholder); it still reads back as 0.
function _peShownValue(value) {
  return value ? value : '';
}

function _peCardActivity(act) {
  const weight = act.type === 'weight';
  return {
    type: act.type, label: act.label || '', name: act.name || '',
    reps:     weight ? _peShownValue(act.reps) : '',
    weight:   weight ? _peShownValue(act.weight) : '',
    duration: weight ? '' : _peShownValue(act.duration),
    rest:     _peShownValue(act.rest),
  };
}

// Fields shown by an exercise card (exercise already in the activities format).
function editorCardFields(ex) {
  return {
    name:       ex.name || '',
    sets:       ex.sets || ex.series?.length || ex.count || 3,
    activities: (ex.activities || []).map(_peCardActivity),
    comment:    ex.comment || '',
  };
}

const _PROGRAMME_EDITOR_API = {
  editorBlocks, readGroupSettings, programmeForSave, memberSummary, programmeListMeta,
  memberMoveDirs, applyGroupSettingsInput, newEditorExercise, editorCardFields,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _PROGRAMME_EDITOR_API;
}
if (typeof window !== 'undefined') {
  Object.assign(window, _PROGRAMME_EDITOR_API);
}
