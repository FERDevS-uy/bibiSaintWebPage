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
 * The old flag is deliberately ignored during Release A. Release B removes the
 * compatibility surface after the zero-use observation window.
 */
export function resolveCsvFallback(_env: {
  ENABLE_CSV_FALLBACK?: string | undefined;
}): boolean {
  return false;
}
