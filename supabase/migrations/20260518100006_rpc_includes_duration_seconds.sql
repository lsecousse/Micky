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
