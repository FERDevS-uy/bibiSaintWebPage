// tests/results-store.test.ts
// Cobertura mínima del store de búsqueda cursor-paginada.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearEntry,
  clearInFlightRequest,
  abortKey,
  getAbortController,
  resetKey,
  getEntry,
  getInFlightRequest,
  makeSearchKey,
  setEntry,
  setInFlightRequest,
  resultsStore,
  RESULTS_CACHE_MAX_ENTRIES,
  RESULTS_CACHE_TTL_MS,
  type SearchResultsPayload,
} from "../src/stores/results-store.ts";

const item = {
  id: "p1",
  name: "Bota",
  price: 100,
  originalPrice: null,
  imageUrl: "bota.jpg",
  img: ["bota.jpg"],
  enOferta: false,
  category: "Calzado",
};

test("results-store: key compuesta separa query/sort/cursor/version", () => {
  assert.notEqual(
    makeSearchKey("bota", "nombre", null, "v1"),
    makeSearchKey("bota", "nombre", "cursor-2", "v1"),
  );
  assert.notEqual(
    makeSearchKey("bota", "nombre", null, "v1"),
    makeSearchKey("bota", "precio", null, "v1"),
  );
  assert.notEqual(
    makeSearchKey("bota", "nombre", null, "v1"),
    makeSearchKey("zapato", "nombre", null, "v1"),
  );
});

test("results-store: guarda payload cursor-paginado completo", () => {
  const key = makeSearchKey("bota", "nombre", null, "v1");
  setEntry(key, {
    items: [item],
    nextCursor: "cursor-2",
    hasMore: true,
    version: "v1",
    total: 11,
    loading: false,
    error: null,
    query: "bota",
  });

  assert.deepEqual(getEntry(key)?.items, [item]);
  assert.equal(getEntry(key)?.nextCursor, "cursor-2");
  assert.equal(getEntry(key)?.hasMore, true);
  assert.equal(getEntry(key)?.version, "v1");
  assert.equal(getEntry(key)?.total, 11);

  clearEntry(key);
});

test("results-store: deduplica in-flight por key y conserva metadata", async () => {
  const key = makeSearchKey("bota", "nombre", "cursor-2", "v1");
  const payload: SearchResultsPayload = {
    items: [item],
    nextCursor: null,
    hasMore: false,
    version: "v1",
    total: 11,
  };
  const promise = Promise.resolve(payload);

  setInFlightRequest(key, promise);
  assert.equal(getInFlightRequest(key), promise);
  assert.deepEqual(await getInFlightRequest(key), payload);

  clearInFlightRequest(key);
  assert.equal(getInFlightRequest(key), undefined);
});

test("results-store: no elimina un request/controller reemplazado", () => {
  const key = makeSearchKey("bota");
  const first = Promise.resolve({
    items: [], nextCursor: null, hasMore: false, version: "v1", total: 0,
  });
  const second = Promise.resolve({
    items: [], nextCursor: null, hasMore: false, version: "v2", total: 0,
  });

  setInFlightRequest(key, first);
  setInFlightRequest(key, second);
  clearInFlightRequest(key, first);
  assert.equal(getInFlightRequest(key), second);

  const firstController = getAbortController(key);
  abortKey(key);
  const secondController = getAbortController(key);
  resetKey(key, firstController);
  assert.equal(getAbortController(key), secondController);
  abortKey(key);
  clearInFlightRequest(key, second);
});

test("results-store: treats expired entries as absent and removes them", () => {
  const key = makeSearchKey("expired", "name", null, "v-expired");
  setEntry(key, {
    items: [item], nextCursor: null, hasMore: false, version: "v-expired", total: 1,
    loading: false, error: null, query: "expired",
    timestamp: Date.now() - RESULTS_CACHE_TTL_MS - 1,
  });

  assert.equal(getEntry(key), undefined);
  assert.equal(resultsStore.get()[key], undefined);
});

test("results-store: evicts the oldest entries after removing expired entries", () => {
  const baseTimestamp = Date.now();
  const keys = Array.from({ length: RESULTS_CACHE_MAX_ENTRIES + 1 }, (_, index) =>
    makeSearchKey(`bounded-${index}`, "name", null, "v-bounded"),
  );

  keys.forEach((key, index) => {
    setEntry(key, {
      items: [], nextCursor: null, hasMore: false, version: "v-bounded", total: 0,
      loading: false, error: null, query: `bounded-${index}`,
      timestamp: baseTimestamp + index,
    });
  });

  assert.equal(getEntry(keys[0]), undefined);
  assert.ok(getEntry(keys[keys.length - 1]));
  assert.ok(Object.keys(resultsStore.get()).length <= RESULTS_CACHE_MAX_ENTRIES);
});

test("results-store: keeps query, cursor, and version entries isolated", () => {
  const queryKey = makeSearchKey("isolation", "name", null, "v1");
  const cursorKey = makeSearchKey("isolation", "name", "cursor-2", "v1");
  const versionKey = makeSearchKey("isolation", "name", null, "v2");

  for (const [key, query, version] of [
    [queryKey, "isolation", "v1"],
    [cursorKey, "isolation", "v1"],
    [versionKey, "isolation", "v2"],
  ] as const) {
    setEntry(key, {
      items: [item], nextCursor: null, hasMore: false, version, total: 1,
      loading: false, error: null, query,
      // Keep this fixture newer than entries created by concurrent tests.
      timestamp: Date.now() + RESULTS_CACHE_TTL_MS,
    });
  }

  assert.deepEqual(getEntry(queryKey)?.items, [item]);
  assert.deepEqual(getEntry(cursorKey)?.items, [item]);
  assert.equal(getEntry(versionKey)?.version, "v2");
  assert.notEqual(queryKey, cursorKey);
  assert.notEqual(queryKey, versionKey);
});

test("results-store: does not evict an entry with an in-flight request", () => {
  const protectedKey = makeSearchKey("protected", "name", null, "v-protected");
  const promise = Promise.resolve<SearchResultsPayload>({
    items: [], nextCursor: null, hasMore: false, version: "v-protected", total: 0,
  });

  setInFlightRequest(protectedKey, promise);
  setEntry(protectedKey, {
    items: [], nextCursor: null, hasMore: false, version: "v-protected", total: 0,
    loading: false, error: null, query: "protected", timestamp: Date.now() - 1000,
  });

  for (let index = 0; index <= RESULTS_CACHE_MAX_ENTRIES; index += 1) {
    setEntry(makeSearchKey(`in-flight-${index}`), {
      items: [], nextCursor: null, hasMore: false, version: null, total: 0,
      loading: false, error: null, query: `in-flight-${index}`,
      timestamp: Date.now() + index,
    });
  }

  assert.ok(getEntry(protectedKey));
  assert.equal(getInFlightRequest(protectedKey), promise);
  clearInFlightRequest(protectedKey, promise);
});
