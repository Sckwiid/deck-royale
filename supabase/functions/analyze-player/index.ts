import { corsPreflight, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";
import { ingestPlayerData } from "../_shared/scanCore.ts";
import { isValidPlayerTag, localizeClashApiError, normalizePlayerTag } from "../_shared/clash.ts";

interface AnalyzePlayerBody {
  tag?: string;
  lang?: "fr" | "en";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflight(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);
  }

  let lang: "fr" | "en" = "en";

  try {
    const ip = getClientIp(req);
    const ipRate = checkRateLimit(`analyze:ip:${ip}`, { windowMs: 60_000, max: 10 });

    if (!ipRate.allowed) {
      return jsonResponse(
        req,
        {
          ok: false,
          error: "Rate limit exceeded",
          retryAfterSec: ipRate.retryAfterSec
        },
        429
      );
    }

    const body = (await req.json()) as AnalyzePlayerBody;
    const rawTag = String(body?.tag ?? "");
    const normalized = normalizePlayerTag(rawTag);
    lang = body?.lang === "fr" ? "fr" : "en";

    if (!isValidPlayerTag(rawTag)) {
      return jsonResponse(req, { ok: false, error: "Invalid player tag" }, 400);
    }

    const tagRate = checkRateLimit(`analyze:tag:${normalized}`, { windowMs: 60_000, max: 5 });
    if (!tagRate.allowed) {
      return jsonResponse(
        req,
        {
          ok: false,
          error: "Tag rate limit exceeded",
          retryAfterSec: tagRate.retryAfterSec
        },
        429
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const result = await ingestPlayerData({
      supabaseAdmin,
      tag: normalized,
      lang,
      context: "analyze",
      refreshStats: true
    });

    return jsonResponse(req, {
      ok: true,
      ...result.analyzePayload
    });
  } catch (error) {
    const mapped = localizeClashApiError(error, lang);
    if (mapped) {
      return jsonResponse(req, { ok: false, error: mapped.message, code: mapped.code }, mapped.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { ok: false, error: message }, 500);
  }
});
