import { getSupabaseAdmin } from "../../../../server/supabase";
import { syncAllProviders } from "../../../../server/providers/sync";

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

async function verifyAdmin(request: Request): Promise<boolean> {
  try {
    const token = getAuthToken(request);
    if (!token) return false;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    return !error && !!data?.user;
  } catch {
    return false;
  }
}

export async function POST({ request }: { request: Request }) {
  if (!await verifyAdmin(request)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await syncAllProviders();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("Provider sync error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
