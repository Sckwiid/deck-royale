import { formatPlayerTag, isValidPlayerTag, normalizePlayerTag } from "./clash.ts";

export interface ProContactBody {
  player_tag?: string;
  email?: string;
  discord?: string;
  message?: string;
  language?: "fr" | "en";
  consent_contact?: boolean;
  website?: string;
}

export interface NormalizedProContactPayload {
  playerTag: string;
  email: string | null;
  discord: string | null;
  message: string | null;
  language: "fr" | "en";
  consentContact: boolean;
  isSpamTrap: boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;

export const validateAndNormalizeProContact = (
  body: ProContactBody
): { ok: true; payload: NormalizedProContactPayload } | { ok: false; error: string } => {
  const honeypot = String(body?.website ?? "").trim();
  const isSpamTrap = honeypot.length > 0;

  const normalizedTag = normalizePlayerTag(String(body?.player_tag ?? ""));
  if (!isValidPlayerTag(String(body?.player_tag ?? ""))) {
    return { ok: false, error: "Invalid player_tag" };
  }

  const email = body?.email?.trim() || null;
  const discord = body?.discord?.trim() || null;
  const message = body?.message?.trim() || null;
  const language = body?.language === "en" ? "en" : "fr";
  const consentContact = body?.consent_contact === true;

  if (!consentContact) {
    return { ok: false, error: "consent_contact is required" };
  }

  if (!email && !discord) {
    return { ok: false, error: "email or discord is required" };
  }

  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: "Invalid email format" };
  }

  if (discord && discord.length > 80) {
    return { ok: false, error: "Discord handle too long" };
  }

  if (message && message.length > 1200) {
    return { ok: false, error: "Message is too long" };
  }

  return {
    ok: true,
    payload: {
      playerTag: formatPlayerTag(normalizedTag),
      email,
      discord,
      message,
      language,
      consentContact,
      isSpamTrap
    }
  };
};
