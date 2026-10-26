-- Tableau K-pop — schéma Supabase
-- À coller tel quel dans Supabase > SQL Editor > New query, puis « Run ».
-- Chaque ligne appartient à un utilisateur (user_id) et la sécurité RLS
-- garantit que seul ce compte peut lire ou modifier ses données.

create table if not exists public.categories (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.artists (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id      uuid references public.categories(id) on delete set null,
  spotify_id       text not null,
  name             text not null,
  image            text,
  excluded         boolean not null default false,
  playlist_id      text,
  album_ids        jsonb not null default '[]'::jsonb,
  last_fetched_at  timestamptz,
  note             text,
  position         integer not null default 0,
  members          jsonb not null default '[]'::jsonb,   -- photos des membres [{src, name}]
  created_at       timestamptz not null default now()
);

create table if not exists public.tracks (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  artist_id     uuid not null references public.artists(id) on delete cascade,
  id            text not null,             -- identifiant Spotify de la chanson
  name          text not null,
  album_id      text,
  album_name    text,
  album_type    text,
  album_image   text,
  release_date  text,
  duration_ms   integer,
  disc_number   integer,
  track_number  integer,
  rating        smallint not null default 0 check (rating between 0 and 5),
  rank          integer,
  favorite      boolean not null default false,
  hidden        boolean not null default false,
  note          text,
  created_at    timestamptz not null default now(),
  primary key (user_id, artist_id, id)
);

create table if not exists public.settings (
  user_id  uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data     jsonb not null default '{}'::jsonb
);

-- Pour une base créée avec une version précédente :
alter table public.artists add column if not exists members jsonb not null default '[]'::jsonb;

create index if not exists artists_user_idx on public.artists(user_id);
create index if not exists tracks_artist_idx on public.tracks(artist_id);

alter table public.categories enable row level security;
alter table public.artists    enable row level security;
alter table public.tracks     enable row level security;
alter table public.settings   enable row level security;

drop policy if exists "proprietaire" on public.categories;
drop policy if exists "proprietaire" on public.artists;
drop policy if exists "proprietaire" on public.tracks;
drop policy if exists "proprietaire" on public.settings;

create policy "proprietaire" on public.categories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "proprietaire" on public.artists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "proprietaire" on public.tracks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "proprietaire" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.categories, public.artists, public.tracks, public.settings to authenticated;
