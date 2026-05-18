export type SeoLocale = "fr" | "en";

export interface TrophyRange {
  min: number;
  max: number;
  slug: string;
}

const TROPHY_RANGE_START = 12000;
const TROPHY_RANGE_END = 13000;
const TROPHY_RANGE_STEP = 250;

export const generateTrophyRanges = (
  start = TROPHY_RANGE_START,
  end = TROPHY_RANGE_END,
  step = TROPHY_RANGE_STEP
): TrophyRange[] => {
  const ranges: TrophyRange[] = [];

  for (let min = start; min < end; min += step) {
    const max = min + step;
    ranges.push({
      min,
      max,
      slug: `${min}-${max}`
    });
  }

  return ranges;
};

export const TROPHY_ROAD_RANGES = generateTrophyRanges();

export const getTrophyRangeFromSlug = (slug: string) =>
  TROPHY_ROAD_RANGES.find((range) => range.slug === slug);

const formatTrophies = (locale: SeoLocale, value: number) =>
  new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US").format(value);

export const getRangeMetaTitle = (locale: SeoLocale, range: TrophyRange) => {
  const min = formatTrophies(locale, range.min);
  const max = formatTrophies(locale, range.max);

  if (locale === "fr") {
    return `Meilleur deck Clash Royale ${min}-${max} trophées | DeckRadar`;
  }

  return `Best Clash Royale Deck ${min}-${max} Trophies | DeckRadar`;
};

export const getRangeMetaDescription = (locale: SeoLocale, range: TrophyRange) => {
  const min = formatTrophies(locale, range.min);
  const max = formatTrophies(locale, range.max);

  if (locale === "fr") {
    return `Découvrez les decks Clash Royale les plus performants entre ${min} et ${max} trophées, avec winrate, nombre de games analysées et mise à jour automatique.`;
  }

  return `Discover the highest-performing Clash Royale decks between ${min} and ${max} trophies with win rate, games analyzed, and automatic daily updates.`;
};

export const getRangeHeading = (locale: SeoLocale, range: TrophyRange) => {
  const min = formatTrophies(locale, range.min);
  const max = formatTrophies(locale, range.max);

  if (locale === "fr") {
    return `Meilleurs decks Clash Royale entre ${min} et ${max} trophées`;
  }

  return `Best Clash Royale Decks Between ${min} and ${max} Trophies`;
};

export const getRangeIntro = (locale: SeoLocale, range: TrophyRange) => {
  const min = formatTrophies(locale, range.min);
  const max = formatTrophies(locale, range.max);

  if (locale === "fr") {
    return `Cette range ${min}-${max} correspond a un palier ou les details de rotation, la gestion des elixirs et les timings defensifs deviennent decisifs. DeckRadar met en avant les listes qui performent reellement sur cette tranche de trophies.`;
  }

  return `This ${min}-${max} bracket is where cycle precision, elixir pacing, and defense timing become decisive. DeckRadar highlights the deck lists that are actually winning in this trophy band.`;
};

export const getTrophyRoadHubTitle = (locale: SeoLocale) =>
  locale === "fr"
    ? "Deck Trophy Road Clash Royale par Range | DeckRadar"
    : "Clash Royale Trophy Road Decks by Range | DeckRadar";

export const getTrophyRoadHubDescription = (locale: SeoLocale) =>
  locale === "fr"
    ? "Explorez les meilleurs decks Clash Royale par range de trophies sur Trophy Road, avec winrates reels et volume de games analysees."
    : "Explore the best Clash Royale Trophy Road decks by trophy range with real win rates and analyzed game volume.";

export const getRankedMetaTitle = (locale: SeoLocale) =>
  locale === "fr"
    ? "Best Ranked Deck Clash Royale | DeckRadar"
    : "Best Ranked Deck Clash Royale | DeckRadar";

export const getRankedMetaDescription = (locale: SeoLocale) =>
  locale === "fr"
    ? "Consultez les decks ranked Clash Royale les plus performants selon les stats observees, avec winrate et nombre de games."
    : "Track the best performing Clash Royale ranked decks using observed win rates and total games.";

export const getRankedHeading = (locale: SeoLocale) =>
  locale === "fr"
    ? "Best Ranked Deck Clash Royale: top listes du moment"
    : "Best Ranked Deck Clash Royale: Top Lists Right Now";

export const getMetaHubTitle = (locale: SeoLocale) =>
  locale === "fr" ? "Meta Clash Royale et Decks par Trophies | DeckRadar" : "Clash Royale Meta and Decks by Trophy Range | DeckRadar";

export const getMetaHubDescription = (locale: SeoLocale) =>
  locale === "fr"
    ? "Accedez aux pages meta DeckRadar: Trophy Road par range de trophies, decks ranked et analyses orientees performance reelle."
    : "Access DeckRadar meta pages: Trophy Road by trophy range, ranked deck insights, and real-performance analysis.";

const resolveBasePathPrefix = () => {
  const base = (import.meta.env.BASE_URL as string | undefined) ?? "/";
  if (!base || base === "/") {
    return "";
  }
  return base.endsWith("/") ? base.slice(0, -1) : base;
};

const withBasePath = (path: string) => {
  const prefix = resolveBasePathPrefix();
  if (!prefix) return path;
  if (path === prefix || path.startsWith(`${prefix}/`)) {
    return path;
  }
  return `${prefix}${path}`;
};

export const buildTrophyRoadPath = (locale: SeoLocale, rangeSlug?: string) => {
  if (!rangeSlug) {
    return withBasePath(`/${locale}/meta/trophy-road/`);
  }
  return withBasePath(`/${locale}/meta/trophy-road/${rangeSlug}/`);
};

export const buildHomePath = (locale: SeoLocale) => withBasePath(`/${locale}/`);
export const buildMetaPath = (locale: SeoLocale) => withBasePath(`/${locale}/meta/`);
export const buildRankedPath = (locale: SeoLocale) => withBasePath(`/${locale}/meta/ranked/`);
export const buildAnalyzePath = (locale: SeoLocale) =>
  withBasePath(locale === "fr" ? "/fr/analyser/" : "/en/analyze/");
export const buildProTrackingPath = (locale: SeoLocale) => withBasePath(`/${locale}/pro-tracking/`);

export const getRangeNeighbors = (slug: string) => {
  const index = TROPHY_ROAD_RANGES.findIndex((range) => range.slug === slug);
  if (index < 0) {
    return { previous: null, next: null };
  }

  return {
    previous: index > 0 ? TROPHY_ROAD_RANGES[index - 1] : null,
    next: index < TROPHY_ROAD_RANGES.length - 1 ? TROPHY_ROAD_RANGES[index + 1] : null
  };
};

export const getRangeFaq = (locale: SeoLocale, range: TrophyRange) => {
  const min = formatTrophies(locale, range.min);
  const max = formatTrophies(locale, range.max);

  if (locale === "fr") {
    return [
      {
        question: `Comment choisir un deck entre ${min} et ${max} trophies ?`,
        answer:
          "Priorisez les decks avec un volume de games suffisant et un winrate stable. La regularite est souvent plus rentable qu'un deck tres niche."
      },
      {
        question: "A quelle frequence les stats DeckRadar sont-elles mises a jour ?",
        answer:
          "Les statistiques sont synchronisees automatiquement chaque jour pour suivre les evolutions de la meta et les changements de decks."
      },
      {
        question: "Pourquoi comparer mon deck a la moyenne de ma range ?",
        answer:
          "La comparaison permet d'identifier si vos resultats sont au-dessus ou en dessous des performances observees dans votre environnement reel de ladder."
      }
    ];
  }

  return [
    {
      question: `How do I choose a deck between ${min} and ${max} trophies?`,
      answer:
        "Focus on decks with enough sampled games and consistent win rates. Stability usually beats highly niche lists in real ladder progression."
    },
    {
      question: "How often are DeckRadar stats refreshed?",
      answer:
        "Stats are updated automatically every day to reflect meta shifts and ongoing deck usage changes."
    },
    {
      question: "Why compare my deck to my bracket average?",
      answer:
        "This helps you see whether your results are above or below the observed baseline in your current trophy environment."
    }
  ];
};

export const getRankedFaq = (locale: SeoLocale) => {
  if (locale === "fr") {
    return [
      {
        question: "Qu'est-ce qu'un best ranked deck sur DeckRadar ?",
        answer:
          "C'est un deck classe parmi les plus performants selon le winrate observe et le volume de games en mode competitif."
      },
      {
        question: "Le deck le plus joue est-il toujours le meilleur ?",
        answer:
          "Non. Un deck tres joue peut avoir un winrate moyen. DeckRadar combine volume et performance pour donner une lecture plus utile."
      },
      {
        question: "Puis-je utiliser ces decks en Trophy Road ?",
        answer:
          "Oui, mais validez toujours leur performance dans votre propre range de trophies via les pages Trophy Road par tranche de 250."
      }
    ];
  }

  return [
    {
      question: "What does best ranked deck mean on DeckRadar?",
      answer:
        "It refers to decks that rank highly based on observed win rate and solid game volume in competitive environments."
    },
    {
      question: "Is the most played deck always the best deck?",
      answer:
        "No. High usage can still mean average performance. DeckRadar combines usage depth and outcomes for a better signal."
    },
    {
      question: "Can I use ranked decks on Trophy Road?",
      answer:
        "Yes, but always validate them inside your own 250-trophy bracket using Trophy Road range pages."
    }
  ];
};
