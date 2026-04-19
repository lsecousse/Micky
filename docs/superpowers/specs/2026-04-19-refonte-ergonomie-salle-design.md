# Refonte ergonomie écran "À la salle" — Lot E

## Contexte

Aujourd'hui l'écran live affiche tous les exercices avec toutes leurs séries × activités d'un coup. Conséquence vécue : quand on saute d'un exercice à un autre (machine prise), on saisit facilement sur la mauvaise ligne.

L'utilisateur veut un mode focus : une seule activité visible à la fois.

## Objectif

Refondre l'UX live en 3 états cohérents :
- **A — Liste** : juste les noms d'exercices (avec progression), tap = entrer en focus
- **B — Activité** : 1 activité en focus, gros, avec Modifier + Valider
- **C — Repos + récap** : split countdown / récap de l'activité juste faite (avec bouton Modifier)

Plus inputs du modal d'édition élargis (lecture des décimales).

## Conception

### État A — Liste exercices

Quand `liveSession.exercises` est non vide ET aucune activité n'est en cours d'exécution (chrono/minuterie), on affiche :

- Header (inchangé) : titre programme + date + bouton "Terminer"
- Pour chaque exercice (cards verticales) :
  - **Nom** de l'exercice (gros)
  - **Progression** : "X/Y séries" (X = nb de séries où **toutes** les activités sont en `done`, Y = nb total de séries)
  - **Badge état** :
    - `done` : toutes séries terminées (✓ vert)
    - `pending` : aucune série commencée (○ neutre)
    - `partial` : au moins une série commencée mais pas tout (▶ accent)
  - Tap → entrer en état B sur **la prochaine activité non-`done`** de cet exercice (1ʳᵉ série incomplète, 1ʳᵉ activité non-`done` dedans)

Ordre des exercices : les exercices entièrement `done` sont relégués en bas (logique actuelle préservée).

### État B — Focus activité

Layout :

```
← Retour                                       (bouton)

Chest press                                    (h1 ~28px, accent)
Série 2 / 4 · Pectoraux                        (sous-titre 13px muted)

────────────────────────────────────────────

         12 reps × 28 kg                       (objectif, ~32px)
         Préc: 12 × 27.3 kg                    (13px muted, italique)

────────────────────────────────────────────

         [ ✎ Modifier ]                        (secondary, large)
         [ ✓ Valider ]                         (primary, full-width, large)
```

- "Préc:" affichée uniquement si présente dans `ex.prevSeries[sIdx].values[actIdx]`
- Pour activités multi (Gainage Planche/Parachutiste), le sous-titre devient `Série 2 / 4 · Planche`
- **Activités stopwatch / countdown** : au tap "Valider" (ou directement à l'entrée en état B selon le type), on lance les overlays existants `openChronoOverlay` / `openMinuterieOverlay`. Pas de bouton Valider visible pour ces types — le chrono / la minuterie remplit la valeur et passe directement en état C.
- Bouton Modifier → ouvre le modal d'édition existant (Lot A) avec focus Poids et inputs élargis (voir plus bas)
- Bouton Valider :
  - Marque la série courante comme `done` pour cette activité dans `liveSession`
  - `pushSession` (auto-save inchangé)
  - Si `act.rest > 0`, démarre le countdown (state C)
  - Sinon, transition directe vers la prochaine activité (next state B) ou retour à liste si plus rien
- Bouton ← Retour : retour état A. Aucun reset, l'utilisateur peut entrer dans un autre exercice.

### État C — Repos + récap

Split vertical 50/50 dans le `screen-seance-body` :

```
┌──────────────────────────────────┐
│                                  │
│         ⏰ 00:42                  │   (countdown plein, gros chiffres)
│      À suivre : Set 3 …          │
│                                  │
├──────────────────────────────────┤
│                                  │
│    Chest press · Série 2 ✓       │
│         12 × 28 kg               │   (récap activité juste faite)
│                                  │
│         [ ✎ Modifier ]           │
│                                  │
└──────────────────────────────────┘
```

- Le compte à rebours est intégré dans le state C (pas le bandeau sticky du Lot A)
- Le bouton Modifier rouvre le modal sur l'activité **qui vient d'être validée** (corrige une erreur de saisie a posteriori sans interrompre le repos)
- À la fin du countdown : transition automatique vers état B sur la prochaine activité non-faite
- Bouton ← Retour reste accessible (en haut), pour revenir à la liste pendant le repos. Le countdown continue, et un bandeau compact (Lot A) prend le relais en haut.

### Bandeau countdown sticky vs split state C

Conflit potentiel : aujourd'hui (Lot A), le countdown est un bandeau fixed en haut.

Résolution : pendant qu'on est dans le state C, le bandeau sticky est **caché** (le countdown est déjà au centre du C). Si l'utilisateur tape ← Retour ou tape un autre exercice depuis A, le state C disparaît et le bandeau sticky reprend (comme aujourd'hui).

### Modal d'édition — inputs plus grands

Dans le CSS du modal `.live-edit-modal-body input[type="number"]` :
- `font-size: 22px` (au lieu de 18)
- `padding: 14px 12px` (au lieu de 10px 8px)
- `min-width: 110px` ou width pleine (au lieu de width fixe — laisser le flex remplir)

But : voir entièrement "29.3" dans le champ poids.

## Hors scope

- Modification de l'ordre des exercices à la volée
- Tag/marquage "machine prise" dans la liste
- Mode "tabata" / circuit-training
- Sauvegarde des sessions abandonnées sous forme de timeline visualisable
- Vibration / haptique différentes par état
- Notifications natives quand le repos finit en arrière-plan

## Fichiers concernés

- `app.js` :
  - `renderLiveSession` : router selon état (A/B/C). Ajout de variables d'état `liveFocus = { exIdx, sIdx, actIdx } | null` et `liveRest = { exIdx, sIdx, actIdx } | null`.
  - Nouvelles fonctions : `renderExerciseList(tab)`, `renderActivityFocus(tab, exIdx, sIdx, actIdx)`, `renderRestSplit(tab, exIdx, sIdx, actIdx)`.
  - `advanceActivityState` / `doneActivity` : adapter pour piloter `liveFocus` → `liveRest` → next.
  - Logique `nextUndoneActivity(exIdx)` : trouver la prochaine activité à faire dans un exercice.
  - Le countdown bar sticky (Lot A) : ajouter une classe `.in-rest-split` qui le masque quand on est en state C.
- `style.css` :
  - Nouvelles classes : `.live-exo-list`, `.live-exo-row`, `.live-focus`, `.live-focus-target`, `.live-rest-split`
  - Modal édition : `font-size`, `padding` agrandis sur les inputs
- `index.html` : pas de changement (tout est généré côté JS)

## Critères d'acceptation

- À l'ouverture d'une séance non commencée : on voit la liste des exercices (pas le détail des séries).
- Tap sur un exercice : focus sur la 1ʳᵉ série, 1ʳᵉ activité non-`done`.
- Pour activités weight/countdown : Modifier ouvre modal, Valider marque done + déclenche repos.
- Pour activités stopwatch/countdown timer : ouverture des overlays existants, fonctionnement inchangé, transition vers state C / next à la fin.
- Pendant le repos : split visuel countdown + récap, bouton Modifier réouvre la dernière activité.
- Fin du countdown : auto-bascule vers state B suivant.
- Bouton ← en B ou C : retour à la liste (state A) sans perte de progression.
- Inputs du modal d'édition : "29.3" entièrement visible.
- Comportements préservés : auto-save (`pushSession`), confirmation de baisse de poids, propagation au template programme, suggestion IA (Lot C), valeurs précédentes, sync montre.
