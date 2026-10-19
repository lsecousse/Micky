# Mike Coach — PWA

Application de suivi de séances de musculation, optimisée iPhone et Android.

## Plateformes
- **index.html / app.js** → WebApp mobile (iPhone/Android), interactions tactiles (swipe, tap)
- **backoffice.html / backoffice.js** → Interface coach sur PC, interactions souris/clavier (clic, flèches)

## Structure
```
Micky/
├── index.html            # app mobile (écran de chargement inclus)
├── app.js, lib/          # logique, modules testés
├── style.css, src/input.css → dist/output.css (Tailwind CLI, committé)
├── manifest.json
├── service-worker.js
├── supabase.js           # client Supabase
├── backoffice.html / backoffice.js
├── generate-assets.js    # génère icons/ (node-canvas)
├── fonts/                # Newsreader statique (opsz 72) + OFL.txt, pour generate-assets.js
└── icons/
    ├── icon-192.png, icon-512.png   # maskable
    ├── favicon.png
    ├── wordmark.png                 # image de l'écran de chargement
    └── splash/                      # 15 splashs papier (non référencés par index.html)
```

## Fonctionnalités

### Onglet "Nouvelle séance"
- Champ nom de la séance + date (défaut : aujourd'hui)
- Ajout dynamique d'exercices : nom de la machine, puis N séries avec répétitions / poids (kg) / temps de repos (sec)
- Boutons pour ajouter ou supprimer une série, ajouter ou supprimer un exercice
- Bouton "Enregistrer"

### Onglet "Historique"
- Liste des séances triées par date décroissante
- Résumé : nom, date, nb d'exercices, volume total (kg × reps)
- Tap sur une séance → vue détail complète
- Possibilité de supprimer une séance

### Onglet "Données"
- Export JSON (toutes les séances → téléchargement fichier)
- Import JSON (merge avec l'existant)

## PWA

### manifest.json
- name / short_name « Mike Coach »
- display: standalone, orientation: portrait
- theme_color et background_color : `#EEEDE8` (papier)
- icônes 192×192 et 512×512, `purpose: "any maskable"`

### iOS — balises meta dans le <head>
```html
<meta name="theme-color" content="#EEEDE8" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Mike Coach" />
<link rel="apple-touch-icon" href="icons/icon-192.png" />
<link rel="icon" type="image/png" href="icons/favicon.png" />
```
- Barre d'état claire (`default`) sur fond papier.
- **Pas de splash iOS** : les liens `apple-touch-startup-image` ont été retirés volontairement (commit 3cdaed3) et remplacés par l'écran de chargement HTML `#loading-screen` (fond `bg-paper`, `icons/wordmark.png`, version en 13 px `text-mut`). Ne pas les remettre.
- Une nouvelle icône n'apparaît sur l'écran d'accueil qu'après réinstallation de la PWA.

### Android
- Le splashscreen Android est généré par Chrome à partir de `background_color` + icône 512 px du manifest.

### service-worker.js
- Cache du shell (`SHELL`) à l'installation, stratégie cache-first
- `CACHE_NAME = 'mikecoach-' + horodatage` (`date +%Y%m%d%H%M%S`) à changer à chaque livraison

## Script generate-assets.js

Script Node.js (`canvas`, déjà en dépendance) qui dessine l'identité Carnet. Polices : instances statiques de Newsreader dans `fonts/` (Bold et Medium Italic, optique 72, tirées de la police variable Google Fonts avec fontTools `varLib.instancer`, licence `fonts/OFL.txt`).

Couleurs : papier `#EEEDE8`, encre `#1B1C1F`, surligneur `#FFE45C`, rien d'autre.

- **Icônes** `icon-192.png`, `icon-512.png` (maskable) : fond papier plein jusqu'aux bords (l'OS arrondit), « M&K » Newsreader 700 encre, bande surligneur derrière le bas des lettres ; tout le contenu dans le cercle central de 80 %.
- **Favicon** `favicon.png` (64 px) : même « M&K » serré.
- **Wordmark** `wordmark.png` (1200×800) : « M&K » + « Mike Coach. » en Newsreader italique, pour l'écran de chargement.
- **Splashs** `icons/splash/*.png` (15 tailles) : fond papier, wordmark centré.

Régénérer : `node generate-assets.js`, puis regarder les PNG.

## Design

- Look **Carnet** (voir « Design system — Carnet » plus bas) : papier clair, encre, surligneur ; mobile-first
- Typographie : Newsreader (display) + IBM Plex Sans (texte) + IBM Plex Mono (chiffres)
- CSS via Tailwind CLI (no bundler) : `npm run css`
- `overscroll-behavior: none` sur body (anti-bounce iOS)
- `viewport-fit=cover` dans la balise meta viewport
- Safe area insets pour iPhone avec encoche (`env(safe-area-inset-*)`)

## Données

- Supabase (`supabase.js`, schéma `supabase-schema.sql`, dossier `supabase/`) : authentification et stockage des séances, programmes, mesures. Plus de localStorage `gym_sessions`.

## Instructions Claude Code

1. `npm install`
2. `npm run css` après toute modification de classes Tailwind (`dist/output.css` est committé)
3. `npx vitest run` avant chaque commit
4. `node generate-assets.js` si l'identité (icônes, splashs, wordmark) change
5. Changer `CACHE_NAME` dans `service-worker.js` à chaque livraison

# Frontend (HTML vanilla)

## Stack
- Pure HTML + Tailwind CSS (via Tailwind CLI, no bundler)
- Optional: Alpine.js for light interactivity
- NO React, Vue, Svelte, or framework JS

## Design philosophy (NON-NEGOTIABLE)

Aim for an **editorial / print-inspired** aesthetic. References: Tracksmith, Stripe Press, Linear (early), Basecamp, Pitch, Vercel docs. Assume an identity — don't default to "modern SaaS".

## Anti-patterns to REFUSE

### Colors
- ❌ Tailwind default palettes on key elements (`bg-slate-*`, `text-indigo-*`, `bg-blue-600`, `text-gray-500`) — use custom hex codes
- ❌ Purple/blue/indigo gradients (mesh, radial, or linear)
- ❌ Neon dark mode (cyan/magenta on black)
- ❌ More than 3 colors per screen (excluding pure black/white)
- ❌ Any gradient on hero backgrounds — flat colors only

### Typography
- ❌ Inter alone (or any single sans serif everywhere)
- ❌ All caps in body text
- ❌ Centered body paragraphs
- ❌ Same font-weight for H1 and body
- ✅ Always pair a strong serif display (Fraunces, Recoleta, GT Sectra, Söhne Breit) with a precise sans (DM Sans, Manrope, Inter Tight)
- ✅ Strong typographic hierarchy: H1 should be at least 3× body size, use `clamp()` for fluid sizing

### Layout & components
- ❌ Three rounded cards in a row (the "features grid")
- ❌ Centered hero with single CTA button below subtitle
- ❌ Lucide/Heroicons in every card header
- ❌ Flat white cards on flat gray background
- ❌ `rounded-2xl shadow-xl` cards (the SaaS card look)
- ❌ Glassmorphism / backdrop-blur on cards
- ❌ Emojis in CTAs or section titles ("✨ Get started")
- ❌ "Trusted by" logo grids by default
- ✅ Assume a grid, generous whitespace (py-24+ on sections, gap-12+ on grids)
- ✅ Asymmetric layouts welcome (editorial-style off-center heroes)

### Copy
- ❌ "Built for the modern X"
- ❌ "The all-in-one platform for..."
- ❌ "Supercharge your..."
- ❌ Generic AI-flavored taglines

## Design system — Carnet

Validé le 2026-10-18 (remplace Direction A). Écrans dessinés à la main d'après le Carnet (décision Lionel 2026-10-18, Guichet #1895).

### Tokens — chaque couleur a UN rôle unique
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

Classes Tailwind : `bg-paper`, `bg-sheet`, `text-ink`, `text-mut`, `border-rule`, `bg-hl`, `text-done`, `text-alert`… Variables CSS `--paper` … `--alert` dans `src/input.css` (pour `style.css` et Chart.js).

### Polices
- **Newsreader** (`font-display`) : titres, noms d'exercices en italique
- **IBM Plex Sans** (`font-sans`) : texte
- **IBM Plex Mono** (`font-mono`, `.num-set`, `.num-set-hot`) : chiffres — charges, reps, durées, décomptes, métriques

### Forme
- Rayon : 6 px (`rounded`) — jamais `rounded-2xl`
- Boutons : primaire = fond `ink`, texte `paper` ; secondaire = contour 1,5 px `ink`
- Filets : 1,5 px `ink` pour la structure (en-tête, dock, onglets, haut de tableau) ; 1 px `rule` pour les lignes
- **Règle des 12 px** : aucun texte sous 12 px dans toute l'app ; pas de sur-titres en majuscules espacées : phrases 12-13 px `mut`

### Règles d'usage strictes
1. **Une seule zone `hl` visible à la fois** : la série en cours, ou le décompte de repos.
2. **`alert` est ponctuel** : texte ou petite pastille, uniquement sur événement.
3. **`done` domine en fin de séance.**
4. Les métriques n'ont pas de couleur : `ink` en IBM Plex Mono.

### Référence canonique
La maquette `designs/supersets/supersets.html` (et `designs/supersets/NOTES.md`) est la source de vérité visuelle. Toute discordance entre le code et ce fichier → revenir à la maquette.

## Output structure
- `./designs/` — maquettes HTML
- `./src/` — production HTML/CSS/JS, adapted from designs/
- `./src/assets/` — extracted images, logos, icons

## Language
- UI copy in French (Micky is FR-first)
- Code comments in English
- Variable names in English