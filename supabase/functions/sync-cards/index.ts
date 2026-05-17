import { buildCorsHeaders, corsPreflight, jsonResponse } from "../_shared/cors.ts";
import { getCards, localizeClashApiError } from "../_shared/clash.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflight(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const headerSecret = req.headers.get("x-cron-secret");
    let bodySecret: string | undefined;

    try {
      const body = await req.clone().json();
      bodySecret = typeof body?.secret === "string" ? body.secret : undefined;
    } catch {
      // Body is optional for this endpoint.
    }

    if (!cronSecret || (headerSecret !== cronSecret && bodySecret !== cronSecret)) {
      return jsonResponse(req, { ok: false, error: "Unauthorized" }, 401);
    }

    const cardsResponse = await getCards();
    const supabaseAdmin = getSupabaseAdmin();

    const cards = cardsResponse.items ?? [];
    const ids = cards.map((card) => Number(card.id)).filter((id) => Number.isInteger(id) && id > 0);

    const { data: existingRows, error: existingError } = ids.length
      ? await supabaseAdmin.from("cards").select("id").in("id", ids)
      : { data: [], error: null };

    if (existingError) {
      throw new Error(`Could not query existing cards: ${existingError.message}`);
    }

    const existingIds = new Set((existingRows ?? []).map((row) => Number(row.id)));

    const payload = cards.map((card) => ({
      id: Number(card.id),
      name_en: card.name ?? null,
      rarity: card.rarity ?? null,
      max_level: card.maxLevel ?? null,
      elixir_cost: card.elixirCost ?? null,
      icon_url_source: card.iconUrls?.medium ?? null,
      updated_at: new Date().toISOString()
    }));

    if (payload.length > 0) {
      const { error: upsertError } = await supabaseAdmin.from("cards").upsert(payload, {
        onConflict: "id"
      });

      if (upsertError) {
        throw new Error(`Could not upsert cards: ${upsertError.message}`);
      }
    }

    const updated = payload.filter((row) => existingIds.has(row.id)).length;
    const inserted = payload.length - updated;

    return jsonResponse(req, {
      ok: true,
      inserted,
      updated,
      total: payload.length
    });
  } catch (error) {
    const mapped = localizeClashApiError(error, "en");
    if (mapped) {
      return new Response(JSON.stringify({ ok: false, error: mapped.message, code: mapped.code }), {
        status: mapped.status,
        headers: {
          ...buildCorsHeaders(req),
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: {
        ...buildCorsHeaders(req),
        "Content-Type": "application/json; charset=utf-8"
      }
    });
  }
});
