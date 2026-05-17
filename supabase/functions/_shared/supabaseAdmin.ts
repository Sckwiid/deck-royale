import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

let adminClient: SupabaseClient | null = null;

export const getSupabaseAdmin = () => {
  if (adminClient) {
    return adminClient;
  }

  const projectUrl = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey =
    Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!projectUrl || !serviceRoleKey) {
    throw new Error("PROJECT_URL or SERVICE_ROLE_KEY is missing");
  }

  adminClient = createClient(projectUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return adminClient;
};
