// POST /api/admin/providers/martina/apply
// Aplica un preview válido de la sincronización Martina.
// Exige: admin + origen confiable + flag MARTINA_SYNC_APPLY_ENABLED === "true"
//        + preview firmado/no vencido + revalidación contra Martina.
import { hasTrustedOrigin } from "@server/security/origin";
import { verifyAdmin } from "@server/auth";
import { applyMartinaSync } from "@server/providers/martinaSync";

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

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const token = body?.token;
  if (!token || typeof token !== "string") {
    return json({ ok: false, error: "Falta el token de preview" }, 400);
  }

  try {
    const result = await applyMartinaSync(token);
    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }
    return json(result);
  } catch (e: any) {
    console.error("martina apply error:", e?.message || e);
    return json({ ok: false, error: e?.message || "Error interno" }, 500);
  }
}