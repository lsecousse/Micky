# Super sets — lot B (éditeur mobile, écran 06) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD strict : test rouge
> constaté (sortie copiée dans le rapport) avant le code. Un seul implémenteur écrit à la fois.

**Spec :** `docs/superpowers/specs/2026-10-18-supersets-ecrans-design.md`, section « Lot B ». Maquette :
`designs/supersets/supersets.html` figure 06 (classes `.top`, `.ed`, `.card`, `.ch`, `.mv`, `.link`, `.gcard`, `.gt`,
`.gs`, `.ge`, `.let`, `.gf`, lignes 174-192 du CSS). Look : `.claude/CLAUDE.md` (Carnet). Logique existante :
`lib/supersets.js`, `lib/planned-series.js` (`formatSeriesSummary`, `mergeEditedExercise`), `lib/live-superset.js`
(`supersetKindLabel`).

**Stack :** HTML vanilla, Tailwind CLI 3.4 (`npm run css` → `dist/output.css`, committé), vitest 4 (`npx vitest run`,
environnement node, pas de jsdom).

## Contraintes globales

- Tokens Carnet uniquement (`bg-paper`, `bg-sheet`, `text-ink`, `text-mut`, `border-rule`, `bg-hl`, `text-done`,
  `text-alert`) ; aucun texte < 12 px ; pas de majuscules espacées (`uppercase tracking-*` interdits) ; chiffres en
  IBM Plex Mono (`font-mono`) ; noms d'exercices en Newsreader italique (`font-display italic`). Preflight désactivé :
  `border-solid` avec toute largeur de bordure. Modèles à suivre : en-têtes `#screen-history` / `#screen-seance`
  d'`index.html`, `renderExerciseList` / `supersetListEntry` / `openGroupSheet` d'`app.js`.
- Une seule zone `hl` visible : l'éditeur n'en a pas (rien « à faire maintenant »).
- `alert` seulement pour « Suppr » (texte), jamais en surface.
- Logique pure dans `lib/programme-editor.js` (nouveau, motif des autres `lib/` : globals navigateur +
  `module.exports`, dépendances résolues paresseusement), tests dans `tests/programme-editor.test.js`. Aucun nom de
  `function` d'app.js ou d'exercise-editor.js identique à un global de lib (vérifier par `grep`).
- `exercise-editor.js` est aussi chargé par `backoffice.html` (modale catalogue, `backoffice.js` ~717 / ~741) : garder
  la signature de `makeExerciseCard` / `readExerciseCard` / `makeCardioExerciseCard` / `readCardioExerciseCard`
  compatible (options en plus seulement) et le comportement du correctif PR #7 (`source`, `_shown`, `_sourceIndex`).
- Ids gardés : `#screen-params-body`, `#back-params`, `#prog-name-input`, `#prog-exercises-list`, `.exercise-card`,
  `.activity-row`, `.exercise-name`, `.exercise-sets`, `.exercise-comment`, `.activity-*`, `.cardio-*`,
  `[data-action="edit"]`, `[data-action="del"]` (le harnais de captures et les tests s'en servent).
- Toute fonction repeinte va dans `MIGRATED_FUNCTIONS` de `tests/carnet-tokens.test.js` (fichier `app.js`) ; pour
  `exercise-editor.js`, ajouter une liste `MIGRATED_EDITOR_FUNCTIONS` scannée de la même façon. Bloc `PARAMÈTRES`
  dans `MIGRATED_HTML_BLOCKS`.
- `CACHE_NAME` : horodatage à la seconde (`mikecoach-AAAAMMJJHHMMSS`), plus grand que celui de main.
- Code en anglais, textes d'interface en français. Aucun appel réseau réel.

---

### Task 1 : Logique pure de l'éditeur

**Fichiers :** `lib/programme-editor.js` (nouveau), `tests/programme-editor.test.js` (nouveau), `index.html` (script
après `lib/live-superset.js`), `service-worker.js` (`SHELL`), `tests/browser-scripts.test.js`.

Fonctions (noms exacts) :
- `editorBlocks(exercises)` → tableau de blocs `exerciseBlocks` enrichis : `{ kind, indices, label, canLinkNext,
  settings }` ; `label` = `supersetKindLabel(indices.length)` pour un groupe, `null` sinon ; `settings` =
  `{ rounds, transition, roundRest }` pour un groupe, `null` sinon ; `canLinkNext` vrai si un bloc suit, qu'aucun
  exercice des deux blocs n'est cardio (`type === 'cardio'`) et que la taille totale ≤ 4.
- `readGroupSettings(raw, previous)` : `raw` = chaînes saisies `{ rounds, transition, roundRest }` ; entier ≥ 1 pour
  `rounds`, entier ≥ 0 pour les deux autres ; une valeur invalide (vide, non numérique, hors borne, décimale) reprend
  celle de `previous`. Exemple : `({rounds:'0', transition:'20', roundRest:'abc'}, {rounds:4, transition:15,
  roundRest:90})` → `{rounds:4, transition:20, roundRest:90}`.
- `programmeForSave(exercises)` → copie où chaque membre de groupe a `sets = group.rounds` ; les autres inchangés.
- `memberSummary(ex)` → résumé sans le nombre de séries : poids uniforme « 10 reps · 60 kg » (virgule française :
  `62,5 kg`), reps variables « 10/10/8/8 reps · 60 kg », charges variables « 10 reps · 60/62,5 kg » ; minuterie
  « 45 s » ou « 45/30 s » ; chrono « chrono ». Calculé depuis `plannedSeries(ex)` (première activité).
- `programmeListMeta(programme)` → « Fonte · 5 exercices » / « Cardio · 1 exercice », plus « · 1 super set » /
  « · 2 super sets » quand des groupes existent (compte des blocs `group`, tous libellés confondus).

Tests : un comportement par test, AAA, pas de conditionnelle ; inclure les bornes de `canLinkNext` (taille 4 atteinte,
cardio, dernier bloc) et un test navigateur dans `browser-scripts.test.js` (index.html charge `lib/programme-editor.js`
et `editorBlocks` fonctionne dans le scope partagé).
Commit `feat(supersets): logique de l'éditeur de programme`.

### Task 2 : Écran Programmes et éditeur en Carnet (sans super set)

**Fichiers :** `index.html` (bloc `<!-- PARAMÈTRES -->`), `app.js` (`renderParams`, `openProgrammeEditor`,
`saveProgrammeFromEditor`), `exercise-editor.js` (constantes `_INPUT_*`, `_LABEL_EYE`, `_BTN_*`, `makeActivityRow`,
`updateActivityFields`, `makeExerciseCard`, `makeCardioExerciseCard`, en-tête de fichier), `tests/carnet-tokens.test.js`,
`dist/output.css`, `service-worker.js` (`CACHE_NAME`).

- En-tête `#screen-params` sur le modèle de `#screen-history` : flèche `#back-params`, titre `#params-title`
  (« Programmes »), emplacement droit `#params-action` vide. L'écran prend `bg-paper text-ink font-sans`.
- `renderParams` : ligne du carnet par programme (filet `rule`), nom en `font-display italic`, méta
  `programmeListMeta` en `text-mut text-[13px]`, ↑ ↓ (boutons `.mv` de la maquette : 36 px, contour 1,5 px `ink`,
  `rounded`), « Modifier » (contour `ink`), « Suppr » (texte `alert`) ; « + Nouveau programme » bouton pointillé comme
  `#group-open`. Remet le titre « Programmes » et vide `#params-action`.
- `openProgrammeEditor` : barre du haut de la maquette : `#back-params` libellé « Annuler » (texte, sans flèche),
  `#params-title` = nom du programme (ou « Nouveau programme »), `#params-action` = bouton `#prog-save`
  « Enregistrer » (plein `ink`, texte `paper`). Corps : champ nom `#prog-name-input` (Newsreader italique 22 px, filet
  `rule`), bascule Fonte / Cardio (état dans une variable, `data-active="1"` sur le bouton actif ; plus de lecture par
  classe), liste `#prog-exercises-list`, « + Exercice » (bouton pointillé). `#back-params` en mode éditeur revient à
  `renderParams` sans écrire.
- `saveProgrammeFromEditor(existingId, category)` reçoit la catégorie au lieu de la lire dans une classe.
- `exercise-editor.js` en Carnet : carte `bg-sheet` contour 1,5 px `ink` `rounded` (comme `.card` de la maquette),
  nom en Newsreader italique, champs chiffres `font-mono`, libellés phrases 12-13 px `text-mut`, ↑ ↓ en `.mv`,
  « Suppr » texte `alert`. Mêmes classes de structure (`.exercise-card`, `.activity-row`…). Aucune classe `a-*`.
- Comportement identique à main (mêmes actions, même enregistrement).
Commit `feat(carnet): écran Programmes et éditeur de programme`.

### Task 3 : Super sets dans l'éditeur (écran 06)

**Fichiers :** `app.js` (`openProgrammeEditor` et nouvelles fonctions de rendu), `exercise-editor.js` (option
`member: true` de `makeExerciseCard` : cache la ligne « Séries » et le repos de chaque activité, sans ↑ ↓ ; garde
« Suppr »), `tests/carnet-tokens.test.js`, `dist/output.css`, `service-worker.js` (`CACHE_NAME`).

- Modèle : tableau `exercises` dans la fermeture d'`openProgrammeEditor` (copie des exercices du programme, fonte via
  `migrateExercise`). `renderEditorExercises()` vide `#prog-exercises-list` et dessine `editorBlocks(exercises)`.
  `syncEditorFromDom()` relit chaque `.exercise-card` (`readExerciseCard`, dans l'ordre du DOM = ordre du tableau) et
  les réglages de chaque carte groupe (`readGroupSettings` puis `setGroupSettings`). Chaque action : sync, fonction pure,
  render. « + Exercice » : sync, ajout d'un exercice vide `{ name: '', sets: 3, activities: [{ type: 'weight' }],
  comment: '' }`, render. Les cartes sont créées avec `source` = l'exercice du tableau (le correctif PR #7 s'applique).
- Bloc simple : `makeExerciseCard` ; ses ↑ ↓ appellent `moveExerciseBlock(exercises, i, ∓1)` et « Suppr »
  `removeExerciseKeepingGroups` (remplacer les gestionnaires DOM d'origine par une option `onMove(dir)` / `onDelete()`
  de `makeExerciseCard` ; sans option, comportement d'origine pour le back-office).
- Entre deux blocs, si `canLinkNext` : `<div class="link">` avec bouton « Lier au suivant » →
  `linkNextExercise(exercises, lastIndexOfBlock)`.
- Bloc groupe (`.gcard`) : `data-group-id`, titre `label` + ↑ ↓ du bloc ; réglages `.gs` : trois champs `type=number`
  (`data-group-setting="rounds|transition|roundRest"`, `font-mono` 22 px, unité « s » pour les deux derniers) ; une
  ligne `.ge` par membre (`data-member-index`) : lettre `supersetMemberLetter(pos)`, nom, `memberSummary`, bouton ↓
  pour le premier, ↑ pour le dernier, ↑ et ↓ pour un membre du milieu (`moveWithinSuperset`) ; pied `.gf` : « Lier le
  suivant » (si `canLinkNext`, sinon absent) | « Dégrouper » (`ungroupSuperset`).
- Toucher une ligne membre (hors boutons) ouvre sa carte `makeExerciseCard({ ..., member: true })` sous la ligne ;
  une seule ouverte (indice gardé dans la fermeture, remis à `null` après une action de structure). Une carte membre
  fermée reste dans le DOM, cachée (`hidden`), pour que `syncEditorFromDom` lise tous les exercices.
- Enregistrer (`#prog-save`) : sync, `programmeForSave(exercises)`, écriture comme aujourd'hui. Catégorie cardio :
  inchangée (pas de lien ni de groupe).
- Une exception d'une fonction de `lib/supersets.js` (cas imprévu) : `showToast` du message, pas de plantage.
Commit `feat(supersets): super sets dans l'éditeur de programme`.

### Task 4 : Vérification (contrôleur)

Captures 390 px (harnais Playwright, Supabase simulé) : liste des programmes, éditeur sans groupe, éditeur avec le
super set (`SUPERSETS=1`), membre ouvert, après « Lier au suivant », après « Dégrouper », cardio ; enregistrement
simulé sans modification → programme identique (groupe compris) ; worktree neuf : `npm ci`, `npx vitest run`,
`npm run css` sans diff.
