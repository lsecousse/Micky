# Refonte de l'éditeur de programme (backoffice) — Design

**Date:** 2026-05-18
**Statut:** Validé, prêt pour plan d'implémentation
**Auteur:** brainstorming session entre Lionel et Claude

---

## Goal

Refondre l'écran de création/édition de programme dans le backoffice coach
pour passer d'un formulaire séquentiel (saisie nom d'exo + nb séries) à un
**éditeur split-view avec drag & drop** depuis un catalogue d'exercices
gérés par le coach.

Objectifs concrets :
- Réduire la friction de création (drag depuis catalogue au lieu de re-saisir)
- Éliminer les fautes de frappe et doublons (catalogue centralisé)
- Préremplir automatiquement les valeurs d'un exo à partir de la dernière
  exécution du client cible
- Afficher une durée estimée de la séance (formule + moyenne historique)
- Préparer la donnée pour la Phase 2 (per-exo duration tracking)

## Hors scope

- Migration des `activities` en table relationnelle (Phase 2 reportée par
  l'utilisateur lors du brainstorming Phase 1).
- Catalogue partagé multi-coachs (scope = par coach).
- CRUD catalogue dans une page séparée (tout inline dans la sidebar).
- Capacité d'ajouter un exo qui n'est pas dans le catalogue (catalogue strict).
- Refonte du backoffice côté client (autres écrans).

---

## Architecture

### Modèle de données

#### Nouvelle table `exercise_catalog`

```sql
create table public.exercise_catalog (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references public.profiles(id) on delete cascade,
  name               text not null,
  normalized_name    text not null,
  category           text not null check (category in ('fonte', 'cardio')),
  muscle_groups      text[] not null default '{}',
  default_activities jsonb not null default '[{"type":"weight"}]'::jsonb,
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (coach_id, normalized_name)
);

create index idx_exercise_catalog_coach_category
  on public.exercise_catalog (coach_id, category);
```

**RLS** : SELECT/INSERT/UPDATE/DELETE autorisé pour `coach_id = auth.uid()`.
Pas de partage multi-coach.

#### Évolution de `programmes`

```sql
alter table public.programmes
  add column estimated_duration_seconds integer;
```

Valeur saisie manuellement par le coach pour override la durée calculée.
Si NULL, l'UI calcule à la volée à partir de la formule (cf. Section Estimé durée).

#### Évolution de `session_exercises`

```sql
alter table public.session_exercises
  add column duration_seconds integer;
```

Capturée à partir des nouvelles séances : la PWA enregistre la durée
réelle de chaque exo (timestamp de premier tap → timestamp de transition
vers l'exo suivant). Anciennes lignes restent `NULL` → fallback formule
dans le calcul de la moyenne historique.

#### Nouvelles RPC PostgreSQL

```sql
-- 1) Variante de load_last_exercises_by_names scopée à un client donné
--    (la version existante utilise auth.uid() = coach courant).
create or replace function public.load_last_exercises_for_client(
  p_client_id uuid,
  p_names     text[]
) returns table (
  normalized_name   text,
  name              text,
  category          text,
  activities        jsonb,
  execution         jsonb,
  source_session_id text,
  source_date       text
) language sql security invoker as $$
  -- Vérifie que le coach courant a accès à ce client via profiles.coach_id
  -- (RLS sur profiles applique le filtre)
  with ranked as (
    select se.normalized_name, se.name, se.category, se.activities,
           se.execution, s.id as source_session_id, s.date as source_date,
           row_number() over (
             partition by se.normalized_name
             order by coalesce(s.started_at, s.date) desc
           ) as rn
    from public.session_exercises se
    join public.sessions s on s.id = se.session_id
    where s.client_id = p_client_id
      and exists (
        select 1 from public.profiles p
        where p.id = p_client_id and p.coach_id = auth.uid()
      )
      and se.normalized_name = any(p_names)
      and coalesce(s.duration, 0) > 0
  )
  select normalized_name, name, category, activities, execution,
         source_session_id, source_date
  from ranked where rn = 1;
$$;

-- 2) Moyenne durée par exo pour un client donné (Map<normalized_name, avg_seconds>)
create or replace function public.load_avg_exercise_durations(
  p_client_id uuid,
  p_names     text[]
) returns table (
  normalized_name text,
  avg_seconds     numeric
) language sql security invoker as $$
  select se.normalized_name,
         avg(se.duration_seconds)::numeric as avg_seconds
  from public.session_exercises se
  join public.sessions s on s.id = se.session_id
  where s.client_id = p_client_id
    and exists (
      select 1 from public.profiles p
      where p.id = p_client_id and p.coach_id = auth.uid()
    )
    and se.normalized_name = any(p_names)
    and se.duration_seconds is not null
  group by se.normalized_name;
$$;
```

#### Seed initial du catalogue

Migration one-shot qui peuple `exercise_catalog` à partir des
`session_exercises` existants, groupés par coach :

```sql
insert into public.exercise_catalog (coach_id, name, normalized_name, category)
select distinct on (p.coach_id, se.normalized_name)
  p.coach_id,
  se.name,
  se.normalized_name,
  se.category
from public.session_exercises se
join public.sessions s on s.id = se.session_id
join public.profiles p on p.id = s.client_id
where p.coach_id is not null
  and se.normalized_name != ''
on conflict (coach_id, normalized_name) do nothing;
```

`muscle_groups`, `notes`, `default_activities` restent vides au seed ;
le coach les complète au fur et à mesure (ou via un script de seed manuel
plus tard).

---

### Couches JS

| Fichier | Rôle |
|---|---|
| `lib/duration-estimate.js` (nouveau) | Pure : `computeEstimatedDuration(programme, avgMap)` |
| `lib/programme-from-catalog.js` (nouveau) | Pure : `buildProgrammeExerciseFromCatalog(catalogEntry, clientPrev)` (merge catalog → exo + prefill prev) |
| `supabase.js` (modify) | + `loadExerciseCatalogDB()`, `upsertExerciseCatalogDB(entry)`, `deleteExerciseCatalogDB(id)`, `loadLastExercisesForClientDB(clientId, names)`, `loadAvgExerciseDurationsDB(clientId, names)` |
| `backoffice.js` (modify) | Réécriture de la section éditeur de programme : nouveau composant split-view + sidebar catalogue + drag-and-drop via SortableJS |
| `backoffice.html` (modify) | Ajout du CDN SortableJS + chargement des 2 nouveaux helpers JS avant `backoffice.js` |
| Migrations SQL | 5 fichiers : create_exercise_catalog, alter_programmes_duration, alter_session_exercises_duration, seed_exercise_catalog, new_rpcs |

---

### Drag & drop : SortableJS

Bibliothèque vanilla JS chargée via CDN (≈ 13 KB gzip). Choisie pour :
- Pas de bundler nécessaire (cohérent avec le reste du projet)
- Support tactile + souris (utile si on étend l'UI à tablette plus tard)
- API simple (`new Sortable(el, { group, animation, onAdd, onUpdate })`)

Configurations :
- Sidebar : `group: { name: 'exos', pull: 'clone', put: false }` (clone seulement, on n'enlève pas du catalogue)
- Programme zone : `group: { name: 'exos', pull: false, put: true }` (accepte les drops + permet réorganisation interne)

L'utilisateur valide aussi des **boutons ↑↓** sur chaque carte du programme pour fallback clavier / accessibilité.

---

## UX layout

```
┌─ Backoffice : éditeur de programme ──────────────────────────────────┐
│ ← Retour     Programme [_______]                                     │
│              Estimé : 47 min  [✎ modifier]              [Enregistrer]│
│                                                                      │
│ ┌─ CATALOGUE (35%) ──────────┐ ┌─ PROGRAMME (65%) ─────────────────┐│
│ │ + Nouvel exo               │ │ ≡ 01. Développé couché       ✎ 🗑││
│ │ [Recherche…           ]    │ │    4 × 12 — 80 kg · repos 90s    ││
│ │ [Pec][Dos][Jambes][Bras]   │ │    ↑↓                            ││
│ │ (chips muscle multi-sel)   │ │                                  ││
│ │                            │ │ ≡ 02. Écarté poulie          ✎ 🗑││
│ │ ≡ Développé couché      ✎  │ │    3 × 12 — 25 kg · repos 60s    ││
│ │ ≡ Écarté poulie         ✎  │ │    ↑↓                            ││
│ │ ≡ Pec fly               ✎  │ │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ││
│ │ ≡ Tirage horizontal     ✎  │ │   ↓ Glisse un exo du catalogue   ││
│ │ ≡ …                        │ │                                  ││
│ └────────────────────────────┘ └──────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### Interactions clés

| Action | Effet |
|---|---|
| Search texte sidebar | Filtre live (normalisé via `normalizeExerciseName`) |
| Click chip muscle | Ajoute/enlève du filtre (multi-select, intersection avec search) |
| Filtre catégorie | Auto : sidebar affiche uniquement `category = programme.category` |
| Drag item sidebar → zone programme | **Ouvre modale d'édition** pré-remplie |
| Drag carte programme | Réorganise (animation Sortable) |
| Click `↑↓` sur carte programme | Déplace d'une position |
| Click `✎` sidebar | Ouvre form catalog inline (édit) |
| Click `✎` programme | Ré-ouvre modale d'édition |
| Click `🗑` programme | Confirmation puis retire l'exo (pas de delete au catalogue) |
| Click `+ Nouvel exo` sidebar | Form inline catalog (création) en haut de la sidebar |
| Modifier l'estimé header | Champ nombre cliquable : saisie en min → stocké en sec dans `programmes.estimated_duration_seconds` |

### Modale d'édition d'exo (post-drop)

Champs :
- **Nom** : pré-rempli depuis catalog, modifiable (devient le snapshot dans `programmes.exercises[].name`)
- **Activités** : selon `catalog.default_activities` (ex. 1 weight). Le coach peut ajouter des activités (Mike-Coach permet déjà weight + countdown + stopwatch).
- **Nombre de séries** : default `4` (constante UI), modifiable
- **Pour chaque série × activité** :
  - Reps / poids / durée selon le type d'activité
  - Pré-remplis depuis `load_last_exercises_for_client(client_id, [normalized_name])` si l'historique existe
  - Sinon laissés à 0 (le coach les renseigne ou les laisse pour que le client mette ses propres valeurs en live)
- **Repos** par activité (sec)
- **Notes** : pré-rempli depuis `catalog.notes`, modifiable per-programme

Boutons : `Annuler` / `Ajouter au programme` (ou `Enregistrer` si édition).

---

## Estimé de durée

### Formule

Pour chaque exo du programme :

```
exo_duration =
  somme sur séries (
    somme sur activités (
      per_activity_time + (rest ?? 0)
    )
  )

per_activity_time :
  - countdown : act.duration  (toujours connu)
  - weight / stopwatch :
      - si avgMap[normalized_name] définie : avgMap[normalized_name] / nb_series
      - sinon : 45 secondes (constante)
```

`programme_estimate = somme des exo_duration`

### Source de la moyenne

`load_avg_exercise_durations(client_id, normalized_names)` retourne
`avg(session_exercises.duration_seconds)` quand la donnée existe.
Aucune donnée historique pour l'instant (colonne nouvelle) → fallback
sur les 45 secondes pour tout le monde au démarrage.

### Override manuel

Si `programmes.estimated_duration_seconds IS NOT NULL`, l'UI affiche
cette valeur au lieu du calcul. Le bouton `✎ modifier` ouvre un input ;
laisser vide pour revenir au calcul automatique.

---

## Data flow

### Création d'un exo dans le programme (drag + drop)

```
1. Sidebar render : SortableJS sur chaque <li> avec group=exos, pull=clone
2. Coach drag "Curl barre" → drop dans zone programme
3. SortableJS onAdd handler intercepte → cancel default + appelle openExoModal(catalogEntry, currentProgramme.client_id)
4. openExoModal :
   - call loadLastExercisesForClientDB(clientId, [normalized_name])
   - merge catalog defaults + clientPrev via buildProgrammeExerciseFromCatalog()
   - render modale pré-remplie
5. Coach valide → l'exo est inséré dans programme.exercises à la position du drop
6. recompute estimate, update header
7. Pas de write DB tant que coach n'a pas cliqué Enregistrer le programme
```

### Save du programme

Le payload `programmes.exercises` reste un `jsonb` array (pas changé en
Phase 2). Le snapshot de l'exo embarque : `name`, `activities`, `sets`,
`comment` — comme aujourd'hui. La référence au catalogue est implicite
via le nom normalisé (pas de FK dure).

---

## Error handling

| Cas | Comportement |
|---|---|
| RPC `load_last_exercises_for_client` échoue | Modale ouvre quand même avec defaults catalog, sans prev — toast discret |
| `loadExerciseCatalogDB` échoue | Sidebar affiche message d'erreur + bouton "Réessayer" |
| Sauvegarde catalog échoue | Modale reste ouverte, toast + bouton Réessayer |
| Sauvegarde programme échoue | Modale reste ouverte, formulaire intact |
| Catalog vide (nouveau coach) | Sidebar affiche call-to-action "+ Ajoute ton premier exo" |
| `default_activities` mal formé | Fallback `[{type:'weight'}]` côté JS |
| Coach essaie d'éditer un exo d'un autre coach | Bloqué par RLS, erreur 403 → toast |

---

## Testing strategy

### Vitest (pure helpers)

- `lib/duration-estimate.js` : `computeEstimatedDuration(programme, avgMap)`
  - Avec moyennes vides → fallback 45s × série + rest
  - Avec moyennes partielles → mix moyenne / fallback
  - Programme vide → 0
  - Countdown → utilise `act.duration` toujours
  - Override `programmes.estimated_duration_seconds` → bypass formule
- `lib/programme-from-catalog.js` : `buildProgrammeExerciseFromCatalog(catalogEntry, clientPrev)`
  - Catalog seul (pas de prev) → 4 séries blank
  - Catalog + prev → 4 séries pré-remplies avec valeurs prev (réutilise logique `prefillSeriesFromPrev`)
  - Catalog avec `default_activities` multi → produit séries multi-activités correctement

### Smoke manuel (UI)

- Drag depuis sidebar → modale s'ouvre avec valeurs pré-remplies
- Réordonner par drag dans le programme : ordre persisté au save
- Boutons ↑↓ : ordre persisté
- Suppression : confirmation + retire de la liste, recalcul estimé
- Édition catalog inline : nouveau nom apparaît dans la sidebar immédiatement
- Search + chips : intersection fonctionne
- Programme nouveau client (zéro session) : pas de prev, valeurs blank
- Programme client expérimenté : prev injectées
- Override estimé manuel : badge affiche la valeur saisie, "x" vide pour revenir auto
- Cardio programme : sidebar n'affiche que les exos cardio

---

## Migrations (ordre d'application)

1. `create_exercise_catalog` (table + index + RLS)
2. `alter_programmes_estimated_duration` (colonne nullable)
3. `alter_session_exercises_duration` (colonne nullable)
4. `seed_exercise_catalog_from_history` (one-shot)
5. `client_scoped_rpcs` (`load_last_exercises_for_client`, `load_avg_exercise_durations`)

---

## Décisions clés validées en brainstorming

| Sujet | Choix | Alternative écartée |
|---|---|---|
| Source liste exos | Nouvelle table catalogue | Dériver des sessions existantes |
| Alimentation catalogue | Seed initial + manuel | Auto-ajout transparent (risque pollution) |
| Champs exo catalogue | name + category + muscle_groups + default_activities + notes | Minimum (name + category) |
| Layout | Split view (sidebar + programme) | Command palette popup |
| Scope catalogue | Par coach | Global partagé |
| Comportement post-drop | Modale d'édition immédiate | Inline expandable / silent template |
| Réordonner programme | Drag + boutons ↑↓ | Drag seulement |
| Exo hors catalogue | Interdit (catalogue strict) | Free-text autorisé |
| CRUD catalogue | Inline sidebar | Page séparée |
| Filtre sidebar | Chips muscle multi-select + search + auto-filter catégorie programme | Tabs catégorie |
| Estimé durée | Modifiable, fallback formule | Read-only sans override |
| Source moyenne durée | Per-exo historique (`session_exercises.duration_seconds`) | Per-programme `sessions.duration` |
| Constante fallback per-série | 45 secondes (+ rest) | 30 secondes |
| Drag & drop lib | SortableJS (CDN) | Native HTML5 / custom |
