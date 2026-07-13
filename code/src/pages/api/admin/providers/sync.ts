import { syncAllProviders } from "../../../../server/providers/sync";
import { verifyAdmin } from "../../../../server/auth";
import { hasTrustedOrigin } from "../../../../server/security/origin";

export async function POST({ request }: { request: Request }) {
  if (!hasTrustedOrigin(request)) {
    return new Response(JSON.stringify({ error: "Origen no permitido" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

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
