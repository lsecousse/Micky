# Look Carnet — lot 2 (historique, détail de séance, stats) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repeindre l'historique, le détail d'une séance (modale) et les stats, graphiques Chart.js compris, dans le look Carnet, sans toucher à la logique.

**Architecture:** Même méthode que le lot 1 (`docs/superpowers/plans/2026-10-18-look-carnet-lot1.md`) : chaque fonction et bloc migré entre dans les listes de `tests/carnet-tokens.test.js`, qui interdisent tout reste Direction A. Les couleurs des graphiques sont lues dans les variables CSS Carnet de `src/input.css`.

**Tech Stack:** HTML vanilla, Tailwind CLI 3.4 (`npm run css` → `dist/output.css`, committé), vitest 4, Chart.js 4 (CDN).

**Spec:** `docs/superpowers/specs/2026-10-18-look-carnet-design.md`. Maquette : `designs/supersets/supersets.html` (.h1, .item, .log/.lr, .kick, .btn-go, .btn-line, .sheet).

## Global Constraints

- Tokens Carnet exacts : paper `#EEEDE8`, sheet `#F7F6F2`, ink `#1B1C1F`, mut `#6F6C64`, rule `#D6D3C9`, hl `#FFE45C`, done `#1E6B4A`, alert `#A8321F`.
- `hl` uniquement en fond sous texte `ink`, une seule zone `hl` par écran ; `alert` en texte ou petite pastille (PR, baisse, « Supprimer »).
- Métriques sans couleur : `ink` en IBM Plex Mono ; hausse en `done`, baisse en `alert`, stable en `mut`.
- Aucun texte < 12 px, plus de sur-titres en majuscules espacées.
- Aucune logique modifiée : mêmes ids, handlers, data-*, libellés (casse des sur-titres exceptée).
- Nombres affichés avec virgule française via `formatKg` (déjà dans app.js), jamais dans les valeurs d'input.
- Pièges : preflight Tailwind désactivé (`border-solid` obligatoire avec une largeur de bordure) ; chaque écran migré pose `bg-paper text-ink` (le `body` reste sombre jusqu'au lot 4).
- `CACHE_NAME` bumpé ; tout nouveau script/feuille local de `index.html` ajouté à `SHELL` (le test `tests/service-worker-shell.test.js` le vérifie).

## Review Focus

- Une séance sans exercice ou un cardio (volume 0 kg) dans l'historique : pas de « 0 kg » trompeur ni de ligne vide cassée.
- Détail d'une séance en cours (« Reprendre ») vs terminée : boutons au bon endroit, « Supprimer » en `alert` texte, jamais en aplat.
- Graphique avec un seul point ou 5 exercices : couleurs distinguables en Carnet (ink, done, mut, alert…), légende lisible.
- Retour IA long dans le détail : texte qui passe à la ligne, pas de débordement à 390 px.
- Titre de programme avec « & » : affiché une seule fois échappé (corrigé au lot 1, ne pas régresser).

---

### Task 1: Historique et détail de séance

**Files:** `app.js` (`renderHistory`, `resumeSessionFromHistory`, `openModal`, `closeModal`, `generateAndPersistFeedback`, `formatFeedback`), `index.html` (blocs `HISTORIQUE`, `MODAL DÉTAIL SÉANCE`), `style.css` (`.modal*`, `.series-not-done`, `.feedback-ia*`), `tests/carnet-tokens.test.js`, `dist/output.css`, `service-worker.js`.

- [ ] Tests : `renderHistory`, `resumeSessionFromHistory`, `openModal`, `closeModal`, `formatFeedback` ajoutés à `MIGRATED_FUNCTIONS` ; blocs `HISTORIQUE` et `MODAL DÉTAIL SÉANCE` à `MIGRATED_HTML_BLOCKS` ; sélecteurs `.modal` et `.series-not-done` à `MIGRATED_CSS_SELECTORS`. Plus un test `it('detail modal has no hard-coded colour')` : `functionSource('app.js','openModal')` ne contient aucun `#[0-9a-fA-F]{3,6}\b` (aujourd'hui `#ff5c5c` sur l'erreur IA → `text-alert`). `npx vitest run tests/carnet-tokens.test.js` → RED constaté (noter les cas rouges dans le rapport).
- [ ] Repeindre : en-tête et H1 Newsreader (« Tes *séances.* », `em` en `mut`), mois en sous-titres Newsreader italique avec total tonnage mono à droite, séances en `.item` (nom italique 700, date/durée/nb d'exos 13 px `mut`, volume mono `ink`), séance en cours surlignée (`.mark`, la seule). Modale = feuille `sheet` plein écran, filet 1,5 px `ink`, stats 3 colonnes mono, tableau-carnet `.log/.lr` par exercice (fait en `done`, non fait en `mut`), retour IA en bloc `sheet` texte 15 px, « Reprendre » bouton plein `ink`, « Supprimer » texte `alert`. Retirer l'emoji 🤖 des titres « Feedback IA » (comme 💡 au lot 1). Toutes les règles `.modal*` de `style.css` passent aux variables Carnet (`.modal` n'est utilisé que par `#modal` ; `.modal-title` sert aussi aux modales conseil/question du lot 3, qui imposent leur couleur en ligne : sans effet de bord).
- [ ] `npm run css`, `npx vitest run` → PASS ; captures `history`, `history-modal` regardées.
- [ ] Commit `feat(carnet): historique et détail de séance`.

### Task 2: Stats et graphiques

**Files:** `app.js` (`renderStats`, `statsSection`, `exoMetrics`, `buildStatsProgression`, `drawCorpsChart` NON — lot 3), `index.html` (bloc `STATS`), `tests/carnet-tokens.test.js`, `dist/output.css`.

- [ ] Tests : `renderStats`, `statsSection`, `exoMetrics`, `buildStatsProgression` ajoutés à `MIGRATED_FUNCTIONS`, bloc `STATS` à `MIGRATED_HTML_BLOCKS`. Nouveau helper `carnetColor(name)` (lit `getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim()`) ajouté à `MIGRATED_FUNCTIONS`. Test `it('chart colours come from Carnet CSS variables')` : `functionSource('app.js','buildStatsProgression')` ne contient aucun `#[0-9a-fA-F]{3,6}\b` ni `'DM Sans'`, et la constante `CHART_COLORS` (hex Direction A, `app.js` ligne ~4379) n'existe plus dans `app.js`. `backgroundColor: color + '22'` reste valable car les variables Carnet sont des hex à 6 chiffres. RED constaté.
- [ ] Repeindre : pastilles programme (actif = fond `ink` texte `paper`, autres contour `rule`), bascule de métrique en onglets façon `.tabs`, cartes exercice en `.item` avec delta `done`/`alert`/`mut`, graphique : séries dans l'ordre `ink`, `done`, `mut`, `alert` (uniquement des tokens) ; au-delà de 4 séries, `ink` en pointillé (`borderDash`) puis `done` en pointillé. Axes et grille `rule`, libellés `mut` IBM Plex Mono 12 px, infobulle fond `ink` texte `paper`.
- [ ] `npm run css`, `npx vitest run` → PASS ; capture `stats` regardée.
- [ ] Commit `feat(carnet): stats et graphiques`.
