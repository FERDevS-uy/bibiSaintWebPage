// src/server/catalog/edgeCache.ts
// Capa de cache edge y versionado de catálogo (read model).
// Tarea 4.1 - 4.5 — scalable-catalog-read-pipeline.
//
// Proporciona:
// 1. Resolución de versión de catálogo (KV -> Memory -> Supabase).
// 2. Publicación atómica de nueva versión e invalidación lógica (bumpCatalogVersion).
// 3. Wrapper de Cache API (caches.default) con claves versionadas (?v=<version>).
// 4. Políticas consistentes de cabeceras Cache-Control por ruta.
// 5. Telemetría estructurada sin PII ni secretos (logCatalogCacheTelemetry).

export interface CatalogCacheEnv {
  CATALOG_KV?: {
    get: (key: string) => Promise<string | null>;
    put: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  CATALOG_READ_MODEL?: string;
  ENABLE_CSV_FALLBACK?: string;
  [key: string]: unknown;
}

export type CatalogRouteType = "products" | "categories" | "related" | "search";

export interface CacheHeaderOptions {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
}

export interface EdgeCacheTelemetryEvent {
  route: string;
  hit: boolean;
  version: string | null;
  status: number;
  durationMs: number;
  payloadBytes?: number;
}

export interface EdgeCacheMetrics {
  hits: number;
  misses: number;
  bypasses: number;
  errors: number;
  totalDurationMs: number;
  totalPayloadBytes: number;
}

// ---------------------------------------------------------------------------
// Telemetría y métricas en memoria
// ---------------------------------------------------------------------------

let edgeCacheMetrics: EdgeCacheMetrics = {
  hits: 0,
  misses: 0,
  bypasses: 0,
  errors: 0,
  totalDurationMs: 0,
  totalPayloadBytes: 0,
};

export function getEdgeCacheMetrics(): EdgeCacheMetrics {
  return { ...edgeCacheMetrics };
}

export function resetEdgeCacheMetrics(): void {
  edgeCacheMetrics = {
    hits: 0,
    misses: 0,
    bypasses: 0,
    errors: 0,
    totalDurationMs: 0,
    totalPayloadBytes: 0,
  };
}

/**
 * Registra evento de telemetría del caché edge en formato estructurado key=value.
 * No incluye PII, tokens, IPs ni query params del usuario.
 */
export function logCatalogCacheTelemetry(event: EdgeCacheTelemetryEvent): void {
  if (event.hit) {
    edgeCacheMetrics.hits++;
  } else if (event.status >= 500) {
    edgeCacheMetrics.errors++;
  } else {
    edgeCacheMetrics.misses++;
  }
  edgeCacheMetrics.totalDurationMs += event.durationMs;
  if (event.payloadBytes) {
    edgeCacheMetrics.totalPayloadBytes += event.payloadBytes;
  }

  const route = String(event.route ?? "unknown").replace(/[\r\n\t]+/g, " ").trim();
  const version = event.version ? String(event.version).replace(/[\r\n\t]+/g, " ").trim() : "none";
  const hitStr = event.hit ? "true" : "false";
  const statusStr = String(event.status ?? 200);
  const durationStr = Math.round(event.durationMs).toString();
  const bytesStr = typeof event.payloadBytes === "number" ? String(event.payloadBytes) : "0";

  console.info(
    `[catalog:edge-cache] route=${route} hit=${hitStr} version=${version} status=${statusStr} latency_ms=${durationStr} payload_bytes=${bytesStr}`,
  );
}

// ---------------------------------------------------------------------------
// Políticas Cache-Control estándar
// ---------------------------------------------------------------------------

export const DEFAULT_CACHE_POLICY: Record<
  CatalogRouteType,
  { maxAge: number; sMaxAge: number; swr: number }
> = {
  products: { maxAge: 60, sMaxAge: 120, swr: 300 },
  categories: { maxAge: 300, sMaxAge: 600, swr: 1800 },
  related: { maxAge: 300, sMaxAge: 600, swr: 1800 },
  search: { maxAge: 60, sMaxAge: 120, swr: 300 },
};

/**
 * Devuelve las cabeceras HTTP estándar de caché para un tipo de ruta del catálogo.
 */
export function getCatalogCacheHeaders(
  route: CatalogRouteType,
  custom?: CacheHeaderOptions,
): Record<string, string> {
  const policy = DEFAULT_CACHE_POLICY[route] ?? DEFAULT_CACHE_POLICY.products;
  const maxAge = custom?.maxAge ?? policy.maxAge;
  const sMaxAge = custom?.sMaxAge ?? policy.sMaxAge;
  const swr = custom?.staleWhileRevalidate ?? policy.swr;

  return {
    "content-type": "application/json",
    "cache-control": `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    "vary": "Accept-Encoding",
  };
}

// ---------------------------------------------------------------------------
// Resolución y publicación de versión
// ---------------------------------------------------------------------------

let inMemoryVersion: string = "1";
let inMemoryVersionExpiry: number = 0;
const IN_MEMORY_VERSION_TTL_MS = 10_000; // 10s memory fallback

export function resetCachedCatalogVersion(): void {
  inMemoryVersion = "1";
  inMemoryVersionExpiry = 0;
}

export function setCachedCatalogVersion(version: string): void {
  inMemoryVersion = version;
  inMemoryVersionExpiry = Date.now() + IN_MEMORY_VERSION_TTL_MS;
}

export function getCachedCatalogVersion(): string {
  return inMemoryVersion;
}

/**
 * Resuelve la versión actual del catálogo.
 * Jerarquía: KV -> Memoria (10s TTL) -> Supabase catalog_version -> Fallback "1".
 */
export async function resolveCatalogVersion(options?: {
  kv?: CatalogCacheEnv["CATALOG_KV"] | null;
  supabase?: any;
  env?: CatalogCacheEnv;
}): Promise<string> {
  const kv = options?.kv ?? options?.env?.CATALOG_KV;
  if (kv && typeof kv.get === "function") {
    try {
      const kvVersion = await kv.get("catalog:version");
      if (kvVersion && kvVersion.trim().length > 0) {
        setCachedCatalogVersion(kvVersion.trim());
        return kvVersion.trim();
      }
    } catch {
      // KV lookup error: fallback a memoria/supabase
    }
  }

  if (inMemoryVersionExpiry > Date.now()) {
    return inMemoryVersion;
  }

  let supabase = options?.supabase;
  if (!supabase) {
    try {
      const { getSupabase } = await import("../supabase.ts");
      supabase = getSupabase();
    } catch {
      // Supabase no disponible en este contexto
    }
  }

  if (supabase && typeof supabase.from === "function") {
    try {
      const { data, error } = await supabase
        .from("catalog_version")
        .select("version")
        .eq("id", 1)
        .single();
      if (!error && data && data.version != null) {
        const v = String(data.version);
        setCachedCatalogVersion(v);
        if (kv && typeof kv.put === "function") {
          kv.put("catalog:version", v).catch(() => {});
        }
        return v;
      }
    } catch {
      // Fallback a inMemoryVersion
    }
  }

  return inMemoryVersion;
}

/**
 * Incrementa/publica la versión del catálogo e invalida los cachés edge/locales.
 * Invoca catalog_rebuild() en PostgreSQL si supabaseAdmin está disponible.
 */
export async function bumpCatalogVersion(options?: {
  kv?: CatalogCacheEnv["CATALOG_KV"] | null;
  supabaseAdmin?: any;
  newVersion?: string;
  rebuildReadModel?: boolean;
}): Promise<string> {
  let version = options?.newVersion;

  let supabaseAdmin = options?.supabaseAdmin;
  if (!supabaseAdmin && !version) {
    try {
      const { getSupabaseAdmin } = await import("../supabase.ts");
      supabaseAdmin = getSupabaseAdmin();
    } catch {
      // admin no disponible
    }
  }

  if (!version && supabaseAdmin && typeof supabaseAdmin.rpc === "function" && options?.rebuildReadModel !== false) {
    try {
      const { data, error } = await supabaseAdmin.rpc("catalog_rebuild");
      if (!error && data != null) {
        version = String(data);
      }
    } catch {
      // rpc falló o no existe la función
    }
  }

  if (!version && supabaseAdmin && typeof supabaseAdmin.from === "function") {
    try {
      const current = await resolveCatalogVersion({ supabase: supabaseAdmin });
      const nextNum = (parseInt(current, 10) || 0) + 1;
      const { data, error } = await supabaseAdmin
        .from("catalog_version")
        .update({ version: nextNum, published_at: new Date().toISOString() })
        .eq("id", 1)
        .select("version")
        .single();
      if (!error && data && data.version != null) {
        version = String(data.version);
      }
    } catch {
      // update falló
    }
  }

  if (!version) {
    const nextNum = (parseInt(inMemoryVersion, 10) || 0) + 1;
    version = String(nextNum);
  }

  setCachedCatalogVersion(version);

  const kv = options?.kv;
  if (kv && typeof kv.put === "function") {
    try {
      await kv.put("catalog:version", version);
    } catch {
      // best-effort
    }
  }

  try {
    const { invalidateAllProductCaches } = await import("../products.ts");
    invalidateAllProductCaches();
  } catch {
    //
  }

  return version;
}

export async function invalidateEdgeCatalogVersion(options?: {
  kv?: CatalogCacheEnv["CATALOG_KV"] | null;
  supabaseAdmin?: any;
}): Promise<string> {
  return bumpCatalogVersion(options);
}

// ---------------------------------------------------------------------------
// Wrapper Cache API con clave versionada
// ---------------------------------------------------------------------------

/**
 * Construye la URL de clave de caché que incluye el tag de versión ?v=<version>.
 */
export function buildVersionedCacheKey(url: string | URL, version: string): string {
  const u = new URL(url.toString());
  u.searchParams.set("v", version);
  return u.toString();
}

export interface WithEdgeCacheOptions {
  route: CatalogRouteType;
  request: Request;
  locals?: any;
  customHeaders?: CacheHeaderOptions;
  handler: (version: string) => Promise<Response>;
}

/**
 * Envuelve una petición GET pública con Cache API (caches.default).
 * - En caso de cache hit: devuelve respuesta cacheada inmediatamente.
 * - En caso de cache miss: ejecuta el handler, aplica cabeceras de caché y almacena la respuesta.
 * - En entornos sin caches.default (Node.js/tests): ejecuta el handler directamente.
 */
export async function withEdgeCache(options: WithEdgeCacheOptions): Promise<Response> {
  const startTime = performance.now();
  const { route, request, locals, customHeaders, handler } = options;

  const kv = locals?.runtime?.env?.CATALOG_KV;
  const version = await resolveCatalogVersion({ kv, env: locals?.runtime?.env });

  if (request.method !== "GET") {
    return handler(version);
  }

  const cacheKey = buildVersionedCacheKey(request.url, version);

  const cachesObj = typeof caches !== "undefined" ? caches : undefined;
  const edgeCache = cachesObj && "default" in cachesObj ? (cachesObj as any).default : null;

  if (edgeCache && typeof edgeCache.match === "function") {
    try {
      const matchRequest = new Request(cacheKey, { method: "GET" });
      const matched = await edgeCache.match(matchRequest);
      if (matched) {
        const durationMs = performance.now() - startTime;
        const responseBytes = Number(matched.headers.get("content-length")) || 0;
        logCatalogCacheTelemetry({
          route,
          hit: true,
          version,
          status: matched.status,
          durationMs,
          payloadBytes: responseBytes,
        });

        const headers = new Headers(matched.headers);
        headers.set("X-Edge-Cache", "HIT");
        headers.set("X-Catalog-Version", version);
        return new Response(matched.body, {
          status: matched.status,
          statusText: matched.statusText,
          headers,
        });
      }
    } catch {
      // cache.match falló, continuar al handler
    }
  }

  const res = await handler(version);
  const durationMs = performance.now() - startTime;

  if (res.status === 200) {
    const defaultHeaders = getCatalogCacheHeaders(route, customHeaders);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(defaultHeaders)) {
      if (!headers.has(k)) {
        headers.set(k, v);
      }
    }
    headers.set("X-Catalog-Version", version);
    headers.set("X-Edge-Cache", edgeCache ? "MISS" : "BYPASS");

    let payloadBytes = 0;
    let bodyBuffer: ArrayBuffer | null = null;
    try {
      bodyBuffer = await res.clone().arrayBuffer();
      payloadBytes = bodyBuffer.byteLength;
      if (!headers.has("content-length")) {
        headers.set("content-length", String(payloadBytes));
      }
    } catch {
      payloadBytes = 0;
    }

    logCatalogCacheTelemetry({
      route,
      hit: false,
      version,
      status: res.status,
      durationMs,
      payloadBytes,
    });

    const responseBody = bodyBuffer ?? res.body;
    const finalResponse = new Response(responseBody, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });

    if (edgeCache && typeof edgeCache.put === "function") {
      const putRequest = new Request(cacheKey, { method: "GET" });
      const putPromise = edgeCache.put(putRequest, finalResponse.clone());
      const ctx = locals?.runtime?.ctx;
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(putPromise);
      } else {
        putPromise.catch(() => {});
      }
    }

    return finalResponse;
  }

  const errorBytes = Number(res.headers.get("content-length")) || 0;
  logCatalogCacheTelemetry({
    route,
    hit: false,
    version,
    status: res.status,
    durationMs,
    payloadBytes: errorBytes,
  });

  return res;
}
