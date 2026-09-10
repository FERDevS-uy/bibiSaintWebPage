import { getAuthenticatedAdminId } from "../../../../server/auth";
import { hasTrustedOrigin } from "../../../../server/security/origin";
import { getSupabaseAdmin } from "../../../../server/supabase";
import {
  getAllProviderMarkups,
  invalidateProviderMarkupCache,
} from "../../../../server/providers/markupSettings";
import { DEFAULT_PROVIDER_MARKUP } from "../../../../config/providerMargins";
import {
  buildEditableMarkupRows,
  isEditableMarkupProvider,
} from "../../../../server/providers/markupPolicy";

const MAX_MARKUP = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** GET: defaults + what is stored in DB (values only includes DB rows; absent = default). */
export async function GET({ request }: { request: Request }) {
  const actor = await getAuthenticatedAdminId(request);
  if (!actor) return json({ ok: false, error: "No autorizado" }, 401);

  try {
    const effective = await getAllProviderMarkups();
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("provider_catalog_settings")
      .select("provider_key, markup");
    if (error) throw new Error(error.message);

    const values: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{
      provider_key?: string;
      markup?: unknown;
    }>) {
      const key = row?.provider_key;
      if (isEditableMarkupProvider(key) && row.markup != null) {
        values[key] = Number(row.markup);
      }
    }

    return json({
      ok: true,
      defaults: DEFAULT_PROVIDER_MARKUP,
      values,
      effective,
    });
  } catch (error: any) {
    return json({ ok: false, error: error?.message || "Error interno" }, 500);
  }
}

/**
 * POST: upsert margins per provider. Body: { markup: Record<string, number> }
 * with provider keys from the known set. Markup must be > 0 and <= 5.
 */
export async function POST({ request }: { request: Request }) {
  if (!hasTrustedOrigin(request))
    return json({ ok: false, error: "Origen no permitido" }, 403);
  const actor = await getAuthenticatedAdminId(request);
  if (!actor) return json({ ok: false, error: "No autorizado" }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const rawMarkup = body?.markup;
  if (!rawMarkup || typeof rawMarkup !== "object" || Array.isArray(rawMarkup)) {
    return json(
      { ok: false, error: "markup debe ser un objeto { provider: number }" },
      400,
    );
  }

  const parsed = buildEditableMarkupRows(
    rawMarkup as Record<string, unknown>,
    MAX_MARKUP,
  );
  if ("error" in parsed) return json({ ok: false, error: parsed.error }, 400);
  const { rows } = parsed;
  if (rows.length === 0) {
    return json({ ok: false, error: "No se envió ningún markup válido" }, 400);
  }

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("provider_catalog_settings")
      .upsert(rows as never, { onConflict: "provider_key" });
    if (error) throw new Error(error.message);

    invalidateProviderMarkupCache();
    return json({ ok: true, saved: rows.length });
  } catch (error: any) {
    return json({ ok: false, error: error?.message || "Error interno" }, 500);
  }
}
