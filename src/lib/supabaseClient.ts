import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const hasSupabasePublicCredentials = Boolean(supabaseUrl && supabaseAnonKey);
let browserSupabaseClient: ReturnType<typeof createClient> | null = null;

if (!hasSupabasePublicCredentials) {
  console.warn(
    "Supabase public env vars missing. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in local env."
  );
}

export const getSupabaseClient = () => {
  if (!hasSupabasePublicCredentials) {
    throw new Error(
      "Supabase public env vars are missing. Configure PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  // Prevent SSR/build-time initialization in Node (GitHub Pages workflow).
  if (typeof window === "undefined") {
    throw new Error("Supabase browser client cannot be initialized during SSR/build.");
  }

  if (!browserSupabaseClient) {
    browserSupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false
      }
    });
  }

  return browserSupabaseClient;
};

export { hasSupabasePublicCredentials };
