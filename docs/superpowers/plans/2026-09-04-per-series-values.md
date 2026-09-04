# Valeurs planifiées par série — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Planifier des reps / poids / durées différents d'une série à l'autre (ex. 10-10-8-8) depuis l'éditeur de programme (backoffice + mobile), et faire respecter ces valeurs par le mobile en séance live, avec miroir par série des modifs live vers le programme.

**Architecture:** `series[i].values[j]` devient la source unique des valeurs planifiées (spec `docs/superpowers/specs/2026-09-04-per-series-values-design.md`). Une nouvelle lib pure `lib/planned-series.js` (normalisation, remplissage intelligent, redimensionnement, résumé) est testée avec vitest ; l'éditeur partagé `exercise-editor.js` rend une ligne par série ; `app.js` et `backoffice.js` lisent/écrivent uniquement `series`. Aucune migration de schéma ; un script SQL one-shot resynchronise les 4 programmes « Semaine 1 ».

**Tech Stack:** HTML/JS vanilla (scripts classiques, pas d'ESM), Tailwind CLI (`npm run css` → `dist/output.css` tracké), vitest 4 (env node, `tests/**/*.test.js`), Supabase (table `programmes`, colonne `exercises` jsonb). Un hook `pre-commit` bumpe automatiquement `APP_VERSION` (app.js) et `CACHE_NAME` (service-worker.js) et les stage : ne pas s'étonner de les voir dans chaque commit.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `lib/planned-series.js` (**nouveau**) | Source unique : `plannedSeries`, `fillDown`, `resizeValues`, `seriesFromColumns`, `blankValueFor`, `formatSeriesSummary`. Export double `module.exports` + `window.*` comme `lib/prefill-series.js`. |
| `tests/planned-series.test.js` (**nouveau**) | Tests vitest de la lib. |
| `lib/duration-estimate.js` | Countdown : durées par série via `plannedSeries`. |
| `lib/programme-from-catalog.js` | Suppression de `ensureSeries` (remplacé par `plannedSeries`). |
| `exercise-editor.js` | Une ligne par série par activité ; `readExerciseCard` renvoie `series`. |
| `backoffice.js` | Seed du modal, enregistrement, résumé card, normalisation au chargement. |
| `app.js` | `startSession` depuis `plannedSeries` ; miroir live par série ; seed éditeur mobile. |
| `index.html`, `backoffice.html` | Inclusion de `lib/planned-series.js`. |
| `dist/output.css` | Rebuild Tailwind (nouvelles classes utilitaires). |

Conventions à respecter dans tout le plan :
- Nommage des tests : `describe('<fonction>')` + `it('<comportement>')`, un comportement par test, structure Arrange / Act / Assert, pas de `if` dans les tests.
- Commentaires de code en anglais, libellés UI en français.
- Lancer les tests : `npx vitest run` (baseline avant ce plan : 6 fichiers, 38 tests OK — le 6ᵉ fichier temporaire de probe a été supprimé, on repart de 5 fichiers / 38 tests).

⚠️ **Ordre** : les tâches 6, 7 et 8 changent le contrat de `readExerciseCard`. Entre la 6 et la 8, un enregistrement depuis l'éditeur écrirait des zéros. Les exécuter à la suite sans déployer entre.

---

### Task 1 : `lib/planned-series.js` — `blankValueFor`, `resizeValues`, `seriesFromColumns`, `plannedSeries`

**Files:**
- Create: `lib/planned-series.js`
- Create: `tests/planned-series.test.js`
- Modify: `index.html:314` (ajout script), `backoffice.html:571` (ajout script)

- [ ] **Step 1 : Écrire les tests (échouent : module absent)**

Créer `tests/planned-series.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
import {
  plannedSeries, resizeValues, seriesFromColumns, blankValueFor,
} from '../lib/planned-series.js';

describe('blankValueFor', () => {
  it('returns zero reps and weight for weight', () => {
    expect(blankValueFor({ type: 'weight' })).toEqual({ reps: 0, weight: 0 });
  });

  it('returns zero duration for countdown', () => {
    expect(blankValueFor({ type: 'countdown' })).toEqual({ duration: 0 });
  });

  it('returns an empty object for stopwatch', () => {
    expect(blankValueFor({ type: 'stopwatch' })).toEqual({});
  });
});

describe('resizeValues', () => {
  it('grows by copying the last value', () => {
    const out = resizeValues([{ reps: 10, weight: 40 }, { reps: 8, weight: 40 }], 4, { reps: 0, weight: 0 });
    expect(out).toEqual([
      { reps: 10, weight: 40 }, { reps: 8, weight: 40 }, { reps: 8, weight: 40 }, { reps: 8, weight: 40 },
    ]);
  });

  it('copies objects instead of sharing references', () => {
    const src = [{ reps: 8, weight: 40 }];
    const out = resizeValues(src, 2, { reps: 0, weight: 0 });
    expect(out[0]).not.toBe(src[0]);
    expect(out[1]).not.toBe(out[0]);
  });

  it('truncates to n', () => {
    const out = resizeValues([{ duration: 30 }, { duration: 45 }, { duration: 60 }], 2, { duration: 0 });
    expect(out).toEqual([{ duration: 30 }, { duration: 45 }]);
  });

  it('starts from blank when empty', () => {
    expect(resizeValues([], 2, { duration: 0 })).toEqual([{ duration: 0 }, { duration: 0 }]);
  });
});

describe('seriesFromColumns', () => {
  it('transposes per-activity columns into series', () => {
    const columns = [
      [{ reps: 10, weight: 40 }, { reps: 8, weight: 40 }],
      [{ duration: 30 }, { duration: 45 }],
    ];
    expect(seriesFromColumns(columns, 2)).toEqual([
      { activityStates: {}, values: [{ reps: 10, weight: 40 }, { duration: 30 }] },
      { activityStates: {}, values: [{ reps: 8, weight: 40 },  { duration: 45 }] },
    ]);
  });
});

describe('plannedSeries', () => {
  it('uses series values when present, not activity-level values', () => {
    const ex = {
      sets: 2,
      activities: [{ type: 'weight', reps: 10, weight: 20 }],
      series: [
        { values: [{ reps: 8, weight: 15 }] },
        { values: [{ reps: 6, weight: 15 }] },
      ],
    };
    expect(plannedSeries(ex)).toEqual([
      { activityStates: {}, values: [{ reps: 8, weight: 15 }] },
      { activityStates: {}, values: [{ reps: 6, weight: 15 }] },
    ]);
  });

  it('builds series from activity-level reps/weight when series missing (legacy)', () => {
    const legacy = { sets: 4, activities: [{ type: 'weight', reps: 8, weight: 18, rest: 150 }] };
    const result = plannedSeries(legacy);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ activityStates: {}, values: [{ reps: 8, weight: 18 }] });
    expect(result[3].values[0]).toEqual({ reps: 8, weight: 18 });
  });

  it('builds countdown series from activity duration (legacy)', () => {
    const legacy = { sets: 3, activities: [{ type: 'countdown', duration: 45 }] };
    expect(plannedSeries(legacy)[0].values).toEqual([{ duration: 45 }]);
  });

  it('defaults to 4 sets when neither sets nor series', () => {
    const result = plannedSeries({ activities: [{ type: 'weight' }] });
    expect(result).toHaveLength(4);
    expect(result[0].values).toEqual([{ reps: 0, weight: 0 }]);
  });

  it('treats series=[] as missing', () => {
    const ex = { sets: 2, activities: [{ type: 'weight', reps: 5, weight: 10 }], series: [] };
    const result = plannedSeries(ex);
    expect(result).toHaveLength(2);
    expect(result[0].values[0]).toEqual({ reps: 5, weight: 10 });
  });

  it('uses series length when sets is missing', () => {
    const ex = {
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 10, weight: 40 }] }, { values: [{ reps: 8, weight: 40 }] }],
    };
    expect(plannedSeries(ex)).toHaveLength(2);
  });

  it('pads to sets by copying the last series', () => {
    const ex = {
      sets: 4,
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 10, weight: 40 }] }, { values: [{ reps: 8, weight: 45 }] }],
    };
    const result = plannedSeries(ex);
    expect(result.map(s => s.values[0])).toEqual([
      { reps: 10, weight: 40 }, { reps: 8, weight: 45 }, { reps: 8, weight: 45 }, { reps: 8, weight: 45 },
    ]);
  });

  it('truncates to sets', () => {
    const ex = {
      sets: 1,
      activities: [{ type: 'weight' }],
      series: [{ values: [{ reps: 10, weight: 40 }] }, { values: [{ reps: 8, weight: 45 }] }],
    };
    expect(plannedSeries(ex)).toHaveLength(1);
  });

  it('fills missing value keys from the activity fallback', () => {
    const ex = {
      sets: 1,
      activities: [{ type: 'weight', weight: 30 }],
      series: [{ values: [{ reps: 10 }] }],
    };
    expect(plannedSeries(ex)[0].values[0]).toEqual({ reps: 10, weight: 30 });
  });

  it('drops executed-state keys and non-planned value keys', () => {
    const ex = {
      sets: 1,
      activities: [{ type: 'weight' }],
      series: [{ done: true, state: 'done', activityStates: { 0: 'done' }, values: [{ reps: 10, weight: 40, extra: 1 }] }],
    };
    expect(plannedSeries(ex)[0]).toEqual({ activityStates: {}, values: [{ reps: 10, weight: 40 }] });
  });

  it('does not mutate the input exercise', () => {
    const ex = { sets: 2, activities: [{ type: 'weight' }], series: [{ values: [{ reps: 10, weight: 40 }] }] };
    const snapshot = JSON.stringify(ex);
    const result = plannedSeries(ex);
    expect(JSON.stringify(ex)).toBe(snapshot);
    expect(result[0].values[0]).not.toBe(ex.series[0].values[0]);
  });

  it('handles multi-activity exercises', () => {
    const ex = {
      sets: 2,
      activities: [{ type: 'weight' }, { type: 'countdown' }],
      series: [
        { values: [{ reps: 10, weight: 40 }, { duration: 30 }] },
        { values: [{ reps: 8,  weight: 40 }, { duration: 45 }] },
      ],
    };
    expect(plannedSeries(ex)[1].values).toEqual([{ reps: 8, weight: 40 }, { duration: 45 }]);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npx vitest run tests/planned-series.test.js`
Expected: FAIL — `Failed to load url ../lib/planned-series.js` (module introuvable).

- [ ] **Step 3 : Implémenter la lib**

Créer `lib/planned-series.js` :

```javascript
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
  module.exports = { plannedSeries, resizeValues, seriesFromColumns, blankValueFor };
}
if (typeof window !== 'undefined') {
  window.plannedSeries     = plannedSeries;
  window.resizeValues      = resizeValues;
  window.seriesFromColumns = seriesFromColumns;
  window.blankValueFor     = blankValueFor;
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npx vitest run tests/planned-series.test.js`
Expected: PASS — 20 tests.

- [ ] **Step 5 : Inclure la lib dans les deux pages**

`index.html` — insérer avant `<script src="lib/prefill-series.js"></script>` (ligne 314) :

```html
  <script src="lib/planned-series.js"></script>
```

`backoffice.html` — insérer avant `<script src="lib/duration-estimate.js"></script>` (ligne 571) :

```html
  <script src="lib/planned-series.js"></script>
```

(`duration-estimate.js` utilisera le global `plannedSeries` en Task 4 : l'ordre compte.)

- [ ] **Step 6 : Commit**

```bash
git add lib/planned-series.js tests/planned-series.test.js index.html backoffice.html
git commit -m "feat(planned-series): lib source unique des valeurs planifiées par série"
```

---

### Task 2 : `fillDown` — remplissage intelligent

**Files:**
- Modify: `lib/planned-series.js`
- Test: `tests/planned-series.test.js`

- [ ] **Step 1 : Écrire les tests**

Ajouter `fillDown` à l'import en tête de `tests/planned-series.test.js` :

```javascript
import {
  plannedSeries, resizeValues, seriesFromColumns, blankValueFor, fillDown,
} from '../lib/planned-series.js';
```

Ajouter en fin de fichier :

```javascript
describe('fillDown', () => {
  const col = (...reps) => reps.map(r => ({ reps: r }));

  it('propagates to the contiguous block of following rows with the same old value', () => {
    const values = col(10, 10, 10, 10);
    fillDown(values, 2, 'reps', 8);
    expect(values.map(v => v.reps)).toEqual([10, 10, 8, 8]);
  });

  it('stops at the first following row with a different value', () => {
    const values = col(10, 10, 8, 8);
    fillDown(values, 0, 'reps', 12);
    expect(values.map(v => v.reps)).toEqual([12, 12, 8, 8]);
  });

  it('leaves a later equal row untouched when the block is broken', () => {
    const values = col(10, 10, 8, 10);
    fillDown(values, 0, 'reps', 12);
    expect(values.map(v => v.reps)).toEqual([12, 12, 8, 10]);
  });

  it('changes only the edited row when the next row differs', () => {
    const values = col(10, 8, 8);
    fillDown(values, 0, 'reps', 12);
    expect(values.map(v => v.reps)).toEqual([12, 8, 8]);
  });

  it('works on the last row', () => {
    const values = col(10, 10);
    fillDown(values, 1, 'reps', 8);
    expect(values.map(v => v.reps)).toEqual([10, 8]);
  });

  it('compares string values strictly (DOM inputs)', () => {
    const values = [{ reps: '10' }, { reps: '10' }, { reps: '' }];
    fillDown(values, 0, 'reps', '12');
    expect(values.map(v => v.reps)).toEqual(['12', '12', '']);
  });

  it('mutates in place and returns the same array', () => {
    const values = col(10, 10);
    expect(fillDown(values, 0, 'reps', 9)).toBe(values);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/planned-series.test.js`
Expected: FAIL — `fillDown is not a function` (7 tests).

- [ ] **Step 3 : Implémenter**

Dans `lib/planned-series.js`, ajouter après `seriesFromColumns` :

```javascript
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
```

Et l'exporter (les deux blocs) :

```javascript
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
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/planned-series.test.js`
Expected: PASS — 27 tests.

- [ ] **Step 5 : Commit**

```bash
git add lib/planned-series.js tests/planned-series.test.js
git commit -m "feat(planned-series): fillDown, remplissage intelligent des lignes suivantes"
```

---

### Task 3 : `formatSeriesSummary` — résumé texte pour la card programme

**Files:**
- Modify: `lib/planned-series.js`
- Test: `tests/planned-series.test.js`

- [ ] **Step 1 : Écrire les tests**

Ajouter `formatSeriesSummary` à l'import :

```javascript
import {
  plannedSeries, resizeValues, seriesFromColumns, blankValueFor, fillDown, formatSeriesSummary,
} from '../lib/planned-series.js';
```

Ajouter en fin de fichier :

```javascript
describe('formatSeriesSummary', () => {
  const weightEx = (...pairs) => ({
    sets: pairs.length,
    activities: [{ type: 'weight' }],
    series: pairs.map(([reps, weight]) => ({ values: [{ reps, weight }] })),
  });

  it('formats uniform reps and weight as "n × reps · kg"', () => {
    expect(formatSeriesSummary(weightEx([10, 40], [10, 40], [10, 40], [10, 40]))).toBe('4 × 10 · 40 kg');
  });

  it('lists reps when they vary', () => {
    expect(formatSeriesSummary(weightEx([10, 40], [10, 40], [8, 40], [8, 40]))).toBe('10/10/8/8 × 40 kg');
  });

  it('lists weights when they vary', () => {
    expect(formatSeriesSummary(weightEx([10, 40], [10, 40], [10, 45], [10, 45]))).toBe('4 × 10 · 40/40/45/45 kg');
  });

  it('lists both when both vary', () => {
    expect(formatSeriesSummary(weightEx([10, 40], [8, 45]))).toBe('10/8 × 40/45 kg');
  });

  it('formats uniform countdown durations', () => {
    const ex = { sets: 3, activities: [{ type: 'countdown' }], series: [45, 45, 45].map(d => ({ values: [{ duration: d }] })) };
    expect(formatSeriesSummary(ex)).toBe('3 × 45 s');
  });

  it('lists countdown durations when they vary', () => {
    const ex = { sets: 3, activities: [{ type: 'countdown' }], series: [45, 45, 60].map(d => ({ values: [{ duration: d }] })) };
    expect(formatSeriesSummary(ex)).toBe('45/45/60 s');
  });

  it('formats stopwatch as a dash', () => {
    expect(formatSeriesSummary({ sets: 3, activities: [{ type: 'stopwatch' }] })).toBe('3 × —');
  });

  it('falls back to legacy activity values when series is missing', () => {
    expect(formatSeriesSummary({ sets: 4, activities: [{ type: 'weight', reps: 8, weight: 18 }] })).toBe('4 × 8 · 18 kg');
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/planned-series.test.js`
Expected: FAIL — `formatSeriesSummary is not a function` (8 tests).

- [ ] **Step 3 : Implémenter**

Dans `lib/planned-series.js`, ajouter après `fillDown` :

```javascript
function _uniform(arr) {
  return arr.every(x => x === arr[0]);
}

// One-line summary of the first activity, for programme cards.
function formatSeriesSummary(ex) {
  const series = plannedSeries(ex);
  const n      = series.length;
  const act    = (ex.activities || [])[0];
  const col    = series.map(s => s.values[0] || {});

  if (act && act.type === 'countdown') {
    const d = col.map(v => v.duration ?? 0);
    return _uniform(d) ? `${n} × ${d[0]} s` : `${d.join('/')} s`;
  }
  if (act && act.type === 'weight') {
    const reps    = col.map(v => v.reps ?? 0);
    const kg      = col.map(v => v.weight ?? 0);
    const repsTxt = _uniform(reps) ? `${n} × ${reps[0]} ·` : `${reps.join('/')} ×`;
    const kgTxt   = _uniform(kg) ? `${kg[0]}` : kg.join('/');
    return `${repsTxt} ${kgTxt} kg`;
  }
  return `${n} × —`;
}
```

Exports :

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { plannedSeries, resizeValues, seriesFromColumns, blankValueFor, fillDown, formatSeriesSummary };
}
if (typeof window !== 'undefined') {
  window.plannedSeries       = plannedSeries;
  window.resizeValues        = resizeValues;
  window.seriesFromColumns   = seriesFromColumns;
  window.blankValueFor       = blankValueFor;
  window.fillDown            = fillDown;
  window.formatSeriesSummary = formatSeriesSummary;
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run tests/planned-series.test.js`
Expected: PASS — 35 tests.

- [ ] **Step 5 : Commit**

```bash
git add lib/planned-series.js tests/planned-series.test.js
git commit -m "feat(planned-series): formatSeriesSummary pour les cards programme"
```

---

### Task 4 : `lib/duration-estimate.js` — countdown par série

**Files:**
- Modify: `lib/duration-estimate.js:13-31`
- Test: `tests/duration-estimate.test.js`

- [ ] **Step 1 : Écrire le test**

Ajouter dans `tests/duration-estimate.test.js`, dans le `describe('computeEstimatedDuration')` :

```javascript
  it('sums per-series countdown durations when series values differ', () => {
    const programme = {
      exercises: [{
        name: 'Plank',
        activities: [{ type: 'countdown', rest: 15 }],
        sets: 3,
        series: [30, 30, 60].map(d => ({ activityStates: {}, values: [{ duration: d }] })),
      }],
    };
    expect(computeEstimatedDuration(programme, new Map())).toBe(165);
  });

  it('keeps 45s per series for weight even when series values are present', () => {
    const programme = {
      exercises: [{
        name: 'Curl',
        activities: [{ type: 'weight', rest: 60 }],
        sets: 2,
        series: [{ values: [{ reps: 10, weight: 20 }] }, { values: [{ reps: 8, weight: 22 }] }],
      }],
    };
    expect(computeEstimatedDuration(programme, new Map())).toBe(210);
  });
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/duration-estimate.test.js`
Expected: FAIL — le test countdown renvoie `45` (3 × (0 + 15), `act.duration` absent) au lieu de `165`. Le test weight passe déjà (garde-fou).

- [ ] **Step 3 : Implémenter**

Remplacer `_exerciseDuration` (lignes 13-31) par :

```javascript
// In the browser `plannedSeries` is a global (lib/planned-series.js is
// loaded first); under Node/vitest we require it.
function _plannedSeriesOf(ex) {
  const fn = typeof plannedSeries === 'function'
    ? plannedSeries
    : require('./planned-series.js').plannedSeries;
  return fn(ex);
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
    for (const s of series) {
      const work = act.type === 'countdown'
        ? (s.values[j]?.duration ?? 0)
        : DEFAULT_SET_SECONDS;
      total += work + rest;
    }
  });
  return total;
}
```

Mettre à jour le commentaire d'en-tête (lignes 1-8) :

```javascript
/* ═══════════════════════════════════════════════════════
   DURATION ESTIMATE — calcule la durée totale estimée
   d'un programme à partir de ses exercices.

   Priorité 1 : moyenne historique par exo (avgMap)
   Priorité 2 : 45s par série pour weight/stopwatch + rest
   Countdown  : durée planifiée de chaque série + rest
                (lib/planned-series.js, fallback legacy act.duration)
═══════════════════════════════════════════════════════ */
```

- [ ] **Step 4 : Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS — 6 fichiers ; les 6 anciens tests de `duration-estimate` passent toujours (legacy `act.duration` absorbé par `plannedSeries`), plus les 2 nouveaux.

- [ ] **Step 5 : Commit**

```bash
git add lib/duration-estimate.js tests/duration-estimate.test.js
git commit -m "feat(duration-estimate): countdown estimé depuis les durées planifiées par série"
```

---

### Task 5 : Supprimer `ensureSeries` (remplacé par `plannedSeries`)

**Files:**
- Modify: `lib/programme-from-catalog.js:69-93`
- Modify: `tests/programme-from-catalog.test.js:2,83-134`
- Modify: `backoffice.js:355-357`

- [ ] **Step 1 : Retirer les tests de `ensureSeries`**

Dans `tests/programme-from-catalog.test.js` :
- ligne 2 : `import { buildProgrammeExerciseFromCatalog } from '../lib/programme-from-catalog.js';`
- supprimer tout le bloc `describe('ensureSeries', () => { ... });` (lignes 83-134). Ces cas sont couverts par `tests/planned-series.test.js` (Task 1).

- [ ] **Step 2 : Retirer la fonction et ses exports**

Dans `lib/programme-from-catalog.js`, supprimer les lignes 69-84 (commentaire « Migration legacy → moderne » + fonction `ensureSeries`) et remplacer les exports par :

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildProgrammeExerciseFromCatalog };
}
if (typeof window !== 'undefined') {
  window.buildProgrammeExerciseFromCatalog = buildProgrammeExerciseFromCatalog;
}
```

- [ ] **Step 3 : Remplacer l'appel dans `backoffice.js`**

Lignes 355-357, remplacer :

```javascript
    // ensureSeries migre les vieux programmes (qui ne stockaient reps/weight
    // qu'au niveau activity) vers la forme moderne avec series[].values[]
    exercises:   (existingProg?.exercises || []).map(e => ensureSeries({ ...e })),
```

par :

```javascript
    // plannedSeries normalises old programmes (activity-level reps/weight)
    // into the canonical series[].values[] shape, sized to `sets`.
    exercises:   (existingProg?.exercises || []).map(e => _withPlannedSeries(e)),
```

Et ajouter, juste au-dessus de `async function renderProgrammeEditor(existingProg) {` (ligne 347), la fonction utilitaire :

```javascript
// Returns a copy of the exercise with canonical per-series values.
function _withPlannedSeries(ex) {
  const series = plannedSeries(ex);
  return { ...ex, sets: series.length, series };
}
```

- [ ] **Step 4 : Vérifier**

Run: `npx vitest run && grep -rn 'ensureSeries' --include='*.js' --include='*.html' . | grep -v node_modules`
Expected: tests PASS (6 fichiers) ; grep sans résultat.

- [ ] **Step 5 : Commit**

```bash
git add lib/programme-from-catalog.js tests/programme-from-catalog.test.js backoffice.js
git commit -m "refactor: ensureSeries remplacé par plannedSeries"
```

---

### Task 6 : `exercise-editor.js` — une ligne par série

**Files:**
- Modify: `exercise-editor.js:44-67` (`updateActivityFields`), `:78-145` (`makeActivityRow`), `:147-218` (`makeExerciseCard`), `:220-235` (`readExerciseCard`)
- Modify: `dist/output.css` (rebuild Tailwind)

Contrat après cette tâche :
- `makeActivityRow({ type, label, name, rest, values, sets })` — `values` = tableau par série pour cette activité (`[{reps, weight}, ...]` / `[{duration}, ...]`), `sets` = nombre de lignes si `values` absent.
- `makeExerciseCard({ name, sets, activities, series, comment })` — `series` au format programme.
- `readExerciseCard(card)` → `{ name, sets, activities: [{ type, label, name, rest }], series: [{ activityStates: {}, values }], comment }`.

- [ ] **Step 1 : Remplacer `updateActivityFields` par le rendu par ligne**

Remplacer les lignes 44-67 (fonction `updateActivityFields` entière) par :

```javascript
/* ── Lignes par série d'une activité ───────────────────── */
const _LINE_CLS = 'series-line flex items-baseline gap-2 border-b border-border focus-within:border-acid transition';
const _LINE_NUM = 'font-sans text-[9px] uppercase tracking-eyebrow text-muted w-5 shrink-0';

// 0 and null render as an empty input (placeholder "0").
function _displayNum(v) {
  return (v == null || v === 0) ? '' : v;
}

function _seriesLineHTML(type, i, v) {
  const num = `<span class="${_LINE_NUM}">${String(i + 1).padStart(2, '0')}</span>`;
  if (type === 'weight') {
    const reps = _displayNum(v.reps), weight = _displayNum(v.weight);
    return `
      <div class="${_LINE_CLS}" data-idx="${i}">
        ${num}
        <input type="number" inputmode="decimal" min="1" placeholder="0" value="${reps}" data-prev="${reps}"
          class="activity-reps ${_INPUT_NUM} text-center" />
        <span class="font-display font-bold text-acid text-[16px] shrink-0">×</span>
        <input type="number" inputmode="decimal" min="0" step="0.5" placeholder="0" value="${weight}" data-prev="${weight}"
          class="activity-weight ${_INPUT_NUM} text-center" />
        <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">kg</span>
      </div>`;
  }
  const dur = _displayNum(v.duration);
  return `
    <div class="${_LINE_CLS}" data-idx="${i}">
      ${num}
      <input type="number" inputmode="numeric" min="1" placeholder="0" value="${dur}" data-prev="${dur}"
        class="activity-duration ${_INPUT_NUM} text-center" />
      <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">sec</span>
    </div>`;
}

// Renders one line per series for weight/countdown, a note for stopwatch.
function updateActivityFields(row, type, values = []) {
  const fieldsDiv = row.querySelector('.activity-fields');
  if (type === 'weight' || type === 'countdown') {
    fieldsDiv.innerHTML = values.map((v, i) => _seriesLineHTML(type, i, v)).join('');
  } else {
    fieldsDiv.innerHTML = `
      <p class="font-display italic text-[13px] text-muted py-2 border-b border-border">temps enregistré au chrono</p>`;
  }
}

// Reads the per-series values of one activity row from its DOM lines.
function _readSeriesValues(row, type) {
  return Array.from(row.querySelectorAll('.series-line')).map(line => {
    if (type === 'weight') return {
      reps:   parseFloat(line.querySelector('.activity-reps').value)   || 0,
      weight: parseFloat(line.querySelector('.activity-weight').value) || 0,
    };
    if (type === 'countdown') return { duration: parseFloat(line.querySelector('.activity-duration').value) || 0 };
    return {};
  });
}

// Smart fill: the typed value flows down to the following lines that
// still held the previous value (see fillDown in lib/planned-series.js).
function _onSeriesInput(row, input) {
  const field = ['reps', 'weight', 'duration'].find(f => input.classList.contains(`activity-${f}`));
  if (!field) return;
  const idx    = parseInt(input.closest('.series-line').dataset.idx, 10);
  const inputs = Array.from(row.querySelectorAll(`.activity-${field}`));
  const col    = inputs.map(el => ({ [field]: el.value }));
  col[idx][field] = input.dataset.prev ?? '';
  fillDown(col, idx, field, input.value);
  inputs.forEach((el, j) => { el.value = col[j][field]; el.dataset.prev = el.value; });
}

// Number of series currently set on the enclosing card.
function _currentSets(el, fallback) {
  const input = el.closest('.exercise-card')?.querySelector('.exercise-sets');
  return parseInt(input?.value, 10) || fallback;
}

// Re-renders an activity row with n lines, keeping existing values.
function resizeActivityRow(row, n) {
  const type   = row.querySelector('.activity-type-btn').dataset.type;
  const values = resizeValues(_readSeriesValues(row, type), n, blankValueFor({ type }));
  updateActivityFields(row, type, values);
}
```

- [ ] **Step 2 : Adapter `makeActivityRow`**

Remplacer la signature (ligne 78) :

```javascript
function makeActivityRow({ type = 'weight', label = '', name = '', rest = '', values = null, sets = 3 } = {}) {
```

Remplacer le listener du bouton type (bloc `typeBtn.addEventListener('click', ...)`) par :

```javascript
  typeBtn.addEventListener('click', () => {
    const next = ACTIVITY_TYPES[(ACTIVITY_TYPES.indexOf(typeBtn.dataset.type) + 1) % ACTIVITY_TYPES.length];
    typeBtn.dataset.type = next;
    typeBtn.textContent  = ACTIVITY_LABELS[next];
    // Switching type resets this activity's values on every series.
    updateActivityFields(row, next, resizeValues([], _currentSets(row, sets), blankValueFor({ type: next })));
  });
```

Remplacer le bloc « Ligne 2 : valeurs + repos » jusqu'au `return row;` inclus par :

```javascript
  // Line 2: per-series values (left) + rest (right)
  const bottomRow = document.createElement('div');
  bottomRow.className = 'flex items-start gap-3';

  const fieldsDiv = document.createElement('div');
  fieldsDiv.className = 'activity-fields flex-1 space-y-2';
  fieldsDiv.addEventListener('input', e => _onSeriesInput(row, e.target));

  const restWrap = document.createElement('div');
  restWrap.className = 'flex items-baseline gap-2 border-b border-border focus-within:border-acid transition shrink-0 w-[160px] px-2';
  restWrap.innerHTML = `
    <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">repos</span>
    <input type="number" inputmode="numeric" min="0" placeholder="0" value="${rest}"
      class="activity-rest ${_INPUT_NUM} text-center text-[20px] py-2" />
    <span class="font-sans text-[11px] uppercase tracking-eyebrow text-muted shrink-0">s</span>
  `;

  bottomRow.append(fieldsDiv, restWrap);

  row.append(labelRow, topRow, bottomRow);
  updateActivityFields(row, type, values || resizeValues([], sets, blankValueFor({ type })));
  return row;
}
```

- [ ] **Step 3 : Adapter `makeExerciseCard`**

Signature (ligne 147) :

```javascript
function makeExerciseCard({ name = '', sets = 3, activities = null, series = null, comment = '' } = {}) {
```

Après `card.appendChild(setsRow);`, ajouter :

```javascript
  const setsInput = setsRow.querySelector('.exercise-sets');
  setsInput.addEventListener('input', () => {
    const n = parseInt(setsInput.value, 10);
    if (!(n >= 1)) return;
    card.querySelectorAll('.activity-row').forEach(row => resizeActivityRow(row, n));
  });
```

Remplacer les trois lignes :

```javascript
  const defaultActs = activities || [{ type: 'weight' }];
  defaultActs.forEach(act => activitiesList.appendChild(makeActivityRow(act)));
  syncActivityLabels(activitiesList);
```

par :

```javascript
  const defaultActs = activities || [{ type: 'weight' }];
  const planned = plannedSeries({ sets, activities: defaultActs, series: series || [] });
  defaultActs.forEach((act, j) => activitiesList.appendChild(makeActivityRow({
    ...act, sets, values: planned.map(s => s.values[j]),
  })));
  syncActivityLabels(activitiesList);
```

Remplacer le listener de `addActBtn` :

```javascript
  addActBtn.addEventListener('click', () => {
    activitiesList.appendChild(makeActivityRow({ sets: _currentSets(card, sets) }));
    syncActivityLabels(activitiesList);
  });
```

- [ ] **Step 4 : Réécrire `readExerciseCard`**

Remplacer la fonction entière (lignes 220-235) par :

```javascript
/* Reads an exercise-card DOM → programme exercise object (canonical shape) */
function readExerciseCard(card) {
  const rows = Array.from(card.querySelectorAll('.activity-row'));
  const sets = parseInt(card.querySelector('.exercise-sets').value, 10) || 1;
  const activities = rows.map(row => ({
    type:  row.querySelector('.activity-type-btn').dataset.type || 'weight',
    label: row.querySelector('.activity-label').value.trim(),
    name:  row.querySelector('.activity-name').value.trim(),
    rest:  parseInt(row.querySelector('.activity-rest')?.value, 10) || 0,
  }));
  const columns = rows.map((row, j) =>
    resizeValues(_readSeriesValues(row, activities[j].type), sets, blankValueFor(activities[j])));
  return {
    name:    card.querySelector('.exercise-name').value.trim() || 'Sans nom',
    sets,
    activities,
    series:  seriesFromColumns(columns, sets),
    comment: card.querySelector('.exercise-comment').value.trim(),
  };
}
```

- [ ] **Step 5 : Syntax check + rebuild CSS**

Run: `node --check exercise-editor.js && npm run css`
Expected: pas d'erreur ; `dist/output.css` régénéré (nouvelles classes `w-5`, `space-y-2`, `items-start`).

- [ ] **Step 6 : Vérification manuelle rapide (backoffice)**

Servir la racine (`python3 -m http.server 8080`), ouvrir `http://localhost:8080/backoffice.html`, éditer un programme, ouvrir un exercice :
1. Une ligne par série `01…04` avec `reps × kg`, repos à droite.
2. Taper `10` en ligne 1 → lignes 2-4 suivent. Taper `8` en ligne 3 → ligne 4 suit, 1-2 restent.
3. Passer « Séries » à 5 → ligne 5 apparaît avec les valeurs de la 4. Revenir à 3 → lignes 4-5 disparaissent.
4. Cliquer le type jusqu'à « Minuterie » → lignes `sec` vides ; revenir à « Poids » → lignes vides.

(L'enregistrement n'est pas encore branché : Task 7.)

- [ ] **Step 7 : Commit**

```bash
git add exercise-editor.js dist/output.css
git commit -m "feat(exercise-editor): une ligne de valeurs par série avec remplissage intelligent"
```

---

### Task 7 : `backoffice.js` — seed du modal, enregistrement, résumé card

**Files:**
- Modify: `backoffice.js:645-658` (`makeProgrammeCard`), `:716-732` (seed modal), `:740-765` (enregistrement)

- [ ] **Step 1 : Résumé de la card programme**

Dans `makeProgrammeCard`, remplacer :

```javascript
  const firstAct = ex.activities?.[0];
  const isWeight = firstAct?.type === 'weight';
  const setsCount = ex.sets || (ex.series || []).length || 0;
  const repsLabel = isWeight ? (ex.series?.[0]?.values?.[0]?.reps ?? '?') : '—';
  const weightLabel = isWeight ? `${ex.series?.[0]?.values?.[0]?.weight ?? 0} kg` : '';
  const restSec = firstAct?.rest ?? 0;
  const restLabel = restSec > 0 ? ` · repos ${restSec}s` : '';
```

par :

```javascript
  const firstAct  = ex.activities?.[0];
  const restSec   = firstAct?.rest ?? 0;
  const restLabel = restSec > 0 ? ` · repos ${restSec}s` : '';
```

et dans le template, remplacer :

```javascript
      <p class="text-muted text-[10px] uppercase tracking-eyebrow">${setsCount} × ${repsLabel} ${weightLabel}${restLabel}</p>
```

par :

```javascript
      <p class="text-muted text-[10px] uppercase tracking-eyebrow">${formatSeriesSummary(ex)}${restLabel}</p>
```

- [ ] **Step 2 : Seed du modal d'édition**

Remplacer le bloc `wrap.appendChild(makeExerciseCard({ ... }));` (lignes 717-732) par :

```javascript
  wrap.appendChild(makeExerciseCard({
    name:       seed.name,
    sets:       seed.sets,
    activities: (seed.activities || []).map(a => ({
      type:  a.type,
      label: a.label ?? '',
      name:  a.name  ?? '',
      rest:  a.rest  ?? '',
    })),
    series:     plannedSeries(seed),
    comment:    seed.comment || '',
  }));
```

- [ ] **Step 3 : Enregistrement**

Remplacer le bloc `const exo = { ... };` (lignes 742-765) par :

```javascript
    const exo = {
      name:            readBack.name,
      normalized_name: normalizeExerciseName(readBack.name),
      category:        _progEditorState.category,
      comment:         readBack.comment,
      sets:            readBack.sets,
      activities:      readBack.activities,
      series:          readBack.series,
    };
```

- [ ] **Step 4 : Vérification manuelle (backoffice)**

1. Ouvrir un programme, un exo : les lignes reflètent les valeurs stockées par série.
2. Saisir `10/10/8/8` × `40`, Enregistrer → la card affiche `10/10/8/8 × 40 kg · repos 120s`.
3. Rouvrir l'exo → `10/10/8/8` conservés. Sauvegarder le programme, recharger la page, rouvrir → toujours `10/10/8/8`.
4. Ajouter un exo depuis le catalogue pour un client ayant déjà exécuté l'exo → les valeurs de la dernière séance apparaissent par série.
5. L'estimation de durée dans l'en-tête reste cohérente (countdown : somme des durées par série).

- [ ] **Step 5 : Commit**

```bash
git add backoffice.js
git commit -m "feat(backoffice): valeurs par série dans l'éditeur de programme et le résumé"
```

---

### Task 8 : `app.js` — séance live et éditeur mobile

**Files:**
- Modify: `app.js:840-855` (`startSession`), `:1713-1725` (édition countdown), `:1983-2010` (`propagateLiveValue`, `updateProgrammeTemplate`), `:4829-4843` (`fillExercises`)

- [ ] **Step 1 : `startSession` lit les séries planifiées**

Remplacer le mapping non-cardio (lignes 840-855) :

```javascript
      : programme.exercises.map(ex => {
          const m    = migrateExercise(ex);
          const sets = ex.sets ?? m.series.length ?? (ex.count ?? 3);
          return {
            name:       ex.name,
            comment:    ex.comment || '',
            activities: m.activities,
            prevSeries: null,
            series: Array.from({ length: sets }, () => ({
              activityStates: {},
              values: m.activities.map(act =>
                act.type === 'weight'
                  ? { reps: act.reps || 0, weight: act.weight || 0 }
                  : { duration: act.duration || 0 }
              ),
            })),
          };
        }),
```

par :

```javascript
      : programme.exercises.map(ex => {
          const m = migrateExercise(ex);
          return {
            name:       ex.name,
            comment:    ex.comment || '',
            activities: m.activities,
            prevSeries: null,
            // Planned per-series values are the source of truth (lib/planned-series.js).
            series:     plannedSeries(m),
          };
        }),
```

- [ ] **Step 2 : Miroir par série vers le programme**

Remplacer `propagateLiveValue` (ligne 1983-1995) par :

```javascript
// Applies a live edit to the current series and every following series
// not yet done, then mirrors it into the programme template. Returns the
// indices that changed.
function propagateLiveValue(exIdx, sIdx, actIdx, field, val) {
  const ex = liveSession.exercises[exIdx];
  const changed = [];
  ex.series.forEach((s, j) => {
    if (j < sIdx) return;
    const isDone = s.activityStates?.[actIdx] === 'done';
    if (j === sIdx || !isDone) {
      if (!s.values[actIdx]) s.values[actIdx] = {};
      s.values[actIdx][field] = val;
      changed.push(j);
    }
  });
  updateProgrammeTemplateSeries(exIdx, actIdx, field, val, changed);
  return changed;
}
```

Juste après `updateProgrammeTemplate` (qui reste tel quel, désormais utilisé uniquement pour `rest`), ajouter :

```javascript
// Mirrors a per-series value into programmes.exercises[exIdx].series
// for the given series indices. Serialised on the same queue as
// updateProgrammeTemplate to avoid concurrent writes.
function updateProgrammeTemplateSeries(exIdx, actIdx, field, val, indices) {
  if (!liveSession.programmeId || !indices.length) return programmeTemplateQueue;
  programmeTemplateQueue = programmeTemplateQueue.then(async () => {
    const programmes = await loadProgrammes();
    const prog = programmes.find(p => p.id === liveSession.programmeId);
    const ex = prog?.exercises?.[exIdx];
    if (!ex?.activities?.[actIdx]) return;
    ex.series = plannedSeries(ex);
    ex.sets   = ex.series.length;
    indices.forEach(j => {
      if (ex.series[j]) ex.series[j].values[actIdx][field] = val;
    });
    await updateProgrammeDB(prog);
  }).catch(err => console.error('updateProgrammeTemplateSeries error:', err));
  return programmeTemplateQueue;
}
```

Modifier le commentaire au-dessus de `updateProgrammeTemplate` (ligne 1998-2000) :

```javascript
// Sérialisée pour éviter les races entre updates concurrents du même programme
let programmeTemplateQueue = Promise.resolve();

// Activity-level template fields only (today: `rest`). Planned values go
// through updateProgrammeTemplateSeries.
function updateProgrammeTemplate(exIdx, actIdx, field, val) {
```

- [ ] **Step 3 : Édition countdown en live → miroir de la durée**

Dans le `onOk` du modal countdown (lignes 1716-1729), après la ligne :

```javascript
        liveSession.exercises[exIdx].series[sIdx].values[actIdx].duration = dur;
```

ajouter :

```javascript
        updateProgrammeTemplateSeries(exIdx, actIdx, 'duration', dur, [sIdx]);
```

(La durée live ne se propage pas aux séries suivantes : comportement inchangé, seul le miroir est ajouté.)

- [ ] **Step 4 : Éditeur mobile — seed par série**

Dans `fillExercises` (lignes 4829-4843), remplacer :

```javascript
        exercises.forEach(ex => {
          const m = migrateExercise(ex);
          const acts = m.activities.map(act => ({
            type: act.type, label: act.label || '', name: act.name || '',
            reps: act.type === 'weight' ? (act.reps ?? '') : '',
            weight: act.type === 'weight' ? (act.weight ?? '') : '',
            duration: act.type !== 'weight' ? (act.duration ?? '') : '',
            rest: act.rest ?? '',
          }));
          exercisesList.appendChild(makeExerciseCard({
            name: ex.name || '', sets: ex.sets || m.series?.length || ex.count || 3,
            activities: acts, comment: ex.comment || '',
          }));
        });
```

par :

```javascript
        exercises.forEach(ex => {
          const m = migrateExercise(ex);
          const acts = m.activities.map(act => ({
            type: act.type, label: act.label || '', name: act.name || '', rest: act.rest ?? '',
          }));
          const series = plannedSeries(m);
          exercisesList.appendChild(makeExerciseCard({
            name: ex.name || '', sets: series.length,
            activities: acts, series, comment: ex.comment || '',
          }));
        });
```

`saveProgrammeFromEditor` (ligne 4868) utilise déjà `readExerciseCard` tel quel : les objets stockés portent maintenant `series` et des `activities` sans valeurs. Aucun changement.

- [ ] **Step 5 : Syntax check + tests**

Run: `node --check app.js && npx vitest run`
Expected: pas d'erreur ; 6 fichiers PASS.

- [ ] **Step 6 : Commit**

```bash
git add app.js
git commit -m "feat(mobile): séance live et éditeur mobile sur les valeurs planifiées par série"
```

---

### Task 9 : Vérification end-to-end (backoffice + mobile)

**Files:** aucun (vérification). Servir la racine : `python3 -m http.server 8080`.

- [ ] **Step 1 : Backoffice → programme 10/10/8/8**

Dans `backoffice.html`, sur un programme de test du client : exo « Hack squat », 4 séries, ligne 1 `10 × 40` (tout suit), ligne 3 `8` (la 4 suit). Enregistrer, sauvegarder le programme. Card : `10/10/8/8 × 40 kg`.

- [ ] **Step 2 : Mobile → séance live respecte le plan**

Dans `index.html` (mode mobile du navigateur), lancer ce programme. Les 4 séries affichent `40 kg × 10, 10, 8, 8` avant toute saisie.

- [ ] **Step 3 : Mobile → miroir par série**

Valider la série 1. Sur la série 2, éditer le poids `45` et reps `10` → séries 2, 3, 4 passent à 45 kg (propagation live existante). Vérifier en base :

```sql
select jsonb_path_query_array(e, '$.series[*].values[0]')
from programmes p, jsonb_array_elements(p.exercises) e
where p.name = '<nom du programme de test>' and e->>'name' = 'Hack squat';
```

Expected: `[{"reps":10,"weight":40},{"reps":10,"weight":45},{"reps":8,"weight":45},{"reps":8,"weight":45}]` et `activities[0]` sans `reps`/`weight` modifiés.

- [ ] **Step 4 : Mobile → éditeur de programme**

Dans l'onglet programmes du mobile, éditer ce programme : les lignes affichent `10/10/8/8` et `40/45/45/45`. Mettre à jour sans rien changer → valeurs conservées.

- [ ] **Step 5 : Legacy**

Ouvrir dans le backoffice un ancien programme (`activities` avec `reps/weight`, sans `series`, ex. un des programmes « Reprise »). L'éditeur affiche les valeurs héritées sur chaque ligne ; enregistrer produit `series` et retire `reps/weight` des `activities`.

- [ ] **Step 6 : Commit de fin de vérif (si retouches)**

```bash
git add -A -- app.js backoffice.js exercise-editor.js dist/output.css
git commit -m "fix: retouches vérification e2e valeurs par série"
```

(Sauter si aucune retouche.)

---

### Task 10 : Migration one-shot des 4 programmes « Semaine 1 »

**Files:** aucun dans le repo (SQL exécuté via `mcp__supabase__execute_sql`).

- [ ] **Step 1 : Diff avant/après**

Requête de prévisualisation (lecture seule) : pour chaque exo des programmes « Semaine 1 - … », valeurs actuelles de `series` vs valeurs de la dernière exécution du client.

```sql
with prog as (
  select p.id, p.name as prog_name, p.client_id, e.ord, e.value as ex
  from programmes p, jsonb_array_elements(p.exercises) with ordinality e(value, ord)
  where p.name like 'Semaine 1 - %'
),
last_exec as (
  select distinct on (s.client_id, se.normalized_name)
         s.client_id, se.normalized_name, se.execution
  from session_exercises se join sessions s on s.id = se.session_id
  order by s.client_id, se.normalized_name, s.date desc, s.started_at desc nulls last
)
select prog.prog_name, prog.ex->>'name' as exo,
       jsonb_path_query_array(prog.ex, '$.series[*].values[0]')            as current_series,
       jsonb_path_query_array(le.execution, '$.series[*].values[0]')        as last_exec_series
from prog left join last_exec le
  on le.client_id = prog.client_id and le.normalized_name = prog.ex->>'normalized_name'
order by prog.prog_name, prog.ord;
```

Colonnes vérifiées le 2026-09-04 : `session_exercises.normalized_name` / `execution` (jsonb), `sessions.client_id` / `date` (text ISO) / `started_at` (text), `programmes.client_id` / `exercises` (jsonb).

Présenter le tableau à Lionel : ligne par exo, `current_series` → `last_exec_series`. Attendu pour Hack squat : `10×40 ×4` → `10/10/8/8 × 47.6/47.6/57.6/57.6`.

- [ ] **Step 2 : Appliquer (après accord explicite)**

```sql
with prog as (
  select p.id, p.client_id, e.ord, e.value as ex
  from programmes p, jsonb_array_elements(p.exercises) with ordinality e(value, ord)
  where p.name like 'Semaine 1 - %'
),
last_exec as (
  select distinct on (s.client_id, se.normalized_name)
         s.client_id, se.normalized_name, se.execution
  from session_exercises se join sessions s on s.id = se.session_id
  order by s.client_id, se.normalized_name, s.date desc, s.started_at desc nulls last
),
rebuilt as (
  select prog.id, prog.ord,
    case when le.execution is null then prog.ex
    else jsonb_set(prog.ex, '{series}', (
      select jsonb_agg(jsonb_build_object(
        'activityStates', '{}'::jsonb,
        'values', (
          select jsonb_agg(
            case a.value->>'type'
              when 'weight'    then jsonb_build_object('reps',   coalesce(v.value->'reps',   '0'::jsonb),
                                                       'weight', coalesce(v.value->'weight', '0'::jsonb))
              when 'countdown' then jsonb_build_object('duration', coalesce(v.value->'duration', '0'::jsonb))
              else '{}'::jsonb end
            order by a.ord)
          from jsonb_array_elements(prog.ex->'activities') with ordinality a(value, ord)
          left join jsonb_array_elements(coalesce(s.value->'values', '[]'::jsonb)) with ordinality v(value, ord) on v.ord = a.ord
        )
      ) order by s.ord)
      from jsonb_array_elements(le.execution->'series') with ordinality s(value, ord)
      where s.ord <= coalesce((prog.ex->>'sets')::int, 4)
    )) end as ex
  from prog left join last_exec le
    on le.client_id = prog.client_id and le.normalized_name = prog.ex->>'normalized_name'
)
update programmes p
set exercises = (select jsonb_agg(r.ex order by r.ord) from rebuilt r where r.id = p.id)
where p.name like 'Semaine 1 - %';
```

Puis relancer la requête du Step 1 : `current_series` doit égaler `last_exec_series` (tronqué à `sets`).

- [ ] **Step 3 : Noter dans la mémoire de session**

Mettre à jour `~/.claude/memory.txt` (section Micky) : migration faite, date, programmes touchés.

---

### Task 11 : Rebaser le plan « poids du corps »

**Files:**
- Modify: `docs/superpowers/plans/2026-05-31-bodyweight-exercise-type.md` (en-tête + Task 4)

- [ ] **Step 1 : Ajouter un prérequis en tête du plan bodyweight**

Insérer après le bloc `> **For agentic workers:** ...` :

```markdown
> **Prérequis (2026-09-04) :** le plan `2026-09-04-per-series-values.md` est implémenté. `exercise-editor.js` rend désormais une ligne par série (`_seriesLineHTML`, `updateActivityFields(row, type, values)`), `readExerciseCard` renvoie `series`, et `startSession` lit `plannedSeries(ex)`. Adapter : Task 4 (ajouter une branche `bodyweight` dans `_seriesLineHTML` avec `[reps] × [lest]`, placeholder « PdC », et `blankValueFor`/`_legacyValueFor` dans `lib/planned-series.js` pour `bodyweight` = `{ reps, weight }`), Task 5 (ne plus reconstruire `series` dans `startSession`), Task 8 (le modal backoffice ne passe plus `reps/weight` aux activités).
```

- [ ] **Step 2 : Commit**

```bash
git add docs/superpowers/plans/2026-05-31-bodyweight-exercise-type.md
git commit -m "docs(plan): prérequis valeurs par série pour le plan poids du corps"
```

---

## Self-review (couverture spec)

| Exigence spec | Task |
|---|---|
| `plannedSeries` (series gagne, legacy, pad/tronque, clés manquantes, pas de mutation) | 1 |
| `resizeValues` | 1 |
| `fillDown` bloc contigu | 2 |
| `formatSeriesSummary` (uniforme / reps / poids / countdown / stopwatch) | 3 |
| `duration-estimate` countdown par série | 4 |
| Suppression `ensureSeries`, `backoffice.js:357` | 5 |
| Éditeur : ligne par série, resize, type switch, `readExerciseCard` → `series` | 6 |
| Backoffice : seed, save, card | 7 |
| Mobile : `startSession`, miroir par série, countdown, éditeur mobile, `saveProgrammeFromEditor` | 8 |
| Vérification manuelle (scénario de référence) | 9 |
| Migration one-shot Semaine 1 | 10 |
| Interaction plan bodyweight | 11 |
| Inclusion script dans `index.html` / `backoffice.html` | 1 |
