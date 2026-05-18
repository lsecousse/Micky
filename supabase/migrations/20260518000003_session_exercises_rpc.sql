-- RPC 1 : upsert atomique d'une session + ses exercises.
-- Le client appelle cette fonction au lieu de faire 2 INSERT séparés.

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

-- RPC 2 : pour chaque nom normalisé, retourne la dernière exécution
-- toutes séances confondues (exclut les séances en cours via duration > 0)

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
