export interface ProductVisit {
  productId: string;
  visits: number;
}

export function parseProductRoutes(rows: unknown): ProductVisit[] {
  if (!Array.isArray(rows)) return [];
  const parsed: ProductVisit[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const dimensions = row.dimensions;
    const path = typeof dimensions === "string"
      ? dimensions
      : Array.isArray(dimensions) ? dimensions[0]
      : dimensions && typeof dimensions === "object"
        ? (dimensions as Record<string, unknown>).clientRequestPath
        : row.clientRequestPath;
    const count = (row.sum as Record<string, unknown> | undefined)?.visits;
    const match = typeof path === "string" && path.match(/^\/producto\/([A-Za-z0-9_-]+)\/?$/);
    const visits = typeof count === "number" || (typeof count === "string" && count.trim() !== "")
      ? Number(count)
      : NaN;
    if (match && Number.isSafeInteger(visits) && visits > 0) {
      parsed.push({ productId: match[1], visits });
    }
  }
  return parsed;
}

export function aggregateProductVisits(rows: ProductVisit[]): ProductVisit[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row.productId !== "string" || !Number.isSafeInteger(row.visits) || row.visits <= 0) continue;
    totals.set(row.productId, (totals.get(row.productId) ?? 0) + row.visits);
  }
  return [...totals].map(([productId, visits]) => ({ productId, visits }))
    .sort((a, b) => b.visits - a.visits || a.productId.localeCompare(b.productId))
    .slice(0, 20);
}

export function buildAnalyticsQuery(zoneId: string, from: string, to: string) {
  return {
    query: `query FeaturedProductTraffic($zoneTag: string, $filter: filter) { viewer { zones(filter: { zoneTag: $zoneTag }) { httpRequestsAdaptiveGroups(limit: 10000, filter: $filter) { dimensions { clientRequestPath } sum { visits } } } } }`,
    variables: { zoneTag: zoneId, filter: { datetime_geq: from, datetime_lt: to, requestSource: "eyeball" } },
  };
}

const GENERIC_GRAPHQL_ERROR = "Cloudflare Analytics returned a GraphQL error.";

function sanitizedGraphqlDiagnostic(errors: unknown, token: string, zoneId: string): string {
  if (!Array.isArray(errors)) return GENERIC_GRAPHQL_ERROR;
  const messages = errors.slice(0, 3).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const message = (entry as Record<string, unknown>).message;
    if (typeof message !== "string") return [];
    let safe = message;
    for (const sensitive of [token, zoneId]) {
      if (sensitive) safe = safe.split(sensitive).join("REDACTED");
    }
    safe = safe
      .replace(/Bearer\s+\S+/gi, "Bearer REDACTED")
      .replace(/(?:api[_ -]?token|authorization|secret|credential)\s*[:=]?\s*\S+/gi, "REDACTED")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[^\p{L}\p{N} .,:_/-]/gu, "")
      .slice(0, 240)
      .trim();
    return safe ? [safe] : [];
  });
  return messages.length ? messages.join("; ").slice(0, 480) : GENERIC_GRAPHQL_ERROR;
}

export async function fetchFeaturedProductVisits(
  token: string | undefined,
  zoneId: string | undefined,
  fetcher: typeof fetch = fetch,
  now = new Date(),
  exposeDiagnostics = false,
): Promise<ProductVisit[]> {
  if (!token || !zoneId) {
    throw new Error("Cloudflare Analytics is not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID as server-side Worker secrets/vars.");
  }
  const to = now.toISOString();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const response = await fetcher("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(buildAnalyticsQuery(zoneId, from, to)),
  });
  if (!response.ok) throw new Error(`Cloudflare Analytics request failed (${response.status}). Check the token permissions, zone ID, and Analytics availability.`);
  const payload = await response.json() as any;
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    const detail = exposeDiagnostics ? sanitizedGraphqlDiagnostic(payload.errors, token, zoneId) : GENERIC_GRAPHQL_ERROR;
    if (exposeDiagnostics) console.error("Cloudflare Analytics GraphQL diagnostic:", detail);
    throw new Error(detail);
  }
  const groups = payload?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
  if (!Array.isArray(groups)) throw new Error("Cloudflare Analytics returned an unexpected response.");
  return aggregateProductVisits(parseProductRoutes(groups));
}

export function createFeaturedSuggestionsHandler(options: {
  verifyAdmin: (request: Request) => Promise<boolean>;
  fetcher?: typeof fetch;
  clock?: () => Date;
  resolveProducts?: (visits: ProductVisit[]) => Promise<unknown[]>;
  exposeDiagnostics?: boolean;
}) {
  return async (request: Request, env: { CLOUDFLARE_API_TOKEN?: string; CLOUDFLARE_ZONE_ID?: string }) => {
    if (!await options.verifyAdmin(request)) return Response.json({ error: "No autorizado" }, { status: 401 });
    try {
      const visits = await fetchFeaturedProductVisits(
        env.CLOUDFLARE_API_TOKEN,
        env.CLOUDFLARE_ZONE_ID,
        options.fetcher,
        options.clock?.(),
        options.exposeDiagnostics === true,
      );
      const products = options.resolveProducts ? await options.resolveProducts(visits) : visits;
      return Response.json({ data: products });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron obtener sugerencias.";
      return Response.json({ error: message }, { status: 503 });
    }
  };
}
