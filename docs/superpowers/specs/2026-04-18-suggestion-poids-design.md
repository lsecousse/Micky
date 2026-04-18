# Suggestion IA à la saisie du poids — Lot C

## Contexte

Quand l'utilisateur tape ✎ sur une série `weight` pour éditer son poids, il n'a pour contexte que "Préc: X × Y kg" (la dernière séance). Il veut en plus une **suggestion courte** de l'IA Claude basée sur la tendance sur plusieurs séances, incluant la toute première (pour mesurer la progression globale).

## Objectif

À l'ouverture du modal d'édition d'une activité `weight`, lancer une requête Claude en arrière-plan, et afficher une suggestion d'une phrase dans un petit bloc en haut du modal.

## Conception

### Trigger

Dans `openLiveEditModal(...)` (branche `act.type === 'weight'` du handler `editBtn` dans `app.js`), juste après l'ouverture du modal, lancer un fetch `generateWeightSuggestion(exerciseName, actLabel)`.

### Données envoyées à Claude

Pour l'exercice concerné (matché par `exercise.name`) :
- **Première séance** : date + séries complètes (reps/weight)
- **N=5 dernières séances** : date + séries complètes

Parcourir `loadSessions()`, filtrer sur `session.duration > 0` (complétées), trier par `startedAt` croissant, extraire l'exercice par nom, prendre `[0]` (première) + `slice(-5)` (5 dernières) en déduplicant si la première est dans les 5 dernières.

Format compact JSON :

```json
{
  "exercise": "Chest press",
  "first": { "date": "2026-03-01", "series": [{"reps":10,"kg":18},{"reps":10,"kg":20.3}] },
  "recent": [
    { "date": "2026-04-06", "series": [{"reps":12,"kg":18},{"reps":12,"kg":20.3},...] },
    ...
  ]
}
```

### System prompt

```
Coach sportif. L'utilisateur ouvre son éditeur de poids pour un exercice. Donne UNE phrase courte (max 25 mots, français, droit au but) : tendance récente (progression/stagnation/régression), et un poids ou objectif concret pour aujourd'hui. Pas de compliment creux.
```

`max_tokens: 80`.

### UI

Dans le modal d'édition, AU-DESSUS du bloc inputs, un nouveau div `#live-edit-suggestion` :

- État par défaut : caché (`hidden`)
- Pendant le fetch : visible, avec spinner + "💡 Suggestion…"
- Après succès : "💡 <texte Claude>"
- Après échec ou pas de clé API : caché silencieusement (pas d'erreur visible)

Si le modal est fermé avant la réponse, la réponse est ignorée (flag `canceled` dans la closure).

### Cache

`Map<string, Promise<string>>` côté JS : clé = nom d'exercice. Le premier appel pour un exercice donné lance la requête ; les ouvertures suivantes réutilisent le résultat instantanément. Le cache vit pour la durée du tab browser (variable globale, non persistée).

### Conditions de déclenchement

- Type d'activité `weight` uniquement (les countdown/stopwatch sont exclus)
- Clé API Claude configurée (sinon on skip silencieusement)
- Au moins 2 séances passées avec cet exercice (sinon pas assez de data pour une suggestion utile — skip)

## Hors scope

- Persistance des suggestions (elles sont éphémères, par design)
- Suggestion pour les activités `countdown` / `stopwatch`
- Suggestion sur autre chose que le poids (reps, temps de repos, etc.)
- Abort HTTP réel (juste un flag côté client)

## Fichiers concernés

- `app.js` :
  - Ajout `SUGGESTION_PROMPT` constant
  - Ajout `const suggestionCache = new Map();`
  - Ajout `async function generateWeightSuggestion(exerciseName)`
  - Modification de `openLiveEditModal` pour accepter un champ `suggestionCtx` (nom d'exercice) et lancer la suggestion en arrière-plan
  - Modification du caller (branche `weight` dans l'edit handler) pour passer l'exercise name
- `index.html` : ajout du div `#live-edit-suggestion` dans le modal `#live-edit-modal`
- `style.css` : règle pour `.live-edit-suggestion` (fond subtil, accent, spinner léger)

## Critères d'acceptation

- Ouvrir le modal d'édition sur un poids d'un exercice qui a ≥2 séances passées → card "💡 Suggestion…" apparaît, remplacée par une phrase après appel Claude (≤ ~3s).
- Réouvrir le modal sur le même exercice → suggestion instantanée (cachée).
- Ouvrir le modal sur un exercice neuf (<2 séances) → pas de card.
- Pas de clé API → pas de card.
- Erreur API → pas de card (pas d'erreur visible).
- Fermer le modal avant la réponse → aucune mise à jour DOM après coup.
