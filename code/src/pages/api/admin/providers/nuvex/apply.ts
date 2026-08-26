// POST /api/admin/providers/nuvex/apply
// Aplica un preview válido de Nuvex.
// Exige: admin + origen confiable + flag NUVEX_SYNC_APPLY_ENABLED === "true"
//        + preview firmado/no vencido/no usado + decisionSet validado contra el plan.
import { hasTrustedOrigin } from "@server/security/origin";
import { getAuthenticatedAdminId } from "@server/auth";
import { applyNuvexSync, type ApplyDecisionSet } from "@server/providers/nuvexSync";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseDecisionSet(body: any): ApplyDecisionSet | null {
  if (!body || typeof body !== "object") return null;
  const d = body.decisionSet as ApplyDecisionSet;
  if (!d || typeof d !== "object") return null;
  if (!Array.isArray(d.confirmedUpdates)) return null;
  if (typeof d.confirmedNameMatches !== "object" || d.confirmedNameMatches === null) return null;
  if (typeof d.temporaryPrices !== "object" || d.temporaryPrices === null) return null;
  if (!Array.isArray(d.deactivateIds)) return null;
  return d as ApplyDecisionSet;
}

export async function POST({ request }: { request: Request }) {
  if (!hasTrustedOrigin(request)) {
    return json({ ok: false, error: "Origen no permitido" }, 403);
  }

  const actor = await getAuthenticatedAdminId(request);
  if (!actor) {
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

  const decisionSet = parseDecisionSet(body);
  if (!decisionSet) {
    return json({ ok: false, error: "Falta decisionSet válido" }, 400);
  }

  try {
    const result = await applyNuvexSync(token, decisionSet, actor);
    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }
    return json(result);
  } catch (e: any) {
    console.error("nuvex apply error:", e?.message || e);
    return json({ ok: false, error: e?.message || "Error interno" }, 500);
  }
}
