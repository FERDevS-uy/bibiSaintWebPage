import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (import.meta.env.PUBLIC_SUPABASE_URL as string) ||
  (import.meta.env.SUPABASE_URL as string) ||
  "";

const SUPABASE_ANON_KEY =
  (import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string) ||
  (import.meta.env.SUPABASE_ANON_KEY as string) ||
  "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});
