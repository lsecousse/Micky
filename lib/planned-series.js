/* ═══════════════════════════════════════════════════════
   PLANNED SERIES — single source of truth for the planned
   per-series values of a programme exercise.

   series[i].values[j] = planned values of series i for
   activity j. Legacy activities[j].reps / weight / duration
   are only read as a fallback (old programmes).
═══════════════════════════════════════════════════════ */

const DEFAULT_SETS = 4;

function blankValueFor(act) {
  if (act.type === 'weight')    return { reps: 0, weight: 0 };
  if (act.type === 'countdown') return { duration: 0 };
  return {};
}

// Value inherited from the activity level (legacy programmes).
function _legacyValueFor(act) {
  if (act.type === 'weight')    return { reps: act.reps || 0, weight: act.weight || 0 };
  if (act.type === 'countdown') return { duration: act.duration || 0 };
  return {};
}

// Keeps only the planned keys of the activity type, fills missing ones.
function _pickValue(act, v) {
  const defaults = _legacyValueFor(act);
  const out = {};
  for (const key of Object.keys(defaults)) {
    out[key] = (v && v[key] != null) ? v[key] : defaults[key];
  }
  return out;
}

// Resize a per-activity column to n entries: pad by copying the last
// value (or blank when empty), or truncate. Always returns fresh objects.
function resizeValues(values, n, blank) {
  const out  = values.slice(0, n).map(v => ({ ...v }));
  const last = out.length ? out[out.length - 1] : blank;
  while (out.length < n) out.push({ ...last });
  return out;
}

// Transpose per-activity columns into programme-shaped series.
function seriesFromColumns(columns, n) {
  return Array.from({ length: n }, (_, i) => ({
    activityStates: {},
    values: columns.map(col => col[i]),
  }));
}

// Editor smart fill: the edited value flows down to the contiguous block
// of following rows that still held the old value. Mutates `values`.
function fillDown(values, idx, field, newVal) {
  const old = values[idx][field];
  values[idx][field] = newVal;
  for (let j = idx + 1; j < values.length && values[j][field] === old; j++) {
    values[j][field] = newVal;
  }
  return values;
}

function plannedSeries(ex) {
  const activities = ex.activities || [];
  const hasSeries  = Array.isArray(ex.series) && ex.series.length > 0;
  const sets       = ex.sets || (hasSeries ? ex.series.length : DEFAULT_SETS);

  const columns = activities.map((act, j) => {
    const raw = hasSeries
      ? ex.series.map(s => _pickValue(act, s.values && s.values[j]))
      : [_legacyValueFor(act)];
    return resizeValues(raw, sets, blankValueFor(act));
  });

  return seriesFromColumns(columns, sets);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { plannedSeries, resizeValues, seriesFromColumns, blankValueFor, fillDown };
}
if (typeof window !== 'undefined') {
  window.plannedSeries     = plannedSeries;
  window.resizeValues      = resizeValues;
  window.seriesFromColumns = seriesFromColumns;
  window.blankValueFor     = blankValueFor;
  window.fillDown          = fillDown;
}
