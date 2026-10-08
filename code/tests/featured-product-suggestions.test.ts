import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseProductRoutes,
  aggregateProductVisits,
  createFeaturedSuggestionsHandler,
  fetchFeaturedProductVisits,
} from "../src/server/cloudflareAnalytics.ts";

test("Cloudflare analytics maps only product routes and aggregates visits by product", () => {
  const rows = [
    { dimensions: ["/producto/sku-2"], sum: { visits: "7" } },
    { dimensions: ["/producto/sku-1"], sum: { visits: 3 } },
    { dimensions: ["/producto/sku-2/"], sum: { visits: 5 } },
    { dimensions: ["/producto/sku-2?ref=home"], sum: { visits: 100 } },
    { dimensions: ["/categoria/hogar"], sum: { visits: 200 } },
    { dimensions: ["/producto/"], sum: { visits: 99 } },
    { dimensions: ["/producto/unsafe"], sum: { visits: "9007199254740992" } },
    { dimensions: ["/producto/nan"], sum: { visits: "not-a-number" } },
  ];

  const visits = aggregateProductVisits(parseProductRoutes(rows));
  assert.deepEqual(visits, [
    { productId: "sku-2", visits: 12 },
    { productId: "sku-1", visits: 3 },
  ]);
});

test("analytics query requests the trailing 30 days and maps route dimensions", async () => {
  let sent: any;
  const now = new Date("2026-11-18T12:00:00.000Z");
  const visits = await fetchFeaturedProductVisits("secret", "zone", async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [
      { dimensions: { clientRequestPath: "/producto/p-1" }, sum: { visits: 6 } },
      { dimensions: { clientRequestPath: "/about" }, sum: { visits: 100 } },
    ] }] } } });
  }, now);
  assert.equal(sent.variables.zoneTag, "zone");
  assert.deepEqual(sent.variables.filter, {
    datetime_geq: "2026-10-19T12:00:00.000Z",
    datetime_lt: now.toISOString(),
    requestSource: "eyeball",
  });
  assert.match(sent.query, /\$zoneTag:\s*string\s*,\s*\$filter:\s*filter/);
  assert.match(sent.query, /filter:\s*\$filter/);
  assert.match(sent.query, /sum\s*\{\s*visits\s*\}/);
  assert.doesNotMatch(sent.query, /\$from:\s*Time|\$to:\s*Time/);
  assert.deepEqual(visits, [{ productId: "p-1", visits: 6 }]);
});

test("suggestion handler checks admin before any Cloudflare request", async () => {
  let calls = 0;
  const handler = createFeaturedSuggestionsHandler({
    verifyAdmin: async () => false,
    fetcher: async () => { calls++; return Response.json({}); },
  });
  const response = await handler(new Request("https://store.test/api/admin/featured-suggestions"), {
    CLOUDFLARE_API_TOKEN: "token", CLOUDFLARE_ZONE_ID: "zone",
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("admin UI requests analytics only from the explicit suggestions button", () => {
  const source = readFileSync(new URL("../src/components/admin/ProductList.tsx", import.meta.url), "utf8");
  const initialEffect = source.match(/React\.useEffect\(\(\) => \{([\s\S]*?)\}, \[\]\);/)?.[1] ?? "";
  assert.doesNotMatch(initialEffect, /getFeaturedSuggestions|featured-suggestions/);
  assert.match(source, /onClick=\{loadSuggestions\}[\s\S]*?✨ Obtener sugerencias/);
  assert.match(source, /getFeaturedSuggestions\(\)/);
  assert.match(source, /Sugerencias de productos destacados/);
  assert.match(source, /<span className="featured-panel__rank">Puesto \{index \+ 1\}<\/span>/);
  assert.match(source, /<strong className="featured-panel__name">\{product\.name\}<\/strong>/);
});

test("missing Cloudflare credentials fail clearly without requesting analytics", async () => {
  let calls = 0;
  const handler = createFeaturedSuggestionsHandler({
    verifyAdmin: async () => true,
    fetcher: async () => { calls++; return Response.json({}); },
  });
  const response = await handler(new Request("https://store.test/api/admin/featured-suggestions"), {});
  const body = await response.json() as { error: string };
  assert.equal(response.status, 503);
  assert.match(body.error, /CLOUDFLARE_API_TOKEN.*CLOUDFLARE_ZONE_ID/);
  assert.equal(calls, 0);
});


test("development diagnostics expose sanitized GraphQL error messages", async () => {
  const handler = createFeaturedSuggestionsHandler({
    verifyAdmin: async () => true,
    exposeDiagnostics: true,
    fetcher: async () => Response.json({ errors: [{ message: "Unknown field httpRequestsAdaptiveGroups for token secret-token-123", path: ["viewer", "zones"] }] }),
  });
  const response = await handler(new Request("https://store.test/api/admin/featured-suggestions"), {
    CLOUDFLARE_API_TOKEN: "secret-token-123", CLOUDFLARE_ZONE_ID: "zone-secret-9",
  });
  const body = await response.json() as { error: string };
  assert.equal(response.status, 503);
  assert.match(body.error, /Unknown field httpRequestsAdaptiveGroups/);
  assert.doesNotMatch(body.error, /secret-token-123|zone-secret-9/);
});

test("GraphQL errors remain generic unless diagnostics are explicitly enabled", async () => {
  const handler = createFeaturedSuggestionsHandler({
    verifyAdmin: async () => true,
    fetcher: async () => Response.json({ errors: [{ message: "Permission denied for field httpRequestsAdaptiveGroups" }] }),
  });
  const response = await handler(new Request("https://store.test/api/admin/featured-suggestions"), {
    CLOUDFLARE_API_TOKEN: "token", CLOUDFLARE_ZONE_ID: "zone",
  });
  const body = await response.json() as { error: string };
  assert.equal(response.status, 503);
  assert.match(body.error, /GraphQL error/);
  assert.doesNotMatch(body.error, /Permission denied/);
});

test("malformed GraphQL errors fall back to a generic diagnostic", async () => {
  const handler = createFeaturedSuggestionsHandler({
    verifyAdmin: async () => true,
    exposeDiagnostics: true,
    fetcher: async () => Response.json({ errors: [{ message: { secret: "not a string" } }] }),
  });
  const response = await handler(new Request("https://store.test/api/admin/featured-suggestions"), {
    CLOUDFLARE_API_TOKEN: "token", CLOUDFLARE_ZONE_ID: "zone",
  });
  const body = await response.json() as { error: string };
  assert.equal(body.error, "Cloudflare Analytics returned a GraphQL error.");
  assert.doesNotMatch(body.error, /secret/);
});

test("diagnostic redacts exact credential literals before punctuation cleanup and truncation", async () => {
  const token = `opaque+equals=${"x".repeat(260)}`;
  const handler = createFeaturedSuggestionsHandler({
    verifyAdmin: async () => true,
    exposeDiagnostics: true,
    fetcher: async () => Response.json({ errors: [{ message: `Rejected ${token} by Cloudflare` }] }),
  });
  const response = await handler(new Request("https://store.test/api/admin/featured-suggestions"), {
    CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ZONE_ID: "zone",
  });
  const body = await response.json() as { error: string };
  assert.equal(response.status, 503);
  assert.doesNotMatch(body.error, /opaque\+equals/);
  assert.doesNotMatch(body.error, /x{20,}/);
  assert.match(body.error, /REDACTED/);
});
