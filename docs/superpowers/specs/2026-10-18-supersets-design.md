# Super sets — conception (phase 1 : logique pure)

Date : 2026-10-18 · Exécutant : micky-supersets

## Pourquoi

Lionel a validé la maquette super sets (« Validée ») et a dit « oui, on fait ça » à son implémentation.
Références qui font foi :

- `designs/supersets/NOTES.md` : règles métier tranchées par Lionel (tableau « Règles métier »), vocabulaire, écrans.
- `designs/supersets/supersets.html` : maquette validée, 7 écrans + variante 02b.

Le chantier est coupé en deux :

- **Phase 1 (ce document)** : modèle de données et toute la logique pure, en TDD, dans `lib/`. Aucun écran.
- **Phase 2** : branchement dans `app.js`, `exercise-editor.js`, `backoffice.*`, `supabase.js` et écrans, après la
  fusion du lot « séance live » de micky-look-carnet (qui réserve ces fichiers).

## Règles métier (rappel, non rediscutées)

| Sujet | Règle |
|---|---|
| Taille | 2 à 4 exercices |
| Repos | **transition** réglable entre deux exercices du tour + **repos de tour** après le dernier |
| Tours | nombre de tours unique par groupe ; par défaut le plus grand nombre de séries des exercices groupés |
| Création | éditeur de programme ET séance live (case « Garder dans le programme ») |
| En séance | seulement les exercices pas commencés |
| Transition | toujours un écran « Va au poste suivant » à valider, même à 0 s |
| Écrans | mobile + back-office PC |

Ordre de passage : A1 B1 A2 B2 … (un **tour** = un passage A → B → …).

## Modèle de données

### Programme (`programmes.exercises`, jsonb)

Chaque membre d'un groupe porte le même objet `group` :

```json
{ "name": "Développé couché", "activities": [...], "sets": 4, "series": [...],
  "group": { "id": "g1", "rounds": 4, "transition": 15, "roundRest": 90 } }
```

- Les membres d'un groupe sont **contigus** dans le tableau ; leur ordre est l'ordre A, B, C, D.
- `rounds` = nombre de tours ; chaque membre a `sets === rounds` et `series.length === rounds`
  (les séries sont complétées en recopiant la dernière, ou tronquées : règle existante `plannedSeries`).
- `transition`, `roundRest` en secondes.
- Le `rest` de chaque activité n'est **pas modifié** par le groupage : il sert entre deux activités d'une même série
  (exercice multi-activités) et redevient le repos normal au dégroupage.
- **Rétrocompatible** : un exercice sans `group` se lit exactement comme aujourd'hui. Aucune migration.
- Lecture tolérante (`exerciseBlocks`) : une suite contiguë de même `group.id` forme un groupe, réglages lus sur le
  premier membre ; un membre isolé (suite de longueur 1) se lit comme un exercice simple.
- Identifiant : plus petit `gN` libre dans le programme (déterministe, testable).

Valeurs par défaut à la création : transition **15 s**, repos de tour **90 s** (les exemples de Lionel, repris par la
maquette : « ex. 15 s pour changer de poste », « 1 min 30 »).

### Séance (`session_exercises`)

Le groupe est copié dans `execution.group` (jsonb existant) : **aucune colonne, aucune migration**.
`recomposeExercise` le relit dans `ex.group` ; `restoreLiveExercises` le conserve à la reprise.
L'ordre (`ordre`) suit l'ordre du tableau, membres contigus.

Historique, PR, `prevSeries` restent indexés par exercice (nom normalisé) : inchangés.

## Logique pure (fichiers)

### `lib/supersets.js` — modèle et édition (programme et séance)

| Fonction | Rôle |
|---|---|
| `exerciseBlocks(exercises)` | découpe en blocs `{ kind: 'single', indices }` / `{ kind: 'group', id, indices, rounds, transition, roundRest }` |
| `defaultSupersetRounds(members)` | plus grand nombre de séries planifiées (≥ 1) |
| `supersetOrder(length, indices)` | permutation : les membres choisis, dans l'ordre choisi, prennent la place du plus petit indice |
| `groupExercises(exercises, indices, settings?)` | crée un groupe ; refuse (throw) taille hors 2–4, doublon, indice hors bornes, exercice cardio ou déjà groupé |
| `ungroupSuperset(exercises, groupId)` | retire `group` des membres (séries conservées) |
| `setGroupSettings(exercises, groupId, patch)` | règle tours / transition / repos de tour sur tous les membres ; tours → séries redimensionnées |
| `linkNextExercise(exercises, index)` | « Lier au suivant » : fusionne le bloc de `index` et le bloc suivant (≤ 4) ; un groupe existant garde ses réglages |
| `moveExerciseBlock(exercises, index, dir)` | déplace d'un cran le bloc entier (le groupe bouge d'un bloc) |
| `moveWithinSuperset(exercises, index, dir)` | ↑↓ à l'intérieur du groupe ; sans effet au bord |
| `dropExerciseOnto(exercises, from, onto)` | back-office : déposer **sur** un exercice forme ou agrandit son groupe (en fin de groupe) |
| `removeExerciseKeepingGroups(exercises, index)` | suppression ; un groupe réduit à 1 membre est dissous |
| `supersetMemberLetter(position)` | `'A'`…`'D'` |

Toutes ces fonctions sont **pures** : elles rendent un nouveau tableau et ne modifient pas l'entrée.

Elles servent aussi à la séance live (mêmes exercices, séries avec `activityStates`) : un exercice non commencé n'a
aucun état, le redimensionnement par `plannedSeries` est donc sans perte.

### `lib/superset-flow.js` — déroulé de la séance live

| Fonction | Rôle |
|---|---|
| `isExerciseStarted(ex)` | au moins une activité `done` (cardio : état ≠ `pending`) |
| `groupableLiveIndices(exercises)` | exercices fonte, non commencés, non groupés |
| `canGroupLive(exercises, indices)` | 2 à 4 indices distincts, tous groupables |
| `nextUndoneInBlock(exercises, exIdx)` | première étape non faite du bloc ; groupe : tour par tour, A puis B (A1 B1 A2 B2) ; remplace `nextUndoneActivity` |
| `nextLiveStep(exercises, done)` | après validation de `done = { exIdx, sIdx, actIdx }` : `{ next, pause }` |
| `supersetProgress(exercises, exIdx)` | `{ roundsDone, rounds }` pour le compteur « en tours » de la liste |

Règle de `pause` :

- `next` nul (bloc fini) → `pause` nulle (retour à la liste, comme aujourd'hui).
- même exercice, même série (activité suivante) ou exercice simple → `{ kind: 'rest', seconds: activité.rest }`
  (comportement actuel inchangé).
- groupe, même tour → `{ kind: 'transition', seconds: group.transition, confirm: true }` : l'écran « Va au poste
  suivant » est **toujours** affiché et validé, même à 0 s.
- groupe, tour suivant → `{ kind: 'roundRest', seconds: group.roundRest }`.

Tolérance : si les membres n'ont pas tous `rounds` séries (donnée incohérente), le parcours va jusqu'à la plus longue
et saute les séries absentes.

### `lib/duration-estimate.js` — estimation

- Exercice simple : inchangé (moyenne historique, sinon 45 s par série + repos).
- Groupe : toujours le calcul planifié, la moyenne historique est **ignorée** pour ses membres (en séance groupée, les
  durées mesurées des membres se chevauchent ; les additionner compterait deux fois). Par tour : pour chaque membre,
  chaque activité (travail planifié — durée du décompte, sinon 45 s — + `rest` entre activités), puis transition
  après chaque membre sauf le dernier, repos de tour après le dernier.

  Exemple : A et B, 1 activité « poids » chacun, 4 tours, transition 15 s, repos de tour 90 s →
  4 × (45 + 15 + 45 + 90) = 780 s.

### `lib/live-resume.js`, `lib/recompose-session.js`

- `restoreLiveExercises` conserve `group`.
- `recomposeExercise` relit `execution.group` dans `ex.group` (absent → pas de champ).

## Points pour la phase 2 (notés, pas faits)

1. `startSession` : copier `group` du programme ; `liveSessionSnapshot` et `pushSession` : écrire `group`
   (`execution.group`).
2. Clic sur une entrée de liste et `completeFocusedActivity` : `nextUndoneInBlock` / `nextLiveStep` à la place de
   `nextUndoneActivity`.
3. **Correspondance séance ↔ programme** : grouper en séance réordonne la séance (`supersetOrder`).
   `updateProgrammeTemplate(exIdx, …)` suppose aujourd'hui que l'indice de séance = indice de programme. Avec
   « Garder dans le programme », appliquer la même opération (mêmes indices) au programme garde l'alignement ;
   sans, il faut porter la permutation (ou un indice programme par exercice de séance).
4. Durées réelles `exoDurations` des membres d'un groupe : elles se chevauchent ; voir si on les garde pour la
   moyenne historique (`loadAvgExerciseDurationsDB`) ou si on les exclut.
5. Back-office : un exercice déposé **entre** deux membres d'un groupe casserait la contiguïté ; l'insertion doit se
   faire avant ou après le groupe, ou passer par `dropExerciseOnto`.
6. `migrateExercise` (exercices très anciens sans `activities`) ne recopie pas `group` : un exercice groupé a
   forcément été réenregistré au format actuel, à vérifier au branchement.
7. Charger `lib/supersets.js` et `lib/superset-flow.js` dans `index.html` / `backoffice.html` (le test
   `browser-scripts` vérifie déjà l'absence de collision de noms globaux).

## Hors périmètre phase 1

Écrans, `app.js`, `index.html`, `style.css`, `src/`, `tailwind.config.js`, `backoffice.*`, `exercise-editor.js`.
`CACHE_NAME` (service-worker.js) est incrémenté : `live-resume.js`, `recompose-session.js` et
`duration-estimate.js` sont des assets en cache de l'app, même si leur comportement est inchangé sans `group`.
