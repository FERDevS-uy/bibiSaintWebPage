import { getSupabaseAdmin } from "./supabase";

const SUPABASE_PROJECT_REF = "deilsclvheqcrqswiafa";

function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const cookie = request.headers.get("Cookie") || "";
  const cookieName = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === cookieName) {
      return rest.join("=");
    }
  }

  return null;
}

export async function verifyAdmin(request: Request): Promise<boolean> {
  try {
    const token = getAuthToken(request);
    if (!token) {
      console.warn("[auth] No auth token found in request");
      return false;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("[auth] getUser error:", error.message);
      return false;
    }

    const userId = data?.user?.id;
    if (!userId) {
      console.warn("[auth] No user in token");
      return false;
    }

    const { data: adminProfile } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!adminProfile) {
      console.warn("[auth] User not in admin_profiles:", userId);
    }

    return !!adminProfile;
  } catch (e: any) {
    console.error("[auth] verifyAdmin exception:", e?.message || e);
    return false;
  }
}
