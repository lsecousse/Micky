# Super sets — écrans (phase 2)

Date : 2026-10-18 · Exécutant : micky-supersets-ecrans

Suite de `2026-10-18-supersets-design.md` (phase 1, logique pure, fusionnée : PR #2). Références qui font foi :
`designs/supersets/supersets.html` (7 écrans validés par Lionel : « Validée »), `designs/supersets/NOTES.md`
(règles métier tranchées), `.claude/CLAUDE.md` (look Carnet, lot 1 fusionné : PR #3).

Trois lots, une PR chacun, revue et fusion avant le suivant :

| Lot | Écrans | Fichiers |
|---|---|---|
| A | 01 à 05 : séance live (passage A1 B1…, transition, repos de tour, liste, tiroir « Grouper ») + groupe enregistré en séance | `app.js` (séance live), `index.html`, `supabase.js`, `lib/` |
| B | 06 : éditeur de programme mobile | `exercise-editor.js`, `app.js` (éditeur) |
| C | 07 : back-office PC | `backoffice.*` |

Hors périmètre : `renderHistory`, `openModal`, `renderStats` (lot 2 Carnet en parallèle). L'appli montre une séance
groupée dans l'historique comme aujourd'hui (exercice par exercice). La montre (client qui lit la séance en cours) ne
connaît pas les groupes : elle continue de voir des exercices simples.

## Lot A — séance live

### Données

- `startSession` copie `ex.group` du programme sur l'exercice de séance ; le nombre de séries est `group.rounds`
  quand il existe (déjà égal à `sets` pour un programme cohérent).
- `liveSessionSnapshot` écrit `group` ; `pushSession` le range dans `execution.group` (fonte). Lecture déjà faite par
  `recomposeExercise` / `restoreLiveExercises` (phase 1). Aucune migration : la RPC `upsert_session_with_exercises`
  supprime et réinsère les lignes dans l'ordre du tableau.
- `index.html` charge `lib/supersets.js` puis `lib/superset-flow.js` (après `lib/watch-sync.js`), ajoutés au `SHELL`
  du service worker ; `CACHE_NAME` incrémenté.

### Déroulé (écrans 01, 02, 02b, 03)

- Toucher une entrée de la liste ouvre `nextUndoneInBlock` (pour un groupe : A1 B1 A2 B2…).
- `completeFocusedActivity` utilise `nextLiveStep` :
  - `pause.kind === 'rest'` : comportement actuel (repos de l'activité, écran de repos existant).
  - `'roundRest'` (écran 03) : décompte surligné « Repos · fin du tour N », boutons −15 s / +15 s, « Passer le repos » ;
    la prochaine étape (A du tour suivant) attend dans un cadre `sheet`.
  - `'transition'` (écran 02) : si `seconds > 0`, décompte surligné « Transition · va au <exercice> », bouton
    « +15 s », bouton « Je suis prêt » ; à la fin du décompte, l'écran passe à l'arrêt 02b au lieu d'enchaîner seul
    (règle « toujours un écran à valider »). Si `seconds === 0` : directement 02b, « Va au poste suivant »,
    « B · Rowing barre », bouton « J'y suis ».
  - `next` nul : retour à la liste (inchangé).
- Le décompte de transition et celui de repos de tour passent par `startCountdown` (même synchro `sync` montre, mêmes
  bips) ; les boutons ±15 s ajustent le décompte en cours.
- Vue d'un groupe (01, 02, 03) : sur-titre « Super set · **tour N** sur R » et « k tours faits » en `done` ; titre
  « A + B » (le second en `mut`) ; ligne « Transition 15 s · repos de tour 1 min 30 » ; carnet : un tour fini = une
  ligne résumée (« A 60 × 10 · B 50 × 10 », « fait »), le tour en cours = une ligne par membre (et par activité pour un
  membre multi-activités) avec lettre, kg, reps et la colonne « puis » (transition après un membre, repos de tour
  après le dernier), les tours restants = une ligne résumée « 3–4 ». La série en cours garde la bande surlignée et le
  bouton « Modifier » du lot 1 (pas de boutons − / + : la saisie passe par la modale actuelle, comme pour un exercice
  simple). Le CTA dit « Valider » et l'annonce « puis B · Rowing barre » / « puis repos de tour 1:30 ».
- Libellé du groupe selon sa taille : 2 « Super set », 3 « Tri-set », 4 « Circuit » (NOTES.md : « super set, tri-set,
  circuit court »).

### Liste (écran 04)

- Une entrée par bloc (`exerciseBlocks`). Groupe : en-tête « Super set · 4 tours » (+ « · en cours » et surligneur s'il
  est le bloc en cours, la seule zone `hl`), compteur en tours (`supersetProgress`), trait d'accolade, une ligne par
  membre (lettre, nom en italique, charge). Les blocs finis passent en fin de liste (règle actuelle, par bloc).
- Sous la liste, bouton en pointillés « Grouper des exercices », affiché seulement s'il y a au moins 2 exercices
  groupables (`groupableLiveIndices`).
- Appui long (500 ms) sur l'entrée d'un groupe → dégrouper (voir « Question ouverte »).

### Tiroir « Grouper » (écran 05)

- Feuille du bas sur le modèle de la modale d'édition (`#live-edit-modal`) : titre « Grouper », « Fermer ».
- Liste de tous les exercices fonte : les groupables se touchent dans l'ordre (lettre A, B… dans la case, retoucher
  retire et renumérote) ; les autres sont grisés avec « déjà groupé » ou « commencé ». Au plus 4.
- Réglages : Tours (par défaut `defaultSupersetRounds` des exercices touchés, recalculé tant que l'utilisateur ne l'a
  pas changé ; pas 1, min 1), Transition (15 s par défaut, pas 5 s, min 0), Repos de tour (90 s, pas 15 s, min 0).
- Case « Garder dans le programme », décochée par défaut. Bouton « Grouper N exercices », inactif sous 2.
- Valider : `groupExercises` sur `liveSession.exercises` ; les cartes de temps (`exoStartedAt`, `exoDurations`,
  `serieStartedAt`, `serieDurations`) sont réindexées par la même permutation (`supersetOrder`) ; snapshot poussé.
  Case cochée : même opération sur le programme, indices traduits (voir ci-dessous), puis `updateProgrammeDB`. Si le
  programme refuse (exercice déjà groupé côté programme…), la séance reste groupée et un toast le dit.

### Correspondance séance ↔ programme

Grouper sans « Garder » réordonne la séance seule. Les écritures vers le programme (`updateProgrammeTemplate`,
`updateCardioTemplate`) ne supposent plus que l'indice de séance est l'indice de programme : une fonction pure
`programmeIndexOf(programmeExercises, sessionExercises, exIdx)` retrouve l'exercice du programme par nom normalisé
et rang d'occurrence (2e « Curl » de la séance → 2e « Curl » du programme), et rend -1 s'il n'existe pas (rien n'est
écrit). Elle survit à une reprise de séance (rien à stocker en plus).

La synchro montre (`syncFromDB`) apparie par indice : elle ne lit la base qu'après que toutes les écritures locales
sont confirmées (`createLocalWriteTracker`), et la RPC réécrit les lignes dans le nouvel ordre ; l'ordre distant est
donc celui du téléphone. Inchangée.

### Durées

Les membres d'un groupe n'ont pas de durée d'exercice (`exoDurations` non rempli, `duration_seconds` nul) : leurs
temps se chevauchent et pollueraient la moyenne historique (`load_avg_exercise_durations`) le jour où l'exercice est
refait seul. Les durées de série (`serieDurations`) sont gardées.

### Dégrouper en séance (Guichet #1909, réponse de Lionel)

Réponse de Lionel, telle quelle : « Même case : « Retirer aussi du programme », décochée par défaut (le super set revient
la semaine prochaine sauf si tu coches) ».

- Appui long (500 ms) sur l'entrée d'un groupe dans la liste → fenêtre « Dégrouper » (maquette : « un appui long sur
  l'entrée du groupe, puis « Dégrouper » ») : membres du groupe, case « Retirer aussi du programme » décochée, boutons
  « Annuler » / « Dégrouper ». Le clic court garde l'ouverture du groupe.
- Valider : `ungroupSuperset` sur la séance (aucun réordonnancement, les cartes de temps ne bougent pas), snapshot
  poussé. Case cochée : le groupe du programme qui porte le premier membre (indice traduit par `programmeIndexOf`) est
  dégroupé, puis `updateProgrammeDB` ; s'il n'existe pas côté programme, rien n'est écrit et un toast le dit.
- Comme pour grouper, rien pendant un décompte (toast « Dégrouper après le décompte ») : un décompte de transition ou
  de repos de tour tient une étape du groupe.

### Tests

- Logique pure en TDD (vitest) : `programmeIndexOf`, réindexation des cartes de temps, choix de l'écran de pause
  (rest / roundRest / transition / arrêt), libellés (« Super set » / « Tri-set » / « Circuit », « puis … »), lignes du
  carnet d'un groupe (tours finis / en cours / restants), sélection du tiroir (ordre, renumérotation, max 4, tours par
  défaut), snapshot et `pushSession` avec `group`.
- `tests/browser-scripts.test.js` : index.html charge les scripts super sets (plus de double chargement).
- `tests/carnet-tokens.test.js` : les nouvelles fonctions de rendu dans `MIGRATED_FUNCTIONS`.
- Captures 390 px (Supabase simulé, harnais Playwright) : 01, 02, 02b, 03, 04, 05, et non-régression des écrans du
  lot 1 (série, repos, liste sans groupe).

## Lot B — éditeur de programme mobile (écran 06) et écran Programmes en Carnet

Décisions de l'orchestrateur (2026-10-19) : le lot B passe en Carnet l'éditeur mobile (`openProgrammeEditor`,
`exercise-editor.js`) **et** la liste des programmes (`renderParams`, en-tête `#screen-params` d'`index.html`), qui
partage son conteneur ; micky-look-carnet ne les touche pas (il passera le fond `body` en papier après ce lot). Le
correctif de perte de données (PR #7 : la carte garde l'exercice d'origine, `mergeEditedExercise`) est déjà sur main.

### Modèle de l'éditeur

- L'éditeur tient un tableau `exercises` (fermeture d'`openProgrammeEditor`) et le dessine bloc par bloc
  (`exerciseBlocks`). Toute action de structure suit le même chemin : relire le DOM dans le tableau (cartes via
  `readExerciseCard`, réglages de groupe via leurs champs), appliquer une fonction pure de `lib/supersets.js`, redessiner.
- Actions : ↑ / ↓ d'un bloc (`moveExerciseBlock`), ↑ / ↓ dans un groupe (`moveWithinSuperset`), « Lier au suivant » /
  « Lier le suivant » (`linkNextExercise`), « Dégrouper » (`ungroupSuperset`), « Suppr » (`removeExerciseKeepingGroups`),
  réglages (`setGroupSettings`), « + Exercice » (ajout en fin).
- Enregistrer : relire, puis chaque membre d'un groupe reçoit `sets = group.rounds` (le groupe impose ses tours).
- Catégorie cardio : pas de groupe (la lib refuse le cardio), pas de bouton de lien.

### Écran 06 (maquette `designs/supersets/supersets.html`, figure 06)

- Barre du haut en mode éditeur : « Annuler » (retour à la liste, rien n'est écrit), nom du programme, « Enregistrer »
  (bouton plein `ink`). En mode liste : flèche retour et « Programmes ».
- Carte exercice simple : nom en italique, ↑ ↓, « Suppr », séries, activités, commentaire (champs actuels, look Carnet).
- Entre deux blocs liables (fonte, taille totale ≤ 4) : bouton texte « Lier au suivant ».
- Carte groupe (`sheet`, contour 1,5 px `ink`) : titre « Super set » / « Tri-set » / « Circuit » (`supersetKindLabel`)
  et ↑ ↓ du bloc ; trois réglages « Tours », « Transition », « Repos de tour » (chiffres en IBM Plex Mono, transition et
  repos de tour saisis en secondes avec l'unité « s ») ; une ligne par membre : lettre A/B…, nom en
  italique, résumé (`formatSeriesSummary` sans le nombre de séries : « 10 reps · 60 kg »), ↑ ou ↓ dans le groupe ; pied
  « Lier le suivant » | « Dégrouper ».
- Toucher la ligne d'un membre ouvre sa carte complète sous la ligne (une seule ouverte à la fois) ; dans un groupe, la
  carte cache « Séries » et le repos de chaque activité (remplacés par tours / transition / repos de tour), garde
  « Suppr ».
- Réglages : Tours entier ≥ 1, Transition et Repos de tour entiers ≥ 0 (secondes) ; une saisie invalide reprend la
  valeur précédente.

### Écran Programmes (liste) en Carnet

Même contenu et mêmes actions (↑ ↓ d'ordre, « Modifier », « Suppr » avec confirmation, « + Nouveau programme ») ;
ligne du carnet : nom en italique, « Fonte · 5 exercices » en `mut` 13 px ; un programme qui contient un super set
l'indique (« · 1 super set »).

### Hors périmètre / coordination

- `backoffice.js` utilise `makeExerciseCard` / `readExerciseCard` dans sa modale catalogue : la carte y prend le look
  Carnet dès ce lot (le back-office est repeint au lot C pour l'éditeur de programme, au lot 6 de micky-look-carnet pour
  le reste). Signalé à l'orchestrateur.
- Pas de glisser-déposer sur mobile (↑ ↓ comme aujourd'hui).

### Tests

- TDD sur la logique pure (`lib/programme-editor.js`) : blocs de l'éditeur avec « liable au suivant », lecture des
  réglages (bornes, saisie invalide), programme à enregistrer (`sets = rounds` des membres), résumé d'un membre,
  libellé de la liste (« · 1 super set »).
- `tests/carnet-tokens.test.js` : fonctions repeintes dans `MIGRATED_FUNCTIONS`, bloc `PARAMÈTRES` dans
  `MIGRATED_HTML_BLOCKS`.
- Captures 390 px (Supabase simulé) : liste des programmes, éditeur sans groupe, éditeur avec le super set, membre
  ouvert, après « Lier au suivant », cardio ; enregistrement simulé : le programme envoyé garde le groupe.
