-- Backfill : éclate sessions.exercises (jsonb) en lignes session_exercises
-- Normalisation du nom appliquée côté SQL pour ne pas dépendre du JS au backfill.

create extension if not exists unaccent;

create or replace function public._normalize_exercise_name(p text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    lower(unaccent(coalesce(p, ''))),
    '\s+', ' ', 'g'
  ))
$$;

insert into public.session_exercises (
  session_id, ordre, name, normalized_name, category, comment, activities, execution
)
select
  s.id,
  (e.ordinality - 1)::int                              as ordre,
  coalesce(e.value->>'name', '')                       as name,
  public._normalize_exercise_name(e.value->>'name')    as normalized_name,
  coalesce(s.category, 'fonte')                        as category,
  e.value->>'comment'                                  as comment,
  coalesce(e.value->'activities', '[]'::jsonb)         as activities,
  -- execution = tout sauf {name, comment, activities, prevSeries, prev}
  (e.value - 'name' - 'comment' - 'activities' - 'prevSeries' - 'prev') as execution
from public.sessions s
cross join lateral jsonb_array_elements(coalesce(s.exercises, '[]'::jsonb)) with ordinality as e(value, ordinality)
where jsonb_typeof(s.exercises) = 'array';

-- Vérification : nombre d'exos migrés == sum(jsonb_array_length)
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

-- Cleanup du helper temporaire (on garde unaccent en base)
drop function public._normalize_exercise_name(text);
