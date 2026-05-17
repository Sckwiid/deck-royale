-- DeckRadar initial schema
-- Scope: cards, decks, players, snapshots, battles, aggregated stats, pro tracking requests, scan logs.

begin;

create extension if not exists pgcrypto;

-- ----------
-- Utilities
-- ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'Generic trigger function that updates updated_at on row update.';

create or replace function public.calculate_winrate(wins int, losses int, draws int)
returns numeric
language sql
immutable
as $$
  select
    case
      when coalesce(wins, 0) + coalesce(losses, 0) + coalesce(draws, 0) = 0 then null
      else round(
        coalesce(wins, 0)::numeric
        / (coalesce(wins, 0) + coalesce(losses, 0) + coalesce(draws, 0))::numeric
        * 100,
        2
      )
    end;
$$;

comment on function public.calculate_winrate(int, int, int)
  is 'Returns winrate in percentage (0..100) rounded to 2 decimals. Null when no games.';

create or replace function public.trophy_bucket_250(trophies int)
returns table(trophy_min int, trophy_max int)
language sql
immutable
strict
as $$
  select
    floor(trophies::numeric / 250)::int * 250 as trophy_min,
    floor(trophies::numeric / 250)::int * 250 + 250 as trophy_max;
$$;

comment on function public.trophy_bucket_250(int)
  is 'Maps trophies to 250-range buckets. Example: 12500 -> [12500,12750), 12750 -> [12750,13000).';

create extension if not exists pgcrypto with schema extensions;

create or replace function public.compute_deck_key(p_card_ids bigint[])
returns text
language sql
immutable
strict
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      convert_to(
        array_to_string(
          array(
            select x::text
            from unnest(p_card_ids) as x
            order by x
          ),
          '-'
        ),
        'UTF8'
      ),
      'sha256'::text
    ),
    'hex'
  );
$$;

comment on function public.compute_deck_key(bigint[])
  is 'Stable deck key hash derived from sorted card ids.';

-- ----------
-- Base tables
-- ----------

create table public.cards (
  id bigint primary key,
  name_en text,
  name_fr text,
  rarity text,
  max_level int,
  elixir_cost int,
  icon_url_source text,
  icon_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cards is 'Card master data cached from Clash Royale API.';

create table public.decks (
  deck_key text primary key,
  card_ids bigint[] not null,
  avg_elixir numeric,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decks_card_count_chk check (cardinality(card_ids) = 8),
  constraint decks_card_ids_no_null_chk check (array_position(card_ids, null::bigint) is null),
  constraint decks_deck_key_consistency_chk check (deck_key = public.compute_deck_key(card_ids))
);

comment on table public.decks is 'Canonical deck entities keyed by stable hash of sorted 8-card ids.';

create table public.players (
  tag text primary key,
  name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  current_trophies int,
  best_trophies int,
  arena_id bigint,
  arena_name text,
  current_deck_key text references public.decks(deck_key),
  tracking_priority text not null default 'normal',
  scan_interval_minutes int not null default 480,
  last_scan_at timestamptz,
  next_scan_at timestamptz,
  scan_error_count int not null default 0,
  is_top_player boolean not null default false,
  is_pro_requested boolean not null default false,
  constraint players_tag_format_chk check (tag ~ '^#?[0289PYLQGRJCUV]{3,15}$'),
  constraint players_tracking_priority_chk
    check (tracking_priority in ('normal', 'active', 'top', 'pro', 'paused')),
  constraint players_scan_interval_chk check (scan_interval_minutes > 0),
  constraint players_scan_error_count_chk check (scan_error_count >= 0)
);

comment on table public.players is 'Players monitored by DeckRadar with scan scheduling metadata.';

create table public.player_snapshots (
  id bigserial primary key,
  player_tag text not null references public.players(tag) on delete cascade,
  collected_at timestamptz not null default now(),
  trophies int,
  best_trophies int,
  arena_id bigint,
  arena_name text,
  current_deck_key text references public.decks(deck_key),
  wins_total int,
  losses_total int,
  battle_count_total int,
  raw jsonb
);

comment on table public.player_snapshots is 'Time-series snapshots of player profile state.';

create table public.battles (
  battle_id text primary key,
  battle_time timestamptz not null,
  mode text,
  battle_type text,
  arena_id bigint,
  arena_name text,
  player_a_tag text not null,
  player_b_tag text not null,
  player_a_deck_key text references public.decks(deck_key),
  player_b_deck_key text references public.decks(deck_key),
  player_a_start_trophies int,
  player_b_start_trophies int,
  player_a_crowns int,
  player_b_crowns int,
  player_a_result text,
  player_b_result text,
  source_player_tag text,
  collected_at timestamptz not null default now(),
  raw jsonb,
  constraint battles_player_a_result_chk
    check (player_a_result is null or player_a_result in ('win', 'loss', 'draw')),
  constraint battles_player_b_result_chk
    check (player_b_result is null or player_b_result in ('win', 'loss', 'draw'))
);

comment on table public.battles is 'Normalized battle records used as source of truth for analytics.';

create table public.deck_stats_by_trophy_range (
  id bigserial primary key,
  deck_key text not null references public.decks(deck_key) on delete cascade,
  mode text not null,
  trophy_min int not null,
  trophy_max int not null,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  games int not null default 0,
  winrate numeric generated always as (public.calculate_winrate(wins, losses, draws)) stored,
  last_updated_at timestamptz not null default now(),
  constraint deck_stats_bucket_chk check (trophy_min < trophy_max and (trophy_max - trophy_min) = 250),
  constraint deck_stats_unique unique (deck_key, mode, trophy_min, trophy_max)
);

comment on table public.deck_stats_by_trophy_range
  is 'Aggregated deck performance by game mode and 250-trophy bucket.';

create table public.player_deck_stats (
  id bigserial primary key,
  player_tag text not null references public.players(tag) on delete cascade,
  deck_key text not null references public.decks(deck_key) on delete cascade,
  mode text not null,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  games int not null default 0,
  winrate numeric,
  first_seen_trophies int,
  last_seen_trophies int,
  best_seen_trophies int,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  constraint player_deck_stats_unique unique (player_tag, deck_key, mode)
);

comment on table public.player_deck_stats is 'Aggregated per-player deck performance by mode.';

create table public.deck_changes (
  id bigserial primary key,
  player_tag text not null references public.players(tag) on delete cascade,
  old_deck_key text references public.decks(deck_key),
  new_deck_key text not null references public.decks(deck_key),
  changed_at timestamptz not null,
  trophies_when_changed int,
  mode text
);

comment on table public.deck_changes is 'History of deck switches detected for each player.';

create table public.pro_tracking_requests (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  player_tag text not null,
  email text,
  discord text,
  language text not null default 'fr',
  message text,
  status text not null default 'new',
  constraint pro_tracking_requests_language_chk check (language in ('fr', 'en')),
  constraint pro_tracking_requests_status_chk check (status in ('new', 'processing', 'done', 'rejected')),
  constraint pro_tracking_requests_player_tag_chk check (player_tag ~ '^#?[0289PYLQGRJCUV]{3,15}$')
);

comment on table public.pro_tracking_requests is 'Inbound requests from users to track top/pro players.';

create table public.scan_jobs_log (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  job_type text,
  players_scanned int not null default 0,
  new_battles int not null default 0,
  errors int not null default 0,
  raw jsonb,
  constraint scan_jobs_log_non_negative_chk
    check (players_scanned >= 0 and new_battles >= 0 and errors >= 0)
);

comment on table public.scan_jobs_log is 'Operational log for scan/recompute jobs.';

-- ----------
-- Indexes
-- ----------

create index idx_player_snapshots_player_tag_collected_at_desc
  on public.player_snapshots (player_tag, collected_at desc);

create index idx_player_snapshots_collected_at_desc
  on public.player_snapshots (collected_at desc);

create index idx_battles_battle_time_desc
  on public.battles (battle_time desc);

create index idx_battles_player_a_tag on public.battles (player_a_tag);
create index idx_battles_player_b_tag on public.battles (player_b_tag);
create index idx_battles_player_a_deck_key on public.battles (player_a_deck_key);
create index idx_battles_player_b_deck_key on public.battles (player_b_deck_key);
create index idx_battles_mode on public.battles (mode);
create index idx_battles_mode_player_a_trophies on public.battles (mode, player_a_start_trophies);
create index idx_battles_mode_player_b_trophies on public.battles (mode, player_b_start_trophies);
create index idx_battles_player_a_start_trophies on public.battles (player_a_start_trophies);
create index idx_battles_player_b_start_trophies on public.battles (player_b_start_trophies);

create index idx_deck_stats_mode_bucket
  on public.deck_stats_by_trophy_range (mode, trophy_min, trophy_max);

create index idx_deck_stats_deck_key
  on public.deck_stats_by_trophy_range (deck_key);

create index idx_player_deck_stats_player_tag on public.player_deck_stats (player_tag);
create index idx_player_deck_stats_deck_key on public.player_deck_stats (deck_key);
create index idx_player_deck_stats_mode on public.player_deck_stats (mode);

create index idx_deck_changes_player_tag_changed_at_desc
  on public.deck_changes (player_tag, changed_at desc);

create index idx_pro_tracking_requests_status_created_at
  on public.pro_tracking_requests (status, created_at desc);

create index idx_scan_jobs_log_started_at_desc
  on public.scan_jobs_log (started_at desc);

-- ----------
-- Triggers
-- ----------

create trigger trg_cards_set_updated_at
before update on public.cards
for each row
execute function public.set_updated_at();

create trigger trg_decks_set_updated_at
before update on public.decks
for each row
execute function public.set_updated_at();

-- ----------
-- Aggregation refresh functions
-- ----------

create or replace function public.refresh_deck_stats_by_trophy_range()
returns void
language plpgsql
as $$
begin
  truncate table public.deck_stats_by_trophy_range;

  insert into public.deck_stats_by_trophy_range (
    deck_key,
    mode,
    trophy_min,
    trophy_max,
    wins,
    losses,
    draws,
    games,
    last_updated_at
  )
  with observations as (
    select
      b.player_a_deck_key as deck_key,
      coalesce(b.mode, 'unknown') as mode,
      b.player_a_start_trophies as trophies,
      b.player_a_result as result
    from public.battles b
    where b.player_a_deck_key is not null

    union all

    select
      b.player_b_deck_key as deck_key,
      coalesce(b.mode, 'unknown') as mode,
      b.player_b_start_trophies as trophies,
      b.player_b_result as result
    from public.battles b
    where b.player_b_deck_key is not null
  ), bucketed as (
    select
      o.deck_key,
      o.mode,
      tb.trophy_min,
      tb.trophy_max,
      o.result
    from observations o
    cross join lateral public.trophy_bucket_250(o.trophies) tb
    where o.trophies is not null
      and o.result in ('win', 'loss', 'draw')
  )
  select
    deck_key,
    mode,
    trophy_min,
    trophy_max,
    sum(case when result = 'win' then 1 else 0 end) as wins,
    sum(case when result = 'loss' then 1 else 0 end) as losses,
    sum(case when result = 'draw' then 1 else 0 end) as draws,
    count(*) as games,
    now() as last_updated_at
  from bucketed
  group by deck_key, mode, trophy_min, trophy_max;
end;
$$;

comment on function public.refresh_deck_stats_by_trophy_range()
  is 'Recomputes deck stats by mode and 250 trophy buckets from battles (2 observations per battle).';

create or replace function public.refresh_player_deck_stats()
returns void
language plpgsql
as $$
begin
  truncate table public.player_deck_stats;

  insert into public.player_deck_stats (
    player_tag,
    deck_key,
    mode,
    wins,
    losses,
    draws,
    games,
    winrate,
    first_seen_trophies,
    last_seen_trophies,
    best_seen_trophies,
    first_seen_at,
    last_seen_at
  )
  with observations as (
    select
      b.player_a_tag as player_tag,
      b.player_a_deck_key as deck_key,
      coalesce(b.mode, 'unknown') as mode,
      b.player_a_result as result,
      b.player_a_start_trophies as trophies,
      b.battle_time
    from public.battles b
    where b.player_a_deck_key is not null

    union all

    select
      b.player_b_tag as player_tag,
      b.player_b_deck_key as deck_key,
      coalesce(b.mode, 'unknown') as mode,
      b.player_b_result as result,
      b.player_b_start_trophies as trophies,
      b.battle_time
    from public.battles b
    where b.player_b_deck_key is not null
  ), normalized as (
    select *
    from observations
    where result in ('win', 'loss', 'draw')
  )
  select
    n.player_tag,
    n.deck_key,
    n.mode,
    sum(case when n.result = 'win' then 1 else 0 end) as wins,
    sum(case when n.result = 'loss' then 1 else 0 end) as losses,
    sum(case when n.result = 'draw' then 1 else 0 end) as draws,
    count(*) as games,
    public.calculate_winrate(
      sum(case when n.result = 'win' then 1 else 0 end),
      sum(case when n.result = 'loss' then 1 else 0 end),
      sum(case when n.result = 'draw' then 1 else 0 end)
    ) as winrate,
    (array_agg(n.trophies order by n.battle_time asc nulls last))[1] as first_seen_trophies,
    (array_agg(n.trophies order by n.battle_time desc nulls last))[1] as last_seen_trophies,
    max(n.trophies) as best_seen_trophies,
    min(n.battle_time) as first_seen_at,
    max(n.battle_time) as last_seen_at
  from normalized n
  group by n.player_tag, n.deck_key, n.mode;
end;
$$;

comment on function public.refresh_player_deck_stats()
  is 'Recomputes player/deck/mode performance aggregates from battles (2 observations per battle).';

-- ----------
-- RLS + Grants
-- ----------

alter table public.cards enable row level security;
alter table public.decks enable row level security;
alter table public.players enable row level security;
alter table public.player_snapshots enable row level security;
alter table public.battles enable row level security;
alter table public.deck_stats_by_trophy_range enable row level security;
alter table public.player_deck_stats enable row level security;
alter table public.deck_changes enable row level security;
alter table public.pro_tracking_requests enable row level security;
alter table public.scan_jobs_log enable row level security;

-- Service role full access policies.
create policy "Service role full access cards"
on public.cards
for all
to service_role
using (true)
with check (true);

create policy "Service role full access decks"
on public.decks
for all
to service_role
using (true)
with check (true);

create policy "Service role full access players"
on public.players
for all
to service_role
using (true)
with check (true);

create policy "Service role full access player snapshots"
on public.player_snapshots
for all
to service_role
using (true)
with check (true);

create policy "Service role full access battles"
on public.battles
for all
to service_role
using (true)
with check (true);

create policy "Service role full access deck stats by trophy range"
on public.deck_stats_by_trophy_range
for all
to service_role
using (true)
with check (true);

create policy "Service role full access player deck stats"
on public.player_deck_stats
for all
to service_role
using (true)
with check (true);

create policy "Service role full access deck changes"
on public.deck_changes
for all
to service_role
using (true)
with check (true);

create policy "Service role full access pro tracking requests"
on public.pro_tracking_requests
for all
to service_role
using (true)
with check (true);

create policy "Service role full access scan jobs log"
on public.scan_jobs_log
for all
to service_role
using (true)
with check (true);

-- Revoke broad client writes and selectively re-grant safe reads.
revoke all on table public.cards from anon, authenticated;
revoke all on table public.decks from anon, authenticated;
revoke all on table public.players from anon, authenticated;
revoke all on table public.player_snapshots from anon, authenticated;
revoke all on table public.battles from anon, authenticated;
revoke all on table public.deck_stats_by_trophy_range from anon, authenticated;
revoke all on table public.player_deck_stats from anon, authenticated;
revoke all on table public.deck_changes from anon, authenticated;
revoke all on table public.pro_tracking_requests from anon, authenticated;
revoke all on table public.scan_jobs_log from anon, authenticated;

-- Public readable entities
create policy "Public read cards"
on public.cards
for select
to anon, authenticated
using (true);

grant select on table public.cards to anon, authenticated;

create policy "Public read decks"
on public.decks
for select
to anon, authenticated
using (true);

grant select on table public.decks to anon, authenticated;

create policy "Public read deck stats by trophy range"
on public.deck_stats_by_trophy_range
for select
to anon, authenticated
using (true);

grant select on table public.deck_stats_by_trophy_range to anon, authenticated;

create policy "Public read player deck stats"
on public.player_deck_stats
for select
to anon, authenticated
using (true);

grant select on table public.player_deck_stats to anon, authenticated;

-- Players: expose only public columns to anon/authenticated.
create policy "Public read players rows"
on public.players
for select
to anon, authenticated
using (true);

grant select (
  tag,
  name,
  last_seen_at,
  current_trophies,
  best_trophies,
  arena_id,
  arena_name,
  current_deck_key,
  tracking_priority,
  is_top_player
) on table public.players to anon, authenticated;

-- Pro tracking requests: public insert allowed, public select forbidden.
create policy "Public insert pro tracking requests"
on public.pro_tracking_requests
for insert
to anon, authenticated
with check (
  char_length(player_tag) between 3 and 16
  and (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  and (discord is null or char_length(discord) <= 80)
  and language in ('fr', 'en')
  and status = 'new'
);

grant insert (player_tag, email, discord, language, message)
  on table public.pro_tracking_requests to anon, authenticated;

-- Sequence access needed for public insert on pro_tracking_requests.
grant usage, select on sequence public.pro_tracking_requests_id_seq to anon, authenticated;

-- Service role can operate on all data.
grant all privileges on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

commit;
