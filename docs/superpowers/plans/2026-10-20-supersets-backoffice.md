# Plan — super sets, lot C : éditeur de programme du back-office (écran 07)

Spec : `docs/superpowers/specs/2026-10-18-supersets-ecrans-design.md`, section « Lot C ».
Maquette : `designs/supersets/supersets.html` figure 07 (classes `.bo-*`, `.pr`, `.bg`, `.bh`, `.be`, `.drop`).
Branche : `feat/supersets-backoffice` depuis main 754709d. TDD : test rouge constaté avant chaque code.
Commandes : `npx vitest run`, `npm run css`.

## Tâche 1 — logique pure `lib/bo-programme-editor.js` + chargement des scripts

Nouveau fichier, même forme que `lib/programme-editor.js` (globals navigateur ou `require` sous Node, exports
`module.exports` + `Object.assign(window, …)`, commentaires en anglais, noms préfixés `_bpe` pour les privés).

Une **source** de glisser-déposer : `{ blockPos }` (bloc du programme, indice dans `exerciseBlocks`) ou
`{ exercise }` (nouvel exercice venu du catalogue). Une **cible** : `{ blockPos, intent }` avec
`intent ∈ 'before' | 'after' | 'onto'`, ou `null` (liste vide ou dépôt hors bloc = en fin).

1. `boDropIntent(rect, y, canJoin)` : `rect = { top, height }`, bord `edge = Math.min(14, height / 4)`.
   `y < top + edge` → `'before'` ; `y > top + height - edge` → `'after'` ; sinon `canJoin ? 'onto' : 'after'`.
2. `boCanDropOnto(exercises, source, ontoBlockPos)` → booléen. Faux si : la cible est le bloc source ; la source est
   un bloc groupe ; la source ou un membre de la cible est cardio (`type === 'cardio'`) ; la taille du groupe
   obtenu (`indices.length + 1`) n'est pas `isGroupSize`. Vrai sinon.
3. `boApplyDrop(exercises, source, target)` → nouveau tableau, ne mute rien.
   - `onto` : source catalogue = ajoutée en fin puis `dropExerciseOnto(xs, xs.length - 1, premier indice de la cible)` ;
     source bloc = `dropExerciseOnto(exercises, indice de l'exercice source, premier indice de la cible)`.
   - `before` / `after` / `null` : les blocs sans le bloc source ; on insère les exercices déplacés (bloc entier, ou
     `[exercise]`) avant le bloc cible, après lui, ou en fin ; on aplatit. Le `blockPos` de la cible est celui de la
     liste d'origine (avant retrait).
4. `boClock(seconds)` : `105` → `'1:45'`, `15` → `'0:15'`, `120` → `'2:00'`.
5. `boRowSummary(ex)` : séries = `ex.sets || ex.series?.length || 0`, première activité, valeurs prévues
   (`plannedSeries`) de la première activité :
   - poids : `'4 × 8 · 35 kg · repos 1:45'` ; reps ou kg variables joints par « / » (`'4 × 10/8 · 60 kg'`) ;
     toutes les charges à 0 → `'poids du corps'` ; kg avec virgule décimale (`62,5 kg`) ;
   - minuterie : `'3 × 45 s · repos 1:00'` ; chrono : `'3 × chrono'` ;
   - `· repos m:ss` seulement si `rest > 0` sur la première activité.
6. `backoffice.html` : ajouter, avant `lib/duration-estimate.js` : `lib/supersets.js`, `lib/superset-flow.js`,
   `lib/live-superset.js`, `lib/programme-editor.js`, `lib/bo-programme-editor.js`. Retirer la balise SortableJS
   **seulement en tâche 2** (le code l'utilise encore).
7. `lib/duration-estimate.js` : `_exerciseBlocksOf` perd son troisième repli (tout simple) ; commentaire ajusté.
8. Tests :
   - `tests/bo-programme-editor.test.js` (nommage `xxxShould`, AAA, un comportement par test) : chaque règle
     ci-dessus, dont « dépôt au milieu d'un groupe plein → après le bloc, groupe intact », « bloc groupe déplacé
     avant un simple », « sur un groupe de 2 → le groupe a 3 membres, mêmes réglages », « catalogue sur un simple ».
   - `tests/browser-scripts.test.js` : remplacer le commentaire « does not load the super set scripts yet (lot C) »
     et les usages de `SUPERSET_SCRIPTS` par des tests sur `libScriptsOf('backoffice.html')` seul :
     « list each lib script once in backoffice.html », « load the super set scripts in backoffice.html shared global
     scope » (`dropExerciseOnto`, `editorBlocks`, `supersetKindLabel`, `boApplyDrop` sont des fonctions), et
     l'estimation de durée d'un super set avec les globals du back-office.

## Tâche 2 — éditeur du back-office en Carnet, glisser-déposer, modale

Fichiers : `backoffice.js` (de `renderProgrammeEditor` à `saveProgramme` seulement), `backoffice.html` (bloc CSS
« PROGRAMME EDITOR », règles d'inputs et de carte, retrait de SortableJS), `tests/backoffice-carnet.test.js`.
Style : classes CSS dans le `<style>` de `backoffice.html` avec les variables Carnet (`var(--paper)` … `var(--alert)`,
`var(--f-display)`, `var(--f-mono)`), comme le lot 6 ; pas de classes Tailwind `a-*`, aucun texte sous 12 px, pas
de majuscules espacées, rayon `var(--radius)` (6 px). Valeurs de la maquette (figure 07) : ligne 54 px, nom 18 px,
résumé 13 px, titre de groupe 52 px, membre 48 px retrait 18 px trait 2 px, poignée `⋮⋮` `mut`.

1. **En-tête** (`renderProgrammeEditor`) : « ← Retour » (`btn-ghost`), nom du programme en champ Newsreader 32 px
   (sans cadre, filet bas `rule`, focus `ink`), « Estimé : 42 min » 13 px `mut` + bouton « Modifier » (`btn-ghost
   btn-sm`), « Enregistrer » (`btn-primary`). Phrase d'aide 14 px `mut` avec **entre** / **sur** en `ink` gras.
2. **Catalogue** (`renderCatalogSidebar`, `renderMuscleChips`, `renderCatalogList`, `openCatalogForm`) : colonne
   `sheet`, filet droit `rule`. « Catalogue » 13 px `mut`, « + Nouvel exercice » `btn-secondary btn-sm`, recherche
   (contour 1,5 px `ink`), filtres (13 px, contour `rule` texte `mut` ; actif contour `ink` texte `ink`, classe
   `on`, la fiche lit `.on` au lieu de `.border-a-acid`), lignes : nom italique Newsreader 17 px, filet bas `rule`,
   « Modifier » `btn-ghost btn-sm`, `draggable="true"`, curseur `grab`. Fiche : libellés 13 px `mut`, champs du
   back-office, boutons `btn-primary btn-sm` / `btn-ghost btn-sm` / `btn-danger btn-sm`. « Catalogue vide. » en
   13 px `mut`.
3. **Zone** (`renderProgrammeZone`) : redessine tout depuis `editorBlocks(_progEditorState.exercises)` dans
   `#pz-list` ; un élément par bloc, `data-block="<pos>"`. Fonctions de rendu séparées : `boSingleRowHtml(ex, index,
   pos)`, `boGroupCardHtml(block, pos, exercises)`, `boGroupSettingsHtml(settings)`, `boMemberRowHtml(ex, posInGroup,
   count, index)`. Actions par délégation de clic sur `#pz-list` (`data-action` : `block-up`, `block-down`,
   `member-up`, `member-down`, `edit`, `delete`, `ungroup`, avec `data-index`) → une fonction `boEditorAct(fn)` qui
   applique la fonction pure, redessine et rafraîchit l'estimation. Réglages : `change` sur
   `[data-group-setting]` → `applyGroupSettingsInput`. « Suppr » → `showConfirmModal('Retirer cet exercice du
   programme ?', …)` puis `removeExerciseKeepingGroups`. Programme vide : cadre pointillé `rule` 160 px,
   « Glisse un exercice du catalogue ici » 14 px `mut`. Supprimer `makeProgrammeCard`, `moveExo`,
   `deleteExoFromProgramme` (remplacés).
4. **Glisser-déposer natif** (plus de SortableJS, retirer sa balise `<script>`) : état module `_boDrag` =
   `{ source }` pendant un glisser. `dragstart` sur une ligne du catalogue → `{ catalogId }` ; sur la poignée
   `[data-drag-handle]` d'un bloc → `{ blockPos }` (`setDragImage` sur l'élément du bloc ; la ligne du catalogue
   glissée prend la classe `gone`, couleur `rule`). `dragover` sur `#pz-list` (`preventDefault`) : bloc survolé
   (`closest('[data-block]')`), `canJoin = category !== 'cardio' && boCanDropOnto(...)` (source catalogue : exercice
   provisoire `{ name, activities }` suffisant pour le contrôle cardio / taille), intention `boDropIntent`, repère :
   classe `drop-onto` (fond `hl`, contour 1,5 px pointillé `ink`, phrase « Déposer : super set avec <nom> » 13 px
   gras ; pour un groupe : « Déposer : ajouter au super set ») ou `drop-before` / `drop-after` (filet 2 px `ink`,
   `box-shadow` inset en haut ou en bas). Un seul repère à la fois. `dragleave` hors liste / `dragend` : repères
   effacés, `_boDrag = null`. `drop` : cible = dernier repère (ou `null`) ; source bloc → `boApplyDrop` puis
   redessin ; source catalogue → même logique que l'ancien `onAdd` (historique client → exercice direct via
   `buildProgrammeExerciseFromCatalog`, sinon `openExoModal(entry, { source, target })` qui appelle `boApplyDrop` à
   la validation).
5. **Modale** (`openExoModal(entryOrExo, placement)`) : `placement` = `{ index }` pour ✎ (remplace l'exercice) ou
   `{ target }` pour un ajout (passe par `boApplyDrop` avec `{ exercise }`). Garde `boModalCardOptions` /
   `boModalSavedExercise` (PR #12, ne pas reconstruire l'exercice). Habillage : `.modal-overlay` + `.modal` du
   lot 6 avec une classe `bo-exo-modal` (largeur max 560 px, hauteur max 90vh, défilement) ; titre `h2`
   « Ajouter : <nom> » / « Modifier : <nom> » ; « Fermer » (`btn-ghost btn-sm`) ; pied « Annuler » (`btn-ghost`) et
   « Ajouter au programme » / « Enregistrer » (`btn-primary`). Masquer dans la modale les ↑ ↓ et « Suppr » de la
   carte (`.bo-exo-modal .exercise-move-btn, .bo-exo-modal .exercise-del-btn { display: none; }`).
6. **CSS** (`backoffice.html`) : remplacer le bloc « PROGRAMME EDITOR » (supprimer `.bo-editor .text-a-paper`,
   `.bo-editor .pz-card`, `.bo-editor-title`, `.exercise-block*`) par les règles du lot C ; supprimer le bloc
   « EXERCISE CARD (exercise-editor.js) » hérité (`.exercise-card` … `.activity-remove-btn`) ; la règle des champs
   devient `input[type=text]:not(.exercise-card *), …, textarea:not(.exercise-card *)` pour laisser la carte du lot B
   en Carnet (même rendu que sur le téléphone).
7. **Enregistrer** (`saveProgramme`) : `exercises: programmeForSave(_progEditorState.exercises)`. Bordure d'erreur du
   nom : `var(--alert)` au lieu de `#DC2626`.
8. Tests `tests/backoffice-carnet.test.js` : liste `LOTC_FUNCTIONS` (toutes les fonctions de rendu du lot C,
   `renderProgrammeEditor` … `saveProgramme`) : pas de `a-*` (`/(?<![\w-])a-(ink|inkAlt|paper|muted|border|todo|cyan|acid|racing|blood)\b/`),
   pas de hex, pas d'anciens noms de variables, pas de `text-[8-11px]`, pas de `tracking-eyebrow` ; règles CSS
   `.pz-`, `.cat-`, `.bo-exo-modal` ≥ 12 px sans majuscules ; les deux règles provisoires du lot 6 ont disparu ;
   `backoffice.html` ne charge plus SortableJS ; la règle des champs exclut `.exercise-card`.
   Le comportement (dépôt, ordre) est testé en tâche 1 ; le câblage se prouve aux captures.

## Tâche 3 — vérification et captures (orchestrée par l'exécutant)

- Worktree neuf : `npm ci`, `npx vitest run`, `npm run css` sans écart.
- Harnais Playwright (port 8085, `SUPERSETS=1`, 1440 × 900) : `bo-programme-editor`, `bo-catalogue-modal`, plus
  scénarios ajoutés au harnais (hors dépôt) : survol « sur » un simple, survol au milieu du groupe (→ « après »),
  dépôt catalogue sur un simple (groupe formé), ✎ d'un membre (séries masquées), enregistrement simulé sans
  modification (programme envoyé = fixture, `group` gardé).
- Bump `CACHE_NAME` si `dist/output.css` ou un fichier du `SHELL` change.
