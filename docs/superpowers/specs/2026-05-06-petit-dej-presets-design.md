# Presets petit-dej — saisie rapide

## Contexte

L'utilisateur prend presque toujours le même petit-déjeuner, en deux variantes : **avant la salle** et **après la salle**. La saisie via le bouton "+ Ajouter un repas" oblige à retaper la description et à attendre l'estimation Claude à chaque fois — friction pour un acte quotidien et répétitif.

## Objectif

Ajouter deux boutons dédiés sur l'écran Alimentation pour ajouter en un tap les petits-déjeuners pré-salle et post-salle, à partir de presets configurables. Le premier tap définit le preset (saisie + estimation Claude une fois), les taps suivants insèrent une entrée alimentaire instantanément, sans appel API.

## Conception

### 1. Schéma de données

Nouvelle table `meal_presets` (Supabase).

```sql
CREATE TABLE IF NOT EXISTS public.meal_presets (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot          text        NOT NULL CHECK (slot IN ('pre_gym', 'post_gym')),
  description   text        NOT NULL,
  kcal          numeric,
  proteines_g   numeric,
  glucides_g    numeric,
  lipides_g     numeric,
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (client_id, slot)
);

ALTER TABLE public.meal_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_presets_owner"
  ON public.meal_presets
  FOR ALL
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());
```

- `slot` : enum sémantique (`'pre_gym'` ou `'post_gym'`). Évolutif si on ajoute d'autres presets plus tard.
- Une ligne max par `(client_id, slot)` — upsert sur conflit.
- Macros nullable pour cas où Claude indispo lors de la définition.

### 2. API supabase.js

```js
async function loadMealPresets()                       // → [{slot, description, kcal, ...}]
async function loadMealPreset(slot)                    // → preset | null
async function upsertMealPreset(slot, data)            // upsert sur (client_id, slot)
```

`data` : `{ description, kcal, proteines_g, glucides_g, lipides_g }`.

### 3. UI écran Alimentation

Insertion dans `renderAlimentation()` (app.js:2896), au-dessus du bouton `+ Ajouter un repas` :

```
[ ☕ Petit-dej avant salle  ⚙️ ]
[ 🥛 Petit-dej après salle  ⚙️ ]
[ + Ajouter un repas         ]
[ 🌙 Conseil pour ce soir    ]
[ 💬 Poser une question      ]
```

- **Une `<div class="alim-preset-row">`** par slot, contient :
  - Bouton principal (`flex: 1`) avec emoji + libellé
  - Bouton ⚙️ (compact, à droite) — **caché** si preset vide
- Libellés : `☕ Petit-dej avant salle` et `🥛 Petit-dej après salle`. Sous-texte facultatif (description tronquée) à voir au design CSS.

### 4. Comportement boutons

#### Tap bouton principal

```
si preset vide:
  ouvre openMealPresetEditModal(slot, mode='define')
    → user saisit texte
    → save:
      → estimateMealMacros(text)        // Claude
      → upsertMealPreset(slot, {...})
      → addMealFromPreset(date, slot)   // insère food_entry now
      → close + refresh

si preset rempli:
  addMealFromPreset(date, slot)         // insert direct, pas de modal, pas de Claude
    → toast "Petit-dej ajouté à HH:MM"
    → refresh
```

#### Tap bouton ⚙️

```
ouvre openMealPresetEditModal(slot, mode='edit')
  → texte pré-rempli depuis preset
  → save:
    → estimateMealMacros(text)          // Claude
    → upsertMealPreset(slot, {...})
    → close + refresh (pas d'ajout d'entrée)
```

Pas de suppression de preset dans la V1 : on édite uniquement. Si nécessaire plus tard, on ajoutera un bouton "Supprimer" dans la modal ⚙️.

### 5. Composants

| Fonction | Rôle |
|---|---|
| `openMealPresetEditModal(slot, mode, onSaved)` | Modal pour définir/éditer un preset. Mode `'define'` ou `'edit'`. Réutilise les éléments DOM de `add-meal-modal` ou nouveau modal dédié `meal-preset-modal`. |
| `addMealFromPreset(dateIso, slot, onSaved)` | Lit le preset, copie description+macros, `insertFoodEntryDB({type:'meal', time:now})`. |
| `renderMealPresetButtons(body, dateIso, onChanged)` | Construit la ligne UI dans le DOM alim. |

### 6. Erreurs / cas limites

- **Claude indispo lors définition/édition** → message d'erreur dans modal, retry. Le preset n'est pas créé/modifié.
- **Preset corrompu** (description vide en DB) → traité comme preset vide (bouton principal en mode "définir", ⚙️ caché).
- **Tap rapide multiple** sur bouton principal preset rempli → désactivation pendant l'insert (anti double-clic).
- **Hors connexion** → l'insert direct (preset rempli) reste possible si supabase-js gère le retry ; sinon erreur visible.

### 7. Migration

- `meal_presets` : table neuve, pas de migration de données. Ajouter le SQL dans un nouveau fichier de migration ou via MCP `apply_migration`.

## Hors scope

- Plus de 2 presets ou nommage personnalisable (déjeuner, dîner, snacks).
- Édition d'une entrée alimentaire individuelle.
- Synchronisation cross-device hors ligne.
- Historique / versioning des presets.
