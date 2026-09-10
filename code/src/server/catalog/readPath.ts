// src/server/catalog/readPath.ts
// Release A keeps this module as an observable compatibility boundary. It no
// longer selects a runtime path: every Worker request uses the read model.

export type CatalogReadPath = "readmodel";

/**
 * Runtime configuration is retained only so callers can emit retirement
 * telemetry. It cannot re-enable a legacy Worker path.
 */
export function resolveCatalogReadPath(_env: {
  CATALOG_READ_MODEL?: string | undefined;
}): CatalogReadPath {
  return "readmodel";
}

/**
 * CSV is an explicit emergency path only. Values are intentionally not
 * normalized: only the exact operator value authorizes a bounded fallback.
 */
export function resolveCsvFallback(env: {
  ENABLE_CSV_FALLBACK?: string | undefined;
}): boolean {
  return env.ENABLE_CSV_FALLBACK === "true";
}
