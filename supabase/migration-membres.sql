-- Tableau K-pop — ajout des photos des membres (octobre 2026)
-- À coller dans Supabase > SQL Editor > New query, puis « Run ».
-- Sans danger : n'efface rien, et peut être relancé plusieurs fois.
alter table public.artists add column if not exists members jsonb not null default '[]'::jsonb;
