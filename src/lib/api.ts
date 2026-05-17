import { hasSupabasePublicCredentials, supabase } from "@/lib/supabaseClient";
import type { AnalyzePlayerResponse } from "@/types";

const ensureSupabaseClient = () => {
  if (!supabase || !hasSupabasePublicCredentials) {
    throw new Error(
      "Supabase public env vars are missing. Configure PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return supabase;
};

interface AnalyzePlayerInput {
  tag: string;
  lang?: "fr" | "en";
}

export const analyzePlayer = async (input: AnalyzePlayerInput): Promise<AnalyzePlayerResponse> => {
  const client = ensureSupabaseClient();
  const { data, error } = await client.functions.invoke("analyze-player", {
    body: input
  });

  if (error) {
    throw error;
  }

  return data as AnalyzePlayerResponse;
};

interface ProContactInput {
  player_tag: string;
  email?: string;
  discord?: string;
  message?: string;
  language?: "fr" | "en";
  consent_contact: boolean;
  website?: string;
}

export const submitProContact = async (input: ProContactInput) => {
  const client = ensureSupabaseClient();
  const { data, error } = await client.functions.invoke("pro-contact", {
    body: input
  });

  if (error) {
    throw error;
  }

  return data as { ok: boolean };
};
