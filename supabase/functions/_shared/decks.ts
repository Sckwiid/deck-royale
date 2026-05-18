import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ClashCardRef } from "./clash.ts";

export interface DeckRecord {
  deckKey: string;
  cardIds: number[];
  avgElixir: number | null;
}

const encoder = new TextEncoder();

export const sha256Hex = async (value: string) => {
  const bytes = encoder.encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const buildDeckKeyFromCardIds = async (cardIds: number[]) => {
  if (cardIds.length !== 8) {
    return null;
  }

  const sorted = [...cardIds].sort((a, b) => a - b);
  if (new Set(sorted).size !== 8) {
    return null;
  }

  const hashInput = sorted.join("-");
  return sha256Hex(hashInput);
};

export const extractDeckFromCards = async (cards?: ClashCardRef[] | null): Promise<DeckRecord | null> => {
  if (!cards || cards.length !== 8) {
    return null;
  }

  const cardIds = cards
    .map((card) => Number(card.id))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (cardIds.length !== 8) {
    return null;
  }

  const deckKey = await buildDeckKeyFromCardIds(cardIds);
  if (!deckKey) {
    return null;
  }

  const sortedCardIds = [...cardIds].sort((a, b) => a - b);
  const knownElixir = cards
    .map((card) => card.elixirCost)
    .filter((cost): cost is number => typeof cost === "number" && Number.isFinite(cost));

  const avgElixir =
    knownElixir.length > 0
      ? Number((knownElixir.reduce((acc, cur) => acc + cur, 0) / knownElixir.length).toFixed(2))
      : null;

  return {
    deckKey,
    cardIds: sortedCardIds,
    avgElixir
  };
};

export const upsertDeckRecords = async (
  supabaseAdmin: SupabaseClient,
  decks: DeckRecord[]
): Promise<{ inserted: number; updated: number }> => {
  const byKey = new Map<string, DeckRecord>();
  for (const deck of decks) {
    byKey.set(deck.deckKey, deck);
  }

  const uniqueDecks = [...byKey.values()];
  if (uniqueDecks.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const deckKeys = uniqueDecks.map((deck) => deck.deckKey);

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("decks")
    .select("deck_key")
    .in("deck_key", deckKeys);

  if (existingError) {
    throw new Error(`Could not query existing decks: ${existingError.message}`);
  }

  const existingSet = new Set((existingRows ?? []).map((row) => row.deck_key as string));
  const nowIso = new Date().toISOString();

  const toInsert = uniqueDecks
    .filter((deck) => !existingSet.has(deck.deckKey))
    .map((deck) => ({
      deck_key: deck.deckKey,
      card_ids: deck.cardIds,
      avg_elixir: deck.avgElixir,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      updated_at: nowIso
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("decks").insert(toInsert);
    if (insertError) {
      throw new Error(`Could not insert decks: ${insertError.message}`);
    }
  }

  const toUpdate = uniqueDecks.filter((deck) => existingSet.has(deck.deckKey));
  if (toUpdate.length > 0) {
    for (const deck of toUpdate) {
      const { error: updateError } = await supabaseAdmin
        .from("decks")
        .update({
          card_ids: deck.cardIds,
          avg_elixir: deck.avgElixir,
          last_seen_at: nowIso,
          updated_at: nowIso
        })
        .eq("deck_key", deck.deckKey);

      if (updateError) {
        throw new Error(`Could not update deck ${deck.deckKey}: ${updateError.message}`);
      }
    }
  }

  const updated = toUpdate.length;
  const inserted = toInsert.length;

  return { inserted, updated };
};

export const ensureDeckExists = async (
  cards: ClashCardRef[] | null | undefined,
  supabaseAdmin: SupabaseClient
): Promise<string | null> => {
  const deck = await extractDeckFromCards(cards);
  if (!deck) {
    return null;
  }

  await upsertDeckRecords(supabaseAdmin, [deck]);

  const { data, error } = await supabaseAdmin
    .from("decks")
    .select("deck_key")
    .eq("deck_key", deck.deckKey)
    .limit(1);

  if (error) {
    throw new Error(`Could not verify deck ${deck.deckKey}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return deck.deckKey;
};
