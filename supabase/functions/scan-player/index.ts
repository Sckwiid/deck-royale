import { corsPreflight, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { ingestPlayerData, updatePlayerScanError } from "../_shared/scanCore.ts";
import { isValidPlayerTag, localizeClashApiError, normalizePlayerTag } from "../_shared/clash.ts";

interface ScanPlayerBody {
  tag?: string;
  secret?: string;
}

const isAuthorized = (req: Request, bodySecret?: string) => {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  if (!expected) {
    return false;
  }

  const headerSecret = req.headers.get("x-cron-secret");
  return headerSecret === expected || bodySecret === expected;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflight(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);
  }

  let rawTag = "";

  try {
    const body = (await req.json()) as ScanPlayerBody;
    rawTag = String(body?.tag ?? "");

    if (!isAuthorized(req, body?.secret)) {
      return jsonResponse(req, { ok: false, error: "Unauthorized" }, 401);
    }

    const normalized = normalizePlayerTag(rawTag);
    if (!isValidPlayerTag(rawTag)) {
      return jsonResponse(req, { ok: false, error: "Invalid player tag" }, 400);
    }

    const tagRate = checkRateLimit(`scan:tag:${normalized}`, { windowMs: 60_000, max: 20 });
    if (!tagRate.allowed) {
      return jsonResponse(
        req,
        {
          ok: false,
          error: "Rate limit exceeded",
          retryAfterSec: tagRate.retryAfterSec
        },
        429
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const result = await ingestPlayerData({
      supabaseAdmin,
      tag: normalized,
      context: "scan",
      refreshStats: true
    });

    return jsonResponse(req, {
      ok: true,
      ...result.scanPayload
    });
  } catch (error) {
    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (rawTag) {
        await updatePlayerScanError(supabaseAdmin, rawTag);
      }
    } catch {
      // Best effort scan error tracking.
    }

    const mapped = localizeClashApiError(error, "en");
    if (mapped) {
      return jsonResponse(req, { ok: false, error: mapped.message, code: mapped.code }, mapped.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { ok: false, error: message }, 500);
  }
});
