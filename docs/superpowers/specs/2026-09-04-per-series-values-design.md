# Valeurs planifiées par série (reps / poids / durée)

Date : 2026-09-04
Statut : design validé

## Objectif

Permettre de planifier des valeurs **différentes d'une série à l'autre** pour un
exercice (ex. 10-10-8-8 reps, ou pyramide de charge), depuis l'éditeur de
programme (backoffice coach **et** mobile), et faire en sorte que le mobile les
respecte en séance live.

## Constat (bug existant)

Deux sources de valeurs planifiées coexistent et divergent :

| Source | Écrite par | Lue par |
|---|---|---|
| `activities[j].reps / weight / duration` | modifs live (`updateProgrammeTemplate`), éditeur mobile | **mobile `startSession`** (app.js:844) |
| `series[i].values[j]` | éditeur backoffice, `buildProgrammeExerciseFromCatalog` | résumé card backoffice, éditeur backoffice (série 0 seulement) |

Conséquences :
- L'éditeur backoffice n'offre qu'une valeur par activité, dupliquée sur toutes les séries à l'enregistrement (`backoffice.js:756`).
- Le mobile ignore `series[]` du programme : une valeur saisie par série côté coach ne sert à rien.
- Exemple réel : « Semaine 1 - Cuisses/Fessiers » / Hack squat : `series` = 10×40 partout, `activities` = 8×57.6 (dernière modif live du 01/09). La prochaine séance mobile partirait à 8×57.6 sur les 4 séries.

## Décisions

| Sujet | Décision |
|---|---|
| Source de vérité | **`series[i].values[j]`** pour reps / weight / duration planifiés. `activities[j].reps/weight/duration` ne sont plus écrits ; lus uniquement en fallback legacy. |
| Champs par série | reps, weight (type `weight`) ; duration (type `countdown`) ; rien (`stopwatch`). Traitement uniforme : tout ce qui est une *valeur* est par série. |
| Repos | Reste par **activité** (`activities[j].rest`). Pas par série. |
| Éditeur | **Une ligne par série** dans chaque activité, nombre de lignes piloté par le champ « Séries ». Remplissage intelligent vers le bas (règle ci-dessous). |
| Miroir live → programme | **Oui, par série** : une modif live réécrit les valeurs planifiées des séries concernées (mêmes index que la propagation live). |
| Migration data | Pas de migration de schéma (normalisation à la lecture). Script SQL one-shot pour les 4 programmes « Semaine 1 » : `series` := dernière exécution (voir § Migration). |
| Résumé card backoffice | « 4 × 10 · 40 kg » si uniforme, sinon « 10/10/8/8 × 40 kg » ; poids variable « 40/40/45/45 kg ». |

### Hors scope
- Repos par série.
- Ajout / suppression de série pendant la séance live.
- Régénération du PDF `programme-poids.pdf` (script ad hoc hors repo).

## Modèle de données

Inchangé dans sa forme, seule la **sémantique** est fixée :

```json
{
  "name": "Hack squat",
  "sets": 4,
  "activities": [ { "type": "weight", "name": "Quadriceps", "label": "", "rest": 120 } ],
  "series": [
    { "activityStates": {}, "values": [ { "reps": 10, "weight": 40 } ] },
    { "activityStates": {}, "values": [ { "reps": 10, "weight": 40 } ] },
    { "activityStates": {}, "values": [ { "reps": 8,  "weight": 40 } ] },
    { "activityStates": {}, "values": [ { "reps": 8,  "weight": 40 } ] }
  ]
}
```

- `series.length === sets` après normalisation.
- `activities[j]` ne porte plus `reps` / `weight` / `duration` dans les nouveaux enregistrements. Les anciens programmes qui les portent encore sont normalisés à la lecture.

## Règles métier — source unique : `lib/planned-series.js` (NOUVEAU)

Module pur (Node + browser, même convention d'export que `lib/prefill-series.js`).

### `plannedSeries(ex) → series[]`
Normalise les valeurs planifiées d'un exercice de programme :
1. Si `ex.series` non vide → point de départ. Sinon → construit depuis `activities[j].reps/weight/duration` (legacy, reprend `ensureSeries`).
2. Ajuste la longueur à `ex.sets` (défaut : longueur des series, sinon 4) : complète en **copiant la dernière série**, ou tronque.
3. Chaque valeur est complétée avec le blanc du type (`{reps:0, weight:0}`, `{duration:0}`, `{}`) si une clé manque.
4. Retourne toujours un **nouveau tableau** (`activityStates: {}`), sans muter `ex`.

Remplace `ensureSeries` de `lib/programme-from-catalog.js` (supprimé, un seul appelant : `backoffice.js:357`).

### `fillDown(values, idx, field, newVal) → values`
Règle de remplissage intelligent de l'éditeur. `values` = tableau des valeurs d'**une** activité, une entrée par série.
- `old = values[idx][field]` ; `values[idx][field] = newVal`.
- Pour `j > idx`, **tant que** `values[j][field] === old` (bloc contigu) → `values[j][field] = newVal`. S'arrête à la première ligne différente.
- Exemples : `10,10,10,10` + ligne 3 → 8 ⇒ `10,10,8,8`. Puis ligne 1 → 12 ⇒ `12,12,8,8`. `10,10,8,10` + ligne 1 → 12 ⇒ `12,12,8,10`.
- Mutation en place, retourne `values` (pratique pour le DOM).

### `resizeValues(values, n, blank) → values`
Passe un tableau de valeurs d'activité à `n` entrées : complète par copie de la dernière (ou `blank` si vide), ou tronque. Utilisé par `plannedSeries` et par l'éditeur quand « Séries » change.

### `formatSeriesSummary(ex) → string`
Résumé texte pour la card programme backoffice, à partir de `plannedSeries(ex)` et de la première activité :
- `weight` : reps uniformes et poids uniformes → `4 × 10 · 40 kg` ; sinon reps listés `10/10/8/8` et poids `40 kg` ou `40/40/45/45 kg` selon uniformité → `10/10/8/8 × 40 kg`.
- `countdown` : `4 × 45 s` ou `45/45/60/60 s`.
- `stopwatch` / inconnu : `4 × —`.
- Le suffixe repos (` · repos 120s`) reste géré par l'appelant.

## Composants impactés

### 1. `exercise-editor.js` — éditeur partagé
- `makeExerciseCard({ name, sets, activities, series, comment })` : nouveau paramètre `series` (forme programme). Si absent → valeurs blanches.
- `makeActivityRow({ ..., values })` : `values` = tableau par série pour cette activité. `updateActivityFields(row, type, values)` rend **une ligne par série** : `NN  [reps] × [kg] kg` (weight), `NN  [durée] s` (countdown), rien (stopwatch). Numéro `01…` en eyebrow.
- Saisie : `input` sur une ligne → `fillDown` sur les lignes suivantes (mise à jour DOM). Le champ « Séries » → `resizeValues` sur chaque activité et re-rendu des lignes.
- Changement de type d'activité → valeurs blanches du nouveau type sur toutes les séries.
- `readExerciseCard(card)` renvoie `{ name, sets, activities: [{ type, label, name, rest }], series: [{ activityStates: {}, values: [...] }], comment }`. Les champs vides → 0 (comportement actuel `parseInt || 0`).
- `migrateExercise` (ancien format `count`/`type: calisthenics`) : inchangé.

### 2. `backoffice.js`
- `:357` : `ensureSeries` → `plannedSeries` (garde `sets` et `series` cohérents au chargement).
- Modal d'édition (`:717`) : seed `series: plannedSeries(seed)` ; `activities` sans reps/weight/duration.
- Enregistrement (`:741-765`) : `exo = { ...readBack, normalized_name, category }` — plus de reconstruction de `series`, plus de `duration` sur activity.
- `makeProgrammeCard` (`:649-658`) : libellé via `formatSeriesSummary(ex)`.
- `buildProgrammeExerciseFromCatalog` : déjà par série (prev execution) — inchangé.

### 3. `app.js` — mobile
- `startSession` (`:844-854`) : `series: plannedSeries(ex)` au lieu de la construction depuis `activities`. `sets` = longueur obtenue.
- `propagateLiveValue` (`:1983`) : renvoie les index de séries modifiés ; appelle `updateProgrammeTemplateSeries(exIdx, actIdx, field, val, indices)`.
- `updateProgrammeTemplateSeries` (nouveau, même file d'attente `programmeTemplateQueue`) : normalise `prog.exercises[exIdx].series` via `plannedSeries` puis écrit `series[j].values[actIdx][field] = val` pour chaque `j` de `indices`.
- `updateProgrammeTemplate` : conservé **uniquement** pour `rest` (niveau activité). Les appels pour reps/weight/duration passent par le miroir par série.
- Édition countdown live (`:1713-1723`) : même miroir par série pour `duration`.
- Éditeur mobile `fillExercises` (`:4829-4843`) : seed `series: plannedSeries(m)`, activities sans valeurs. `saveProgrammeFromEditor` (`:4868-4885`) : utilise `readExerciseCard` tel quel (inclut `series`).

### 4. `lib/duration-estimate.js`
Countdown : somme des durées par série depuis `plannedSeries(ex)` (`values[j].duration`, fallback `act.duration` legacy) + `rest` par série, au lieu de `sets × (act.duration + rest)`. Weight / stopwatch : inchangé.

### 5. `lib/programme-from-catalog.js`
Suppression de `ensureSeries` (remplacé). `buildProgrammeExerciseFromCatalog` inchangé.

## Migration des données existantes

- **Runtime** : aucune migration de schéma. `plannedSeries` absorbe les programmes legacy (sans `series`, ou `series.length ≠ sets`).
- **One-shot SQL (au déploiement)** pour les 4 programmes « Semaine 1 - … » : pour chaque exercice ayant une exécution dans `session_exercises` (dernière séance par `normalized_name`), `series[i].values` := valeurs exécutées (`reps`, `weight`, `duration` seulement), longueur = `sets`. Exercices sans exécution → inchangés. Le diff avant/après est affiché avant exécution ; exécution via `mcp__supabase__execute_sql`.
- Effet attendu : Hack squat → `10/10/8/8 × 47.6/47.6/57.6/57.6`.

## Tests (vitest, env node)

`tests/planned-series.test.js` :
- `plannedSeries` : series gagne sur activities ; construit depuis activities si absent ; complète à `sets` par copie de la dernière ; tronque ; complète les clés manquantes ; ne mute pas l'entrée.
- `fillDown` : bloc contigu suit ; s'arrête à la première valeur différente ; ligne modifiée seule si la suivante diffère.
- `resizeValues` : agrandit par copie ; tronque ; part de `blank` si vide.
- `formatSeriesSummary` : uniforme ; reps variables ; poids variables ; countdown ; stopwatch.

`tests/duration-estimate.test.js` : cas countdown à durées par série différentes ; legacy `act.duration` sans series.

DOM (`exercise-editor.js`), `app.js`, `backoffice.js` : vérification manuelle (mobile + backoffice), comme pour le plan bodyweight. Scénario de référence : créer un exo 4 séries, taper 10 ligne 1 (tout suit), 8 ligne 3 (3 et 4 suivent), enregistrer, rouvrir → 10/10/8/8 ; lancer la séance mobile → 10/10/8/8 ; modifier série 2 en live → programme mis à jour sur 2, 3, 4.

## Interaction avec le plan « poids du corps » (2026-05-31)

Le plan bodyweight touche `updateActivityFields`, `startSession`, `propagateLiveValue` et l'éditeur backoffice. **Ce design passe en premier** ; le plan bodyweight sera rebasé ensuite : sa branche `bodyweight` dans l'éditeur devient une variante de la ligne par série (`[reps] × [lest]`), le reste est inchangé.
