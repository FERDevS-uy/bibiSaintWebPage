#!/usr/bin/env node
// Local-only catalog load harness for OpenSpec task 6.3.
//
// Safety boundary: this script reads no .env file, never uses Supabase CLI
// remote commands, and only talks to the database through the exact local
// container `supabase_db_code`. Fixtures are inserted into the read model,
// committed for HTTP visibility, and removed in a finally block.

import { execFile, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LOCAL_DB_CONTAINER = "supabase_db_code";
const DEFAULT_BASE = "http://localhost:4321";
const DEFAULT_FIXTURES = 100_000;
const DEFAULT_REQUESTS = 200;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_PAGE_SIZE = 48;

function fail(message) {
  throw new Error(`[catalog-load-local] ${message}`);
}

function parseArgs(argv) {
  const args = {
    base: DEFAULT_BASE,
    fixtures: DEFAULT_FIXTURES,
    requests: DEFAULT_REQUESTS,
    concurrency: DEFAULT_CONCURRENCY,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pageSize: DEFAULT_PAGE_SIZE,
    prefix: `load-local-63-${Date.now()}`,
    out: null,
    smoke: false,
  };

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--smoke") args.smoke = true;
    else if (arg.startsWith("--base=")) args.base = arg.slice(7);
    else if (arg.startsWith("--fixtures=")) args.fixtures = Number(arg.slice(11));
    else if (arg.startsWith("--requests=")) args.requests = Number(arg.slice(11));
    else if (arg.startsWith("--concurrency=")) args.concurrency = Number(arg.slice(14));
    else if (arg.startsWith("--timeout-ms=")) args.timeoutMs = Number(arg.slice(13));
    else if (arg.startsWith("--page-size=")) args.pageSize = Number(arg.slice(12));
    else if (arg.startsWith("--prefix=")) args.prefix = arg.slice(9);
    else if (arg.startsWith("--out=")) args.out = arg.slice(6);
    else fail(`unknown argument: ${arg}`);
  }

  if (args.smoke && args.fixtures === DEFAULT_FIXTURES) args.fixtures = 100;
  if (args.smoke && args.requests === DEFAULT_REQUESTS) args.requests = 5;
  if (!Number.isInteger(args.fixtures) || args.fixtures < (args.smoke ? 1 : DEFAULT_FIXTURES)) {
    fail(`--fixtures must be an integer >= ${args.smoke ? 1 : DEFAULT_FIXTURES}`);
  }
  for (const [name, value] of [["requests", args.requests], ["concurrency", args.concurrency], ["timeout-ms", args.timeoutMs], ["page-size", args.pageSize]]) {
    if (!Number.isInteger(value) || value < 1) fail(`--${name} must be an integer >= 1`);
  }
  if (!/^[a-z0-9-]+$/.test(args.prefix) || args.prefix.length > 48) {
    fail("--prefix must contain only lowercase letters, digits, and hyphens (max 48 chars)");
  }
  let baseUrl;
  try {
    baseUrl = new URL(args.base);
  } catch {
    fail("--base must be a valid local HTTP URL");
  }
  if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]", "::1"].includes(baseUrl.hostname)) {
    fail("--base is restricted to localhost, 127.0.0.1, or ::1; production and remote hosts are refused");
  }
  args.out ??= `.opencode/autosave/catalog-load-local-${new Date().toISOString().slice(0, 10)}.json`;
  return args;
}

function dockerPsql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function csv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function fixtureCopy(prefix, count) {
  const category = `${prefix}-category`;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const id = `${prefix}-${String(i).padStart(6, "0")}`;
    const subcategory = i % 2 === 0 ? "Load Audio" : "Load Accessories";
    const price = (1000 + (i % 1000)).toFixed(2);
    const offer = i % 5 === 0;
    const name = `${prefix} product ${String(i).padStart(6, "0")}`;
    const description = `${prefix} deterministic search fixture ${i}`;
    const image = `https://example.test/${prefix}/${i}.jpg`;
    const ingestedAt = new Date(Date.UTC(2025, 0, 1) + i * 1000).toISOString();
    rows.push([
      id, name, name.toLowerCase(), price, price, image, offer, category, subcategory,
      `${name} ${description}`.toLowerCase(), description, true, ingestedAt,
    ].map(csv).join(","));
  }
  return { category, rows: rows.join("\n") };
}

function seedFixtures(prefix, count) {
  const { category, rows } = fixtureCopy(prefix, count);
  const sql = String.raw`
\set ON_ERROR_STOP on
BEGIN;
DELETE FROM public.catalog_products WHERE product_id LIKE '${prefix}-%';
DELETE FROM public.catalog_categories WHERE category_name = '${category}';
DELETE FROM public.catalog_taxonomy WHERE category_name = '${category}';
COPY public.catalog_products (product_id, name, sort_name, numeric_price, original_price, image_url, en_oferta, category, subcategory, search_text, description, active, ingested_at) FROM STDIN WITH (FORMAT csv);
${rows}
\.
INSERT INTO public.catalog_categories (category_name, subcategory_name, product_count)
VALUES ('${category}', '', ${count}), ('${category}', 'Load Audio', ${Math.ceil(count / 2)}), ('${category}', 'Load Accessories', ${Math.floor(count / 2)});
INSERT INTO public.catalog_taxonomy (category_name, subcategory_name, display_order, visible)
VALUES ('${category}', NULL, 9000, true), ('${category}', 'Load Audio', 9001, true), ('${category}', 'Load Accessories', 9002, true);
COMMIT;
SELECT count(*) AS seeded FROM public.catalog_products WHERE product_id LIKE '${prefix}-%';
`;
  dockerPsql(sql);
  return { category, count };
}

function cleanupFixtures(prefix, category) {
  try {
    dockerPsql(String.raw`
\set ON_ERROR_STOP on
BEGIN;
DELETE FROM public.catalog_products WHERE product_id LIKE '${prefix}-%';
DELETE FROM public.catalog_categories WHERE category_name = '${category}';
DELETE FROM public.catalog_taxonomy WHERE category_name = '${category}';
COMMIT;
`);
  } catch (error) {
    console.error(`[catalog-load-local] cleanup failed; prefix=${prefix}`, error instanceof Error ? error.message : error);
  }
}

function percentile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((q / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(3));
}

function routePlan(category, prefix, pageSize) {
  const encodedCategory = encodeURIComponent(category);
  const encodedQuery = encodeURIComponent(`${prefix} product`);
  return [
    { name: "products-name", path: `/api/catalog/products?category=${encodedCategory}&pageSize=${pageSize}&sort=nombre` },
    { name: "products-price", path: `/api/catalog/products?category=${encodedCategory}&pageSize=${pageSize}&sort=precio&enOferta=true` },
    { name: "categories", path: "/api/catalog/categories" },
    { name: "search", path: `/api/search-products?q=${encodedQuery}&limit=${Math.min(pageSize, 48)}` },
  ];
}

async function requestOnce(base, route, timeoutMs) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(route.path, base), { signal: controller.signal });
    const body = await response.arrayBuffer();
    return { route: route.name, status: response.status, bytes: body.byteLength, latencyMs: performance.now() - started };
  } catch (error) {
    return {
      route: route.name,
      status: null,
      bytes: 0,
      latencyMs: performance.now() - started,
      error: error?.name === "AbortError" ? "timeout" : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runLoad(base, routes, args) {
  const results = [];
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= args.requests) return;
      results[index] = await requestOnce(base, routes[index % routes.length], args.timeoutMs);
    }
  }
  const started = performance.now();
  await Promise.all(Array.from({ length: Math.min(args.concurrency, args.requests) }, worker));
  const elapsedMs = performance.now() - started;
  return { results, elapsedMs };
}

function summarize(results, elapsedMs) {
  const byRoute = {};
  for (const result of results) {
    const bucket = byRoute[result.route] ??= { requests: 0, statuses: {}, errors: 0, timeouts: 0, payloadBytes: [], latenciesMs: [] };
    bucket.requests += 1;
    bucket.statuses[result.status ?? "network-error"] = (bucket.statuses[result.status ?? "network-error"] ?? 0) + 1;
    bucket.payloadBytes.push(result.bytes);
    bucket.latenciesMs.push(result.latencyMs);
    if (result.error) {
      bucket.errors += 1;
      if (result.error === "timeout") bucket.timeouts += 1;
    }
  }
  for (const bucket of Object.values(byRoute)) {
    bucket.throughputRequestsPerSecond = Number((bucket.requests / (elapsedMs / 1000)).toFixed(3));
    bucket.payload = {
      minBytes: Math.min(...bucket.payloadBytes),
      maxBytes: Math.max(...bucket.payloadBytes),
      averageBytes: Math.round(bucket.payloadBytes.reduce((a, b) => a + b, 0) / bucket.payloadBytes.length),
    };
    bucket.latenciesMs = { p50: percentile(bucket.latenciesMs, 50), p95: percentile(bucket.latenciesMs, 95), p99: percentile(bucket.latenciesMs, 99) };
    delete bucket.payloadBytes;
  }
  return { totalRequests: results.length, elapsedMs: Number(elapsedMs.toFixed(3)), throughputRequestsPerSecond: Number((results.length / (elapsedMs / 1000)).toFixed(3)), byRoute };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const before = process.cpuUsage();
  const rssBefore = process.memoryUsage().rss;
  let seeded;
  try {
    try {
      const state = execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", LOCAL_DB_CONTAINER], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
      if (state !== "true") fail(`local Supabase container ${LOCAL_DB_CONTAINER} is not running; refusing to continue`);
    } catch {
      fail(`local Supabase container ${LOCAL_DB_CONTAINER} is unavailable; refusing to continue`);
    }

    console.log(`[catalog-load-local] seed=${args.fixtures} requests=${args.requests} concurrency=${args.concurrency} base=${args.base}`);
    console.log("[catalog-load-local] estimated scope: 100k read-model rows plus four routes; no Cloudflare Worker CPU/RSS is measured");
    seeded = seedFixtures(args.prefix, args.fixtures);
    const load = await runLoad(args.base, routePlan(seeded.category, args.prefix, args.pageSize), args);
    const cpu = process.cpuUsage(before);
    const report = {
      meta: {
        harness: "catalog-load-local",
        task: "6.3",
        localOnly: true,
        databaseContainer: LOCAL_DB_CONTAINER,
        base: args.base,
        prefix: args.prefix,
        fixtures: args.fixtures,
        requests: args.requests,
        concurrency: args.concurrency,
        timeoutMs: args.timeoutMs,
        node: process.version,
        generatedAt: new Date().toISOString(),
        safety: "No .env read. No remote Supabase or Cloudflare request. Fixtures are explicitly cleaned up.",
        measurementBoundary: "CPU and RSS below are this local Node harness process only; they are not Cloudflare Worker CPU or memory.",
      },
      system: {
        localProcessCpuMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)),
        localProcessRssBeforeBytes: rssBefore,
        localProcessRssAfterBytes: process.memoryUsage().rss,
      },
      load: summarize(load.results, load.elapsedMs),
    };
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, JSON.stringify(report, null, 2), "utf8");
    console.log(`[catalog-load-local] report=${args.out}`);
    console.log(JSON.stringify(report.load, null, 2));
    const failedRequests = load.results.filter((result) => result.error || result.status < 200 || result.status >= 300).length;
    if (failedRequests === load.results.length) fail(`all HTTP requests failed; is the local Astro server running at ${args.base}?`);
    if (failedRequests > 0) fail(`${failedRequests}/${load.results.length} HTTP requests failed; see ${args.out}`);
  } finally {
    if (seeded) cleanupFixtures(args.prefix, seeded.category);
  }
}

main().catch((error) => {
  console.error(`[catalog-load-local] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
