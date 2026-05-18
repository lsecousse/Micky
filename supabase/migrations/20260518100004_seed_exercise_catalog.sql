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
