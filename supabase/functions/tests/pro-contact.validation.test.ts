import {
  validateAndNormalizeProContact
} from "../_shared/proContactValidation.ts";
import {
  assertEquals,
  assert
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("validateAndNormalizeProContact accepts valid payload", () => {
  const result = validateAndNormalizeProContact({
    player_tag: "#2PP",
    email: "player@example.com",
    discord: "Player#1234",
    message: "Je veux un suivi plus fréquent.",
    language: "fr",
    consent_contact: true
  });

  assert(result.ok);
  if (!result.ok) return;

  assertEquals(result.payload.playerTag, "#2PP");
  assertEquals(result.payload.language, "fr");
  assertEquals(result.payload.isSpamTrap, false);
});

Deno.test("validateAndNormalizeProContact rejects missing contact", () => {
  const result = validateAndNormalizeProContact({
    player_tag: "#2PP",
    language: "en",
    consent_contact: true
  });

  assertEquals(result.ok, false);
  if (result.ok) return;

  assertEquals(result.error, "email or discord is required");
});

Deno.test("validateAndNormalizeProContact rejects missing consent", () => {
  const result = validateAndNormalizeProContact({
    player_tag: "#2PP",
    email: "player@example.com"
  });

  assertEquals(result.ok, false);
  if (result.ok) return;

  assertEquals(result.error, "consent_contact is required");
});

Deno.test("validateAndNormalizeProContact flags honeypot submissions", () => {
  const result = validateAndNormalizeProContact({
    player_tag: "#2PP",
    email: "player@example.com",
    consent_contact: true,
    website: "https://spam.example"
  });

  assert(result.ok);
  if (!result.ok) return;

  assertEquals(result.payload.isSpamTrap, true);
});

