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
