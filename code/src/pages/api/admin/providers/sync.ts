import { syncAllProviders } from "../../../../server/providers/sync";
import { verifyAdmin } from "../../../../server/auth";
import { hasTrustedOrigin } from "../../../../server/security/origin";

export async function POST({ request }: { request: Request }) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  console.info(`[providers-sync] request=${requestId} start`);

  if (!hasTrustedOrigin(request)) {
    console.warn(`[providers-sync] request=${requestId} rejected reason=untrusted-origin`);
    return new Response(JSON.stringify({ error: "Origen no permitido" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (!await verifyAdmin(request)) {
    console.warn(`[providers-sync] request=${requestId} rejected reason=unauthorized`);
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await syncAllProviders();
    console.info(
      `[providers-sync] request=${requestId} done status=200 ` +
        `upserted=${result.totalUpserted} errors=${result.totalErrors} ` +
        `duration_ms=${Date.now() - startedAt}`,
    );
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error(
      `[providers-sync] request=${requestId} failed ` +
        `duration_ms=${Date.now() - startedAt} error=${e?.message || e}`,
      e,
    );
    return new Response(JSON.stringify({ error: e?.message || "Error interno" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
