# Look Carnet pour toute l'app — conception

Date : 2026-10-18. Exécutant : micky-look-carnet.

## Pourquoi

Pendant la maquette super sets, Lionel a demandé « On peut en profiter pour revoir completement le loook ? », a choisi « Piste 1 · Carnet » (`designs/supersets/pistes-look.html`), a validé la maquette (`designs/supersets/supersets.html`), puis a dit « oui, on fait ça » au passage de toute l'app au Carnet.

## Décisions de Lionel (Guichet, 2026-10-18)

| # | Sujet | Réponse |
|---|---|---|
| 1889 | Thème | « Clair partout : un seul thème, chantier le plus court (≈ 6 lots) » |
| 1890 | Back-office | « Oui, en dernier lot (≈ 1 lot de plus, après l'app mobile) » |
| 1893 | Icône, splash, barre d'état | « Tout en Carnet : « M&K » encre sur papier #EEEDE8 en Newsreader avec un trait surligneur jaune, splash papier, barre d'état claire (tu réinstalles la PWA une fois) » |
| 1894 | Ordre | « Séance d'abord : 1) couleurs + polices + accueil + séance live (liste, série, cardio, repos, chrono/minuterie) ; 2) historique + détail + stats ; 3) alimentation + corps ; 4) profil, connexion, clé Claude, paramètres + éditeur de programme ; 5) icône, splash, écran de chargement ; 6) back-office » — mis en ligne lot par lot |
| 1895 | AIDesigner | « On retire la règle AIDesigner du dépôt : la source de vérité devient la maquette Carnet, et les nouveaux écrans se dessinent à la main » |
| 1896 | Rouge | « Ajouter un rouge brique sourd #A8321F, au rôle unique « événement / attention » (PR, échec, suppression, baisse), jamais en grande surface » |

## Design system Carnet

Source : `designs/supersets/NOTES.md` et `supersets.html` (tokens, écrans 01 à 07).

| Token | Hex | Rôle unique |
|---|---|---|
| `paper` | `#EEEDE8` | fond de page |
| `sheet` | `#F7F6F2` | cartes, tiroirs, modales, ligne en préparation |
| `ink` | `#1B1C1F` | texte, filets forts (1,5 px), boutons pleins, barre de progression |
| `mut` | `#6F6C64` | texte secondaire, à venir, inactif |
| `rule` | `#D6D3C9` | lignes du carnet (1 px) |
| `hl` | `#FFE45C` | surligneur : **la seule chose à faire maintenant** (série en cours, décompte de repos, élément en cours). Toujours en **fond** sous un texte `ink`, jamais en couleur de texte |
| `done` | `#1E6B4A` | fait : « fait », séries finies, temps réellement pris, hausse |
| `alert` | `#A8321F` | événement / attention : PR, échec, suppression, baisse. Texte ou petite pastille, jamais en grande surface |

Polices : **Newsreader** (titres, noms d'exercices en italique), **IBM Plex Sans** (texte), **IBM Plex Mono** (chiffres : charges, reps, durées, décomptes, métriques). Rayon 6 px. Boutons : primaire = fond `ink`, texte `paper` ; secondaire = contour 1,5 px `ink`. Aucun texte sous 12 px dans toute l'app (la maquette n'en a aucun ; l'app en a ~130 entre 8 et 11 px, en majuscules espacées) : les sur-titres deviennent des phrases en 12-13 px `mut`, sans majuscules forcées.

### Correspondance Direction A → Carnet

| Direction A | Carnet |
|---|---|
| fond `ink` / `inkAlt` | `paper` / `sheet` |
| texte `paper`, `muted`, `todo` | `ink`, `mut`, `mut` |
| `border` | `rule` ; filets de structure (en-tête, dock, onglets, haut de tableau) en 1,5 px `ink` |
| `cyan` (mesure) | `ink` en IBM Plex Mono : plus de couleur pour les métriques |
| `acid` (validé) | `done` ; barre de progression en `ink` (maquette) |
| `racing` (en cours) | bande `hl` sous texte `ink` ; onglet actif = texte `ink` gras + trait 3 px `ink` (maquette `.tabs`) |
| `blood` | `alert` |
| Fraunces / DM Sans | Newsreader / IBM Plex Sans ; chiffres de séries en IBM Plex Mono |

## Architecture technique

1. **Collision de noms** : Direction A et Carnet ont toutes deux `ink` et `paper`, aux sens inversés. Premier commit du lot 1, mécanique : les tokens A deviennent `a-ink`, `a-inkAlt`, `a-paper`, `a-muted`, `a-border`, `a-todo`, `a-cyan`, `a-acid`, `a-racing`, `a-blood` partout (classes et variables CSS). Rendu identique prouvé par captures pixel à pixel avant/après. Les tokens Carnet prennent ensuite leurs vrais noms. Chaque lot fait disparaître les `a-*` de ses écrans ; le lot 6 retire les tokens A de `tailwind.config.js` et `src/input.css`.
2. **Tokens** dans `tailwind.config.js` (couleurs, `fontFamily` display/sans/mono, `borderRadius` 6 px) et en variables CSS `:root` dans `src/input.css` (pour `style.css` et Chart.js).
3. **Polices** par l'URL Google Fonts, comme aujourd'hui. Elles changent pour toute l'app dès le lot 1 (les classes `font-display`/`font-sans`/`font-mono` gardent leur nom) : les écrans encore noirs passent aussi en Newsreader/Plex.
4. **Barre d'état iOS** : passe au lot 1 (`apple-mobile-web-app-status-bar-style` = `default`, `theme-color` = `#EEEDE8`) : en `black-translucent`, l'heure et la batterie s'écrivent en blanc par-dessus la page, invisibles sur le papier de l'accueil. Écart à l'ordre #1894 (qui la range au lot 5), imposé par la technique. Le manifest, l'icône et le splash restent au lot 5.
5. **`style.css`** : les couleurs en dur (36 hex) migrent avec l'écran qui les utilise.
6. Pas de refonte de la logique : seules les classes, le markup de présentation et les couleurs changent. Exception : la structure d'écran que la maquette impose (séance live : bandeau surligné de la série en cours, dock du pouce avec CTA « puis … », tableau-carnet).

## Lots (une PR par lot, revue de Lionel, fusion avant le lot suivant)

| Lot | Contenu | Code principal |
|---|---|---|
| 1 | Renommage A → `a-*`, tokens + polices Carnet, barre d'état, `.claude/CLAUDE.md`, accueil, séance live : choix du programme, liste d'exercices, série en cours, repos (barre de décompte), cardio, chrono/minuterie, modale d'édition en séance, fin de séance | `index.html` (home, seance, overlays), `app.js` renderHome…finishSession, countdown, toast, `style.css` |
| 2 | Historique, détail de séance (modale), stats + Chart.js | renderHistory, openModal, renderStats, buildStatsProgression |
| 3 | Alimentation (+ modales repas, conseil, question), corps (+ analyse) | renderAlimentation, renderCorps et modales |
| 4 | Connexion, profil, clé Claude, paramètres, éditeur de programme mobile | renderLogin, renderProfil, renderClaudeApi, renderParams, `exercise-editor.js`, `set-password.html` |
| 5 | Icône M&K, 15 splash, écran de chargement (wordmark), manifest | `generate-icons.js`, `generate-assets.js`, `icons/`, `manifest.json` |
| 6 | Back-office (d'après l'écran 07), retrait des tokens A | `backoffice.html`, `backoffice.js` |

Chaque PR change des assets de l'app : bump de `CACHE_NAME` dans `service-worker.js`.

## `.claude/CLAUDE.md` du dépôt (lot 1)

- La section « Direction A — LOCKED » est remplacée par « Design system Carnet » (tableau ci-dessus, polices, rayon, règle des 12 px, règles d'usage : un seul `hl` à la fois, `alert` ponctuel, `done` domine en fin de séance) ; référence canonique : `designs/supersets/supersets.html`.
- La règle « Always start with AIDesigner » et ses sections sont retirées (#1895) : les écrans se dessinent à la main d'après le Carnet.
- Sections PWA/Design obsolètes (orange #FF6B00, #0f0f0f, « Gym Tracker ») : mises à jour au lot 5 avec le manifest.

## Tests et vérification

- **Test de garde** `tests/carnet-tokens.test.js` (vitest) : les tokens Carnet existent avec leurs hex exacts ; aucune classe `a-*` ni couleur A en dur dans les fonctions et blocs HTML déjà migrés (la liste grandit à chaque lot) ; au lot 6, plus aucun `a-*` dans le dépôt et plus de tokens A dans la config. Rouge prouvé avant chaque lot.
- **Captures** : harnais Playwright (390 × 844, Supabase entièrement simulé, aucune requête réelle) sur ~19 écrans, avant/après, regardées, publiées en Artifact pour la revue de Lionel.
- CI : `npm test`, `npm run css`, `dist/output.css` à jour.

## Hors périmètre

Mode sombre (#1889) ; changement de logique ou de libellés hors ce que la maquette impose ; super sets (exécutant micky-supersets) ; données Supabase (aucune écriture).
