-- ====================================================
-- Coach Mike — Schéma Supabase
-- Coller et exécuter dans : Supabase > SQL Editor > New query
--
-- Avant de lancer l'app :
--   1. Exécuter ce script complet
--   2. Dans Authentication > Settings : désactiver "Enable email confirmations"
--   3. Créer un compte coach via le backoffice, puis executer :
--      UPDATE public.profiles SET role = 'coach' WHERE email = 'lionel@secousse.net';
-- ====================================================

-- 1. Table profiles
create table if not exists public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  role       text not null default 'client' check (role in ('coach', 'client')),
  email      text,
  nom        text default '',
  prenom     text default '',
  coach_id   uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Chaque utilisateur gère son propre profil
create policy "Profil personnel" on public.profiles
  for all using (auth.uid() = id);

-- Un coach lit ses clients
create policy "Coach lit ses clients" on public.profiles
  for select using (auth.uid() = coach_id);

-- Un coach peut lier et modifier les profils non liés ou déjà liés à lui
create policy "Coach lie et modifie ses clients" on public.profiles
  for update
  using (coach_id = auth.uid() or coach_id is null)
  with check (coach_id = auth.uid() or auth.uid() = id);

-- 2. Table programmes
create table if not exists public.programmes (
  id         uuid default gen_random_uuid() primary key,
  coach_id   uuid references public.profiles(id) on delete cascade,
  client_id  uuid references public.profiles(id) on delete cascade,
  name       text not null,
  ordre      int default 0,
  exercises  jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.programmes enable row level security;

create policy "Coach gère ses programmes" on public.programmes
  for all using (auth.uid() = coach_id);

create policy "Client lit ses programmes" on public.programmes
  for select using (auth.uid() = client_id);

-- 3. Table sessions
create table if not exists public.sessions (
  id             text primary key,
  client_id      uuid references public.profiles(id) on delete cascade,
  programme_name text,
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

-- 4. Trigger : créer le profil automatiquement après inscription
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
