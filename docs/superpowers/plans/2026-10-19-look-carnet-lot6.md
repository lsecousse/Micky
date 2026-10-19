# Look Carnet — lot 6 (back-office) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser la base Carnet du back-office coach (polices, variables CSS, boutons, fenêtres) et repeindre tous ses écrans sauf l'éditeur de programme, qui reste à micky-supersets-ecrans (lot C, il s'appuiera sur ces variables).

**Architecture:** `backoffice.html` a son propre `<style>` (variables `--bg`, `--surface`, `--accent`… Direction A, polices Fraunces / DM Sans) et ne charge ni `style.css` ni `dist/output.css`. On y définit les variables Carnet `--paper` … `--alert` et les polices `--f-display` / `--f-sans` / `--f-mono`, et on **réaffecte les anciens noms** (`--bg` → papier, `--surface` → sheet, `--text` → encre, `--muted` → mut, `--border` → rule, `--danger` → alert, `--accent` → encre) pour que toute règle encore fondée sur eux — notamment celles de l'éditeur — suive la base et reste lisible. Les écrans hors éditeur passent ensuite aux variables Carnet par leur nom. Les couleurs des graphiques Chart.js sont lues dans les variables CSS (même principe que `carnetColor` dans `app.js`). Référence visuelle : écran 07 « Back-office coach » de `designs/supersets/supersets.html` (l. 485 et suivantes).

**Tech Stack:** HTML/JS vanilla, Chart.js 4, vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-18-look-carnet-design.md` (lot 6). Décisions de l'orchestrateur (2026-10-19) : partage avec le lot C ; `renderProgrammeList` et `showCopyProgrammeModal` sont dans ce lot ; retrait des `a-*` et `body` papier de l'app = PR finale de nettoyage, **pas ici**.

## Périmètre

- **À ce lot** : `<head>`/`<style>` de `backoffice.html` (sauf les règles propres à l'éditeur), markup de `backoffice.html` hors éditeur, et dans `backoffice.js` : `stateLabel`, `renderLogin`, `logout`, `renderDashboard`, `renderClientList`, `selectClient`, `renderClientDetail`, `renderDetailBody`, `renderProgrammeList`, `showCopyProgrammeModal`, `renderSessionList`, `renderUserData`, `saveMesures`, `renderBodyTracking`, `boStatsSection`, `boExoMetrics`, `boStatsProgression`, `showConfirmModal`, `sendInvite`, `showSuccessModal`, `showAddClientModal`, `deleteClient`.
- **Interdit (lot C)** : `renderProgrammeEditor`, `refreshEstimateHeader`, `promptEstOverride`, `renderCatalogSidebar`, `renderMuscleChips`, `renderCatalogList`, `openCatalogForm`, `renderProgrammeZone`, `makeProgrammeCard`, `moveExo`, `deleteExoFromProgramme`, `openExoModal`, `saveProgramme` (backoffice.js l. 347-810), leurs règles CSS propres, et `exercise-editor.js`. Exception : si l'éditeur devient illisible avec la nouvelle base (capture), ajouter **le strict minimum** (une variable, une règle) et le lister dans la PR.

## Global Constraints

- Tokens Carnet exacts : paper `#EEEDE8`, sheet `#F7F6F2`, ink `#1B1C1F`, mut `#6F6C64`, rule `#D6D3C9`, hl `#FFE45C`, done `#1E6B4A`, alert `#A8321F`. Polices : Newsreader (titres, noms en italique), IBM Plex Sans (texte), IBM Plex Mono (chiffres) ; lien Google Fonts identique à celui d'`index.html` ; plus de Fraunces ni DM Sans.
- `hl` : fond sous texte encre, une seule zone par écran (client sélectionné ou élément en cours) ; `alert` en texte ou petite pastille (suppression, échec, baisse) ; `done` pour fait / hausse ; métriques en mono encre.
- Statuts de client (`.bo-state--*`) : sans couleurs nouvelles — nouveau `mut`, invité `ink` contour, mot de passe créé `ink`, connecté `done`.
- Boutons : primaire fond encre texte papier ; secondaire contour 1,5 px encre ; danger texte `alert` (jamais en aplat) ; rayon 6 px. Fond des fenêtres : `sheet`, voile `rgba(27,28,31,.4)`.
- Aucun texte < 12 px, pas de sur-titres en majuscules espacées. C'est une interface PC (souris/clavier) : états `:hover` / `:focus-visible` visibles en encre.
- Aucune logique modifiée (ids, handlers, data-*, libellés hors casse et emoji).
- `CACHE_NAME` (service-worker.js) : le back-office n'est pas dans `SHELL` ; ne bumper que si un fichier de `SHELL` change.

## Review Focus

- Éditeur de programme du back-office (lot C) : lisible après la nouvelle base (capture obligatoire), aucune de ses fonctions modifiée.
- Liste de 30 clients et nom de client très long : pas de débordement de la colonne.
- Graphiques corps et stats avec 1 ou 6 courbes : couleurs Carnet seulement (encre, vert, gris, puis pointillés), jamais `alert` pour une courbe.
- Fenêtre « Ajouter un client » / invitation : erreurs `alert`, succès `done`, lisibles.
- Écran de connexion du back-office : erreur d'identifiants visible.

---

### Task 1: Base Carnet et harnais de captures du back-office

**Files:** `backoffice.html` (`<head>`, `<style>` : `:root`, `body`, login, boutons `.btn-*`, fenêtres, `.bo-state--*`, `.bo-fab`), `tests/backoffice-carnet.test.js` (nouveau, `describe('backofficeCarnetShould')`), harnais de captures (scratchpad, hors dépôt).

- [ ] Harnais : ajouter des scénarios back-office au harnais du scratchpad (Supabase simulé, aucune requête réelle) : `bo-login`, `bo-login-error`, `bo-dashboard` (liste de clients avec les 4 statuts), `bo-client-programmes`, `bo-client-sessions`, `bo-client-data`, `bo-client-body`, `bo-client-stats`, `bo-editor` (éditeur de programme ouvert), `bo-add-client`, `bo-confirm`. Les capturer **sur origin/main** (référence « avant ») à 1440×900.
- [ ] Tests : `backoffice.html` charge le lien de polices Carnet exact d'`index.html` et plus `Fraunces` / `DM Sans` ; `:root` définit `--paper` … `--alert` aux hex exacts ; les anciens noms `--bg`, `--surface`, `--text`, `--muted`, `--border`, `--danger`, `--accent` pointent vers une variable Carnet (`var(--…)`) ; les règles `.btn-*`, `.bo-state--`, `.bo-fab`, `.login` ne contiennent aucun hex Direction A (`#0A0A0A`, `#F5F4F0`, `#84CC16`, `#888888`, `#2A2A2A`, `#DC2626`, `#FACC15`, `#06B6D4`) ni `rgba(132,204,22`. RED constaté.
- [ ] Implémenter la base ; capturer tous les scénarios ; vérifier en particulier `bo-editor` (lisible ?).
- [ ] `npx vitest run` → PASS. Commit `feat(carnet): base Carnet du back-office`.

### Task 2: Écrans du back-office hors éditeur

**Files:** `backoffice.html` (markup et règles CSS des écrans du périmètre), `backoffice.js` (fonctions du périmètre), `tests/backoffice-carnet.test.js`.

- [ ] Tests : pour chaque fonction du périmètre, le source (helper `functionSource` à partager ou recopier depuis `tests/carnet-tokens.test.js`) ne contient aucun hex en dur (`#[0-9a-fA-F]{3,6}\b`), ni `'DM Sans'`, ni `Fraunces` ; helper `boColor(name)` qui lit la variable CSS (`getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim()`) ; la palette de `boStatsProgression` (constante l. ~1136) disparaît au profit de `boColor` (encre, done, mut puis pointillés ; jamais `alert`) ; `.stats-exo-delta.up/.down` en `var(--done)` / `var(--alert)`. RED constaté.
- [ ] Repeindre d'après l'écran 07 : en-tête et colonne clients (client sélectionné en `hl`), fiche client et onglets (onglet actif = texte encre gras + trait 3 px encre), listes en lignes de carnet, chiffres en mono, graphiques (axes et grille `rule`, libellés `mut` IBM Plex Mono 12 px, infobulle fond encre texte papier), fenêtres (`sheet`, titres Newsreader).
- [ ] Captures de tous les scénarios regardées, éditeur compris.
- [ ] `npx vitest run` → PASS. Commit `feat(carnet): écrans du back-office`.
