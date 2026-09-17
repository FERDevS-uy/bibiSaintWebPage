import assert from "node:assert/strict";
import test from "node:test";
import { withHomeEdgeCache } from "../src/server/home/edgeCache.ts";

function createCache() {
  const entries = new Map<string, Response>();
  return {
    entries,
    match: async (request: Request) => entries.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => {
      entries.set(request.url, response.clone());
    },
  };
}

function homeRequest() {
  return new Request("https://shop.example/");
}

test("home edge cache stores the rendered document under a versioned key and serves a fresh hit", async () => {
  const originalCaches = (globalThis as any).caches;
  const cache = createCache();
  (globalThis as any).caches = { default: cache };
  let renders = 0;

  try {
    const options = {
      request: homeRequest(),
      url: new URL("https://shop.example/"),
      locals: { runtime: { env: { CATALOG_KV: { get: async () => "catalog-v7" } } } },
      next: async () => new Response(`<html>${++renders}</html>`, { status: 200 }),
    };
    const miss = await withHomeEdgeCache(options);
    const hit = await withHomeEdgeCache(options);

    assert.equal(await miss.text(), "<html>1</html>");
    assert.equal(miss.headers.get("X-Home-Edge-Cache"), "MISS");
    assert.equal(hit.headers.get("X-Home-Edge-Cache"), "HIT");
    assert.equal(await hit.text(), "<html>1</html>");
    assert.equal(renders, 1);
    assert.equal(cache.entries.size, 1);
    assert.match([...cache.entries.keys()][0], /\?v=catalog-v7$/);
    assert.match(miss.headers.get("cache-control") ?? "", /stale-while-revalidate=300/);
  } finally {
    (globalThis as any).caches = originalCaches;
  }
});

test("home edge cache serves stale HTML and refreshes it through waitUntil", async () => {
  const originalCaches = (globalThis as any).caches;
  const cache = createCache();
  (globalThis as any).caches = { default: cache };
  const now = 1_000_000;
  const waitUntilPromises: Promise<unknown>[] = [];
  let renders = 0;

  try {
    const options = {
      request: homeRequest(),
      url: new URL("https://shop.example/"),
      locals: {
        runtime: {
          env: { CATALOG_KV: { get: async () => "catalog-v8" } },
          ctx: { waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise) },
        },
      },
      next: async () => new Response(`<html>${++renders}</html>`, { status: 200 }),
      now: () => now,
    };
    await withHomeEdgeCache(options);
    const key = [...cache.entries.keys()][0];
    const staleHeaders = new Headers(cache.entries.get(key)!.headers);
    staleHeaders.set("X-Home-Edge-Cache-Created-At", String(now - 61_000));
    cache.entries.set(key, new Response("<html>stale</html>", { headers: staleHeaders }));

    const stale = await withHomeEdgeCache(options);
    assert.equal(stale.headers.get("X-Home-Edge-Cache"), "STALE");
    assert.equal(await stale.text(), "<html>stale</html>");
    assert.equal(waitUntilPromises.length, 1);
    await Promise.all(waitUntilPromises);

    const refreshed = await withHomeEdgeCache(options);
    assert.equal(refreshed.headers.get("X-Home-Edge-Cache"), "HIT");
    assert.equal(await refreshed.text(), "<html>2</html>");
  } finally {
    (globalThis as any).caches = originalCaches;
  }
});

test("home edge cache bypasses requests that carry a session cookie", async () => {
  const originalCaches = (globalThis as any).caches;
  const cache = createCache();
  (globalThis as any).caches = { default: cache };
  let renders = 0;

  try {
    const request = new Request("https://shop.example/", {
      headers: { cookie: "sb-session=private" },
    });
    const response = await withHomeEdgeCache({
      request,
      url: new URL(request.url),
      next: async () => new Response(`<html>${++renders}</html>`),
    });

    assert.equal(await response.text(), "<html>1</html>");
    assert.equal(cache.entries.size, 0);
  } finally {
    (globalThis as any).caches = originalCaches;
  }
});
