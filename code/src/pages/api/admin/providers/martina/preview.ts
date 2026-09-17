// POST /api/admin/providers/martina/preview
// Preview read-only de la sincronización Martina:
//  - Autentica admin + origen confiable.
//  - Consulta campaña + catálogo y genera un plan firmado (create/update/unchanged).
//  - NUNCA escribe; lee el estado administrativo completo.
import { hasTrustedOrigin } from "@server/security/origin";
import { verifyAdmin } from "@server/auth";
import { generatePreview, getMartinaAssignableSubcategories, MARTINA_ALLOWED_SOURCE_CATEGORIES, type MartinaCategoryOverride } from "@server/providers/martinaSync";

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

  // Per-item category map (id -> existing category name). The global
  // "category" selector was superseded by the per-item assign control: the
  // map travels signed inside the preview token and apply revalidates it.
  // The server also validates the destination against the current Ropa >
  // Mujer/Hombre subcategories and scopes every override to a new discrepant row.
  let categoryOverrides: Record<string, MartinaCategoryOverride> = {};
  try {
    const body = await request.json();
    if (body?.overrides !== undefined) {
      if (body.overrides === null || typeof body.overrides !== "object" || Array.isArray(body.overrides)) {
        return json({ ok: false, error: "Mapa de categorías por ítem inválido" }, 400);
      }
      categoryOverrides = body.overrides;
    }
  } catch {
    // An empty body means no per-item decisions yet.
  }

  try {
    const assignableSubcategories = await getMartinaAssignableSubcategories();
    const preview = await generatePreview(categoryOverrides, [...MARTINA_ALLOWED_SOURCE_CATEGORIES], assignableSubcategories);

    const changed = preview.plan.filter((item) => item.action !== "unchanged");
    const plan = changed;
    const truncated = false;

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