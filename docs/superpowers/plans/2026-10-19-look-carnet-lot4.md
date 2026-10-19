# Look Carnet — lot 4 (connexion, profil, clé Claude, set-password) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repeindre la connexion, le profil, la clé API Claude et la page de création de mot de passe (`set-password.html`) dans le look Carnet, sans toucher à la logique.

**Architecture:** Même méthode que les lots 1 à 3 : chaque fonction et bloc HTML migré entre dans les listes de `tests/carnet-tokens.test.js`. `set-password.html` est une page autonome à `<style>` en ligne (elle ne charge ni `dist/output.css` ni `style.css`) : ses variables CSS reprennent les hex Carnet et elle charge les polices Carnet.

**Périmètre (décision orchestrateur 2026-10-19, option A) :** la liste des programmes (`renderParams`, en-tête `#screen-params`, bloc `<!-- PARAMÈTRES -->`) et l'éditeur de programme (`openProgrammeEditor`, `exercise-editor.js`) sont repeints par micky-supersets-ecrans (son lot B) : **ne pas y toucher**. Le passage du `body` en papier se fait au premier lot de micky-look-carnet fusionné après ce lot B, pas ici.

**Tech Stack:** HTML vanilla, Tailwind CLI 3.4 (`npm run css` → `dist/output.css`, committé), vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-18-look-carnet-design.md` (lot 4).

## Global Constraints

- Tokens Carnet exacts : paper `#EEEDE8`, sheet `#F7F6F2`, ink `#1B1C1F`, mut `#6F6C64`, rule `#D6D3C9`, hl `#FFE45C`, done `#1E6B4A`, alert `#A8321F`.
- `hl` uniquement en fond sous texte `ink`, une seule zone par écran ; `alert` en texte ou petite pastille (erreur de connexion, déconnexion, suppression de clé), jamais en aplat.
- Aucun texte < 12 px, plus de sur-titres en majuscules espacées (phrases 12-13 px `mut`), pas d'emoji dans les titres.
- Aucune logique modifiée : mêmes ids, handlers, data-*, `name`/`type`/`autocomplete` des champs, libellés (casse des sur-titres et emoji exceptés). La clé API n'est jamais affichée en clair plus qu'aujourd'hui.
- Pièges : preflight Tailwind désactivé (`border-solid` obligatoire avec une largeur de bordure) ; chaque écran migré pose `bg-paper text-ink` (le `body` reste sombre) ; en-têtes d'écran sur le modèle déjà migré `HISTORIQUE` / `STATS` (flèche avec `aria-label="Retour"`, titre Newsreader italique, filet 1,5 px `ink`).
- `CACHE_NAME` = `mikecoach-` + horodatage réel à la seconde (`date +%Y%m%d%H%M%S`), jamais une valeur ronde.

## Review Focus

- Connexion : erreur d'identifiants affichée en `alert` texte, lisible ; clavier iOS qui remonte (champ visible), autoremplissage du mot de passe intact (`autocomplete`).
- Profil : nom long ou e-mail long qui passe à la ligne à 390 px ; bouton de déconnexion distinct (contour ou texte `alert`), jamais en aplat.
- Clé Claude : clé absente / présente / en cours d'enregistrement ; message d'erreur ou de succès (`done`) lisible.
- `set-password.html` : jeton invalide ou expiré, mots de passe différents → message `alert` texte ; page lisible à 390 px sans `dist/output.css`.
- Accueil : le menu utilisateur (`buildUserDropdown`, lot 1) mène bien au profil et à la clé Claude repeints.

---

### Task 1: Connexion, profil, clé Claude

**Files:** `app.js` (`renderLogin`, `renderProfil`, `renderClaudeApi`, et leurs helpers d'affichage s'il y en a), `index.html` (blocs `PROFIL`, `CLÉ API CLAUDE`, `LOGIN`), `style.css` (règles propres à ces écrans s'il y en a), `tests/carnet-tokens.test.js`, `dist/output.css`, `service-worker.js`.

- [ ] Tests : les fonctions ajoutées à `MIGRATED_FUNCTIONS`, les 3 blocs à `MIGRATED_HTML_BLOCKS` ; test `it('account screens have no inline colour')` : `functionSource` de chacune ne contient ni `#[0-9a-fA-F]{3,6}\b` ni `var(--bg)` / `var(--text` / `var(--a-`. RED constaté.
- [ ] Repeindre : connexion = page papier, wordmark « M&K » en Newsreader avec trait surligneur (`.mark`, la seule zone `hl`), champs fond `sheet` filet `rule`, bouton plein `ink` ; profil et clé Claude = en-tête Carnet, H1 Newsreader (« Ton *profil.* », « Ta *clé.* »), lignes `.item`, boutons plein / contour, déconnexion et suppression en texte `alert`.
- [ ] `npm run css`, `npx vitest run` → PASS ; captures `login`, `profil` et un scénario `claude-api` (à ajouter au harnais, tout simulé) regardées.
- [ ] Commit `feat(carnet): connexion, profil et clé Claude`.

### Task 2: Page de création de mot de passe

**Files:** `set-password.html`, `tests/carnet-tokens.test.js`.

- [ ] Tests : `it('set-password page uses Carnet colours and fonts')` : le fichier contient les hex `#EEEDE8`, `#1B1C1F`, `#A8321F`, le lien Google Fonts Carnet (même famille que `index.html`), aucun hex Direction A ni `DM Mono` / `#9A7A30` / `#0f0f0f`. RED constaté.
- [ ] Repeindre le `<style>` : variables `--paper` … `--alert` aux hex Carnet, titre Newsreader, texte IBM Plex Sans 15 px, champs `sheet` filet `rule`, bouton plein `ink` texte `paper`, erreurs `alert`, succès `done`. Aucun changement du script.
- [ ] `npx vitest run` → PASS ; capture de la page (scénario `set-password` à ajouter au harnais, Supabase simulé) regardée, avec un état d'erreur.
- [ ] Commit `feat(carnet): page de création de mot de passe`.
