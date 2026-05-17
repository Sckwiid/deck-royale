import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const hasSupabasePublicCredentials = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabasePublicCredentials) {
  console.warn(
    "Supabase public env vars missing. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in local env."
  );
}

export const supabase = hasSupabasePublicCredentials
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false
      }
    })
  : null;

export { hasSupabasePublicCredentials };
