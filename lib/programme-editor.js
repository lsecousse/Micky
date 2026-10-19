/* ═══════════════════════════════════════════════════════
   PROGRAMME EDITOR — pure logic of the mobile programme
   editor: blocks with link state, group settings reading,
   save shape, member summary, list meta line.
═══════════════════════════════════════════════════════ */

// Browser globals when defined, else require() under Node/vitest.
function _peSupersets() {
  return typeof exerciseBlocks === 'function'
    ? { exerciseBlocks, isGroupSize }
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

// A group member plays as many series as the group has rounds.
function programmeForSave(exercises) {
  return exercises.map(ex => (ex.group ? { ...ex, sets: ex.group.rounds } : ex));
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

const _PROGRAMME_EDITOR_API = {
  editorBlocks, readGroupSettings, programmeForSave, memberSummary, programmeListMeta,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _PROGRAMME_EDITOR_API;
}
if (typeof window !== 'undefined') {
  Object.assign(window, _PROGRAMME_EDITOR_API);
}
