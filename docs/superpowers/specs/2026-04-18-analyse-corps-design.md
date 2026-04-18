# Analyse bienveillante des données corporelles — Lot D

## Contexte

L'écran "Données corporelles" laisse l'utilisateur saisir poids, graisse, eau, muscle, IMG, os, tour de ventre. L'historique existe en BDD (`public.body_measurements`) mais l'utilisateur n'a aucun feedback qualitatif : il voit juste des chiffres et deux diffs (poids, graisse).

L'utilisateur veut une analyse IA **bienveillante** à l'ouverture de l'écran, qui commente la progression globale depuis la 1ʳᵉ mesure et la tendance récente.

## Objectif

Afficher, en bas de l'écran Données corporelles, une card "🌱 Ton évolution" contenant 2-3 phrases écrites par Claude, basées sur les mesures de l'utilisateur.

## Conception

### Trigger

Dans `renderCorps()` (`app.js:1663`), après le rendu du formulaire, lancer `generateBodyAnalysis()` en arrière-plan et injecter le résultat dans une card dédiée.

### Données envoyées

Parcourir `loadBodyMeasurementsDB()`, trier par date ascendante :
- **Première mesure** : `{ date, poids, graisseKg, eau, muscle, img, os, tourDeVentre }` (champs `null` permis, ne pas les envoyer s'ils sont `null`)
- **N=5 dernières** (excluant la première si dans les 5)

Format JSON compact :

```json
{
  "first": { "date": "2026-02-10", "poids": 85.4, "graisseKg": 18.2, "tourDeVentre": 96 },
  "recent": [
    { "date": "2026-03-15", "poids": 83.1, "graisseKg": 16.8 },
    { "date": "2026-04-01", "poids": 82.7, "graisseKg": 16.2 },
    ...
  ]
}
```

### System prompt

```
Coach bienveillant et non jugeant. L'utilisateur partage son évolution de composition corporelle (poids, graisse, eau, muscle, IMG, os, tour de ventre). Écris 2-3 phrases courtes en français :
- Célèbre les tendances positives sur la durée (depuis la première mesure).
- Mets les petites variations récentes en perspective (un poids fluctue au quotidien).
- Encourage, jamais de jugement ni de pression, aucun conseil diététique ou médical, pas d'objectif chiffré.
- Ton chaleureux, deuxième personne du singulier (tu).
```

`max_tokens: 180`.

### UI

Nouveau bloc, rendu en bas de `screen-corps-body` après le bouton "Enregistrer" :

- État par défaut (en cours) : spinner + "Analyse en cours…"
- Succès : card "🌱 Ton évolution" + texte Claude
- Échec / pas de clé API / <2 mesures : bloc caché silencieusement (pas d'erreur)

CSS : nouvelle classe `.corps-analysis` (fond vert doux pour se distinguer du orange coach, ou accent neutre). Icône 🌱 pour la tonalité bienveillante.

### Cache

Variable module-level `bodyAnalysisCache` :
- Clé dérivée du hash des mesures (ou juste `id` de la mesure la plus récente + nombre total)
- Si cache hit, affichage instantané
- Invalidée quand une nouvelle mesure est sauvegardée (`saveBtn` handler) → on vide le cache avant de re-rendre

### Fonction exposée

```js
async function generateBodyAnalysis(measurements) { /* ... */ }
```

Prend le tableau des mesures triées desc (comme renvoyé par `loadBodyMeasurementsDB`), renvoie le texte ou `null` silencieusement si rien à dire.

## Hors scope

- Persistance en DB (contrairement au feedback IA post-séance — ici la data change peu fréquemment, cache mémoire suffit).
- Suggestion d'objectif chiffré.
- Graphique visuel (déjà présent ? à vérifier mais hors scope ici).
- Notifications push / alertes de poids.
- Personnalisation du ton par l'utilisateur.

## Fichiers concernés

- `app.js` :
  - Ajout `BODY_ANALYSIS_PROMPT` constant
  - Ajout `let bodyAnalysisCache = null`
  - Ajout `async function generateBodyAnalysis(measurements)`
  - Modification `renderCorps()` : ajout de la card + trigger
  - Modification du save handler : reset du cache avant `renderCorps()`
- `style.css` : règles `.corps-analysis`, `.corps-analysis-card`, `.corps-analysis-title`, `.corps-analysis-content`, `.corps-analysis-loading`

## Critères d'acceptation

- Ouvrir Données corporelles avec ≥2 mesures et clé API → card "🌱 Ton évolution" apparaît avec spinner, remplacée par 2-3 phrases bienveillantes en ~2-3s.
- Fermer et rouvrir l'écran → card instantanée (cache).
- Enregistrer une nouvelle mesure → cache invalidé, nouvelle analyse générée à la prochaine ouverture.
- <2 mesures OU pas de clé API → pas de card.
- Erreur API → pas de card visible.
- Ton généré effectivement bienveillant (pas injurieux / médical / directif) — à évaluer manuellement sur un échantillon.
