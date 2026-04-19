# Suivi alimentaire — Lot F

## Contexte

L'utilisateur veut tracer ses apports caloriques (repas) et ses dépenses (séances de sport) sur une timeline du jour, avec assistance IA pour estimer macros et conseiller le repas du soir.

## Objectif

Un module "Alimentation" accessible depuis le home, qui :
- Permet de saisir des repas (texte + photo optionnelle), avec estimation IA des macros à la soumission.
- Enregistre automatiquement les séances finies comme dépenses caloriques estimées par l'IA.
- Affiche la timeline du jour avec bilan apports / dépenses.
- Propose un conseil "que manger ce soir" basé sur le bilan du jour.

Module visible uniquement si la clé API Claude est configurée (sinon message d'invite).

## Conception

### 1. Réorganisation navigation home

- **Footer home** (3 boutons au lieu de 4) :
  - ⚖️ Données corporelles
  - ⚙️ Programmes
  - 🍽️ Alimentation
- **Burger menu utilisateur** ☰ :
  - 👤 Profil
  - 🔑 Clé API Claude
  - 📋 Historique (déplacé)
  - 📈 Stats (déplacé)
  - 🚪 Déconnexion
- **Supprimé du burger** : "Connecter la montre" (jamais utilisé)

### 2. Schéma de données

```sql
CREATE TABLE IF NOT EXISTS public.food_entries (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  date          date NOT NULL,
  time          time NOT NULL,
  type          text NOT NULL CHECK (type IN ('meal', 'session_burn')),
  description   text NOT NULL,
  photo_path    text,                 -- chemin dans le bucket Storage
  kcal          numeric,              -- positif pour meal, positif pour burn aussi (le signe vient du type)
  proteines_g   numeric,
  glucides_g    numeric,
  lipides_g     numeric,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.food_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client gère ses entrées alimentaires" ON public.food_entries
  FOR ALL USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coach lit les entrées alimentaires de ses clients" ON public.food_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = food_entries.client_id AND p.coach_id = auth.uid())
  );
```

### 3. Storage des photos

- Bucket Supabase Storage `food-photos`, public **non**, accès via signed URL (1h).
- Chemin : `{user_id}/{entry_id}.{ext}`
- RLS Storage : user peut insérer/lire/supprimer dans son propre dossier.

```sql
-- Policies storage (à coller dans le SQL editor Supabase, pas via app)
CREATE POLICY "User uploads to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'food-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "User reads own photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'food-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "User deletes own photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'food-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### 4. Écran Alimentation

Layout :

```
← Alimentation                      (header standard)
─────────────────────────
[ Date sélecteur ▼ ]               (par défaut today)

╭─ Bilan du jour ─────────────╮
│ Apports : 1850 kcal          │
│ Dépenses : 420 kcal          │
│ Net : +1430 kcal             │
╰──────────────────────────────╯

[+ Ajouter un repas]
[🌙 Conseil pour ce soir]

──── Timeline du jour ────
06:15  3 weetabix, miel, banane    ↑ 480 kcal
                                    P 12g · G 92g · L 4g
                                    [✕]

09:30  🏋️ Pectoraux / Bras         ↓ 380 kcal
                                    [✕]

13:00  Poulet, oeuf, huile olive    ↑ 620 kcal
                                    P 48g · G 5g · L 35g
                                    [✕]
```

- Bouton ✕ sur chaque entrée → confirm puis delete.
- Tap sur une entrée avec photo → affiche la photo en grand (modal).
- Pas d'édition d'une entrée existante (seulement suppression / re-création).

### 5. Saisie d'un repas (modal "Ajouter")

```
┌── Ajouter un repas ──┐
│ [Texte libre        ]│
│ [📸 Joindre photo   ]│
│   (preview si photo) │
│                      │
│ [Annuler] [Estimer & │
│            sauvegarder]│
└──────────────────────┘
```

- Bouton "Estimer & sauvegarder" :
  1. Appel Claude (texte) → renvoie JSON `{ kcal, proteines_g, glucides_g, lipides_g }`
  2. Upload photo → Storage si présente
  3. Insert en DB avec `type='meal'`, `time=now()`, `date=today`
  4. Re-render timeline

Prompt Claude pour estimation :
```
Tu es un nutritionniste. L'utilisateur décrit un repas. Estime ses macros et calories en JSON STRICT (pas de markdown, pas d'autres mots) :
{ "kcal": <int>, "proteines_g": <int>, "glucides_g": <int>, "lipides_g": <int> }
Sois conservateur si l'estimation est ambiguë.
```

### 6. Auto session_burn

Dans `finishSession` (`app.js`), juste après le `pushSession` final qui marque la session terminée :

1. Récupérer la session finie (volume, durée, type fonte/cardio).
2. Appel Claude pour estimer kcal dépensées (prompt court).
3. Insert dans `food_entries` :
   - `date` = today
   - `time` = now()
   - `type` = `'session_burn'`
   - `description` = nom programme
   - `kcal` = estimation IA
   - autres macros = null
4. Fire-and-forget (n'empêche pas la fin de séance si l'IA échoue).

Prompt :
```
Tu es préparateur physique. Estime les calories dépensées pour une séance de musculation/cardio. Réponds en JSON STRICT :
{ "kcal": <int> }
Données : type=<fonte|cardio>, duree_min=<int>, volume_kg=<int|null>, exercices=<liste de noms>
Sois conservateur (musculation = endurance + force, pas de pic cardio sauf si cardio).
```

### 7. Conseil du soir

Bouton "🌙 Conseil pour ce soir" → modal Claude :
- Loading spinner
- Prompt : entrées du jour + bilan net → conseil dîner

Prompt :
```
Coach nutrition bienveillant. L'utilisateur a fait sa journée alimentaire. Donne un conseil court (3-4 phrases, français, ton chaleureux) pour son repas du soir : type de plat, équilibre macros, taille de portion. Pas de recette détaillée. Pas de jugement sur ce qu'il a mangé.
```

Données envoyées : timeline du jour (description + kcal + macros + type) + bilan net.

### 8. Conditions API key

À chaque ouverture de l'écran Alimentation :
- Si pas de clé API Claude → afficher uniquement un message "Configure ta clé API Claude dans Profil pour activer le suivi alimentaire" + bouton vers la config.
- Sinon → render normal.

## Hors scope

- Édition d'une entrée existante (seulement supprimer + recréer)
- Allergies (Lot F2 plus tard)
- Recettes externes / scraping (Lot F2)
- Graphique d'évolution macros sur la semaine
- Détection/séparation poids brut vs poids cuit
- Multi-clients (chaque client gère ses entrées, le coach lit en read-only — déjà couvert par RLS)

## Fichiers concernés

- Migration SQL (table + Storage policies + bucket via interface Supabase)
- `supabase.js` : CRUD `food_entries`, upload/delete photo Storage, signed URL
- `index.html` : retirer 2 boutons footer, screen Alimentation, modal d'ajout
- `style.css` : styles timeline, modal alimentation, bilan card
- `app.js` :
  - Réorganiser footer + burger
  - `renderAlimentation()`, `openAddMealModal()`, `showFoodPhoto()`
  - Helpers IA : `estimateMealMacros(text)`, `estimateSessionBurn(session)`, `eveningAdvice(entries)`
  - Hook dans `finishSession` pour insertion auto session_burn

## Critères d'acceptation

- Footer home : 3 boutons exactement (Données corporelles, Programmes, Alimentation).
- Burger : 5 items (Profil, Clé API, Historique, Stats, Déconnexion). Pas de "Connecter la montre".
- Alimentation sans clé API → message d'invite, pas d'autres widgets.
- Saisie d'un repas avec texte → kcal/macros estimés et sauvegardés.
- Photo optionnelle uploadée et accessible via signed URL.
- Fin d'une séance → entrée `session_burn` créée auto avec kcal estimées.
- Timeline du jour : tri par heure, badges visuels apport/dépense.
- Bilan net affiché en haut.
- Bouton conseil du soir → modal avec phrase IA bienveillante.
- Suppression d'une entrée : confirm + delete (avec photo si existante).
