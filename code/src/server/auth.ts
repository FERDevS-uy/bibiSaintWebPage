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

export async function getAuthenticatedAdminId(request: Request): Promise<string | null> {
  try {
    const token = getAuthToken(request);
    if (!token) {
      console.warn("[auth] No auth token found in request");
      return null;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("[auth] getUser error:", error.message);
      return null;
    }

    const userId = data?.user?.id;
    if (!userId) {
      console.warn("[auth] No user in token");
      return null;
    }

    const { data: adminProfile } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!adminProfile) {
      console.warn("[auth] User not in admin_profiles:", userId);
    }

    return adminProfile ? userId : null;
  } catch (e: any) {
    console.error("[auth] getAuthenticatedAdminId exception:", e?.message || e);
    return null;
  }
}

export async function verifyAdmin(request: Request): Promise<boolean> {
  return (await getAuthenticatedAdminId(request)) !== null;
}
