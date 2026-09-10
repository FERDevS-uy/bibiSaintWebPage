#!/usr/bin/env node
// scripts/baseline-routes.mjs
// ============================================================================
// RUNBOOK — Baseline de rutas de catálogo (Bibi Saint)
// ----------------------------------------------------------------------------
// Uso:
//   node scripts/baseline-routes.mjs \
//     --base=http://localhost:4321 --samples=5 \
//     --out=.opencode/autosave/baseline-2026-08-29.json
//
// Mide por ruta: status HTTP, latencia total (ms, performance.now alrededor del
// fetch completo) y bytes del body, y calcula p50/p95/p99 por ruta. Escribe un
// JSON con resultados + metadata. Maneja errores de conexión con mensaje claro.
//
// Cómo medir CPU del Worker real (Cloudflare Workers Logs):
//   1. Workers observability está habilitado (wrangler.jsonc → observability).
//   2. Cloudflare Dashboard → Workers → bibisaintwebpage → Logs; filtrar por la
//      ruta medida, p. ej. `request.path == "/categories/Tecno"`.
//   3. El campo "CPU time" (µs) de cada invocación es la métrica de CPU real;
//      compararlo contra el baseline local de latencia separa red de cómputo.
//   4. Para percentiles de CPU, exportar el rango de invocaciones y calcular
//      p50/p95/p99 con la misma función `percentiles` exportada aquí.
// ============================================================================

import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Percentiles por nearest-rank sobre un arreglo numérico.
 * Ordena internamente una copia; devuelve un valor por cada q (0..100).
 * @param {number[]} sorted valores de entrada (no requiere estar ordenado)
 * @param {number[]} qs percentiles a calcular (0..100)
 * @returns {number[]} un valor por cada q; NaN si la entrada está vacía
 */
export function percentiles(sorted, qs) {
  if (sorted.length === 0) return qs.map(() => Number.NaN);
  const values = [...sorted].sort((a, b) => a - b);
  return qs.map((q) => {
    if (q < 0 || q > 100) throw new RangeError(`percentil fuera de rango: ${q}`);
    const idx = Math.ceil((q / 100) * values.length) - 1;
    return values[Math.max(0, Math.min(values.length - 1, idx))];
  });
}

// Nota de drift: la ruta global /page/* (catálogo en grilla del home) se eliminó
// por desuso el 2026-09-08: nació 2025-08-21 para paginar el home, quedó huérfana
// el 2026-05-26 al pasar el home a carruseles y ahora responde 404. Por eso ya no
// se lista aquí; /ofertas/page y /categories/*/page siguen vivas y cubiertas por su
// propia paginación SSR. Ref: change scalable-catalog-read-pipeline task 3.3.
const DEFAULT_ROUTES = [
  "/",
  "/categories/Cama",
  "/categories/Tecno",
  "/ofertas",
  "/api/search-products",
];

function parseArgs(argv) {
  const args = { base: "http://localhost:4321", samples: 5, out: null };
  for (const arg of argv) {
    if (arg.startsWith("--base=")) {
      args.base = arg.slice("--base=".length);
    } else if (arg.startsWith("--samples=")) {
      args.samples = Number.parseInt(arg.slice("--samples=".length), 10);
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else {
      console.error(`[baseline] Argumento desconocido: ${arg}`);
      console.error(
        "[baseline] Uso: node scripts/baseline-routes.mjs --base=<url> --samples=<n> --out=<ruta.json>",
      );
      process.exit(2);
    }
  }
  if (!Number.isInteger(args.samples) || args.samples < 1) {
    console.error("[baseline] --samples debe ser un entero >= 1");
    process.exit(2);
  }
  if (!args.out) {
    const today = new Date().toISOString().slice(0, 10);
    args.out = join(".opencode", "autosave", `baseline-${today}.json`);
  }
  return args;
}

async function measureRoute(base, route, samples) {
  const latencies = [];
  const statuses = new Set();
  const bytes = [];
  const cacheStates = [];
  let lastError = null;
  for (let i = 0; i < samples; i++) {
    const url = new URL(route, base).href;
    const start = performance.now();
    try {
      const res = await fetch(url);
      const end = performance.now();
      const body = await res.arrayBuffer();
      latencies.push(end - start);
      statuses.add(res.status);
      bytes.push(body.byteLength);
      const edgeState =
        res.headers.get("X-Edge-Cache") ||
        res.headers.get("CF-Cache-Status") ||
        "UNKNOWN";
      cacheStates.push(String(edgeState).toUpperCase());
    } catch (err) {
      lastError = err;
      break; // error de conexión: no tiene sentido repetir la muestra
    }
  }
  if (lastError) {
    return {
      route,
      error: `No se pudo conectar a ${base}${route}: ${lastError.message}`,
    };
  }
  const [p50, p95, p99] = percentiles(latencies, [50, 95, 99]);
  const cache = {
    hit: cacheStates.filter((s) => s === "HIT").length,
    miss: cacheStates.filter((s) => s === "MISS").length,
    bypass: cacheStates.filter((s) => s === "BYPASS").length,
    other: cacheStates.filter((s) => s !== "HIT" && s !== "MISS" && s !== "BYPASS").length,
  };
  const cacheTotal = cache.hit + cache.miss + cache.bypass + cache.other;
  const cacheHitRatio = cacheTotal > 0 ? Number((cache.hit / cacheTotal).toFixed(4)) : 0;
  return {
    route,
    statuses: [...statuses],
    cache,
    cacheHitRatio,
    bytes: {
      min: Math.min(...bytes),
      max: Math.max(...bytes),
      avg: Math.round(bytes.reduce((a, b) => a + b, 0) / bytes.length),
    },
    latenciesMs: { p50, p95, p99 },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[baseline] base=${args.base} samples=${args.samples} out=${args.out}`);

  const results = [];
  for (const route of DEFAULT_ROUTES) {
    const result = await measureRoute(args.base, route, args.samples);
    results.push(result);
    if (result.error) {
      console.warn(`[baseline] ${result.error}`);
    } else {
      console.log(
        `[baseline] ${route} -> ${result.statuses.join(",")} ` +
          `cacheHitRatio=${(result.cacheHitRatio * 100).toFixed(1)}% ` +
          `p50=${result.latenciesMs.p50.toFixed(1)}ms ` +
          `p95=${result.latenciesMs.p95.toFixed(1)}ms ` +
          `p99=${result.latenciesMs.p99.toFixed(1)}ms`,
      );
    }
  }

  const allFailed = results.every((r) => r.error);
  if (allFailed) {
    console.error(
      "[baseline] Todas las rutas fallaron. ¿Está corriendo el servidor? (pnpm dev en :4321)",
    );
    process.exit(1);
  }

  const payload = {
    meta: {
      base: args.base,
      date: new Date().toISOString(),
      samples: args.samples,
      node: process.version,
      routes: DEFAULT_ROUTES,
    },
    summary: {
      cache: {
        hit: results.reduce((acc, r) => acc + (r.cache?.hit ?? 0), 0),
        miss: results.reduce((acc, r) => acc + (r.cache?.miss ?? 0), 0),
        bypass: results.reduce((acc, r) => acc + (r.cache?.bypass ?? 0), 0),
        other: results.reduce((acc, r) => acc + (r.cache?.other ?? 0), 0),
      },
    },
    results,
  };
  {
    const totalCacheSamples =
      payload.summary.cache.hit +
      payload.summary.cache.miss +
      payload.summary.cache.bypass +
      payload.summary.cache.other;
    payload.summary.cache.hitRatio =
      totalCacheSamples > 0
        ? Number((payload.summary.cache.hit / totalCacheSamples).toFixed(4))
        : 0;
  }
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[baseline] Resultados escritos en ${args.out}`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("[baseline] Error inesperado:", err);
    process.exit(1);
  });
}