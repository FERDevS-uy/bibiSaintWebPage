import { previewAllProviders } from "../../../../server/providers/sync";
import { verifyAdmin } from "../../../../server/auth";
import { hasTrustedOrigin } from "../../../../server/security/origin";

export async function POST({ request }: { request: Request }) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  console.info(`[providers-preview] request=${requestId} start`);

  if (!hasTrustedOrigin(request)) {
    console.warn(
      `[providers-preview] request=${requestId} rejected reason=untrusted-origin`,
    );
    return new Response(JSON.stringify({ error: "Origen no permitido" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (!(await verifyAdmin(request))) {
    console.warn(
      `[providers-preview] request=${requestId} rejected reason=unauthorized`,
    );
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await previewAllProviders();
    console.info(
      `[providers-preview] request=${requestId} done status=200 ` +
        `total=${result.totalProducts} new=${result.totalNew} ` +
        `price_changes=${result.totalPriceChanges} duration_ms=${Date.now() - startedAt}`,
    );
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error || "Error interno");
    console.error(
      `[providers-preview] request=${requestId} failed duration_ms=${Date.now() - startedAt} error=${message}`,
      error,
    );
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
