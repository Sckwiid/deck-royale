const CLASH_API_BASE_DEFAULT = "https://proxy.royaleapi.dev/v1";
const CLASH_API_BASE = Deno.env.get("CLASH_API_BASE_URL") ?? CLASH_API_BASE_DEFAULT;
const TAG_RE = /[^0289PYLQGRJCUV]/g;
const PLAYER_TAG_MIN_LENGTH = 3;
const PLAYER_TAG_MAX_LENGTH = 15;
const BASE_SANITIZED = CLASH_API_BASE.replace(/\/+$/, "");

export interface ClashCardRef {
  id: number;
  name?: string;
  maxLevel?: number;
  elixirCost?: number;
  iconUrls?: {
    medium?: string;
  };
}

export interface ClashPlayerProfile {
  tag: string;
  name: string;
  trophies?: number;
  bestTrophies?: number;
  wins?: number;
  losses?: number;
  battleCount?: number;
  arena?: {
    id?: number;
    name?: string;
  };
  currentDeck?: ClashCardRef[];
}

export interface ClashBattleParticipant {
  tag?: string;
  name?: string;
  crowns?: number;
  startingTrophies?: number;
  trophies?: number;
  cards?: ClashCardRef[];
}

export interface ClashBattle {
  type?: string;
  battleTime?: string;
  arena?: {
    id?: number;
    name?: string;
  };
  gameMode?: {
    id?: number;
    name?: string;
  };
  team?: ClashBattleParticipant[];
  opponent?: ClashBattleParticipant[];
  teamCrowns?: number;
  opponentCrowns?: number;
}

export interface ClashCardsResponse {
  items: Array<{
    id: number;
    name: string;
    rarity?: string;
    maxLevel?: number;
    elixirCost?: number;
    iconUrls?: {
      medium?: string;
    };
  }>;
}

export class ClashApiError extends Error {
  status: number;
  details: string;

  constructor(status: number, details: string) {
    super(`Clash API error ${status}: ${details}`);
    this.name = "ClashApiError";
    this.status = status;
    this.details = details;
  }
}

const decodeTagInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
};

export const normalizePlayerTag = (value: string) =>
  decodeTagInput(value)
    .toUpperCase()
    .replace(/^%23/i, "")
    .replace(/^#+/, "")
    .replace(TAG_RE, "");

export const isValidPlayerTag = (value: string) => {
  const clean = normalizePlayerTag(value);
  return clean.length >= PLAYER_TAG_MIN_LENGTH && clean.length <= PLAYER_TAG_MAX_LENGTH;
};

export const formatPlayerTag = (value: string) => `#${normalizePlayerTag(value)}`;

export const encodePlayerTag = (value: string) => encodeURIComponent(formatPlayerTag(value));

export const parseClashBattleTime = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?Z$/);
  if (!match) {
    const fallbackDate = new Date(value);
    return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate.toISOString();
  }

  const [, year, month, day, hour, minute, second, milli = "000"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${milli.padEnd(3, "0")}Z`;
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getClashApiToken = () => {
  const token = Deno.env.get("CLASH_ROYALE_API_TOKEN") ?? "";
  if (!token) {
    throw new Error("CLASH_ROYALE_API_TOKEN is not configured");
  }
  return token;
};

export const fetchClashApi = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${BASE_SANITIZED}${path}`, {
    headers: {
      Authorization: `Bearer ${getClashApiToken()}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ClashApiError(response.status, message);
  }

  return (await response.json()) as T;
};

export const getPlayer = (tag: string) =>
  fetchClashApi<ClashPlayerProfile>(`/players/${encodePlayerTag(tag)}`);

export const getPlayerBattlelog = (tag: string) =>
  fetchClashApi<ClashBattle[]>(`/players/${encodePlayerTag(tag)}/battlelog`);

export const getPlayerBattleLog = getPlayerBattlelog;

export const getPlayerUpcomingChests = (tag: string) =>
  fetchClashApi<{ items: unknown[] }>(`/players/${encodePlayerTag(tag)}/upcomingchests`);

export const getCards = () => fetchClashApi<ClashCardsResponse>("/cards");

export const localizeClashApiError = (
  error: unknown,
  lang: "fr" | "en"
): { status: number; message: string; code: string } | null => {
  if (!(error instanceof ClashApiError)) {
    return null;
  }

  if (error.status === 403) {
    return {
      status: 403,
      code: "CLASH_AUTH_OR_IP",
      message:
        lang === "fr"
          ? "Cle Clash Royale invalide ou IP non whitelistee. Verifiez la cle et l'IP 45.79.218.79 dans le dashboard developpeur."
          : "Invalid Clash Royale key or non-whitelisted IP. Verify your key and the 45.79.218.79 IP in the developer dashboard."
    };
  }

  if (error.status === 404) {
    return {
      status: 404,
      code: "PLAYER_NOT_FOUND",
      message:
        lang === "fr"
          ? "Joueur introuvable. Verifiez le tag Clash Royale."
          : "Player not found. Check the Clash Royale tag."
    };
  }

  if (error.status === 429) {
    return {
      status: 429,
      code: "CLASH_RATE_LIMIT",
      message:
        lang === "fr"
          ? "Limite de requetes atteinte cote API Clash Royale. Reessayez dans quelques instants."
          : "Clash Royale API rate limit reached. Try again in a moment."
    };
  }

  if (error.status === 502 || error.status === 503) {
    return {
      status: error.status,
      code: "CLASH_PROXY_UNAVAILABLE",
      message:
        lang === "fr"
          ? "Le proxy RoyaleAPI est temporairement indisponible. Reessayez dans quelques instants."
          : "RoyaleAPI proxy is temporarily unavailable. Try again in a moment."
    };
  }

  return {
    status: 502,
    code: "CLASH_API_ERROR",
    message:
      lang === "fr"
        ? "Erreur temporaire lors de la récupération des données Clash Royale."
        : "Temporary error while fetching Clash Royale data."
  };
};
