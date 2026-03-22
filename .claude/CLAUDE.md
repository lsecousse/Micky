# Gym Tracker — PWA

Application de suivi de séances de musculation, optimisée iPhone et Android.

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
- Police monospace (DM Mono, fallback Courier New)
- Couleur d'accent : #FF6B00
- Pas de framework CSS
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