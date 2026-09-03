import { getAuthenticatedAdminId } from "../../../../server/auth";
import { hasTrustedOrigin } from "../../../../server/security/origin";
import { isNuvexCatalogEnabled, setNuvexCatalogEnabled } from "../../../../server/providers/catalogSettings";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function GET({ request }: { request: Request }) {
  const actor = await getAuthenticatedAdminId(request);
  if (!actor) return json({ ok: false, error: "No autorizado" }, 401);
  try {
    return json({ ok: true, nuvexEnabled: await isNuvexCatalogEnabled() });
  } catch (error: any) {
    return json({ ok: false, error: error?.message || "Error interno" }, 500);
  }
}

export async function POST({ request }: { request: Request }) {
  if (!hasTrustedOrigin(request)) return json({ ok: false, error: "Origen no permitido" }, 403);
  const actor = await getAuthenticatedAdminId(request);
  if (!actor) return json({ ok: false, error: "No autorizado" }, 401);

  let body: any;
  try { body = await request.json(); } catch { body = null; }
  if (typeof body?.enabled !== "boolean") return json({ ok: false, error: "enabled debe ser booleano" }, 400);

  try {
    const result = await setNuvexCatalogEnabled(body.enabled);
    return json({ ok: true, ...result });
  } catch (error: any) {
    return json({ ok: false, error: error?.message || "Error interno" }, 500);
  }
}
