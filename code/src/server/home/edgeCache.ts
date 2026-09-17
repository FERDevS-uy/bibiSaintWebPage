import {
  buildVersionedCacheKey,
  resolveCatalogVersion,
  type CatalogCacheEnv,
} from "../catalog/edgeCache.ts";

const HOME_CACHE_MAX_AGE_SECONDS = 60;
const HOME_CACHE_STALE_WHILE_REVALIDATE_SECONDS = 300;
const HOME_CACHE_CREATED_AT_HEADER = "X-Home-Edge-Cache-Created-At";

type CacheStorageLike = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};

type HomeCacheLocals = {
  runtime?: {
    env?: CatalogCacheEnv;
    ctx?: { waitUntil?: (promise: Promise<unknown>) => void };
  };
};

export interface WithHomeEdgeCacheOptions {
  request: Request;
  url: URL;
  locals?: HomeCacheLocals;
  next: () => Promise<Response>;
  now?: () => number;
}

function getEdgeCache(): CacheStorageLike | null {
  const cachesObject = typeof caches === "undefined" ? undefined : caches;
  const cache = cachesObject && "default" in cachesObject ? (cachesObject as any).default : null;
  return cache && typeof cache.match === "function" && typeof cache.put === "function" ? cache : null;
}

function isPublicHomeRequest(request: Request, url: URL): boolean {
  return (
    request.method === "GET" &&
    url.pathname === "/" &&
    !request.headers.has("authorization") &&
    !request.headers.has("cookie")
  );
}

function withHomeCacheHeaders(
  response: Response,
  cacheStatus: "BYPASS" | "MISS",
  createdAt: number,
): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "cache-control",
    `public, max-age=${HOME_CACHE_MAX_AGE_SECONDS}, s-maxage=${HOME_CACHE_MAX_AGE_SECONDS + HOME_CACHE_STALE_WHILE_REVALIDATE_SECONDS}, stale-while-revalidate=${HOME_CACHE_STALE_WHILE_REVALIDATE_SECONDS}`,
  );
  headers.set("vary", "Accept-Encoding");
  headers.set("X-Home-Edge-Cache", cacheStatus);
  headers.set(HOME_CACHE_CREATED_AT_HEADER, String(createdAt));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function responseFromCache(response: Response, cacheStatus: "HIT" | "STALE"): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Home-Edge-Cache", cacheStatus);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function cacheHomeResponse(
  response: Response,
  cache: CacheStorageLike | null,
  cacheRequest: Request | null,
  cacheStatus: "BYPASS" | "MISS",
  createdAt: number,
): Promise<Response> {
  if (response.status !== 200 || response.headers.has("set-cookie")) {
    return response;
  }

  const cacheableResponse = withHomeCacheHeaders(response, cacheStatus, createdAt);
  if (cache && cacheRequest) {
    await cache.put(cacheRequest, cacheableResponse.clone());
  }
  return cacheableResponse;
}

/**
 * Caches the fully rendered public home document. The cache key includes the
 * catalog version, so catalog writes naturally move requests to a new entry.
 */
export async function withHomeEdgeCache({
  request,
  url,
  locals,
  next,
  now = Date.now,
}: WithHomeEdgeCacheOptions): Promise<Response> {
  if (!isPublicHomeRequest(request, url)) {
    return next();
  }

  const version = await resolveCatalogVersion({
    kv: locals?.runtime?.env?.CATALOG_KV,
    env: locals?.runtime?.env,
  });
  const cache = getEdgeCache();
  const cacheKey = buildVersionedCacheKey(new URL("/", url.origin), version);
  const cacheRequest = cache ? new Request(cacheKey, { method: "GET" }) : null;

  if (cache && cacheRequest) {
    try {
      const cached = await cache.match(cacheRequest);
      if (cached) {
        const createdAt = Number(cached.headers.get(HOME_CACHE_CREATED_AT_HEADER));
        const ageSeconds = Number.isFinite(createdAt) ? (now() - createdAt) / 1_000 : Infinity;

        if (ageSeconds <= HOME_CACHE_MAX_AGE_SECONDS) {
          return responseFromCache(cached, "HIT");
        }

        if (ageSeconds <= HOME_CACHE_MAX_AGE_SECONDS + HOME_CACHE_STALE_WHILE_REVALIDATE_SECONDS) {
          const refresh = next()
            .then((response) => cacheHomeResponse(response, cache, cacheRequest, "MISS", now()))
            .catch(() => {});
          const waitUntil = locals?.runtime?.ctx?.waitUntil;
          if (typeof waitUntil === "function") {
            waitUntil(refresh);
          }
          return responseFromCache(cached, "STALE");
        }
      }
    } catch {
      // A cache API failure must never prevent the public home from rendering.
    }
  }

  return cacheHomeResponse(await next(), cache, cacheRequest, cache ? "MISS" : "BYPASS", now());
}
