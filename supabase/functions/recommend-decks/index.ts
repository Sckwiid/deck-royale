import { createClient } from "npm:@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";
import {
  fetchClashApi,
  formatPlayerTag,
  isValidPlayerTag,
  normalizePlayerTag
} from "../_shared/clashApi.ts";

interface ClashPlayerResponse {
  trophies: number;
}

const fallbackDecks = [
  {
    id: "hog-cycle-core",
    deckName: "Hog Cycle Core",
    archetype: "Cycle",
    winRate: 56.8,
    useRate: 14.2,
    avgElixir: 2.9,
    minTrophies: 5000,
    maxTrophies: 7000,
    cards: [
      "hog-rider",
      "knight",
      "archers",
      "tesla",
      "fireball",
      "the-log",
      "ice-spirit",
      "skeletons"
    ]
  }
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflight(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const rawTag = String(body?.tag ?? "");
    const normalized = normalizePlayerTag(rawTag);

    if (!isValidPlayerTag(rawTag)) {
      return jsonResponse(req, { error: "Invalid player tag" }, 400);
    }

    const playerTag = formatPlayerTag(normalized);
    const encodedTag = encodeURIComponent(playerTag);
    const player = await fetchClashApi<ClashPlayerResponse>(`/players/${encodedTag}`);

    const supabaseUrl = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey =
      Deno.env.get("PUBLIC_SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(req, { decks: fallbackDecks, source: "fallback", trophies: player.trophies });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
      .from("deck_meta_snapshots")
      .select("id, deck_name, archetype, win_rate, use_rate, avg_elixir, min_trophies, max_trophies, cards")
      .lte("min_trophies", player.trophies)
      .gte("max_trophies", player.trophies)
      .order("win_rate", { ascending: false })
      .limit(8);

    if (error) {
      return jsonResponse(req, { error: error.message, decks: fallbackDecks, source: "fallback" }, 200);
    }

    if (!data || data.length === 0) {
      return jsonResponse(req, { decks: fallbackDecks, source: "fallback", trophies: player.trophies });
    }

    const decks = data.map((item) => ({
      id: item.id,
      deckName: item.deck_name,
      archetype: item.archetype,
      winRate: Number(item.win_rate),
      useRate: Number(item.use_rate),
      avgElixir: Number(item.avg_elixir),
      minTrophies: item.min_trophies,
      maxTrophies: item.max_trophies,
      cards: item.cards
    }));

    return jsonResponse(req, { decks, source: "supabase", trophies: player.trophies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { error: message, decks: fallbackDecks, source: "fallback" }, 500);
  }
});
