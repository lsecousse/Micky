-- Coach lit les session_exercises de SES clients (via profiles.coach_id).
-- Sans cette policy, RLS bloque la lecture côté backoffice et les exos
-- apparaissent vides dans la vue coach.

create policy "Coach lit les session_exercises de ses clients"
  on public.session_exercises for select
  using (exists (
    select 1
    from public.sessions s
    join public.profiles p on p.id = s.client_id
    where s.id = session_exercises.session_id
      and p.coach_id = auth.uid()
  ));
