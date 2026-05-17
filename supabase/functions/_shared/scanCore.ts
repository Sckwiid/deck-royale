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

export interface AnalyzeFrontendPayload {
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
  };
  directOpponents: Array<{
    tag: string;
    name: string | null;
    battles: number;
    latestBattleAt: string | null;
  }>;
  deckChanges: Array<{
    id: number;
    oldDeckKey: string | null;
    newDeckKey: string;
    changedAt: string;
    trophiesWhenChanged: number | null;
    mode: string | null;
  }>;
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
    .limit(12);

  if (statsError || !statsRows || statsRows.length === 0) {
    return [];
  }

  const deckKeys = [...new Set(statsRows.map((row) => row.deck_key as string))];
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

  return statsRows.map((row) => {
    const deck = deckMap.get(row.deck_key as string);
    return {
      deckKey: row.deck_key as string,
      mode: (row.mode as string) ?? "unknown",
      trophyMin: Number(row.trophy_min),
      trophyMax: Number(row.trophy_max),
      wins: Number(row.wins),
      losses: Number(row.losses),
      draws: Number(row.draws),
      games: Number(row.games),
      winrate: row.winrate !== null ? Number(row.winrate) : null,
      avgElixir: deck?.avgElixir ?? null,
      cardIds: deck?.cardIds ?? []
    };
  });
};

const fetchTrophyMapRanges = async (
  supabaseAdmin: SupabaseClient,
  trophies: number | null
): Promise<AnalyzeFrontendPayload["trophyMap"]["ranges"]> => {
  const bucket = bucket250(trophies);
  if (bucket.min === null || bucket.max === null) {
    return [];
  }

  const bucketWindow = 4;
  const minBucket = Math.max(0, bucket.min - bucketWindow * 250);
  const maxBucket = bucket.max + bucketWindow * 250;

  const { data: rows, error } = await supabaseAdmin
    .from("deck_stats_by_trophy_range")
    .select("deck_key, mode, trophy_min, trophy_max, wins, losses, draws, games, winrate")
    .gte("trophy_min", minBucket)
    .lte("trophy_max", maxBucket)
    .order("trophy_min", { ascending: true })
    .order("winrate", { ascending: false, nullsFirst: false })
    .order("games", { ascending: false });

  if (error || !rows || rows.length === 0) {
    return [];
  }

  const topByBucket = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.trophy_min}:${row.trophy_max}`;
    if (!topByBucket.has(key)) {
      topByBucket.set(key, row);
    }
  }

  const pickedRows = [...topByBucket.values()].sort(
    (a, b) => Number(a.trophy_min) - Number(b.trophy_min)
  );

  const deckKeys = [...new Set(pickedRows.map((row) => row.deck_key as string))];
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
    const deck = deckMap.get(row.deck_key as string);

    return {
      trophyMin: Number(row.trophy_min),
      trophyMax: Number(row.trophy_max),
      deckKey: row.deck_key as string,
      winrate: row.winrate !== null ? Number(row.winrate) : null,
      games: Number(row.games),
      avgElixir: deck?.avgElixir ?? null,
      cardIds: deck?.cardIds ?? [],
      mode: (row.mode as string) ?? "unknown"
    };
  });
};

const buildPlayerUpsertPayload = (
  profile: ClashPlayerProfile,
  currentDeckKey: string | null,
  context: ScanContext,
  trackingPriority: string
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
  trackingPriority: string
) => {
  const payload = buildPlayerUpsertPayload(profile, currentDeckKey, context, trackingPriority);

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
  opponents: AnalyzeFrontendPayload["directOpponents"];
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

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: Number(row.id),
    oldDeckKey: (row.old_deck_key as string | null) ?? null,
    newDeckKey: row.new_deck_key as string,
    changedAt: row.changed_at as string,
    trophiesWhenChanged:
      row.trophies_when_changed !== null ? Number(row.trophies_when_changed) : null,
    mode: (row.mode as string | null) ?? null
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
  opponents: AnalyzeFrontendPayload["directOpponents"]
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
  const [profile, battleLog] = await Promise.all([getPlayer(sourceTag), getPlayerBattlelog(sourceTag)]);
  const currentDeckKey = await ensureDeckExists(profile.currentDeck ?? [], options.supabaseAdmin);

  const existingPlayer = await getExistingPlayer(options.supabaseAdmin, sourceTag);
  const trackingPriority = (existingPlayer?.tracking_priority as string | null) ?? "normal";

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
    trackingPriority
  );

  await upsertPlayerSnapshot(options.supabaseAdmin, sourceTag, profile, currentDeckKey);

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
  const trophyMapRanges = await fetchTrophyMapRanges(options.supabaseAdmin, profile.trophies ?? null);
  const deckChanges = await fetchDeckChanges(options.supabaseAdmin, sourceTag);

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
    trophyMap: {
      currentTrophies: profile.trophies ?? null,
      bucketMin: bucket.min,
      bucketMax: bucket.max,
      topDeckCount: recommendedDecksForCurrentRange.length,
      ranges: trophyMapRanges
    },
    directOpponents: normalizedBattles.opponents,
    deckChanges,
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
