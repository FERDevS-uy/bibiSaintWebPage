import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (import.meta.env.SUPABASE_URL as string | undefined) ||
  (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);

const SUPABASE_ANON_KEY =
  (import.meta.env.SUPABASE_ANON_KEY as string | undefined) ||
  (typeof process !== "undefined" ? process.env.SUPABASE_ANON_KEY : undefined);

let client: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (client) return client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in your env",
    );
  }

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  });

  return client;
}

export function getSupabaseAdmin() {
  const serviceKey =
    (import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) ||
    (typeof process !== "undefined" ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined);
  
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  const url = SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL not configured");
  }

  return createClient(
    url,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
