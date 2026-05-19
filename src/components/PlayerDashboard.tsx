import { useEffect, useMemo, useState } from "react";
import DeckMini from "@/components/DeckMini";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import GamesCount from "@/components/GamesCount";
import PlayerDashboardSkeleton from "@/components/PlayerDashboardSkeleton";
import ResponsiveTabs from "@/components/ResponsiveTabs";
import TrophyRangePill from "@/components/TrophyRangePill";
import WinrateBadge from "@/components/WinrateBadge";
import { FunctionApiError, analyzePlayer } from "@/lib/api";
import { fetchCardsLookup, type PublicCardMeta } from "@/lib/cards";
import { getDictionary } from "@/lib/i18n";
import type { AnalyzePlayerResponse, Locale } from "@/types";

interface PlayerDashboardProps {
  locale: Locale;
  initialTag: string;
}

type DashboardTab = "decks" | "opponents" | "changes";
type TrophyMapMode = "player" | "opponent";
type TrophyWindowKey = "6h" | "1d" | "7d" | "1m" | "3m" | "6m" | "1y" | "all";

const TROPHY_WINDOWS: Array<{
  key: TrophyWindowKey;
  hours: number | null;
  labelFr: string;
  labelEn: string;
}> = [
  { key: "6h", hours: 6, labelFr: "6H", labelEn: "6H" },
  { key: "1d", hours: 24, labelFr: "1J", labelEn: "1D" },
  { key: "7d", hours: 24 * 7, labelFr: "7J", labelEn: "7D" },
  { key: "1m", hours: 24 * 30, labelFr: "1M", labelEn: "1M" },
  { key: "3m", hours: 24 * 90, labelFr: "3M", labelEn: "3M" },
  { key: "6m", hours: 24 * 180, labelFr: "6M", labelEn: "6M" },
  { key: "1y", hours: 24 * 365, labelFr: "1A", labelEn: "1Y" },
  { key: "all", hours: null, labelFr: "ALL", labelEn: "ALL" }
];

const TAG_REGEX = /[^0289PYLQGRJCUV]/g;

const normalizeTagInput = (value: string) => {
  const clean = value.trim().toUpperCase().replace(/^#+/, "").replace(TAG_REGEX, "");
  if (clean.length < 3 || clean.length > 15) return "";
  return `#${clean}`;
};

const normalizeBasePath = () => {
  const basePath = import.meta.env.BASE_URL ?? "/";
  if (!basePath || basePath === "/") return "";
  return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
};

const buildPlayerUrl = (locale: Locale, tag: string) =>
  `${normalizeBasePath()}/${locale}/player/?tag=${encodeURIComponent(tag)}`;

const computeWinrate = (wins: number, losses: number, draws: number) => {
  const games = wins + losses + draws;
  if (!games) return null;
  return (wins / games) * 100;
};

const formatDateTime = (iso: string | null | undefined, locale: Locale) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};

const deckKeyShort = (deckKey: string | null | undefined) => {
  if (!deckKey) return "N/A";
  return `${deckKey.slice(0, 8)}…`;
};

const getResultLabel = (result: "win" | "loss" | "draw" | null, locale: Locale) => {
  if (!result) return locale === "fr" ? "Résultat inconnu" : "Unknown result";
  if (locale === "fr") {
    if (result === "win") return "Victoire";
    if (result === "loss") return "Défaite";
    return "Égalité";
  }
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  return "Draw";
};

const getResultClass = (result: "win" | "loss" | "draw" | null) => {
  if (result === "win") return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  if (result === "loss") return "border-rose-300/40 bg-rose-300/10 text-rose-100";
  if (result === "draw") return "border-amber-300/40 bg-amber-300/10 text-amber-100";
  return "border-white/20 bg-white/5 text-slate-200";
};

const buildTrophyPathPoints = (
  points: Array<{ trophies: number }>,
  width: number,
  height: number
) => {
  if (points.length < 2) {
    return { line: "", area: "", min: 0, max: 0 };
  }

  const values = points.map((point) => point.trophies);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const topPad = 12;
  const bottomPad = 18;
  const usableHeight = height - topPad - bottomPad;

  const line = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const normalized = (point.trophies - min) / span;
      const y = topPad + (1 - normalized) * usableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const area = `${line} ${width},${height} 0,${height}`;

  return { line, area, min, max };
};

const formatLoadError = (error: unknown, locale: Locale) => {
  const fallback =
    locale === "fr"
      ? "Impossible de charger l'analyse joueur actuellement."
      : "Unable to load player analysis right now.";

  if (error instanceof FunctionApiError) {
    const status = `HTTP ${error.status}`;
    const code = error.code ? ` · ${error.code}` : "";
    const message = error.message?.trim() || fallback;
    return `${message} (${status}${code})`;
  }

  if (error instanceof Error && error.message) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
};

export default function PlayerDashboard({ locale, initialTag }: PlayerDashboardProps) {
  const dict = getDictionary(locale);
  const [resolvedTag, setResolvedTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<AnalyzePlayerResponse | null>(null);
  const [cardLookup, setCardLookup] = useState<Map<number, PublicCardMeta>>(new Map());
  const [mobileTab, setMobileTab] = useState<DashboardTab>("decks");
  const [opponentsVisibleCount, setOpponentsVisibleCount] = useState(15);
  const [trophyMapMode, setTrophyMapMode] = useState<TrophyMapMode>("player");
  const [showTrophyGraph, setShowTrophyGraph] = useState(false);
  const [trophyWindow, setTrophyWindow] = useState<TrophyWindowKey>("7d");

  useEffect(() => {
    const queryTag = new URLSearchParams(window.location.search).get("tag") ?? "";
    const pathTag = window.location.pathname.match(/\/player\/([^/]+)\/?$/)?.[1] ?? "";
    const remembered = localStorage.getItem("deckradar.lastTag") ?? "";

    const candidate = initialTag || queryTag || pathTag || remembered;
    const normalized = normalizeTagInput(decodeURIComponent(candidate));
    setResolvedTag(normalized);
  }, [initialTag]);

  const loadPlayer = async (tag: string) => {
    if (!tag) return;

    setLoading(true);
    setError("");

    try {
      const result = await analyzePlayer({ tag, lang: locale });
      if (!result?.ok) {
        throw new Error("Analyze failed");
      }

      setPayload(result);
      localStorage.setItem("deckradar.lastTag", tag.replace(/^#/, ""));
    } catch (error) {
      setError(formatLoadError(error, locale));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!resolvedTag) return;
    loadPlayer(resolvedTag);
  }, [resolvedTag, locale]);

  useEffect(() => {
    let cancelled = false;

    fetchCardsLookup(locale)
      .then((lookup) => {
        if (!cancelled) {
          setCardLookup(lookup);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCardLookup(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    setOpponentsVisibleCount(15);
    setTrophyMapMode("player");
    setShowTrophyGraph(false);
    setTrophyWindow("7d");
  }, [payload?.player.tag]);

  const recommendedDeck = payload?.recommendedDecksForCurrentRange?.[0] ?? null;
  const worstMatchupDeck = payload?.worstMatchupDeck ?? null;
  const trophyHistory = payload?.trophyHistory ?? [];
  const trackedSinceAt = payload?.trackedSinceAt ?? trophyHistory[0]?.collectedAt ?? null;
  const filteredTrophyHistory = useMemo(() => {
    const selected = TROPHY_WINDOWS.find((window) => window.key === trophyWindow);
    if (!selected || selected.hours === null || trophyHistory.length === 0) {
      return trophyHistory;
    }

    const latestMs = Date.parse(trophyHistory[trophyHistory.length - 1]?.collectedAt ?? "");
    if (!Number.isFinite(latestMs)) {
      return trophyHistory;
    }

    const minMs = latestMs - selected.hours * 60 * 60 * 1000;
    const filtered = trophyHistory.filter((point) => {
      const pointMs = Date.parse(point.collectedAt);
      return Number.isFinite(pointMs) && pointMs >= minMs;
    });

    if (filtered.length >= 2) {
      return filtered;
    }
    return trophyHistory.slice(-Math.min(10, trophyHistory.length));
  }, [trophyHistory, trophyWindow]);

  const trophyChart = useMemo(() => {
    const width = 720;
    const height = 170;
    return buildTrophyPathPoints(filteredTrophyHistory, width, height);
  }, [filteredTrophyHistory]);

  const deckCardsByKey = useMemo(() => {
    const map = new Map<string, number[]>();

    for (const deck of payload?.recentDecks ?? []) {
      map.set(deck.deckKey, deck.cardIds ?? []);
    }
    for (const deck of payload?.recommendedDecksForCurrentRange ?? []) {
      map.set(deck.deckKey, deck.cardIds ?? []);
    }
    for (const lane of payload?.trophyMap.ranges ?? []) {
      map.set(lane.deckKey, lane.cardIds ?? []);
    }
    for (const lane of payload?.trophyMap.playerRanges ?? []) {
      map.set(lane.deckKey, lane.cardIds ?? []);
    }
    for (const lane of payload?.trophyMap.opponentRanges ?? []) {
      map.set(lane.deckKey, lane.cardIds ?? []);
    }
    for (const opponent of payload?.directOpponents ?? []) {
      if (opponent.latestPlayerDeckKey && opponent.latestPlayerDeckCardIds?.length === 8) {
        map.set(opponent.latestPlayerDeckKey, opponent.latestPlayerDeckCardIds);
      }
      if (opponent.latestOpponentDeckKey && opponent.latestOpponentDeckCardIds?.length === 8) {
        map.set(opponent.latestOpponentDeckKey, opponent.latestOpponentDeckCardIds);
      }
    }
    for (const change of payload?.deckChanges ?? []) {
      if (change.oldDeckKey && change.oldDeckCardIds?.length === 8) {
        map.set(change.oldDeckKey, change.oldDeckCardIds);
      }
      if (change.newDeckKey && change.newDeckCardIds?.length === 8) {
        map.set(change.newDeckKey, change.newDeckCardIds);
      }
    }

    return map;
  }, [payload]);

  const comparisonRows = useMemo(() => {
    const averages = new Map<string, number | null>();
    for (const deck of payload?.recommendedDecksForCurrentRange ?? []) {
      averages.set(deck.deckKey, deck.winrate ?? null);
    }

    return (payload?.recentDecks ?? [])
      .map((deck) => {
        const yourWinrate = computeWinrate(deck.wins, deck.losses, deck.draws);
        const averageWinrate = averages.get(deck.deckKey) ?? null;
        const delta =
          yourWinrate !== null && averageWinrate !== null ? yourWinrate - averageWinrate : null;

        return {
          ...deck,
          yourWinrate,
          averageWinrate,
          delta
        };
      })
      .sort((a, b) => b.games - a.games);
  }, [payload]);

  const renderDecksVsAverage = () => (
    <section className="glass-panel p-4 sm:p-5">
      <h2 className="font-display text-2xl font-bold text-white">{dict.dashboard.yourDecksVsAverage}</h2>
      <p className="mt-1 text-sm text-slate-300">{dict.dashboard.yourDecksVsAverageSubtitle}</p>

      {comparisonRows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={dict.common.noData} description={dict.dashboard.noRecommendedDeck} />
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-3 md:hidden">
            {comparisonRows.map((row) => (
              <article key={row.deckKey} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <DeckMini cardIds={row.cardIds} cardLookup={cardLookup} />
                  <div className="text-right">
                    <WinrateBadge value={row.yourWinrate} />
                    <p className="mt-1 text-xs text-slate-300">
                      {dict.common.winrate}: {row.averageWinrate === null ? "N/A" : `${row.averageWinrate.toFixed(1)}%`}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <GamesCount count={row.games} label={dict.dashboard.basedOnGames} />
                  <p className="text-xs text-slate-300">
                    Δ{" "}
                    {row.delta === null
                      ? "N/A"
                      : `${row.delta > 0 ? "+" : ""}${row.delta.toFixed(1)}%`}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 hidden md:block">
            <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.08em] text-slate-300">
              <span>{dict.dashboard.recommendedDeck}</span>
              <span>{dict.common.winrate}</span>
              <span>{dict.dashboard.bestDeckNow}</span>
              <span>Δ</span>
              <span>{dict.common.games}</span>
            </div>
            <div className="mt-2 space-y-2">
              {comparisonRows.map((row) => (
                <div
                  key={row.deckKey}
                  className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr] items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3"
                >
                  <DeckMini cardIds={row.cardIds} cardLookup={cardLookup} />
                  <WinrateBadge value={row.yourWinrate} />
                  <WinrateBadge value={row.averageWinrate} />
                  <p className="text-sm text-slate-200">
                    {row.delta === null
                      ? "N/A"
                      : `${row.delta > 0 ? "+" : ""}${row.delta.toFixed(1)}%`}
                  </p>
                  <p className="text-sm text-slate-200">{row.games}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );

  const selectedTrophyRanges =
    trophyMapMode === "player"
      ? payload?.trophyMap.playerRanges ?? payload?.trophyMap.ranges ?? []
      : payload?.trophyMap.opponentRanges ?? [];

  const renderTrophyMap = () => (
    <section className="glass-panel p-4 sm:p-5">
      <h2 className="font-display text-2xl font-bold text-white">{dict.dashboard.trophyMap}</h2>
      <div className="mt-3 inline-flex rounded-xl border border-white/15 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setTrophyMapMode("player")}
          className={`h-11 min-w-[44px] rounded-lg px-3 text-sm font-semibold transition ${
            trophyMapMode === "player"
              ? "bg-cyan-300/20 text-cyan-100"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          {locale === "fr" ? "Mes decks" : "My decks"}
        </button>
        <button
          type="button"
          onClick={() => setTrophyMapMode("opponent")}
          className={`h-11 min-w-[44px] rounded-lg px-3 text-sm font-semibold transition ${
            trophyMapMode === "opponent"
              ? "bg-violet-300/20 text-violet-100"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          {locale === "fr" ? "Decks adversaires" : "Opponent decks"}
        </button>
      </div>

      {selectedTrophyRanges.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={dict.common.noData}
            description={
              locale === "fr"
                ? "Pas encore assez de games dans cette range. Les stats s'affinent automatiquement."
                : "Not enough games in this range yet. Stats refine automatically."
            }
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {selectedTrophyRanges.map((lane) => {
            const active =
              typeof payload?.trophyMap.currentTrophies === "number" &&
              payload.trophyMap.currentTrophies >= lane.trophyMin &&
              payload.trophyMap.currentTrophies < lane.trophyMax;

            return (
              <article
                key={`${trophyMapMode}-${lane.trophyMin}-${lane.deckKey}`}
                className={`rounded-xl border p-3 ${
                  active ? "border-cyan-300/45 bg-cyan-300/12" : "border-white/20 bg-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <TrophyRangePill min={lane.trophyMin} max={lane.trophyMax} active={active} />
                  <WinrateBadge value={lane.winrate} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <DeckMini cardIds={lane.cardIds} cardLookup={cardLookup} />
                  <GamesCount count={lane.games} label={dict.dashboard.basedOnGames} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedTrophyRanges.some((lane) => lane.games < 3) ? (
        <p className="mt-3 text-xs text-slate-300">
          {locale === "fr"
            ? "Certaines ranges restent en faible volume. Les stats se stabilisent avec les prochains scans."
            : "Some ranges still have low sample volume. Stats stabilize as more scans are collected."}
        </p>
      ) : null}
    </section>
  );

  const visibleOpponents = (payload?.directOpponents ?? []).slice(0, opponentsVisibleCount);
  const hasMoreOpponents = (payload?.directOpponents?.length ?? 0) > visibleOpponents.length;

  const renderDirectOpponents = () => (
    <section className="glass-panel p-4 sm:p-5">
      <h2 className="font-display text-2xl font-bold text-white">{dict.dashboard.directOpponents}</h2>

      {(payload?.directOpponents?.length ?? 0) > 0 ? (
        <div className="mt-4 space-y-3">
          {visibleOpponents.map((opponent) => (
            <article
              key={opponent.tag}
              className="rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
            >
              <div className="flex items-start justify-between gap-3">
                <a href={buildPlayerUrl(locale, opponent.tag)} className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white hover:text-cyan-100">
                    {opponent.name || opponent.tag}
                  </p>
                  <p className="text-xs text-slate-300">{opponent.tag}</p>
                </a>
                <span
                  className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getResultClass(
                    opponent.latestResult
                  )}`}
                >
                  {getResultLabel(opponent.latestResult, locale)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span>
                  W/L/D: {opponent.wins}/{opponent.losses}/{opponent.draws}
                </span>
                <span>•</span>
                <span>
                  {locale === "fr" ? "Combats" : "Battles"}: {opponent.battles}
                </span>
                <span>•</span>
                <span>{formatDateTime(opponent.latestBattleAt, locale)}</span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                    {locale === "fr" ? "Ton deck" : "Your deck"}
                  </p>
                  {opponent.latestPlayerDeckCardIds?.length === 8 ? (
                    <div className="mt-2">
                      <DeckMini cardIds={opponent.latestPlayerDeckCardIds} cardLookup={cardLookup} />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-300">
                      {deckKeyShort(opponent.latestPlayerDeckKey)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                    {locale === "fr" ? "Deck adverse" : "Opponent deck"}
                  </p>
                  {opponent.latestOpponentDeckCardIds?.length === 8 ? (
                    <div className="mt-2">
                      <DeckMini cardIds={opponent.latestOpponentDeckCardIds} cardLookup={cardLookup} />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-300">
                      {deckKeyShort(opponent.latestOpponentDeckKey)}
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))}

          {hasMoreOpponents ? (
            <button
              type="button"
              onClick={() => setOpponentsVisibleCount((value) => value + 10)}
              className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              {locale === "fr" ? "Afficher 10 de plus" : "Show 10 more"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState title={dict.common.noData} description={dict.dashboard.directOpponentsLockedText} />
        </div>
      )}

      {payload?.advancedTrackingEnabled ? (
        <article className="mt-4 rounded-xl border border-emerald-300/35 bg-emerald-300/10 p-4">
          <h3 className="font-display text-lg font-semibold text-emerald-100">
            {locale === "fr" ? "Tracking avancé actif" : "Advanced tracking active"}
          </h3>
          <p className="mt-2 text-sm text-emerald-100/90">
            {locale === "fr"
              ? "Ton tag est autorisé via la liste sécurisée backend."
              : "Your tag is enabled through the backend secured allowlist."}
          </p>
        </article>
      ) : (
        <article className="mt-4 rounded-xl border border-dashed border-violet-300/40 bg-violet-300/10 p-4">
          <h3 className="font-display text-lg font-semibold text-violet-100">
            {dict.dashboard.directOpponentsLocked}
          </h3>
          <p className="mt-2 text-sm text-violet-100/90">{dict.dashboard.directOpponentsLockedText}</p>
          <a
            href={`${normalizeBasePath()}/${locale}/pro-tracking/`}
            className="mt-4 inline-flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-violet-200/40 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-200/15"
          >
            {dict.dashboard.unlockTracking}
          </a>
        </article>
      )}
    </section>
  );

  const renderDeckChanges = () => (
    <section className="glass-panel p-4 sm:p-5">
      <h2 className="font-display text-2xl font-bold text-white">{dict.dashboard.deckChangeHistory}</h2>

      {(payload?.deckChanges?.length ?? 0) === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={dict.common.noData}
            description={
              locale === "fr"
                ? `${dict.dashboard.emptyDeckHistory} Le suivi enregistre un changement uniquement si le deck courant diffère entre deux scans.`
                : `${dict.dashboard.emptyDeckHistory} A change is recorded only when your current deck differs between two scans.`
            }
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {(payload?.deckChanges ?? []).map((change) => (
            <article
              key={change.id}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-100">{formatDateTime(change.changedAt, locale)}</p>
                <p className="text-xs text-slate-300">
                  {change.trophiesWhenChanged ?? "—"} {dict.common.trophies.toLowerCase()}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                    {locale === "fr" ? "Avant" : "Before"}
                  </p>
                  {(change.oldDeckCardIds?.length ?? 0) === 8 ? (
                    <div className="mt-2">
                      <DeckMini cardIds={change.oldDeckCardIds} cardLookup={cardLookup} />
                    </div>
                  ) : change.oldDeckKey && (deckCardsByKey.get(change.oldDeckKey)?.length ?? 0) === 8 ? (
                    <div className="mt-2">
                      <DeckMini cardIds={deckCardsByKey.get(change.oldDeckKey) ?? []} cardLookup={cardLookup} />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-300">{deckKeyShort(change.oldDeckKey)}</p>
                  )}
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                    {locale === "fr" ? "Après" : "After"}
                  </p>
                  {(change.newDeckCardIds?.length ?? 0) === 8 ? (
                    <div className="mt-2">
                      <DeckMini cardIds={change.newDeckCardIds} cardLookup={cardLookup} />
                    </div>
                  ) : (deckCardsByKey.get(change.newDeckKey)?.length ?? 0) === 8 ? (
                    <div className="mt-2">
                      <DeckMini cardIds={deckCardsByKey.get(change.newDeckKey) ?? []} cardLookup={cardLookup} />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-300">{deckKeyShort(change.newDeckKey)}</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  if (!resolvedTag) {
    return (
      <section className="section-wrap mt-8">
        <EmptyState
          title={locale === "fr" ? "Tag joueur requis" : "Player tag required"}
          description={
            locale === "fr"
              ? "Entrez un tag dans la page d'analyse pour ouvrir le dashboard joueur."
              : "Enter a player tag on the analyze page to open the player dashboard."
          }
        />
      </section>
    );
  }

  return (
    <section className="section-wrap mt-8 space-y-4 pb-16 sm:space-y-5 sm:pb-20">
      {loading && !payload ? <PlayerDashboardSkeleton /> : null}

      {!loading && error && !payload ? (
        <ErrorState
          title={locale === "fr" ? "Erreur de chargement" : "Loading error"}
          description={error}
          actionLabel={dict.common.retry}
          onRetry={() => loadPlayer(resolvedTag)}
        />
      ) : null}

      {payload ? (
        <>
          <article className="glass-panel px-4 py-5 sm:px-6">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">
              {dict.dashboard.profileHeader}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">
              {payload.player.name}
            </h1>
            <p className="mt-1 text-sm text-slate-300">{payload.player.tag}</p>
            {!payload.advancedTrackingEnabled ? (
              <a
                href={`${normalizeBasePath()}/${locale}/pro-tracking/`}
                className="mt-3 inline-flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-violet-200/35 bg-violet-300/10 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-200/15"
              >
                {dict.dashboard.unlockTracking}
              </a>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-300">{dict.common.trophies}</p>
                <p className="mt-1 font-display text-xl font-bold text-white">
                  {payload.player.trophies ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-300">{dict.common.bestTrophies}</p>
                <p className="mt-1 font-display text-xl font-bold text-white">
                  {payload.player.bestTrophies ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-300">{dict.common.arena}</p>
                <p className="mt-1 text-sm font-semibold text-white">{payload.player.arena.name ?? "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTrophyGraph((value) => !value)}
                className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 p-3 text-left transition hover:bg-cyan-300/15"
              >
                <p className="text-[11px] uppercase tracking-[0.1em] text-cyan-100/90">
                  {locale === "fr" ? "Graphique trophées" : "Trophies chart"}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {showTrophyGraph
                    ? locale === "fr"
                      ? "Masquer"
                      : "Hide"
                    : locale === "fr"
                      ? "Afficher"
                      : "Show"}
                </p>
              </button>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-300">{dict.dashboard.lastScan}</p>
                <p className="mt-1 text-xs text-white">{formatDateTime(payload.player.lastScanAt, locale)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-300">{dict.dashboard.nextScan}</p>
                <p className="mt-1 text-xs text-white">{formatDateTime(payload.player.nextScanAt, locale)}</p>
              </div>
            </div>

            {showTrophyGraph ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {locale === "fr" ? "Évolution des trophées" : "Trophies progression"}
                  </p>
                  <p className="text-xs text-slate-300">
                    {filteredTrophyHistory.length} {locale === "fr" ? "points" : "points"}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {TROPHY_WINDOWS.map((window) => (
                    <button
                      key={window.key}
                      type="button"
                      onClick={() => setTrophyWindow(window.key)}
                      className={`h-9 min-w-[44px] rounded-lg border px-3 text-xs font-semibold transition ${
                        trophyWindow === window.key
                          ? "border-cyan-300/50 bg-cyan-300/20 text-cyan-100"
                          : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {locale === "fr" ? window.labelFr : window.labelEn}
                    </button>
                  ))}
                </div>

                <p className="mt-3 text-xs text-slate-300">
                  {locale === "fr"
                    ? "Les données du graphe commencent à la première fois où ce tag a été scanné sur DeckRadar."
                    : "Chart data starts from the first time this tag was scanned on DeckRadar."}
                  {" "}
                  {trackedSinceAt ? (
                    <span>
                      {locale === "fr" ? "Premier scan:" : "First scan:"}{" "}
                      {formatDateTime(trackedSinceAt, locale)}
                    </span>
                  ) : null}
                </p>

                {filteredTrophyHistory.length >= 2 ? (
                  <div className="mt-3">
                    <svg viewBox="0 0 720 170" className="h-44 w-full" role="img" aria-label={locale === "fr" ? "Graphique de progression des trophées" : "Trophy progression chart"}>
                      <defs>
                        <linearGradient id="trophy-area-gradient-main" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
                          <stop offset="100%" stopColor="rgba(56,189,248,0.02)" />
                        </linearGradient>
                      </defs>
                      <path d={`M ${trophyChart.area}`} fill="url(#trophy-area-gradient-main)" />
                      <polyline
                        points={trophyChart.line}
                        fill="none"
                        stroke="rgba(34,211,238,0.95)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                      <span>{formatDateTime(filteredTrophyHistory[0]?.collectedAt, locale)}</span>
                      <span>
                        {locale === "fr" ? "Min" : "Min"} {trophyChart.min} • {locale === "fr" ? "Max" : "Max"} {trophyChart.max}
                      </span>
                      <span>
                        {formatDateTime(
                          filteredTrophyHistory[filteredTrophyHistory.length - 1]?.collectedAt,
                          locale
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-300">
                    {locale === "fr"
                      ? "Pas assez d'historique pour afficher la courbe. Lance plusieurs scans pour enrichir les snapshots."
                      : "Not enough history to draw a curve yet. Run more scans to enrich snapshots."}
                  </p>
                )}
              </div>
            ) : null}
          </article>

          <article className="glass-panel p-4 sm:p-5">
            <h2 className="font-display text-2xl font-bold text-white">{dict.dashboard.bestDeckNow}</h2>
            <p className="mt-1 text-sm text-slate-300">{dict.dashboard.bestDeckNowNote}</p>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-cyan-100/90">
                  {locale === "fr" ? "Meilleur deck de ta range actuelle" : "Best deck for your current range"}
                </p>
                {recommendedDeck ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <TrophyRangePill min={recommendedDeck.trophyMin} max={recommendedDeck.trophyMax} active />
                      <WinrateBadge value={recommendedDeck.winrate} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <DeckMini cardIds={recommendedDeck.cardIds} cardLookup={cardLookup} />
                      <GamesCount count={recommendedDeck.games} label={dict.dashboard.basedOnGames} />
                    </div>
                  </>
                ) : (
                  <div className="mt-3">
                    <EmptyState title={dict.common.noData} description={dict.dashboard.noRecommendedDeck} />
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-rose-100/90">
                  {locale === "fr" ? "Deck contre lequel tu perds le plus" : "Deck you lose to the most"}
                </p>
                {worstMatchupDeck ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-rose-200/40 bg-rose-200/10 px-3 py-1 text-sm font-semibold text-rose-100">
                        {worstMatchupDeck.lossRate === null ? "N/A" : `${worstMatchupDeck.lossRate.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <DeckMini cardIds={worstMatchupDeck.cardIds} cardLookup={cardLookup} />
                      <GamesCount count={worstMatchupDeck.games} label={dict.dashboard.basedOnGames} />
                    </div>
                  </>
                ) : (
                  <div className="mt-3">
                    <EmptyState
                      title={dict.common.noData}
                      description={
                        locale === "fr"
                          ? "Pas encore assez de combats contre un même deck pour établir ce classement."
                          : "Not enough repeated matchups against one deck to rank this yet."
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-300">
              {dict.dashboard.statsUpdatedAt} {formatDateTime(payload.statsUpdatedAt, locale)}
            </p>
          </article>

          <div className="md:hidden">
            <ResponsiveTabs
              tabs={[
                { id: "decks", label: dict.dashboard.tabs.decks },
                { id: "opponents", label: dict.dashboard.tabs.opponents },
                { id: "changes", label: dict.dashboard.tabs.changes }
              ]}
              activeId={mobileTab}
              onChange={(id) => setMobileTab(id as DashboardTab)}
            />

            <div className="mt-3">
              {mobileTab === "decks" ? (
                <div className="space-y-4">
                  {renderDecksVsAverage()}
                  {renderTrophyMap()}
                </div>
              ) : null}
              {mobileTab === "opponents" ? renderDirectOpponents() : null}
              {mobileTab === "changes" ? renderDeckChanges() : null}
            </div>
          </div>

          <div className="hidden md:grid md:grid-cols-2 md:gap-4">
            {renderDecksVsAverage()}
            {renderTrophyMap()}
          </div>

          <div className="hidden md:grid md:grid-cols-2 md:gap-4">
            {renderDirectOpponents()}
            {renderDeckChanges()}
          </div>
        </>
      ) : null}
    </section>
  );
}
