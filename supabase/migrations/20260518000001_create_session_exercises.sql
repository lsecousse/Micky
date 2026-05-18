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
