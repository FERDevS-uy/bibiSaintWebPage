// tests/catalog-edge-cache.test.ts
// TDD — Tareas 4.1 a 4.5: Cache Edge, versionado KV, invalidación y telemetría.
// Se ejecutan con: node --experimental-strip-types --test tests/catalog-edge-cache.test.ts

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCatalogVersion,
  bumpCatalogVersion,
  invalidateEdgeCatalogVersion,
  buildVersionedCacheKey,
  getCatalogCacheHeaders,
  logCatalogCacheTelemetry,
  getEdgeCacheMetrics,
  resetEdgeCacheMetrics,
  resetCachedCatalogVersion,
  setCachedCatalogVersion,
  withEdgeCache,
  DEFAULT_CACHE_POLICY,
} from "../src/server/catalog/edgeCache.ts";

beforeEach(() => {
  resetEdgeCacheMetrics();
  resetCachedCatalogVersion();
});

// ---------------------------------------------------------------------------
// 4.1 / 4.2: Resolución de versión de catálogo
// ---------------------------------------------------------------------------

test("resolveCatalogVersion: resuelve versión desde KV cuando está presente", async () => {
  const kvStore = new Map<string, string>([["catalog:version", "42"]]);
  const mockKv = {
    get: async (key: string) => kvStore.get(key) ?? null,
    put: async (key: string, val: string) => {
      kvStore.set(key, val);
    },
    delete: async (key: string) => {
      kvStore.delete(key);
    },
  };

  const version = await resolveCatalogVersion({ kv: mockKv });
  assert.equal(version, "42");
});

test("resolveCatalogVersion: fallback a Supabase cuando KV está vacío o ausente", async () => {
  const mockSupabase = {
    from: (table: string) => {
      assert.equal(table, "catalog_version");
      return {
        select: (cols: string) => ({
          eq: (col: string, val: number) => ({
            single: async () => ({ data: { version: 105 }, error: null }),
          }),
        }),
      };
    },
  };

  const version = await resolveCatalogVersion({ supabase: mockSupabase });
  assert.equal(version, "105");
});

test("resolveCatalogVersion: fallback seguro a default '1' ante error o ausencia de backend", async () => {
  const mockSupabaseError = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { message: "DB unreachable" } }),
        }),
      }),
    }),
  };

  const version = await resolveCatalogVersion({ supabase: mockSupabaseError });
  assert.equal(version, "1");
});

// ---------------------------------------------------------------------------
// 4.3: Bump e invalidación de versión
// ---------------------------------------------------------------------------

test("bumpCatalogVersion: ejecuta RPC catalog_rebuild y actualiza KV", async () => {
  const kvStore = new Map<string, string>();
  const mockKv = {
    get: async (key: string) => kvStore.get(key) ?? null,
    put: async (key: string, val: string) => {
      kvStore.set(key, val);
    },
    delete: async (key: string) => {
      kvStore.delete(key);
    },
  };

  let rpcCalled = false;
  const mockSupabaseAdmin = {
    rpc: async (fn: string) => {
      assert.equal(fn, "catalog_rebuild");
      rpcCalled = true;
      return { data: 77, error: null };
    },
  };

  const newVersion = await bumpCatalogVersion({
    supabaseAdmin: mockSupabaseAdmin,
    kv: mockKv,
  });

  assert.equal(rpcCalled, true);
  assert.equal(newVersion, "77");
  assert.equal(kvStore.get("catalog:version"), "77");
});

test("bumpCatalogVersion: fallback a incremento directo si RPC no está disponible", async () => {
  setCachedCatalogVersion("10");
  const kvStore = new Map<string, string>();
  const mockKv = {
    get: async (key: string) => kvStore.get(key) ?? null,
    put: async (key: string, val: string) => {
      kvStore.set(key, val);
    },
    delete: async (key: string) => {
      kvStore.delete(key);
    },
  };

  const newVersion = await bumpCatalogVersion({ kv: mockKv, newVersion: "11" });
  assert.equal(newVersion, "11");
  assert.equal(kvStore.get("catalog:version"), "11");
});

test("invalidateEdgeCatalogVersion: delega en bumpCatalogVersion", async () => {
  const kvStore = new Map<string, string>();
  const mockKv = {
    get: async (key: string) => kvStore.get(key) ?? null,
    put: async (key: string, val: string) => {
      kvStore.set(key, val);
    },
    delete: async (key: string) => {
      kvStore.delete(key);
    },
  };

  const version = await invalidateEdgeCatalogVersion({
    kv: mockKv,
  });
  assert.ok(Number(version) >= 1);
});

// ---------------------------------------------------------------------------
// 4.2: Clave de caché versionada
// ---------------------------------------------------------------------------

test("buildVersionedCacheKey: añade parámetro v=<version> preservando query params existentes", () => {
  const key1 = buildVersionedCacheKey("https://example.com/api/catalog/products", "v42");
  assert.equal(key1, "https://example.com/api/catalog/products?v=v42");

  const key2 = buildVersionedCacheKey(
    "https://example.com/api/catalog/products?category=Tecno&pageSize=12",
    "100",
  );
  assert.equal(
    key2,
    "https://example.com/api/catalog/products?category=Tecno&pageSize=12&v=100",
  );

  const key3 = buildVersionedCacheKey(
    "https://example.com/api/catalog/products?v=old&category=Ropa",
    "new",
  );
  assert.equal(key3, "https://example.com/api/catalog/products?v=new&category=Ropa");
});

// ---------------------------------------------------------------------------
// 4.4: Políticas Cache-Control y TTL
// ---------------------------------------------------------------------------

test("getCatalogCacheHeaders: genera políticas consistentes con stale-while-revalidate", () => {
  const prodHeaders = getCatalogCacheHeaders("products");
  assert.equal(prodHeaders["content-type"], "application/json");
  assert.equal(prodHeaders["vary"], "Accept-Encoding");
  assert.equal(
    prodHeaders["cache-control"],
    `public, max-age=${DEFAULT_CACHE_POLICY.products.maxAge}, s-maxage=${DEFAULT_CACHE_POLICY.products.sMaxAge}, stale-while-revalidate=${DEFAULT_CACHE_POLICY.products.swr}`,
  );

  const catHeaders = getCatalogCacheHeaders("categories");
  assert.equal(
    catHeaders["cache-control"],
    `public, max-age=${DEFAULT_CACHE_POLICY.categories.maxAge}, s-maxage=${DEFAULT_CACHE_POLICY.categories.sMaxAge}, stale-while-revalidate=${DEFAULT_CACHE_POLICY.categories.swr}`,
  );

  const relHeaders = getCatalogCacheHeaders("related");
  assert.equal(
    relHeaders["cache-control"],
    `public, max-age=${DEFAULT_CACHE_POLICY.related.maxAge}, s-maxage=${DEFAULT_CACHE_POLICY.related.sMaxAge}, stale-while-revalidate=${DEFAULT_CACHE_POLICY.related.swr}`,
  );

  const searchHeaders = getCatalogCacheHeaders("search");
  assert.equal(
    searchHeaders["cache-control"],
    `public, max-age=${DEFAULT_CACHE_POLICY.search.maxAge}, s-maxage=${DEFAULT_CACHE_POLICY.search.sMaxAge}, stale-while-revalidate=${DEFAULT_CACHE_POLICY.search.swr}`,
  );
});

test("getCatalogCacheHeaders: permite overrides personalizados", () => {
  const custom = getCatalogCacheHeaders("products", {
    maxAge: 30,
    sMaxAge: 90,
    staleWhileRevalidate: 180,
  });
  assert.equal(
    custom["cache-control"],
    "public, max-age=30, s-maxage=90, stale-while-revalidate=180",
  );
});

// ---------------------------------------------------------------------------
// 4.5: Telemetría estructurada sin secretos ni PII
// ---------------------------------------------------------------------------

test("logCatalogCacheTelemetry: actualiza métricas y formatea log estructurado", () => {
  const logs: string[] = [];
  const origInfo = console.info;
  console.info = (msg: string) => {
    logs.push(msg);
  };

  try {
    logCatalogCacheTelemetry({
      route: "products",
      hit: true,
      version: "v42",
      status: 200,
      durationMs: 12.4,
      payloadBytes: 1540,
    });

    logCatalogCacheTelemetry({
      route: "categories",
      hit: false,
      version: "v42",
      status: 200,
      durationMs: 45.8,
      payloadBytes: 3200,
    });
  } finally {
    console.info = origInfo;
  }

  const metrics = getEdgeCacheMetrics();
  assert.equal(metrics.hits, 1);
  assert.equal(metrics.misses, 1);
  assert.equal(metrics.errors, 0);
  assert.equal(metrics.totalPayloadBytes, 4740);

  assert.equal(logs.length, 2);
  assert.equal(
    logs[0],
    "[catalog:edge-cache] route=products hit=true version=v42 status=200 latency_ms=12 payload_bytes=1540",
  );
  assert.equal(
    logs[1],
    "[catalog:edge-cache] route=categories hit=false version=v42 status=200 latency_ms=46 payload_bytes=3200",
  );
});

test("logCatalogCacheTelemetry: sanitiza entradas y no expone PII ni saltos de línea", () => {
  const logs: string[] = [];
  const origInfo = console.info;
  console.info = (msg: string) => {
    logs.push(msg);
  };

  try {
    logCatalogCacheTelemetry({
      route: "products\nX-Inject: 1",
      hit: false,
      version: "secret@email.com\r\n42",
      status: 200,
      durationMs: 5,
      payloadBytes: 100,
    });
  } finally {
    console.info = origInfo;
  }

  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /\n/);
  assert.doesNotMatch(logs[0], /\r/);
  assert.equal(
    logs[0],
    "[catalog:edge-cache] route=products X-Inject: 1 hit=false version=secret@email.com 42 status=200 latency_ms=5 payload_bytes=100",
  );
});

// ---------------------------------------------------------------------------
// withEdgeCache Wrapper
// ---------------------------------------------------------------------------

test("withEdgeCache: en entorno sin caches.default (Node.js) corre el handler y agrega cabeceras BYPASS", async () => {
  const request = new Request("https://example.com/api/catalog/products?category=Tecno", {
    method: "GET",
  });

  const response = await withEdgeCache({
    route: "products",
    request,
    locals: {},
    handler: async (version) => {
      return new Response(JSON.stringify({ items: [], version }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Edge-Cache"), "BYPASS");
  assert.ok(response.headers.get("X-Catalog-Version"));
  assert.ok(response.headers.get("cache-control")?.includes("stale-while-revalidate"));
});

test("withEdgeCache: simula cache HIT cuando caches.default contiene la respuesta", async () => {
  const cachedResponseBody = JSON.stringify({ items: [{ id: "1" }], cached: true });
  const mockCache = {
    match: async (req: Request) => {
      return new Response(cachedResponseBody, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(cachedResponseBody.length),
        },
      });
    },
    put: async () => {},
  };

  // Mock global caches object
  const originalCaches = (globalThis as any).caches;
  (globalThis as any).caches = { default: mockCache };

  try {
    let handlerCalled = false;
    const request = new Request("https://example.com/api/catalog/products", { method: "GET" });

    const response = await withEdgeCache({
      route: "products",
      request,
      locals: {},
      handler: async () => {
        handlerCalled = true;
        return new Response("{}", { status: 200 });
      },
    });

    assert.equal(handlerCalled, false); // No ejecutó el handler (Cache HIT)
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Edge-Cache"), "HIT");
    const data = await response.json();
    assert.equal(data.cached, true);
  } finally {
    (globalThis as any).caches = originalCaches;
  }
});

test("withEdgeCache: simula cache MISS cuando caches.default no encuentra la clave y luego guarda con cache.put", async () => {
  let putCalled = false;
  let putKey = "";
  const mockCache = {
    match: async () => null,
    put: async (req: Request) => {
      putCalled = true;
      putKey = req.url;
    },
  };

  const originalCaches = (globalThis as any).caches;
  (globalThis as any).caches = { default: mockCache };

  try {
    const request = new Request("https://example.com/api/catalog/categories", { method: "GET" });

    const response = await withEdgeCache({
      route: "categories",
      request,
      locals: {},
      handler: async () => {
        return new Response(JSON.stringify({ categories: [] }), {
          status: 200,
        });
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Edge-Cache"), "MISS");
    assert.equal(putCalled, true);
    assert.match(putKey, /\?v=/);
  } finally {
    (globalThis as any).caches = originalCaches;
  }
});

test("withEdgeCache: no cachea respuestas de error (status != 200)", async () => {
  let putCalled = false;
  const mockCache = {
    match: async () => null,
    put: async () => {
      putCalled = true;
    },
  };

  const originalCaches = (globalThis as any).caches;
  (globalThis as any).caches = { default: mockCache };

  try {
    const request = new Request("https://example.com/api/catalog/products?pageSize=invalid", {
      method: "GET",
    });

    const response = await withEdgeCache({
      route: "products",
      request,
      locals: {},
      handler: async () => {
        return new Response(JSON.stringify({ error: "INVALID_PAGE_SIZE" }), {
          status: 400,
        });
      },
    });

    assert.equal(response.status, 400);
    assert.equal(putCalled, false);
  } finally {
    (globalThis as any).caches = originalCaches;
  }
});
