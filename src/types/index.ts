export type Locale = "fr" | "en";

export interface DeckCardData {
  id: string;
  name: string;
  winRate: number;
  useRate: number;
  trophies: [number, number];
  cards: string[];
  avgElixir: number;
  archetype: string;
}

export interface CardInfo {
  key: string;
  nameFr: string;
  nameEn: string;
  icon: string;
}

export interface AnalyzePlayerResponse {
  ok: boolean;
  player: {
    tag: string;
    name: string;
    trophies: number | null;
    bestTrophies: number | null;
    arena: {
      id: number | null;
      name: string | null;
    };
    lastScanAt?: string | null;
    nextScanAt?: string | null;
  };
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
    ranges?: Array<{
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
  directOpponents?: Array<{
    tag: string;
    name: string | null;
    battles: number;
    latestBattleAt: string | null;
  }>;
  deckChanges?: Array<{
    id: number;
    oldDeckKey: string | null;
    newDeckKey: string;
    changedAt: string;
    trophiesWhenChanged: number | null;
    mode: string | null;
  }>;
  advancedTrackingEnabled?: boolean;
  newBattlesCount: number;
  statsUpdatedAt: string;
}
