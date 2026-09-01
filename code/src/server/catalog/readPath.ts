// src/server/catalog/readPath.ts
// Bandera de lectura: decide entre la ruta actual (legacy) y el read model.
// Tarea 1.3 — scalable-catalog-read-pipeline.
//
// Este módulo NO ejecuta lógica O(n): solo decide la ruta a partir del entorno.
// La comparación entre rutas se hace con la bandera CATALOG_READ_MODEL; el
// fallback CSV es opt-in estricto (ENABLE_CSV_FALLBACK) y nunca automático.

export type CatalogReadPath = "legacy" | "readmodel";

/**
 * Resuelve la ruta de lectura del catálogo.
 * Devuelve `'readmodel'` SOLO si `CATALOG_READ_MODEL` es exactamente `'true'`.
 * Cualquier otro valor (undefined, 'false', 'TRUE', '1', basura) → `'legacy'`.
 * Default seguro: legacy — el read model no se activa por accidente.
 */
export function resolveCatalogReadPath(env: {
  CATALOG_READ_MODEL?: string | undefined;
}): CatalogReadPath {
  return env.CATALOG_READ_MODEL === "true" ? "readmodel" : "legacy";
}

/**
 * Resuelve si el fallback CSV está habilitado.
 * Devuelve `true` SOLO si `ENABLE_CSV_FALLBACK` es exactamente `'true'`.
 *
 * IMPORTANTE: en producción debe estar en `'false'` y NUNCA se activa
 * automáticamente por un error puntual de Supabase (spec: fallback CSV opt-in).
 * Un fallo del read model produce un error observable o un fallback acotado y
 * paginado, jamás un scan completo del catálogo dentro de una petición pública.
 */
export function resolveCsvFallback(env: {
  ENABLE_CSV_FALLBACK?: string | undefined;
}): boolean {
  return env.ENABLE_CSV_FALLBACK === "true";
}