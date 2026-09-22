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

test("home edge cache uses a stable key and serves a hit without reading KV", async () => {
  const originalCaches = (globalThis as any).caches;
  const cache = createCache();
  (globalThis as any).caches = { default: cache };
  let renders = 0;
  let kvReads = 0;

  try {
    const options = {
      request: homeRequest(),
      url: new URL("https://shop.example/"),
      locals: { runtime: { env: { CATALOG_KV: { get: async () => { kvReads++; return "catalog-v7"; } } } } },
      next: async () => new Response(`<html>${++renders}</html>`, { status: 200 }),
    };
    const miss = await withHomeEdgeCache(options);
    const hit = await withHomeEdgeCache(options);

    assert.equal(await miss.text(), "<html>1</html>");
    assert.equal(miss.headers.get("X-Home-Edge-Cache"), "MISS");
    assert.equal(hit.headers.get("X-Home-Edge-Cache"), "HIT");
    assert.equal(await hit.text(), "<html>1</html>");
    assert.equal(renders, 1);
    assert.equal(kvReads, 0);
    assert.equal(cache.entries.size, 1);
    assert.equal([...cache.entries.keys()][0], "https://shop.example/.home-edge-cache/v2");
    assert.equal(miss.headers.get("cache-control"), "public, max-age=60");
    assert.doesNotMatch(miss.headers.get("cache-control") ?? "", /s-maxage/);
    assert.equal(cache.entries.get([...cache.entries.keys()][0])?.headers.get("cache-control"), "public, max-age=360");
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
          env: { CATALOG_KV: { get: async () => { throw new Error("KV must not be read"); } } },
          ctx: { waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise) },
        },
      },
      next: async () => new Response(`<html>${++renders}</html>`, { status: 200 }),
      now: () => now,
    };
    await withHomeEdgeCache(options);
    await Promise.all(waitUntilPromises);
    waitUntilPromises.length = 0;
    const key = [...cache.entries.keys()][0];
    const staleHeaders = new Headers(cache.entries.get(key)!.headers);
    staleHeaders.set("X-Home-Edge-Cache-Created-At", String(now - 61_000));
    cache.entries.set(key, new Response("<html>stale</html>", { headers: staleHeaders }));

    const stale = await withHomeEdgeCache(options);
    assert.equal(stale.headers.get("X-Home-Edge-Cache"), "STALE");
    assert.equal(stale.headers.get("cache-control"), "public, max-age=0");
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

test("home cache does not wait for cache.put on a cold miss", async () => {
  const originalCaches = (globalThis as any).caches;
  let completePut: (() => void) | undefined;
  const pendingPut = new Promise<void>((resolve) => { completePut = resolve; });
  const waitUntilPromises: Promise<unknown>[] = [];
  (globalThis as any).caches = {
    default: {
      match: async () => undefined,
      put: async () => pendingPut,
    },
  };

  try {
    const response = await withHomeEdgeCache({
      request: homeRequest(),
      url: new URL("https://shop.example/"),
      locals: { runtime: { ctx: { waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise) } } },
      next: async () => new Response("<html>ready</html>"),
    });

    assert.equal(await response.text(), "<html>ready</html>");
    assert.equal(waitUntilPromises.length, 1);
    completePut?.();
    await Promise.all(waitUntilPromises);
  } finally {
    completePut?.();
    (globalThis as any).caches = originalCaches;
  }
});

test("failed background regeneration keeps serving stale HTML", async () => {
  const originalCaches = (globalThis as any).caches;
  const originalWarn = console.warn;
  const cache = createCache();
  const waitUntilPromises: Promise<unknown>[] = [];
  const now = 1_000_000;
  (globalThis as any).caches = { default: cache };
  console.warn = () => {};

  try {
    const key = "https://shop.example/.home-edge-cache/v2";
    cache.entries.set(key, new Response("<html>last good</html>", {
      headers: { "X-Home-Edge-Cache-Created-At": String(now - 61_000) },
    }));
    const options = {
      request: homeRequest(),
      url: new URL("https://shop.example/"),
      locals: { runtime: { ctx: { waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise) } } },
      next: async (): Promise<Response> => { throw new Error("origin unavailable"); },
      now: () => now,
    };

    const stale = await withHomeEdgeCache(options);
    assert.equal(stale.headers.get("X-Home-Edge-Cache"), "STALE");
    assert.equal(await stale.text(), "<html>last good</html>");
    await Promise.all(waitUntilPromises);
    assert.equal(await cache.entries.get(key)?.text(), "<html>last good</html>");
  } finally {
    console.warn = originalWarn;
    (globalThis as any).caches = originalCaches;
  }
});

test("an entry older than the stale window renders a new document", async () => {
  const originalCaches = (globalThis as any).caches;
  const cache = createCache();
  const now = 1_000_000;
  const key = "https://shop.example/.home-edge-cache/v2";
  cache.entries.set(key, new Response("<html>expired</html>", {
    headers: { "X-Home-Edge-Cache-Created-At": String(now - 361_000) },
  }));
  (globalThis as any).caches = { default: cache };

  try {
    const response = await withHomeEdgeCache({
      request: homeRequest(),
      url: new URL("https://shop.example/"),
      next: async () => new Response("<html>fresh</html>"),
      now: () => now,
    });

    assert.equal(response.headers.get("X-Home-Edge-Cache"), "MISS");
    assert.equal(await response.text(), "<html>fresh</html>");
    assert.equal(await cache.entries.get(key)?.text(), "<html>fresh</html>");
  } finally {
    (globalThis as any).caches = originalCaches;
  }
});

test("a failed cache write does not fail the homepage", async () => {
  const originalCaches = (globalThis as any).caches;
  const originalWarn = console.warn;
  const waitUntilPromises: Promise<unknown>[] = [];
  (globalThis as any).caches = {
    default: {
      match: async () => undefined,
      put: async () => { throw new Error("cache unavailable"); },
    },
  };
  console.warn = () => {};

  try {
    const response = await withHomeEdgeCache({
      request: homeRequest(),
      url: new URL("https://shop.example/"),
      locals: { runtime: { ctx: { waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise) } } },
      next: async () => new Response("<html>ready</html>"),
    });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "<html>ready</html>");
    await Promise.all(waitUntilPromises);
  } finally {
    console.warn = originalWarn;
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
