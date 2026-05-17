import type { TrophyRange } from "@/lib/metaSeo";

export interface SeoDeckEntry {
  deckKey: string;
  label: string;
  winrate: number | null;
  games: number;
  avgElixir: number | null;
  mode: string;
  cardIds: number[];
}

const FALLBACK_BY_RANGE: Record<string, SeoDeckEntry[]> = {
  "12000-12250": [
    {
      deckKey: "mock-12000-control-cycle",
      label: "Control Cycle",
      winrate: 54.8,
      games: 2140,
      avgElixir: 3.1,
      mode: "trophy-road",
      cardIds: []
    },
    {
      deckKey: "mock-12000-bridge-pressure",
      label: "Bridge Pressure",
      winrate: 53.7,
      games: 1732,
      avgElixir: 3.4,
      mode: "trophy-road",
      cardIds: []
    },
    {
      deckKey: "mock-12000-fast-bait",
      label: "Fast Bait",
      winrate: 52.9,
      games: 1618,
      avgElixir: 2.9,
      mode: "trophy-road",
      cardIds: []
    }
  ],
  "12250-12500": [
    {
      deckKey: "mock-12250-royal-control",
      label: "Royal Control",
      winrate: 55.1,
      games: 2411,
      avgElixir: 3.2,
      mode: "trophy-road",
      cardIds: []
    },
    {
      deckKey: "mock-12250-beatdown-flex",
      label: "Beatdown Flex",
      winrate: 54.2,
      games: 1977,
      avgElixir: 3.8,
      mode: "trophy-road",
      cardIds: []
    },
    {
      deckKey: "mock-12250-cycle-pressure",
      label: "Cycle Pressure",
      winrate: 53.6,
      games: 1888,
      avgElixir: 3.0,
      mode: "trophy-road",
      cardIds: []
    }
  ],
  "12500-12750": [
    {
      deckKey: "mock-12500-high-control",
      label: "High Ladder Control",
      winrate: 55.6,
      games: 2684,
      avgElixir: 3.3,
      mode: "trophy-road",
      cardIds: []
    },
    {
      deckKey: "mock-12500-hybrid-cycle",
      label: "Hybrid Cycle",
      winrate: 54.9,
      games: 2264,
      avgElixir: 3.1,
      mode: "trophy-road",
      cardIds: []
    },
    {
      deckKey: "mock-12500-counter-push",
      label: "Counter Push",
      winrate: 53.9,
      games: 2142,
      avgElixir: 3.5,
      mode: "trophy-road",
      cardIds: []
    }
  ],
  "12750-13000": [
    {
      deckKey: "mock-12750-pro-cycle",
      label: "Pro Cycle",
      winrate: 56.1,
      games: 2518,
      avgElixir: 3.0,
      mode: "trophy-road",
      cardIds: []
    },
    {
      deckKey: "mock-12750-rank-pressure",
      label: "Rank Pressure",
      winrate: 55.3,
      games: 2230,
      avgElixir: 3.4,
      mode: "trophy-road",
      cardIds: []
    },
    {
      deckKey: "mock-12750-discipline-control",
      label: "Discipline Control",
      winrate: 54.7,
      games: 2082,
      avgElixir: 3.2,
      mode: "trophy-road",
      cardIds: []
    }
  ]
};

const FALLBACK_RANKED: SeoDeckEntry[] = [
  {
    deckKey: "mock-ranked-precision-cycle",
    label: "Precision Cycle",
    winrate: 56.4,
    games: 4120,
    avgElixir: 3.0,
    mode: "ranked",
    cardIds: []
  },
  {
    deckKey: "mock-ranked-control-core",
    label: "Control Core",
    winrate: 55.8,
    games: 3988,
    avgElixir: 3.3,
    mode: "ranked",
    cardIds: []
  },
  {
    deckKey: "mock-ranked-hybrid-tempo",
    label: "Hybrid Tempo",
    winrate: 55.2,
    games: 3745,
    avgElixir: 3.2,
    mode: "ranked",
    cardIds: []
  },
  {
    deckKey: "mock-ranked-pressure-bait",
    label: "Pressure Bait",
    winrate: 54.7,
    games: 3499,
    avgElixir: 3.1,
    mode: "ranked",
    cardIds: []
  }
];

const SUPABASE_HEADERS = () => {
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    return null;
  }

  return {
    url,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`
    }
  };
};

const buildDeckLabel = (deckKey: string) => `Deck ${deckKey.slice(0, 8)}`;

const fetchDeckTableRows = async (deckKeys: string[]) => {
  const supabase = SUPABASE_HEADERS();
  if (!supabase || deckKeys.length === 0) {
    return [];
  }

  const keyList = deckKeys.join(",");
  const query = new URLSearchParams({
    select: "deck_key,card_ids,avg_elixir",
    deck_key: `in.(${keyList})`
  });

  const response = await fetch(`${supabase.url}/rest/v1/decks?${query.toString()}`, {
    headers: supabase.headers
  });

  if (!response.ok) {
    return [];
  }

  const rows = (await response.json()) as Array<{
    deck_key: string;
    card_ids: number[] | null;
    avg_elixir: number | null;
  }>;

  return rows;
};

const normalizeLiveRows = async (
  rows: Array<{
    deck_key: string;
    mode: string | null;
    winrate: number | null;
    games: number;
  }>
) => {
  const deckRows = await fetchDeckTableRows(rows.map((row) => row.deck_key));
  const deckMap = new Map(
    deckRows.map((row) => [
      row.deck_key,
      {
        cardIds: Array.isArray(row.card_ids) ? row.card_ids.map((v) => Number(v)) : [],
        avgElixir: row.avg_elixir !== null ? Number(row.avg_elixir) : null
      }
    ])
  );

  return rows.map((row) => ({
    deckKey: row.deck_key,
    label: buildDeckLabel(row.deck_key),
    winrate: row.winrate !== null ? Number(row.winrate) : null,
    games: Number(row.games),
    avgElixir: deckMap.get(row.deck_key)?.avgElixir ?? null,
    mode: row.mode ?? "unknown",
    cardIds: deckMap.get(row.deck_key)?.cardIds ?? []
  }));
};

export const loadTrophyRangeDecks = async (range: TrophyRange): Promise<SeoDeckEntry[]> => {
  const supabase = SUPABASE_HEADERS();
  const fallback = FALLBACK_BY_RANGE[range.slug] ?? [];

  if (!supabase) {
    return fallback;
  }

  try {
    const query = new URLSearchParams({
      select: "deck_key,mode,winrate,games",
      trophy_min: `eq.${range.min}`,
      trophy_max: `eq.${range.max}`,
      order: "winrate.desc,games.desc",
      limit: "8"
    });

    const response = await fetch(
      `${supabase.url}/rest/v1/deck_stats_by_trophy_range?${query.toString()}`,
      {
        headers: supabase.headers
      }
    );

    if (!response.ok) {
      return fallback;
    }

    const rows = (await response.json()) as Array<{
      deck_key: string;
      mode: string | null;
      winrate: number | null;
      games: number;
    }>;

    if (!rows.length) {
      return fallback;
    }

    return normalizeLiveRows(rows);
  } catch {
    return fallback;
  }
};

export const loadRankedDecks = async (): Promise<SeoDeckEntry[]> => {
  const supabase = SUPABASE_HEADERS();
  if (!supabase) {
    return FALLBACK_RANKED;
  }

  try {
    const query = new URLSearchParams({
      select: "deck_key,mode,winrate,games,trophy_min",
      trophy_min: "gte.12000",
      order: "winrate.desc,games.desc",
      limit: "16"
    });

    const response = await fetch(
      `${supabase.url}/rest/v1/deck_stats_by_trophy_range?${query.toString()}`,
      {
        headers: supabase.headers
      }
    );

    if (!response.ok) {
      return FALLBACK_RANKED;
    }

    const rows = (await response.json()) as Array<{
      deck_key: string;
      mode: string | null;
      winrate: number | null;
      games: number;
      trophy_min: number | null;
    }>;

    if (!rows.length) {
      return FALLBACK_RANKED;
    }

    const deduped = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!deduped.has(row.deck_key)) {
        deduped.set(row.deck_key, row);
      }
    }

    const rankedRows = [...deduped.values()].slice(0, 8).map((row) => ({
      deck_key: row.deck_key,
      mode: row.mode,
      winrate: row.winrate,
      games: row.games
    }));

    return normalizeLiveRows(rankedRows);
  } catch {
    return FALLBACK_RANKED;
  }
};

