import { formatPlayerTag, normalizePlayerTag } from "./clash.ts";

const parseAllowlist = (raw: string): Set<string> => {
  const values = raw
    .split(/[\s,;|]+/g)
    .map((value) => value.trim())
    .filter(Boolean);

  const normalized = values
    .map((value) => normalizePlayerTag(value))
    .filter((value) => value.length > 0)
    .map((value) => formatPlayerTag(value));

  return new Set(normalized);
};

const resolveRawAllowlist = () =>
  (Deno.env.get("PRO_TRACKING_ALLOWLIST_TAGS") ??
    Deno.env.get("PRO_TRACKING_TAGS") ??
    Deno.env.get("ADVANCED_TRACKING_TAGS") ??
    "").trim();

export const getProTrackingAllowlist = () => parseAllowlist(resolveRawAllowlist());

export const hasAdvancedTrackingAccess = (rawTag: string) => {
  const normalized = normalizePlayerTag(rawTag);
  if (!normalized) {
    return false;
  }

  const canonicalTag = formatPlayerTag(normalized);
  return getProTrackingAllowlist().has(canonicalTag);
};
