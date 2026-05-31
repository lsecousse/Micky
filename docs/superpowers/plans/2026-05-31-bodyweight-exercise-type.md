# Type d'exercice « Poids du corps » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un 4ᵉ type d'activité `bodyweight` (« Poids du corps ») : reps + lest optionnel, volume kg exclu, reps comptées.

**Architecture:** Approche A — `bodyweight` réutilise la forme de données `{ reps, weight }` (où `weight` = lest). Une seule règle métier nouvelle : *bodyweight compte les reps mais pas le tonnage kg*. On ajoute une branche `bodyweight` partout où les types sont aiguillés ; les unités pures (`lib/`) sont testées en TDD, le rendu DOM est vérifié manuellement.

**Tech Stack:** JS vanilla (CommonJS+window dual pattern dans `lib/`), Vitest (environment node), Tailwind CLI, Supabase (jsonb, pas de migration).

**Spec :** `docs/superpowers/specs/2026-05-31-bodyweight-exercise-type-design.md`

---

## Structure des fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `lib/programme-from-catalog.js` | Construit l'exo programme depuis catalogue + prev | Modifier (3 branches) |
| `lib/prefill-series.js` | Préremplit série live depuis prev | Modifier (1 branche) |
| `lib/session-totals.js` | **NOUVEAU** — totaux live (séries/volume/reps) | Créer + extraire de app.js |
| `lib/feedback-payload.js` | **NOUVEAU** — sérialise une activité pour l'IA | Créer + extraire de app.js |
| `exercise-editor.js` | Éditeur d'activité partagé | Modifier (type + champ) |
| `app.js` | Séance live, recap, historique, prompt IA | Modifier (branches + wiring) |
| `backoffice.js` | Éditeur coach + CRUD catalogue | Modifier (option + branches) |
| `tests/*.test.js` | Vitest | Ajouter / créer |

**Règle Tailwind :** ne réutiliser que des classes déjà présentes (pas de nouvelle utility). Aucune reconstruction CSS nécessaire.

---

## Task 1 : `lib/programme-from-catalog.js` — bodyweight dans les 3 fonctions

**Files:**
- Modify: `lib/programme-from-catalog.js:10-15`, `:44-49`, `:78-82`
- Test: `tests/programme-from-catalog.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `tests/programme-from-catalog.test.js`, avant l'éventuelle dernière `});` de fermeture du `describe` racine (ou dans un nouveau `describe`) :

```javascript
describe('bodyweight', () => {
  it('builds blank reps+weight values for a bodyweight catalog entry', () => {
    const entry = {
      name: 'Tractions', normalized_name: 'tractions', category: 'fonte',
      default_activities: [{ type: 'bodyweight' }],
    };
    const exo = buildProgrammeExerciseFromCatalog(entry, null);
    expect(exo.activities[0].type).toBe('bodyweight');
    expect(exo.series[0].values[0]).toEqual({ reps: 0, weight: 0 });
  });

  it('merges client prev reps+lest into a bodyweight series', () => {
    const entry = {
      name: 'Tractions', normalized_name: 'tractions', category: 'fonte',
      default_activities: [{ type: 'bodyweight' }],
    };
    const clientPrev = {
      activities: [{ type: 'bodyweight' }],
      execution: { series: [{ values: [{ reps: 8, weight: 10 }] }] },
    };
    const exo = buildProgrammeExerciseFromCatalog(entry, clientPrev);
    expect(exo.series[0].values[0]).toEqual({ reps: 8, weight: 10 });
  });

  it('ensureSeries rebuilds reps+weight for a legacy bodyweight exo', () => {
    const ex = { name: 'Dips', sets: 2, activities: [{ type: 'bodyweight', reps: 12, weight: 5 }] };
    const out = ensureSeries(ex);
    expect(out.series).toHaveLength(2);
    expect(out.series[0].values[0]).toEqual({ reps: 12, weight: 5 });
  });
});
```

Vérifier que `buildProgrammeExerciseFromCatalog` et `ensureSeries` sont bien importés en haut du fichier de test (ils le sont déjà pour les tests existants — sinon ajouter `const { buildProgrammeExerciseFromCatalog, ensureSeries } = require('../lib/programme-from-catalog.js');` ou la forme `import` utilisée par le fichier).

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npx vitest run tests/programme-from-catalog.test.js`
Expected: FAIL — `values[0]` vaut `{}` au lieu de `{ reps: 0, weight: 0 }` (le type bodyweight tombe dans `return {}`).

- [ ] **Step 3 : Implémenter — `_blankValueFor` (ligne 10-15)**

```javascript
function _blankValueFor(act) {
  if (act.type === 'weight' || act.type === 'bodyweight') return { reps: 0, weight: 0 };
  if (act.type === 'countdown') return { duration: act.duration ?? 0 };
  if (act.type === 'stopwatch') return {};
  return {};
}
```

- [ ] **Step 4 : Implémenter — branche valeurs dans `buildProgrammeExerciseFromCatalog` (ligne 44-49)**

Remplacer :

```javascript
      if (act.type === 'weight') {
        return {
          reps:   prevVal.reps   ?? blank.reps,
          weight: prevVal.weight ?? blank.weight,
        };
      }
```

par :

```javascript
      if (act.type === 'weight' || act.type === 'bodyweight') {
        return {
          reps:   prevVal.reps   ?? blank.reps,
          weight: prevVal.weight ?? blank.weight,
        };
      }
```

- [ ] **Step 5 : Implémenter — `ensureSeries` (ligne 78-82)**

Remplacer `if (act.type === 'weight')    return { reps: act.reps || 0, weight: act.weight || 0 };`
par :

```javascript
      if (act.type === 'weight' || act.type === 'bodyweight') return { reps: act.reps || 0, weight: act.weight || 0 };
```

- [ ] **Step 6 : Lancer les tests, vérifier le succès**

Run: `npx vitest run tests/programme-from-catalog.test.js`
Expected: PASS (tous, anciens inclus).

- [ ] **Step 7 : Commit**

```bash
git add lib/programme-from-catalog.js tests/programme-from-catalog.test.js
git commit -m "feat(bodyweight): catalog + ensureSeries gèrent le type poids du corps"
```

---

## Task 2 : `lib/prefill-series.js` — préremplissage bodyweight

**Files:**
- Modify: `lib/prefill-series.js:30-35`
- Test: `tests/prefill-series.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `tests/prefill-series.test.js` (dans le `describe` racine) :

```javascript
it('prefills reps and lest for a bodyweight activity when template is empty', () => {
  const exercises = [{
    activities: [{ type: 'bodyweight' }],
    prevSeries: [{ values: [{ reps: 8, weight: 10 }] }],
    series:     [{ values: [{ reps: 0, weight: 0 }] }],
  }];
  prefillSeriesFromPrev(exercises);
  expect(exercises[0].series[0].values[0]).toEqual({ reps: 8, weight: 10 });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npx vitest run tests/prefill-series.test.js`
Expected: FAIL — valeurs restent `{ reps: 0, weight: 0 }` (bodyweight non géré).

- [ ] **Step 3 : Implémenter — branche bodyweight (ligne 30-35)**

Remplacer :

```javascript
        if (act.type === 'weight') {
          if (_isEmpty(cur.reps)   && !_isEmpty(prev.reps))   cur.reps   = prev.reps;
          if (_isEmpty(cur.weight) && !_isEmpty(prev.weight)) cur.weight = prev.weight;
        } else if (act.type === 'countdown') {
```

par :

```javascript
        if (act.type === 'weight' || act.type === 'bodyweight') {
          if (_isEmpty(cur.reps)   && !_isEmpty(prev.reps))   cur.reps   = prev.reps;
          if (_isEmpty(cur.weight) && !_isEmpty(prev.weight)) cur.weight = prev.weight;
        } else if (act.type === 'countdown') {
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npx vitest run tests/prefill-series.test.js`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add lib/prefill-series.js tests/prefill-series.test.js
git commit -m "feat(bodyweight): prefill des reps/lest depuis la séance précédente"
```

---

## Task 3 : `lib/session-totals.js` (NOUVEAU) — extraire et tester les totaux live

Extraction DRY du bloc inline `app.js:925-947` + règle bodyweight (reps comptées, volume exclu).

**Files:**
- Create: `lib/session-totals.js`
- Create: `tests/session-totals.test.js`
- Modify: `app.js:925-947` (remplacer le bloc inline par l'appel)
- Modify: `index.html` (charger le nouveau script avant `app.js`)

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/session-totals.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
const { computeLiveTotals } = require('../lib/session-totals.js');

describe('computeLiveTotals', () => {
  it('weight: counts volume and reps, marks done', () => {
    const exercises = [{
      activities: [{ type: 'weight' }],
      series: [{ activityStates: { 0: 'done' }, values: [{ reps: 10, weight: 50 }] }],
    }];
    const t = computeLiveTotals(exercises);
    expect(t).toEqual({
      totalSeries: 1, doneSeries: 1,
      totalVolume: 500, doneVolume: 500,
      totalReps: 10, doneReps: 10,
    });
  });

  it('bodyweight: counts reps but NOT volume', () => {
    const exercises = [{
      activities: [{ type: 'bodyweight' }],
      series: [{ activityStates: { 0: 'done' }, values: [{ reps: 8, weight: 10 }] }],
    }];
    const t = computeLiveTotals(exercises);
    expect(t.totalVolume).toBe(0);
    expect(t.doneVolume).toBe(0);
    expect(t.totalReps).toBe(8);
    expect(t.doneReps).toBe(8);
  });

  it('skips cardio exercises', () => {
    const exercises = [{ type: 'cardio', series: [{}] }];
    const t = computeLiveTotals(exercises);
    expect(t.totalSeries).toBe(0);
  });

  it('mixed: bodyweight reps add to reps total, only weight adds to volume', () => {
    const exercises = [{
      activities: [{ type: 'weight' }, { type: 'bodyweight' }],
      series: [{ activityStates: { 0: 'done', 1: 'done' }, values: [{ reps: 5, weight: 20 }, { reps: 12, weight: 0 }] }],
    }];
    const t = computeLiveTotals(exercises);
    expect(t.totalVolume).toBe(100);  // 5×20, bodyweight exclu
    expect(t.totalReps).toBe(17);     // 5 + 12
    expect(t.doneSeries).toBe(1);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npx vitest run tests/session-totals.test.js`
Expected: FAIL — `Cannot find module '../lib/session-totals.js'`.

- [ ] **Step 3 : Créer `lib/session-totals.js`**

```javascript
/* ═══════════════════════════════════════════════════════
   SESSION TOTALS — totaux d'une séance live (fonte).
   Règle : 'weight' compte volume + reps ; 'bodyweight'
   compte les reps mais PAS le tonnage kg (le lest n'est
   pas du tonnage). Les autres types n'alimentent ni l'un
   ni l'autre.
═══════════════════════════════════════════════════════ */

function computeLiveTotals(exercises) {
  let totalSeries = 0, doneSeries = 0;
  let totalVolume = 0, doneVolume = 0;
  let totalReps = 0, doneReps = 0;

  for (const ex of (exercises || [])) {
    if (ex.type === 'cardio') continue;
    const acts = ex.activities || [];
    for (const s of (ex.series || [])) {
      totalSeries++;
      const allDone = acts.every((_, a) => s.activityStates?.[a] === 'done');
      if (allDone) doneSeries++;
      acts.forEach((act, a) => {
        if (act.type !== 'weight' && act.type !== 'bodyweight') return;
        const v = s.values?.[a] || {};
        const reps   = v.reps   ?? act.reps   ?? 0;
        const weight = v.weight ?? act.weight ?? 0;
        const vol    = act.type === 'weight' ? reps * weight : 0;
        totalVolume += vol;
        totalReps   += reps;
        if (s.activityStates?.[a] === 'done') {
          doneVolume += vol;
          doneReps   += reps;
        }
      });
    }
  }
  return { totalSeries, doneSeries, totalVolume, doneVolume, totalReps, doneReps };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeLiveTotals };
}
if (typeof window !== 'undefined') {
  window.computeLiveTotals = computeLiveTotals;
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npx vitest run tests/session-totals.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5 : Câbler dans `app.js` (remplacer le bloc inline 925-947)**

Remplacer :

```javascript
  let totalSeries = 0, doneSeries = 0, totalVolume = 0, doneVolume = 0, totalReps = 0, doneReps = 0;
  if (!isCardio) {
    liveSession.exercises.forEach(ex => {
      if (ex.type === 'cardio') return;
      ex.series.forEach((s) => {
        totalSeries++;
        const allDone = ex.activities.every((_, a) => s.activityStates?.[a] === 'done');
        if (allDone) doneSeries++;
        ex.activities.forEach((act, a) => {
          if (act.type !== 'weight') return;
          const v = s.values?.[a] || {};
          const reps = v.reps ?? act.reps ?? 0;
          const weight = v.weight ?? act.weight ?? 0;
          totalVolume += reps * weight;
          totalReps += reps;
          if (s.activityStates?.[a] === 'done') {
            doneVolume += reps * weight;
            doneReps += reps;
          }
        });
      });
    });
  }
```

par :

```javascript
  let totalSeries = 0, doneSeries = 0, totalVolume = 0, doneVolume = 0, totalReps = 0, doneReps = 0;
  if (!isCardio) {
    ({ totalSeries, doneSeries, totalVolume, doneVolume, totalReps, doneReps } =
      computeLiveTotals(liveSession.exercises));
  }
```

- [ ] **Step 6 : Charger le script dans `index.html`**

Trouver la ligne qui charge `lib/prefill-series.js` (ou les autres `lib/*.js`) dans `index.html` et ajouter à côté, **avant** `<script src="app.js">` :

```html
<script src="lib/session-totals.js"></script>
```

Vérifier : `grep -n "lib/prefill-series.js\|app.js\"" index.html` pour situer l'insertion, puis confirmer après édition `grep -n "lib/session-totals.js" index.html`.

- [ ] **Step 7 : Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS (toute la suite, aucune régression).

- [ ] **Step 8 : Commit**

```bash
git add lib/session-totals.js tests/session-totals.test.js app.js index.html
git commit -m "refactor(totals): extract computeLiveTotals + reps bodyweight comptées"
```

---

## Task 4 : `exercise-editor.js` — nouveau type dans l'éditeur d'activité

**Files:**
- Modify: `exercise-editor.js:41-42` (types/labels), `:44-67` (champs)

- [ ] **Step 1 : Ajouter le type et le label (ligne 41-42)**

Remplacer :

```javascript
const ACTIVITY_TYPES  = ['weight', 'countdown', 'stopwatch'];
const ACTIVITY_LABELS = { weight: 'Poids', countdown: 'Minuterie', stopwatch: 'Chrono' };
```

par :

```javascript
const ACTIVITY_TYPES  = ['weight', 'bodyweight', 'countdown', 'stopwatch'];
const ACTIVITY_LABELS = { weight: 'Poids', bodyweight: 'Poids corps', countdown: 'Minuterie', stopwatch: 'Chrono' };
```

- [ ] **Step 2 : Ajouter la branche de champs bodyweight dans `updateActivityFields` (ligne 44-67)**

Insérer une branche `bodyweight` juste après le bloc `if (type === 'weight') { ... }` (et avant `else if (type === 'countdown')`). Réutilise les classes `.activity-reps` / `.activity-weight` pour que `readExerciseCard` fonctionne sans changement. Placeholder `PdC` = poids de corps quand le lest est vide :

```javascript
  } else if (type === 'bodyweight') {
    fieldsDiv.innerHTML = `
      <div class="flex-1 flex items-baseline gap-2 border-b border-border focus-within:border-acid transition">
        <input type="number" inputmode="decimal" min="1" placeholder="0" value="${initial.reps ?? ''}"
          class="activity-reps ${_INPUT_NUM} text-center" />
        <span class="font-display font-bold text-acid text-[16px] shrink-0">×</span>
        <input type="number" inputmode="decimal" min="0" step="0.5" placeholder="PdC" value="${initial.weight ?? ''}"
          class="activity-weight ${_INPUT_NUM} text-center" />
        <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">lest</span>
      </div>`;
  } else if (type === 'countdown') {
```

(c.-à-d. la ligne `} else if (type === 'countdown') {` existante est désormais précédée de cette branche).

- [ ] **Step 3 : Vérification manuelle (mobile + backoffice)**

`readExerciseCard` (ligne 220-235) lit déjà `.activity-reps` et `.activity-weight` de façon générique → aucun changement.
Vérifier dans le navigateur (après Task 5/8 qui exposent l'éditeur) :
1. Créer un exo, cliquer le bouton type jusqu'à « Poids corps ».
2. Saisir reps `8`, lest vide → placeholder « PdC » visible.
3. Enregistrer, rouvrir l'éditeur → l'activité revient en type « Poids corps » avec reps `8`, lest vide.

- [ ] **Step 4 : Commit**

```bash
git add exercise-editor.js
git commit -m "feat(bodyweight): type Poids corps dans l'éditeur d'activité (reps × lest)"
```

---

## Task 5 : `app.js` — séance live (focus, préc, édition, repos, prefill éditeur mobile)

**Files:**
- Modify: `app.js:852-856` (init série), `:1279-1302` (focus + préc), `:1420-1427` (recap repos), `:1622` (modale édition), `:4834-4836` (prefill éditeur mobile)

- [ ] **Step 1 : Init des séries au lancement (ligne 852-856)**

Remplacer :

```javascript
              values: m.activities.map(act =>
                act.type === 'weight'
                  ? { reps: act.reps || 0, weight: act.weight || 0 }
                  : { duration: act.duration || 0 }
              ),
```

par :

```javascript
              values: m.activities.map(act =>
                (act.type === 'weight' || act.type === 'bodyweight')
                  ? { reps: act.reps || 0, weight: act.weight || 0 }
                  : { duration: act.duration || 0 }
              ),
```

- [ ] **Step 2 : Affichage des valeurs en focus série (ligne 1279-1291)**

Insérer une branche `bodyweight` après le bloc `if (act.type === 'weight') { ... }`. Le lest s'affiche `+Xkg`, ou `PdC` si lest = 0 :

```javascript
  } else if (act.type === 'bodyweight') {
    const reps = v.reps ?? act.reps ?? 0;
    const lest = v.weight ?? act.weight ?? 0;
    const lestLabel = lest > 0
      ? `+${lest}<span class="font-sans font-medium text-[14px] uppercase tracking-eyebrow text-racing/80 ml-2 align-baseline">kg</span>`
      : `PdC`;
    valuesHtml = `
      <span class="font-display font-black num-set-hot text-racing">× ${reps}</span>
      <span class="font-display font-bold text-[28px] num-stat text-paper pb-3">${lestLabel}</span>
    `;
  } else if (act.type === 'countdown') {
```

- [ ] **Step 3 : Texte « Préc » (ligne 1296-1302)**

Ajouter une branche `bodyweight` après le `if (act.type === 'weight' ...)` :

```javascript
  } else if (act.type === 'bodyweight' && (prevVal?.reps || prevVal?.weight)) {
    prevText = prevVal.weight > 0
      ? `Préc : ${prevVal.reps ?? '—'} × +${prevVal.weight}kg`
      : `Préc : ${prevVal.reps ?? '—'} × PdC`;
  } else if (act.type === 'countdown' && prevVal?.duration) {
```

- [ ] **Step 4 : Recap série dans la vue repos (ligne 1420-1427)**

Remplacer le `if (act.type === 'weight') { ... } else { ... }` par un `if / else if / else` :

```javascript
  if (act.type === 'weight') {
    valHtml = `
      <span class="font-display font-bold text-[26px] num-stat text-paper">${v.weight ?? 0}<span class="font-sans font-medium text-[11px] uppercase tracking-eyebrow text-muted ml-1.5 align-baseline">kg</span></span>
      <span class="font-display font-bold text-[18px] num-stat text-paper">× ${v.reps ?? 0}</span>
    `;
  } else if (act.type === 'bodyweight') {
    const lest = v.weight ?? 0;
    valHtml = `
      <span class="font-display font-bold text-[26px] num-stat text-paper">× ${v.reps ?? 0}</span>
      <span class="font-display font-bold text-[18px] num-stat text-paper">${lest > 0 ? `+${lest}<span class="font-sans font-medium text-[11px] uppercase tracking-eyebrow text-muted ml-1.5 align-baseline">kg</span>` : 'PdC'}</span>
    `;
  } else {
    valHtml = `<span class="font-display font-bold text-[26px] num-stat text-paper">${v.duration ?? 0}<span class="font-sans font-medium text-[11px] uppercase tracking-eyebrow text-muted ml-1.5 align-baseline">s</span></span>`;
  }
```

- [ ] **Step 5 : Modale d'édition live (ligne 1622)**

La modale `weight` (reps + poids + repos) convient pour bodyweight (reps + lest + repos). Élargir le garde et adapter le libellé/placeholder.

Remplacer `if (act.type === 'weight') {` (ligne 1622) par :

```javascript
  if (act.type === 'weight' || act.type === 'bodyweight') {
    const isBody = act.type === 'bodyweight';
```

Puis, dans le `bodyHTML` de ce bloc, remplacer le libellé `<p class="${labelCls}">Poids</p>` par :

```javascript
          <p class="${labelCls}">${isBody ? 'Lest' : 'Poids'}</p>
```

et l'unité `<span ...>kg</span>` adjacente à `.live-weight` par :

```javascript
            <span class="font-sans text-[10px] uppercase tracking-eyebrow text-muted shrink-0">${isBody ? 'kg lest' : 'kg'}</span>
```

(La logique `applyEdit` / `propagateLiveValue` reps+weight et la confirmation de réduction de charge restent valables : pour bodyweight elles agissent sur le lest, ce qui est cohérent.)

- [ ] **Step 6 : Prefill éditeur de programme mobile (ligne 4834-4836)**

Remplacer :

```javascript
            reps: act.type === 'weight' ? (act.reps ?? '') : '',
            weight: act.type === 'weight' ? (act.weight ?? '') : '',
            duration: act.type !== 'weight' ? (act.duration ?? '') : '',
```

par :

```javascript
            reps: (act.type === 'weight' || act.type === 'bodyweight') ? (act.reps ?? '') : '',
            weight: (act.type === 'weight' || act.type === 'bodyweight') ? (act.weight ?? '') : '',
            duration: (act.type !== 'weight' && act.type !== 'bodyweight') ? (act.duration ?? '') : '',
```

- [ ] **Step 7 : Vérification manuelle (séance live)**

Ouvrir l'app, lancer une séance avec un exo « Poids corps » (reps 8, lest 0 puis un autre lest 10) :
1. Focus série : affiche `× 8` + `PdC` (lest 0) ou `× 8` `+10kg`.
2. Valider une série → passe en repos, le bouton est « ✓ Valider » (pas minuterie/chrono).
3. Recap repos affiche `× 8 PdC`/`+10kg`, bouton « ✎ Modifier » présent.
4. Modifier → modale avec champ « Lest » (kg lest) + reps + repos ; OK applique.
5. Bandeau sticky : le compteur Reps augmente, le Tonnage/Volume **n'augmente pas** pour la série bodyweight.

- [ ] **Step 8 : Commit**

```bash
git add app.js
git commit -m "feat(bodyweight): rendu séance live (focus, préc, repos, modale, prefill)"
```

---

## Task 6 : `app.js` — détail séance / historique (openModal)

**Files:**
- Modify: `app.js:2995` (reps cumulés), `:3052-3056` (rendu série)

- [ ] **Step 1 : Reps cumulés incluent bodyweight (ligne 2993-2996)**

Remplacer :

```javascript
        return aa + (act.type === 'weight' && s.activityStates?.[j] === 'done' ? (v?.reps || 0) : 0);
```

par :

```javascript
        const counts = (act.type === 'weight' || act.type === 'bodyweight');
        return aa + (counts && s.activityStates?.[j] === 'done' ? (v?.reps || 0) : 0);
```

- [ ] **Step 2 : Rendu d'une ligne de série (ligne 3052-3056)**

Remplacer :

```javascript
              const isWeight = act.type === 'weight';
              const charge = isWeight
                ? `${v.weight ?? '—'}<span class="font-sans font-medium text-[10px] tracking-eyebrow text-muted ml-1.5">kg</span>`
                : `${v.duration ?? '—'}<span class="font-sans font-medium text-[10px] tracking-eyebrow text-muted ml-1.5">s</span>`;
              const second = isWeight ? `× ${v.reps ?? '—'}` : (act.label || act.name || '—');
```

par :

```javascript
              const isWeight = act.type === 'weight';
              const isBody   = act.type === 'bodyweight';
              let charge, second;
              if (isWeight) {
                charge = `${v.weight ?? '—'}<span class="font-sans font-medium text-[10px] tracking-eyebrow text-muted ml-1.5">kg</span>`;
                second = `× ${v.reps ?? '—'}`;
              } else if (isBody) {
                charge = `× ${v.reps ?? '—'}`;
                second = (v.weight > 0) ? `+${v.weight} kg` : 'PdC';
              } else {
                charge = `${v.duration ?? '—'}<span class="font-sans font-medium text-[10px] tracking-eyebrow text-muted ml-1.5">s</span>`;
                second = (act.label || act.name || '—');
              }
```

- [ ] **Step 3 : Vérification manuelle (historique)**

Terminer une séance contenant un exo bodyweight, l'ouvrir depuis l'onglet Historique :
1. Strip stats : Reps inclut les reps bodyweight ; Volume/Tonnage ne les comptent pas.
2. Lignes de l'exo bodyweight : `× 8` à gauche, `PdC` ou `+10 kg` à droite, repos à droite.

- [ ] **Step 4 : Commit**

```bash
git add app.js
git commit -m "feat(bodyweight): détail séance/historique affiche reps × lest"
```

---

## Task 7 : `lib/feedback-payload.js` (NOUVEAU) + prompt IA

**Files:**
- Create: `lib/feedback-payload.js`
- Create: `tests/feedback-payload.test.js`
- Modify: `app.js:3449-3454` (utiliser le helper), `:3172-3182` (COACH_PROMPT), `index.html` (charger le script)

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/feedback-payload.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
const { serializeActivityForFeedback } = require('../lib/feedback-payload.js');

describe('serializeActivityForFeedback', () => {
  it('weight → reps + kg', () => {
    expect(serializeActivityForFeedback({ type: 'weight' }, { reps: 10, weight: 50 }))
      .toEqual({ reps: 10, kg: 50 });
  });

  it('bodyweight → reps + lest_kg', () => {
    expect(serializeActivityForFeedback({ type: 'bodyweight' }, { reps: 8, weight: 10 }))
      .toEqual({ reps: 8, lest_kg: 10 });
  });

  it('bodyweight without lest → lest_kg 0', () => {
    expect(serializeActivityForFeedback({ type: 'bodyweight' }, { reps: 12 }))
      .toEqual({ reps: 12, lest_kg: 0 });
  });

  it('countdown/stopwatch → duree_s', () => {
    expect(serializeActivityForFeedback({ type: 'countdown' }, { duration: 45 }))
      .toEqual({ duree_s: 45 });
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npx vitest run tests/feedback-payload.test.js`
Expected: FAIL — `Cannot find module '../lib/feedback-payload.js'`.

- [ ] **Step 3 : Créer `lib/feedback-payload.js`**

```javascript
/* ═══════════════════════════════════════════════════════
   FEEDBACK PAYLOAD — sérialise une activité d'une série
   pour le prompt IA post-séance.
   weight     → { reps, kg }
   bodyweight → { reps, lest_kg }   (lest, pas du tonnage)
   autre      → { duree_s }
═══════════════════════════════════════════════════════ */

function serializeActivityForFeedback(act, v) {
  v = v || {};
  if (act.type === 'weight')     return { reps: v.reps || 0, kg: v.weight || 0 };
  if (act.type === 'bodyweight') return { reps: v.reps || 0, lest_kg: v.weight || 0 };
  return { duree_s: v.duration || 0 };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { serializeActivityForFeedback };
}
if (typeof window !== 'undefined') {
  window.serializeActivityForFeedback = serializeActivityForFeedback;
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npx vitest run tests/feedback-payload.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5 : Utiliser le helper dans `app.js` (ligne 3449-3454)**

Remplacer :

```javascript
          e.activities.map((act, i) => {
            const v = s.values?.[i] || {};
            return act.type === 'weight'
              ? { reps: v.reps || 0, kg: v.weight || 0 }
              : { duree_s: v.duration || 0 };
          })
```

par :

```javascript
          e.activities.map((act, i) => serializeActivityForFeedback(act, s.values?.[i]))
```

- [ ] **Step 6 : Mettre à jour `COACH_PROMPT` (ligne 3178, partie « 1. Progression »)**

Ajouter, à la fin du paragraphe « 1. Progression » (juste avant le `\n\n2.`), la phrase :

```
 Pour les exercices au poids du corps (champ lest_kg), juge la progression sur le nombre de reps (et sur le lest s'il augmente), jamais sur le tonnage — il n'y a pas de charge machine.
```

Concrètement, dans la template literal, la ligne se terminant par `…sur la densité.` devient `…sur la densité. Pour les exercices au poids du corps (champ lest_kg), juge la progression sur le nombre de reps (et sur le lest s'il augmente), jamais sur le tonnage — il n'y a pas de charge machine.`

- [ ] **Step 7 : Charger le script dans `index.html`**

Ajouter, à côté des autres `lib/*.js`, avant `app.js` :

```html
<script src="lib/feedback-payload.js"></script>
```

Confirmer : `grep -n "lib/feedback-payload.js" index.html`.

- [ ] **Step 8 : Lancer toute la suite + commit**

Run: `npx vitest run`
Expected: PASS (toute la suite).

```bash
git add lib/feedback-payload.js tests/feedback-payload.test.js app.js index.html
git commit -m "feat(bodyweight): payload IA reps+lest_kg + consigne prompt coach"
```

---

## Task 8 : `backoffice.js` — catalogue + éditeur de programme coach

**Files:**
- Modify: `backoffice.js:520-525` (option type catalogue), `:726-728` et `:757-762` (éditeur programme)
- Vérifier: `backoffice.html` charge déjà `exercise-editor.js` (réutilisé)

- [ ] **Step 1 : Option « Poids du corps » dans le formulaire catalogue (ligne 521-525)**

Remplacer le `<select id="cf-acttype">` :

```javascript
    <select id="cf-acttype" class="w-full bg-transparent border border-border text-paper py-1 px-2 text-[12px] mb-2">
      <option value="weight"    ${(existing?.default_activities?.[0]?.type === 'weight'    || !existing) ? 'selected' : ''}>Poids</option>
      <option value="bodyweight" ${ existing?.default_activities?.[0]?.type === 'bodyweight' ? 'selected' : ''}>Poids du corps</option>
      <option value="countdown" ${ existing?.default_activities?.[0]?.type === 'countdown' ? 'selected' : ''}>Minuterie</option>
      <option value="stopwatch" ${ existing?.default_activities?.[0]?.type === 'stopwatch' ? 'selected' : ''}>Chrono</option>
    </select>
```

(La sauvegarde `default_activities = [{ type: acttype }]` ligne 553 fonctionne telle quelle — aucun changement.)

- [ ] **Step 2 : Prefill de la carte exo dans l'éditeur coach (ligne 726-728)**

Remplacer :

```javascript
        reps:     a.type === 'weight'    ? (v.reps     ?? '') : '',
        weight:   a.type === 'weight'    ? (v.weight   ?? '') : '',
        duration: a.type === 'countdown' ? (v.duration ?? a.duration ?? '') : '',
```

par :

```javascript
        reps:     (a.type === 'weight' || a.type === 'bodyweight') ? (v.reps   ?? '') : '',
        weight:   (a.type === 'weight' || a.type === 'bodyweight') ? (v.weight ?? '') : '',
        duration: a.type === 'countdown' ? (v.duration ?? a.duration ?? '') : '',
```

- [ ] **Step 3 : Construction des séries au save coach (ligne 757-762)**

Remplacer :

```javascript
        values: readBack.activities.map(a =>
          a.type === 'weight'
            ? { reps: parseInt(a.reps, 10) || 0, weight: parseFloat(a.weight) || 0 }
            : a.type === 'countdown'
              ? { duration: parseInt(a.duration, 10) || 0 }
              : {}),
```

par :

```javascript
        values: readBack.activities.map(a =>
          (a.type === 'weight' || a.type === 'bodyweight')
            ? { reps: parseInt(a.reps, 10) || 0, weight: parseFloat(a.weight) || 0 }
            : a.type === 'countdown'
              ? { duration: parseInt(a.duration, 10) || 0 }
              : {}),
```

- [ ] **Step 4 : Vérification manuelle (backoffice)**

Ouvrir le backoffice sur PC :
1. Catalogue → Nouvel exo → type « Poids du corps » → Créer. Rouvrir : le type est bien « Poids du corps ».
2. Glisser cet exo dans un programme, ouvrir la modale d'édition : activité en type « Poids corps », reps + lest éditables.
3. Enregistrer le programme, recharger : l'exo bodyweight persiste avec reps + lest.

- [ ] **Step 5 : Commit**

```bash
git add backoffice.js
git commit -m "feat(bodyweight): catalogue + éditeur programme coach gèrent Poids du corps"
```

---

## Task 9 : Vérification finale end-to-end

- [ ] **Step 1 : Suite de tests complète verte**

Run: `npx vitest run`
Expected: PASS — tous les fichiers, anciens + nouveaux (`programme-from-catalog`, `prefill-series`, `session-totals`, `feedback-payload`).

- [ ] **Step 2 : Smoke test parcours complet**

Backoffice (PC) : créer un programme « fonte » avec 1 exo bodyweight (Tractions, 4 séries, reps 8, lest 0) + 1 exo weight. Assigner au client.
Mobile (app) :
1. Lancer la séance → l'exo bodyweight affiche `× 8` / `PdC` en focus.
2. Valider les séries (reps modifiées, lest 10 sur une) → repos OK, modale lest OK.
3. Bandeau : Reps grimpe avec bodyweight ; Volume/Tonnage uniquement avec l'exo weight.
4. Terminer la séance.
5. Historique → détail : Reps cumulés incluent bodyweight, Tonnage non ; lignes `× 8` / `PdC`/`+10 kg`.
6. Si une clé API IA est configurée : déclencher le feedback, vérifier qu'il commente la progression reps de l'exo bodyweight sans inventer de tonnage.

- [ ] **Step 3 : Finaliser la branche**

Utiliser le skill `push` (devLionel → merge main → push main, cf. mémoire projet).

---

## Self-review (couverture spec)

| Exigence spec | Task |
|---|---|
| Type `bodyweight` reps + lest | Task 4 (éditeur), Task 8 (coach) |
| Forme `{reps, weight}`, weight = lest | Tasks 1-8 (réutilisation) |
| Volume kg exclu | Task 3 (computeLiveTotals), Task 6 (historique) — totalVolume/plannedVolume inchangés (déjà `!== 'weight'`) |
| Reps incluses | Task 3, Task 6 |
| Lest 0 → « PdC », >0 → « +Xkg » | Task 5, Task 6 |
| Catalogue bodyweight (jsonb) | Task 8 step 1 |
| Prompt IA reps + lest | Task 7 |
| Prefill prev | Task 2 |
| Init / catalogue / ensureSeries | Tasks 1, 3, 5 |

Hors scope confirmé : remap legacy `calisthenics→countdown` inchangé ; pas de volume kg via poids de corps réel.
```
