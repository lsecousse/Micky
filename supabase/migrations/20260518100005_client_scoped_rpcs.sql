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
