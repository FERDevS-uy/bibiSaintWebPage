// src/server/catalog/legacyTelemetry.ts
// Telemetría del camino legacy O(n) del catálogo (Tarea 5.6).
// Módulo puro: solo `console`, sin I/O, sin dependencias, Worker-friendly.
//
// Propósito: cuando se ejecuta `legacySidebarCategories` o el fallback de
// `getHeaderCategories` (scan completo del catálogo), emitir un log estructurado
// SIN PII y mantener un contador en memoria. El contador persiste por isolate
// en Workers: es telemetría de logs, no estado crítico.
//
// La API solo acepta route/category/reason: nunca IP, email, user-agent ni
// query strings de usuario. `category` se sanitiza (control chars, whitespace,
// truncado) para mantener el log en una sola línea y evitar log injection.

export type LegacyFallbackRoute = "sidebar" | "header" | "catalog" | "product";

export type LegacyFallbackReason = "supabase-empty" | "supabase-error" | "legacy-path" | "csv_fallback_attempt" | "csv_fallback_success" | "csv_fallback_limit" | "csv_fallback_error";

export interface LegacyFallbackEvent {
  route: LegacyFallbackRoute;
  category: string;
  reason: LegacyFallbackReason;
  rowCount?: number;
}

const VALID_REASONS: readonly LegacyFallbackReason[] = [
  "supabase-empty",
  "supabase-error",
  "legacy-path",
  "csv_fallback_attempt",
  "csv_fallback_success",
  "csv_fallback_limit",
  "csv_fallback_error",
];

const MAX_CATEGORY_LENGTH = 64;

let fallbackCount = 0;

/** Sanitiza el valor de categoría: una sola línea, sin control chars, acotado. */
function sanitizeCategory(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CATEGORY_LENGTH);
}

/**
 * Registra una ejecución del camino legacy O(n): incrementa el contador y
 * emite el log estructurado
 * `[catalog:legacy-fallback] route=<route> category=<category> reason=<reason>`.
 * Lanza TypeError si `reason` no es una razón válida.
 */
export function recordLegacyFallback(event: LegacyFallbackEvent): void {
  if (!VALID_REASONS.includes(event.reason)) {
    throw new TypeError(`Invalid legacy fallback reason: ${String(event.reason)}`);
  }
  fallbackCount += 1;
  const category = sanitizeCategory(event.category);
  try {
    console.warn(
      `[catalog:legacy-fallback] route=${event.route} category=${category} reason=${event.reason}${event.rowCount === undefined ? "" : ` row_count=${Math.max(0, Math.floor(event.rowCount))}`}`,
    );
  } catch {
    // Telemetry is best-effort and must never change the legacy response path.
  }
}

/** Contador acumulado de ejecuciones del camino legacy (tests/observabilidad). */
export function getLegacyFallbackCount(): number {
  return fallbackCount;
}

/** Resetea el contador (uso en tests). */
export function resetLegacyTelemetry(): void {
  fallbackCount = 0;
}
