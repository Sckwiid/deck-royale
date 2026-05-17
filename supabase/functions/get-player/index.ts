import { corsPreflight, jsonResponse } from "../_shared/cors.ts";
import {
  fetchClashApi,
  formatPlayerTag,
  isValidPlayerTag,
  normalizePlayerTag
} from "../_shared/clashApi.ts";

interface ClashPlayerResponse {
  tag: string;
  name: string;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  wins: number;
  losses: number;
}

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

    return jsonResponse(req, {
      player: {
        tag: player.tag,
        name: player.name,
        expLevel: player.expLevel,
        trophies: player.trophies,
        bestTrophies: player.bestTrophies,
        wins: player.wins,
        losses: player.losses
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { error: message }, 500);
  }
});
