# Look Carnet — lot 3 (alimentation, corps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repeindre l'alimentation (avec ses modales repas, préréglages, photo, conseil du soir, question) et la composition corporelle (avec son graphique et son analyse) dans le look Carnet, sans toucher à la logique ; solder les mineurs reportés du lot 2.

**Architecture:** Même méthode que les lots 1 et 2 : chaque fonction, bloc HTML et sélecteur CSS migré entre dans les listes de `tests/carnet-tokens.test.js`, qui interdisent tout reste Direction A. Le graphique corps lit ses couleurs avec `carnetColor(name)` (lot 2). Écrans dessinés à la main d'après le Carnet (aucune maquette dédiée : appliquer le DS, s'inspirer de `.item`, `.log/.lr`, `.sheet`, `.btn-go`, `.btn-line` de `designs/supersets/supersets.html` et des écrans déjà migrés : `renderHistory`, `openModal`, `buildStatsProgression`, `openEditModalForActivity`).

**Tech Stack:** HTML vanilla, Tailwind CLI 3.4 (`npm run css` → `dist/output.css`, committé), vitest 4, Chart.js 4 (CDN) / canvas 2D (graphique corps).

**Spec:** `docs/superpowers/specs/2026-10-18-look-carnet-design.md` (lot 3 : « Alimentation (+ modales repas, conseil, question), corps (+ analyse) »).

## Global Constraints

- Tokens Carnet exacts : paper `#EEEDE8`, sheet `#F7F6F2`, ink `#1B1C1F`, mut `#6F6C64`, rule `#D6D3C9`, hl `#FFE45C`, done `#1E6B4A`, alert `#A8321F`.
- `hl` uniquement en fond sous texte `ink`, une seule zone `hl` par écran ; `alert` en texte ou petite pastille (dépassement, baisse, « Supprimer »), jamais en aplat.
- Métriques sans couleur : `ink` en IBM Plex Mono ; hausse/objectif atteint `done`, baisse/dépassement `alert`, stable `mut`. Les macros (P/G/L) ne reçoivent PAS chacune une couleur : mono `ink`, libellé `mut`.
- Aucun texte < 12 px, plus de sur-titres en majuscules espacées (phrases 12-13 px `mut`). Pas d'emoji dans les titres (🌙, 💬, 🤖…).
- Aucune logique modifiée : mêmes ids, handlers, data-*, libellés (casse des sur-titres et emoji exceptés).
- Nombres affichés avec virgule française via `formatKg` quand ce sont des décimaux (poids, %, kg de masse), jamais dans les valeurs d'input.
- Pièges : preflight Tailwind désactivé (`border-solid` obligatoire avec une largeur de bordure) ; chaque écran migré pose `bg-paper text-ink` (le `body` reste sombre jusqu'au lot 4). Les modales repas/préréglage utilisent `.live-edit-modal` (déjà Carnet au lot 1) : retirer leurs surcharges `!bg-a-*`.
- Aucun style en ligne de couleur (`style="...#hex..."`, `var(--bg)`, `var(--a-*)`, `var(--text)`) dans les fonctions migrées : classes Tailwind Carnet.
- `CACHE_NAME` bumpé ; tout nouveau script/feuille local de `index.html` ajouté à `SHELL`.

## Review Focus

- Journée vide (aucun repas) et journée avec dépassement calorique : pas de « 0 » trompeur, dépassement en `alert` texte uniquement.
- Conseil du soir : fil de conversation long (5 échanges) → défilement interne, bulles utilisateur distinctes de celles de l'IA sans couleur nouvelle (fond `paper` vs `sheet`, ou filet), champ de saisie lisible.
- Photo de repas absente / présente : vignette sans cadre cassé.
- Corps avec 0, 1 ou 2+ mesures : graphique masqué ou lisible, tendance `done`/`alert`/`mut`.
- Analyse corporelle (popup) et analyse dans la page (`.corps-analysis`) : texte long qui passe à la ligne à 390 px.

---

### Task 1: Alimentation et ses modales

**Files:** `app.js` (`renderMealPresetButtons`, `renderAlimentation`, `showFoodPhotoModal`, `openAddMealModal`, `openMealPresetEditModal`, `openEveningAdviceModal`, `openAskQuestionModal`), `index.html` (blocs `ALIMENTATION`, `MODAL AJOUTER REPAS`, `MODAL PRESET PETIT-DEJ`), `style.css` (`.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`, `.btn-sm`, `.btn-full` : utilisés uniquement par les deux modales conseil/question dans `app.js` — `backoffice.html` et `set-password.html` ne chargent pas `style.css` — donc à supprimer une fois ces boutons passés en classes Tailwind ; `.feedback-ia-loading`, `.feedback-ia-spinner` s'ils ne servent plus), `tests/carnet-tokens.test.js`, `dist/output.css`, `service-worker.js`.

- [ ] Tests : les 7 fonctions ajoutées à `MIGRATED_FUNCTIONS` ; les 3 blocs à `MIGRATED_HTML_BLOCKS`. Nouveau test `it('alimentation modals have no inline colour')` : pour `openEveningAdviceModal`, `openAskQuestionModal`, `openAddMealModal`, `openMealPresetEditModal`, `functionSource` ne contient ni `#[0-9a-fA-F]{3,6}\b`, ni `var(--bg)`, ni `var(--a-`, ni `var(--text`. Nouveau test `it('legacy .btn-* rules are gone')` : `style.css` ne contient plus de sélecteur `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-ghost`, et `app.js` n'emploie plus ces classes ni `btn-disabled`. `npx vitest run tests/carnet-tokens.test.js` → RED constaté.
- [ ] Repeindre : écran « Ton *assiette.* » (H1 Newsreader, `em` `mut`) avec navigation de date, bilan du jour en chiffres mono (kcal, P/G/L), repas en `.item` (heure mono `mut`, description, kcal mono `ink` à droite), préréglages en boutons contour 1,5 px `ink`, actions principales (ajouter, conseil, question) en bouton plein `ink` / contour. Modales : feuille `sheet` (cadre `.live-edit-modal` ou `#modal` existant), titres Newsreader sans emoji, champs fond `paper` filet `rule` texte `ink` 15 px, boutons plein `ink` / contour `ink`, « Supprimer » texte `alert`. Fil du conseil : bulles IA sans fond (texte `ink`), bulles utilisateur fond `paper` filet `rule`, aligné à droite.
- [ ] `npm run css`, `npx vitest run` → PASS ; captures `alimentation` regardées (et toute modale atteignable) ; console sans erreur.
- [ ] Commit `feat(carnet): alimentation et ses fenêtres`.

### Task 2: Composition corporelle

**Files:** `app.js` (`renderCorps`, `drawCorpsChart`, `closeBodyAnalysisPopup`, et toute fonction d'affichage corps entre `fatCategory` et `drawCorpsChart` qui produit du markup), `index.html` (bloc `COMPOSITION CORPORELLE`), `style.css` (`.corps-analysis*`), `tests/carnet-tokens.test.js`, `dist/output.css`.

- [ ] Tests : fonctions ajoutées à `MIGRATED_FUNCTIONS`, bloc à `MIGRATED_HTML_BLOCKS`, `.corps-analysis` à `MIGRATED_CSS_SELECTORS`. Nouveau test `it('corps chart colours come from Carnet CSS variables')` : `functionSource('app.js','drawCorpsChart')` ne contient aucun `#[0-9a-fA-F]{3,6}\b` ni `DM Sans`, et contient `carnetColor(`. RED constaté.
- [ ] Repeindre : « Ton *corps.* », dernière mesure en chiffres mono (poids, % gras, masse maigre…) avec tendance `done`/`alert`/`mut`, catégorie de masse grasse en texte `mut` (pas de couleur par catégorie), historique des mesures en tableau-carnet `.log/.lr`, formulaire de saisie en champs `paper` filet `rule`, graphique canvas : courbe `ink` 2 px, points `ink`, grille et axes `rule`, libellés `mut` IBM Plex Mono 12 px. Analyse dans la page (`.corps-analysis`) au même look que `feedbackCard`.
- [ ] `npm run css`, `npx vitest run` → PASS ; capture `corps` regardée.
- [ ] Commit `feat(carnet): composition corporelle`.

### Task 3: Mineurs reportés du lot 2

**Files:** `app.js` (`buildStatsProgression`, `renderHistory`, `closeModal`/gestionnaire du fond de `#modal`), `tests/carnet-tokens.test.js` si un test est pertinent.

- [ ] Stats : libellés de l'axe des dates en `JJ/MM` (aujourd'hui `MM/DD`, ex. « 08/18 » → « 18/08 ») ; test : `functionSource('app.js','buildStatsProgression')` ne contient plus `d.slice(5).replace('-', '/')`. RED constaté.
- [ ] Stats : espace insécable fine (U+202F) entre nombre et unité dans les cartes (`2 375 kg`, `+33 %`) au lieu d'une espace pleine.
- [ ] Historique : le titre de séance dans le `<button>` devient un `<span class="block …">` (pas de `<h3>` dans un bouton).
- [ ] Gestionnaire « clic sur le fond » de `#modal` : le garder s'il sert encore à une modale non plein écran, sinon le retirer ; dire lequel dans le rapport.
- [ ] `npx vitest run` → PASS ; captures `stats`, `history` regardées.
- [ ] Commit `fix(carnet): mineurs du lot 2 (dates JJ/MM, espaces, titres)`.
