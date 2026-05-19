import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  formatPlayerTag,
  getPlayer,
  getPlayerBattlelog,
  isValidPlayerTag,
  normalizePlayerTag,
  type ClashBattle,
  type ClashPlayerProfile
} from "./clash.ts";
import { ensureDeckExists, type DeckRecord, upsertDeckRecords } from "./decks.ts";
import { normalizeBattle, type NormalizedBattleRow } from "./battles.ts";
import { hasAdvancedTrackingAccess } from "./proAccess.ts";

export type ScanContext = "analyze" | "scan";

interface IngestOptions {
  supabaseAdmin: SupabaseClient;
  tag: string;
  lang?: "fr" | "en";
  context: ScanContext;
  refreshStats?: boolean;
}

interface PlayerPublicResponse {
  tag: string;
  name: string;
  trophies: number | null;
  bestTrophies: number | null;
  lastScanAt: string | null;
  nextScanAt: string | null;
  arena: {
    id: number | null;
    name: string | null;
  };
}

interface ScannedOpponentSeed {
  tag: string;
  name: string | null;
  battles: number;
  latestBattleAt: string | null;
}

export interface AnalyzeFrontendPayload {
  trophyMap: {
    currentTrophies: number | null;
    bucketMin: number | null;
    bucketMax: number | null;
    topDeckCount: number;
    ranges: Array<{
      trophyMin: number;
      trophyMax: number;
      deckKey: string;
      winrate: number | null;
      games: number;
      avgElixir: number | null;
      cardIds: number[];
      mode: string;
    }>;
    playerRanges: Array<{
      trophyMin: number;
      trophyMax: number;
      deckKey: string;
      winrate: number | null;
      games: number;
      avgElixir: number | null;
      cardIds: number[];
      mode: string;
    }>;
    opponentRanges: Array<{
      trophyMin: number;
      trophyMax: number;
      deckKey: string;
      winrate: number | null;
      games: number;
      avgElixir: number | null;
      cardIds: number[];
      mode: string;
    }>;
  };
  player: PlayerPublicResponse;
  recentDecks: Array<{
    deckKey: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    avgElixir: number | null;
    cardIds: number[];
  }>;
  recommendedDecksForCurrentRange: Array<{
    deckKey: string;
    mode: string;
    trophyMin: number;
    trophyMax: number;
    wins: number;
    losses: number;
    draws: number;
    games: number;
    winrate: number | null;
    avgElixir: number | null;
    cardIds: number[];
  }>;
  worstMatchupDeck: {
    deckKey: string;
    games: number;
    losses: number;
    wins: number;
    draws: number;
    lossRate: number | null;
    avgElixir: number | null;
    cardIds: number[];
  } | null;
  directOpponents: Array<{
    tag: string;
    name: string | null;
    battles: number;
    latestBattleAt: string | null;
    wins: number;
    losses: number;
    draws: number;
    latestResult: "win" | "loss" | "draw" | null;
    latestPlayerDeckKey: string | null;
    latestOpponentDeckKey: string | null;
    latestPlayerDeckCardIds: number[];
    latestOpponentDeckCardIds: number[];
  }>;
  deckChanges: Array<{
    id: number;
    oldDeckKey: string | null;
    newDeckKey: string;
    changedAt: string;
    trophiesWhenChanged: number | null;
    mode: string | null;
    oldDeckCardIds: number[];
    newDeckCardIds: number[];
  }>;
  trophyHistory: Array<{
    collectedAt: string;
    trophies: number;
    bestTrophies: number | null;
  }>;
  advancedTrackingEnabled: boolean;
  newBattlesCount: number;
  statsUpdatedAt: string;
}

export interface ScanSummaryPayload {
  tag: string;
  normalizedTag: string;
  battlesFetched: number;
  newBattlesCount: number;
  decksInserted: number;
  decksUpdated: number;
  statsUpdatedAt: string;
}

const SCAN_INTERVAL_BY_PRIORITY: Record<string, number | null> = {
  normal: 480,
  active: 180,
  top: 60,
  pro: 30,
  paused: null
};

const MIN_GAMES_FOR_RECOMMENDED = 5;
const MIN_GAMES_FOR_TROPHY_MAP = 3;
const TROPHY_MAP_WINDOW_BUCKETS = 5;

const isTrophyCompetitiveMode = (mode: string | null | undefined) =>
  typeof mode === "string" &&
  (() => {
    const normalized = mode.trim().toLowerCase().replace(/\s+/g, "");
    return (
      normalized.includes("ladder") ||
      normalized.includes("ranked") ||
      normalized.includes("pathoflegend")
    );
  })();

const toPriorityScanInterval = (priority: string | null | undefined) => {
  if (!priority) {
    return SCAN_INTERVAL_BY_PRIORITY.normal;
  }

  return SCAN_INTERVAL_BY_PRIORITY[priority] ?? SCAN_INTERVAL_BY_PRIORITY.normal;
};

const toIso = (value: Date) => value.toISOString();

const computeNextScanAt = (priority: string | null | undefined, now: Date) => {
  const minutes = toPriorityScanInterval(priority);
  if (minutes === null) {
    return null;
  }

  return toIso(new Date(now.getTime() + minutes * 60_000));
};

const bucket250 = (trophies: number | null) => {
  if (typeof trophies !== "number") {
    return { min: null, max: null };
  }

  const min = Math.floor(trophies / 250) * 250;
  return { min, max: min + 250 };
};

const computeObservedWinrate = (wins: number, games: number) =>
  games > 0 ? (wins / games) * 100 : 0;

const computeDeckScore = (wins: number, games: number) => {
  if (games <= 0) return 0;
  return computeObservedWinrate(wins, games) * Math.log(games + 1);
};

const summariseRecentDecks = (
  rows: NormalizedBattleRow[],
  deckLookup: Map<string, { cardIds: number[]; avgElixir: number | null }>
) => {
  const stats = new Map<
    string,
    { games: number; wins: number; losses: number; draws: number; deckKey: string }
  >();

  for (const row of rows) {
    if (!row.player_a_deck_key) continue;

    const entry = stats.get(row.player_a_deck_key) ?? {
      deckKey: row.player_a_deck_key,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0
    };

    entry.games += 1;
    if (row.player_a_result === "win") entry.wins += 1;
    if (row.player_a_result === "loss") entry.losses += 1;
    if (row.player_a_result === "draw") entry.draws += 1;

    stats.set(row.player_a_deck_key, entry);
  }

  return [...stats.values()]
    .sort((a, b) => b.games - a.games)
    .slice(0, 8)
    .map((entry) => {
      const deck = deckLookup.get(entry.deckKey);
      return {
        deckKey: entry.deckKey,
        games: entry.games,
        wins: entry.wins,
        losses: entry.losses,
        draws: entry.draws,
        avgElixir: deck?.avgElixir ?? null,
        cardIds: deck?.cardIds ?? []
      };
    });
};

const fetchRecommendedDecksForRange = async (
  supabaseAdmin: SupabaseClient,
  trophies: number | null
): Promise<AnalyzeFrontendPayload["recommendedDecksForCurrentRange"]> => {
  const bucket = bucket250(trophies);
  if (bucket.min === null || bucket.max === null) {
    return [];
  }

  const { data: statsRows, error: statsError } = await supabaseAdmin
    .from("deck_stats_by_trophy_range")
    .select(
      "deck_key, mode, trophy_min, trophy_max, wins, losses, draws, games, winrate, last_updated_at"
    )
    .eq("trophy_min", bucket.min)
    .eq("trophy_max", bucket.max)
    .order("winrate", { ascending: false, nullsFirst: false })
    .order("games", { ascending: false })
    .limit(500);

  if (statsError || !statsRows || statsRows.length === 0) {
    return [];
  }

  const competitiveRows = statsRows.filter((row) => isTrophyCompetitiveMode(row.mode as string | null));
  const baseRows = competitiveRows.length > 0 ? competitiveRows : statsRows;

  const aggregatedByDeck = new Map<
    string,
    {
      deckKey: string;
      wins: number;
      losses: number;
      draws: number;
      games: number;
      trophyMin: number;
      trophyMax: number;
    }
  >();

  for (const row of baseRows) {
    const deckKey = row.deck_key as string;
    const existing = aggregatedByDeck.get(deckKey) ?? {
      deckKey,
      wins: 0,
      losses: 0,
      draws: 0,
      games: 0,
      trophyMin: Number(row.trophy_min),
      trophyMax: Number(row.trophy_max)
    };

    existing.wins += Number(row.wins);
    existing.losses += Number(row.losses);
    existing.draws += Number(row.draws);
    existing.games += Number(row.games);
    aggregatedByDeck.set(deckKey, existing);
  }

  const asArray = [...aggregatedByDeck.values()];
  const confident = asArray.filter((row) => row.games >= MIN_GAMES_FOR_RECOMMENDED);
  const pickedRows = (confident.length > 0 ? confident : asArray)
    .sort((a, b) => {
      const scoreDiff = computeDeckScore(b.wins, b.games) - computeDeckScore(a.wins, a.games);
      if (scoreDiff !== 0) return scoreDiff;
      const bRate = computeObservedWinrate(b.wins, b.games);
      const aRate = computeObservedWinrate(a.wins, a.games);
      if (bRate !== aRate) return bRate - aRate;
      if (b.games !== a.games) return b.games - a.games;
      return b.wins - a.wins;
    })
    .slice(0, 12);

  const deckKeys = [...new Set(pickedRows.map((row) => row.deckKey))];
  const { data: deckRows } = await supabaseAdmin
    .from("decks")
    .select("deck_key, card_ids, avg_elixir")
    .in("deck_key", deckKeys);

  const deckMap = new Map<string, { cardIds: number[]; avgElixir: number | null }>();
  for (const row of deckRows ?? []) {
    deckMap.set(row.deck_key as string, {
      cardIds: ((row.card_ids as number[]) ?? []).map((value) => Number(value)),
      avgElixir: row.avg_elixir !== null ? Number(row.avg_elixir) : null
    });
  }

  return pickedRows.map((row) => {
    const deck = deckMap.get(row.deckKey);
    const games = Number(row.games);
    const wins = Number(row.wins);
    const losses = Number(row.losses);
    const draws = Number(row.draws);
    const winrate = games > 0 ? Number(((wins / games) * 100).toFixed(2)) : null;

    return {
      deckKey: row.deckKey,
      mode: "competitive",
      trophyMin: row.trophyMin,
      trophyMax: row.trophyMax,
      wins,
      losses,
      draws,
      games,
      winrate,
      avgElixir: deck?.avgElixir ?? null,
      cardIds: deck?.cardIds ?? []
    };
  });
};

type TrophyMapRangeEntry = AnalyzeFrontendPayload["trophyMap"]["ranges"][number];
type TrophyMapPerspective = "player" | "opponent";

interface TrophyMapDeckAggregate {
  deckKey: string;
  trophyMin: number;
  trophyMax: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
}

const aggregateBattleResult = (
  value: TrophyMapDeckAggregate,
  result: "win" | "loss" | "draw" | null
) => {
  value.games += 1;
  if (result === "win") value.wins += 1;
  if (result === "loss") value.losses += 1;
  if (result === "draw") value.draws += 1;
};

const selectTopDeckByBucket = (
  aggregates: TrophyMapDeckAggregate[]
): TrophyMapDeckAggregate | null => {
  if (aggregates.length === 0) return null;
  const confident = aggregates.filter((entry) => entry.games >= MIN_GAMES_FOR_TROPHY_MAP);
  const candidates = confident.length > 0 ? confident : aggregates;

  const sorted = [...candidates].sort((a, b) => {
    const scoreDiff = computeDeckScore(b.wins, b.games) - computeDeckScore(a.wins, a.games);
    if (scoreDiff !== 0) return scoreDiff;
    const bRate = computeObservedWinrate(b.wins, b.games);
    const aRate = computeObservedWinrate(a.wins, a.games);
    if (bRate !== aRate) return bRate - aRate;
    if (b.games !== a.games) return b.games - a.games;
    return b.wins - a.wins;
  });

  return sorted[0] ?? null;
};

const toTrophyMapRanges = async (
  supabaseAdmin: SupabaseClient,
  byBucket: Map<string, TrophyMapDeckAggregate[]>,
  perspective: TrophyMapPerspective
): Promise<TrophyMapRangeEntry[]> => {
  const topDecks = [...byBucket.values()]
    .map((entries) => selectTopDeckByBucket(entries))
    .filter((entry): entry is TrophyMapDeckAggregate => Boolean(entry))
    .sort((a, b) => b.trophyMin - a.trophyMin);

  if (topDecks.length === 0) {
    return [];
  }

  const deckKeys = [...new Set(topDecks.map((entry) => entry.deckKey))];
  const { data: deckRows } = await supabaseAdmin
    .from("decks")
    .select("deck_key, card_ids, avg_elixir")
    .in("deck_key", deckKeys);

  const deckMap = new Map<string, { cardIds: number[]; avgElixir: number | null }>();
  for (const row of deckRows ?? []) {
    deckMap.set(row.deck_key as string, {
      cardIds: ((row.card_ids as number[]) ?? []).map((value) => Number(value)),
      avgElixir: row.avg_elixir !== null ? Number(row.avg_elixir) : null
    });
  }

  return topDecks.map((entry) => {
    const deck = deckMap.get(entry.deckKey);
    return {
      trophyMin: entry.trophyMin,
      trophyMax: entry.trophyMax,
      deckKey: entry.deckKey,
      winrate: entry.games > 0 ? Number(((entry.wins / entry.games) * 100).toFixed(2)) : null,
      games: entry.games,
      avgElixir: deck?.avgElixir ?? null,
      cardIds: deck?.cardIds ?? [],
      mode: perspective === "player" ? "player_decks" : "opponent_decks"
    };
  });
};

const fetchTrophyMapRanges = async (
  supabaseAdmin: SupabaseClient,
  playerTag: string,
  trophies: number | null
): Promise<{
  playerRanges: TrophyMapRangeEntry[];
  opponentRanges: TrophyMapRangeEntry[];
}> => {
  const bucket = bucket250(trophies);
  const minBucket = bucket.min !== null ? Math.max(0, bucket.min - TROPHY_MAP_WINDOW_BUCKETS * 250) : null;
  const maxBucket = bucket.max !== null ? bucket.max + TROPHY_MAP_WINDOW_BUCKETS * 250 : null;

  const { data: rows, error } = await supabaseAdmin
    .from("battles")
    .select(
      "battle_time, mode, player_a_start_trophies, player_a_deck_key, player_b_deck_key, player_a_result"
    )
    .eq("player_a_tag", playerTag)
    .not("player_a_start_trophies", "is", null)
    .order("battle_time", { ascending: false })
    .limit(3000);

  if (error || !rows || rows.length === 0) {
    return { playerRanges: [], opponentRanges: [] };
  }

  const playerByBucket = new Map<string, TrophyMapDeckAggregate[]>();
  const opponentByBucket = new Map<string, TrophyMapDeckAggregate[]>();

  const getOrCreate = (
    map: Map<string, TrophyMapDeckAggregate[]>,
    bucketKey: string,
    deckKey: string,
    trophyMin: number,
    trophyMax: number
  ) => {
    const list = map.get(bucketKey) ?? [];
    let entry = list.find((item) => item.deckKey === deckKey);
    if (!entry) {
      entry = {
        deckKey,
        trophyMin,
        trophyMax,
        wins: 0,
        losses: 0,
        draws: 0,
        games: 0
      };
      list.push(entry);
      map.set(bucketKey, list);
    }
    return entry;
  };

  for (const row of rows) {
    if (!isTrophyCompetitiveMode(row.mode as string | null)) {
      continue;
    }

    const sourceTrophies = Number(row.player_a_start_trophies);
    if (!Number.isFinite(sourceTrophies)) {
      continue;
    }
    if (minBucket !== null && sourceTrophies < minBucket) continue;
    if (maxBucket !== null && sourceTrophies >= maxBucket) continue;

    const lane = bucket250(sourceTrophies);
    if (lane.min === null || lane.max === null) continue;

    const bucketKey = `${lane.min}:${lane.max}`;
    const playerDeckKey = (row.player_a_deck_key as string | null) ?? null;
    const opponentDeckKey = (row.player_b_deck_key as string | null) ?? null;
    const playerResult = (row.player_a_result as "win" | "loss" | "draw" | null) ?? null;

    if (playerDeckKey && playerResult) {
      const entry = getOrCreate(playerByBucket, bucketKey, playerDeckKey, lane.min, lane.max);
      aggregateBattleResult(entry, playerResult);
    }

    if (opponentDeckKey && playerResult) {
      const opponentResult =
        playerResult === "win" ? "loss" : playerResult === "loss" ? "win" : "draw";
      const entry = getOrCreate(opponentByBucket, bucketKey, opponentDeckKey, lane.min, lane.max);
      aggregateBattleResult(entry, opponentResult);
    }
  }

  const [playerRanges, opponentRanges] = await Promise.all([
    toTrophyMapRanges(supabaseAdmin, playerByBucket, "player"),
    toTrophyMapRanges(supabaseAdmin, opponentByBucket, "opponent")
  ]);

  return { playerRanges, opponentRanges };
};

const buildPlayerUpsertPayload = (
  profile: ClashPlayerProfile,
  currentDeckKey: string | null,
  context: ScanContext,
  trackingPriority: string,
  advancedTrackingEnabled: boolean
) => {
  const now = new Date();
  const nowIso = toIso(now);
  const scanInterval = toPriorityScanInterval(trackingPriority);

  return {
    tag: formatPlayerTag(profile.tag),
    name: profile.name,
    last_seen_at: nowIso,
    current_trophies: profile.trophies ?? null,
    best_trophies: profile.bestTrophies ?? null,
    arena_id: profile.arena?.id ?? null,
    arena_name: profile.arena?.name ?? null,
    current_deck_key: currentDeckKey,
    scan_interval_minutes: scanInterval ?? 480,
    scan_error_count: 0,
    ...(advancedTrackingEnabled ? { is_pro_requested: true } : {}),
    ...(context === "scan" || context === "analyze"
      ? {
          last_scan_at: nowIso,
          next_scan_at: computeNextScanAt(trackingPriority, now)
        }
      : {})
  };
};

const runStatsRefresh = async (supabaseAdmin: SupabaseClient) => {
  const { error: deckStatsError } = await supabaseAdmin.rpc("refresh_deck_stats_by_trophy_range");
  if (deckStatsError) {
    throw new Error(`refresh_deck_stats_by_trophy_range failed: ${deckStatsError.message}`);
  }

  const { error: playerDeckStatsError } = await supabaseAdmin.rpc("refresh_player_deck_stats");
  if (playerDeckStatsError) {
    throw new Error(`refresh_player_deck_stats failed: ${playerDeckStatsError.message}`);
  }
};

const getExistingPlayer = async (supabaseAdmin: SupabaseClient, tag: string) => {
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("tag, tracking_priority, current_deck_key, last_scan_at, next_scan_at")
    .eq("tag", tag)
    .limit(1);

  if (error) {
    throw new Error(`Could not load player state: ${error.message}`);
  }

  return data?.[0] ?? null;
};

const upsertPlayerSnapshot = async (
  supabaseAdmin: SupabaseClient,
  tag: string,
  profile: ClashPlayerProfile,
  currentDeckKey: string | null
) => {
  const { error } = await supabaseAdmin.from("player_snapshots").insert({
    player_tag: tag,
    collected_at: new Date().toISOString(),
    trophies: profile.trophies ?? null,
    best_trophies: profile.bestTrophies ?? null,
    arena_id: profile.arena?.id ?? null,
    arena_name: profile.arena?.name ?? null,
    current_deck_key: currentDeckKey,
    wins_total: profile.wins ?? null,
    losses_total: profile.losses ?? null,
    battle_count_total: profile.battleCount ?? null,
    raw: profile
  });

  if (error) {
    throw new Error(`Could not insert player snapshot: ${error.message}`);
  }
};

const upsertSourcePlayer = async (
  supabaseAdmin: SupabaseClient,
  profile: ClashPlayerProfile,
  currentDeckKey: string | null,
  context: ScanContext,
  trackingPriority: string,
  advancedTrackingEnabled: boolean
) => {
  const payload = buildPlayerUpsertPayload(
    profile,
    currentDeckKey,
    context,
    trackingPriority,
    advancedTrackingEnabled
  );

  const { error } = await supabaseAdmin.from("players").upsert(payload, { onConflict: "tag" });
  if (error) {
    throw new Error(`Could not upsert player: ${error.message}`);
  }

  return payload;
};

const collectBattleRows = async (
  battles: ClashBattle[],
  sourceTag: string,
  sourceCurrentTrophies: number | null
): Promise<{
  rows: NormalizedBattleRow[];
  decks: DeckRecord[];
  opponents: ScannedOpponentSeed[];
}> => {
  const rows: NormalizedBattleRow[] = [];
  const decks: DeckRecord[] = [];
  const opponentMap = new Map<
    string,
    { tag: string; name: string | null; battles: number; latestBattleAt: string | null }
  >();

  for (const battle of battles) {
    const normalized = await normalizeBattle(battle, {
      sourcePlayerTag: sourceTag,
      sourceCurrentTrophies
    });

    if (!normalized) {
      continue;
    }

    rows.push(normalized.battle);
    decks.push(...normalized.decks);

    if (normalized.opponentTag && normalized.opponentTag !== formatPlayerTag(sourceTag)) {
      const existing = opponentMap.get(normalized.opponentTag);
      const latestBattleAt = normalized.battle.battle_time;

      if (!existing) {
        opponentMap.set(normalized.opponentTag, {
          tag: normalized.opponentTag,
          name: normalized.opponentName ?? null,
          battles: 1,
          latestBattleAt
        });
      } else {
        existing.battles += 1;
        if (!existing.name && normalized.opponentName) {
          existing.name = normalized.opponentName;
        }
        if (!existing.latestBattleAt || latestBattleAt > existing.latestBattleAt) {
          existing.latestBattleAt = latestBattleAt;
        }
        opponentMap.set(normalized.opponentTag, existing);
      }
    }
  }

  const opponents = [...opponentMap.values()].sort((a, b) => {
    if (b.battles !== a.battles) {
      return b.battles - a.battles;
    }
    return (b.latestBattleAt ?? "").localeCompare(a.latestBattleAt ?? "");
  });

  return { rows, decks, opponents };
};

const insertDeckChangeIfNeeded = async (
  supabaseAdmin: SupabaseClient,
  playerTag: string,
  oldDeckKey: string | null | undefined,
  newDeckKey: string | null,
  trophiesWhenChanged: number | null,
  mode: string | null
) => {
  if (!oldDeckKey || !newDeckKey || oldDeckKey === newDeckKey) {
    return;
  }

  const { error } = await supabaseAdmin.from("deck_changes").insert({
    player_tag: playerTag,
    old_deck_key: oldDeckKey,
    new_deck_key: newDeckKey,
    changed_at: new Date().toISOString(),
    trophies_when_changed: trophiesWhenChanged,
    mode
  });

  if (error) {
    throw new Error(`Could not insert deck change: ${error.message}`);
  }
};

const fetchDeckChanges = async (
  supabaseAdmin: SupabaseClient,
  playerTag: string
): Promise<AnalyzeFrontendPayload["deckChanges"]> => {
  const { data, error } = await supabaseAdmin
    .from("deck_changes")
    .select("id, old_deck_key, new_deck_key, changed_at, trophies_when_changed, mode")
    .eq("player_tag", playerTag)
    .order("changed_at", { ascending: false })
    .limit(12);

  if (error || !data || data.length === 0) {
    return [];
  }

  const deckKeys = [
    ...new Set(
      data
        .flatMap((row) => [row.old_deck_key as string | null, row.new_deck_key as string | null])
        .filter((value): value is string => Boolean(value))
    )
  ];

  const { data: deckRows } = deckKeys.length
    ? await supabaseAdmin
        .from("decks")
        .select("deck_key, card_ids")
        .in("deck_key", deckKeys)
    : { data: [] as Array<{ deck_key: string; card_ids: number[] }> };

  const cardsByDeck = new Map<string, number[]>();
  for (const row of deckRows ?? []) {
    cardsByDeck.set(
      row.deck_key as string,
      ((row.card_ids as number[]) ?? []).map((value) => Number(value))
    );
  }

  return data.map((row) => ({
    id: Number(row.id),
    oldDeckKey: (row.old_deck_key as string | null) ?? null,
    newDeckKey: row.new_deck_key as string,
    changedAt: row.changed_at as string,
    trophiesWhenChanged:
      row.trophies_when_changed !== null ? Number(row.trophies_when_changed) : null,
    mode: (row.mode as string | null) ?? null,
    oldDeckCardIds:
      ((row.old_deck_key as string | null) && cardsByDeck.get(row.old_deck_key as string)) ?? [],
    newDeckCardIds: cardsByDeck.get(row.new_deck_key as string) ?? []
  }));
};

const syncDeckChangesFromSnapshots = async (
  supabaseAdmin: SupabaseClient,
  playerTag: string
) => {
  const { data: snapshots, error: snapshotsError } = await supabaseAdmin
    .from("player_snapshots")
    .select("collected_at, trophies, current_deck_key")
    .eq("player_tag", playerTag)
    .not("current_deck_key", "is", null)
    .order("collected_at", { ascending: true })
    .limit(500);

  if (snapshotsError || !snapshots || snapshots.length < 2) {
    return;
  }

  const { data: existingChanges, error: changesError } = await supabaseAdmin
    .from("deck_changes")
    .select("old_deck_key, new_deck_key, changed_at")
    .eq("player_tag", playerTag)
    .order("changed_at", { ascending: false })
    .limit(500);

  if (changesError) {
    throw new Error(`Could not read existing deck changes: ${changesError.message}`);
  }

  const existing = existingChanges ?? [];
  const pending: Array<{
    player_tag: string;
    old_deck_key: string;
    new_deck_key: string;
    changed_at: string;
    trophies_when_changed: number | null;
    mode: string | null;
  }> = [];

  for (let i = 1; i < snapshots.length; i += 1) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];

    const oldDeck = prev.current_deck_key as string | null;
    const newDeck = curr.current_deck_key as string | null;
    if (!oldDeck || !newDeck || oldDeck === newDeck) {
      continue;
    }

    const changedAt = curr.collected_at as string;
    const changedAtMs = Date.parse(changedAt);

    const duplicateInDb = existing.some((row) => {
      if ((row.old_deck_key as string | null) !== oldDeck) return false;
      if ((row.new_deck_key as string | null) !== newDeck) return false;
      const rowMs = Date.parse(row.changed_at as string);
      if (!Number.isFinite(rowMs) || !Number.isFinite(changedAtMs)) return false;
      return Math.abs(rowMs - changedAtMs) <= 5 * 60 * 1000;
    });

    if (duplicateInDb) {
      continue;
    }

    const duplicatePending = pending.some((row) => {
      if (row.old_deck_key !== oldDeck || row.new_deck_key !== newDeck) return false;
      const rowMs = Date.parse(row.changed_at);
      if (!Number.isFinite(rowMs) || !Number.isFinite(changedAtMs)) return false;
      return Math.abs(rowMs - changedAtMs) <= 5 * 60 * 1000;
    });

    if (duplicatePending) {
      continue;
    }

    pending.push({
      player_tag: playerTag,
      old_deck_key: oldDeck,
      new_deck_key: newDeck,
      changed_at: changedAt,
      trophies_when_changed:
        curr.trophies !== null && curr.trophies !== undefined ? Number(curr.trophies) : null,
      mode: null
    });
  }

  if (pending.length === 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin.from("deck_changes").insert(pending);
  if (insertError) {
    throw new Error(`Could not sync deck changes from snapshots: ${insertError.message}`);
  }
};

const fetchTrophyHistory = async (
  supabaseAdmin: SupabaseClient,
  playerTag: string
): Promise<AnalyzeFrontendPayload["trophyHistory"]> => {
  const { data, error } = await supabaseAdmin
    .from("player_snapshots")
    .select("collected_at, trophies, best_trophies")
    .eq("player_tag", playerTag)
    .not("trophies", "is", null)
    .order("collected_at", { ascending: false })
    .limit(60);

  if (error || !data || data.length === 0) {
    return [];
  }

  return [...data]
    .reverse()
    .map((row) => ({
      collectedAt: row.collected_at as string,
      trophies: Number(row.trophies),
      bestTrophies: row.best_trophies !== null ? Number(row.best_trophies) : null
    }))
    .filter((entry) => Number.isFinite(entry.trophies));
};

const fetchWorstMatchupDeck = async (
  supabaseAdmin: SupabaseClient,
  playerTag: string
): Promise<AnalyzeFrontendPayload["worstMatchupDeck"]> => {
  const { data: rows, error } = await supabaseAdmin
    .from("battles")
    .select("player_b_deck_key, player_a_result, mode")
    .eq("player_a_tag", playerTag)
    .not("player_b_deck_key", "is", null)
    .in("player_a_result", ["win", "loss", "draw"])
    .limit(2000);

  if (error || !rows || rows.length === 0) {
    return null;
  }

  const stats = new Map<
    string,
    { deckKey: string; games: number; losses: number; wins: number; draws: number }
  >();

  for (const row of rows) {
    if (!isTrophyCompetitiveMode(row.mode as string | null)) {
      continue;
    }
    const deckKey = row.player_b_deck_key as string | null;
    if (!deckKey) continue;

    const entry = stats.get(deckKey) ?? {
      deckKey,
      games: 0,
      losses: 0,
      wins: 0,
      draws: 0
    };

    entry.games += 1;
    if (row.player_a_result === "loss") entry.losses += 1;
    if (row.player_a_result === "win") entry.wins += 1;
    if (row.player_a_result === "draw") entry.draws += 1;
    stats.set(deckKey, entry);
  }

  const ranked = [...stats.values()]
    .filter((entry) => entry.games >= 3)
    .sort((a, b) => {
      if (b.losses !== a.losses) return b.losses - a.losses;
      const aLossRate = a.games > 0 ? a.losses / a.games : 0;
      const bLossRate = b.games > 0 ? b.losses / b.games : 0;
      if (bLossRate !== aLossRate) return bLossRate - aLossRate;
      return b.games - a.games;
    });

  const target = ranked[0];
  if (!target) {
    return null;
  }

  const { data: deckRows } = await supabaseAdmin
    .from("decks")
    .select("deck_key, card_ids, avg_elixir")
    .eq("deck_key", target.deckKey)
    .limit(1);

  const deck = deckRows?.[0];

  return {
    deckKey: target.deckKey,
    games: target.games,
    losses: target.losses,
    wins: target.wins,
    draws: target.draws,
    lossRate: target.games > 0 ? Number(((target.losses / target.games) * 100).toFixed(2)) : null,
    avgElixir: deck?.avg_elixir !== null && deck?.avg_elixir !== undefined ? Number(deck.avg_elixir) : null,
    cardIds: ((deck?.card_ids as number[] | undefined) ?? []).map((value) => Number(value))
  };
};

const fetchDirectOpponentsDetailed = async (
  supabaseAdmin: SupabaseClient,
  playerTag: string
): Promise<AnalyzeFrontendPayload["directOpponents"]> => {
  const { data: rows, error } = await supabaseAdmin
    .from("battles")
    .select(
      "battle_time, player_b_tag, player_a_result, player_a_deck_key, player_b_deck_key"
    )
    .eq("player_a_tag", playerTag)
    .order("battle_time", { ascending: false })
    .limit(3000);

  if (error || !rows || rows.length === 0) {
    return [];
  }

  const opponents = new Map<
    string,
    {
      tag: string;
      battles: number;
      latestBattleAt: string | null;
      wins: number;
      losses: number;
      draws: number;
      latestResult: "win" | "loss" | "draw" | null;
      latestPlayerDeckKey: string | null;
      latestOpponentDeckKey: string | null;
    }
  >();

  for (const row of rows) {
    const tag = (row.player_b_tag as string | null) ?? null;
    if (!tag) continue;

    const result = (row.player_a_result as "win" | "loss" | "draw" | null) ?? null;
    const battleTime = (row.battle_time as string | null) ?? null;
    const playerDeckKey = (row.player_a_deck_key as string | null) ?? null;
    const opponentDeckKey = (row.player_b_deck_key as string | null) ?? null;

    let entry = opponents.get(tag);
    if (!entry) {
      entry = {
        tag,
        battles: 0,
        latestBattleAt: battleTime,
        wins: 0,
        losses: 0,
        draws: 0,
        latestResult: result,
        latestPlayerDeckKey: playerDeckKey,
        latestOpponentDeckKey: opponentDeckKey
      };
    }

    entry.battles += 1;
    if (result === "win") entry.wins += 1;
    if (result === "loss") entry.losses += 1;
    if (result === "draw") entry.draws += 1;

    if (!entry.latestBattleAt || (battleTime && battleTime > entry.latestBattleAt)) {
      entry.latestBattleAt = battleTime;
      entry.latestResult = result;
      entry.latestPlayerDeckKey = playerDeckKey;
      entry.latestOpponentDeckKey = opponentDeckKey;
    }

    opponents.set(tag, entry);
  }

  const baseRows = [...opponents.values()].sort((a, b) => {
    const timeCmp = (b.latestBattleAt ?? "").localeCompare(a.latestBattleAt ?? "");
    if (timeCmp !== 0) return timeCmp;
    return b.battles - a.battles;
  });

  const tags = baseRows.map((row) => row.tag);
  const { data: playerRows } = tags.length
    ? await supabaseAdmin.from("players").select("tag, name").in("tag", tags)
    : { data: [] as Array<{ tag: string; name: string | null }> };

  const namesByTag = new Map<string, string | null>();
  for (const row of playerRows ?? []) {
    namesByTag.set(row.tag as string, (row.name as string | null) ?? null);
  }

  const latestDeckKeys = [
    ...new Set(
      baseRows
        .flatMap((row) => [row.latestPlayerDeckKey, row.latestOpponentDeckKey])
        .filter((value): value is string => Boolean(value))
    )
  ];
  const { data: deckRows } = latestDeckKeys.length
    ? await supabaseAdmin
        .from("decks")
        .select("deck_key, card_ids")
        .in("deck_key", latestDeckKeys)
    : { data: [] as Array<{ deck_key: string; card_ids: number[] }> };

  const cardsByDeck = new Map<string, number[]>();
  for (const row of deckRows ?? []) {
    cardsByDeck.set(
      row.deck_key as string,
      ((row.card_ids as number[]) ?? []).map((value) => Number(value))
    );
  }

  return baseRows.map((row) => ({
    tag: row.tag,
    name: namesByTag.get(row.tag) ?? null,
    battles: row.battles,
    latestBattleAt: row.latestBattleAt,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    latestResult: row.latestResult,
    latestPlayerDeckKey: row.latestPlayerDeckKey,
    latestOpponentDeckKey: row.latestOpponentDeckKey,
    latestPlayerDeckCardIds:
      (row.latestPlayerDeckKey && cardsByDeck.get(row.latestPlayerDeckKey)) ?? [],
    latestOpponentDeckCardIds:
      (row.latestOpponentDeckKey && cardsByDeck.get(row.latestOpponentDeckKey)) ?? []
  }));
};

const insertOnlyNewBattles = async (
  supabaseAdmin: SupabaseClient,
  rows: NormalizedBattleRow[]
): Promise<{ newBattlesCount: number }> => {
  if (rows.length === 0) {
    return { newBattlesCount: 0 };
  }

  const battleIds = [...new Set(rows.map((row) => row.battle_id))];

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("battles")
    .select("battle_id")
    .in("battle_id", battleIds);

  if (existingError) {
    throw new Error(`Could not query existing battles: ${existingError.message}`);
  }

  const existingIds = new Set((existingRows ?? []).map((row) => row.battle_id as string));
  const newRows = rows.filter((row) => !existingIds.has(row.battle_id));

  if (newRows.length === 0) {
    return { newBattlesCount: 0 };
  }

  const { error: insertError, count } = await supabaseAdmin.from("battles").upsert(newRows, {
    onConflict: "battle_id",
    ignoreDuplicates: true,
    count: "exact"
  });

  if (insertError) {
    throw new Error(`Could not insert battles: ${insertError.message}`);
  }

  return { newBattlesCount: count ?? newRows.length };
};

const upsertOpponentsAsPaused = async (
  supabaseAdmin: SupabaseClient,
  opponents: ScannedOpponentSeed[]
): Promise<void> => {
  const uniqueByTag = new Map<string, { tag: string; name: string | null }>();
  for (const opponent of opponents) {
    if (!opponent.tag) continue;
    const existing = uniqueByTag.get(opponent.tag);
    if (!existing) {
      uniqueByTag.set(opponent.tag, { tag: opponent.tag, name: opponent.name ?? null });
      continue;
    }
    if (!existing.name && opponent.name) {
      uniqueByTag.set(opponent.tag, { tag: opponent.tag, name: opponent.name });
    }
  }

  const unique = [...uniqueByTag.values()];
  if (unique.length === 0) {
    return;
  }

  const tags = unique.map((item) => item.tag);
  const { data: existingPlayers, error: existingPlayersError } = await supabaseAdmin
    .from("players")
    .select("tag")
    .in("tag", tags);

  if (existingPlayersError) {
    throw new Error(`Could not query existing opponents: ${existingPlayersError.message}`);
  }

  const existingTagSet = new Set((existingPlayers ?? []).map((row) => row.tag as string));

  const payload = unique
    .filter((opponent) => !existingTagSet.has(opponent.tag))
    .map((opponent) => ({
      tag: opponent.tag,
      name: opponent.name,
      tracking_priority: "paused",
      scan_interval_minutes: 480,
      next_scan_at: null
    }));

  if (payload.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.from("players").insert(payload);

  if (error) {
    throw new Error(`Could not insert opponents: ${error.message}`);
  }
};

export const ingestPlayerData = async (
  options: IngestOptions
): Promise<{
  playerTag: string;
  playerProfile: ClashPlayerProfile;
  newBattlesCount: number;
  battlesFetched: number;
  decksInserted: number;
  decksUpdated: number;
  statsUpdatedAt: string;
  analyzePayload: AnalyzeFrontendPayload;
  scanPayload: ScanSummaryPayload;
}> => {
  const normalizedTag = normalizePlayerTag(options.tag);
  if (!isValidPlayerTag(options.tag)) {
    throw new Error("Invalid player tag");
  }

  const sourceTag = formatPlayerTag(normalizedTag);
  const advancedTrackingEnabled = hasAdvancedTrackingAccess(sourceTag);
  const [profile, battleLog] = await Promise.all([getPlayer(sourceTag), getPlayerBattlelog(sourceTag)]);

  let currentDeckKey: string | null = null;
  try {
    currentDeckKey = await ensureDeckExists(profile.currentDeck ?? [], options.supabaseAdmin);
  } catch (error) {
    console.warn(
      `ensureDeckExists failed for current deck of ${sourceTag}; continuing with null current_deck_key`,
      error
    );
    currentDeckKey = null;
  }

  const existingPlayer = await getExistingPlayer(options.supabaseAdmin, sourceTag);
  const baseTrackingPriority = (existingPlayer?.tracking_priority as string | null) ?? "normal";
  const trackingPriority = advancedTrackingEnabled ? "pro" : baseTrackingPriority;

  const normalizedBattles = await collectBattleRows(
    battleLog,
    sourceTag,
    profile.trophies ?? null
  );

  // Ensure all battle decks exist before any battle insert to satisfy deck FK constraints.
  const deckUpsertResult = await upsertDeckRecords(options.supabaseAdmin, normalizedBattles.decks);

  await insertDeckChangeIfNeeded(
    options.supabaseAdmin,
    sourceTag,
    (existingPlayer?.current_deck_key as string | null | undefined) ?? null,
    currentDeckKey,
    profile.trophies ?? null,
    normalizedBattles.rows[0]?.mode ?? null
  );

  const playerUpsertPayload = await upsertSourcePlayer(
    options.supabaseAdmin,
    profile,
    currentDeckKey,
    options.context,
    trackingPriority,
    advancedTrackingEnabled
  );

  await upsertPlayerSnapshot(options.supabaseAdmin, sourceTag, profile, currentDeckKey);
  await syncDeckChangesFromSnapshots(options.supabaseAdmin, sourceTag);

  const battleInsertResult = await insertOnlyNewBattles(options.supabaseAdmin, normalizedBattles.rows);

  await upsertOpponentsAsPaused(options.supabaseAdmin, normalizedBattles.opponents);

  if (options.refreshStats ?? true) {
    await runStatsRefresh(options.supabaseAdmin);
  }

  const statsUpdatedAt = new Date().toISOString();

  const deckKeysForRecent = [...new Set(normalizedBattles.rows.map((row) => row.player_a_deck_key).filter(Boolean))] as string[];
  const { data: deckRows } = deckKeysForRecent.length
    ? await options.supabaseAdmin
        .from("decks")
        .select("deck_key, card_ids, avg_elixir")
        .in("deck_key", deckKeysForRecent)
    : { data: [] as Array<{ deck_key: string; card_ids: number[]; avg_elixir: number | null }> };

  const deckLookup = new Map<string, { cardIds: number[]; avgElixir: number | null }>();
  for (const row of deckRows ?? []) {
    deckLookup.set(row.deck_key as string, {
      cardIds: ((row.card_ids as number[]) ?? []).map((value) => Number(value)),
      avgElixir: row.avg_elixir !== null ? Number(row.avg_elixir) : null
    });
  }

  const recommendedDecksForCurrentRange = await fetchRecommendedDecksForRange(
    options.supabaseAdmin,
    profile.trophies ?? null
  );
  const trophyMap = await fetchTrophyMapRanges(
    options.supabaseAdmin,
    sourceTag,
    profile.trophies ?? null
  );
  const deckChanges = await fetchDeckChanges(options.supabaseAdmin, sourceTag);
  const worstMatchupDeck = await fetchWorstMatchupDeck(options.supabaseAdmin, sourceTag);
  const directOpponents = await fetchDirectOpponentsDetailed(options.supabaseAdmin, sourceTag);
  const trophyHistory = await fetchTrophyHistory(options.supabaseAdmin, sourceTag);

  const bucket = bucket250(profile.trophies ?? null);

  const analyzePayload: AnalyzeFrontendPayload = {
    player: {
      tag: sourceTag,
      name: profile.name,
      trophies: profile.trophies ?? null,
      bestTrophies: profile.bestTrophies ?? null,
      lastScanAt:
        (playerUpsertPayload.last_scan_at as string | undefined) ??
        (existingPlayer?.last_scan_at as string | undefined) ??
        null,
      nextScanAt:
        (playerUpsertPayload.next_scan_at as string | undefined) ??
        (existingPlayer?.next_scan_at as string | undefined) ??
        null,
      arena: {
        id: profile.arena?.id ?? null,
        name: profile.arena?.name ?? null
      }
    },
    recentDecks: summariseRecentDecks(normalizedBattles.rows, deckLookup),
    recommendedDecksForCurrentRange,
    worstMatchupDeck,
    trophyMap: {
      currentTrophies: profile.trophies ?? null,
      bucketMin: bucket.min,
      bucketMax: bucket.max,
      topDeckCount: recommendedDecksForCurrentRange.length,
      ranges: trophyMap.playerRanges,
      playerRanges: trophyMap.playerRanges,
      opponentRanges: trophyMap.opponentRanges
    },
    directOpponents,
    deckChanges,
    trophyHistory,
    advancedTrackingEnabled,
    newBattlesCount: battleInsertResult.newBattlesCount,
    statsUpdatedAt
  };

  const scanPayload: ScanSummaryPayload = {
    tag: sourceTag,
    normalizedTag,
    battlesFetched: battleLog.length,
    newBattlesCount: battleInsertResult.newBattlesCount,
    decksInserted: deckUpsertResult.inserted,
    decksUpdated: deckUpsertResult.updated,
    statsUpdatedAt
  };

  return {
    playerTag: sourceTag,
    playerProfile: profile,
    newBattlesCount: battleInsertResult.newBattlesCount,
    battlesFetched: battleLog.length,
    decksInserted: deckUpsertResult.inserted,
    decksUpdated: deckUpsertResult.updated,
    statsUpdatedAt,
    analyzePayload,
    scanPayload
  };
};

export const updatePlayerScanError = async (
  supabaseAdmin: SupabaseClient,
  rawTag: string,
  nextScanAtIso?: string
) => {
  const normalized = normalizePlayerTag(rawTag);
  if (!isValidPlayerTag(rawTag)) {
    return;
  }

  const tag = formatPlayerTag(normalized);

  const { data: rows, error: fetchError } = await supabaseAdmin
    .from("players")
    .select("scan_error_count")
    .eq("tag", tag)
    .limit(1);

  if (fetchError) {
    throw new Error(`Could not fetch player scan_error_count: ${fetchError.message}`);
  }

  const current = Number(rows?.[0]?.scan_error_count ?? 0);

  const { error: updateError } = await supabaseAdmin
    .from("players")
    .update({
      scan_error_count: current + 1,
      next_scan_at: nextScanAtIso ?? new Date(Date.now() + 30 * 60_000).toISOString()
    })
    .eq("tag", tag);

  if (updateError) {
    throw new Error(`Could not update scan error count: ${updateError.message}`);
  }
};

export const resolveNextScanIntervalMinutes = (priority: string | null | undefined) =>
  toPriorityScanInterval(priority);
