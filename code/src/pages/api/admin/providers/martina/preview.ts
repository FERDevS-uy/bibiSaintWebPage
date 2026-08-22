// POST /api/admin/providers/martina/preview
// Preview read-only de la sincronización Martina:
//  - Autentica admin + origen confiable.
//  - Consulta campaña + catálogo y genera un plan firmado (create/update/unchanged).
//  - NUNCA escribe y NO usa service role (DryRunProductRepository).
import { hasTrustedOrigin } from "@server/security/origin";
import { verifyAdmin } from "@server/auth";
import { generatePreview } from "@server/providers/martinaSync";

const MAX_PLAN_ITEMS = 200;

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

  if (!(await verifyAdmin(request))) {
    return json({ ok: false, error: "No autorizado" }, 401);
  }

  try {
    const preview = await generatePreview();

    // Plan compacto: priorizamos acciones con cambios y limitamos el detalle
    // para no mandar el catálogo completo (resumen + detalle).
    const changed = preview.plan.filter((item) => item.action !== "unchanged");
    const plan = changed.slice(0, MAX_PLAN_ITEMS);
    const truncated = changed.length > MAX_PLAN_ITEMS;

    return json({
      ok: true,
      campaign: preview.campaign,
      summary: preview.summary,
      plan,
      totalItems: preview.plan.length,
      changedCount: changed.length,
      truncated,
      hash: preview.hash,
      token: preview.token,
      writeEnabled: preview.writeEnabled,
      expiresAt: preview.expiresAt,
    });
  } catch (e: any) {
    console.error("martina preview error:", e?.message || e);
    return json({ ok: false, error: e?.message || "Error interno" }, 502);
  }
}