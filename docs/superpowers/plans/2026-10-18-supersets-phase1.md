# Super sets — plan phase 1 (logique pure)

Spec : `docs/superpowers/specs/2026-10-18-supersets-design.md`.
Branche `feat/supersets-logique` depuis `origin/main` (ed82038). Base : 109 tests verts.

Méthode : TDD strict (vitest, `tests/`), un test = un comportement, AAA, rouge vu avant le vert.
Fichiers à NE PAS toucher : `app.js`, `index.html`, `style.css`, `src/`, `tailwind.config.js`, `backoffice.*`,
`exercise-editor.js`, `supabase.js`.

Conventions des `lib/` existants : script classique (pas d'ESM), `module.exports` pour vitest + `window.*` pour le
navigateur, commentaires en anglais, aucune constante globale qui collisionne avec un autre `lib/` (préfixer
`SUPERSET_`). Dépendance à `plannedSeries` : même motif que `_plannedSeriesOf` de `lib/duration-estimate.js`.

## Tâche 1 — `lib/supersets.js` + `tests/supersets.test.js`

Constantes : `SUPERSET_MIN_SIZE = 2`, `SUPERSET_MAX_SIZE = 4`, `SUPERSET_DEFAULT_TRANSITION = 15`,
`SUPERSET_DEFAULT_ROUND_REST = 90`, `SUPERSET_SETTING_KEYS = ['rounds', 'transition', 'roundRest']`.

Tests (un par ligne) :

- `exerciseBlocks` : programme sans groupe → un bloc `single` par exercice ; deux membres contigus de même id → un
  bloc `group` avec indices et réglages du premier membre ; membre isolé → `single` ; deux suites non contiguës de
  même id → deux blocs distincts ; tableau vide → `[]`.
- `defaultSupersetRounds` : max des séries planifiées (3 et 4 → 4) ; exercice sans séries ni `sets` → valeur de
  `plannedSeries` (4).
- `isGroupSize` : 2 et 4 → vrai ; 1 et 5 → faux (règle partagée avec `canGroupLive`).
- `supersetOrder` : `(5, [3, 1])` → `[0, 3, 1, 2, 4]` ; `(3, [0, 1])` → identité.
- `groupExercises` : membres placés à la place du plus petit indice dans l'ordre choisi ; chaque membre porte
  `{ id: 'g1', rounds, transition: 15, roundRest: 90 }` par défaut ; réglages passés écrasent les défauts ; tours
  par défaut = max des séries ; séries du membre plus court complétées par recopie de la dernière, `sets` = tours ;
  id = plus petit `gN` libre (`g1` pris → `g2`) ; n'altère pas le tableau d'entrée ; throw si 1 indice, 5 indices,
  doublon, indice hors bornes, exercice cardio, exercice déjà groupé.
- `ungroupSuperset` : retire `group` des seuls membres de cet id ; séries conservées.
- `setGroupSettings` : transition / repos de tour appliqués à tous les membres ; changer `rounds` redimensionne
  `series` et `sets` de chaque membre.
- `linkNextExercise` : simple + simple → nouveau groupe (défauts) ; groupe + simple → le simple rejoint le groupe avec ses
  réglages (séries redimensionnées) ; simple + groupe → idem, le simple devient A ; groupe + groupe → fusion avec les
  réglages du premier ; throw si le total dépasse 4 ; throw sur le dernier bloc.
- `moveExerciseBlock` : un simple descend sous un groupe de 2 (le groupe remonte d'un bloc entier) ; un groupe monte au-dessus
  d'un simple ; sans effet au bord.
- `moveWithinSuperset` : échange avec le voisin du même groupe ; sans effet au bord du groupe.
- `dropExerciseOnto` : simple sur simple → groupe [cible, déposé] ; simple sur membre → ajouté en fin de groupe ; membre d'un
  groupe de 2 déposé sur un simple → l'ancien groupe est dissous ; throw si le groupe cible a déjà 4 membres ;
  `from === onto` → inchangé.
- `removeExerciseKeepingGroups` : retire l'exercice ; groupe ramené à 1 membre → dissous ; groupe de 3 → reste groupé à 2.
- `supersetMemberLetter` : 0 → `'A'`, 3 → `'D'`.

## Tâche 2 — `lib/superset-flow.js` + `tests/superset-flow.test.js`

Données de test : exercices de séance `{ name, activities: [{ type: 'weight', rest }], series: [{ activityStates,
values }], group? }`.

- `isExerciseStarted` : aucune activité faite → false ; une faite → true ; cardio `pending` → false, `done` → true.
- `groupableLiveIndices` : exclut commencés, cardio, déjà groupés.
- `canGroupLive` : 2 groupables → true ; 1 ou 5 → false ; un commencé → false ; doublon → false.
- `nextUndoneInBlock` : simple → équivalent de `nextUndoneActivity` (série puis activité) ; groupe A/B sur 2 tours,
  rien de fait → A1 ; A1 fait → B1 ; A1 B1 faits → A2 ; tout fait → null ; appelé avec l'indice de B, renvoie aussi
  A1 ; membre plus court (incohérent) → série absente sautée.
- `nextLiveStep` : simple → `{ kind: 'rest', seconds: rest }` vers la série suivante ; simple fini → `{ next: null,
  pause: null }` ; groupe A1 → B1 avec `{ kind: 'transition', seconds: 15, confirm: true }` ; transition à 0 s →
  toujours `confirm: true`, seconds 0 ; B1 → A2 avec `{ kind: 'roundRest', seconds: 90 }` ; dernier B → null ;
  membre multi-activités : activité 1 → activité 2 de la même série = `rest` de l'activité.
- `supersetProgress` : 0 tour fini ; A1 seul → 0 ; A1 B1 → 1 ; tout → `rounds`.

## Tâche 3 — `lib/live-resume.js`, `lib/recompose-session.js`

- `restoreLiveExercises` : un exercice fonte avec `group` le garde ; sans `group` → pas de clé `group` (les tests
  existants avec `toEqual` restent verts).
- `recomposeExercise` : `execution.group` → `ex.group` ; sans → pas de clé.

## Tâche 4 — `lib/duration-estimate.js`

- Groupe A/B poids, 4 tours, 15 / 90 → 780 s.
- Moyenne historique d'un membre ignorée dans un groupe.
- Programme mixte simple + groupe → somme des deux.
- Membre countdown → durée planifiée de chaque série.
- Membre multi-activités → `rest` entre activités, transition / repos de tour après la dernière.

## Tâche 5 — intégration

- `tests/browser-scripts.test.js` : les scripts de `index.html` + `lib/supersets.js` + `lib/superset-flow.js`
  chargés ensemble dans un même scope global (pas de collision), fonctions exposées.
- Bump `CACHE_NAME` dans `service-worker.js`.
- `npx vitest run` (tous verts), `npm run css` sans diff sur `dist/output.css`.

## Correctifs de revue

Noms publics renommés (globales navigateur qu'une fonction homonyme de `app.js` écraserait sans erreur) :
`removeExerciseKeepingGroups`, `ungroupSuperset`, `moveExerciseBlock`, `moveWithinSuperset`, `dropExerciseOnto`,
`linkNextExercise`, `supersetOrder`, `defaultSupersetRounds`, `supersetMemberLetter`, `nextLiveStep`,
`supersetProgress`.

Tests ajoutés (un par ligne) :

- `dropExerciseOnto` : cardio déposé sur un membre → throw ; membre déposé sur un membre de son groupe (2 ou 3
  membres, réglages non par défaut) → inchangé ; `from` ou `onto` hors bornes → « Exercice introuvable ».
- `setGroupSettings` : ne changer que la transition garde les `activityStates` ; tours 0 ou 1,5 → throw.
- `linkNextExercise` : les séries des membres déjà groupés sont gardées ; indice hors bornes → « Exercice introuvable ».
- `moveExerciseBlock`, `moveWithinSuperset`, `removeExerciseKeepingGroups` : indice hors bornes → « Exercice
  introuvable ».
- `groupExercises` : un membre isolé est accepté comme un simple.
- `groupableLiveIndices` : un membre isolé non commencé est inclus.
- `nextLiveStep` : A2 validé, B1 non fait → B1 en transition confirmée ; A2 validé, A1 non fait → A1 en `rest` ; B plus
  court (A 3 séries, B 2) : B2 → A3 en repos de tour.
- `supersetProgress` : `null` pour un exercice simple ou cardio.

## Vérification et livraison

Worktree neuf détaché sur la tête : `npm ci && npx vitest run && npm run css && git diff --exit-code dist/output.css`.
PR GitHub en français, CI verte par SHA, revue de Lionel par `demander`, fusion sur son OK.
