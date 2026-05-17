const CLASH_API_BASE =
  (Deno.env.get("CLASH_API_BASE_URL") ?? "https://proxy.royaleapi.dev/v1").replace(/\/+$/, "");
const TAG_RE = /[^0289PYLQGRJCUV]/g;
const PLAYER_TAG_MIN_LENGTH = 3;
const PLAYER_TAG_MAX_LENGTH = 15;

export const normalizePlayerTag = (value: string) => {
  let decoded = value.trim();
  if (!decoded) {
    return "";
  }

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // keep original string
  }

  const clean = decoded.toUpperCase().replace(/^%23/i, "").replace(/^#+/, "").replace(TAG_RE, "");
  return clean;
};

export const isValidPlayerTag = (value: string) => {
  const clean = normalizePlayerTag(value);
  return clean.length >= PLAYER_TAG_MIN_LENGTH && clean.length <= PLAYER_TAG_MAX_LENGTH;
};

export const formatPlayerTag = (value: string) => `#${normalizePlayerTag(value)}`;

export const fetchClashApi = async <T>(path: string): Promise<T> => {
  const token = Deno.env.get("CLASH_ROYALE_API_TOKEN");

  if (!token) {
    throw new Error("CLASH_ROYALE_API_TOKEN is not configured");
  }

  const response = await fetch(`${CLASH_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Clash API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
};
