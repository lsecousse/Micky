# Look Carnet — lot 1 (fondations + accueil + séance live) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le design system Carnet (tokens, polices, barre d'état, CLAUDE.md) et repeindre l'accueil et toute la séance live, sans toucher à la logique.

**Architecture:** Renommage mécanique des tokens Direction A en `a-*` (rendu identique), puis tokens Carnet sous leurs vrais noms ; chaque écran migré perd ses `a-*`. Un test de garde vitest lit le source (app.js par fonction, index.html par bloc, style.css par règle) et interdit tout reste Direction A dans ce qui est déclaré migré.

**Tech Stack:** HTML vanilla, Tailwind CLI 3.4 (`npm run css` → `dist/output.css`, committé), vitest 4, Google Fonts.

**Spec:** `docs/superpowers/specs/2026-10-18-look-carnet-design.md` (lire la section « Design system Carnet » et la table de correspondance avant toute tâche). Maquette de référence : `designs/supersets/supersets.html` (écrans 01, 03, 04 pour la séance) et `designs/supersets/NOTES.md`.

## Global Constraints

- Tokens Carnet exacts : paper `#EEEDE8`, sheet `#F7F6F2`, ink `#1B1C1F`, mut `#6F6C64`, rule `#D6D3C9`, hl `#FFE45C`, done `#1E6B4A`, alert `#A8321F`.
- Polices : display = `"Newsreader"`, sans = `"IBM Plex Sans"`, mono = `"IBM Plex Mono"` ; rayon 6 px.
- `hl` uniquement en fond (sous texte `ink`), jamais en couleur de texte ; une seule zone `hl` visible à la fois (la série en cours, ou le décompte de repos).
- `alert` uniquement en texte ou petite pastille.
- Aucun texte < 12 px (`text-[8px]`…`text-[11px]` interdits dans le migré) ; plus de sur-titres en majuscules espacées (`uppercase tracking-eyebrow`) dans le migré : phrases 12-13 px `text-mut`.
- Aucune logique modifiée : mêmes ids, mêmes handlers, mêmes libellés (sauf casse des sur-titres).
- Libellés UI en français, commentaires de code en anglais. Ne pas toucher `lib/`, `tests/` existants, `docs/superpowers` hors de ce plan (autre exécutant).
- Après tout changement de classes : `npm run css` et committer `dist/output.css`.
- `body` garde son fond sombre `--bg` dans ce lot (les écrans non migrés n'ont pas de fond propre) : chaque écran migré pose `bg-paper text-ink` sur son conteneur.

## Review Focus

- Écran non migré (historique, stats, profil…) ouvert après le lot 1 : doit rester exactement comme avant (fond noir lisible), seules les polices changent.
- Série en cours pendant un repos : une seule bande `hl` à l'écran (le décompte), la série suivante n'est pas aussi surlignée.
- Noms d'exercices longs (« Développé couché incliné haltères prise neutre ») à 390 px : pas de débordement horizontal.
- Décompte « urgent » (≤ 10 s) : aujourd'hui en rouge ; en Carnet il reste lisible sur `hl` (texte `ink`, éventuellement `alert`).
- Cardio et chrono/minuterie plein écran : chiffres en IBM Plex Mono, aucune couleur Direction A.

---

### Task 1: Test de garde + renommage mécanique Direction A → `a-*`

**Files:**
- Create: `tests/carnet-tokens.test.js`
- Modify: `tailwind.config.js`, `src/input.css`, `app.js`, `index.html`, `exercise-editor.js`, `backoffice.html`, `backoffice.js`, `set-password.html`, `style.css` (uniquement les noms), `dist/output.css`

**Interfaces:**
- Produces (dans `tests/carnet-tokens.test.js`, réutilisés par les tâches suivantes et les lots suivants) :
  - `functionSource(file: string, name: string): string` — source d'une fonction top-level (`function name(` ou `async function name(` jusqu'à la `}` fermante en colonne 0) ; lève si introuvable.
  - `htmlBlock(file: string, marker: string): string` — texte entre le commentaire `<!-- MARKER` et le commentaire `<!--` suivant de même indentation ; lève si introuvable.
  - `cssRules(file: string, selectorPart: string): string` — concaténation des règles dont le sélecteur contient `selectorPart`.
  - `directionALeftovers(src: string): string[]` — liste des restes : classes `a-(ink|inkAlt|paper|muted|border|todo|cyan|acid|racing|blood)`, hex A (`#0A0A0A #141414 #F5F4F0 #888888 #2A2A2A #444444 #06B6D4 #84CC16 #FACC15 #DC2626`, insensible à la casse), `var(--(ink|inkAlt|…)` des anciens noms A s'ils restent, `text-[8px]`…`text-[11px]`, `tracking-eyebrow`.
  - Constantes `MIGRATED_FUNCTIONS`, `MIGRATED_HTML_BLOCKS`, `MIGRATED_CSS_SELECTORS` (vides à cette tâche).

- [ ] **Step 1: Écrire le test du renommage** : `it('Direction A tokens are only exposed under the a- prefix')` charge `tailwind.config.js` (require) et attend que `theme.extend.colors` contienne `a-ink: '#0A0A0A'`… `a-blood: '#DC2626'` et aucune clé `inkAlt|muted|border|todo|cyan|acid|racing|blood` sans préfixe ; et `it('no unprefixed Direction A colour class remains')` qui scanne `app.js index.html exercise-editor.js backoffice.html backoffice.js set-password.html` avec la regex `(bg|text|border(-[lrtbxy])?|ring|fill|stroke|from|via|to|accent|decoration|divide|outline|placeholder|caret|shadow)-(inkAlt|muted|border|todo|cyan|acid|racing|blood)(?![\w-])` et attend zéro occurrence (`ink` et `paper` exclus : la tâche 2 les réintroduit avec leur sens Carnet ; leur renommage est prouvé par les captures identiques de l'étape 5). Les clés `ink`/`paper` de la config, si présentes, doivent valoir les hex Carnet.
- [ ] **Step 2: Lancer `npx vitest run tests/carnet-tokens.test.js`** → FAIL (clés non préfixées présentes, ~820 occurrences).
- [ ] **Step 3: Renommer** par script (sed/node, pas à la main) dans tous les fichiers listés : classes (y compris modificateurs `active:`, `/opacity`, `!`), clés de `tailwind.config.js`, variables `--ink…--blood` de `src/input.css` et leurs `var(--…)` (→ `--a-ink`…). Vérifier à la main les constructions dynamiques (`'text-' + …`, ternaires) avec `grep -n "'\(bg\|text\|border\)-'" *.js`.
- [ ] **Step 4: `npm run css` puis `npx vitest run`** → tout PASS.
- [ ] **Step 5: Preuve de neutralité** : le CSS généré avant/après ne diffère que par les noms (`diff <(sed -E 's/a-(ink|…)/\1/g' dist/output.css) <(git show HEAD:dist/output.css)` vide, aux échappements près), et les captures du harnais (voir « Vérification ») avant/après sont identiques pixel à pixel (`compare`/comparaison d'octets PNG décodés).
- [ ] **Step 6: Commit** `refactor(carnet): préfixe a- pour les tokens Direction A (rendu identique)`.

### Task 2: Tokens Carnet, polices, barre d'état, CLAUDE.md, éléments globaux

**Files:**
- Modify: `tailwind.config.js`, `src/input.css`, `index.html` (head, `#dialog`, `#toast`, `#countdown-bar`), `style.css` (`#toast`, `.dialog*`, `#countdown-bar` et ses enfants), `app.js` (`showConfirm`, `showAlert`, `showToast`), `.claude/CLAUDE.md`, `service-worker.js` (CACHE_NAME), `tests/carnet-tokens.test.js`, `dist/output.css`

**Interfaces:**
- Consumes: helpers de la tâche 1.
- Produces: classes Tailwind `bg-paper bg-sheet text-ink text-mut border-rule bg-hl text-done text-alert …`, `font-display|sans|mono` → Newsreader / IBM Plex Sans / IBM Plex Mono, `rounded` = 6 px ; variables CSS `--paper --sheet --ink --mut --rule --hl --done --alert` dans `:root` ; utilitaires `.num-set`, `.num-set-hot` passés en mono (mêmes tailles).

- [ ] **Step 1: Tests** : `it('exposes Carnet tokens with exact hex')` (8 tokens, valeurs de « Global Constraints ») ; `it('uses Newsreader, IBM Plex Sans and IBM Plex Mono')` (première famille de chaque `fontFamily`) ; `it('loads Carnet fonts and a light status bar')` sur `index.html` : URL Google Fonts contenant `Newsreader`, `IBM+Plex+Sans`, `IBM+Plex+Mono`, plus de `Fraunces` ni `DM+Sans` dans le `<link>`, `<meta name="theme-color" content="#EEEDE8">`, `apple-mobile-web-app-status-bar-style` = `default` ; ajouter `'DIALOG CUSTOM'`, `'TOAST'`, `'COUNTDOWN STICKY TOP BAR'` à `MIGRATED_HTML_BLOCKS`, `#toast`, `.dialog`, `#countdown` à `MIGRATED_CSS_SELECTORS`, `showConfirm`, `showAlert`, `showToast` à `MIGRATED_FUNCTIONS`, avec `it.each` qui attend `directionALeftovers(...)` vide.
- [ ] **Step 2: `npx vitest run tests/carnet-tokens.test.js`** → FAIL.
- [ ] **Step 3: Implémenter** : tokens et polices dans `tailwind.config.js` et `src/input.css` ; lien Google Fonts `Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,700;1,6..72,500;1,6..72,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600` ; metas. Dialog = carte `sheet`, filet 1,5 px `ink`, message Newsreader italique, boutons secondaire/primaire (maquette `.btn-line` / `.btn-go`). Toast = fond `ink`, texte `paper`. Barre de repos `#countdown-bar` = bande `hl` de la maquette (`.timer` écran 03) : libellé 13 px, décompte IBM Plex Mono 600 ~42 px `ink`, anneau/progression en `ink`, état `urgent` en `alert` sur le chiffre uniquement.
- [ ] **Step 4: Réécrire la section design de `.claude/CLAUDE.md`** : supprimer « Design generation: AIDesigner MCP », « Design workflow (NON-NEGOTIABLE) », « When NOT to use AIDesigner », la section « Direction A … LOCKED » et sa « Référence canonique » ; ajouter « Design system — Carnet » (tableau des 8 tokens et rôles uniques de la spec, polices, rayon 6 px, règle des 12 px, règles : une seule zone `hl`, `alert` ponctuel, `done` domine en fin de séance, filets 1,5 px `ink` pour la structure / 1 px `rule` pour les lignes), référence canonique `designs/supersets/supersets.html`, et une ligne : « Écrans dessinés à la main d'après le Carnet (décision Lionel 2026-10-18, Guichet #1895) ». Garder les anti-patterns génériques (pas de dégradés, pas de `rounded-2xl shadow-xl`, etc.) ; remplacer `./designs/ — raw HTML from AIDesigner` par `./designs/ — maquettes HTML`.
- [ ] **Step 5: Bump `CACHE_NAME`**, `npm run css`, `npx vitest run` → PASS.
- [ ] **Step 6: Commit** `feat(carnet): tokens, polices et barre d'état Carnet ; CLAUDE.md`.

### Task 3: Accueil et choix du programme

**Files:**
- Modify: `index.html` (bloc `HOME`, en-tête de `À LA SALLE`), `app.js` (`renderHome`, `renderHomeSection`, `buildUserDropdown`, `renderSeanceScreen`, `renderProgrammeSelection`), `tests/carnet-tokens.test.js`, `dist/output.css`

- [ ] **Step 1: Tests** : ajouter ces 5 fonctions à `MIGRATED_FUNCTIONS` et `'HOME'`, `'À LA SALLE'` à `MIGRATED_HTML_BLOCKS`.
- [ ] **Step 2: FAIL constaté.**
- [ ] **Step 3: Repeindre** selon la correspondance de la spec : fond `paper`, titres Newsreader (H1 500, ~52 px comme `.h1` maquette, `em` en `mut`), sections en liste-carnet (`.item` maquette : nom Newsreader italique 700 20 px, détail 13 px `mut`, chiffres mono), filet 1,5 px `ink` en haut des listes, pied « Données corporelles / Alimentation » en onglets façon `.tabs`. Le programme du jour / prochain = surligné (`.mark` maquette), un seul.
- [ ] **Step 4: `npm run css`, `npx vitest run`** → PASS ; captures `home`, `programme-selection` regardées.
- [ ] **Step 5: Commit** `feat(carnet): accueil et choix du programme`.

### Task 4: Séance live — en-tête, liste, série en cours, repos, édition

**Files:**
- Modify: `app.js` (`renderLiveSession`, `renderExerciseList`, `renderExoMasthead`, `renderSeriesFocus`, `renderRestSplit`, `renderExerciseDetail`, `openEditModalForActivity`, `openLiveEditModal`, `updateCountdownUI`, `finishSession`, `showPostSessionFeedback`), `index.html` (bloc `MODAL ÉDITION ACTIVITÉ (live)`), `style.css` (`.live-edit-modal*`, `.live-edit-suggestion*`, `.feedback-ia-generate*`), `tests/carnet-tokens.test.js`, `dist/output.css`

- [ ] **Step 1: Tests** : ces fonctions dans `MIGRATED_FUNCTIONS`, le bloc dans `MIGRATED_HTML_BLOCKS`, `.live-edit` et `.feedback-ia` dans `MIGRATED_CSS_SELECTORS`.
- [ ] **Step 2: FAIL constaté.**
- [ ] **Step 3: Repeindre d'après les écrans 01, 03, 04 de la maquette** : en-tête `.top` (« Terminer » en bouton contour), barre de progression 2 px `rule` remplie `ink`, sur-titre `.kick` (compteur « X/Y séries » en `done`), nom d'exercice `.h2` Newsreader italique ; tableau-carnet `.log`/`.lr` (filet 1,5 px `ink` en tête, lignes 1 px `rule`, chiffres mono 17 px, « fait » en `done`, à venir en `mut`) ; série en cours = bande `.act` `hl` avec steppers `.stp` (boutons contour 48 px, valeur mono 44 px) ; dock du pouce `.dock` (bouton « Exercices », CTA plein `ink` qui annonce la suite) ; liste d'exercices `.item` (fait : nom `mut`, compteur `done` ; en cours : `.mark`) ; Σ / métriques en mono `ink` (plus de cyan) ; modale d'édition = tiroir `sheet` (`.sheet` maquette). Pendant un repos, la bande `hl` est le décompte : la série suivante passe en `.prep` (`sheet`, filets `ink`), jamais en `hl`.
- [ ] **Step 4: `npm run css`, `npx vitest run`** → PASS ; captures `live-list`, `live-series`, `live-rest`, `live-edit-modal` regardées à 390 px (pas de débordement horizontal).
- [ ] **Step 5: Commit** `feat(carnet): séance live`.

### Task 5: Cardio, chrono et minuterie

**Files:**
- Modify: `app.js` (`renderLiveCardio`, `openChronoOverlay`, `startChrono`, `stopChronoOverlay`, `openMinuterieOverlay`, `stopMinuterieOverlay`), `index.html` (blocs `CHRONO FULLSCREEN`, `MINUTERIE FULLSCREEN`), `style.css` (`#chrono`, `#minuterie`), `service-worker.js` (re-bump si besoin), `tests/carnet-tokens.test.js`, `dist/output.css`

- [ ] **Step 1: Tests** : fonctions, blocs et sélecteurs ajoutés aux listes de migration.
- [ ] **Step 2: FAIL constaté.**
- [ ] **Step 3: Repeindre** : cardio en carnet (champs durée/distance/etc. soulignés 1 px `rule`, chiffres mono, bouton d'état plein `ink`, fait en `done`) ; overlays plein écran fond `paper`, nom d'exercice Newsreader italique, chiffre géant IBM Plex Mono 600, décompte en cours sur bande `hl`, boutons primaire/secondaire.
- [ ] **Step 4: `npm run css`, `npx vitest run`** → PASS ; captures `live-cardio`, `chrono-overlay`, `minuterie-overlay` regardées.
- [ ] **Step 5: Commit** `feat(carnet): cardio, chrono et minuterie`.

## Vérification (après la tâche 5, par l'orchestrateur du lot)

- Worktree neuf détaché sur la tête : `npm ci && npx vitest run && npm run css && git diff --exit-code dist/output.css`.
- Harnais `capture.js` (Supabase simulé) avant (origin/main) / après sur tous les scénarios ; les écrans non migrés (history, stats, alimentation, corps, profil, params, programme-editor, login) doivent être identiques à l'avant sauf polices.
- Captures regardées, publiées en Artifact (avant/après côte à côte) pour la revue de Lionel.
