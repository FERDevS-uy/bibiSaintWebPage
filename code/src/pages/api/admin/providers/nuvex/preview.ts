// POST /api/admin/providers/nuvex/preview
// Preview read-only de la sincronización Nuvex:
//  - Autentica admin (getAuthenticatedAdminId) + origen confiable.
//  - Hace login server-side contra Nuvex, compara contra Supabase y genera un plan.
//  - NUNCA escribe en Supabase (solo lectura de comparación con service role).
import { hasTrustedOrigin } from "@server/security/origin";
import { getAuthenticatedAdminId } from "@server/auth";
import { generateNuvexPreview } from "@server/providers/nuvexSync";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST({ request }: { request: Request }) {
  if (!hasTrustedOrigin(request)) {
    return json({ ok: false, error: "Origen no permitido" }, 403);
  }

  const actor = await getAuthenticatedAdminId(request);
  if (!actor) {
    return json({ ok: false, error: "No autorizado" }, 401);
  }

  try {
    const preview = await generateNuvexPreview(actor);
    return json({
      ok: true,
      summary: preview.summary,
      plan: preview.plan,
      hash: preview.hash,
      token: preview.token,
      writeEnabled: preview.writeEnabled,
      expiresAt: preview.expiresAt,
      totalIncoming: preview.totalIncoming,
    });
  } catch (e: any) {
    console.error("nuvex preview error:", e?.message || e);
    return json({ ok: false, error: e?.message || "Error interno" }, 502);
  }
}
