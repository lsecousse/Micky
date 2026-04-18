# Refonte UX séance live — Lot A

## Contexte

Pendant une séance, deux interactions majeures posent problème :

1. Le compte à rebours de repos (`#countdown-bar`) prend tout l'écran et bloque toute interaction (impossible de modifier une autre série pendant qu'il tourne).
2. La zone d'édition d'une activité s'étend en inline dans la ligne. Sur les rangées en bas de viewport, le bouton OK sort de l'écran et devient difficile à atteindre.
3. Quand on édite, le focus initial est sur le premier input (Reps), alors que dans 90 % des cas c'est le poids que l'utilisateur veut modifier.
4. **Régression** : la ligne "Préc: X × Y kg" sous chaque série ne s'affiche plus lorsqu'une séance est reprise (resume). `resumeSessionFromHistory` (`app.js:2011`) reconstruit `liveSession.exercises` sans repeupler `prevSeries`, contrairement à `startSession` qui le calcule à partir de la dernière séance du même programme.

## Objectif

Permettre la modification d'une activité à tout moment (y compris pendant le repos), avec un bouton OK toujours visible, et un focus initial qui colle à l'usage réel.

## Conception

### 1. Compte à rebours — bandeau haut sticky

- Le bloc `#countdown-bar` passe d'un overlay plein écran à un **bandeau compact sticky en haut** du scope écran "live".
- Position : `position: sticky; top: 0; z-index` haut, sous le header de l'app si présent.
- Contenu (gauche → droite) :
  - Ring miniature (~40 px de diamètre) avec progression
  - Temps numérique (`#countdown-display`)
  - Label "À suivre : <nextLabel>"
  - Bouton skip (⏭)
- Comportements conservés :
  - Beep + vibration à 5 s, sequence finale, classe `urgent` (rouge)
  - Synchronisation montre via `liveSession.sync`
  - Skip = `finishCountdown()` (comportement actuel laissé tel quel — sera revu plus tard, hors lot)
- Le contenu sous le bandeau reste **entièrement interactif** pendant le décompte.

### 2. Édition d'activité — modal centré

- Le clic sur ✎ d'une ligne n'expand plus la zone inline : il ouvre un **modal centré**, overlay sombre derrière (`rgba(0,0,0,0.6)`).
- Carte modal :
  - Titre court : nom de l'exercice / label d'activité (selon contexte)
  - Inputs identiques à aujourd'hui :
    - `weight` : Reps + Poids + Repos
    - `countdown` : Durée + Repos
  - Boutons collés en bas : `Annuler` (gauche) + `OK` (droite, accent)
- **Focus initial** :
  - Pour `weight` → input **Poids** (`.live-weight`), avec `select()` pour permettre la saisie immédiate
  - Pour `countdown` → input **Durée** (comportement actuel, le seul input pertinent)
- Fermetures équivalentes à "Annuler" :
  - Clic sur l'overlay
  - Touche Échap
  - Bouton Annuler
- OK conserve la logique existante :
  - Confirmation "Réduire le poids de X à Y kg ?" si le poids baisse
  - `propagateLiveValue` + mise à jour DOM des autres lignes affichant la même activité
  - `pushSession(liveSessionSnapshot())`

### 3. Reprise de séance — préserver les valeurs précédentes

- `resumeSessionFromHistory` doit, comme `startSession`, charger la dernière séance du même `programmeId` et peupler `prevSeries` (et `prev` pour le cardio) sur chaque exercice reconstruit.
- La logique de calcul est déjà présente dans `startSession` (`app.js:640`–`673`) : extraire dans une fonction utilitaire `attachPrevValues(exercises, programmeId)` réutilisée par les deux entrées (DRY).

### 4. Cohabitation bandeau + modal

- Le bandeau de countdown garde son `z-index` propre, **toujours au-dessus de l'overlay du modal** : on doit voir le temps restant pendant qu'on édite.
- Le skip dans le bandeau ferme uniquement le countdown ; il ne ferme pas le modal en cours.
- L'ouverture / fermeture du modal n'affecte pas le countdown (ni son timer, ni son sync).

## Hors scope (à traiter plus tard)

- Comportement du bouton "Passer" du décompte (item #1 utilisateur). On garde l'actuel ; le redesign sera traité dans un lot séparé.
- Sauvegarde et historique des feedbacks IA (Lot B).
- Déclenchement d'analyse à la saisie du poids (Lot C).

## Fichiers concernés (estimation)

- `index.html` — restructuration du `#countdown-bar` (compact) + ajout d'un `<dialog>` ou conteneur modal édition
- `style.css` — règles pour bandeau sticky compact, modal centré, overlay
- `app.js` — ouverture / fermeture du modal, focus poids, retrait de la logique `editZone` inline (ou conversion vers modal)

## Critères d'acceptation

- Pendant un décompte de repos, l'utilisateur peut taper sur ✎ d'une autre ligne et modifier les valeurs.
- Le bouton OK du modal est toujours visible quel que soit le scroll de la liste.
- À l'ouverture du modal d'une activité `weight`, le curseur est dans le champ Poids et son contenu est sélectionné.
- Le décompte (chiffres + ring + son + vibration + sync montre) fonctionne identiquement à aujourd'hui, juste dans un format compact en haut.
- Échap, clic overlay et bouton Annuler ferment le modal sans modifier les valeurs.
- Quand une séance est reprise (depuis l'écran d'accueil), la ligne "Préc: X × Y kg" est présente sous chaque série, identique à une séance démarrée à neuf.
