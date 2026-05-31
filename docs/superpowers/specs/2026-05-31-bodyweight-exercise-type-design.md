# Type d'exercice « Poids du corps »

Date : 2026-05-31
Statut : design validé (approche A)

## Objectif

Ajouter un 4ᵉ type d'activité **`bodyweight`** (« Poids du corps ») aux côtés de
`weight` / `countdown` / `stopwatch`. Couvre tractions, pompes, dips, etc. — la
charge est le corps, avec un **lest optionnel** (gilet/ceinture).

## Décisions

| Sujet | Décision |
|---|---|
| Champs suivis | **reps + lest** (poids ajouté, optionnel) |
| Forme de données | Réutilise `{ reps, weight }` — `weight` = lest. Aucune nouvelle clé. |
| Volume/tonnage kg | **Exclu** (le lest ne compte pas comme tonnage) |
| Reps | **Incluses** dans le total reps de la séance |
| Affichage lest 0 | « PdC » · lest > 0 → « +Xkg » |
| Catalogue | Entrées bodyweight via `default_activities:[{"type":"bodyweight"}]` (jsonb existant, pas de migration) |
| Prompt IA | Progression reps + lest injectée dans le feedback post-séance |

### Hors scope
- Remap du legacy `calisthenics → countdown` : inchangé.
- Calcul de volume kg à partir du poids de corps réel (`body_measurements`) : non.

## Modèle de données

Activité :
```json
{ "type": "bodyweight", "name": "Dos", "label": "", "reps": 8, "weight": 10, "rest": 90 }
```
- `weight` = lest en kg (0 = poids de corps pur).

Série (identique à `weight`) :
```json
{ "activityStates": { "0": "done" }, "values": [ { "reps": 8, "weight": 10 } ] }
```

## Règle métier — source unique

Une seule règle nouvelle : **bodyweight compte les reps mais pas le tonnage kg.**

- `totalVolume` / `plannedVolume` (app.js:90-110) : le garde existant
  `if (act.type !== 'weight') return sa` exclut déjà bodyweight du tonnage → **aucun changement**.
- Total reps de la séance (app.js:933-943) : aujourd'hui `if (act.type !== 'weight') return`.
  → Élargir pour que `bodyweight` alimente `totalReps`/`doneReps` (mais pas `totalVolume`).

## Composants impactés

### 1. `exercise-editor.js` — éditeur d'activité
- `ACTIVITY_TYPES` += `'bodyweight'` ; `ACTIVITY_LABELS.bodyweight = 'Poids du corps'`.
- `updateActivityFields` : branche `bodyweight` → input reps `× ` input lest, libellé
  « lest » et placeholder/hint « PdC » quand vide.
- `readExerciseCard` : lit déjà `reps` + `weight` génériquement → **aucun changement**
  (classes `.activity-reps` / `.activity-weight` réutilisées).

### 2. `app.js` — séance live (focus série)
- Affichage valeurs (1279) : branche `bodyweight` → `× reps` + badge lest (`+Xkg` ou `PdC`).
- Texte « Préc » (1296) : branche `bodyweight` → `Préc : 8 × +10kg` / `8 × PdC`.
- Init série (852) + prefill (4833) : traiter `bodyweight` comme `weight`
  (`{ reps, weight }`), pas comme `duration`.
- Suggestion IA placeholder (1318) : afficher aussi pour bodyweight (optionnel, même UX que weight).

### 3. `app.js` — totaux séance
- (933-943) compter reps bodyweight ; ne pas ajouter au volume.

### 4. `app.js` — recap / historique
- Affichage des séries bodyweight cohérent avec la branche live (`reps × lest/PdC`).

### 5. Modales d'édition (live mobile + backoffice)
- Inputs reps + lest pour bodyweight (mêmes champs que weight, libellé lest).

### 6. Catalogue d'exercices (`backoffice.js` / exercise-editor)
- La CRUD catalogue doit permettre de choisir le type `bodyweight` pour
  `default_activities`. Sérialisation jsonb naturelle, pas de migration.

### 7. Prompt IA (`app.js`)
- Payload post-séance (3449-3453) : branche `bodyweight` → `{ reps, lest_kg }`.
- `COACH_PROMPT` (3172) : ajouter une phrase « Pour les exercices au poids du corps,
  juge la progression sur les reps (et le lest s'il augmente), pas sur le tonnage. »
- `generateWeightSuggestion` (3221) : inclure bodyweight dans le matching si utile
  (sinon laisser tel quel — suggestion de charge non pertinente sans lest).

## Stratégie de test (TDD)

Tests unitaires (vitest) sur la logique pure d'abord, avant tout code :

1. `totalVolumeShould.ExcludeBodyweightLestFromTonnage()` — une série bodyweight
   `reps 8 × lest 10` ⇒ volume kg = 0.
2. `totalRepsShould.IncludeBodyweightReps()` — total reps inclut les 8 reps bodyweight.
3. `migrateExerciseShould.PreserveBodyweightActivityShape()` — un exo bodyweight
   reste `{reps, weight}` après migration.
4. `readExerciseCardShould.ReadBodyweightAsRepsAndLest()` (jsdom) — lecture DOM.
5. `feedbackPayloadShould.SerializeBodyweightAsRepsAndLestKg()` — payload IA.

Rendu DOM (focus série, recap, modales) : vérifié manuellement à la salle + revue
visuelle vs Direction A.

## Conformité Direction A

- Lest > 0 affiché en `paper` (mesure neutre, pas un accent sémantique).
- Badge « PdC » en `muted`.
- Type bodyweight ne crée aucune nouvelle couleur — réutilise les tokens existants.
