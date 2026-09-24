# Séance live v3 : notes du designer

> **BROUILLON, pas un export AIDesigner, à régénérer via AIDesigner quand le MCP sera connecté.**
> Le 2026-09-24, le serveur MCP `aidesigner` était déclaré dans `.mcp.json` mais aucun outil n'était exposé dans la session, et `AIDESIGNER_API_KEY` n'était pas défini.
> Ce fichier dérive à la main du mock canonique `designs/explorations/v2/A-athlete-dense.html` et de `BRIEF.md` (product-owner).
> Chaque bloc reprend un élément du mock ou répond à une demande du brief (voir la colonne « Source » plus bas).
> Pour le régénérer : `refine_design` avec ce fichier en entrée et le brief §7 résumé en prompt.

Fichiers :
- `live-session-v3.draft.html` : planche v2 (après 2 itérations de critique PO et 1 relecture QA). Elle contient :
  - `01` liste ; `01b` liste pendant un repos
  - `02` exercice, série active ; `02bis` même écran en 375×667, 4e série sur 4
  - `03` repos en cours ; `03b` dock en alerte ≤ 5 s ; `03c` toast « Annuler » ; `03d` fin du repos, la série devient active
  - `04` tiroir Exos ; `04b` autre exercice ouvert pendant un repos (AC-J2)
  - `05` exercice terminé avec PR ; `05b` dock « Terminer la séance » ; `09` stepper désactivé
  - `06` superset minuterie + chrono ; `07` cardio ; `08` séance terminée
- `BRIEF.md` : brief produit et critères d'acceptation (auteur : product-owner).

## 1. Ce qui change par rapport à l'écran actuel

| # | Changement | Pourquoi (brief) | Source visuelle |
|---|---|---|---|
| 1 | **Un seul écran « Exercice »** remplace le focus d'une seule série (`renderSeriesFocus`) et la page de repos (`renderRestSplit`). On y voit le tableau Charge / Reps / Repos, avec toutes les séries de l'exercice. | I3, AC-E1 | Tableau du mock (l.141-189) |
| 2 | **Ligne active éditable sur place** : steppers −/+ de 48 px (2,5 kg pour la charge, 1 rep, 5 s pour une durée). Taper sur le chiffre ouvre le clavier. Il n'y a plus de modale pour une correction courante. | I1, AC-D1..D6 | Ligne racing du mock (l.165), agrandie |
| 3 | **Dock sous le pouce** : `[Exos · N/7 faits]` (un nombre d'exercices faits, jamais une position) + CTA principal (Valider / Lancer la minuterie / Exercice suivant). Il est ancré en bas et visible sans scroll. | I2, AC-A2, AC-F1 | Nouveau (demande brief §7.1, §7.3) |
| 4 | **Le repos devient un état du dock** et non plus une page. Le décompte en racing est le seul foyer de l'écran. On dispose de −15 s / +15 s, et « Passer » agit en 1 tap, avec un toast « Annuler » pendant 3 s. La série suivante reste éditable pendant le repos (bord paper, fond inkAlt). Sous 5 s, le bandeau passe en racing plein fond. | I4, I11, AC-E1..E8 | Nouveau (brief §7.2) ; typographie = mega chiffres du mock |
| 5 | **Header compact de 84 px** (Liste · programme · Fin, puis X/Y + 2 stats cyan + barre acid). Le H1 du programme n'apparaît plus que sur la liste. | I2, I8, AC-A5, AC-G1, AC-G2 | Header sticky du mock (l.58-106), condensé |
| 6 | **Stats cyan réduites à Tonnage + Reps**. Volume (kg) et Tonnage (t) affichaient la même valeur, et « Cible » faisait doublon. | I8, AC-G2 | Strip du mock, 4 → 2 colonnes |
| 7 | **Liste en ordre stable**, sans numéro. Une seule card porte le racing (le dernier exercice touché) ; les autres exercices commencés ont un bord `todo` et un compteur X/Y en paper. Le résumé vient de `formatSeriesSummary`. | I5, I6, I9, AC-B2, AC-F2, AC-F5 | Liste « Suite » du mock, sans les numéros ni les carrés |
| 8 | **Tiroir Exos** (2 taps) dans l'ordre du programme. Le mini-bandeau de repos y reste visible. | I5, AC-F1, AC-E2 | Nouveau (brief §7.3) |
| 9 | **Blood seulement sur PR**, sur la ligne validée dont la charge dépasse la meilleure charge jamais faite sur l'exercice (record historique), avec une phrase de contexte en muted. | I12, AC-B3, AC-B4 | Badge PR du mock (l.169) |
| 10 | **Cardio sans numéros** : seul le premier exercice non fait est en racing. Les inputs sont cyan et ouvrent un clavier numeric ou decimal. | I7, AC-I1..I3 | Structure de `renderLiveCardio` et strip du mock |
| 11 | **Aucun texte sous 10 px** (classe `.eb` à 10 px au lieu de 8/9 px), aucun glyphe ni emoji dans les CTA (plus de ✓ ✎ ⏭ ▶ 💡), bouton « Fin » de 44 px de haut. | I13, AC-A3, AC-A4, AC-B5 | — |

Écart assumé par rapport au mock, avec **une seule échelle partout** : dans l'écran exercice, les lignes faites et à venir mesurent au plus 44 px, chiffres en 26 px (au lieu de `num-set`, 38-42 px). Seule la ligne active garde `num-set-hot` (≥ 44 px, AC-A1). Sur 375×667 (frame 02bis), l'en-tête d'exercice tient sur une ligne (H2 24 px) et la barre d'état fait 20 px. La ligne active et le dock tiennent alors sans scroll, même à la 4e série sur 4 (AC-A8).

## 1bis. Comportements obligatoires (issus des revues)

- **Garde-fou anti double tap** : après chaque changement d'action du CTA (Passer le repos → Valider la série, Valider → Exercice suivant), les taps sont ignorés pendant 1 000 ms, et le CTA reste à 60 % d'opacité pendant ce délai. Ce point a été remonté par le PO et par la QA (course au tap à 0 s).
- **Scroll auto** : à l'ouverture de l'exercice et après chaque validation, la ligne active est scrollée juste au-dessus du dock.
- **Un seul foyer racing** : pendant un repos, le décompte a le racing. La série suivante (même exercice ou un autre, frame 04b) et la card « dernier touché » de la liste (01b) passent en paper.
- **Empilement des toasts** : un seul toast à la fois, posé juste au-dessus du dock. Un nouveau toast remplace le précédent, sauf le toast « Annuler » qui garde la priorité pendant ses 3 s. « Hors ligne » passe ensuite.
- **Cardio** : « Marquer fait » s'applique à l'exercice racing et se trouve dans le dock. « Rouvrir » demande une confirmation (AC-I4). Les champs acceptent la virgule.
- **Stepper désactivé** (frame 09) : « − » inerte à reps = 1 ou charge = 0, contour atténué, texte muted.

## 2. Règles couleur appliquées

- `racing` : un seul foyer par écran. Hors repos, c'est la ligne active. Pendant le repos, c'est le décompte (la série suivante est en `paper`). Dans la liste, c'est la card du dernier exercice touché. En cardio, c'est le premier exercice non fait. L'onglet actif de la tab bar est toléré.
- `acid` : lignes validées, barre de progression, compteur X/Y fait, CTA « Terminer la séance », bouton Fin (contour).
- `cyan` : Tonnage, Reps, Σ cumul, inputs cardio.
- `blood` : le badge PR uniquement.
- `paper` : la série en préparation pendant le repos, l'exercice courant dans le tiroir, les CTA d'action en fond plein (« Valider la série », « Lancer la minuterie », « Marquer fait », « Exercice suivant ») et « Passer le repos » (en contour).

## 3. Mapping vers `app.js` (racine, pas `src/`)

| Fonction / élément | Ligne actuelle | À faire |
|---|---|---|
| `renderLiveSession` | l.920 | Factoriser les deux headers dupliqués en `buildLiveHeader(mode)`. Mode `list` : status + progress + 2 stats. Mode `exercise` : compact 84 px. Router vers `renderExerciseDetail` quand `liveFocus` est défini, sans passer par `renderRestSplit`. Retirer le toggle `.in-rest-split`. |
| `renderExerciseList` | l.1080 | Supprimer le `sort` des exercices faits (l.1116). N'appliquer le racing qu'à `lastTouchedExIdx` (nouvel état). Brancher `formatSeriesSummary(ex)`. Calculer la durée avec `computeEstimatedDuration` (charger `lib/duration-estimate.js` dans `index.html`). Labels à 10 px. |
| `renderExoMasthead` | ~l.1215 | Supprimer le masthead de séance dans la vue exercice. Garder seulement l'en-tête de l'exercice (eyebrow muscle · repos, H2, badge X/Y fait). |
| `renderSeriesFocus` | ~l.1260 | Remplacer par `renderExerciseDetail` (tableau complet). Sortir de là la logique des valeurs (préc, suggestion IA, type d'activité) pour la ligne active. |
| `renderExerciseDetail` | l.1468 (stub) | Nouvelle implémentation : tableau, ligne active avec steppers, ligne en préparation pendant le repos, Σ, conseil IA sans emoji. |
| `renderRestSplit` | ~l.1380 | À supprimer. Le repos devient `renderRestDock()`. La correction a posteriori passe par un tap sur la ligne validée (réutilise `openEditModalForActivity`). |
| `openEditModalForActivity` | l.1613 | Conservé comme saisie de secours (tap sur une ligne validée, valeurs arbitraires hors clavier inline). La confirmation de baisse de poids reste, mais seulement à la validation et pas à chaque tap sur −. Décidé, voir §5 point 6. |
| `completeFocusedActivity`, `nextUndoneActivity`, `markExoSerieStart` | — | Inchangés dans leur rôle. Ajouter la mise à jour de `lastTouchedExIdx`. |
| `propagateLiveValue` | l.1983 | Les steppers écrivent dans `series[i].values[j]` et passent par `fillDown` (et non par la propagation à toutes les séries suivantes). Cela rejoint la remarque « hors brief » du PO. |
| `renderLiveCardio` | l.1734 | Retirer les numéros (`ord`). Racing uniquement sur le premier non fait. Labels à 10 px. Le toggle Fait → À faire demande une confirmation (AC-I4). |
| `startCountdown` / `stopCountdown` / `updateCountdownUI` | ~l.2240-2330 | Remplacer l'anneau SVG par le bandeau du dock. Ajouter `adjustCountdown(±15)`. Classe d'alerte à ≤ 5 s = bandeau racing inversé. `finishCountdown` depuis Passer : sans `showConfirm`, avec un toast « Annuler » qui restaure `countdownSecs`. |
| `#countdown-bar` (`index.html` l.214) | — | Devient le dock de repos en bas, au-dessus de la tab bar ou du dock exercice. En dehors de l'écran exercice, il se réduit à un mini-bandeau (décompte + Passer). |
| `generateWeightSuggestion` (affichage) | ~l.1357 | Remplacer `💡` par l'eyebrow « Conseil coach ». |
| Nouveau : tiroir `Exos` | — | `openExercisePicker()` : bottom sheet, ordre du programme, tap pour mettre `liveFocus` sur `nextUndoneActivity(exIdx)`. |

Comportements à préserver (spec Lot E) : auto-save `pushSession`, propagation au template programme, suggestion IA, valeurs précédentes (`prevSeries`), sync montre (`liveSession.sync`), bips et vibrations des 5 dernières secondes, overlays chrono et minuterie.

États décrits ici mais non maquettés : 
- **Hors ligne** : toast neutre « Hors ligne · enregistré sur l'appareil », même composant que 03c.
- **Exercice sans séries ou sans activité** : une ligne muted « Aucune série prévue », pas de dock Valider, seulement `[Exos]`.
- **Stopwatch actif** : pas de stepper, CTA « Lancer le chrono » (voir la note de la frame 06).

## 4. Critères non couverts visuellement (comportement, pour la QA)

AC-C3 (retour à la liste ou exercice suivant sans repos), AC-E3 (toast pendant 3 s), AC-E5 (le repos continue pendant l'édition), AC-E8 (bascule automatique à 0), AC-F4 (première série non validée), AC-G3 (`computeEstimatedDuration`), AC-G4 (confirmation de Fin), AC-I4.

## 5. Décisions 2026-09-24

Arbitrages de l'utilisateur :
1. **Le CTA « Valider la série » est en paper plein** (fond `#F5F4F0`, texte ink), et non en acid. Acid reste réservé aux états accomplis. Par cohérence, les autres CTA d'action qui précèdent une validation passent aussi en paper : « Lancer la minuterie » (06) et « Marquer fait » (07). « Terminer la séance » (05b) reste en acid, car c'est l'état de fin où l'écran « respire le vert ». **À confirmer** si l'utilisateur voulait limiter le changement au seul « Valider ».
2. **Le PR (blood) est un record historique sur l'exercice** : la meilleure charge jamais soulevée sur cet exercice, tout historique confondu. On ne compare plus à la séance précédente. L'écran 05 affiche « Record : 45 kg, ta meilleure charge jamais faite sur Leg extension (ancien record : 42,5 kg) ». Le critère AC-B4 du brief (qui compare charge × reps à la séance précédente) est à réaligner par le PO.
3. **Le pas de charge est de 2,5 kg pour tous les exercices.** Il n'y a pas de pas propre à chaque exercice.
4. **La taille minimale du texte en séance live est de 10 px.** Les sur-titres à 8/9 px du design system ne s'appliquent plus à cet écran. Il faudra reporter ce point dans `.claude/CLAUDE.md` lors de l'implémentation.

Choix par défaut de l'orchestrateur :
5. **Après un changement d'action du CTA, les taps sont ignorés pendant 1 000 ms.**
6. **La confirmation de baisse de poids n'apparaît qu'au moment de Valider**, jamais à chaque tap sur −.
7. **L'interface tutoie partout.** Le toast d'alerte devient « Prends place » (03b) ; le toast actuel « Prenez place » dans `startCountdown` est à renommer.
8. **Le slogan « Build · Fuel · Dominate » est conservé.**
9. **En vue exercice, le dock remplace la tab bar** (AC-A6).
10. **Fin d'exercice** : le CTA propose « Exercice suivant » (05). Sur le dernier exercice, il devient « Terminer la séance » (05b). Ce choix avait déjà été tranché par le PO.
