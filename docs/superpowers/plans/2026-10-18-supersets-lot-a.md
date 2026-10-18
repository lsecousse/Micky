# Super sets — lot A (séance live) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD strict : test rouge
> constaté (sortie copiée dans le rapport) avant le code. Un seul implémenteur écrit à la fois.

**Spec :** `docs/superpowers/specs/2026-10-18-supersets-ecrans-design.md` (lot A). Maquette :
`designs/supersets/supersets.html` écrans 01, 02, 02b, 03, 04, 05 (classes `.kick`, `.h2`, `.rests`, `.log`, `.lr`,
`.lr.sum`, `.act`, `.prep`, `.timer`, `.btn-line`, `.item`, `.grp`, `.gl`, `.mark`, `.dashed`, `.sheet`, `.pick`, `.set`,
`.ctr`). Look : `.claude/CLAUDE.md` (Carnet). Logique existante : `lib/supersets.js`, `lib/superset-flow.js`.

**Stack :** HTML vanilla, Tailwind CLI 3.4 (`npm run css` → `dist/output.css`, committé), vitest 4 (`npx vitest run`).

## Contraintes globales

- Tokens Carnet uniquement (`bg-paper`, `bg-sheet`, `text-ink`, `text-mut`, `border-rule`, `bg-hl`, `text-done`,
  `text-alert`) ; une seule zone `hl` visible ; aucun texte < 12 px ; pas de majuscules espacées ; nombres en
  IBM Plex Mono (`font-mono`), virgule française via `formatKg`. Preflight Tailwind désactivé : `border-solid` avec
  toute largeur de bordure. Regarder comment `renderSeriesFocus`, `renderRestSplit`, `seriesLogRow`,
  `seriesBandHtml`, `createDock`, `renderExerciseList` (app.js) l'ont fait au lot 1 et réutiliser ces helpers.
- Toute nouvelle fonction de rendu d'app.js va dans `MIGRATED_FUNCTIONS` de `tests/carnet-tokens.test.js`.
- Logique pure dans `lib/live-superset.js` (nouveau, motif des autres `lib/` : globals navigateur +
  `module.exports`), tests dans `tests/live-superset.test.js`. Noms publics spécifiques (pas de `function` homonyme
  dans app.js : `grep -n "function <nom>" app.js` avant d'en ajouter une).
- Comportement d'un exercice simple **inchangé** (mêmes écrans, mêmes ids : `#focus-validate`, `#rest-split-skip`,
  `#back-to-list`, `#dock-exos`…).
- Ne pas toucher `renderHistory`, `openModal`, `renderStats` (lot Carnet parallèle).
- Code en anglais, textes d'interface en français.
- Aucun appel réseau réel : tests unitaires seulement ; les captures sont faites par le contrôleur.

---

### Task 1 : Branchement des données

**Fichiers :** `index.html`, `service-worker.js`, `tests/browser-scripts.test.js`, `tests/service-worker-shell.test.js`
(si besoin), `lib/live-superset.js` (nouveau), `tests/live-superset.test.js` (nouveau), `lib/recompose-session.js`,
`tests/recompose-session.test.js`, `supabase.js`, `app.js` (`startSession`, `liveSessionSnapshot`,
`updateProgrammeTemplate`, `completeFocusedActivity` et `finishSession` pour les durées), `lib/duration-estimate.js`
seulement si le test browser-scripts l'exige (le repli de `_exerciseBlocksOf` reste tant que backoffice.html ne charge
pas supersets.js : lot C).

1. `index.html` : `<script src="lib/supersets.js">`, `lib/superset-flow.js`, `lib/live-superset.js` après
   `lib/watch-sync.js`. `SHELL` du service worker : les trois. `CACHE_NAME` bumpé (format `mikecoach-AAAAMMJJhhmmss`).
   `tests/browser-scripts.test.js` : ne plus ajouter `SUPERSET_SCRIPTS` à la liste d'index.html (dédoublonner : une
   liste qui contient déjà le script ne le recharge pas), garder le test backoffice + super sets.
2. `lib/live-superset.js` :
   - `liveFonteExercise(ex, migrated)` : exercice de séance depuis un exercice de programme (code actuel de
     `startSession`, sortie identique) + `group` copié s'il existe, séries = `group.rounds` si groupe. Tests : sans
     groupe = sortie actuelle ; avec groupe = `group` égal (copie, pas la même référence) et `series.length === rounds`.
   - `programmeIndexOf(programmeExercises, sessionExercises, exIdx)` : nom normalisé (`normalizeExerciseName`) + rang
     d'occurrence ; -1 si absent. Tests : même ordre ; séance réordonnée ; doublon de nom (2e ↔ 2e) ; absent → -1.
   - `reorderLiveTiming(maps, order)` : `order` = permutation de `supersetOrder` (`order[newIdx] = oldIdx`) ;
     rend `{ exoStartedAt, exoDurations, serieStartedAt, serieDurations }` réindexés (clés absentes restent absentes).
   - `liveExerciseDurationAllowed(exercises, exIdx)` : faux pour un membre d'un vrai groupe (`exerciseBlocks`).
3. `lib/recompose-session.js` : `fonteExecution(ex)` → `{ series }` + `group` s'il existe (inverse de
   `recomposeExercise`) ; test aller-retour. `supabase.js pushSession` l'utilise.
4. `app.js` : `startSession` utilise `liveFonteExercise` ; `liveSessionSnapshot` ajoute `group` ;
   `updateProgrammeTemplate` traduit `exIdx` par `programmeIndexOf(prog.exercises, liveSession.exercises, exIdx)`
   (rien si -1) ; `completeFocusedActivity` et `finishSession` n'écrivent `exoDurations[exIdx]` que si
   `liveExerciseDurationAllowed`.
5. `npx vitest run` vert, `npm run css` ; commit `feat(supersets): groupe copié en séance et enregistré`.

### Task 2 : Déroulé d'un groupe (écrans 01, 02, 02b, 03)

**Fichiers :** `lib/live-superset.js`, `tests/live-superset.test.js`, `app.js` (liste : clic ; `completeFocusedActivity`,
`nextStepHint`, `renderSeriesFocus`, `renderRestSplit`, `renderLiveSession`, nouvelles fonctions de rendu),
`tests/carnet-tokens.test.js`, `dist/output.css`.

Logique pure (tests d'abord) :
- `supersetKindLabel(size)` → « Super set » / « Tri-set » / « Circuit ».
- `supersetRoundLog(exercises, indices, focus)` → modèle du carnet : `{ round, rounds, roundsDone, finished: [{ round,
  text }], current: [{ exIdx, actIdx, letter, name, weight, reps, duration, state: 'done'|'focus'|'todo', after: { kind:
  'transition'|'roundRest', seconds } | null }], remaining: { from, to, text } | null }` (round = tour de `focus.sIdx`,
  `text` du résumé : « A 60 × 10 · B 50 × 10 » avec virgule française ; activité à durée : « 0:45 »). Tester : tour 1 en
  cours ; tour 2 avec tour 1 fini et tours 3–4 restants ; dernier tour (pas de `remaining`) ; membre à 2 activités.
- `livePauseView(pause)` → `'rest' | 'roundRest' | 'transitionCountdown' | 'transitionStop'` (transition 0 s →
  `transitionStop`).
- `supersetNextHint(exercises, step)` : annonce du CTA, à partir de `nextLiveStep` simulé (copie où `step` est fait) :
  « puis B · Rowing barre » (transition), « puis repos de tour 1:30 » (roundRest), « puis retour à la liste » (fin),
  sinon `null` (le `nextStepHint` actuel s'applique).

Branchement :
- Clic sur une entrée de liste : `nextUndoneInBlock(liveSession.exercises, exIdx)` au lieu de `nextUndoneActivity`.
- `completeFocusedActivity` : `const { next, pause } = nextLiveStep(...)`. `next` nul → liste (inchangé). `rest` :
  code actuel avec `next` (au lieu de `nextUndoneActivity`) et `pause.seconds` (au lieu de `act.rest`). `roundRest` :
  `liveRest = { ...done, next, kind: 'roundRest' }`, `startCountdown(seconds, label, → focus next)`. `transition` :
  `liveRest = { ...done, next, kind: 'transition' }` ; `seconds > 0` → `startCountdown(seconds, label, onFinish)` où
  `onFinish` passe en arrêt (`liveRest.stop = true`, re-rendu, pas de focus automatique) ; `seconds === 0` → arrêt direct.
  « Je suis prêt » / « J'y suis » : `stopCountdown()`, focus `next`, `markExoSerieStart`.
- `renderLiveSession` : si `liveRest.kind` est `roundRest` / `transition` → `renderSupersetPause(tab)` (nouveau) ; si
  `liveFocus` vise un membre d'un groupe → `renderSupersetFocus(tab)` (nouveau) ; sinon inchangé. `renderRestSplit` du
  cas `rest` d'un groupe (retour sur le même poste, rare) : utiliser `liveRest.next` s'il existe.
- `renderSupersetFocus` (écran 01) : sur-titre « Super set · **tour N** sur R » + « k tour(s) fait(s) » `text-done` ;
  `<h2>` « A » + `<br><span class="text-mut">+ B</span>` (+ C, D) ; ligne « Transition **15 s** · repos de tour
  **1 min 30** » ; carnet : en-tête « Tour / Exercice / kg / reps / puis », lignes résumées des tours finis (« fait »
  `text-done`), lignes du tour en cours (lettre Newsreader italique 700, membre en cours = bande `seriesBandHtml`
  surlignée avec « Modifier » `#focus-edit`), colonne « puis » (`0:15` / `1:30` en `mut`), ligne « 3–4 » des tours
  restants. Dock : `#dock-exos`, `#focus-validate` « Valider » (+ chrono / minuterie comme aujourd'hui) avec l'annonce
  `supersetNextHint`. Suggestion IA (`#focus-suggestion`) : comme `renderSeriesFocus`.
- `renderSupersetPause` (écrans 02, 02b, 03) : même tête et carnet, l'étape `next` en cadre `prep` (bande `sheet`) ;
  dock surligné (bloc `bg-hl` comme `renderRestSplit`) : transition « Transition · va au <nom en minuscules> »,
  décompte mono 42 px `#rest-split-time` (synchro avec le décompte global comme `renderRestSplit`), bouton
  `#transition-more` « +15 s », bouton contour `#transition-ready` « Je suis prêt » ; arrêt (02b) « Va au poste
  suivant » + « B · Rowing barre » en Newsreader italique 700 28 px, bouton `#transition-ready` « J'y suis » ; repos de
  tour « Repos · fin du tour N », `#round-rest-less` « −15 s », `#round-rest-more` « +15 s », `#rest-split-skip`
  « Passer le repos » (même confirmation qu'aujourd'hui).
- ±15 s : fonction `adjustCountdown(delta)` (près de `startCountdown`) : `countdownSecs = max(0, countdownSecs + delta)`,
  `countdownTotal` ajusté si dépassé, `liveSession.sync.duration` ajusté et poussé ; à 0 → `finishCountdown()`.
- `nextStepHint` reste pour les exercices simples.
- Ajouter `renderSupersetFocus`, `renderSupersetPause`, `supersetLogHtml` (si créé) à `MIGRATED_FUNCTIONS`.
- Commit `feat(supersets): déroulé d'un groupe en séance (tours, transition, repos de tour)`.

### Task 3 : Liste et tiroir « Grouper » (écrans 04, 05)

**Fichiers :** `lib/live-superset.js`, `tests/live-superset.test.js`, `app.js` (`renderExerciseList`, nouvelles
fonctions), `index.html` (kicker de la modale d'édition paramétrable si réutilisée), `tests/carnet-tokens.test.js`,
`dist/output.css`.

Logique pure (tests d'abord) :
- `liveListBlocks(exercises)` : blocs (`exerciseBlocks`) avec `done` (toutes séries faites), triés finis en dernier
  (tri stable), et pour un groupe `progress` (`supersetProgress`).
- `togglePickedExercise(picked, exIdx)` : ajoute en fin (max 4 : sans effet au-delà) ou retire (les suivants remontent).
- `groupDraftRounds(exercises, picked, override)` : `override` sinon `defaultSupersetRounds` des choisis (4 si vide).
- `applyLiveGrouping(session, picked, settings)` → `{ exercises, timing }` : `groupExercises` + `reorderLiveTiming`
  avec `supersetOrder(exercises.length, picked)`.
- `programmeGrouping(programmeExercises, sessionExercises, picked, settings)` : indices traduits par
  `programmeIndexOf` ; rend le nouveau tableau du programme, ou `null` si un indice manque ou si `groupExercises` refuse.

Branchement :
- `renderExerciseList` : une entrée par bloc. Groupe (écran 04) : `.grp` = en-tête 13 px (`supersetKindLabel` · « N
  tours » + « · en cours » ; surligné `.mark` s'il est le bloc en cours — remplace le surlignage d'exercice simple, une
  seule zone `hl`), compteur mono « 2/4 » tours, `border-l-2 border-ink` avec lignes lettre / nom / charge
  (`formatKg`). Clic → `nextUndoneInBlock` du premier membre. Simple : inchangé.
- Sous la liste, `#group-open` bouton pointillés « Grouper des exercices » si `groupableLiveIndices(...).length >= 2`.
- Tiroir `openGroupSheet()` (écran 05) : réutiliser `openLiveEditModal({ title: 'Grouper', ... })` en rendant le
  sur-titre « Modifier » paramétrable (absent ici), ou une feuille dédiée sur le même modèle ; texte d'aide ; liste
  `.pick` (groupables cliquables, autres grisés « déjà groupé » / « commencé » ; cardio absents) ; compteurs Tours
  (pas 1, min 1), Transition (pas 5 s, min 0, défaut 15), Repos de tour (pas 15 s, min 0, défaut 90), affichage `m:ss` ;
  case `#group-keep` « Garder dans le programme » décochée ; bouton plein « Grouper N exercices » (inactif < 2).
- Valider : `applyLiveGrouping` → `liveSession.exercises` et cartes de temps remplacés, `pushSessionSafe`, re-rendu.
  Case cochée : sur `programmeTemplateQueue` (même file que `updateProgrammeTemplate`), `loadProgrammes`,
  `programmeGrouping`, `updateProgrammeDB` ; `null` → `showToast('Groupe gardé pour cette séance seulement')`.
- Commit `feat(supersets): liste par groupes et tiroir « Grouper » en séance`.

### Task 4 : Dégrouper en séance

Selon la réponse de Lionel (Guichet #1909), reportée ici avant de lancer la tâche. Appui long 500 ms sur l'entrée d'un
groupe (`pointerdown` / `pointerup` / `pointerleave`, le clic court reste l'ouverture), confirmation `showConfirm` (ou
feuille avec case si Lionel l'a choisie), `ungroupSuperset` sur la séance (pas de réordonnancement), push ; programme
selon la réponse (indices traduits par `programmeIndexOf`, `ungroupSuperset` sur le `group.id` côté programme).
Commit `feat(supersets): dégrouper en séance`.

### Task 5 : Vérification (contrôleur)

Captures 390 px (harnais Playwright, Supabase simulé, programme de démo avec super set) : 01, 02, 02b, 03, 04, 05,
liste sans groupe, série et repos d'un exercice simple (non-régression) ; worktree neuf : `npm ci`, `npx vitest run`,
`npm run css` sans diff.
