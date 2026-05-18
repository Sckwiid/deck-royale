import { useMemo, useState } from "react";
import { postFunctionForDiagnostics, resolveFunctionsBaseUrl } from "@/lib/api";
import type { Locale } from "@/types";

interface ApiDiagnosticsPanelProps {
  locale: Locale;
}

interface TestSpec {
  key: string;
  label: string;
  functionName: string;
  buildBody: (tag: string) => unknown;
  warning?: string;
}

interface DiagnosticEntry {
  id: string;
  key: string;
  label: string;
  functionName: string;
  requestBody: unknown;
  endpoint: string | null;
  status: number | null;
  ok: boolean | null;
  payload: unknown;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  runtimeError: string | null;
}

const TAG_REGEX = /[^0289PYLQGRJCUV]/g;

const normalizeTagInput = (value: string) => {
  const clean = value.trim().toUpperCase().replace(/^%23/i, "").replace(/^#+/, "").replace(TAG_REGEX, "");
  if (clean.length < 3 || clean.length > 15) return "";
  return `#${clean}`;
};

const prettyJson = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const buildSpecs = (locale: Locale): TestSpec[] => {
  const now = Date.now();

  return [
    {
      key: "analyze-ok",
      label: locale === "fr" ? "analyze-player (tag saisi)" : "analyze-player (provided tag)",
      functionName: "analyze-player",
      buildBody: (tag) => ({ tag, lang: locale })
    },
    {
      key: "analyze-invalid",
      label: locale === "fr" ? "analyze-player (tag invalide)" : "analyze-player (invalid tag)",
      functionName: "analyze-player",
      buildBody: () => ({ tag: "%%%INVALID%%%", lang: locale })
    },
    {
      key: "analyze-not-found",
      label: locale === "fr" ? "analyze-player (joueur introuvable)" : "analyze-player (player not found)",
      functionName: "analyze-player",
      buildBody: () => ({ tag: "#QQQQQ0Q0Q0", lang: locale })
    },
    {
      key: "pro-contact-ok",
      label: locale === "fr" ? "pro-contact (valide)" : "pro-contact (valid)",
      functionName: "pro-contact",
      buildBody: (tag) => ({
        player_tag: tag,
        email: `debug-${now}@deckradar.local`,
        discord: "deckradar-debug",
        message:
          locale === "fr"
            ? "Test temporaire de la page debug API."
            : "Temporary API debug page test.",
        language: locale,
        consent_contact: true,
        website: ""
      }),
      warning:
        locale === "fr"
          ? "Ce test crée une ligne dans pro_tracking_requests."
          : "This test creates a row in pro_tracking_requests."
    },
    {
      key: "pro-contact-no-consent",
      label: locale === "fr" ? "pro-contact (sans consentement)" : "pro-contact (without consent)",
      functionName: "pro-contact",
      buildBody: (tag) => ({
        player_tag: tag,
        email: `debug-${now}@deckradar.local`,
        language: locale,
        consent_contact: false,
        website: ""
      })
    },
    {
      key: "pro-contact-honeypot",
      label: locale === "fr" ? "pro-contact (honeypot spam)" : "pro-contact (honeypot spam)",
      functionName: "pro-contact",
      buildBody: (tag) => ({
        player_tag: tag,
        email: `debug-${now}@deckradar.local`,
        language: locale,
        consent_contact: true,
        website: "bot-filled-field"
      })
    }
  ];
};

const getStatusTone = (entry: DiagnosticEntry) => {
  if (entry.runtimeError) return "border-amber-300/45 bg-amber-300/10 text-amber-100";
  if (entry.ok) return "border-emerald-300/45 bg-emerald-300/10 text-emerald-100";
  return "border-rose-300/45 bg-rose-300/10 text-rose-100";
};

export default function ApiDiagnosticsPanel({ locale }: ApiDiagnosticsPanelProps) {
  const [tagInput, setTagInput] = useState("");
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const specs = useMemo(() => buildSpecs(locale), [locale]);

  const normalizedTag = useMemo(() => normalizeTagInput(tagInput), [tagInput]);
  const defaultTag = normalizedTag || "#2PP";

  const functionsBaseInfo = useMemo(() => {
    try {
      return { baseUrl: resolveFunctionsBaseUrl(), error: null as string | null };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : locale === "fr"
            ? "Configuration inconnue."
            : "Unknown configuration error.";
      return { baseUrl: null as string | null, error: message };
    }
  }, [locale]);

  const labels = {
    title: locale === "fr" ? "Panel de diagnostic API (temporaire)" : "Temporary API diagnostics panel",
    description:
      locale === "fr"
        ? "Cette page teste les Edge Functions et affiche les statuts HTTP et payloads bruts pour faciliter le debug."
        : "This page tests Edge Functions and shows raw HTTP statuses and payloads for easier debugging.",
    tagLabel: locale === "fr" ? "Tag joueur à tester" : "Player tag to test",
    normalized:
      locale === "fr"
        ? "Tag normalisé envoyé"
        : "Normalized tag sent",
    fallbackTag:
      locale === "fr"
        ? "Si le tag est vide, les tests utilisent #2PP."
        : "If tag is empty, tests use #2PP.",
    clear: locale === "fr" ? "Effacer les résultats" : "Clear results",
    runAll: locale === "fr" ? "Lancer tous les tests" : "Run all tests",
    running: locale === "fr" ? "Test en cours..." : "Running test...",
    none: locale === "fr" ? "Aucun résultat pour le moment." : "No results yet.",
    request: locale === "fr" ? "Request body" : "Request body",
    response: locale === "fr" ? "Response payload" : "Response payload",
    endpoint: locale === "fr" ? "Endpoint" : "Endpoint",
    startedAt: locale === "fr" ? "Début" : "Started",
    finishedAt: locale === "fr" ? "Fin" : "Finished",
    duration: locale === "fr" ? "Durée" : "Duration",
    runtimeError: locale === "fr" ? "Erreur runtime" : "Runtime error",
    configError: locale === "fr" ? "Erreur de configuration" : "Configuration error",
    httpStatus: locale === "fr" ? "HTTP" : "HTTP"
  };

  const runTest = async (spec: TestSpec) => {
    const requestBody = spec.buildBody(defaultTag);
    const startedAt = new Date().toISOString();
    const startPerf = performance.now();
    setRunningKey(spec.key);

    try {
      const result = await postFunctionForDiagnostics(spec.functionName, requestBody);
      const durationMs = Math.round(performance.now() - startPerf);

      setEntries((prev) => [
        {
          id: `${spec.key}-${startedAt}`,
          key: spec.key,
          label: spec.label,
          functionName: spec.functionName,
          requestBody,
          endpoint: result.endpoint,
          status: result.status,
          ok: result.ok,
          payload: result.payload,
          startedAt: result.startedAt ?? startedAt,
          finishedAt: result.finishedAt ?? new Date().toISOString(),
          durationMs,
          runtimeError: null
        },
        ...prev
      ]);
    } catch (error) {
      const durationMs = Math.round(performance.now() - startPerf);
      setEntries((prev) => [
        {
          id: `${spec.key}-${startedAt}`,
          key: spec.key,
          label: spec.label,
          functionName: spec.functionName,
          requestBody,
          endpoint: null,
          status: null,
          ok: null,
          payload: null,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs,
          runtimeError: error instanceof Error ? error.message : String(error)
        },
        ...prev
      ]);
    } finally {
      setRunningKey(null);
    }
  };

  const runAll = async () => {
    for (const spec of specs) {
      // Sequential execution keeps output readable and avoids spiking rate limits.
      // eslint-disable-next-line no-await-in-loop
      await runTest(spec);
    }
  };

  return (
    <section className="section-wrap mt-8 pb-16 sm:pb-20">
      <article className="glass-panel p-5">
        <h1 className="font-display text-3xl font-bold text-white">{labels.title}</h1>
        <p className="mt-2 text-sm text-slate-300">{labels.description}</p>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-300">{labels.endpoint}</p>
          <p className="mt-1 break-all text-sm text-cyan-100">
            {functionsBaseInfo.baseUrl ?? "—"}
          </p>
          {functionsBaseInfo.error ? (
            <p className="mt-2 text-sm text-rose-200">
              {labels.configError}: {functionsBaseInfo.error}
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="space-y-2 text-sm text-slate-100" htmlFor="debug-player-tag">
            <span>{labels.tagLabel}</span>
            <input
              id="debug-player-tag"
              name="debug-player-tag"
              type="text"
              placeholder="#GUUR8QP0"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/30"
            />
          </label>

          <button
            type="button"
            onClick={runAll}
            disabled={Boolean(runningKey)}
            className="h-11 min-w-[44px] rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {runningKey ? labels.running : labels.runAll}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-300">
          {labels.normalized}: <span className="font-semibold text-slate-100">{defaultTag}</span>
          {" · "}
          {labels.fallbackTag}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {specs.map((spec) => (
            <button
              key={spec.key}
              type="button"
              onClick={() => runTest(spec)}
              disabled={Boolean(runningKey)}
              className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span>{spec.label}</span>
              {spec.warning ? <span className="mt-1 block text-xs text-amber-200">{spec.warning}</span> : null}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setEntries([])}
            className="h-11 min-w-[44px] rounded-xl border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            {labels.clear}
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-300">{labels.none}</p>
          ) : (
            entries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-white">{entry.label}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${getStatusTone(entry)}`}>
                    {entry.runtimeError
                      ? labels.runtimeError
                      : `${labels.httpStatus} ${entry.status ?? "?"} · ${entry.ok ? "OK" : "ERROR"}`}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-300 sm:grid-cols-2">
                  <p>
                    {labels.startedAt}: <span className="text-slate-100">{entry.startedAt}</span>
                  </p>
                  <p>
                    {labels.finishedAt}: <span className="text-slate-100">{entry.finishedAt}</span>
                  </p>
                  <p>
                    {labels.duration}: <span className="text-slate-100">{entry.durationMs}ms</span>
                  </p>
                  <p>
                    {labels.endpoint}: <span className="break-all text-slate-100">{entry.endpoint ?? "—"}</span>
                  </p>
                </div>

                {entry.runtimeError ? (
                  <p className="mt-3 rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                    {labels.runtimeError}: {entry.runtimeError}
                  </p>
                ) : null}

                <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-[0.08em] text-slate-300">{labels.request}</p>
                    <pre className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/35 p-3 text-xs text-slate-200">
                      {prettyJson(entry.requestBody)}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-[0.08em] text-slate-300">{labels.response}</p>
                    <pre className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/35 p-3 text-xs text-slate-200">
                      {prettyJson(entry.payload)}
                    </pre>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
