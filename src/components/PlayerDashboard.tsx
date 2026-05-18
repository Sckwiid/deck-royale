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

const buildBucketLabel = (min: number | null, max: number | null) => {
  if (min === null || max === null) {
    return "N/A";
  }
  return `${min} - ${max}`;
};

const deckKeyShort = (deckKey: string | null | undefined) => {
  if (!deckKey) return "N/A";
  return `${deckKey.slice(0, 8)}…`;
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

  const recommendedDeck = payload?.recommendedDecksForCurrentRange?.[0] ?? null;
  const rangeLabel = buildBucketLabel(payload?.trophyMap.bucketMin ?? null, payload?.trophyMap.bucketMax ?? null);

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

  const renderTrophyMap = () => (
    <section className="glass-panel p-4 sm:p-5">
      <h2 className="font-display text-2xl font-bold text-white">{dict.dashboard.trophyMap}</h2>

      {(payload?.trophyMap.ranges?.length ?? 0) === 0 ? (
        <div className="mt-4">
          <EmptyState title={dict.common.noData} description={dict.dashboard.noRecommendedDeck} />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {(payload?.trophyMap.ranges ?? []).map((lane) => {
            const active =
              typeof payload?.trophyMap.currentTrophies === "number" &&
              payload.trophyMap.currentTrophies >= lane.trophyMin &&
              payload.trophyMap.currentTrophies < lane.trophyMax;

            return (
              <article
                key={`${lane.trophyMin}-${lane.deckKey}`}
                className={`rounded-xl border p-3 ${
                  active ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-white/5"
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
    </section>
  );

  const renderDirectOpponents = () => (
    <section className="glass-panel p-4 sm:p-5">
      <h2 className="font-display text-2xl font-bold text-white">{dict.dashboard.directOpponents}</h2>

      {(payload?.directOpponents?.length ?? 0) > 0 ? (
        <div className="mt-4 space-y-2">
          {(payload?.directOpponents ?? []).map((opponent) => (
            <a
              key={opponent.tag}
              href={buildPlayerUrl(locale, opponent.tag)}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
            >
              <div>
                <p className="text-sm font-semibold text-white">{opponent.name || opponent.tag}</p>
                <p className="text-xs text-slate-300">{opponent.tag}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-cyan-200">{opponent.battles}</p>
                <p className="text-xs text-slate-300">
                  {formatDateTime(opponent.latestBattleAt, locale)}
                </p>
              </div>
            </a>
          ))}
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
          <EmptyState title={dict.common.noData} description={dict.dashboard.emptyDeckHistory} />
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
                  {change.oldDeckKey && (deckCardsByKey.get(change.oldDeckKey)?.length ?? 0) === 8 ? (
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
                  {(deckCardsByKey.get(change.newDeckKey)?.length ?? 0) === 8 ? (
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
            <a
              href={`${normalizeBasePath()}/${locale}/pro-tracking/`}
              className="mt-3 inline-flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-violet-200/35 bg-violet-300/10 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-200/15"
            >
              {dict.dashboard.unlockTracking}
            </a>

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
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-300">{dict.dashboard.currentRange}</p>
                <p className="mt-1 text-sm font-semibold text-white">{rangeLabel}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-300">{dict.dashboard.lastScan}</p>
                <p className="mt-1 text-xs text-white">{formatDateTime(payload.player.lastScanAt, locale)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-300">{dict.dashboard.nextScan}</p>
                <p className="mt-1 text-xs text-white">{formatDateTime(payload.player.nextScanAt, locale)}</p>
              </div>
            </div>
          </article>

          <article className="glass-panel p-4 sm:p-5">
            <h2 className="font-display text-2xl font-bold text-white">{dict.dashboard.bestDeckNow}</h2>
            <p className="mt-1 text-sm text-slate-300">{dict.dashboard.bestDeckNowNote}</p>

            {recommendedDeck ? (
              <div className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-300/10 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <TrophyRangePill min={recommendedDeck.trophyMin} max={recommendedDeck.trophyMax} active />
                  <WinrateBadge value={recommendedDeck.winrate} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <DeckMini cardIds={recommendedDeck.cardIds} cardLookup={cardLookup} />
                  <GamesCount count={recommendedDeck.games} label={dict.dashboard.basedOnGames} />
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState title={dict.common.noData} description={dict.dashboard.noRecommendedDeck} />
              </div>
            )}

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
