import { corsPreflight, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { ingestPlayerData, updatePlayerScanError } from "../_shared/scanCore.ts";

interface CronBody {
  limit?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomPauseMs = () => 3000 + Math.floor(Math.random() * 2001);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflight(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);
  }

  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret");

  if (!expected || provided !== expected) {
    return jsonResponse(req, { ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseAdmin = getSupabaseAdmin();
  const startedAt = new Date().toISOString();

  let jobLogId: number | null = null;
  let playersScanned = 0;
  let newBattles = 0;
  let errors = 0;

  try {
    const body = (await req.json().catch(() => ({}))) as CronBody;
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(500, Number(body.limit))) : 100;

    const { data: jobLogRow, error: logInsertError } = await supabaseAdmin
      .from("scan_jobs_log")
      .insert({
        started_at: startedAt,
        job_type: "cron-scan"
      })
      .select("id")
      .limit(1)
      .single();

    if (logInsertError) {
      throw new Error(`Could not create scan job log: ${logInsertError.message}`);
    }

    jobLogId = Number(jobLogRow.id);

    const nowIso = new Date().toISOString();

    const { data: players, error: playersError } = await supabaseAdmin
      .from("players")
      .select("tag, tracking_priority, next_scan_at")
      .in("tracking_priority", ["normal", "active", "top", "pro"])
      .lte("next_scan_at", nowIso)
      .order("next_scan_at", { ascending: true, nullsFirst: true })
      .limit(limit);

    if (playersError) {
      throw new Error(`Could not load players for cron scan: ${playersError.message}`);
    }

    for (const player of players ?? []) {
      const tag = String(player.tag);

      try {
        const result = await ingestPlayerData({
          supabaseAdmin,
          tag,
          context: "scan",
          refreshStats: false
        });

        playersScanned += 1;
        newBattles += result.newBattlesCount;
      } catch {
        errors += 1;
        await updatePlayerScanError(supabaseAdmin, tag);
      }

      await sleep(randomPauseMs());
    }

    if (playersScanned > 0 || newBattles > 0) {
      const { error: refreshDeckStatsError } = await supabaseAdmin.rpc(
        "refresh_deck_stats_by_trophy_range"
      );
      if (refreshDeckStatsError) {
        throw new Error(
          `refresh_deck_stats_by_trophy_range failed in cron-scan: ${refreshDeckStatsError.message}`
        );
      }

      const { error: refreshPlayerDeckStatsError } = await supabaseAdmin.rpc(
        "refresh_player_deck_stats"
      );
      if (refreshPlayerDeckStatsError) {
        throw new Error(
          `refresh_player_deck_stats failed in cron-scan: ${refreshPlayerDeckStatsError.message}`
        );
      }
    }

    if (jobLogId !== null) {
      await supabaseAdmin
        .from("scan_jobs_log")
        .update({
          ended_at: new Date().toISOString(),
          players_scanned: playersScanned,
          new_battles: newBattles,
          errors,
          raw: {
            limit,
            startedAt,
            finishedAt: new Date().toISOString()
          }
        })
        .eq("id", jobLogId);
    }

    return jsonResponse(req, {
      ok: true,
      playersScanned,
      newBattles,
      errors
    });
  } catch (error) {
    if (jobLogId !== null) {
      await supabaseAdmin
        .from("scan_jobs_log")
        .update({
          ended_at: new Date().toISOString(),
          players_scanned: playersScanned,
          new_battles: newBattles,
          errors: errors + 1,
          raw: {
            startedAt,
            failedAt: new Date().toISOString(),
            message: error instanceof Error ? error.message : "Unknown error"
          }
        })
        .eq("id", jobLogId);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { ok: false, error: message, playersScanned, newBattles, errors }, 500);
  }
});
