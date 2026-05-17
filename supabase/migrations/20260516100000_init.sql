create extension if not exists "pgcrypto";

create table if not exists public.cr_cards (
  id bigint primary key,
  card_key text not null unique,
  name text not null,
  max_level int,
  elixir_cost int,
  rarity text,
  icon_medium_url text,
  icon_evolution_medium_url text,
  raw_payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_meta_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'internal',
  deck_name text not null,
  archetype text,
  win_rate numeric(5,2) not null,
  use_rate numeric(5,2) not null,
  avg_elixir numeric(4,2) not null,
  min_trophies int not null,
  max_trophies int not null,
  cards text[] not null,
  generated_at timestamptz not null default now(),
  constraint trophy_range_check check (min_trophies <= max_trophies)
);

create index if not exists deck_meta_trophy_idx
  on public.deck_meta_snapshots (min_trophies, max_trophies);

alter table public.cr_cards enable row level security;
alter table public.deck_meta_snapshots enable row level security;

drop policy if exists "Public read cards" on public.cr_cards;
create policy "Public read cards"
  on public.cr_cards for select
  using (true);

drop policy if exists "Public read deck snapshots" on public.deck_meta_snapshots;
create policy "Public read deck snapshots"
  on public.deck_meta_snapshots for select
  using (true);
