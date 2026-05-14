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
- Design generation: AIDesigner MCP

## Design workflow (NON-NEGOTIABLE)

For ANY new UI screen, page, or significant component:

1. **Always start with AIDesigner**. Never write UI from scratch.
2. Check if a brand kit is active: `list_brand_kits` → `set_editor_brand_kit` if needed.
   Active kit should be `main`.
3. Generate via `generate_design` with desktop viewport by default.
4. Iterate via `refine_design` — never regenerate from zero unless the user asks.
5. Retrieve final HTML via `get_canvas`, save under `./designs/<feature>.html`.
6. Adapt to project structure only after the design is validated.

## When NOT to use AIDesigner
- Pure logic, scripts, backend tasks
- Tiny tweaks (text change, single class adjustment)
- Bug fixes on existing markup

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

## Design system — Direction A (Athlete dense) — LOCKED

Validée le 2026-05-13. Tout l'app passe à ces tokens. **Aucune autre couleur d'accent autorisée hors anti-patterns ci-dessus.**

### Typo
- **Display** : Fraunces (variable, opsz 9..144, weights 400/600/700/800/900) — H1, chiffres mega de séries, numéros d'exercices
- **Sans** : DM Sans (400/500/600/700) — body, eyebrow, labels, tabular metrics
- Pair Fraunces + DM Sans. **Jamais Manrope dans cette direction.**
- Eyebrows : `letter-spacing: 0.28em` (eyebrow), `0.40em` (eyebrow-wide), `font-sans`, `text-[8-10px]`, uppercase
- Chiffres de séries : `clamp(2.375rem, 10.5vw, 2.625rem)` (validée/todo), `clamp(2.75rem, 12.2vw, 3rem)` (active)

### Palette base (inchangée)
| Token | Hex | Usage |
|---|---|---|
| `ink` | `#0A0A0A` | Fond principal |
| `inkAlt` | `#141414` | Surfaces secondaires (Σ row, recap blocks) |
| `paper` | `#F5F4F0` | Texte principal |
| `muted` | `#888888` | Labels, texte secondaire, inactif |
| `border` | `#2A2A2A` | Séparateurs, bordures subtiles |
| `todo` | `#444444` | Chiffres planifiés non encore exécutés |

### Accents sémantiques — chaque couleur a UN rôle unique

| Token | Hex | Rôle | Usage strict |
|---|---|---|---|
| `cyan` | `#06B6D4` | Mesure / donnée neutre | Bandeau métriques (Volume, Tonnage, Reps, RPE), totaux Σ, stats, séparateur Σ |
| `acid` | `#84CC16` | Validé / accompli | Checkbox cochées (si présentes), badge "X/Y fait", barre progression remplie, "REPOS 1:45" des séries terminées, `&` du titre programme, `border-l-3` des lignes validées |
| `racing` | `#FACC15` | Action en cours / focus | Série active uniquement (border-left 3px + bg-racing/[0.07] + chiffres jaunes), tab actif, numéro d'exercice en cours, repos qui tourne en live |
| `blood` | `#DC2626` | Événement marquant / record | Badge "PR" (personal record), RPE ≥ 9, échec de série, charge max. **Ponctuel** — jamais en grande surface |

### Règles d'usage strictes
1. **Une seule ligne en `racing` à la fois** — la série active. Quand la 03 devient active, la 02 passe en `acid`.
2. **Le `blood` n'apparaît que sur événement** — pas pour décorer. Si rien d'exceptionnel, aucun rouge visible.
3. **Le `cyan` reste constant et calme** — pas d'animation, pas de variation.
4. **L'`acid` doit dominer en fin de séance** — écran "respire le vert" sourd quand tout est validé.
5. **Plus d'orange `#FF6B00` nulle part.** Manifeste et accents : en `paper` ou semantic tokens.

### Layout signature (Direction A)
- Sticky header dense : status row + manifesto + compteur "X/Y séries" + barre progression `acid` + strip 4 stats `cyan`
- H1 énorme Fraunces Black `clamp(2.5rem, 11.5vw, 3.75rem)`
- Accent-line 36×2px `acid` sous H1
- Tableau séries 3 colonnes (Charge / Reps / Repos), border-left 3px pour statut, **pas de checkbox ni de numéro de série dans le tableau** (l'ordre des lignes = numéro)
- Mega numbers Fraunces black à gauche, repos eyebrow à droite
- Σ row cyan avec separator `border-t-2 border-t-cyan`, fond `inkAlt`
- Liste "Suite — X exercices" avec poids cible à droite
- Tab bar 3 colonnes, indicateur `racing` 2px top sur actif, label Fraunces italique

### Radius
- `--radius: 0.375rem` — jamais `rounded-2xl`

### Spacing rhythm
- 6 / 12 / 24 / 48 / 96 px

### Référence canonique
Le mock `./designs/explorations/v2/A-athlete-dense.html` est la source de vérité visuelle. Toute discordance entre le code et ce fichier → revenir au mock.

## Output structure
- `./designs/` — raw HTML from AIDesigner canvas exports
- `./src/` — production HTML/CSS/JS, adapted from designs/
- `./src/assets/` — extracted images, logos, icons

## Language
- UI copy in French (Micky is FR-first)
- Code comments in English
- Variable names in English