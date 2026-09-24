# QA — Séance live : état des lieux + plan de test v3

Date : 2026-09-24 · Branche : `devLionel` (HEAD `aaba1cf`) · Auteur : agent QA

---

## 1. Résultat `npm test`

```
vitest v4.1.6 — Test Files 6 passed (6) — Tests 81 passed (81) — 156 ms
```

Tout est vert, mais seuls les **6 modules purs de `lib/`** sont testés. Les ~5 000 lignes de `app.js` (dont environ 1 700 lignes de flow live) ne sont couvertes par **aucun test**.

> Note : le CLAUDE.md projet mentionne `localStorage.gym_sessions`. Cette clé n'est plus utilisée nulle part. La persistance passe par Supabase, avec en filet de secours `localStorage['live-session:<id>']` et `localStorage['live-session:pending']` (`app.js:35-58`). Le CLAUDE.md est à mettre à jour.

---

## 2. Cartographie de couverture

| Logique | Emplacement | Testé ? |
|---|---|---|
| Valeurs planifiées par série, fillDown, résumé de card | `lib/planned-series.js` | Oui (bon) |
| Estimation de durée | `lib/duration-estimate.js` | Oui (partiel : pas de repos négatif, pas de stopwatch) |
| Pré-remplissage depuis la séance précédente | `lib/prefill-series.js` | Oui (pas de validation des valeurs précédentes) |
| Recomposition session DB → objet | `lib/recompose-session.js` | Oui |
| Construction d'un exo depuis le catalogue | `lib/programme-from-catalog.js` | Oui, **en Node seulement** (cf. B1) |
| Création des exos live depuis le programme | `app.js:818-869` `startSession` | **Non** |
| Totaux séance (séries, volume, reps, cible) | `app.js:920-950` `renderLiveSession` (inline) | **Non** |
| Prochaine activité non faite | `app.js:624` `nextUndoneActivity` | **Non** |
| Validation d'activité, durées série/exo, enchaînement repos | `app.js:1542-1603` `completeFocusedActivity` | **Non** |
| Propagation d'une édition aux séries suivantes | `app.js:1983` `propagateLiveValue` | **Non** |
| Édition live (poids/reps/repos, confirmation de baisse) | `app.js:1613-1732` | **Non** |
| Countdown repos / chrono / minuterie | `app.js:1847-1981`, `2236-2330` | **Non** |
| Reprise de séance (démarrage app, historique, snapshot local) | `app.js:4940-4990`, `2946-2975` | **Non** |
| Sync montre (polling 500 ms, fusion d'états/valeurs) | `app.js:2093-2180` | **Non** |
| Fin de séance (push, calories, feedback) | `app.js:2044-2089` | **Non** |
| Cardio live | `app.js:1734-1840` | **Non** |

**Trous prioritaires** (dans l'ordre du risque) :
1. Restauration de séance (démarrage app / historique / snapshot local) : c'est là que se trouvent 3 des bugs ci-dessous.
2. Machine d'états live (focus → repos → focus suivant, retour liste, écran quitté pendant un repos).
3. Construction des exos live depuis le programme (ignore `series[i].values`).
4. Sync montre (écrasements concurrents).

Pour tout ça, il faut d'abord **extraire en `lib/` des fonctions pures** : `buildLiveExercises(programme)`, `restoreLiveSession(snapshot)`, `computeLiveTotals(exercises)`, `nextUndoneActivity(ex)`, `propagateValue(series, sIdx, actIdx, field, val)`, `mergeRemoteSession(local, remote)`. Les tests proposés au §6 ciblent ces signatures.

---

## 3. Bugs et risques trouvés

Sévérité : **B** = bloquant, **M** = majeur, **m** = mineur. « Confirmé » = reproduit. « Lecture » = déduit de la lecture du code, déroulé pas à pas.

### B1 — Backoffice : `programme-from-catalog.js` ne se charge pas (Confirmé)
`lib/planned-series.js:12` et `lib/programme-from-catalog.js:7` déclarent tous deux `const DEFAULT_SETS` au niveau global. `backoffice.html` charge les deux en `<script>` classiques, qui partagent la même portée lexicale globale. Le second script lève donc `SyntaxError: Identifier 'DEFAULT_SETS' has already been declared`, et **`buildProgrammeExerciseFromCatalog` / `ensureSeries` sont `undefined`** (utilisés en `backoffice.js:357, 622, 697`). Reproduit avec `vm.runInContext` dans l'ordre de chargement de `backoffice.html` :
```
OK planned-series / OK duration-estimate / FAIL programme-from-catalog Identifier 'DEFAULT_SETS' has already been declared
```
vitest ne le voit pas, parce que chaque fichier y est un module CommonJS isolé. Ce bug est probablement arrivé avec `17094c0`. Test de non-régression proposé au §6.1.

### M1 — Repos en cours + retour à l'accueil : écran repos bloqué (Lecture)
`app.js:216-223` (`back-seance`) appelle `stopCountdown()`, qui met `countdownOnFinish = null` (`app.js:2318`) mais **ne remet pas `liveRest` à null**. En revenant sur l'onglet séance, `renderLiveSession` → `renderRestSplit` affiche un chrono figé (la dernière valeur de `#countdown-display`). « Passer le repos » appelle `finishCountdown()` avec `fn == null` : rien ne se passe à part un toast. La seule sortie est « Fin ». En plus, l'intervalle `window.__restSyncId` (`app.js:1450`) n'est jamais nettoyé en quittant l'écran.

### M2 — Reprise d'une séance cardio : plantage (Lecture)
`app.js:4974` (démarrage) et `app.js:2956` (historique) passent **tous** les exercices dans `migrateExercise`. Pour un cardio (sans `activities`), cette fonction fabrique une activité `weight` et perd `type`, `done` et `state` (`exercise-editor.js:7-29`). La catégorie reste `cardio`, donc `renderLiveCardio` lit `ex.done.duration` (`app.js:1786`) et lève une TypeError. Écran séance vide ou en erreur.

### M3 — Séance en cours supprimée : elle ressuscite au lancement suivant (Lecture)
Le bouton « supprimer » de la carte en cours (`app.js:287-295`) appelle `deleteSessionDB` sans `clearSnapshotLocal`. Au démarrage, `app.js:4949-4961` : pas de séance en cours en base, mais le snapshot local existe, donc il est restauré **et re-poussé** en base.
Variante : une séance terminée hors ligne (`finishSession` échoue au push, le snapshot local garde `duration > 0`). Au lancement suivant, elle est restaurée « En cours », puis le polling la voit `duration > 0` et renvoie à l'accueil. La clé `pending` n'étant jamais purgée hors `finishSession`, **le phénomène se répète à chaque lancement**.

### M4 — Le live ignore les valeurs planifiées par série (Lecture)
`startSession` (`app.js:842-849`) construit chaque série avec `act.reps / act.weight / act.duration`, uniformes. `programme.exercises[i].series[k].values` n'est jamais lu, et `plannedSeries` n'est pas utilisé dans `app.js`. Une pyramide 12/10/8 planifiée par le coach devient 3 × valeur d'activité (souvent 0, puis pré-remplie avec la séance précédente). C'est contraire à l'intention de `lib/planned-series.js` (« single source of truth »). Les activités `stopwatch` reçoivent `{duration}` par défaut.

### M5 — Exo sans séries ou sans activité : plantage et faux « Fait » (Lecture)
`sets: 0` donne `series: []`, et `activities: []` donne `every(...) === true`.
- Dans la liste, `isDone = doneSets === totalSets` vaut `0 === 0`, donc l'exo est marqué **« Fait » en acid** sans rien faire (`app.js:1113, 1127`). Il fausse aussi la règle « acid domine en fin de séance ».
- Un tap ouvre `liveFocus = {exIdx, sIdx:0, actIdx:0}`, puis `ex.series[0].values` (`app.js:1264`) ou `act.type` sur `undefined` lève une TypeError.

### M6 — Sync montre : écrasement des saisies et repos relancé après « Passer » (Lecture)
- `syncFromDB` tourne toutes les 500 ms, **sans garde contre les appels qui se chevauchent**, et `loadSessions()` recharge *toutes* les séances de l'utilisateur à chaque fois (`app.js:2104`). Sur 4G en salle, les requêtes s'empilent.
- Fusion des valeurs (`app.js:2150-2157`) : si `dbVal ≠ localVal`, la base gagne. Une édition locale dont le push est encore en vol est **écrasée par la valeur stale de la base** (perte de mise à jour).
- Après « Passer le repos », `stopCountdown` pousse `sync = null`. Mais un poll en vol qui renvoie encore `sync.type === 'rest'` avec `remaining > 0` relance `startCountdown(remaining, label, null)` (`app.js:2163-2169`) : le bandeau repos réapparaît, sans `onFinish`.
- `remote.duration > 0` signifie « terminée sur la montre ». Or un push local de `finishSession` en vol suffit aussi : pas de problème en soi, mais c'est non déterministe.

### M7 — Valeurs négatives ou vides acceptées (Lecture)
Édition live : `parseFloat('-20') = -20` est accepté (`app.js:1649-1651`). Les attributs `min` ne sont pas appliqués au submit. Reps vides donnent `0`, poids vide donne `0` sans confirmation (la confirmation ne se déclenche que si `newWeight < originalWeight && originalWeight > 0`). Repos négatif : il est **propagé au template programme** (`updateProgrammeTemplate`) puis à `computeEstimatedDuration`, qui retourne une durée négative (vérifié : `rest:-60, sets:2` donne `-30`). Cardio : même chose (`app.js:1778-1795`). `prefillSeriesFromPrev` recopie telles quelles des valeurs précédentes invalides (vérifié : `weight:-5`, `reps:"10"` en string).

### M8 — XSS stocké via noms d'exo, de programme ou de muscle (Lecture)
`ex.name`, `liveSession.programmeName`, `muscle` et `ex.comment` sont interpolés sans échappement dans `innerHTML` (`app.js:1099, 1182, 1245, 1331-1336, 1407, 1752-1758`, et `prog.name` en `744`). Ces valeurs sont éditées par le coach (backoffice) ou l'utilisateur et stockées en base. Un nom `<img src=x onerror=...>` s'exécute chez le client.

### m1 — Règles Direction A violées dans l'UI actuelle
- **Plusieurs lignes racing** : chaque exo « commencé » non terminé est en racing (`app.js:1144-1153`). Si on change d'exo hors ordre, on a N lignes jaunes. Cardio : tous les numéros non faits sont en racing (`app.js:1750`).
- **Numéros sur les cards d'exo** en cardio (`01`, `02`… `app.js:1740, 1750`), contraire à la règle « pas de numéros sur cards exos ».
- CTA « Valider » en fond `acid` (`app.js:1352`) : acid = « validé ». Une action à venir devrait plutôt être paper/racing. Point à trancher avec le designer.
- Emojis dans l'UI : `💡` (`app.js:1364`), `⏭` (`app.js:1411`), `✅` (`app.js:283`), `goMessages` (🔥🚀…).
- Cibles tactiles : le bouton « Fin » (`px-3 py-1.5 text-[10px]`, `app.js:977, 1029`) fait environ 26-28 px de haut, sous les 44 px. Même chose pour le bouton « ← Liste » (texte 10 px sans padding).

### m2 — Divers
- `todayIso()` (`app.js:84`) utilise l'UTC : une séance lancée entre 00:00 et 02:00 à Paris est datée de la veille.
- Countdown repos et minuterie décrémentent un compteur par tick `setInterval` (`app.js:2285`, `1960`). Sur iOS, écran verrouillé ou app en arrière-plan, les timers sont gelés, donc le repos **dérive** (il faut calculer à partir d'un timestamp de fin).
- Minuterie arrêtée tôt : la valeur enregistrée est la durée planifiée, pas la durée réelle (`stopMinuterieOverlay` n'écrit pas l'écoulé).
- Strip stats : « Volume » (kg) et « Tonnage » (t) affichent la même grandeur (`doneVolume`) à une unité près.
- `showConfirm` empile les handlers : deux ouvertures avant fermeture, puis un OK, exécutent `onOk` deux fois. Sur « Fin », on aurait double push, **double insertion `session_burn` en alimentation** et double feedback.
- Démarrage : `sessions.find(duration 0|null)` reprend une séance en cours **arbitraire** s'il y en a plusieurs (abandonnées).
- `formatSeriesSummary({sets:0})` affiche « 4 × … » (`sets || DEFAULT` : 0 est falsy).
- `renderExerciseList` : l'estimation « ≈ X min » (`app.js:1085-1089`) ne passe pas par `computeEstimatedDuration` : il y a deux sources de vérité (DRY).

---

## 4. Plan de test — nouvelle interface séance live (v3)

Données de référence (fixtures) :
- **P-FONTE** : programme « Push / Épaules », 3 exos.
  - E1 « Développé couché » : 1 activité weight, rest 90, series `[{12,60},{10,65},{8,70}]`.
  - E2 « Élévations latérales » : weight, rest 60, 4 × `{15, 8}`.
  - E3 « Gainage » : countdown, rest 30, 3 × `{duration 45}`.
- **P-CARDIO** : programme cardio, 2 exos (« Rameur » 10 min / 150 W, « Vélo » 20 min / 180 W).
- **P-EDGE** : 1 exo `sets: 0`, 1 exo `activities: []`, 1 exo nommé `Tirage horizontal prise neutre unilatérale machine convergente` (63 caractères), 1 exo nommé `<b>X</b>`.

### Happy path
- [ ] TC-001 [happy] Étant donné P-FONTE démarré, quand l'écran live s'affiche, alors le compteur indique `00/10 séries` et la barre de progression fait 0 %.
- [ ] TC-002 [happy] Étant donné P-FONTE démarré, quand j'ouvre E1, alors la série 1 affiche `60 kg × 12` (valeur planifiée série 1, pas la valeur d'activité).
- [ ] TC-003 [happy] Étant donné E1 série 1 en focus, quand je tape « Valider », alors la série 1 passe en acid et l'écran repos affiche `01:30`.
- [ ] TC-004 [happy] Étant donné le repos E1 terminé (90 s écoulées), quand le compteur atteint 0, alors la série 2 est en focus et affiche `65 kg × 10`.
- [ ] TC-005 [happy] Étant donné E1 série 3 validée, quand la validation est enregistrée, alors l'écran revient à la liste et E1 est en bas de liste avec l'état « Fait » (acid).
- [ ] TC-006 [happy] Étant donné E3 (countdown 45 s) en focus, quand je lance la minuterie et la laisse finir, alors la série est validée avec `duration = 45`.
- [ ] TC-007 [happy] Étant donné les 10 séries validées, quand je tape « Fin » puis « OK », alors la séance est poussée avec `duration > 0` et l'accueil ne montre plus « En cours ».
- [ ] TC-008 [happy] Étant donné P-CARDIO démarré, quand je saisis Temps `12` sur Rameur et tape « Valider », alors l'état passe à « Fait » et le snapshot contient `done.duration = 12`.

### États et changements d'exercice
- [ ] TC-010 [edge] Étant donné E1 série 1 validée et en repos, quand je reviens à la liste et ouvre E2, alors le repos E1 est arrêté ou visible (comportement défini dans le BRIEF) et E2 série 1 est la seule ligne racing.
- [ ] TC-011 [edge] Étant donné E1 avec 1/3 séries et E2 avec 1/4 séries (changement hors ordre), quand j'affiche la liste, alors **au plus une** card est en racing.
- [ ] TC-012 [edge] Étant donné E1 terminé, quand je tape sa card, alors j'arrive en mode consultation ou édition, sans nouvelle série active ni repos lancé.
- [ ] TC-013 [regression] Étant donné un repos en cours sur E1, quand je tape « ← » (accueil) puis rouvre la séance, alors je ne suis pas bloqué sur un écran repos figé (M1).
- [ ] TC-014 [edge] Étant donné un repos en cours, quand je tape « Passer le repos » puis « OK », alors la série suivante est en focus en moins de 1 s et le bandeau repos ne réapparaît pas pendant 5 s (M6).
- [ ] TC-015 [edge] Étant donné un repos de 90 s lancé, quand je verrouille l'iPhone 60 s puis le déverrouille, alors le chrono affiche entre `00:29` et `00:31`.
- [ ] TC-016 [edge] Étant donné une série en focus, quand je double-tape « Valider » en moins de 300 ms, alors une seule série est validée (le compteur augmente de 1).
- [ ] TC-017 [edge] Étant donné l'écran live, quand je double-tape « Fin » puis « OK », alors une seule entrée `session_burn` est créée en alimentation.

### Reprise de séance
- [ ] TC-020 [regression] Étant donné P-FONTE avec 4 séries validées, quand je ferme la PWA et la relance, alors la séance reprend avec `04/10` et les mêmes valeurs.
- [ ] TC-021 [regression] Étant donné P-CARDIO en cours, quand je relance la PWA, alors l'écran cardio s'affiche sans erreur console et avec les saisies conservées (M2).
- [ ] TC-022 [regression] Étant donné une séance cardio dans l'historique, quand je tape « Reprendre », alors l'écran cardio s'affiche sans erreur (M2).
- [ ] TC-023 [regression] Étant donné une séance en cours supprimée depuis l'accueil, quand je relance la PWA, alors aucune séance « En cours » n'apparaît (M3).
- [ ] TC-024 [error] Étant donné le mode avion activé pendant la séance, quand je valide 2 séries, alors un toast « Connexion perdue » apparaît **une seule fois** et les 2 séries sont conservées après relance hors ligne.
- [ ] TC-025 [error] Étant donné une séance terminée en mode avion, quand je relance la PWA en ligne, alors la séance est dans l'historique avec sa durée et n'apparaît pas « En cours » (M3).
- [ ] TC-026 [error] Étant donné `localStorage['live-session:abc'] = '{corrompu'` et `pending = 'abc'`, quand je lance la PWA, alors l'app démarre sur l'accueil sans erreur.
- [ ] TC-027 [edge] Étant donné 2 séances avec `duration = 0` en base, quand je lance la PWA, alors la plus récente (`startedAt` max) est reprise.

### Saisie et validation
- [ ] TC-030 [edge] Étant donné l'édition de E1 série 1, quand je saisis Poids `-20`, alors la valeur est refusée et `60` est conservé.
- [ ] TC-031 [edge] Étant donné l'édition, quand je vide le champ Reps et valide, alors la valeur est refusée (pas de reps = 0 silencieux).
- [ ] TC-032 [edge] Étant donné l'édition, quand je saisis Poids `142,5` (virgule, clavier FR iOS), alors `142.5` est enregistré.
- [ ] TC-033 [edge] Étant donné l'édition, quand je saisis Repos `-60`, alors la valeur est refusée et le template programme n'est pas modifié.
- [ ] TC-034 [edge] Étant donné E1 série 1 modifiée à 62 kg, quand je valide, alors les séries 2-3 non faites passent à 62 kg et les séries déjà faites restent inchangées.
- [ ] TC-035 [edge] Étant donné Poids `60` et une saisie de `50`, quand je valide, alors une confirmation « Réduire le poids de 60 kg à 50 kg ? » s'affiche.
- [ ] TC-036 [edge] Étant donné Poids `60` et une saisie de `0` (champ vidé), quand je valide, alors une confirmation s'affiche.
- [ ] TC-037 [edge] Étant donné une édition locale à 62 kg avec le push en vol (réseau 3G throttlé), quand le poll de sync revient, alors l'écran affiche toujours 62 kg (M6).

### Données limites
- [ ] TC-040 [edge] Étant donné P-EDGE avec un exo `sets: 0`, quand la liste s'affiche, alors cet exo n'est **pas** marqué « Fait » et le tap ne plante pas (M5).
- [ ] TC-041 [edge] Étant donné P-EDGE avec un exo `activities: []`, quand je le tape, alors aucune erreur console n'apparaît et un état vide est affiché.
- [ ] TC-042 [edge] Étant donné un programme avec 0 exercice, quand je le démarre, alors un état vide s'affiche et « Fin » est possible.
- [ ] TC-043 [edge] Étant donné le nom à 63 caractères, sur un iPhone SE (320 px), alors aucun scroll horizontal n'apparaît (troncature ou retour à la ligne).
- [ ] TC-044 [edge] Étant donné un poids de `142.5` et des reps `100`, alors les chiffres mega ne débordent pas de leur colonne à 320 px.
- [ ] TC-045 [edge] Étant donné une séance démarrée à 00:30 heure de Paris, alors la date affichée est celle du jour (pas la veille).

### Sécurité
- [ ] TC-050 [security] Étant donné un exo nommé `<img src=x onerror=alert(1)>`, quand la liste live s'affiche, alors le texte est affiché littéralement et aucune alerte ne se déclenche (M8).
- [ ] TC-051 [security] Même vérification pour un programme nommé `A / <script>alert(1)</script>` dans le masthead (chemin `splitProgrammeTitle`).

### Règles visuelles Direction A (contrôle sur la maquette et sur l'implémentation)
- [ ] TC-060 [regression] Étant donné n'importe quel état, alors **exactement 0 ou 1** élément porte la couleur racing « ligne active » (compter `border-l-racing` et `text-racing` hors tab bar).
- [ ] TC-061 [regression] Étant donné une séance sans PR, sans RPE ≥ 9 et sans échec, alors **aucun** élément en `#DC2626` n'est visible.
- [ ] TC-062 [regression] Étant donné une série dont la charge dépasse le max historique de l'exo, alors un badge « PR » blood apparaît sur cette ligne uniquement.
- [ ] TC-063 [regression] Étant donné les 10 séries validées, alors la barre de progression est 100 % acid, toutes les lignes ont `border-l acid` et aucune ligne n'est en racing.
- [ ] TC-064 [regression] Étant donné la liste des exos (fonte et cardio), alors aucune card n'affiche de numéro d'ordre.
- [ ] TC-065 [regression] Étant donné le tableau des séries, alors il ne contient ni checkbox ni colonne « n° de série » (3 colonnes : Charge / Reps / Repos).
- [ ] TC-066 [regression] Étant donné le strip stats, alors les valeurs sont en cyan, fixes (pas d'animation) et les 4 métriques sont distinctes.
- [ ] TC-067 [regression] Étant donné la typo, alors H1 = Fraunces 900 `clamp(2.5rem, 11.5vw, 3.75rem)`, eyebrows = DM Sans `0.28em` / `0.40em`, et aucune Manrope ni Inter seule n'est utilisée.
- [ ] TC-068 [regression] Étant donné les radius, alors aucun `rounded-2xl` ; radius ≤ `0.375rem`.
- [ ] TC-069 [regression] Étant donné les couleurs, alors aucun `#FF6B00`, aucune palette Tailwind par défaut et aucun gradient.
- [ ] TC-070 [regression] Étant donné les CTA et titres, alors aucun emoji.

### Mobile et accessibilité
- [ ] TC-080 [regression] Étant donné un iPhone 14 (390×844, encoche) en standalone, alors le sticky header démarre sous `env(safe-area-inset-top)` et la tab bar / le bandeau repos restent au-dessus de `env(safe-area-inset-bottom)`.
- [ ] TC-081 [regression] Étant donné tous les boutons interactifs (Fin, Liste, Valider, Modifier, Passer le repos, cards), alors chacun a une zone tactile d'au moins 44×44 px.
- [ ] TC-082 [regression] Étant donné une séance live, quand l'écran reste inactif 2 minutes, alors il ne se verrouille pas (Wake Lock actif, réacquis après `visibilitychange`).
- [ ] TC-083 [regression] Étant donné le repos à ≤ 5 s, alors un bip et une vibration se déclenchent chaque seconde (Android) ; sur iOS, pas d'erreur console.
- [ ] TC-084 [regression] Étant donné un contraste texte `muted #888` sur `ink #0A0A0A`, alors le ratio est ≥ 4.5:1 pour les labels de taille ≥ 10 px (5.9:1, OK), et les labels à 8 px sont signalés.

### Performance
- [ ] TC-090 [performance] Étant donné une séance live pendant 60 s, alors le nombre de requêtes `sessions` est ≤ 12 (aujourd'hui environ 120, avec un poll toutes les 500 ms sans garde) (M6).
- [ ] TC-091 [performance] Étant donné le rest split affiché puis quitté 10 fois, alors il ne reste au plus qu'1 intervalle actif (`__restSyncId`) (M1).

---

## 5. Critères d'acceptation manquants à exiger dans le BRIEF

1. Définir l'état visuel d'un exo **commencé mais pas actif** (la règle « une seule racing » l'interdit en racing).
2. Définir le comportement du repos en cours si l'utilisateur change d'exo, revient à la liste ou quitte l'écran.
3. Définir les bornes de saisie : poids 0-500 kg au pas de 0,5 ; reps 1-100 ; repos 0-600 s ; durée 1-3600 s. Préciser le comportement du champ vide.
4. Définir « PR » (charge max ? 1RM estimé ? par exo normalisé ?) : sans définition, TC-062 n'est pas testable.
5. Définir l'état vide (programme sans exo, exo sans série).
6. Définir le comportement hors ligne (toast unique, pas de perte, reprise au lancement).
7. Refuser les termes subjectifs (« fluide », « clair ») : chaque critère doit porter une valeur mesurable.

---

## 6. Tests vitest proposés (RED attendu tant que non implémentés)

### 6.1 Non-régression B1 : les libs cohabitent en portée globale navigateur
```js
// tests/browser-globals.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Same order as backoffice.html / index.html <script> tags
const LOAD_ORDER = ['exercise-name', 'recompose-session', 'planned-series',
  'duration-estimate', 'programme-from-catalog', 'prefill-series'];

describe('LibScriptsShould', () => {
  it('loadTogetherInOneGlobalScopeWithoutRedeclarationError', () => {
    const ctx = vm.createContext({ window: {} });
    const load = f => vm.runInContext(readFileSync(`lib/${f}.js`, 'utf8'), ctx);
    expect(() => LOAD_ORDER.forEach(load)).not.toThrow();
  });

  it('exposeBuildProgrammeExerciseFromCatalogOnWindow', () => {
    const ctx = vm.createContext({ window: {} });
    LOAD_ORDER.forEach(f => { try { vm.runInContext(readFileSync(`lib/${f}.js`, 'utf8'), ctx); } catch (_) {} });
    expect(typeof ctx.window.buildProgrammeExerciseFromCatalog).toBe('function');
  });
});
```

### 6.2 Libs existantes : cas limites non couverts
```js
// tests/planned-series.test.js (ajouts)
it('keepsZeroSetsInsteadOfFallingBackToDefault', () => {
  expect(formatSeriesSummary({ activities: [{ type: 'weight' }], sets: 0 })).toBe('0 × —');
}); // aujourd'hui : "4 × 0 · 0 kg"

// tests/duration-estimate.test.js (ajouts)
it('neverReturnsNegativeDurationWhenRestIsNegative', () => {
  const prog = { exercises: [{ activities: [{ type: 'weight', rest: -60 }], sets: 2 }] };
  expect(computeEstimatedDuration(prog)).toBeGreaterThanOrEqual(0);
}); // aujourd'hui : -30

// tests/prefill-series.test.js (ajouts)
it('ignoresNegativePreviousWeight', () => {
  const ex = [{ activities: [{ type: 'weight' }],
    series: [{ values: [{ reps: 0, weight: 0 }] }],
    prevSeries: [{ values: [{ reps: 10, weight: -5 }] }] }];
  prefillSeriesFromPrev(ex);
  expect(ex[0].series[0].values[0].weight).toBe(0);
});
```

### 6.3 Logique live à extraire en `lib/live-session.js` (signatures proposées)
```js
// tests/live-session.test.js
import { buildLiveExercises, restoreLiveSession, computeLiveTotals,
  nextUndoneActivity, propagateValue } from '../lib/live-session.js';

const bench = { name: 'Développé couché', activities: [{ type: 'weight', rest: 90 }], sets: 3,
  series: [12, 10, 8].map((reps, i) => ({ values: [{ reps, weight: 60 + 5 * i }] })) };

describe('BuildLiveExercisesShould', () => {
  it('usePlannedValuesOfEachSeries', () => {
    const [ex] = buildLiveExercises({ category: 'fonte', exercises: [bench] });
    expect(ex.series.map(s => s.values[0].reps)).toEqual([12, 10, 8]);
  });
});

describe('RestoreLiveSessionShould', () => {
  it('keepCardioExercisesAsCardio', () => {
    const snap = { category: 'cardio', exercises: [{ name: 'Rameur', type: 'cardio',
      done: { duration: 12, power: 150, km: 2 }, state: 'done' }] };
    expect(restoreLiveSession(snap).exercises[0].done.duration).toBe(12);
  });
});

describe('ComputeLiveTotalsShould', () => {
  it('notCountExerciseWithoutSeriesAsDone', () => {
    const t = computeLiveTotals([{ name: 'X', activities: [{ type: 'weight' }], series: [] }]);
    expect(t.doneExercises).toBe(0);
  });
});

describe('NextUndoneActivityShould', () => {
  it('returnNullForExerciseWithoutActivities', () => {
    expect(nextUndoneActivity({ activities: [], series: [{ activityStates: {}, values: [] }] })).toBeNull();
  });
});

describe('PropagateValueShould', () => {
  it('leaveAlreadyDoneFollowingSeriesUntouched', () => {
    const series = [0, 1, 2].map(() => ({ activityStates: {}, values: [{ weight: 60 }] }));
    series[2].activityStates[0] = 'done';
    propagateValue(series, 0, 0, 'weight', 62);
    expect(series[2].values[0].weight).toBe(60);
  });
});
```

---

## 7. Relecture de la proposition v3 (`designs/live-session-v3/`)

Relecture du **BRIEF.md** (PO) et de **live-session-v3.draft.html v1 + NOTES.md** (designer), le 2026-09-24. La v2 du designer n'est pas encore relue.

### 7.1 BRIEF.md — 15 écarts envoyés, tous intégrés par le PO
- Contradictions résolues : pendant un repos, le seul racing est le décompte, et la série de B reste « en préparation » (AC-E7/J2). E8 s'applique à l'exercice affiché. AC-C3 n'a plus qu'un comportement (« Exercice suivant », C3b « Terminer la séance »).
- Ajouts : double tap (C7), CTA verrouillé 1 000 ms après un changement d'action (C9), pas de propagation et PR recalculé à la correction (C5/C6), virgule acceptée (D8), pas de confirmation au stepper mais confirmation conservée au clavier (D9/D10), PR sans historique et égalités (J12b/c), fin de séance acid (C10), empilement bas d'écran (A6-A8), XSS (K1).
- Sortis du périmètre en stories bug : reprise cardio (P1), snapshot non purgé (P2), sync montre (P1, prérequis de J11).
- **Arbitrages utilisateur ouverts** : ARB-1 (texte ≥ 10 px contre eyebrows 8 px du design system LOCKÉ), ARB-4 (confirmation de baisse de poids), définition du PR, cran par exercice, couleur du CTA Valider.

### 7.2 Draft v1 — conforme sur l'essentiel
Conforme : racing unique (02, 03, 05, 06, 07 ; tab bar tolérée en 01), blood seulement sur le PR (05), acid partout à la fin de l'exercice (05), aucun numéro sur les cards (y compris cardio), aucune checkbox ni numéro de série, textes ≥ 10 px, aucun emoji, tokens et polices corrects, steppers 48×48, Fin / Liste / ±15 s / Annuler ≥ 44 px, ordre de liste stable, stats sans doublon.

Écarts envoyés au designer :
| # | Prio | Écart | Cas de test |
|---|---|---|---|
| D1 | P1 | « Passer le repos » et « Valider » sont au même endroit du dock : si le décompte atteint 0 pendant le tap, on valide une série non faite (couvert depuis par l'AC-C9) | TC-016, C9 |
| D2 | P1 | Pas de frame « exo B ouvert pendant le repos de A » (AC-J2) | TC-010/011 |
| D3 | P1 | Aucune frame en 375×667 : avec 4 séries ou plus, la ligne active passe sous le dock (≈102 px, ≈176 px en repos). Il manque un auto-scroll | TC-043, A8 |
| D4 | P1 | « Exos 2/7 » se lit comme un numéro d'ordre de l'exercice | TC-064 |
| D5 | P2 | Exo commencé non actif : bord `todo` + compteur paper, alors que l'AC-J1 dit transparent + muted | AC-J1 |
| D6 | P2 | Données incohérentes : 42,4 kg (hors pas 0,5) ; le PR 05 dit « préc 42,5 × 8 » alors que les « Préc » affichent 40 × 8 | AC-J7, J12 |
| D7 | P2 | Tiroir sans bouton de fermeture ≥ 44 px ; ses `<li>` ne sont pas des boutons | TC-081 |
| D8 | P2 | État stepper désactivé (reps = 1, charge = 0) non montré | AC-D3/D4 |
| D9 | P2 | Superset : formats de durée mélangés (« 45 s » et « 0:38 ») ; `tracking-[0.18em]` hors token | TC-067 |
| D10 | P2 | Cardio : pas de confirmation Fait → À faire (AC-I4) ; empilement toast Annuler / Hors ligne non spécifié | AC-I4, A6 |
| D11 | P3 | « Prends place » contre « Prenez place » ; manifeste en anglais | — |

### 7.3 Draft v2 (vérification rapide)
Tous les écarts D1 à D11 sont traités : nouvelles frames 01b, 02bis (375×667), 03d, 04b, 05b, 08 et 09 ; « Exos · 1/7 faits » ; bouton Fermer ; données corrigées. J'ai contrôlé la couleur racing frame par frame : un seul foyer par frame, plus l'onglet actif qui est toléré. En 01b et 04b, le décompte est le seul racing. En 08 (séance terminée), aucune card n'est racing. Le blood n'apparaît que dans la frame 05.
Reste un seul écart : le badge PR utilise `tracking-[0.18em]` (l.895), qui n'est pas un token.
Arbitrages encore ouverts, à trancher par l'utilisateur : verrouillage du CTA à 600 ms ou 1 000 ms ; couleur du CTA Valider (acid, validé par le PO, ou paper, recommandé par la QA) ; registre tu/vous et manifeste en anglais. L'AC-J1 a été réaligné sur le bord `todo`, choix du designer accepté par le PO.
