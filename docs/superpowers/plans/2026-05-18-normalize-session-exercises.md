# Phase 1 — Normaliser le stockage des exercices de séance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Casser le `sessions.exercises jsonb` actuel en une vraie table relationnelle `session_exercises`, indexée sur `normalized_name`, pour que le lookup "dernier exercice exécuté par nom" soit une query SQL native — robuste si on déplace ou splitte une séance.

**Architecture:**
- Nouvelle table `public.session_exercises` (ordre, name, normalized_name, category, comment, activities jsonb, execution jsonb).
- Toutes les écritures de session passent par une RPC PostgreSQL atomique (`upsert_session_with_exercises`) qui upsert la session + delete-insert les exercises.
- Toutes les lectures recomposent l'objet `session` attendu par l'UI à partir des 2 tables.
- Lookup historique via RPC `load_last_exercises_by_names(text[])` qui retourne pour chaque nom la dernière exécution toutes séances confondues.
- Après backfill validé, la colonne `sessions.exercises jsonb` est supprimée.

**Tech Stack:** Supabase (PostgreSQL 15+), JS vanilla (no bundler), Vitest (ajouté Task 0 pour TDD des helpers purs).

**Hors scope (Phase 2 séparée):**
- Extraction des `activities` en table dédiée.
- Catalogue référentiel d'exercices (`exercise_catalog`).
- Refonte UI de l'historique.

---

## File Structure

| Path | Type | Responsabilité |
|---|---|---|
| `lib/exercise-name.js` | Create | Pure: `normalizeExerciseName(name)` — lowercase + strip accents + trim + collapse spaces. Chargé par `<script>` dans `index.html` et `backoffice.html`. |
| `lib/recompose-session.js` | Create | Pure: `recomposeSession(sessionRow, exerciseRows)` → objet `session` plat attendu par l'UI. |
| `tests/exercise-name.test.js` | Create | Vitest tests pour normalisation. |
| `tests/recompose-session.test.js` | Create | Vitest tests pour recomposition. |
| `package.json` | Modify | Ajouter `vitest` en devDep + script `test`. |
| `index.html` | Modify | Charger `lib/exercise-name.js` + `lib/recompose-session.js` avant `supabase.js`. |
| `backoffice.html` | Modify | Idem. |
| `supabase.js` | Modify (3 fns) | `loadSessionsDB`, `pushSession` → table relationnelle ; ajouter `loadLastExercisesByNamesDB`. |
| `backoffice.js:82` | Modify | `loadSessions(clientId)` aligné sur le même modèle. |
| `app.js:790` | Modify | `attachPrevValues` utilise `loadLastExercisesByNamesDB` au lieu de scanner toutes les sessions. |
| `supabase/migrations/<ts>_session_exercises.sql` | Create | Création table + index + RLS. |
| `supabase/migrations/<ts>_backfill_session_exercises.sql` | Create | Backfill des 60 sessions existantes. |
| `supabase/migrations/<ts>_session_exercises_rpc.sql` | Create | RPC `upsert_session_with_exercises` + `load_last_exercises_by_names`. |
| `supabase/migrations/<ts>_drop_sessions_exercises_jsonb.sql` | Create | Dernière étape : `ALTER TABLE sessions DROP COLUMN exercises`. |

---

## Stratégie TDD

Vitest pour les pures functions (normalisation, recomposition). Le code Supabase est testé manuellement via une checklist de smoke test (Task 10) parce que mocker `supabase-js` + RLS + RPC est disproportionné pour ce projet. Si une régression apparaît plus tard, on ajoute un test e2e dédié.

---

### Task 0 : Setup Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Step 1: Install vitest**

Run:
```bash
npm install -D vitest
```

- [ ] **Step 2: Update package.json scripts**

Edit `package.json` `scripts` section to replace the placeholder `test` script:

```json
"scripts": {
  "css":       "tailwindcss -i ./src/input.css -o ./dist/output.css --minify",
  "css:watch": "tailwindcss -i ./src/input.css -o ./dist/output.css --watch",
  "test":      "vitest run",
  "test:watch":"vitest"
}
```

- [ ] **Step 3: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verify it runs (no tests yet → expected "No test files found")**

Run: `npm test`
Expected: exits with "No test files found" or runs 0 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "chore(test): setup vitest for pure helpers"
```

---

### Task 1 : Pure helper `normalizeExerciseName` (TDD)

**Files:**
- Create: `tests/exercise-name.test.js`
- Create: `lib/exercise-name.js`

- [ ] **Step 1: Write the failing tests**

`tests/exercise-name.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeExerciseName } from '../lib/exercise-name.js';

describe('normalizeExerciseName', () => {
  it('lowercases', () => {
    expect(normalizeExerciseName('Développé Couché')).toBe('developpe couche');
  });

  it('strips accents', () => {
    expect(normalizeExerciseName('Élévations Latérales')).toBe('elevations laterales');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeExerciseName('  Squat  ')).toBe('squat');
  });

  it('collapses inner whitespace', () => {
    expect(normalizeExerciseName('Tirage   horizontal\tassis')).toBe('tirage horizontal assis');
  });

  it('handles apostrophes and dashes as-is', () => {
    expect(normalizeExerciseName("Curl biceps haltère")).toBe('curl biceps haltere');
    expect(normalizeExerciseName('Tirage poulie-haute')).toBe('tirage poulie-haute');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeExerciseName(null)).toBe('');
    expect(normalizeExerciseName(undefined)).toBe('');
    expect(normalizeExerciseName('')).toBe('');
  });

  it('is idempotent', () => {
    const once  = normalizeExerciseName('Développé Couché');
    const twice = normalizeExerciseName(once);
    expect(twice).toBe(once);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module ../lib/exercise-name.js`.

- [ ] **Step 3: Implement `lib/exercise-name.js`**

```js
/* ═══════════════════════════════════════════════════════
   EXERCISE NAME — normalization helper

   Source de vérité pour la clé de lookup historique
   "dernier exercice exécuté avec ce nom".
   Chargé dans index.html et backoffice.html via <script>.
═══════════════════════════════════════════════════════ */

function normalizeExerciseName(name) {
  if (name == null) return '';
  return String(name)
    .normalize('NFD')                    // décompose accents
    .replace(/[̀-ͯ]/g, '')     // supprime diacritiques (combining marks U+0300..U+036F)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');               // collapse whitespace
}

// Export ESM pour vitest + globals pour <script> dans le navigateur
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeExerciseName };
}
if (typeof window !== 'undefined') {
  window.normalizeExerciseName = normalizeExerciseName;
}
export { normalizeExerciseName };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/exercise-name.js tests/exercise-name.test.js
git commit -m "feat(exercise-name): add normalization helper for historical lookup"
```

---

### Task 2 : Pure helper `recomposeSession` (TDD)

**Files:**
- Create: `tests/recompose-session.test.js`
- Create: `lib/recompose-session.js`

**Contexte:** Quand on lit depuis Supabase, on récupère 1 ligne `sessions` + N lignes `session_exercises`. L'UI attend l'objet plat historique. Cette fonction fait la traduction.

- [ ] **Step 1: Write the failing tests**

`tests/recompose-session.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { recomposeSession } from '../lib/recompose-session.js';

describe('recomposeSession', () => {
  const baseRow = {
    id: 'sess-123',
    programme_name: 'Pectoraux',
    programme_id: 'prog-1',
    category: 'fonte',
    date: '2026-05-18',
    started_at: '2026-05-18T08:00:00Z',
    duration: 3600,
    sync: null,
    feedback_ia: null,
  };

  it('maps snake_case columns to camelCase, preserves all fields', () => {
    const result = recomposeSession(baseRow, []);
    expect(result).toEqual({
      id:            'sess-123',
      programmeName: 'Pectoraux',
      programmeId:   'prog-1',
      category:      'fonte',
      date:          '2026-05-18',
      startedAt:     '2026-05-18T08:00:00Z',
      duration:      3600,
      sync:          null,
      feedbackIa:    null,
      exercises:     [],
    });
  });

  it('sorts exercises by ordre asc and recomposes fonte exercise', () => {
    const exoRows = [
      {
        ordre: 1, name: 'Écarté', comment: '',
        activities: [{ type: 'weight' }],
        execution:  { series: [{ values: [{ reps: 12, weight: 10 }], activityStates: {} }] },
      },
      {
        ordre: 0, name: 'Développé', comment: 'lourd',
        activities: [{ type: 'weight' }],
        execution:  { series: [{ values: [{ reps: 8, weight: 80 }], activityStates: { 0: 'done' } }] },
      },
    ];
    const result = recomposeSession(baseRow, exoRows);
    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0].name).toBe('Développé');
    expect(result.exercises[0].comment).toBe('lourd');
    expect(result.exercises[0].activities).toEqual([{ type: 'weight' }]);
    expect(result.exercises[0].series).toEqual([{ values: [{ reps: 8, weight: 80 }], activityStates: { 0: 'done' } }]);
    expect(result.exercises[1].name).toBe('Écarté');
  });

  it('recomposes cardio exercise with done + state + type', () => {
    const cardioRow = { ...baseRow, category: 'cardio' };
    const exoRows = [
      {
        ordre: 0, name: 'Vélo', comment: '',
        activities: [],
        execution:  { type: 'cardio', duration: 1800, power: 100, done: { duration: 1800, power: 100, km: 12 }, state: 'done' },
      },
    ];
    const result = recomposeSession(cardioRow, exoRows);
    expect(result.exercises[0]).toMatchObject({
      name:    'Vélo',
      type:    'cardio',
      duration: 1800,
      power:    100,
      done:    { duration: 1800, power: 100, km: 12 },
      state:   'done',
    });
  });

  it('handles missing optional fields defensively', () => {
    const exoRows = [{ ordre: 0, name: 'X', comment: null, activities: null, execution: null }];
    const result = recomposeSession(baseRow, exoRows);
    expect(result.exercises[0]).toEqual({
      name: 'X', comment: '', activities: [], series: undefined, prevSeries: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module ../lib/recompose-session.js`.

- [ ] **Step 3: Implement `lib/recompose-session.js`**

```js
/* ═══════════════════════════════════════════════════════
   RECOMPOSE SESSION — rebuild flat session object
   à partir des 2 tables sessions + session_exercises.
═══════════════════════════════════════════════════════ */

function recomposeExercise(row, category) {
  const common = {
    name:       row.name,
    comment:    row.comment || '',
  };
  const exec = row.execution || {};

  if (category === 'cardio' || exec.type === 'cardio') {
    return {
      ...common,
      type:     'cardio',
      duration: exec.duration ?? 0,
      power:    exec.power    ?? 0,
      done:     exec.done     ?? null,
      state:    exec.state    ?? 'pending',
      prev:     null,
    };
  }

  return {
    ...common,
    activities: row.activities || [],
    series:     exec.series,
    prevSeries: null,
  };
}

function recomposeSession(sessionRow, exerciseRows) {
  const exercises = (exerciseRows || [])
    .slice()
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    .map(r => recomposeExercise(r, sessionRow.category));

  return {
    id:            sessionRow.id,
    programmeName: sessionRow.programme_name,
    programmeId:   sessionRow.programme_id || null,
    category:      sessionRow.category || 'fonte',
    date:          sessionRow.date,
    startedAt:     sessionRow.started_at,
    duration:      sessionRow.duration,
    sync:          sessionRow.sync || null,
    feedbackIa:    sessionRow.feedback_ia || null,
    exercises,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { recomposeSession, recomposeExercise };
}
if (typeof window !== 'undefined') {
  window.recomposeSession  = recomposeSession;
  window.recomposeExercise = recomposeExercise;
}
export { recomposeSession, recomposeExercise };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 4 new tests, 11 total.

- [ ] **Step 5: Commit**

```bash
git add lib/recompose-session.js tests/recompose-session.test.js
git commit -m "feat(session): add recomposeSession helper for relational reads"
```

---

### Task 3 : Migration SQL — créer `session_exercises`

**Files:**
- Create: `supabase/migrations/20260518000001_create_session_exercises.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Phase 1 — Normaliser les exercices de séance
-- Nouvelle table relationnelle pour requêter "dernier exo par nom" en SQL natif

create table public.session_exercises (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null references public.sessions(id) on delete cascade,
  ordre           int  not null,
  name            text not null,
  normalized_name text not null,
  category        text not null check (category in ('fonte', 'cardio')),
  comment         text,
  activities      jsonb not null default '[]'::jsonb,
  execution       jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_session_exercises_session_ordre
  on public.session_exercises (session_id, ordre);

-- Index clé pour le lookup historique
create index idx_session_exercises_normalized_name
  on public.session_exercises (normalized_name);

alter table public.session_exercises enable row level security;

-- Lecture : autorisé si la session parente appartient au user
create policy "session_exercises_select_own"
  on public.session_exercises for select
  using (exists (
    select 1 from public.sessions s
    where s.id = session_exercises.session_id and s.client_id = auth.uid()
  ));

-- Écriture (insert/update/delete) : idem
create policy "session_exercises_modify_own"
  on public.session_exercises for all
  using (exists (
    select 1 from public.sessions s
    where s.id = session_exercises.session_id and s.client_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_exercises.session_id and s.client_id = auth.uid()
  ));
```

- [ ] **Step 2: Apply migration via MCP**

Use Supabase MCP: `mcp__supabase__apply_migration` with name `create_session_exercises` and the SQL above.

Expected: success, no errors.

- [ ] **Step 3: Verify table created**

Use Supabase MCP: `mcp__supabase__list_tables` with `schemas=["public"]` and `verbose=true`.

Expected: `session_exercises` appears with the 11 columns + 2 indexes + RLS enabled + 2 policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000001_create_session_exercises.sql
git commit -m "feat(db): create session_exercises table + index on normalized_name"
```

---

### Task 4 : Migration SQL — backfill des 60 sessions existantes

**Files:**
- Create: `supabase/migrations/20260518000002_backfill_session_exercises.sql`

- [ ] **Step 1: Write the backfill SQL**

```sql
-- Backfill : éclate sessions.exercises (jsonb) en lignes session_exercises
-- Normalisation du nom appliquée côté SQL pour ne pas dépendre du JS au backfill

create or replace function public._normalize_exercise_name(p text)
returns text language sql immutable as $$
  select regexp_replace(
    lower(
      unaccent(coalesce(p, ''))
    ),
    '\s+', ' ', 'g'
  )
$$;

-- unaccent dispo ? sinon CREATE EXTENSION
create extension if not exists unaccent;

insert into public.session_exercises (
  session_id, ordre, name, normalized_name, category, comment, activities, execution
)
select
  s.id,
  (e.ordinality - 1)::int                  as ordre,
  coalesce(e.value->>'name', '')           as name,
  trim(public._normalize_exercise_name(e.value->>'name')) as normalized_name,
  coalesce(s.category, 'fonte')            as category,
  e.value->>'comment'                      as comment,
  coalesce(e.value->'activities', '[]'::jsonb) as activities,
  -- execution = tout sauf {name, comment, activities, prevSeries, prev}
  (e.value
    - 'name' - 'comment' - 'activities'
    - 'prevSeries' - 'prev'
  ) as execution
from public.sessions s
cross join lateral jsonb_array_elements(coalesce(s.exercises, '[]'::jsonb)) with ordinality as e(value, ordinality)
where jsonb_typeof(s.exercises) = 'array';

-- Vérification
do $$
declare
  v_expected int;
  v_actual int;
begin
  select coalesce(sum(jsonb_array_length(coalesce(exercises, '[]'::jsonb))), 0)
  into v_expected
  from public.sessions where jsonb_typeof(exercises) = 'array';

  select count(*) into v_actual from public.session_exercises;

  if v_expected != v_actual then
    raise exception 'Backfill mismatch: expected % exercises, got %', v_expected, v_actual;
  end if;
  raise notice 'Backfill OK : % exercises migrés', v_actual;
end $$;

-- Cleanup du helper temporaire (gardons unaccent, util pour autres choses)
drop function public._normalize_exercise_name(text);
```

- [ ] **Step 2: Apply migration via MCP**

Use Supabase MCP: `mcp__supabase__apply_migration` with name `backfill_session_exercises` and the SQL above.

Expected: success, `NOTICE: Backfill OK : N exercises migrés` (N ≈ 60 × moyenne d'exos par séance).

- [ ] **Step 3: Spot check via SQL**

Use Supabase MCP: `mcp__supabase__execute_sql`:

```sql
select
  (select count(*) from public.sessions where jsonb_array_length(coalesce(exercises, '[]'::jsonb)) > 0) as sessions_with_exos,
  (select count(distinct session_id) from public.session_exercises) as session_ids_in_new_table,
  (select count(*) from public.session_exercises) as total_exo_rows,
  (select count(distinct normalized_name) from public.session_exercises) as distinct_normalized_names;
```

Expected: `sessions_with_exos == session_ids_in_new_table`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000002_backfill_session_exercises.sql
git commit -m "feat(db): backfill session_exercises from existing sessions.exercises jsonb"
```

---

### Task 5 : Migration SQL — RPC atomiques

**Files:**
- Create: `supabase/migrations/20260518000003_session_exercises_rpc.sql`

**Contexte:** Le live session push wipe-and-reinsert tous les exercices à chaque tap. Ça doit être atomique, sinon on peut se retrouver avec une session sans aucun exo si la 2e query échoue.

- [ ] **Step 1: Write the RPC SQL**

```sql
-- RPC 1 : upsert atomique d'une session + ses exercises
-- Le client appelle cette fonction au lieu de faire 2 INSERT séparés

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
  if v_user is null then
    raise exception 'unauthenticated';
  end if;

  -- Upsert session row
  insert into public.sessions (
    id, client_id, programme_name, programme_id, date, started_at, duration, category, sync
  ) values (
    v_session_id,
    v_user,
    p_session->>'programme_name',
    p_session->>'programme_id',
    p_session->>'date',
    p_session->>'started_at',
    nullif(p_session->>'duration', '')::int,
    v_category,
    p_session->'sync'
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

  -- Wipe + reinsert exercises (atomique dans la même transaction)
  delete from public.session_exercises where session_id = v_session_id;

  for v_exercise in select * from jsonb_array_elements(coalesce(p_session->'exercises', '[]'::jsonb))
  loop
    insert into public.session_exercises (
      session_id, ordre, name, normalized_name, category, comment, activities, execution
    ) values (
      v_session_id,
      v_idx,
      coalesce(v_exercise->>'name', ''),
      coalesce(v_exercise->>'normalized_name', ''),
      v_category,
      v_exercise->>'comment',
      coalesce(v_exercise->'activities', '[]'::jsonb),
      v_exercise->'execution'
    );
    v_idx := v_idx + 1;
  end loop;
end;
$$;

-- RPC 2 : pour chaque nom normalisé fourni, retourne la dernière exécution
-- toutes séances confondues du user courant (exclut les séances en cours via duration > 0)

create or replace function public.load_last_exercises_by_names(p_names text[])
returns table (
  normalized_name   text,
  name              text,
  category          text,
  activities        jsonb,
  execution         jsonb,
  source_session_id text,
  source_date       text
)
language sql
security invoker
as $$
  with ranked as (
    select
      se.normalized_name,
      se.name,
      se.category,
      se.activities,
      se.execution,
      s.id   as source_session_id,
      s.date as source_date,
      row_number() over (
        partition by se.normalized_name
        order by coalesce(s.started_at, s.date) desc
      ) as rn
    from public.session_exercises se
    join public.sessions s on s.id = se.session_id
    where s.client_id = auth.uid()
      and se.normalized_name = any(p_names)
      and coalesce(s.duration, 0) > 0
  )
  select normalized_name, name, category, activities, execution, source_session_id, source_date
  from ranked
  where rn = 1;
$$;
```

- [ ] **Step 2: Apply migration via MCP**

Use Supabase MCP: `mcp__supabase__apply_migration` with name `session_exercises_rpc`.

Expected: success.

- [ ] **Step 3: Smoke test the lookup RPC**

Use Supabase MCP: `mcp__supabase__execute_sql`:

```sql
-- Choisir un nom qui existe dans le backfill
select normalized_name, count(*) from public.session_exercises
group by normalized_name order by count(*) desc limit 5;
```

Expected: liste des noms les plus exécutés.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000003_session_exercises_rpc.sql
git commit -m "feat(db): add atomic upsert_session_with_exercises + load_last_exercises_by_names RPC"
```

---

### Task 6 : Charger les helpers dans le HTML

**Files:**
- Modify: `index.html`
- Modify: `backoffice.html`

- [ ] **Step 1: Locate the `<script>` block in index.html**

Find the line where `supabase.js` is loaded. The new scripts must be loaded *before* `supabase.js` because `supabase.js` will consume `normalizeExerciseName` and `recomposeSession`.

Search for: `<script src="supabase.js"></script>` in `index.html`.

- [ ] **Step 2: Insert the two new script tags immediately before**

```html
<script src="lib/exercise-name.js"></script>
<script src="lib/recompose-session.js"></script>
<script src="supabase.js"></script>
```

- [ ] **Step 3: Repeat for backoffice.html**

Same insertion before `<script src="supabase.js"></script>` (or whichever order the file uses — verify by reading the file).

- [ ] **Step 4: Smoke check — open index.html in browser, console**

Run in browser console:
```js
normalizeExerciseName('Développé Couché')
```
Expected: `'developpe couche'`.

- [ ] **Step 5: Commit**

```bash
git add index.html backoffice.html
git commit -m "chore(html): load exercise-name + recompose-session helpers"
```

---

### Task 7 : Refactor `pushSession` → RPC

**Files:**
- Modify: `supabase.js:106-121`

- [ ] **Step 1: Read current `pushSession` to preserve exact behaviour**

Open `supabase.js` and locate `pushSession`. Current signature: `async function pushSession(session)`.

- [ ] **Step 2: Replace `pushSession` with RPC call**

```js
/* Envoie une séance (en cours ou terminée) vers Supabase
   en passant par la RPC atomique qui met à jour sessions + session_exercises. */
async function pushSession(session) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  // Construit le payload jsonb attendu par la RPC.
  // Chaque exercice est dé-composé en (activities, execution) — execution
  // contient tout ce qui n'est pas template (séries exécutées pour fonte,
  // état + done pour cardio).
  const exercises = (session.exercises || []).map(ex => {
    const isCardio = (ex.type === 'cardio') || (session.category === 'cardio');
    const execution = isCardio
      ? {
          type:     'cardio',
          duration: ex.duration ?? 0,
          power:    ex.power    ?? 0,
          done:     ex.done     ?? null,
          state:    ex.state    ?? 'pending',
        }
      : { series: ex.series };

    return {
      name:            ex.name || '',
      normalized_name: normalizeExerciseName(ex.name || ''),
      comment:         ex.comment || '',
      activities:      ex.activities || [],
      execution,
    };
  });

  const payload = {
    id:             session.id,
    programme_name: session.programmeName,
    programme_id:   session.programmeId || null,
    date:           session.date,
    started_at:     session.startedAt,
    duration:       session.duration,
    category:       session.category || 'fonte',
    sync:           session.sync || null,
    exercises,
  };

  const { error } = await db.rpc('upsert_session_with_exercises', { p_session: payload });
  if (error) {
    console.error('pushSession RPC error:', error);
    throw error;  // propagé pour que pushSessionSafe attrape et tombe en localStorage
  }
}
```

- [ ] **Step 3: Smoke test — start a live session in the PWA**

Open the app, démarrer une séance, faire 1 série. Vérifier dans Supabase via MCP `execute_sql`:

```sql
select id, programme_name, duration from public.sessions order by created_at desc limit 1;
select session_id, ordre, name, normalized_name, execution from public.session_exercises
  where session_id = (select id from public.sessions order by created_at desc limit 1)
  order by ordre;
```

Expected: une nouvelle ligne dans `sessions`, N lignes dans `session_exercises` correspondant aux exercices du programme avec `normalized_name` rempli.

- [ ] **Step 4: Commit**

```bash
git add supabase.js
git commit -m "refactor(push-session): use atomic RPC writing sessions + session_exercises"
```

---

### Task 8 : Refactor `loadSessionsDB` → join + recompose

**Files:**
- Modify: `supabase.js:26-42`

- [ ] **Step 1: Replace `loadSessionsDB`**

```js
/* Charge les séances depuis Supabase
   Fait 2 queries (sessions + session_exercises) puis recompose côté JS. */
async function loadSessionsDB() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  const { data: sessions, error: sErr } = await db.from('sessions')
    .select('*')
    .eq('client_id', user.id)
    .order('date', { ascending: false });
  if (sErr) { console.error('loadSessionsDB sessions:', sErr); return []; }
  if (!sessions || sessions.length === 0) return [];

  const ids = sessions.map(s => s.id);
  const { data: exos, error: eErr } = await db.from('session_exercises')
    .select('*')
    .in('session_id', ids);
  if (eErr) { console.error('loadSessionsDB exos:', eErr); return []; }

  // Group exo rows by session_id
  const exosBySession = new Map();
  for (const row of (exos || [])) {
    if (!exosBySession.has(row.session_id)) exosBySession.set(row.session_id, []);
    exosBySession.get(row.session_id).push(row);
  }

  return sessions.map(s => recomposeSession(s, exosBySession.get(s.id) || []));
}
```

- [ ] **Step 2: Smoke test — open the Historique tab in the PWA**

Vérifier que toutes les séances historiques s'affichent avec le bon nombre d'exercices, la bonne durée, le bon volume. Spot-check 2-3 séances en détail.

- [ ] **Step 3: Commit**

```bash
git add supabase.js
git commit -m "refactor(load-sessions): fetch + recompose from sessions + session_exercises"
```

---

### Task 9 : Ajouter `loadLastExercisesByNamesDB` + refactor `attachPrevValues`

**Files:**
- Modify: `supabase.js` (ajout à la fin de la section sessions)
- Modify: `app.js:790-807`

- [ ] **Step 1: Add `loadLastExercisesByNamesDB` in supabase.js**

Insérer après `pushSession` :

```js
/* Pour chaque nom normalisé fourni, retourne la dernière exécution
   toutes séances confondues. Utilisé par attachPrevValues.
   Retourne un Map<normalized_name, { name, category, activities, execution }>. */
async function loadLastExercisesByNamesDB(normalizedNames) {
  if (!normalizedNames || normalizedNames.length === 0) return new Map();
  const { data, error } = await db.rpc('load_last_exercises_by_names', { p_names: normalizedNames });
  if (error) { console.error('loadLastExercisesByNamesDB:', error); return new Map(); }
  const map = new Map();
  for (const row of (data || [])) {
    map.set(row.normalized_name, row);
  }
  return map;
}
```

- [ ] **Step 2: Replace `attachPrevValues` in app.js**

```js
/* Pour chaque exercice de la séance live, attache la dernière exécution
   du même nom (toutes séances confondues). Robuste si l'exercice a été
   déplacé d'un programme à un autre. */
async function attachPrevValues(exercises, _programmeId, category, _excludeSessionId) {
  const normalizedNames = exercises
    .map(ex => normalizeExerciseName(ex.name))
    .filter(n => n.length > 0);

  if (normalizedNames.length === 0) return;

  const lastByName = await loadLastExercisesByNamesDB(normalizedNames);

  if (category === 'cardio') {
    exercises.forEach(ex => {
      const key = normalizeExerciseName(ex.name);
      ex.prev = lastByName.get(key)?.execution?.done || null;
    });
  } else {
    exercises.forEach(ex => {
      const key = normalizeExerciseName(ex.name);
      ex.prevSeries = lastByName.get(key)?.execution?.series || null;
    });
  }
}
```

Note: les 2 paramètres `_programmeId` et `_excludeSessionId` deviennent inutilisés mais restent dans la signature pour ne pas avoir à modifier les 3 call sites — `_` prefix indique qu'ils sont volontairement ignorés.

- [ ] **Step 3: Smoke test — déplacer un exo entre programmes**

1. Faire une séance avec exo "Squat" dans le programme A.
2. Créer un programme B contenant "Squat".
3. Démarrer le programme B → vérifier que l'écran affiche le `prevSeries` du Squat fait dans A.
4. Avant cette refonte, il aurait été `null`. Maintenant rempli.

- [ ] **Step 4: Commit**

```bash
git add supabase.js app.js
git commit -m "feat(prev-lookup): use normalized_name lookup across all sessions"
```

---

### Task 10 : Aligner `backoffice.js`

**Files:**
- Modify: `backoffice.js:82-89`

- [ ] **Step 1: Replace `loadSessions(clientId)` in backoffice.js**

```js
async function loadSessions(clientId) {
  const { data: sessions, error: sErr } = await db.from('sessions')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
    .limit(50);
  if (sErr) { console.error('loadSessions sessions:', sErr); return []; }
  if (!sessions || sessions.length === 0) return [];

  const ids = sessions.map(s => s.id);
  const { data: exos, error: eErr } = await db.from('session_exercises')
    .select('*')
    .in('session_id', ids);
  if (eErr) { console.error('loadSessions exos:', eErr); return []; }

  const exosBySession = new Map();
  for (const row of (exos || [])) {
    if (!exosBySession.has(row.session_id)) exosBySession.set(row.session_id, []);
    exosBySession.get(row.session_id).push(row);
  }

  return sessions.map(s => recomposeSession(s, exosBySession.get(s.id) || []));
}
```

- [ ] **Step 2: Smoke test — backoffice coach view**

Ouvrir `backoffice.html`, sélectionner un client, vérifier que la liste des séances + le détail s'affichent (le code à `backoffice.js:758-762` lit `(s.exercises || []).map(e => e.name)` — fonctionne car recomposeSession retourne bien `exercises[]`).

- [ ] **Step 3: Commit**

```bash
git add backoffice.js
git commit -m "refactor(backoffice): align loadSessions on relational read"
```

---

### Task 11 : Smoke test end-to-end

**Files:** aucun (test manuel)

Cette task fait office de validation finale avant la suppression de la colonne legacy.

- [ ] **Step 1: Live session full workflow**

1. Démarrer une nouvelle séance "Pectoraux".
2. Faire 2 séries du premier exo, valider chacune (countdown OK).
3. Quitter l'app sans terminer (back button).
4. Rouvrir l'app → la séance reprend, les 2 séries faites sont là.
5. Terminer la séance.
6. Aller dans Historique → la séance s'affiche, détail OK.

- [ ] **Step 2: Prev lookup cross-programme**

1. Créer un programme "Test A" avec exo "Curl marteau" → faire la séance avec 8×12kg.
2. Créer un programme "Test B" avec exo "Curl marteau" (même nom, normalisation identique).
3. Démarrer "Test B" → vérifier que l'écran affiche prev = 8×12kg.

- [ ] **Step 3: Prev lookup with name variation**

1. Créer un programme "Test C" avec exo "  curl  MARTEAU  " (espaces + casse différente).
2. Démarrer → vérifier que le prev pointe quand même sur la séance précédente "Curl marteau" (normalisation identique).

- [ ] **Step 4: Backoffice coach view**

1. Se connecter en coach.
2. Sélectionner un client qui a des séances.
3. Vérifier que les séances historiques sont listées + détail OK.

- [ ] **Step 5: Si tout passe, commit "validation OK"**

```bash
git commit --allow-empty -m "chore(validation): smoke tests passed for Phase 1 normalisation"
```

---

### Task 12 : Drop `sessions.exercises` jsonb

**Files:**
- Create: `supabase/migrations/20260518000004_drop_sessions_exercises_jsonb.sql`

**Prérequis:** Task 11 validée intégralement.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 1 finale — la colonne jsonb n'est plus source de vérité,
-- toutes les lectures passent par session_exercises depuis Task 8 et 10.

alter table public.sessions drop column exercises;
```

- [ ] **Step 2: Apply via MCP**

`mcp__supabase__apply_migration` name `drop_sessions_exercises_jsonb`.

- [ ] **Step 3: Vérifier qu'aucun code JS ne référence `s.exercises` issu de la base**

Run:
```bash
rtk proxy grep -n "row.exercises\|data.exercises\|\.from('sessions').*exercises" supabase.js backoffice.js app.js
```

Expected: zéro hit (les seuls hits restants doivent être sur l'objet recomposé `session.exercises`, qui est construit côté JS — pas sur une lecture directe de la colonne).

- [ ] **Step 4: Final smoke test**

Refaire le scénario Task 11 §1 (live session + historique). Tout doit fonctionner.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260518000004_drop_sessions_exercises_jsonb.sql
git commit -m "chore(db): drop sessions.exercises jsonb column — superseded by session_exercises"
```

---

## Self-Review checklist

**Spec coverage:**
- ✅ Casser le JSON → Task 3 + 12
- ✅ Table `session_exercises` → Task 3
- ✅ Normalisation du nom → Task 1 (JS) + Task 4 (SQL pour backfill)
- ✅ Pas de filtre catégorie → Task 5 (lookup ignore category)
- ✅ Backfill des 60 sessions → Task 4
- ✅ Refactor save/load → Tasks 7, 8, 10
- ✅ Refactor lookup → Task 9
- ✅ Backoffice aligné → Task 10
- ✅ Validation avant drop → Task 11
- ✅ Drop colonne legacy → Task 12

**Risques connus & mitigations:**
- Atomicité écriture live session → RPC PostgreSQL (Task 5)
- Backfill drift si écritures concurrentes pendant la migration → faire la migration quand l'app n'est pas en use (rare, projet perso)
- Performance du wipe-insert à chaque tap → 5 exos × 5 séries dans une RPC unique = négligeable pour PG
- Mismatch fonte/cardio si même nom dans 2 catégories → consommer `execution.series` ou `execution.done` selon catégorie courante (déjà géré dans Task 9)
