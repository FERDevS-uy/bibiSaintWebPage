const HOME_CACHE_MAX_AGE_SECONDS = 60;
const HOME_CACHE_STALE_WHILE_REVALIDATE_SECONDS = 300;
const HOME_CACHE_CREATED_AT_HEADER = "X-Home-Edge-Cache-Created-At";
const HOME_CACHE_KEY_PATH = "/.home-edge-cache/v2";

type CacheStorageLike = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};

type HomeCacheLocals = {
  runtime?: {
    env?: Record<string, unknown>;
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
  headers.set("cache-control", `public, max-age=${HOME_CACHE_MAX_AGE_SECONDS}`);
  headers.set("vary", "Accept-Encoding");
  headers.set("X-Home-Edge-Cache", cacheStatus);
  headers.set(HOME_CACHE_CREATED_AT_HEADER, String(createdAt));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function responseFromCache(response: Response, cacheStatus: "HIT" | "STALE", ageSeconds: number): Response {
  const headers = new Headers(response.headers);
  const remainingFreshSeconds = cacheStatus === "HIT"
    ? Math.max(0, Math.floor(HOME_CACHE_MAX_AGE_SECONDS - ageSeconds))
    : 0;
  headers.set("cache-control", `public, max-age=${remainingFreshSeconds}`);
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
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
  if (response.status !== 200 || response.headers.has("set-cookie")) {
    return response;
  }

  const cacheableResponse = withHomeCacheHeaders(response, cacheStatus, createdAt);
  if (cache && cacheRequest) {
    const storedHeaders = new Headers(cacheableResponse.headers);
    storedHeaders.set(
      "cache-control",
      `public, max-age=${HOME_CACHE_MAX_AGE_SECONDS + HOME_CACHE_STALE_WHILE_REVALIDATE_SECONDS}`,
    );
    const storedResponse = new Response(cacheableResponse.clone().body, {
      status: cacheableResponse.status,
      statusText: cacheableResponse.statusText,
      headers: storedHeaders,
    });
    const put = cache.put(cacheRequest, storedResponse).catch(() => {
      console.warn("[home:edge-cache] cache write failed");
    });
    if (waitUntil) waitUntil(put);
    else await put;
  }
  return cacheableResponse;
}

/**
 * Caches anonymous home HTML independently from catalog-version lookup. The
 * fresh/stale window bounds how long featured content can lag behind writes.
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

  const cache = getEdgeCache();
  const cacheKey = new URL(HOME_CACHE_KEY_PATH, url.origin).toString();
  const cacheRequest = cache ? new Request(cacheKey, { method: "GET" }) : null;
  const waitUntil = locals?.runtime?.ctx?.waitUntil;

  if (cache && cacheRequest) {
    try {
      const cached = await cache.match(cacheRequest);
      if (cached) {
        const createdAt = Number(cached.headers.get(HOME_CACHE_CREATED_AT_HEADER));
        const ageSeconds = Number.isFinite(createdAt) ? (now() - createdAt) / 1_000 : Infinity;

        if (ageSeconds <= HOME_CACHE_MAX_AGE_SECONDS) {
          return responseFromCache(cached, "HIT", ageSeconds);
        }

        if (ageSeconds <= HOME_CACHE_MAX_AGE_SECONDS + HOME_CACHE_STALE_WHILE_REVALIDATE_SECONDS) {
          const refresh = next()
            .then((response) => cacheHomeResponse(response, cache, cacheRequest, "MISS", now()))
            .catch(() => {
              console.warn("[home:edge-cache] background refresh failed");
            });
          if (typeof waitUntil === "function") {
            waitUntil(refresh);
          } else {
            await refresh;
          }
          return responseFromCache(cached, "STALE", ageSeconds);
        }
      }
    } catch {
      // A cache API failure must never prevent the public home from rendering.
    }
  }

  return cacheHomeResponse(await next(), cache, cacheRequest, cache ? "MISS" : "BYPASS", now(), waitUntil);
}
