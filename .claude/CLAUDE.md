# Gym Tracker — PWA

Application de suivi de séances de musculation, optimisée iPhone et Android.

## Plateformes
- **index.html / app.js** → WebApp mobile (iPhone/Android), interactions tactiles (swipe, tap)
- **backoffice.html / backoffice.js** → Interface coach sur PC, interactions souris/clavier (clic, flèches)

## Structure cible
```
gym-tracker/
├── index.html
├── manifest.json
├── service-worker.js
├── app.js
├── style.css
├── generate-assets.js
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── splash/
        ├── splash-1170x2532.png
        ├── splash-1125x2436.png
        ├── splash-1242x2688.png
        ├── splash-828x1792.png
        ├── splash-750x1334.png
        ├── splash-640x1136.png
        ├── splash-1536x2048.png
        └── splash-2048x2732.png
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
- name "Gym Tracker", short_name "Gym"
- display: standalone, orientation: portrait
- theme_color: "#0f0f0f", background_color: "#0f0f0f"
- icônes 192×192 et 512×512

### iOS — balises meta dans le <head>
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Gym Tracker">
<link rel="apple-touch-icon" href="icons/icon-192.png">

<!-- Splashscreens -->
<link rel="apple-touch-startup-image" href="icons/splash/splash-1170x2532.png"
  media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)">
<link rel="apple-touch-startup-image" href="icons/splash/splash-1125x2436.png"
  media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)">
<link rel="apple-touch-startup-image" href="icons/splash/splash-1242x2688.png"
  media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)">
<link rel="apple-touch-startup-image" href="icons/splash/splash-828x1792.png"
  media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)">
<link rel="apple-touch-startup-image" href="icons/splash/splash-750x1334.png"
  media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)">
<link rel="apple-touch-startup-image" href="icons/splash/splash-640x1136.png"
  media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)">
<link rel="apple-touch-startup-image" href="icons/splash/splash-1536x2048.png"
  media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)">
<link rel="apple-touch-startup-image" href="icons/splash/splash-2048x2732.png"
  media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)">
```

### Android
- Le splashscreen Android est généré automatiquement par Chrome à partir de `background_color` + icône 512px dans le manifest
- Pas de fichier supplémentaire nécessaire

### service-worker.js
- Cache shell statique au premier chargement
- Stratégie cache-first pour tous les assets
- CACHE_NAME versionné (incrémenter à chaque mise à jour)

## Script generate-assets.js

Script Node.js utilisant le package `canvas` (npm install canvas) qui génère :

**Icônes (icon-192.png et icon-512.png) :**
- Fond carré arrondi #1a1a1a
- Haltère (barbell) dessinée en canvas, couleur #FF6B00
- Texte "GT" en dessous, police monospace, couleur #FF6B00

**Splashscreens (tous les PNG dans icons/splash/) :**
- Fond plein #0f0f0f
- Haltère centrée, couleur #FF6B00, taille proportionnelle à l'écran
- Texte "Gym Tracker" en dessous, police monospace, couleur #FF6B00
- Sous-titre "par Micky" en #888, taille plus petite

Après création du script, exécuter : `node generate-assets.js`

## Design

- Thème sombre, minimaliste, mobile-first
- Typography: serif display + clean sans body (jamais Inter seul)
- Couleur d'accent : HSL `14 100% 60%` (micky orange)
- CSS via Tailwind CLI (no bundler)
- `overscroll-behavior: none` sur body (anti-bounce iOS)
- `viewport-fit=cover` dans la balise meta viewport
- Safe area insets pour iPhone avec encoche (`env(safe-area-inset-*)`)

## Données

- localStorage, clé `gym_sessions`, tableau JSON

## Instructions Claude Code

1. Crée tous les fichiers de la structure cible
2. Installe la dépendance : `npm init -y && npm install canvas`
3. Exécute `node generate-assets.js` pour générer icônes et splashscreens
4. Vérifie que tous les PNG sont bien générés dans `icons/`
5. À la fin, affiche les étapes pour déployer sur Netlify (drag & drop du dossier)

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