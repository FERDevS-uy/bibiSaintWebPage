import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCatalogQueryTelemetry,
  observeCatalogQuery,
  recordCatalogRuntimeEvent,
} from "../src/server/catalog/queryTelemetry.ts";

test("observeCatalogQuery logs a successful route-correlated query", async () => {
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (message: string) => logs.push(message);

  try {
    const telemetry = createCatalogQueryTelemetry("api-products", "request-1");
    const result = await observeCatalogQuery(
      telemetry,
      "catalog_products_page",
      async () => ({ items: 12 }),
    );

    assert.deepEqual(result, { items: 12 });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(logs.length, 1);
  const event = JSON.parse(logs[0]);
  assert.deepEqual(
    {
      message: event.message,
      route: event.route,
      request_id: event.request_id,
      operation: event.operation,
      status: event.status,
      query_count: event.query_count,
    },
    {
      message: "catalog query",
      route: "api-products",
      request_id: "request-1",
      operation: "catalog_products_page",
      status: "ok",
      query_count: 1,
    },
  );
  assert.equal(typeof event.duration_ms, "number");
  assert.ok(event.duration_ms >= 0);
});

test("observeCatalogQuery logs failures and preserves the upstream error", async () => {
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (message: string) => logs.push(message);

  try {
    const telemetry = createCatalogQueryTelemetry("category-page", "request-2");
    await assert.rejects(
      () => observeCatalogQuery(telemetry, "catalog_categories", async () => {
        throw new Error("upstream failure");
      }),
      (error: unknown) => error instanceof Error && error.message === "upstream failure",
    );
  } finally {
    console.info = originalInfo;
  }

  assert.equal(logs.length, 1);
  const event = JSON.parse(logs[0]);
  assert.equal(event.route, "category-page");
  assert.equal(event.operation, "catalog_categories");
  assert.equal(event.status, "error");
  assert.equal(event.query_count, 1);
  assert.doesNotMatch(logs[0], /upstream failure/);
});

test("observeCatalogQuery leaves uninstrumented callers unchanged", async () => {
  const result = await observeCatalogQuery(
    undefined,
    "catalog_products_page",
    async () => "unobserved-result",
  );

  assert.equal(result, "unobserved-result");
});

test("recordCatalogRuntimeEvent emits a correlated retired-config event without configuration values", () => {
  const logs: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message: string) => logs.push(message);

  try {
    recordCatalogRuntimeEvent({
      event: "catalog_retired_config",
      consumer: "catalog",
      source: "supabase_read_model",
      outcome: "blocked",
      errorClass: "retired_config",
      requestId: "request-retired-1",
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(logs.length, 1);
  const event = JSON.parse(logs[0]);
  assert.deepEqual(event, {
    event: "catalog_retired_config",
    consumer: "catalog",
    source: "supabase_read_model",
    outcome: "blocked",
    error_class: "retired_config",
    request_id: "request-retired-1",
  });
});
