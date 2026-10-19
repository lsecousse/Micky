# Look Carnet — lot 5 (icône, splash, écran de chargement, manifest) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Passer l'identité de l'app installée au Carnet : icônes et favicon « M&K » encre sur papier avec trait surligneur, splashs papier, écran de chargement papier, manifest clair ; mettre à jour les sections PWA/Design obsolètes de `.claude/CLAUDE.md`.

**Architecture:** Les PNG restent générés par `generate-assets.js` (node-canvas, déjà en devDependency) à partir d'une police TTF locale dans `fonts/`. Newsreader n'existe sur Google Fonts qu'en police variable (`Newsreader[opsz,wght].ttf`) : on en tire des instances statiques (fontTools `varLib.instancer`, outil lancé une fois hors dépôt, depuis un venv du scratchpad) committées dans `fonts/` avec leur `OFL.txt`. L'écran de chargement garde son image pré-rendue (`icons/wordmark.png`) pour ne pas dépendre du chargement des polices web.

**Tech Stack:** Node + canvas 3, vitest 4, Tailwind CLI 3.4.

**Spec:** `docs/superpowers/specs/2026-10-18-look-carnet-design.md` (lot 5). Décision Lionel #1893 : « Tout en Carnet : « M&K » encre sur papier #EEEDE8 en Newsreader avec un trait surligneur jaune, splash papier, barre d'état claire (tu réinstalles la PWA une fois) ».

## Global Constraints

- Couleurs : papier `#EEEDE8`, encre `#1B1C1F`, surligneur `#FFE45C`, gris `#6F6C64`. Aucune autre couleur dans les PNG.
- « M&K » en Newsreader (graisse 500 ou 700, optique display), encre ; un trait surligneur `#FFE45C` **derrière** le bas des lettres (comme `.mark` : bande horizontale de ~35-40 % de la hauteur des capitales, sous le texte), jamais du jaune en couleur de texte.
- Icônes maskable : tout le contenu dans la zone sûre centrale (cercle de 80 % du côté) ; fond papier plein jusqu'aux bords (pas de coins arrondis dessinés : l'OS masque).
- Splashs : fond papier plein, wordmark centré ; mêmes 15 tailles qu'aujourd'hui (liste dans `generate-assets.js`). Les liens `apple-touch-startup-image` restent absents d'`index.html` (retirés volontairement par Lionel au commit 3cdaed3, « remplacés par loading screen animé ») : ne pas les remettre.
- `manifest.json` : `theme_color` et `background_color` = `#EEEDE8` ; nom inchangé (« Mike Coach »).
- Écran de chargement : fond papier, image `wordmark.png` régénérée (« M&K » + « Mike Coach. »), version en 12-13 px `mut` sans majuscules espacées.
- Aucun texte < 12 px ; pas de logique modifiée.
- `CACHE_NAME` = `mikecoach-` + horodatage réel à la seconde (`date +%Y%m%d%H%M%S`).
- Ne pas toucher : `renderParams`, `#screen-params`, `openProgrammeEditor`, `exercise-editor.js` (micky-supersets-ecrans) ; le fond du `body` (passe en papier au premier lot après son lot B).

## Review Focus

- Icône 192 px vue en petit sur l'écran d'accueil iOS : « M&K » lisible, surligneur visible, rien de rogné par le masque arrondi.
- Favicon 32 px : lisible (un « M » seul ou « M&K » serré, au choix du rendu le plus net), mêmes couleurs.
- Splash iPad (2048×2732) et petit iPhone (640×1136) : wordmark centré, proportionné, pas de débordement.
- Écran de chargement : pas de flash sombre au lancement (fond `#loading-screen` papier, `theme-color` déjà clair).
- Réinstallation : l'icône change seulement après réinstallation de la PWA (à dire à Lionel).

---

### Task 1: Générateur et images

**Files:** `fonts/` (instances statiques Newsreader + `OFL.txt` ; les Fraunces restent si `backoffice` ou autre les utilise, sinon supprimées), `generate-assets.js`, `generate-icons.js` (ancien générateur « GT » orange : à supprimer s'il n'est appelé par rien — vérifier `package.json` et la doc), `icons/icon-192.png`, `icons/icon-512.png`, `icons/favicon.png`, `icons/wordmark.png`, `icons/splash/*.png`, `manifest.json`, `tests/` (nouveau `tests/pwa-identity.test.js`).

- [ ] Tests (`tests/pwa-identity.test.js`, `describe('pwaIdentityShould')`) : `manifest.json` a `theme_color` et `background_color` = `#EEEDE8` ; `generate-assets.js` déclare exactement les hex papier/encre/surligneur Carnet et aucun hex Direction A (`#0A0A0A`, `#F5F4F0`, `#84CC16`, `#888888`) ni `Fraunces` ; les PNG `icon-192`, `icon-512` ont les bonnes dimensions et un pixel de coin = papier `#EEEDE8` (lecture via `canvas` `loadImage`) ; un splash a un pixel de coin papier. RED constaté.
- [ ] Instancier Newsreader (fontTools dans un venv du scratchpad, hors dépôt), committer les TTF statiques nécessaires + `OFL.txt` ; réécrire `generate-assets.js` (tokens Carnet, `drawMonogram` encre + surligneur, wordmark « M&K » + « Mike Coach. » en Newsreader italique, favicon) ; lancer `node generate-assets.js` ; regarder icône 512, 192, favicon, wordmark, un splash iPhone et un splash iPad (Read sur les PNG).
- [ ] `npx vitest run` → PASS.
- [ ] Commit `feat(carnet): icônes, splashs et manifest M&K`.

### Task 2: Écran de chargement et CLAUDE.md

**Files:** `index.html` (bloc `LOADING SCREEN`), `style.css` (`#loading-screen` si une couleur y est), `app.js` (texte de version `#loading-sub` si stylé en JS), `tests/carnet-tokens.test.js`, `.claude/CLAUDE.md`, `dist/output.css`, `service-worker.js`.

- [ ] Tests : bloc `LOADING SCREEN` ajouté à `MIGRATED_HTML_BLOCKS`, `#loading-screen` à `MIGRATED_CSS_SELECTORS` ; test `it('CLAUDE.md no longer describes the dark orange PWA')` : `.claude/CLAUDE.md` ne contient plus `#FF6B00`, `#0f0f0f`, `Gym Tracker`, `black-translucent`, ni « Thème sombre ». RED constaté.
- [ ] Écran de chargement : `bg-paper`, image régénérée, version en `text-[13px] text-mut`. Commentaire du bloc mis à jour (plus « Fraunces »).
- [ ] `.claude/CLAUDE.md` : sections « Structure cible », « PWA », « Script generate-assets.js », « Design », « Données », « Instructions Claude Code » réécrites pour l'état réel : nom Mike Coach, manifest papier `#EEEDE8`, barre d'état `default`, pas de splash iOS (écran de chargement), `generate-assets.js` Carnet (Newsreader locale, 15 splashs, icônes maskable), Supabase comme stockage (plus localStorage `gym_sessions`). Garder intactes les sections « Frontend », « Design system — Carnet », « Output structure », « Language ».
- [ ] `npm run css`, `npx vitest run` → PASS ; capture `loading` regardée.
- [ ] Commit `feat(carnet): écran de chargement papier et CLAUDE.md à jour`.
