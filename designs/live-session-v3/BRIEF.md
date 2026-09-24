# Brief produit — Séance live v3

Date : 2026-09-24 · Auteur : product-owner · Destinataire : designer (aidesigner-frontend), puis QA
Statut : proposition, pas d'implémentation (`src/` et `app.js` intouchés)

Référence visuelle : `designs/explorations/v2/A-athlete-dense.html` (Direction A, LOCKÉE, cf. `.claude/CLAUDE.md`).
Code analysé : `app.js` (racine, pas `src/`) — `renderLiveSession` l.920, `renderExerciseList` l.1080,
`renderExoMasthead` l.1215, `renderSeriesFocus` l.1260, `renderRestSplit` l.1380, `renderExerciseDetail` l.1468,
`openEditModalForActivity` l.1613, `renderLiveCardio` l.1734, `startCountdown`/`stopCountdown` l.2261-2330,
`#countdown-bar` (`index.html` l.214), `propagateLiveValue` l.1983. Libs : `lib/planned-series.js`,
`lib/duration-estimate.js`, `lib/prefill-series.js`.

---

## 1. Problème à résoudre

L'athlète (Micky) est en salle, téléphone dans une main, souffle court, entre deux séries. Il a **~3 secondes
d'attention** pour savoir : quoi faire maintenant, avec quelle charge, combien de reps, combien de repos il reste.
L'écran actuel est pensé comme une page éditoriale (masthead géant répété, stats en 8 px) et oblige à passer par
une modale pour corriger une charge. Le coût d'interaction se paie à chaque série (≈ 20 à 30 fois par séance).

## 2. Irritants actuels (constatés dans le code)

Classés par impact en salle (P1 = bloque ou ralentit à chaque série).

| # | Prio | Irritant | Référence |
|---|---|---|---|
| I1 | P1 | **Corriger charge/reps = 4 à 5 taps** : bouton « Modifier » → modale → champ → OK → (confirm si baisse de poids). Pas de stepper ±. Clavier numérique ouvert à chaque fois. | `renderSeriesFocus` l.1335, `openEditModalForActivity` l.1622-1684 |
| I2 | P1 | **Le bouton Valider est loin du pouce** : sous le header sticky (~150 px) + masthead séance H1 2 lignes (`pt-9 pb-9`) répété + header exo + bloc focus + `mt-10`. Sur iPhone SE/13 mini, risque de sortir de l'écran. | `renderExoMasthead` l.1225-1238 (masthead séance recopié dans la vue focus), l.1332 |
| I3 | P1 | **Pas de vue d'ensemble de l'exercice pendant qu'on le fait** : la vue focus montre UNE série. Impossible de voir « 3 faites, 1 restante, la suivante est à 45 kg » d'un coup d'œil. Le tableau Charge/Reps/Repos du mock n'existe pas : `renderExerciseDetail` est un stub vers `renderSeriesFocus`, alors que `todo.md` (A3b) le déclare livré. | l.1467-1470 vs `todo.md` A3b |
| I4 | P1 | **Pendant le repos, on ne peut pas préparer la série suivante** : la vue repos ne propose que la modification de la série *qui vient d'être faite*. La série suivante n'est qu'un libellé texte « À suivre : … ». Or c'est pendant le repos qu'on décide d'augmenter la charge. | `renderRestSplit` l.1413, l.1459 |
| I5 | P1 | **Changer d'exercice hors ordre = retour liste + la liste se réordonne** (exos faits envoyés en bas, l.1116-1120) : les cartes bougent sous le doigt entre deux visites. Machine prise → friction maximale. | `renderExerciseList` l.1116, bouton `← Liste` l.959 |
| I6 | P2 | **Règle « une seule ligne racing » violée** : chaque exo *commencé* est racing dans la liste (plusieurs possibles) ; en vue focus, « En cours » (status row) + eyebrow + mega chiffres + trait sont tous racing ; en cardio, *tous* les numéros non faits sont racing. | l.1146, l.965/1021, l.1283-1312, l.1750 |
| I7 | P2 | **Numéros sur les cards cardio** (`01`, `02`…) : contraire à la règle « pas de numéros sur cards exos ». | `renderLiveCardio` l.1740, l.1750 |
| I8 | P2 | **Stats strip redondante et illisible** : Volume (kg) et Tonnage (t) sont la même donnée ; « Cible » idem. Labels en 8 px, `tracking 0.40em`. Illisible à bout de bras. Le header est dupliqué mot pour mot entre liste et détail. | l.984-1001 et l.1040-1057 |
| I9 | P2 | **Résumé de card faux avec les valeurs par série** : « 4 × 10 · 40 kg » est calculé depuis la *dernière valeur saisie*, alors qu'une pyramide 10/10/8/8 existe désormais (`formatSeriesSummary` disponible, non branché). | l.1170-1183, `lib/planned-series.js` |
| I10 | P2 | **Durée estimée fausse** : commentaire « 1.5 min par série », calcul 30 s par série + repos de la 1re activité. `lib/duration-estimate.js` n'est même pas chargé dans `index.html`. | l.1085-1089, `index.html` l.314-315 |
| I11 | P2 | **Passer le repos demande une confirmation** : 2 taps pour une action réversible et fréquente. | l.1463, l.2326 |
| I12 | P3 | **Blood jamais utilisé** : aucun PR ni dépassement de la séance précédente n'est signalé, alors que `prevSeries` est chargé. | l.813, l.1294 |
| I13 | P3 | Suggestion IA affichée avec l'emoji 💡 ; « Préc : 40×10 kg » met l'unité au mauvais endroit. | l.1357, l.1297 |
| I14 | P3 | Cardio : le bouton Valider/Fait bascule l'état sans confirmation ; aucun chrono intégré, la durée se tape à la main. | l.1827 |

Hors brief mais à remonter (comportement, pas UI) : `propagateLiveValue` écrase **toutes** les séries suivantes non
faites (et non « remplissage intelligent » `fillDown`), et `updateProgrammeTemplate` écrit encore
`activities[j]`, en contradiction avec la spec `2026-09-04-per-series-values-design.md` (source de vérité = `series[i].values[j]`).

## 3. Jobs-to-be-done (athlète en salle)

1. **Savoir quoi faire maintenant** en un regard : exercice, charge, reps de la série en cours.
2. **Valider la série** d'un tap, pouce, sans viser.
3. **Corriger ce qui a été réellement fait** (1 rep de moins, charge différente) sans modale ni clavier si possible.
4. **Suivre le repos** : temps restant visible depuis n'importe quel écran, alerte à la fin, pouvoir l'écourter ou le prolonger.
5. **Préparer la série suivante pendant le repos** (monter de 2,5 kg).
6. **Changer d'exercice** quand la machine est prise, sans perdre sa place ni voir la liste bouger.
7. **Voir sa progression** de séance (X/Y séries) et un signal si record battu.
8. **Cardio** : saisir temps / puissance / distance et marquer fait.
9. **Terminer la séance** volontairement (jamais par erreur).

## 4. Objectifs mesurables (cibles pour la maquette)

| Objectif | Mesure | Cible |
|---|---|---|
| Valider une série conforme au plan | taps depuis l'écran exercice | **1** |
| Corriger reps ou charge de ±1 cran | taps, sans clavier | **≤ 2** |
| Saisir une charge arbitraire | taps (clavier autorisé) | ≤ 3 |
| Passer le repos | taps | **1** (annulable par toast « Annuler ») |
| Changer d'exercice depuis un exercice | taps | **≤ 2** |
| Info « série en cours » lisible à 60 cm | taille chiffres charge/reps | ≥ 38 px (échelle `num-set`) |
| Texte d'interface minimal | taille | ≥ 10 px (plus de 8 px) |
| Zone pouce | CTA principal | ancré dans le tiers bas de l'écran, visible sans scroll sur 375×667 |
| Cible tactile | boutons d'action | ≥ 44×44 px |

## 5. Contraintes (non négociables)

- **Direction A LOCKÉE** : tokens `ink/inkAlt/paper/muted/border/todo` + `cyan` (mesure) / `acid` (validé) /
  `racing` (UN SEUL élément de focus actif à la fois) / `blood` (événement ponctuel : PR, RPE ≥ 9, échec).
  Fraunces + DM Sans. Radius 0.375rem max. Pas d'orange, pas de gradient, pas de glassmorphism, pas d'emoji.
- **Pas de numéros** sur les cards d'exercices (ordre flexible en salle) — y compris cardio.
- **Pas de checkbox ni de numéro de série** dans le tableau des séries : l'ordre des lignes = le numéro ;
  statut par `border-left 3px`.
- Mobile portrait, une main, safe-area iPhone, `overscroll-behavior: none`. PWA hors-ligne.
- UI en français.
- Types d'activité à couvrir : `weight` (charge + reps), `countdown` (durée), `stopwatch` (chrono), exos
  multi-activités (superset : plusieurs activités par série), séance cardio.
- Valeurs planifiées **par série** (`series[i].values[j]`) ; repos **par activité**.

## 6. Hors scope (v3)

- Logique métier (propagation, miroir programme, IA de suggestion) — l'UI garde les mêmes points d'entrée.
- Repos par série, RPE saisi, notes par série.
- Montre / sync externe (le `liveSession.sync` existant est conservé tel quel).
- Écran de fin de séance / feedback IA, historique, backoffice.
- Réordonnancement manuel des exercices par drag.
- Animations élaborées : transitions sobres uniquement.

## 7. Proposition d'orientation (à challenger par le designer)

1. **Un seul écran « Exercice »** qui fusionne focus + repos : tableau des séries (Charge / Reps / Repos) du mock A,
   la série active en `racing` avec ses chiffres éditables en place (steppers − / + sur charge et reps),
   séries faites en `acid`, séries à venir en `todo`. CTA « Valider » fixé en bas (zone pouce).
2. **Repos = état de l'écran, pas une page** : bandeau repos fixe (au-dessus du CTA ou dans le header), la série
   suivante devient éditable pendant le repos. Actions : `−15 s`, `+15 s`, `Passer`.
3. **Sélecteur d'exercice accessible depuis l'écran exercice** (tiroir / bande horizontale), ordre **stable**.
4. **Header compact** en vue exercice : séance + X/Y séries + barre `acid`. Stats `cyan` réduites à 2 (Tonnage, Reps).
   Le masthead H1 géant reste réservé à la vue liste.
5. **Blood** uniquement si la série validée dépasse la meilleure perf précédente sur l'exercice (badge « PR »).

## 8. Critères d'acceptation (Given / When / Then)

Convention : « écran exercice » = vue d'un exercice de musculation en cours. Viewport de référence 375×667 et 390×844.

### A. Lisibilité et hiérarchie
- **AC-A1** Given l'écran exercice est affiché, When aucune interaction n'a lieu, Then la charge et les reps de la série active sont affichées en Fraunces avec une taille calculée ≥ 38 px.
- **AC-A2** Given l'écran exercice sur 375×667, When la page est chargée sans scroll, Then le bouton « Valider » est entièrement visible et son bord bas est à ≤ 120 px du bas du viewport (hors safe-area).
- **AC-A3** *(décision D-1)* Given n'importe quel écran live, When on mesure les textes, Then aucun texte n'a une taille calculée < 10 px.
- **AC-A4** Given n'importe quel écran live, When on mesure les cibles tactiles (Valider, steppers, Passer, ±15 s, sélecteur d'exo, « Annuler » du toast, « Fin », « Liste »), Then chacune fait ≥ 44×44 px.
- **AC-A6 (empilement bas d'écran)** Given l'écran exercice, When il est affiché, Then la barre d'onglets n'est pas rendue et le dock contient, de bas en haut : safe-area, rangée [Exos | CTA principal], puis le bandeau repos s'il est actif ; le toast s'affiche au-dessus du dock sans le recouvrir ; le contenu scrollable a un padding bas ≥ hauteur du dock.
- **AC-A7** Given la vue liste avec un repos en cours, When elle est affichée, Then le bandeau repos compact est placé juste au-dessus de la barre d'onglets, sans la recouvrir.
- **AC-A8** Given l'écran exercice sur 375×667 avec la 4e série sur 4 active, When la page est chargée, Then la ligne active complète (chiffres + steppers) et le CTA sont visibles sans scroll manuel.
- **AC-A5** Given l'écran exercice, When il est affiché, Then le masthead H1 du nom de programme n'est pas rendu (il n'existe que sur la vue liste).

### B. Règles couleur Direction A
- **AC-B1** Given l'écran exercice avec une série active, When on inventorie les éléments en `racing` (#FACC15, texte, bordure ou fond), Then ils appartiennent tous au seul bloc de la série active (ligne + ses chiffres), plus au plus l'indicateur d'onglet actif.
- **AC-B2** Given la vue liste avec 2 exercices commencés non terminés, When elle est affichée, Then au plus une card porte la bordure `racing` (le dernier exercice touché) ; l'autre est en état neutre avec son compteur X/Y.
- **AC-B3** Given une séance sans record battu, When on parcourt tous les écrans live, Then aucun élément `blood` (#DC2626) n'est visible.
- **AC-B4** Given une série validée remplit la définition de PR (AC-J12), When elle est validée, Then un badge « PR » `blood` apparaît sur cette ligne uniquement.
- **AC-B5** Given n'importe quel écran live, When on inspecte les couleurs, Then aucune couleur hors tokens Direction A n'est utilisée et aucun emoji n'est affiché.
- **AC-B6** Given toutes les séries d'un exercice sont validées, When l'écran exercice est affiché, Then toutes les lignes ont `border-left` `acid` et aucune n'est `racing`.

### C. Validation d'une série
- **AC-C1** Given une série active dont la charge affichée n'est pas inférieure à la charge planifiée, When l'utilisateur tape « Valider », Then la série passe en état validé (`acid`) en 1 tap, sans dialogue.
- **AC-C1b (couleur CTA, D-2)** Given une série active, When le dock est affiché, Then le CTA « Valider la série » a un fond `paper` et un texte `ink` (ni `acid` ni `racing`).
- **AC-C2** Given une série validée, When on regarde le tableau, Then ses valeurs restent affichées dans la ligne, sans checkbox ni numéro de série.
- **AC-C3** Given la dernière série d'un exercice est validée, When la validation est faite, Then aucun repos n'est lancé, l'app reste sur l'écran exercice (état terminé) et le CTA devient « Exercice suivant » nommant le premier exercice non terminé qui suit dans l'ordre du programme (en reprenant au début si besoin).
- **AC-C3b** Given tous les exercices de la séance sont terminés, When la dernière série est validée, Then le CTA devient « Terminer la séance ».
- **AC-C4** Given une série validée par erreur, When l'utilisateur tape sur sa ligne, Then il peut corriger ses valeurs (charge, reps) sans perdre le repos en cours.
- **AC-C5** Given une série déjà validée est corrigée, When la correction est enregistrée, Then les valeurs des séries suivantes ne changent pas.
- **AC-C6** Given une série déjà validée est corrigée, When la correction est enregistrée, Then le badge PR de l'exercice est recalculé (il peut apparaître, changer de ligne ou disparaître).
- **AC-C7 (anti double validation)** Given une série active, When l'utilisateur tape 2 fois sur « Valider » en moins de 500 ms, Then une seule série est validée.
- **AC-C8** Given un repos en cours, When on regarde le CTA principal, Then il affiche « Passer le repos » (aucun « Valider » n'est proposé pendant le repos).
- **AC-C9** Given le CTA vient de changer d'action (fin de repos, Passer), When l'utilisateur tape dessus dans les 1 000 ms suivant le changement, Then le tap est ignoré.
- **AC-C10 (séance terminée)** Given toutes les séries de toutes les exercices sont validées, When la vue liste est affichée, Then la barre de progression est à 100 % `acid`, toutes les cards ont une bordure `acid` et aucune card n'est `racing`.

### D. Correction rapide des valeurs
- **AC-D1** Given une série active de type `weight`, When l'utilisateur tape « + » sur la charge, Then la charge augmente de 2,5 kg (cran unique, décision D-4) sans ouvrir de modale ni de clavier.
- **AC-D2** Given une série active de type `weight`, When l'utilisateur tape « − » sur les reps, Then les reps diminuent de 1, sans modale ni clavier.
- **AC-D3** Given reps = 1, When l'utilisateur tape « − » sur les reps, Then la valeur reste 1.
- **AC-D4** Given une charge de 0 kg, When l'utilisateur tape « − », Then la charge reste 0.
- **AC-D5** Given une série active, When l'utilisateur tape sur la valeur de charge elle-même, Then un clavier numérique décimal s'ouvre pour saisir une valeur arbitraire.
- **AC-D8** Given la saisie clavier de la charge, When l'utilisateur saisit « 142,5 » (virgule), Then la charge enregistrée est 142.5 kg.
- **AC-D9 (garde-fou baisse, D-6)** Given une charge baissée au stepper « − » ou au clavier, When la modification est faite, Then aucune confirmation n'est demandée à ce moment.
- **AC-D10 (D-6)** Given la charge de la série active est inférieure à sa charge planifiée, When l'utilisateur tape « Valider », Then la confirmation « Réduire le poids de X kg à Y kg ? » est demandée avant validation.
- **AC-D11** Given la confirmation de baisse est affichée, When l'utilisateur annule, Then la série n'est pas validée et la charge saisie reste affichée.
- **AC-D6** Given une série active de type `countdown`, When l'écran est affiché, Then la durée (s) remplace charge/reps et dispose des mêmes steppers (cran 5 s).
- **AC-D7** Given une série active de type `stopwatch`, When l'écran est affiché, Then le CTA principal est « Démarrer chrono » et aucun stepper n'est proposé.

### E. Repos
- **AC-E1** Given une série validée avec un repos > 0, When la validation est faite, Then le temps restant s'affiche en décompte sur l'écran exercice, sans changement de page.
- **AC-E2** Given un repos en cours, When l'utilisateur navigue vers la liste ou un autre exercice, Then le temps restant reste visible.
- **AC-E3** Given un repos en cours, When l'utilisateur tape « Passer », Then le repos s'arrête en 1 tap et un toast « Annuler » est proposé pendant 3 s.
- **AC-E4** Given un repos en cours, When l'utilisateur tape « +15 s », Then le temps restant augmente de 15 s.
- **AC-E5** Given un repos en cours, When l'utilisateur modifie la charge de la série suivante avec « + », Then la série suivante affiche la nouvelle charge et le repos continue.
- **AC-E6** Given un repos en cours, When il reste ≤ 5 s, Then un état d'alerte visuel distinct est affiché (en plus du son/vibration existants).
- **AC-E7** Given un repos en cours, When on inventorie les éléments `racing` de l'écran affiché (exercice, liste ou tiroir), Then seul le décompte est en `racing` (plus au plus l'indicateur d'onglet actif) ; la série suivante est « en préparation » (bordure `paper`, éditable, pas `racing`).
- **AC-E8** Given le repos arrive à 0, When le décompte se termine, Then la première série non validée **de l'exercice affiché** devient la série active (`racing`) sans action de l'utilisateur.

### F. Navigation entre exercices
- **AC-F1** Given l'écran exercice, When l'utilisateur veut un autre exercice, Then il y accède en ≤ 2 taps sans passer par le haut de page.
- **AC-F2** Given la vue liste, When un exercice passe de « à faire » à « fait », Then la position des autres cards ne change pas pendant la séance (ordre stable).
- **AC-F3** Given la vue liste, When elle est affichée, Then aucune card ne porte de numéro d'ordre.
- **AC-F4** Given un exercice commencé puis quitté, When l'utilisateur y revient, Then la série active est la première non validée.
- **AC-F5** Given une card d'exercice avec valeurs planifiées différentes par série (10/10/8/8), When la liste est affichée, Then le résumé reflète le plan par série (format de `formatSeriesSummary`, ex. « 10/10/8/8 × 40 kg »).

### G. Header et progression
- **AC-G1** Given l'écran exercice, When il est affiché, Then le header montre X/Y séries et une barre `acid` proportionnelle, sur une hauteur ≤ 96 px.
- **AC-G2** Given le header, When on compte les stats `cyan`, Then il n'y a pas deux stats exprimant la même grandeur (pas Volume kg + Tonnage t).
- **AC-G3** Given la vue liste, When la durée estimée est affichée, Then elle est calculée par `computeEstimatedDuration` (et non plus 30 s/série en dur).
- **AC-G4** Given n'importe quel écran live, When l'utilisateur tape « Fin », Then une confirmation est demandée avant de terminer la séance.

### H. Multi-activités (superset)
- **AC-H1** Given un exercice à 2 activités par série, When l'écran exercice est affiché, Then chaque ligne de série montre les valeurs des 2 activités et l'activité active est identifiable sans numéro.
- **AC-H2** Given l'activité 1 d'une série est validée, When l'activité 2 est active, Then seule l'activité 2 porte le `racing`.

### I. Cardio
- **AC-I1** Given une séance cardio, When elle est affichée, Then aucun exercice ne porte de numéro d'ordre.
- **AC-I2** Given une séance cardio avec plusieurs exercices non faits, When elle est affichée, Then au plus un exercice porte le `racing` (le premier non fait).
- **AC-I3** Given un exercice cardio, When l'utilisateur saisit temps, puissance et distance, Then chaque champ ouvre un clavier numérique adapté (entier pour min/W, décimal pour km).
- **AC-I4** Given un exercice cardio marqué fait, When l'utilisateur tape à nouveau sur « Fait », Then l'état ne repasse pas en « à faire » sans confirmation.

### J. Règles tranchées (demandes QA du 2026-09-24)
- **AC-J1 (exo commencé non actif)** Given un exercice commencé (≥ 1 série validée, < toutes) qui n'est pas l'exercice ouvert en dernier, When la liste est affichée, Then sa card n'est pas `racing` : bordure `todo` + compteur « X/Y » (ajusté après itération 1 du designer).
- **AC-J2 (changement d'exo pendant un repos)** Given un repos en cours sur l'exercice A, When l'utilisateur ouvre l'exercice B, Then le décompte continue (visible sur B, seul élément `racing`) et la première série non validée de B est affichée « en préparation » (éditable, pas `racing`).
- **AC-J3** Given le repos lancé depuis A se termine alors que B est affiché, When il arrive à 0, Then l'app reste sur B (pas de retour forcé vers A) et l'alerte son/vibration est jouée.
- **AC-J4 (Passer le repos)** Given un repos en cours, When l'utilisateur tape « Passer », Then le décompte disparaît, la série suivante devient active et un toast « Annuler » est affiché 3 s.
- **AC-J5** Given le toast « Annuler » est affiché, When l'utilisateur le tape, Then le décompte reprend au temps restant au moment du « Passer » et les modifications de valeurs faites entre-temps sont conservées.
- **AC-J5b** Given le toast « Annuler » est affiché, When l'utilisateur valide la série active avant la fin des 3 s, Then le toast disparaît et le repos ne peut plus être restauré.
- **AC-J6 (retour pendant le repos)** Given un repos en cours, When l'utilisateur quitte l'écran séance puis y revient, Then le décompte affiche le temps restant réel (horloge murale) ou, s'il est écoulé, la série suivante est active ; jamais d'écran figé.
- **AC-J7 (bornes charge)** Given la saisie de charge, When la valeur est vide, négative ou > 500, Then la valeur n'est pas enregistrée et la valeur précédente est réaffichée. Plage acceptée : 0 à 500 kg, pas de 0,5.
- **AC-J8 (bornes reps)** Given la saisie de reps, When la valeur est vide, ≤ 0, décimale ou > 100, Then la valeur n'est pas enregistrée et la valeur précédente est réaffichée. Plage acceptée : entier 1 à 100.
- **AC-J9 (bornes durée)** Given la saisie de durée (`countdown`), When la valeur est vide, ≤ 0 ou > 3600, Then la valeur précédente est réaffichée.
- **AC-J10 (hors ligne)** Given le téléphone est hors ligne, When l'utilisateur valide une série ou modifie une valeur, Then l'action est appliquée à l'écran immédiatement et conservée après rechargement de l'app (snapshot local).
- **AC-J11** Given des modifications faites hors ligne, When le réseau revient, Then elles sont synchronisées sans action de l'utilisateur. (Indicateur hors ligne : discret, `muted`, jamais `blood`.)
- **AC-J12 (PR = record historique, D-3)** Given un exercice `weight` déjà réalisé lors d'au moins une séance passée, When une série est validée avec une charge strictement supérieure à la meilleure charge jamais validée sur cet exercice (toutes séances passées confondues, même nom d'exercice, reps ≥ 1), Then elle est marquée « PR » (`blood`).
- **AC-J12b** Given plusieurs séries de la séance dépassent le record historique, When l'exercice est affiché, Then un seul badge PR est visible, sur la série de charge la plus haute ; à charge égale, la première validée.
- **AC-J12c** Given un exercice jamais réalisé auparavant (aucun historique), When ses séries sont validées, Then aucun badge PR n'est affiché.
- **AC-J12d** Given une séance précédente plus faible qu'une séance plus ancienne, When une série bat la séance précédente mais pas la charge max historique, Then aucun badge PR n'est affiché. *(Note dev : `ex.prevSeries` ne contient que la dernière séance ; la charge max historique par exercice est une donnée à fournir.)*
- **AC-J13 (plan par série)** Given un programme planifié 12/10/8 reps, When la séance live démarre, Then les séries affichent respectivement 12, 10 et 8 reps (lecture de `series[i].values[j]`).
- **AC-J14 (exo vide)** Given un exercice sans série ou sans activité, When la liste est affichée, Then sa card indique « Aucune série planifiée » en `muted`, n'est pas marquée « Fait », et l'ouvrir n'interrompt pas l'app.

### Bugs signalés par la QA — périmètre
| Bug | Décision v3 |
|---|---|
| Retour pendant repos → écran figé (`back-seance`, `stopCountdown` laisse `liveRest`) | **Inclus** (AC-J6), l'écran repos dédié disparaît de toute façon |
| Live ignore le plan par série (app.js:844) | **Inclus** (AC-J13, AC-F5) |
| Exo sans série/activité → plantage + « Fait » | **Inclus** (AC-J14) |
| Reprise d'une séance cardio → plantage `ex.done.duration` | **Hors v3 UI**, story bug séparée, prioritaire (P1) |
| Suppression d'une séance en cours ne purge pas le snapshot local | **Hors v3 UI**, story bug séparée (P2) |
| Sync montre : la valeur base écrase une saisie locale en vol (app.js:2150), met AC-J11 à risque | **Hors v3 UI**, story bug séparée (P1, prérequis de AC-J11) |
| XSS stocké : noms exo/programme/muscle injectés en `innerHTML` sans échappement | **Inclus** (AC-K1), exigence transverse |

### K. Exigence transverse
- **AC-K1** Given un exercice nommé `<img src=x onerror=alert(1)>`, When il est affiché dans la liste, l'écran exercice, le tiroir ou le cardio, Then le texte s'affiche littéralement et aucun script ne s'exécute.

### Definition of Done (maquette)
- Maquettes 390×844 pour : liste, exercice (série active), exercice (repos en cours), exercice (terminé, avec un PR), cardio.
- Chaque AC ci-dessus est vérifiable sur la maquette ou explicitement marqué « comportement » pour la QA.
- Revue PO validée (journal ci-dessous), aucune violation des règles `racing` / `blood`.

## 9. Journal des retours au designer


### Itération 0 — brief envoyé (2026-09-24)
Brief transmis au designer. Constats du designer (H1 répété, une seule série visible, modale d'édition, doublon Volume/Tonnage, repos qui se masquent, retour hors pouce, glyphes dans les CTA) : tous confirmés et intégrés.

### Retours QA intégrés (2026-09-24)
Contradictions levées : J2/E7 (un seul foyer racing pendant le repos, série de B « en préparation »), J3/E8 (« série de l'exercice affiché »), C3 (un seul comportement : CTA « Exercice suivant »), A3 marqué ARB-1. Trous comblés : C5 à C10, D8 à D10, J5b, J12b/c, A6 à A8, K1.

### Itération 1 — draft `live-session-v3.draft.html` (7 frames 390×844)
Décisions sur les questions du designer : CTA Valider en `acid` (validé) ; le dock remplace la tab bar en vue exercice (validé, devient AC-A6) ; « Fin » reste en haut avec confirmation (validé).
Validé : steppers 48 px avec tap sur le chiffre, série suivante en bord `paper` non `racing` pendant le repos, alerte ≤ 5 s en `racing` plein (pas `blood`), toast Annuler 48 px, tiroir Exos en 2 taps avec mini-bandeau repos, CTA « Exercice suivant » après la dernière série (AC-C3 tranché dans ce sens), superset, cardio sans numéros, un seul `blood` (PR). AC-J1 ajusté : bord `todo` pour un exo commencé non actif.

| Prio | Retour |
|---|---|
| P1 | Frame 375×667, 4e série active (3 lignes faites au-dessus) : ligne active et CTA visibles sans scroll (AC-A8). Compacter les lignes faites. |
| P1 | Frame liste pendant un repos : bandeau compact au-dessus de la tab bar ; la card « dernier touché » perd le `racing` (AC-A7, AC-E7). |
| P1 | « Exos 2/7 » se lit comme une position : afficher le nombre d'exos terminés ou restants. |
| P1 | Frame de transition fin de repos : CTA « Passer » qui devient « Valider » ; annoter que les taps sont ignorés pendant 1 s (AC-C8, AC-C9). |
| P2 | Card de liste : afficher la charge de la prochaine série à faire. |
| P2 | Une seule échelle de taille pour les lignes faites (30 px contre num-set). |
| P2 | Cardio : « Marquer fait » dans le dock, « Rouvrir » avec confirmation (AC-I4). |
| P2 | Variante du dernier exercice : CTA « Terminer la séance » (AC-C3b). |
| P3 | Dock repos : afficher « Repos · <exercice> » sans numéro de série ; mini-frame « séance terminée » (AC-C10). |


### Itération 2 : draft v2 (13 frames), **validée par le PO**
Vérifié frame par frame (grep des tokens) : un seul foyer `racing` par écran, en plus de l'onglet actif toléré. `blood` n'apparaît que sur le badge PR (frame 05). Aucun emoji ni glyphe dans les CTA, aucun texte sous 10 px, radius ≤ 0.375rem.
Les 4 P1 sont traités :
- 02bis en 375×667 : lignes faites ≤ 44 px à 26 px, en-tête d'exercice sur une ligne, scroll automatique de la ligne active.
- 01b : liste pendant un repos.
- Le dock affiche « Exos · 1/7 faits ».
- 03d : pendant le garde-fou de 1 s, le CTA reste à 60 % d'opacité.

P2 et P3 traités : 42,5 kg sur la card, échelle unique à 26 px, dock cardio avec « Rouvrir », 05b « Terminer la séance », « Repos · <exercice> », 08 « séance terminée ». La QA a ajouté 04b (autre exercice pendant un repos), 09 (stepper désactivé à la borne) et un bouton Fermer dans le tiroir.
Aucun retour bloquant, itérations closes.

## 10. Décisions 2026-09-24

| # | Sujet | Décision | Source | AC impactés |
|---|---|---|---|---|
| D-1 | Taille de texte minimale en séance live | 10 px (dérogation au design system LOCKÉ, limitée à la séance live) | utilisateur | AC-A3 |
| D-2 | Couleur du CTA « Valider » | `paper` (fond blanc, texte `ink`) ; `acid` reste réservé aux états validés | utilisateur | AC-C1b (le draft v2 est à ajuster : CTA acid → paper, frames 02, 02bis, 03d, 06) |
| D-3 | Définition d'un PR | Record historique : meilleure charge jamais validée sur l'exercice | utilisateur | AC-B4, AC-J12 à J12d |
| D-4 | Cran du stepper de charge | 2,5 kg partout | utilisateur | AC-D1 |
| D-5 | Délai d'ignorance des taps après un changement d'action du CTA | 1 000 ms | défaut orchestrateur | AC-C9 |
| D-6 | Confirmation de baisse de charge | Uniquement au tap sur « Valider », jamais au stepper ni à la saisie | défaut orchestrateur | AC-C1, AC-D9 à D11 |
| D-7 | Registre de la copie | Tutoiement | défaut orchestrateur | toute la copie UI |
| D-8 | Slogan « Build · Fuel · Dominate » | Conservé | défaut orchestrateur | — |
| D-9 | Barre d'onglets en vue exercice | Remplacée par le dock (Historique et Données accessibles depuis la liste) | défaut orchestrateur | AC-A6 |
