import type { ClashBattle, ClashBattleParticipant } from "./clash.ts";
import { formatPlayerTag, normalizePlayerTag, parseClashBattleTime } from "./clash.ts";
import { extractDeckFromCards, sha256Hex, type DeckRecord } from "./decks.ts";

export interface NormalizedBattleRow {
  battle_id: string;
  battle_time: string;
  mode: string | null;
  battle_type: string | null;
  arena_id: number | null;
  arena_name: string | null;
  player_a_tag: string;
  player_b_tag: string;
  player_a_deck_key: string | null;
  player_b_deck_key: string | null;
  player_a_start_trophies: number | null;
  player_b_start_trophies: number | null;
  player_a_crowns: number | null;
  player_b_crowns: number | null;
  player_a_result: "win" | "loss" | "draw" | null;
  player_b_result: "win" | "loss" | "draw" | null;
  source_player_tag: string;
  collected_at: string;
  raw: ClashBattle;
}

interface NormalizeBattleOptions {
  sourcePlayerTag: string;
  sourceCurrentTrophies: number | null;
}

const normalizeKnownTag = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const clean = normalizePlayerTag(value);
  return clean ? formatPlayerTag(clean) : null;
};

const participantCrowns = (
  participant: ClashBattleParticipant | null,
  fallbackCrowns: number | undefined
): number | null => {
  if (!participant) {
    return null;
  }

  if (typeof participant.crowns === "number") {
    return participant.crowns;
  }

  return typeof fallbackCrowns === "number" ? fallbackCrowns : null;
};

const resultFromCrowns = (aCrowns: number | null, bCrowns: number | null) => {
  if (aCrowns === null || bCrowns === null) {
    return { a: null, b: null } as const;
  }

  if (aCrowns > bCrowns) {
    return { a: "win", b: "loss" } as const;
  }

  if (aCrowns < bCrowns) {
    return { a: "loss", b: "win" } as const;
  }

  return { a: "draw", b: "draw" } as const;
};

const pickSides = (battle: ClashBattle, sourcePlayerTag: string) => {
  const team = battle.team ?? [];
  const opponent = battle.opponent ?? [];
  const sourceNormalized = normalizePlayerTag(sourcePlayerTag);

  const sourceInTeam = team.find((entry) => normalizePlayerTag(entry.tag ?? "") === sourceNormalized);
  if (sourceInTeam) {
    return {
      source: sourceInTeam,
      enemy: opponent[0] ?? null,
      sourceSide: "team" as const
    };
  }

  const sourceInOpponent = opponent.find(
    (entry) => normalizePlayerTag(entry.tag ?? "") === sourceNormalized
  );

  if (sourceInOpponent) {
    return {
      source: sourceInOpponent,
      enemy: team[0] ?? null,
      sourceSide: "opponent" as const
    };
  }

  if (team[0] && opponent[0]) {
    return {
      source: team[0],
      enemy: opponent[0],
      sourceSide: "team" as const
    };
  }

  return {
    source: null,
    enemy: null,
    sourceSide: "team" as const
  };
};

const buildBattleId = async (
  battleTimeIso: string,
  playerATag: string,
  playerBTag: string,
  playerADeckKey: string | null,
  playerBDeckKey: string | null,
  playerACrowns: number | null,
  playerBCrowns: number | null
) => {
  const sortedTags = [playerATag, playerBTag].sort();
  const sortedDecks = [playerADeckKey ?? "none", playerBDeckKey ?? "none"].sort();
  const sortedCrowns = [playerACrowns ?? -1, playerBCrowns ?? -1].sort((a, b) => a - b);

  const payload = [
    battleTimeIso,
    sortedTags.join("|"),
    sortedDecks.join("|"),
    sortedCrowns.join("|")
  ].join("::");

  return sha256Hex(payload);
};

export const normalizeBattle = async (
  battle: ClashBattle,
  options: NormalizeBattleOptions
): Promise<{
  battle: NormalizedBattleRow;
  decks: DeckRecord[];
  opponentTag: string | null;
  opponentName: string | null;
} | null> => {
  const battleTimeIso = parseClashBattleTime(battle.battleTime);
  if (!battleTimeIso) {
    return null;
  }

  const { source, enemy, sourceSide } = pickSides(battle, options.sourcePlayerTag);
  const playerATag = normalizeKnownTag(source?.tag);
  const playerBTag = normalizeKnownTag(enemy?.tag);

  if (!source || !enemy || !playerATag || !playerBTag || playerATag === playerBTag) {
    return null;
  }

  const sourceDeck = await extractDeckFromCards(source.cards);
  const enemyDeck = await extractDeckFromCards(enemy.cards);

  const sourceDeckKey = sourceDeck?.deckKey ?? null;
  const enemyDeckKey = enemyDeck?.deckKey ?? null;

  const sourceCrowns = participantCrowns(
    source,
    sourceSide === "team" ? battle.teamCrowns : battle.opponentCrowns
  );
  const enemyCrowns = participantCrowns(
    enemy,
    sourceSide === "team" ? battle.opponentCrowns : battle.teamCrowns
  );

  const result = resultFromCrowns(sourceCrowns, enemyCrowns);

  const sourceStartTrophies =
    source.startingTrophies ?? source.trophies ?? options.sourceCurrentTrophies ?? null;
  const enemyStartTrophies = enemy.startingTrophies ?? enemy.trophies ?? null;

  const battleId = await buildBattleId(
    battleTimeIso,
    playerATag,
    playerBTag,
    sourceDeckKey,
    enemyDeckKey,
    sourceCrowns,
    enemyCrowns
  );

  const decks: DeckRecord[] = [];
  if (sourceDeck) decks.push(sourceDeck);
  if (enemyDeck) decks.push(enemyDeck);

  return {
    battle: {
      battle_id: battleId,
      battle_time: battleTimeIso,
      mode: battle.gameMode?.name ?? null,
      battle_type: battle.type ?? null,
      arena_id: battle.arena?.id ?? null,
      arena_name: battle.arena?.name ?? null,
      player_a_tag: playerATag,
      player_b_tag: playerBTag,
      player_a_deck_key: sourceDeckKey,
      player_b_deck_key: enemyDeckKey,
      player_a_start_trophies: sourceStartTrophies,
      player_b_start_trophies: enemyStartTrophies,
      player_a_crowns: sourceCrowns,
      player_b_crowns: enemyCrowns,
      player_a_result: result.a,
      player_b_result: result.b,
      source_player_tag: formatPlayerTag(options.sourcePlayerTag),
      collected_at: new Date().toISOString(),
      raw: battle
    },
    decks,
    opponentTag: playerBTag,
    opponentName: enemy.name?.trim() ?? null
  };
};
