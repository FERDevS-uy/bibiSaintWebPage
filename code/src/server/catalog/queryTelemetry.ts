// Route-correlated telemetry for bounded catalog reads.
//
// The context is request-scoped and must be passed through the read path. It
// deliberately records operation names, status, duration, and a count only;
// query text, filters, credentials, and product data never enter the log.

export type CatalogTelemetryRoute =
  | "home"
  | "catalog-page"
  | "offers"
  | "offers-page"
  | "category"
  | "category-page"
  | "subcategory"
  | "subcategory-page"
  | "product"
  | "search-page"
  | "api-products"
  | "api-categories"
  | "api-related"
  | "api-search";

export type CatalogQueryOperation =
  | "catalog_version"
  | "catalog_products_page"
  | "catalog_products_count"
  | "catalog_search"
  | "catalog_taxonomy"
  | "catalog_categories"
  | "product_related"
  | "catalog_related_products";

export interface CatalogQueryTelemetry {
  readonly route: CatalogTelemetryRoute;
  readonly requestId: string;
}

export type CatalogRuntimeEventName =
  | "catalog_degraded"
  | "catalog_legacy_decision"
  | "catalog_csv_load_attempt"
  | "catalog_retired_config";
export type CatalogRuntimeConsumer = "header" | "sidebar" | "catalog" | "search" | "product";

export interface CatalogRuntimeEvent {
  event: CatalogRuntimeEventName;
  consumer: CatalogRuntimeConsumer;
  source: "supabase_read_model";
  outcome: "degraded" | "blocked";
  errorClass: "timeout" | "upstream" | "empty" | "retired_config";
  requestId: string;
}

/** Best-effort, data-free runtime telemetry for Release A retirement gates. */
export function recordCatalogRuntimeEvent(event: CatalogRuntimeEvent): void {
  try {
    console.warn(JSON.stringify({
      event: event.event,
      consumer: sanitizeLabel(event.consumer),
      source: event.source,
      outcome: event.outcome,
      error_class: event.errorClass,
      request_id: sanitizeLabel(event.requestId),
    }));
  } catch {
    // Observability must not affect the response path.
  }
}

export function createCatalogQueryTelemetry(
  route: CatalogTelemetryRoute,
  requestId: string = globalThis.crypto.randomUUID(),
): CatalogQueryTelemetry {
  return { route, requestId };
}

/**
 * Measures one bounded Supabase operation and emits a searchable event when a
 * request context is supplied. The original result or error is preserved.
 */
export async function observeCatalogQuery<T>(
  telemetry: CatalogQueryTelemetry | undefined,
  operation: CatalogQueryOperation,
  action: () => PromiseLike<T> | T,
): Promise<T> {
  if (!telemetry) return action();

  const startedAt = performance.now();
  let status: "ok" | "error" = "ok";
  try {
    return await action();
  } catch (error) {
    status = "error";
    throw error;
  } finally {
    emitCatalogQueryTelemetry({
      route: telemetry.route,
      requestId: telemetry.requestId,
      operation,
      status,
      durationMs: performance.now() - startedAt,
    });
  }
}

interface CatalogQueryTelemetryEvent extends CatalogQueryTelemetry {
  operation: CatalogQueryOperation;
  status: "ok" | "error";
  durationMs: number;
}

function emitCatalogQueryTelemetry(event: CatalogQueryTelemetryEvent): void {
  try {
    console.info(
      JSON.stringify({
        message: "catalog query",
        route: sanitizeLabel(event.route),
        request_id: sanitizeLabel(event.requestId),
        operation: sanitizeLabel(event.operation),
        status: event.status,
        query_count: 1,
        duration_ms: Math.max(0, Math.round(event.durationMs)),
      }),
    );
  } catch {
    // Observability must never change the catalog response path.
  }
}

function sanitizeLabel(value: string): string {
  return String(value).replace(/[\r\n\t]+/g, " ").slice(0, 128);
}
