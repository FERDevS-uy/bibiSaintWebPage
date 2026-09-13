import {
  ProviderPreviewTokenError,
  syncAllProviders,
} from "../../../../server/providers/sync";
import type { CatalogCacheEnv } from "../../../../server/catalog/edgeCache";
import { verifyAdmin } from "../../../../server/auth";
import { hasTrustedOrigin } from "../../../../server/security/origin";

export async function POST({
  request,
  locals,
}: {
  request: Request;
  locals: {
    runtime?: {
      env?: CatalogCacheEnv;
      ctx?: { waitUntil?: (promise: Promise<unknown>) => void };
    };
  };
}) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  console.info(`[providers-sync] request=${requestId} start`);

  if (!hasTrustedOrigin(request)) {
    console.warn(
      `[providers-sync] request=${requestId} rejected reason=untrusted-origin`,
    );
    return new Response(JSON.stringify({ error: "Origen no permitido" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (!(await verifyAdmin(request))) {
    console.warn(
      `[providers-sync] request=${requestId} rejected reason=unauthorized`,
    );
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      token?: unknown;
    } | null;
    if (typeof body?.token !== "string" || !body.token) {
      return new Response(
        JSON.stringify({ error: "Falta el resumen confirmado" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      );
    }
    const run = syncAllProviders(body.token, {
      kv: locals.runtime?.env?.CATALOG_KV,
    });
    const waitUntil = locals.runtime?.ctx?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil(
        run
          .then((result) => {
            console.info(
              `[providers-sync] request=${requestId} background-done ` +
                `upserted=${result.totalUpserted} errors=${result.totalErrors}`,
            );
          })
          .catch((error: unknown) => {
            console.error(
              `[providers-sync] request=${requestId} background-failed`,
              error,
            );
          }),
      );
      return new Response(
        JSON.stringify({
          accepted: true,
          message:
            "La sincronización comenzó. Podés seguir navegando; el proceso continuará en segundo plano.",
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      );
    }

    const result = await run;
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
    return new Response(
      JSON.stringify({ error: e?.message || "Error interno" }),
      {
        status: e instanceof ProviderPreviewTokenError ? 400 : 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
