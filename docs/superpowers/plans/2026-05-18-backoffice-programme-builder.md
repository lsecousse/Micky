# Backoffice Programme Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'éditeur de programme du backoffice par un split-view drag-and-drop avec catalogue d'exercices par coach, modale d'édition pré-remplie depuis l'historique du client, et durée estimée per-programme.

**Architecture:** Nouvelle table `exercise_catalog` (par coach) + 2 colonnes additionnelles (`programmes.estimated_duration_seconds`, `session_exercises.duration_seconds`) + 2 RPC scopées client. 2 helpers JS purs testés en vitest. Refonte de `backoffice.js#renderProgrammeEditor` (split-view + SortableJS). Capture de la durée per-exo dans la PWA (alimente les moyennes futures).

**Tech Stack:** PostgreSQL (Supabase), JS vanilla, vitest, SortableJS via CDN, Direction A tokens, Tailwind CLI.

**Spec source:** `docs/superpowers/specs/2026-05-18-backoffice-programme-builder-design.md`.

---

## File Structure

| Path | Type | Responsabilité |
|---|---|---|
| `supabase/migrations/20260518100001_create_exercise_catalog.sql` | Create | Table + index + RLS |
| `supabase/migrations/20260518100002_add_estimated_duration_to_programmes.sql` | Create | Colonne nullable int |
| `supabase/migrations/20260518100003_add_duration_seconds_to_session_exercises.sql` | Create | Colonne nullable int |
| `supabase/migrations/20260518100004_seed_exercise_catalog.sql` | Create | Peuple le catalogue depuis l'existant |
| `supabase/migrations/20260518100005_client_scoped_rpcs.sql` | Create | RPC `load_last_exercises_for_client` + `load_avg_exercise_durations` |
| `lib/duration-estimate.js` | Create | `computeEstimatedDuration(programme, avgMap)` |
| `tests/duration-estimate.test.js` | Create | Vitest, 6 cas |
| `lib/programme-from-catalog.js` | Create | `buildProgrammeExerciseFromCatalog(catalogEntry, clientPrev)` |
| `tests/programme-from-catalog.test.js` | Create | Vitest, 5 cas |
| `supabase.js` | Modify | + `loadExerciseCatalogDB`, `upsertExerciseCatalogEntryDB`, `deleteExerciseCatalogEntryDB`, `loadLastExercisesForClientDB`, `loadAvgExerciseDurationsDB` |
| `backoffice.html` | Modify | Charger SortableJS CDN + 2 nouveaux scripts lib |
| `backoffice.js:328-393` | Modify | Réécriture complète de `renderProgrammeEditor` + `saveProgramme` |
| `app.js` | Modify | Capture timestamp de transition d'exo + injection `duration_seconds` dans `pushSession` payload |

---

### Task 1: SQL — Create `exercise_catalog` table

**Files:**
- Create: `supabase/migrations/20260518100001_create_exercise_catalog.sql`

- [ ] **Step 1: Write the migration SQL**

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

alter table public.exercise_catalog enable row level security;

create policy "exercise_catalog_select_own"
  on public.exercise_catalog for select
  using (coach_id = auth.uid());

create policy "exercise_catalog_modify_own"
  on public.exercise_catalog for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());
```

- [ ] **Step 2: Apply migration via MCP**

Use `mcp__supabase__apply_migration` with name `create_exercise_catalog` and the SQL above.

Expected: success.

- [ ] **Step 3: Verify via MCP**

Use `mcp__supabase__list_tables` with `schemas=["public"]`, `verbose=true`. Confirm `exercise_catalog` appears with 10 columns + RLS enabled + 2 policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518100001_create_exercise_catalog.sql
git commit -m "feat(db): create exercise_catalog table per coach with RLS"
```

---

### Task 2: SQL — Add `estimated_duration_seconds` to `programmes`

**Files:**
- Create: `supabase/migrations/20260518100002_add_estimated_duration_to_programmes.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
alter table public.programmes
  add column estimated_duration_seconds integer;
```

- [ ] **Step 2: Apply migration via MCP**

Use `mcp__supabase__apply_migration` with name `add_estimated_duration_to_programmes`.

Expected: success.

- [ ] **Step 3: Verify**

Use `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'programmes' and column_name = 'estimated_duration_seconds';
```

Expected: 1 row, `integer`, `YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518100002_add_estimated_duration_to_programmes.sql
git commit -m "feat(db): add programmes.estimated_duration_seconds nullable column"
```

---

### Task 3: SQL — Add `duration_seconds` to `session_exercises`

**Files:**
- Create: `supabase/migrations/20260518100003_add_duration_seconds_to_session_exercises.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
alter table public.session_exercises
  add column duration_seconds integer;
```

- [ ] **Step 2: Apply migration via MCP**

Use `mcp__supabase__apply_migration` with name `add_duration_seconds_to_session_exercises`.

- [ ] **Step 3: Verify**

Use `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'session_exercises' and column_name = 'duration_seconds';
```

Expected: 1 row, `integer`, `YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518100003_add_duration_seconds_to_session_exercises.sql
git commit -m "feat(db): add session_exercises.duration_seconds nullable column"
```

---

### Task 4: SQL — Seed `exercise_catalog` from existing sessions

**Files:**
- Create: `supabase/migrations/20260518100004_seed_exercise_catalog.sql`

**Context:** Pour chaque coach, peuple le catalogue avec les noms distincts d'exercices déjà exécutés par ses clients. `default_activities`, `muscle_groups`, `notes` restent vides — le coach les complète après.

- [ ] **Step 1: Write the migration SQL**

```sql
insert into public.exercise_catalog (
  coach_id, name, normalized_name, category
)
select distinct on (p.coach_id, se.normalized_name)
  p.coach_id,
  se.name,
  se.normalized_name,
  se.category
from public.session_exercises se
join public.sessions s on s.id = se.session_id
join public.profiles p on p.id = s.client_id
where p.coach_id is not null
  and se.normalized_name <> ''
order by p.coach_id, se.normalized_name, s.started_at desc nulls last
on conflict (coach_id, normalized_name) do nothing;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.exercise_catalog;
  raise notice 'Catalogue seedé : % lignes', v_count;
end $$;
```

- [ ] **Step 2: Apply migration via MCP**

Use `mcp__supabase__apply_migration` with name `seed_exercise_catalog`.

Expected: NOTICE shows ~24 lines for the single coach in DB.

- [ ] **Step 3: Spot check**

Use `mcp__supabase__execute_sql`:
```sql
select coach_id, category, count(*) as n
from public.exercise_catalog
group by coach_id, category
order by n desc;
```

Expected: une ligne par (coach_id, category), nombres cohérents avec les exos exécutés.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518100004_seed_exercise_catalog.sql
git commit -m "feat(db): seed exercise_catalog from existing session_exercises"
```

---

### Task 5: SQL — Client-scoped RPCs

**Files:**
- Create: `supabase/migrations/20260518100005_client_scoped_rpcs.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
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
  with allowed as (
    select 1 from public.profiles p
    where p.id = p_client_id and p.coach_id = auth.uid()
  ),
  ranked as (
    select se.normalized_name, se.name, se.category, se.activities,
           se.execution, s.id as source_session_id, s.date as source_date,
           row_number() over (
             partition by se.normalized_name
             order by coalesce(s.started_at, s.date) desc
           ) as rn
    from public.session_exercises se
    join public.sessions s on s.id = se.session_id
    where exists (select 1 from allowed)
      and s.client_id = p_client_id
      and se.normalized_name = any(p_names)
      and coalesce(s.duration, 0) > 0
  )
  select normalized_name, name, category, activities, execution,
         source_session_id, source_date
  from ranked where rn = 1;
$$;

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

- [ ] **Step 2: Apply migration via MCP**

Use `mcp__supabase__apply_migration` with name `client_scoped_rpcs`.

- [ ] **Step 3: Verify functions exist**

Use `mcp__supabase__execute_sql`:
```sql
select proname, pronargs from pg_proc
where proname in ('load_last_exercises_for_client', 'load_avg_exercise_durations')
order by proname;
```

Expected: 2 rows, `pronargs = 2` chacune.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518100005_client_scoped_rpcs.sql
git commit -m "feat(db): add client-scoped RPCs for prev lookup + avg duration"
```

---

### Task 6: Pure helper `computeEstimatedDuration` (TDD)

**Files:**
- Create: `tests/duration-estimate.test.js`
- Create: `lib/duration-estimate.js`

- [ ] **Step 1: Write the failing tests**

`tests/duration-estimate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { computeEstimatedDuration } from '../lib/duration-estimate.js';

describe('computeEstimatedDuration', () => {
  it('returns 0 for empty programme', () => {
    expect(computeEstimatedDuration({ exercises: [] }, new Map())).toBe(0);
  });

  it('uses 45s per series + rest for weight when no avgMap entry', () => {
    const programme = {
      exercises: [{
        name: 'Curl',
        activities: [{ type: 'weight', rest: 60 }],
        sets: 4,
      }],
    };
    // 4 séries × (45 + 60) = 420s
    expect(computeEstimatedDuration(programme, new Map())).toBe(420);
  });

  it('uses act.duration + rest for countdown (no fallback needed)', () => {
    const programme = {
      exercises: [{
        name: 'Plank',
        activities: [{ type: 'countdown', duration: 60, rest: 30 }],
        sets: 3,
      }],
    };
    // 3 séries × (60 + 30) = 270s
    expect(computeEstimatedDuration(programme, new Map())).toBe(270);
  });

  it('uses 45s per series + rest for stopwatch when no avgMap entry', () => {
    const programme = {
      exercises: [{
        name: 'Sprint',
        activities: [{ type: 'stopwatch', rest: 90 }],
        sets: 2,
      }],
    };
    expect(computeEstimatedDuration(programme, new Map())).toBe(2 * (45 + 90));
  });

  it('uses avgMap value divided across sets when historical avg exists', () => {
    const programme = {
      exercises: [{
        name: 'Squat',
        normalized_name: 'squat',
        activities: [{ type: 'weight', rest: 90 }],
        sets: 4,
      }],
    };
    // avg total for this exo = 600s (already includes rest)
    // 600 / 4 sets = 150 per set ; sum over 4 sets = 600
    const avgMap = new Map([['squat', 600]]);
    expect(computeEstimatedDuration(programme, avgMap)).toBe(600);
  });

  it('multi-exercise programme sums correctly', () => {
    const programme = {
      exercises: [
        { name: 'Squat', activities: [{ type: 'weight', rest: 60 }], sets: 3 },
        { name: 'Plank', activities: [{ type: 'countdown', duration: 30, rest: 15 }], sets: 2 },
      ],
    };
    // Squat : 3 × (45 + 60) = 315
    // Plank : 2 × (30 + 15) = 90
    // Total : 405
    expect(computeEstimatedDuration(programme, new Map())).toBe(405);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module ../lib/duration-estimate.js`.

- [ ] **Step 3: Implement `lib/duration-estimate.js`**

```js
/* ═══════════════════════════════════════════════════════
   DURATION ESTIMATE — calcule la durée totale estimée
   d'un programme à partir de ses exercices.

   Priorité 1 : moyenne historique par exo (avgMap)
   Priorité 2 : 45s par série pour weight/stopwatch + rest
   Countdown  : act.duration + rest (toujours précis)
═══════════════════════════════════════════════════════ */

const DEFAULT_SET_SECONDS = 45;

function _exerciseDuration(ex, avgMap) {
  const sets       = ex.sets || 1;
  const activities = ex.activities || [];
  const normName   = ex.normalized_name;

  if (normName && avgMap.has(normName)) {
    return Math.round(avgMap.get(normName));
  }

  let total = 0;
  for (const act of activities) {
    const rest = act.rest ?? 0;
    if (act.type === 'countdown') {
      total += sets * ((act.duration ?? 0) + rest);
    } else {
      total += sets * (DEFAULT_SET_SECONDS + rest);
    }
  }
  return total;
}

function computeEstimatedDuration(programme, avgMap) {
  const exos = (programme && programme.exercises) || [];
  let total = 0;
  for (const ex of exos) {
    total += _exerciseDuration(ex, avgMap || new Map());
  }
  return total;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeEstimatedDuration };
}
if (typeof window !== 'undefined') {
  window.computeEstimatedDuration = computeEstimatedDuration;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 6 new tests + 21 existing = 27 total.

- [ ] **Step 5: Commit**

```bash
git add lib/duration-estimate.js tests/duration-estimate.test.js
git commit -m "feat(duration-estimate): pure helper with formula fallback + avg lookup"
```

---

### Task 7: Pure helper `buildProgrammeExerciseFromCatalog` (TDD)

**Files:**
- Create: `tests/programme-from-catalog.test.js`
- Create: `lib/programme-from-catalog.js`

**Context:** Helper appelé quand le coach drag un exo du catalogue vers le programme. Il construit l'objet exercice du programme (snapshot) en partant des defaults du catalogue, en posant 4 séries par défaut, et en pré-remplissant les valeurs depuis l'exécution précédente du client si disponible.

- [ ] **Step 1: Write the failing tests**

`tests/programme-from-catalog.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildProgrammeExerciseFromCatalog } from '../lib/programme-from-catalog.js';

describe('buildProgrammeExerciseFromCatalog', () => {
  const catalogEntry = {
    name: 'Curl barre',
    normalized_name: 'curl barre',
    category: 'fonte',
    default_activities: [{ type: 'weight' }],
    notes: 'Coude collé au corps',
  };

  it('returns 4 blank series when no client prev', () => {
    const result = buildProgrammeExerciseFromCatalog(catalogEntry, null);
    expect(result.name).toBe('Curl barre');
    expect(result.normalized_name).toBe('curl barre');
    expect(result.comment).toBe('Coude collé au corps');
    expect(result.activities).toEqual([{ type: 'weight' }]);
    expect(result.sets).toBe(4);
    expect(result.series).toHaveLength(4);
    expect(result.series[0]).toEqual({
      activityStates: {},
      values: [{ reps: 0, weight: 0 }],
    });
  });

  it('fills series values from client prev execution', () => {
    const clientPrev = {
      execution: {
        series: [
          { values: [{ reps: 12, weight: 25 }] },
          { values: [{ reps: 12, weight: 25 }] },
          { values: [{ reps: 10, weight: 27.5 }] },
        ],
      },
    };
    const result = buildProgrammeExerciseFromCatalog(catalogEntry, clientPrev);
    expect(result.series).toHaveLength(4);
    expect(result.series[0].values[0]).toEqual({ reps: 12, weight: 25 });
    expect(result.series[1].values[0]).toEqual({ reps: 12, weight: 25 });
    expect(result.series[2].values[0]).toEqual({ reps: 10, weight: 27.5 });
    expect(result.series[3].values[0]).toEqual({ reps: 0, weight: 0 });
  });

  it('handles countdown default activity', () => {
    const cdCatalog = {
      ...catalogEntry,
      name: 'Plank',
      normalized_name: 'plank',
      default_activities: [{ type: 'countdown', duration: 60 }],
      notes: '',
    };
    const result = buildProgrammeExerciseFromCatalog(cdCatalog, null);
    expect(result.activities).toEqual([{ type: 'countdown', duration: 60 }]);
    expect(result.series[0].values[0]).toEqual({ duration: 60 });
  });

  it('falls back to default activities when entry has none', () => {
    const emptyCatalog = {
      name: 'X',
      normalized_name: 'x',
      category: 'fonte',
      default_activities: null,
    };
    const result = buildProgrammeExerciseFromCatalog(emptyCatalog, null);
    expect(result.activities).toEqual([{ type: 'weight' }]);
    expect(result.series[0].values[0]).toEqual({ reps: 0, weight: 0 });
  });

  it('handles multi-activity catalog default', () => {
    const multiCatalog = {
      ...catalogEntry,
      default_activities: [{ type: 'weight' }, { type: 'countdown', duration: 30 }],
    };
    const result = buildProgrammeExerciseFromCatalog(multiCatalog, null);
    expect(result.series[0].values).toEqual([
      { reps: 0, weight: 0 },
      { duration: 30 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/programme-from-catalog.js`**

```js
/* ═══════════════════════════════════════════════════════
   BUILD PROGRAMME EXERCISE — combine catalog defaults +
   prev execution du client pour produire l'exo
   embarqué dans programmes.exercises (snapshot jsonb).
═══════════════════════════════════════════════════════ */

const DEFAULT_SETS = 4;
const FALLBACK_ACTIVITIES = [{ type: 'weight' }];

function _blankValueFor(act) {
  if (act.type === 'weight') return { reps: 0, weight: 0 };
  if (act.type === 'countdown') return { duration: act.duration ?? 0 };
  if (act.type === 'stopwatch') return {};
  return {};
}

function buildProgrammeExerciseFromCatalog(catalogEntry, clientPrev) {
  const activities = (catalogEntry.default_activities && catalogEntry.default_activities.length)
    ? catalogEntry.default_activities
    : FALLBACK_ACTIVITIES;

  const prevSeries = clientPrev?.execution?.series || [];

  const series = Array.from({ length: DEFAULT_SETS }, (_, i) => {
    const prev = prevSeries[i];
    const values = activities.map((act, j) => {
      const prevVal = prev?.values?.[j];
      const blank   = _blankValueFor(act);
      if (!prevVal) return blank;
      // Pour weight : copier reps/weight depuis prev
      if (act.type === 'weight') {
        return {
          reps:   prevVal.reps   ?? blank.reps,
          weight: prevVal.weight ?? blank.weight,
        };
      }
      // Pour countdown : prev.duration si défini, sinon blank
      if (act.type === 'countdown') {
        return { duration: prevVal.duration ?? blank.duration };
      }
      return blank;
    });
    return { activityStates: {}, values };
  });

  return {
    name:            catalogEntry.name,
    normalized_name: catalogEntry.normalized_name,
    category:        catalogEntry.category,
    comment:         catalogEntry.notes || '',
    activities,
    sets:            DEFAULT_SETS,
    series,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildProgrammeExerciseFromCatalog };
}
if (typeof window !== 'undefined') {
  window.buildProgrammeExerciseFromCatalog = buildProgrammeExerciseFromCatalog;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 5 new tests + 27 existing = 32 total.

- [ ] **Step 5: Commit**

```bash
git add lib/programme-from-catalog.js tests/programme-from-catalog.test.js
git commit -m "feat(programme-from-catalog): merge catalog defaults + client prev into exo snapshot"
```

---

### Task 8: Wire SortableJS + helpers in `backoffice.html`

**Files:**
- Modify: `backoffice.html`

- [ ] **Step 1: Read current script block**

Run: `rtk proxy grep -n "supabase\.js\|exercise-editor\.js\|backoffice\.js\|lib/" backoffice.html`

The current block (post-Phase 1) should look like:
```html
<script src="lib/exercise-name.js"></script>
<script src="lib/recompose-session.js"></script>
<script src="supabase.js"></script>
<script src="exercise-editor.js"></script>
<script src="backoffice.js"></script>
```

- [ ] **Step 2: Insert new scripts (SortableJS CDN before helpers, then helpers before backoffice.js)**

Use Edit tool to replace:
```html
  <script src="lib/exercise-name.js"></script>
  <script src="lib/recompose-session.js"></script>
  <script src="supabase.js"></script>
  <script src="exercise-editor.js"></script>
  <script src="backoffice.js"></script>
```

with:
```html
  <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js"></script>
  <script src="lib/exercise-name.js"></script>
  <script src="lib/recompose-session.js"></script>
  <script src="lib/duration-estimate.js"></script>
  <script src="lib/programme-from-catalog.js"></script>
  <script src="supabase.js"></script>
  <script src="exercise-editor.js"></script>
  <script src="backoffice.js"></script>
```

- [ ] **Step 3: Smoke check in browser (open backoffice.html, Console)**

```js
typeof Sortable
typeof computeEstimatedDuration
typeof buildProgrammeExerciseFromCatalog
```

Expected: chacun retourne `'function'`.

- [ ] **Step 4: Commit**

```bash
git add backoffice.html
git commit -m "chore(backoffice-html): load SortableJS CDN + new lib helpers"
```

---

### Task 9: Add catalog CRUD + client-scoped RPC wrappers in `supabase.js`

**Files:**
- Modify: `supabase.js` (append new functions before the final closing structure / near other DB helpers)

- [ ] **Step 1: Add the 5 new functions at the end of `supabase.js` (just before the auth helpers like `getClaudeApiKeyDB` — find a stable insertion point near `loadLastExercisesByNamesDB`)**

```js
/* ── Catalogue d'exercices (par coach) ─────────────────── */

async function loadExerciseCatalogDB() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];
  const { data, error } = await db.from('exercise_catalog')
    .select('*')
    .eq('coach_id', user.id)
    .order('name');
  if (error) { console.error('loadExerciseCatalogDB:', error); return []; }
  return data || [];
}

async function upsertExerciseCatalogEntryDB(entry) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('unauthenticated');
  const payload = {
    id:                 entry.id ?? crypto.randomUUID(),
    coach_id:           user.id,
    name:               entry.name,
    normalized_name:    normalizeExerciseName(entry.name),
    category:           entry.category,
    muscle_groups:      entry.muscle_groups || [],
    default_activities: entry.default_activities || [{ type: 'weight' }],
    notes:              entry.notes || null,
    updated_at:         new Date().toISOString(),
  };
  const { data, error } = await db.from('exercise_catalog')
    .upsert(payload, { onConflict: 'coach_id,normalized_name' })
    .select()
    .single();
  if (error) { console.error('upsertExerciseCatalogEntryDB:', error); throw error; }
  return data;
}

async function deleteExerciseCatalogEntryDB(id) {
  const { error } = await db.from('exercise_catalog').delete().eq('id', id);
  if (error) { console.error('deleteExerciseCatalogEntryDB:', error); throw error; }
}

async function loadLastExercisesForClientDB(clientId, normalizedNames) {
  if (!clientId || !normalizedNames || normalizedNames.length === 0) return new Map();
  const { data, error } = await db.rpc('load_last_exercises_for_client', {
    p_client_id: clientId,
    p_names:     normalizedNames,
  });
  if (error) { console.error('loadLastExercisesForClientDB:', error); return new Map(); }
  const map = new Map();
  for (const row of (data || [])) map.set(row.normalized_name, row);
  return map;
}

async function loadAvgExerciseDurationsDB(clientId, normalizedNames) {
  if (!clientId || !normalizedNames || normalizedNames.length === 0) return new Map();
  const { data, error } = await db.rpc('load_avg_exercise_durations', {
    p_client_id: clientId,
    p_names:     normalizedNames,
  });
  if (error) { console.error('loadAvgExerciseDurationsDB:', error); return new Map(); }
  const map = new Map();
  for (const row of (data || [])) map.set(row.normalized_name, Number(row.avg_seconds));
  return map;
}
```

- [ ] **Step 2: Run tests to verify no regression**

Run: `npm test`
Expected: 32/32 pass (helpers untouched).

- [ ] **Step 3: Commit**

```bash
git add supabase.js
git commit -m "feat(supabase): add exercise_catalog CRUD + client-scoped RPC wrappers"
```

---

### Task 10: Rewrite `renderProgrammeEditor` — split-view skeleton

**Files:**
- Modify: `backoffice.js:328-393` (replace `renderProgrammeEditor` and `saveProgramme`)

**Context:** Cette task pose la structure split-view (sidebar + programme zone) sans encore brancher la sidebar (catalogue vide) ni les interactions drag. Le coach doit voir 2 colonnes vides + le header avec l'estimé à 0. Le SAVE garde la même signature.

- [ ] **Step 1: Read current implementation**

Read `backoffice.js` lines 328-393 (or wherever `renderProgrammeEditor` and `saveProgramme` are after prior changes).

- [ ] **Step 2: Replace the two functions**

Replace `renderProgrammeEditor` and `saveProgramme` with:

```js
let _progEditorState = null; // { mode, existingId, name, category, exercises, estOverride, catalog, avgMap }

async function renderProgrammeEditor(existingProg) {
  const body = document.getElementById('bo-detail-body');
  const category = existingProg?.category || 'fonte';

  _progEditorState = {
    existingId:  existingProg?.id || null,
    name:        existingProg?.name || '',
    category,
    exercises:   (existingProg?.exercises || []).map(e => ({ ...e })),
    estOverride: existingProg?.estimated_duration_seconds ?? null,
    catalog:     [],
    avgMap:      new Map(),
  };

  body.innerHTML = `
    <div class="bo-editor flex flex-col h-full">
      <header class="bo-editor-header p-4 border-b border-border flex items-center gap-4">
        <button class="btn-ghost btn-sm" id="ed-back">← Retour</button>
        <input type="text" id="ed-name" class="flex-1 bg-transparent border-b border-border focus:border-acid text-paper font-display italic text-[18px] py-2 outline-none"
               placeholder="Nom du programme" value="${_progEditorState.name}">
        <div class="text-paper text-[12px] font-sans tracking-eyebrow uppercase">
          Estimé : <span id="ed-est">—</span>
          <button id="ed-est-edit" class="btn-ghost btn-sm ml-2">✎</button>
        </div>
        <button class="btn-primary" id="ed-save">Enregistrer</button>
      </header>
      <div class="flex flex-1 overflow-hidden">
        <aside id="ed-sidebar" class="w-[35%] border-r border-border flex flex-col"></aside>
        <section id="ed-zone" class="w-[65%] flex flex-col overflow-y-auto"></section>
      </div>
      <p class="error-msg hidden p-2" id="ed-err"></p>
    </div>`;

  document.getElementById('ed-back').addEventListener('click', () => renderDetailBody());
  document.getElementById('ed-save').addEventListener('click', () => saveProgramme());
  document.getElementById('ed-name').addEventListener('input', e => { _progEditorState.name = e.target.value; });
  document.getElementById('ed-est-edit').addEventListener('click', () => promptEstOverride());

  // Chargement parallèle catalogue + moyennes durée
  const normalizedNames = _progEditorState.exercises
    .map(e => normalizeExerciseName(e.name || ''))
    .filter(n => n);

  const [catalog, avgMap] = await Promise.all([
    loadExerciseCatalogDB(),
    loadAvgExerciseDurationsDB(selClient.id, normalizedNames),
  ]);
  _progEditorState.catalog = catalog.filter(c => c.category === category);
  _progEditorState.avgMap  = avgMap;

  renderCatalogSidebar();
  renderProgrammeZone();
  refreshEstimateHeader();
}

function refreshEstimateHeader() {
  const el = document.getElementById('ed-est');
  if (!el) return;
  const override = _progEditorState.estOverride;
  const total = override != null
    ? override
    : computeEstimatedDuration(
        { exercises: _progEditorState.exercises },
        _progEditorState.avgMap
      );
  el.textContent = `${Math.round(total / 60)} min${override != null ? ' (manuel)' : ''}`;
}

function promptEstOverride() {
  const current = _progEditorState.estOverride;
  const raw = prompt('Durée estimée en minutes (laisser vide pour calcul auto) :', current != null ? Math.round(current / 60) : '');
  if (raw === null) return;
  const v = raw.trim();
  _progEditorState.estOverride = v === '' ? null : Math.max(1, parseInt(v, 10) * 60);
  refreshEstimateHeader();
}

function renderCatalogSidebar() {
  const aside = document.getElementById('ed-sidebar');
  aside.innerHTML = `<p class="text-muted text-[10px] tracking-eyebrow uppercase p-4">Catalogue (à brancher Task 11)</p>`;
}

function renderProgrammeZone() {
  const zone = document.getElementById('ed-zone');
  zone.innerHTML = `<p class="text-muted text-[10px] tracking-eyebrow uppercase p-4">Programme : ${_progEditorState.exercises.length} exo(s) (à brancher Task 12)</p>`;
}

async function saveProgramme() {
  const errEl = document.getElementById('ed-err');
  errEl.classList.add('hidden');
  const name = _progEditorState.name.trim();
  if (!name) { errEl.textContent = 'Donne un nom au programme.'; errEl.classList.remove('hidden'); return; }

  const payload = {
    name,
    exercises:                  _progEditorState.exercises,
    category:                   _progEditorState.category,
    client_id:                  selClient.id,
    coach_id:                   coachId,
    estimated_duration_seconds: _progEditorState.estOverride,
  };

  let error;
  if (_progEditorState.existingId) {
    ({ error } = await db.from('programmes').update(payload).eq('id', _progEditorState.existingId));
  } else {
    const progs = await loadProgrammes(selClient.id);
    payload.ordre = progs.length;
    ({ error } = await db.from('programmes').insert(payload));
  }
  if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
  await renderDetailBody();
}
```

- [ ] **Step 3: Smoke check in browser**

Open `backoffice.html`, log in coach, pick a client, open an existing programme. Expected:
- 2 columns visible (sidebar + zone), placeholders inside.
- Header shows "Estimé : 0 min" (or computed if existing programme has exos).
- Click "Enregistrer" still saves (with new payload shape).
- Click "← Retour" returns to detail view.

- [ ] **Step 4: Commit**

```bash
git add backoffice.js
git commit -m "refactor(backoffice-editor): split-view skeleton + estimate header + override"
```

---

### Task 11: Catalog sidebar — list, search, chips, CRUD inline

**Files:**
- Modify: `backoffice.js` (replace `renderCatalogSidebar` from Task 10)

- [ ] **Step 1: Replace `renderCatalogSidebar` and add helpers**

```js
let _sidebarFilters = { search: '', muscles: new Set() };
let _editingCatalogId = null;

const MUSCLE_OPTIONS = ['Pec', 'Dos', 'Jambes', 'Épaules', 'Bras', 'Abdos'];

function renderCatalogSidebar() {
  const aside = document.getElementById('ed-sidebar');
  aside.innerHTML = `
    <div class="p-3 border-b border-border space-y-2">
      <button id="cat-new" class="w-full py-2 border border-acid text-acid font-sans text-[10px] uppercase tracking-eyebrow active:bg-acid active:text-ink">+ Nouvel exo</button>
      <input id="cat-search" type="text" placeholder="Rechercher…"
             class="w-full bg-transparent border-b border-border focus:border-acid text-paper py-1 text-[12px] outline-none"/>
      <div id="cat-chips" class="flex flex-wrap gap-1"></div>
    </div>
    <div id="cat-list" class="flex-1 overflow-y-auto p-2 space-y-1"></div>
    <div id="cat-form" class="hidden border-t border-border p-3"></div>`;

  document.getElementById('cat-new').addEventListener('click', () => openCatalogForm(null));
  document.getElementById('cat-search').addEventListener('input', e => {
    _sidebarFilters.search = e.target.value;
    renderCatalogList();
  });
  renderMuscleChips();
  renderCatalogList();
}

function renderMuscleChips() {
  const wrap = document.getElementById('cat-chips');
  wrap.innerHTML = MUSCLE_OPTIONS.map(m => {
    const active = _sidebarFilters.muscles.has(m);
    return `<button data-m="${m}" class="px-2 py-0.5 border ${active ? 'border-acid text-acid' : 'border-border text-muted'} text-[10px] uppercase tracking-eyebrow">${m}</button>`;
  }).join('');
  wrap.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const m = b.dataset.m;
      if (_sidebarFilters.muscles.has(m)) _sidebarFilters.muscles.delete(m);
      else _sidebarFilters.muscles.add(m);
      renderMuscleChips();
      renderCatalogList();
    });
  });
}

function renderCatalogList() {
  const list = document.getElementById('cat-list');
  const term = normalizeExerciseName(_sidebarFilters.search);
  const muscles = _sidebarFilters.muscles;
  const filtered = _progEditorState.catalog.filter(c => {
    if (term && !c.normalized_name.includes(term)) return false;
    if (muscles.size > 0) {
      const has = (c.muscle_groups || []).some(m => muscles.has(m));
      if (!has) return false;
    }
    return true;
  });
  list.innerHTML = filtered.map(c => `
    <div data-id="${c.id}" class="cat-item flex items-center gap-2 p-2 border border-border hover:border-acid cursor-grab"
         draggable="true">
      <span class="text-muted">≡</span>
      <span class="flex-1 text-paper text-[12px]">${c.name}</span>
      <button class="cat-edit text-muted hover:text-acid" data-id="${c.id}">✎</button>
    </div>`).join('') || `<p class="text-muted text-[10px] uppercase tracking-eyebrow p-2">Catalogue vide.</p>`;
  list.querySelectorAll('.cat-edit').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      const id = b.dataset.id;
      const entry = _progEditorState.catalog.find(c => c.id === id);
      openCatalogForm(entry);
    });
  });
  // SortableJS wiring : Task 13.
}

function openCatalogForm(existing) {
  _editingCatalogId = existing?.id || null;
  const form = document.getElementById('cat-form');
  form.classList.remove('hidden');
  const isEdit = !!existing;
  form.innerHTML = `
    <p class="text-[9px] uppercase tracking-[0.4em] text-muted mb-2">${isEdit ? 'Modifier' : 'Nouvel'} exo</p>
    <input id="cf-name" type="text" placeholder="Nom" value="${existing?.name || ''}"
           class="w-full bg-transparent border-b border-border focus:border-acid text-paper py-1 text-[13px] outline-none mb-2"/>
    <p class="text-[9px] uppercase tracking-[0.4em] text-muted mb-1">Groupes musculaires</p>
    <div id="cf-muscles" class="flex flex-wrap gap-1 mb-2">${
      MUSCLE_OPTIONS.map(m => {
        const active = (existing?.muscle_groups || []).includes(m);
        return `<button data-m="${m}" type="button" class="px-2 py-0.5 border ${active ? 'border-acid text-acid' : 'border-border text-muted'} text-[10px] uppercase tracking-eyebrow">${m}</button>`;
      }).join('')
    }</div>
    <p class="text-[9px] uppercase tracking-[0.4em] text-muted mb-1">Type d'activité par défaut</p>
    <select id="cf-acttype" class="w-full bg-transparent border border-border text-paper py-1 px-2 text-[12px] mb-2">
      <option value="weight"    ${(existing?.default_activities?.[0]?.type === 'weight'    || !existing) ? 'selected' : ''}>Poids</option>
      <option value="countdown" ${ existing?.default_activities?.[0]?.type === 'countdown' ? 'selected' : ''}>Minuterie</option>
      <option value="stopwatch" ${ existing?.default_activities?.[0]?.type === 'stopwatch' ? 'selected' : ''}>Chrono</option>
    </select>
    <textarea id="cf-notes" placeholder="Notes (consignes…)"
              class="w-full bg-transparent border border-border focus:border-acid text-paper p-2 text-[12px] outline-none mb-2 h-16">${existing?.notes || ''}</textarea>
    <div class="flex gap-2">
      <button id="cf-save" class="btn-primary btn-sm flex-1">${isEdit ? 'Mettre à jour' : 'Créer'}</button>
      <button id="cf-cancel" class="btn-ghost btn-sm">Annuler</button>
      ${isEdit ? '<button id="cf-delete" class="btn-danger btn-sm">Suppr</button>' : ''}
    </div>`;

  // Activer/désactiver chip muscle
  form.querySelectorAll('#cf-muscles button').forEach(b => {
    b.addEventListener('click', () => {
      b.classList.toggle('border-acid');
      b.classList.toggle('text-acid');
      b.classList.toggle('border-border');
      b.classList.toggle('text-muted');
    });
  });

  document.getElementById('cf-cancel').addEventListener('click', () => {
    form.classList.add('hidden');
    _editingCatalogId = null;
  });

  document.getElementById('cf-save').addEventListener('click', async () => {
    const name = document.getElementById('cf-name').value.trim();
    if (!name) return alert('Nom obligatoire');
    const muscle_groups = Array.from(form.querySelectorAll('#cf-muscles button.border-acid')).map(b => b.dataset.m);
    const acttype = document.getElementById('cf-acttype').value;
    const default_activities = [{ type: acttype }];
    const notes = document.getElementById('cf-notes').value.trim();
    try {
      const saved = await upsertExerciseCatalogEntryDB({
        id: _editingCatalogId,
        name,
        category: _progEditorState.category,
        muscle_groups,
        default_activities,
        notes,
      });
      // Update local cache
      const idx = _progEditorState.catalog.findIndex(c => c.id === saved.id);
      if (idx >= 0) _progEditorState.catalog[idx] = saved;
      else _progEditorState.catalog.push(saved);
      _progEditorState.catalog.sort((a, b) => a.name.localeCompare(b.name));
      form.classList.add('hidden');
      _editingCatalogId = null;
      renderCatalogList();
    } catch (e) {
      alert('Erreur sauvegarde : ' + e.message);
    }
  });

  const delBtn = document.getElementById('cf-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet exo du catalogue ?')) return;
      try {
        await deleteExerciseCatalogEntryDB(_editingCatalogId);
        _progEditorState.catalog = _progEditorState.catalog.filter(c => c.id !== _editingCatalogId);
        form.classList.add('hidden');
        _editingCatalogId = null;
        renderCatalogList();
      } catch (e) {
        alert('Erreur suppression : ' + e.message);
      }
    });
  }
}
```

- [ ] **Step 2: Smoke check**

Open backoffice. Editor screen :
- Sidebar lists catalog entries filtered by programme category.
- Search filters live.
- Chips toggle filter.
- "+ Nouvel exo" opens form, save creates entry, appears in list.
- "✎" on existing entry opens form pre-filled.
- "Suppr" removes entry after confirmation.

- [ ] **Step 3: Commit**

```bash
git add backoffice.js
git commit -m "feat(backoffice-editor): catalog sidebar with search, chips, inline CRUD"
```

---

### Task 12: Programme zone — cards, reorder buttons, delete

**Files:**
- Modify: `backoffice.js` (replace `renderProgrammeZone` from Task 10)

- [ ] **Step 1: Replace `renderProgrammeZone` and add helpers**

```js
function renderProgrammeZone() {
  const zone = document.getElementById('ed-zone');
  const exos = _progEditorState.exercises;
  zone.innerHTML = `
    <div id="pz-list" class="p-4 space-y-2"></div>
    <div id="pz-drop-hint" class="m-4 p-6 border border-dashed border-acid text-acid text-[10px] uppercase tracking-eyebrow text-center">
      ↓ Glisse un exo du catalogue ici
    </div>`;
  const list = document.getElementById('pz-list');
  exos.forEach((ex, idx) => list.appendChild(makeProgrammeCard(ex, idx)));
  // SortableJS wiring : Task 13.
}

function makeProgrammeCard(ex, idx) {
  const card = document.createElement('div');
  card.className = 'pz-card flex items-center gap-3 p-3 border border-border bg-inkAlt/30';
  card.dataset.idx = idx;
  const setsLabel = `${ex.sets || (ex.series || []).length || 0} × ${(ex.activities?.[0]?.type === 'weight') ? (ex.series?.[0]?.values?.[0]?.reps || '?') : '—'}`;
  const weightLabel = ex.activities?.[0]?.type === 'weight' ? `${ex.series?.[0]?.values?.[0]?.weight || 0} kg` : '';
  card.innerHTML = `
    <span class="cursor-grab text-muted">≡</span>
    <div class="flex-1">
      <p class="text-paper text-[13px]">${String(idx + 1).padStart(2, '0')}. ${ex.name || '—'}</p>
      <p class="text-muted text-[10px] uppercase tracking-eyebrow">${setsLabel} ${weightLabel}</p>
    </div>
    <button class="pz-up btn-ghost btn-sm" title="Monter">↑</button>
    <button class="pz-down btn-ghost btn-sm" title="Descendre">↓</button>
    <button class="pz-edit btn-ghost btn-sm" title="Éditer">✎</button>
    <button class="pz-del btn-danger btn-sm" title="Supprimer">🗑</button>`;
  card.querySelector('.pz-up').addEventListener('click', () => moveExo(idx, -1));
  card.querySelector('.pz-down').addEventListener('click', () => moveExo(idx, +1));
  card.querySelector('.pz-edit').addEventListener('click', () => openExoModal(_progEditorState.exercises[idx], idx));
  card.querySelector('.pz-del').addEventListener('click', () => deleteExoFromProgramme(idx));
  return card;
}

function moveExo(idx, delta) {
  const exos = _progEditorState.exercises;
  const target = idx + delta;
  if (target < 0 || target >= exos.length) return;
  const tmp = exos[idx];
  exos[idx] = exos[target];
  exos[target] = tmp;
  renderProgrammeZone();
  refreshEstimateHeader();
}

function deleteExoFromProgramme(idx) {
  if (!confirm('Retirer cet exo du programme ?')) return;
  _progEditorState.exercises.splice(idx, 1);
  renderProgrammeZone();
  refreshEstimateHeader();
}

// Placeholder pour Task 14, sera réécrit
async function openExoModal(catalogOrExo, replaceIdx /* int | null */) {
  alert('Modale d\'édition exo : à brancher Task 14');
}
```

- [ ] **Step 2: Smoke check**

Open editor on a programme with existing exos. Cards visible avec nb séries + poids. Boutons ↑↓ déplacent. 🗑 supprime après confirmation. ✎ ouvre l'alerte placeholder.

- [ ] **Step 3: Commit**

```bash
git add backoffice.js
git commit -m "feat(backoffice-editor): programme zone with cards, reorder buttons, delete"
```

---

### Task 13: Wire SortableJS between sidebar and programme zone

**Files:**
- Modify: `backoffice.js` (extend `renderCatalogSidebar` and `renderProgrammeZone` with SortableJS init)

**Context:** Au drop d'un item sidebar dans la zone programme, on ouvre la modale d'édition (Task 14). En attendant, on insère un placeholder dans `_progEditorState.exercises` qui sera remplacé par le résultat de la modale. Reorder interne via Sortable aussi.

- [ ] **Step 1: Add SortableJS init at the end of `renderCatalogSidebar`**

Replace the closing `// SortableJS wiring : Task 13.` comment in `renderCatalogList` with actual wiring. Add at the end of `renderCatalogList`:

```js
  // SortableJS : clone-from-sidebar
  if (list._sortable) list._sortable.destroy();
  list._sortable = new Sortable(list, {
    group: { name: 'exos', pull: 'clone', put: false },
    sort: false,
    animation: 150,
  });
```

- [ ] **Step 2: Add SortableJS init at the end of `renderProgrammeZone`**

Replace the `// SortableJS wiring : Task 13.` comment with:

```js
  if (list._sortable) list._sortable.destroy();
  list._sortable = new Sortable(list, {
    group: { name: 'exos', pull: false, put: true },
    animation: 150,
    handle: '.cursor-grab',  // Drag par le ≡ uniquement
    onAdd: async (evt) => {
      const catalogId = evt.item.dataset.id;
      // L'item cloné du catalog est inséré comme HTML brut — on le retire
      evt.item.remove();
      const entry = _progEditorState.catalog.find(c => c.id === catalogId);
      if (!entry) return;
      const insertAt = evt.newIndex;
      // Insert un placeholder dans le state, ouvre la modale
      await openExoModal(entry, insertAt, /* isNew */ true);
    },
    onUpdate: (evt) => {
      // Reorder interne : swap dans le state
      const oldIdx = evt.oldIndex;
      const newIdx = evt.newIndex;
      const exos = _progEditorState.exercises;
      const [moved] = exos.splice(oldIdx, 1);
      exos.splice(newIdx, 0, moved);
      renderProgrammeZone();
      refreshEstimateHeader();
    },
  });
```

- [ ] **Step 3: Smoke check**

Drag un item de la sidebar vers la zone : l'alerte placeholder de Task 12 s'affiche, l'item ne reste pas dans la zone. Réorganiser un exo existant dans la zone par drag : ordre persisté visuellement et dans le state.

- [ ] **Step 4: Commit**

```bash
git add backoffice.js
git commit -m "feat(backoffice-editor): wire SortableJS drag clone + reorder"
```

---

### Task 14: Exo edit modal with client prev prefill

**Files:**
- Modify: `backoffice.js` (replace placeholder `openExoModal` from Task 12)

**Context:** Modale qui s'ouvre au drop OU au clic sur ✎. Pré-remplie depuis `loadLastExercisesForClientDB`. Réutilise `makeExerciseCard` de `exercise-editor.js` pour le formulaire (cohérent avec l'éditeur de l'ancienne PWA).

- [ ] **Step 1: Replace `openExoModal` with the full implementation**

```js
async function openExoModal(entryOrExo, idx, isNew = false) {
  const clientPrev = await loadLastExercisesForClientDB(
    selClient.id,
    [normalizeExerciseName(entryOrExo.name)]
  );
  const prev = clientPrev.get(normalizeExerciseName(entryOrExo.name)) || null;

  // Construire l'exo de départ
  const seed = isNew
    ? buildProgrammeExerciseFromCatalog(entryOrExo, prev)
    : entryOrExo;  // mode édition : on prend l'exo tel quel

  // Modal container
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-inkAlt p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto border border-border space-y-4">
      <header class="flex items-center justify-between">
        <h3 class="text-paper font-display italic text-[18px]">${isNew ? 'Ajouter' : 'Modifier'} : ${seed.name}</h3>
        <button id="mx-close" class="btn-ghost btn-sm">✕</button>
      </header>
      <div id="mx-card-wrap"></div>
      <div class="flex gap-2 justify-end">
        <button id="mx-cancel" class="btn-ghost">Annuler</button>
        <button id="mx-ok" class="btn-primary">${isNew ? 'Ajouter au programme' : 'Enregistrer'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Réutilise la card editor pour le formulaire fin
  const wrap = overlay.querySelector('#mx-card-wrap');
  wrap.appendChild(makeExerciseCard({
    name:       seed.name,
    sets:       seed.sets,
    activities: (seed.activities || []).map(a => ({
      type:     a.type,
      reps:     seed.series?.[0]?.values?.find(v => v.reps != null)?.reps ?? '',
      weight:   seed.series?.[0]?.values?.find(v => v.weight != null)?.weight ?? '',
      duration: a.duration ?? '',
      rest:     a.rest ?? '',
    })),
    comment:    seed.comment || '',
  }));

  const close = () => overlay.remove();
  overlay.querySelector('#mx-close').addEventListener('click', close);
  overlay.querySelector('#mx-cancel').addEventListener('click', close);

  overlay.querySelector('#mx-ok').addEventListener('click', () => {
    const card = wrap.querySelector('.exercise-card');
    const readBack = readExerciseCard(card);
    // Reconstruct exo object similaire à PWA migrate
    const exo = {
      name:            readBack.name,
      normalized_name: normalizeExerciseName(readBack.name),
      category:        _progEditorState.category,
      comment:         readBack.comment || '',
      sets:            readBack.sets,
      activities:      readBack.activities.map(a => ({
        type:     a.type,
        ...(a.type === 'weight'    ? {}                                   : {}),
        ...(a.type === 'countdown' ? { duration: parseInt(a.duration, 10) || 0 } : {}),
        rest:     parseInt(a.rest, 10) || 0,
      })),
      series:          Array.from({ length: readBack.sets }, () => ({
        activityStates: {},
        values: readBack.activities.map(a =>
          a.type === 'weight'
            ? { reps: parseInt(a.reps, 10) || 0, weight: parseFloat(a.weight) || 0 }
            : a.type === 'countdown'
              ? { duration: parseInt(a.duration, 10) || 0 }
              : {}),
      })),
    };

    if (isNew) {
      _progEditorState.exercises.splice(idx, 0, exo);
    } else {
      _progEditorState.exercises[idx] = exo;
    }
    renderProgrammeZone();
    refreshEstimateHeader();
    close();
  });
}
```

- [ ] **Step 2: Smoke check (drag from catalog)**

1. Drag "Curl barre" depuis la sidebar dans la zone.
2. Modale s'ouvre, valeurs pré-remplies depuis prev (si client a déjà fait curl barre).
3. Valider → carte apparaît dans la zone à la position du drop, estimé recalculé.
4. Cliquer ✎ sur une carte existante → modale rouvre avec les valeurs actuelles.
5. Modifier + Enregistrer → la carte est mise à jour.

- [ ] **Step 3: Commit**

```bash
git add backoffice.js
git commit -m "feat(backoffice-editor): exo edit modal with client prev prefill"
```

---

### Task 15: Capture per-exo duration_seconds in PWA live session

**Files:**
- Modify: `app.js` (around `completeFocusedActivity` and `pushSession` payload construction)

**Context:** Pour alimenter `load_avg_exercise_durations`, on enregistre la durée par exo. Implémentation simple : timestamp de premier set "done" d'un exo → timestamp de premier set "done" de l'exo suivant. La différence est `duration_seconds` du premier exo.

Approche minimale : on stocke `liveSession.exoStartedAt[exIdx]` quand le premier set d'un exo est validé. À chaque transition d'exo (`completeFocusedActivity` détecte qu'on passe à `exIdx+1`), on calcule `duration_seconds` du précédent et on le pose sur l'exo. À `finishSession`, on calcule le dernier exo aussi.

- [ ] **Step 1: Read current `completeFocusedActivity`**

```bash
rtk proxy grep -n "completeFocusedActivity\|liveFocus\|exoStartedAt" app.js | head -15
```

Identifie la fonction (autour de la ligne 1486 d'après le Phase 1 grep).

- [ ] **Step 2: Add the tracking logic**

In `liveSession` initialization (in `startSession`), add:

```js
liveSession.exoStartedAt = {};   // { [exIdx]: timestamp ms }
liveSession.exoDurations = {};   // { [exIdx]: seconds }
```

In `completeFocusedActivity` (after `set.activityStates[actIdx] = 'done'` is set), add **before** the `pushSessionSafe(...)` call:

```js
// Track exo start (first set marked done)
if (!liveSession.exoStartedAt[exIdx]) {
  liveSession.exoStartedAt[exIdx] = Date.now();
}
// Track exo end when whole exercise is done
const allDone = ex.series.every(s => ex.activities.every((_, a) => s.activityStates?.[a] === 'done'));
if (allDone && !liveSession.exoDurations[exIdx]) {
  liveSession.exoDurations[exIdx] = Math.max(1, Math.round((Date.now() - liveSession.exoStartedAt[exIdx]) / 1000));
}
```

In `finishSession`, just before building the snapshot, ensure any in-progress exo has its duration captured:

```js
liveSession.exercises.forEach((ex, exIdx) => {
  if (!liveSession.exoDurations[exIdx] && liveSession.exoStartedAt[exIdx]) {
    liveSession.exoDurations[exIdx] = Math.max(1, Math.round((Date.now() - liveSession.exoStartedAt[exIdx]) / 1000));
  }
});
```

- [ ] **Step 3: Inject `duration_seconds` in pushSession payload (supabase.js)**

In `supabase.js#pushSession`, modify the exercises mapping to include `duration_seconds` from `session.exoDurations[idx]`:

```js
const exercises = (session.exercises || []).map((ex, idx) => {
  const isCardio = (ex.type === 'cardio') || (session.category === 'cardio');
  const execution = isCardio
    ? { type: 'cardio', duration: ex.duration ?? 0, power: ex.power ?? 0, done: ex.done ?? null, state: ex.state ?? 'pending' }
    : { series: ex.series };
  return {
    name:             ex.name || '',
    normalized_name:  normalizeExerciseName(ex.name || ''),
    comment:          ex.comment || '',
    activities:       ex.activities || [],
    execution,
    duration_seconds: session.exoDurations?.[idx] ?? null,
  };
});
```

- [ ] **Step 4: Extend the RPC to handle duration_seconds**

Update the RPC `upsert_session_with_exercises` to insert the new field. Migration:

Create `supabase/migrations/20260518100006_rpc_includes_duration_seconds.sql`:

```sql
create or replace function public.upsert_session_with_exercises(p_session jsonb)
returns void
language plpgsql
security invoker
as $$
declare
  v_user uuid := auth.uid();
  v_session_id text := p_session->>'id';
  v_category   text := coalesce(p_session->>'category', 'fonte');
  v_exercise   jsonb;
  v_idx        int := 0;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;

  insert into public.sessions (id, client_id, programme_name, programme_id, date, started_at, duration, category, sync)
  values (
    v_session_id, v_user,
    p_session->>'programme_name', p_session->>'programme_id',
    p_session->>'date', p_session->>'started_at',
    nullif(p_session->>'duration', '')::int,
    v_category, p_session->'sync'
  )
  on conflict (id) do update set
    programme_name = excluded.programme_name,
    programme_id   = excluded.programme_id,
    date           = excluded.date,
    started_at     = excluded.started_at,
    duration       = excluded.duration,
    category       = excluded.category,
    sync           = excluded.sync
  where public.sessions.client_id = v_user;

  delete from public.session_exercises where session_id = v_session_id;

  for v_exercise in select * from jsonb_array_elements(coalesce(p_session->'exercises', '[]'::jsonb))
  loop
    insert into public.session_exercises (
      session_id, ordre, name, normalized_name, category, comment, activities, execution, duration_seconds
    ) values (
      v_session_id,
      v_idx,
      coalesce(v_exercise->>'name', ''),
      coalesce(v_exercise->>'normalized_name', ''),
      v_category,
      v_exercise->>'comment',
      coalesce(v_exercise->'activities', '[]'::jsonb),
      v_exercise->'execution',
      nullif(v_exercise->>'duration_seconds', '')::int
    );
    v_idx := v_idx + 1;
  end loop;
end;
$$;
```

Apply via `mcp__supabase__apply_migration` name `rpc_includes_duration_seconds`.

- [ ] **Step 5: Smoke test in PWA**

1. Démarrer une séance avec 2-3 exos.
2. Valider toutes les séries du 1er exo.
3. Passer au 2e, faire au moins 1 série.
4. Terminer la séance.
5. Vérifier via Supabase MCP : `select name, duration_seconds from session_exercises where session_id = '<last>' order by ordre` → 1er exo a une valeur > 0, 2e aussi (calculée à `finishSession`).

- [ ] **Step 6: Commit**

```bash
git add app.js supabase.js supabase/migrations/20260518100006_rpc_includes_duration_seconds.sql
git commit -m "feat(live-session): capture per-exo duration_seconds for avg estimate"
```

---

### Task 16: End-to-end smoke + cleanup

**Files:** none (manual validation)

- [ ] **Step 1: Backoffice happy path**

1. Coach login, select client.
2. Create new programme "Test split-view".
3. Sidebar shows catalog (~24 exos). Test search + chip filter.
4. Click "+ Nouvel exo" → add "Test Exo" with muscle Bras + notes "test". Saved, appears in list.
5. Edit "Test Exo" via ✎, change notes, save.
6. Drag 2 different exos from sidebar → 2 modales s'ouvrent, valeurs pré-remplies si historique.
7. Réordonner par drag + boutons ↑↓.
8. Supprimer un exo.
9. Modifier l'estimé via ✎ header, valider, vérifier badge "(manuel)".
10. Enregistrer le programme.
11. Re-ouvrir le programme : structure préservée, estimé override préservé.
12. Supprimer "Test Exo" du catalog.

- [ ] **Step 2: PWA per-exo duration capture**

1. Démarrer une séance avec 2+ exos.
2. Valider toutes les séries du 1er.
3. Passer au 2e, valider au moins 1 série.
4. Terminer.
5. Vérifier en DB : `duration_seconds` rempli sur le 1er exo.
6. Re-démarrer un programme avec ce même exo : l'estimé devrait maintenant utiliser la moyenne historique au lieu du fallback 45s.

- [ ] **Step 3: Edge cases**

- Nouveau client sans aucune session : drag → modale ouvre avec valeurs blanches (pas de prev).
- Programme cardio : sidebar n'affiche que les exos `category=cardio`.
- Catalog vide (suppr de tout) : sidebar affiche "Catalogue vide.", le coach peut quand même créer.
- Erreur RPC simulée (debug : couper réseau) : toast/alert visible, modale ne plante pas.

- [ ] **Step 4: Validation commit**

```bash
git commit --allow-empty -m "chore(validation): backoffice programme builder smoke tests passed"
```

---

## Self-review checklist

**Spec coverage:**
- ✅ Catalogue par coach → Task 1
- ✅ Champs catalog (name, category, muscle_groups, default_activities, notes) → Task 1
- ✅ Seed depuis sessions existantes → Task 4
- ✅ Layout split-view → Task 10
- ✅ Sidebar search + chips muscle + auto-filter catégorie → Task 11
- ✅ CRUD inline sidebar → Task 11
- ✅ Catalogue strict (pas de free-text) → garanti par UI Task 11 (drop = catalog uniquement)
- ✅ Modale d'édition post-drop avec prefill → Task 14
- ✅ Default 4 séries → Task 7
- ✅ Reorder drag + boutons → Tasks 12, 13
- ✅ Estimé durée modifiable → Task 10
- ✅ Per-exo duration tracking PWA → Task 15
- ✅ RPC client-scoped → Task 5
- ✅ Helpers purs TDD → Tasks 6, 7
- ✅ Validation manuelle → Task 16

**Risques connus :**
- Le drop SortableJS clone un nœud DOM raw — on doit l'enlever (`evt.item.remove()`) avant d'insérer notre carte propre via re-render. Si oubli → cards en double dans la zone.
- `makeExerciseCard` / `readExerciseCard` (exercise-editor.js) attendent un format particulier (sets, activities array avec reps/weight/duration/rest). Le mapping Task 14 doit être strict sinon l'écriture re-lecture casse des données.
- La capture `duration_seconds` Task 15 démarre quand le premier set est validé. Si le user reste 10 min à regarder l'écran avant la 1re série, ce temps n'est PAS compté. Acceptable (mesure du temps d'effort, pas du temps total).
- Pas de bouton "annuler" sur la modale CRUD catalog — utilise juste 'Annuler'. Si l'utilisateur ferme via Esc ou backdrop click, c'est non câblé. Limitation acceptable v1.
