-- ====================================================
-- Coach Mike — RESET COMPLET DE LA BASE
-- ⚠️  Supprime TOUTES les données (sessions, programmes, profils)
--     mais ne supprime PAS les comptes auth.users
-- Coller et exécuter dans : Supabase > SQL Editor > New query
-- ====================================================

-- 1. Supprimer les données
truncate table public.body_measurements restart identity cascade;
truncate table public.sessions  restart identity cascade;
truncate table public.programmes restart identity cascade;
truncate table public.profiles   restart identity cascade;

-- 2. Supprimer les tables (pour repartir d'un schéma propre)
drop table if exists public.body_measurements cascade;
drop table if exists public.sessions   cascade;
drop table if exists public.programmes cascade;
drop table if exists public.profiles   cascade;

-- 3. Supprimer les fonctions/triggers
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.link_client_to_coach(uuid, uuid);

-- ====================================================
-- RECRÉATION DU SCHÉMA
-- ====================================================

-- 4. Table profiles
create table public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  role       text not null default 'client' check (role in ('coach', 'client')),
  email      text,
  nom        text default '',
  prenom     text default '',
  coach_id   uuid references public.profiles(id) on delete set null,
  state      text not null default 'new' check (state in ('new', 'invited', 'password_created', 'connected')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profil personnel" on public.profiles
  for all using (auth.uid() = id);

create policy "Coach lit ses clients" on public.profiles
  for select using (auth.uid() = coach_id);

create policy "Coach lie et modifie ses clients" on public.profiles
  for update
  using (coach_id = auth.uid() or coach_id is null)
  with check (coach_id = auth.uid() or auth.uid() = id);

-- 5. Table programmes
create table public.programmes (
  id         uuid default gen_random_uuid() primary key,
  coach_id   uuid references public.profiles(id) on delete cascade,
  client_id  uuid references public.profiles(id) on delete cascade,
  name       text not null,
  category   text not null default 'fonte' check (category in ('fonte', 'cardio')),
  ordre      int default 0,
  exercises  jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.programmes enable row level security;

create policy "Coach gère ses programmes" on public.programmes
  for all using (auth.uid() = coach_id);

create policy "Client lit ses programmes" on public.programmes
  for select using (auth.uid() = client_id);

-- 6. Table sessions
create table public.sessions (
  id             text primary key,
  client_id      uuid references public.profiles(id) on delete cascade,
  programme_name text,
  programme_id   text,
  date           text,
  started_at     text,
  duration       int,
  exercises      jsonb default '[]'::jsonb,
  created_at     timestamptz default now()
);

alter table public.sessions enable row level security;

create policy "Client gère ses séances" on public.sessions
  for all using (auth.uid() = client_id);

create policy "Coach lit les séances clients" on public.sessions
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = sessions.client_id and p.coach_id = auth.uid()
    )
  );

-- 7. Table body_measurements
create table public.body_measurements (
  id           uuid default gen_random_uuid() primary key,
  client_id    uuid references auth.users(id) on delete cascade,
  date         date not null,
  poids        numeric,
  masse_grasse numeric,
  eau          numeric,
  muscle       numeric,
  graisse      numeric,
  os           numeric,
  created_at   timestamptz default now()
);

alter table public.body_measurements enable row level security;

create policy "users manage own measurements" on public.body_measurements
  for all using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- 8. Trigger : créer le profil automatiquement après inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'client')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 9. Fonction RPC pour lier un client à un coach (bypass RLS)
create or replace function public.link_client_to_coach(p_client_id uuid, p_coach_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update profiles
  set coach_id = p_coach_id
  where id = p_client_id
    and (coach_id is null or coach_id = p_coach_id);
end;
$$;

-- ====================================================
-- APRÈS CE SCRIPT :
-- Recréer les profils des utilisateurs auth existants
-- (le trigger ne rejoue pas rétroactivement)
-- ====================================================
insert into public.profiles (id, email, role)
select id, email, 'client'
from auth.users
on conflict (id) do nothing;

-- Puis passer le coach en role='coach' :
-- UPDATE public.profiles SET role = 'coach' WHERE email = 'ton-email@coach.com';
