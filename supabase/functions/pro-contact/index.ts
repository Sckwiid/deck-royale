import { corsPreflight, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";
import {
  type ProContactBody,
  validateAndNormalizeProContact
} from "../_shared/proContactValidation.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflight(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`pro-contact:ip:${ip}`, { windowMs: 60_000, max: 10 });
    if (!rate.allowed) {
      return jsonResponse(
        req,
        { ok: false, error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
        429
      );
    }

    const body = (await req.json()) as ProContactBody;
    const parsed = validateAndNormalizeProContact(body);
    if (!parsed.ok) {
      return jsonResponse(req, { ok: false, error: parsed.error }, 400);
    }

    if (parsed.payload.isSpamTrap) {
      return jsonResponse(req, { ok: true });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin.from("pro_tracking_requests").insert({
      player_tag: parsed.payload.playerTag,
      email: parsed.payload.email,
      discord: parsed.payload.discord,
      message: parsed.payload.message,
      language: parsed.payload.language,
      consent_contact: parsed.payload.consentContact,
      status: "new"
    });

    if (error) {
      throw new Error(`Could not create pro tracking request: ${error.message}`);
    }

    return jsonResponse(req, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { ok: false, error: message }, 500);
  }
});
