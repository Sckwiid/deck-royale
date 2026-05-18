begin;

-- refresh_player_deck_stats uses SUM(...) aggregates that resolve to bigint.
-- Provide a bigint overload so winrate calculation works for aggregate inputs.
create or replace function public.calculate_winrate(wins bigint, losses bigint, draws bigint)
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

comment on function public.calculate_winrate(bigint, bigint, bigint)
  is 'Returns winrate in percentage (0..100) rounded to 2 decimals for bigint aggregate inputs.';

commit;
