// src/server/catalog/queries.ts
// Lógica de query del pipeline de lectura escalable de catálogo (read model).
// Tarea 3.1 — scalable-catalog-read-pipeline — Grupo 3.
//
// Módulo Worker-friendly: sin APIs de Node, sin dependencias externas aparte
// de los contratos internos y la bandera de lectura. Las funciones puras de
// construcción de query son testables sin Supabase (TDD); `runCatalogQuery`
// ejecuta contra el read model `catalog_products` (nunca `products`).
//
// Keyset pagination (nunca OFFSET): la condición de cursor es una tupla que
// coincide con el ORDER BY. En PostgREST la tupla `(a, b) > (x, y)` se expresa
// como la forma lógica expandida: `a > x OR (a = x AND b > y)`.

import type { CatalogCardProjection, CatalogPageRequest, CursorDirection } from "./contracts.ts";
import {
  CatalogError,
  encodeCursor,
  decodeCursor,
  filterFingerprint,
  clampPageSize,
  assertCursorCompatible,
  type CursorPayload,
} from "./contracts.ts";
import { resolveCatalogReadPath } from "./readPath.ts";
import { resolveSubcategoryFilter } from "../../utils/categoryNormalization.ts";
import { normalizeOfferOriginalPrice } from "../../utils/price.ts";
import {
  observeCatalogQuery,
  type CatalogQueryTelemetry,
} from "./queryTelemetry.ts";

// ---------------------------------------------------------------------------
// Tipos de ayuda
// ---------------------------------------------------------------------------

/** Request de página con el filtro opcional `enOferta` (no está en el contrato base). */
export interface CatalogQueryRequest extends CatalogPageRequest {
  enOferta?: boolean;
  /** Página 1-based para URLs directas; el read model la resuelve por keyset. */
  page?: number;
}

/** Cláusula ORDER BY soportada (debe coincidir con la condición de cursor). */
export type OrderByClause =
  | "sort_name ASC, product_id ASC"
  | "numeric_price ASC, sort_name ASC, product_id ASC"
  | "ingested_at DESC, product_id ASC";

/** Valores de cursor decodificados y listos para la condición keyset. */
export interface DecodedCursor {
  /** Valor de sort_name (desempate secundario en orden por precio). */
  sortValue: string;
  /** Valor de numeric_price (solo en orden por precio). */
  priceValue?: number;
  /** Valor de ingested_at (solo en orden "recientes"). */
  ingestedAt?: string;
  /** Desempate único: product_id. */
  productId: string;
}

/** Resultado de la construcción pura de la condición de cursor. */
export interface CursorCondition {
  /** Filtro PostgREST `.or()` que expresa la tupla keyset. */
  orFilter: string;
  /** ORDER BY que debe acompañar a la condición. */
  orderBy: OrderByClause;
}

// ---------------------------------------------------------------------------
// Helpers puros (testables sin Supabase)
// ---------------------------------------------------------------------------

/**
 * Determina el ORDER BY a partir del parámetro `sort`.
 * - "precio"/"price" → orden por precio numérico.
 * - "recientes" → orden por ingestión (ingested_at DESC, desempate product_id).
 * - cualquier otro (incluido vacío) → orden alfabético por sort_name.
 */
export function buildOrderByClause(sort: string): OrderByClause {
  const s = sort.toLowerCase();
  if (s === "precio" || s === "price") {
    return "numeric_price ASC, sort_name ASC, product_id ASC";
  }
  if (s === "recientes") {
    return "ingested_at DESC, product_id ASC";
  }
  return "sort_name ASC, product_id ASC";
}

/**
 * Construye el registro de filtros activos para el fingerprint.
 * `enOferta` se normaliza a string ("true"/"false") para el hash; los valores
 * `undefined` se excluyen (equivale a no aplicar el filtro).
 */
export function buildFilterRecord(
  request: CatalogQueryRequest,
): Record<string, string | undefined> {
  const record: Record<string, string | undefined> = {};
  if (request.category !== undefined) record.category = request.category;
  if (request.subcategory !== undefined) {
    const filter = resolveSubcategoryFilter(request.category ?? "", request.subcategory);
    record.subcategory = filter.kind === "group"
      ? `group:${filter.value}`
      : filter.value;
  }
  if (request.query !== undefined) record.query = request.query;
  if (request.enOferta !== undefined) record.enOferta = String(request.enOferta);
  return record;
}

// Separador interno para codificar (precio, sort_name) en el campo `s` del
// cursor cuando se ordena por precio. No aparece en nombres de producto.
const PRICE_SEP = "\u0001";

function encodePriceSort(price: number, sortName: string): string {
  return `${price}${PRICE_SEP}${sortName}`;
}

function decodePriceSort(s: string): { price: number; sortName: string } {
  const idx = s.indexOf(PRICE_SEP);
  if (idx === -1) {
    throw new CatalogError("INVALID_CURSOR", "Cursor de precio malformado");
  }
  const price = Number(s.slice(0, idx));
  if (!Number.isFinite(price)) {
    throw new CatalogError("INVALID_CURSOR", "Cursor de precio malformado");
  }
  return { price, sortName: s.slice(idx + 1) };
}

/**
 * Decodifica el payload del cursor y lo traduce a valores keyset según el
 * ORDER BY. Valida versión y fingerprint contra los filtros actuales.
 *
 * - Orden por nombre: `s` = valor de sort_name.
 * - Orden por precio: `s` = `${numeric_price}\u0001${sort_name}` (compuesto).
 * - Orden por recientes: `s` = valor de ingested_at (timestamp ISO).
 */
export function decodeCursorForOrder(
  payload: CursorPayload,
  orderBy: OrderByClause,
  filters: Record<string, string | undefined>,
  currentVersion: string,
): DecodedCursor {
  // Validar compatibilidad de fingerprint y versión (lanza FILTER_MISMATCH /
  // VERSION_MISMATCH).
  assertCursorCompatible(payload, filters, currentVersion);

  if (orderBy === "numeric_price ASC, sort_name ASC, product_id ASC") {
    const { price, sortName } = decodePriceSort(payload.s);
    return { sortValue: sortName, priceValue: price, productId: payload.p };
  }
  if (orderBy === "ingested_at DESC, product_id ASC") {
    return { sortValue: payload.s, ingestedAt: payload.s, productId: payload.p };
  }
  return { sortValue: payload.s, productId: payload.p };
}

/**
 * Construye la condición de cursor keyset (tupla, nunca OFFSET) como filtro
 * PostgREST `.or()`, expandiendo la comparación de tuplas a su forma lógica.
 *
 * - Orden por nombre: `(sort_name, product_id) > (s, p)`
 *   → `sort_name.gt.s OR (sort_name.eq.s AND product_id.gt.p)`
 * - Orden por precio: `(numeric_price, sort_name, product_id) > (price, s, p)`
 *   → `numeric_price.gt.price OR (numeric_price.eq.price AND sort_name.gt.s)
 *      OR (numeric_price.eq.price AND sort_name.eq.s AND product_id.gt.p)`
 * - Orden por recientes: `(ingested_at, product_id) < (ts, p)` (primera columna DESC)
 *   → `ingested_at.lt.ts OR (ingested_at.eq.ts AND product_id.gt.p)`
 */
export function buildCursorCondition(
  decoded: DecodedCursor,
  direction: CursorDirection = "after",
): CursorCondition {
  const before = direction === "before";
  const pid = quoteText(decoded.productId);

  if (decoded.priceValue !== undefined) {
    const price = decoded.priceValue;
    const sortName = quoteText(decoded.sortValue);
    return {
      orderBy: "numeric_price ASC, sort_name ASC, product_id ASC",
      orFilter:
        `numeric_price.${before ? "lt" : "gt"}.${price},` +
        `and(numeric_price.eq.${price},sort_name.${before ? "lt" : "gt"}.${sortName}),` +
        `and(numeric_price.eq.${price},sort_name.eq.${sortName},product_id.${before ? "lt" : "gt"}.${pid})`,
    };
  }

  if (decoded.ingestedAt !== undefined) {
    const ts = quoteText(decoded.ingestedAt);
    return {
      orderBy: "ingested_at DESC, product_id ASC",
      orFilter: `ingested_at.${before ? "gt" : "lt"}.${ts},and(ingested_at.eq.${ts},product_id.${before ? "lt" : "gt"}.${pid})`,
    };
  }

  const sortName = quoteText(decoded.sortValue);
  return {
    orderBy: "sort_name ASC, product_id ASC",
    orFilter: `sort_name.${before ? "lt" : "gt"}.${sortName},and(sort_name.eq.${sortName},product_id.${before ? "lt" : "gt"}.${pid})`,
  };
}

/** Escapa un valor de texto para un filtro PostgREST (comillas dobles). */
function quoteText(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------
// Ejecución contra Supabase
// ---------------------------------------------------------------------------

/**
 * Columnas seleccionadas: únicamente las de `CatalogCardProjection` más
 * `sort_name` (necesaria para construir el cursor). Nunca `select("*")`.
 */
const SELECT_COLUMNS = `
  id:product_id,
  name,
  price:numeric_price,
  originalPrice:original_price,
  imageUrl:image_url,
  enOferta:en_oferta,
  category,
  subcategory,
  sort_name,
  ingestedAt:ingested_at
`;

interface CatalogRow {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  imageUrl: string;
  enOferta: boolean;
  category: string;
  subcategory?: string;
  sort_name: string;
  ingestedAt?: string;
}

interface CatalogQueryResponse {
  data: unknown;
  error: unknown;
  count?: number | null;
}

function rowToProjection(row: CatalogRow): CatalogCardProjection {
  const price = Number(row.price);
  const originalPrice = normalizeOfferOriginalPrice(row.originalPrice, price);
  return {
    id: row.id,
    name: row.name,
    price,
    originalPrice: originalPrice ?? undefined,
    imageUrl: row.imageUrl,
    enOferta: Boolean(row.enOferta) && originalPrice !== null,
    category: row.category,
    subcategory: row.subcategory || undefined,
  };
}

/**
 * Ejecuta una página de catálogo sobre el read model `catalog_products`.
 *
 * Comportamiento exacto 3.1:
 * - Consulta EXCLUSIVAMENTE `catalog_products` (nunca `products`).
 * - Selecciona únicamente las columnas de `CatalogCardProjection` (nunca `*`).
 * - Filtros opcionales: category, subcategory, enOferta.
 * - `query` se ignora con TODO (se resuelve vía RPC en 3.4/3.5).
 * - Orden: sort_name ASC, product_id ASC | numeric_price ASC, sort_name ASC, product_id ASC.
 * - Condición de cursor OBLIGATORIA (tupla, nunca OFFSET).
 * - `limit + 1` → hasMore; devuelve máx `limit`; nextCursor solo si hasMore.
 * - `clampPageSize` aplicado.
 * - Decodifica cursor + valida versión (lee `catalog_version`) + fingerprint.
 * - Sin fallback O(n), sin descarga completa.
 * - Errores Supabase → CatalogError UPSTREAM_ERROR sin filtrar detalles.
 */
export async function runCatalogQuery(
  request: CatalogPageRequest,
  env: { CATALOG_READ_MODEL?: string },
  supabase: {
    from: (table: string) => any;
  },
  options?: { includeTotal?: boolean; telemetry?: CatalogQueryTelemetry },
): Promise<{
  items: CatalogCardProjection[];
  nextCursor: string | null;
  hasMore: boolean;
  version: string;
  total: number;
  previousCursor: string | null;
}> {
  if (resolveCatalogReadPath(env) !== "readmodel") {
    throw new CatalogError("UPSTREAM_ERROR", "El read model de catálogo no está habilitado");
  }

  const req = request as CatalogQueryRequest;
  const limit = clampPageSize(request.pageSize);
  const requestedPage = Math.max(1, Math.floor(req.page ?? 1));
  const bootstrapCursor = !request.cursor && requestedPage > 1;
  if (bootstrapCursor && requestedPage > 10) {
    throw new CatalogError(
      "PAGE_BOOTSTRAP_LIMIT",
      "La página solicitada excede el límite de bootstrap keyset",
    );
  }

  const versionPromise: Promise<string> = observeCatalogQuery(
    options?.telemetry,
    "catalog_version",
    async () => {
      try {
        const { data, error } = await supabase.from("catalog_version").select("version").eq("id", 1).single();
        if (error) throw new CatalogError("UPSTREAM_ERROR", "Error al leer la versión del catálogo");
        return String(data?.version ?? 0);
      } catch (err) {
        if (err instanceof CatalogError) throw err;
        throw new CatalogError("UPSTREAM_ERROR", "Error inesperado al leer la versión del catálogo");
      }
    },
  );

  const orderBy = buildOrderByClause(request.sort);
  const filters = buildFilterRecord(req);
  const includeTotal = options?.includeTotal !== false;
  let version = "";
  let decoded: DecodedCursor | null = null;
  let cursorDirection: CursorDirection = "after";

  if (request.cursor) {
    version = await versionPromise;
    let payload: CursorPayload;
    try {
      payload = decodeCursor(request.cursor);
    } catch (err) {
      if (err instanceof CatalogError) throw err;
      throw new CatalogError("INVALID_CURSOR", "Cursor inválido");
    }
    decoded = decodeCursorForOrder(payload, orderBy, filters, version);
    cursorDirection = payload.d ?? "after";
  }

  const applyFilters = (query: any) => {
    query = query.eq("active", true);
    if (req.category) query = query.eq("category", req.category);
    if (req.subcategory) {
      const filter = resolveSubcategoryFilter(req.category ?? "", req.subcategory);
      query = filter.kind === "group"
        ? query.or(`subcategory.eq."${filter.value}",subcategory.like."${filter.value} - %"`)
        : query.eq("subcategory", filter.value);
    }
    if (req.query) query = query.ilike("name", `%${escapeLike(req.query)}%`);
    if (req.enOferta === true) query = query.eq("en_oferta", true);
    return query;
  };

  const buildRowsQuery = (cursor: DecodedCursor | null, countWithRows: boolean) => {
    let query = applyFilters(
      supabase.from("catalog_products").select(SELECT_COLUMNS, countWithRows ? { count: "exact" } : undefined),
    );
    const reverse = cursorDirection === "before" && cursor !== null;
    if (orderBy === "numeric_price ASC, sort_name ASC, product_id ASC") {
      query = query.order("numeric_price", { ascending: reverse ? false : true }).order("sort_name", { ascending: reverse ? false : true }).order("product_id", { ascending: reverse ? false : true });
    } else if (orderBy === "ingested_at DESC, product_id ASC") {
      query = query.order("ingested_at", { ascending: reverse ? true : false }).order("product_id", { ascending: reverse ? false : true });
    } else {
      query = query.order("sort_name", { ascending: reverse ? false : true }).order("product_id", { ascending: reverse ? false : true });
    }
    if (cursor) query = query.or(buildCursorCondition(cursor, cursorDirection).orFilter);
    return query;
  };

  const readRows = (cursor: DecodedCursor | null, countWithRows: boolean) =>
    observeCatalogQuery<CatalogQueryResponse>(
      options?.telemetry,
      "catalog_products_page",
      () => buildRowsQuery(cursor, countWithRows).limit(limit + 1),
    );

  const readTotal = async () => {
    try {
      const countResult = await observeCatalogQuery<CatalogQueryResponse>(
        options?.telemetry,
        "catalog_products_count",
        () => applyFilters(supabase.from("catalog_products").select("product_id", { count: "exact", head: true })),
      );
      if (countResult.error) throw new CatalogError("UPSTREAM_ERROR", "Error upstream al contar el catálogo");
      return Number(countResult.count ?? 0);
    } catch (err) {
      if (err instanceof CatalogError) throw err;
      throw new CatalogError("UPSTREAM_ERROR", "Error inesperado al contar el catálogo");
    }
  };

  const cursorFromRow = (row: CatalogRow): DecodedCursor => {
    if (orderBy === "numeric_price ASC, sort_name ASC, product_id ASC") {
      return { sortValue: row.sort_name, priceValue: Number(row.price), productId: row.id };
    }
    if (orderBy === "ingested_at DESC, product_id ASC") {
      return { sortValue: String(row.ingestedAt ?? ""), ingestedAt: String(row.ingestedAt ?? ""), productId: row.id };
    }
    return { sortValue: row.sort_name, productId: row.id };
  };

  if (bootstrapCursor) {
    version = await versionPromise;
    for (let page = 1; page < requestedPage; page += 1) {
      const result = await readRows(decoded, false);
      if (result.error) throw new CatalogError("UPSTREAM_ERROR", "Error upstream al consultar el catálogo");
      const rows = (result.data ?? []) as CatalogRow[];
      const visibleRows = rows.slice(0, limit);
      if (visibleRows.length === 0) {
        return { items: [], nextCursor: null, previousCursor: null, hasMore: false, version, total: includeTotal ? await readTotal() : 0 };
      }
      decoded = cursorFromRow(visibleRows[visibleRows.length - 1]);
    }
  }

  const countWithRows = includeTotal && !request.cursor && !bootstrapCursor;
  const rowsPromise = readRows(decoded, countWithRows);
  let rowsResult: CatalogQueryResponse;
  let total = 0;
  if (includeTotal && (request.cursor || bootstrapCursor)) {
    const [resolvedRows, resolvedTotal] = await Promise.all([rowsPromise, readTotal()]);
    rowsResult = resolvedRows;
    total = resolvedTotal;
  } else {
    const [resolvedRows, resolvedVersion] = await Promise.all([rowsPromise, versionPromise]);
    rowsResult = resolvedRows;
    version = resolvedVersion;
    if (includeTotal) total = Number(rowsResult.count ?? 0);
  }

  if (rowsResult.error) throw new CatalogError("UPSTREAM_ERROR", "Error upstream al consultar el catálogo");
  const all = (rowsResult.data ?? []) as CatalogRow[];
  const hasMore = all.length > limit;
  const directionalPage = hasMore ? all.slice(0, limit) : all;
  const page = cursorDirection === "before" ? [...directionalPage].reverse() : directionalPage;
  if (!includeTotal) total = page.length;

  let nextCursor: string | null = null;
  if (page.length > 0) {
    const last = page[page.length - 1];
    const s = orderBy === "numeric_price ASC, sort_name ASC, product_id ASC"
      ? encodePriceSort(Number(last.price), last.sort_name)
      : orderBy === "ingested_at DESC, product_id ASC"
        ? String(last.ingestedAt ?? "")
        : last.sort_name;
    nextCursor = encodeCursor({ s, p: last.id, f: filterFingerprint(filters), v: version, d: "after" });
  }

  let previousCursor: string | null = null;
  if (request.cursor && page.length > 0 && (cursorDirection === "after" || hasMore)) {
    const first = page[0];
    const s = orderBy === "numeric_price ASC, sort_name ASC, product_id ASC"
      ? encodePriceSort(Number(first.price), first.sort_name)
      : orderBy === "ingested_at DESC, product_id ASC"
        ? String(first.ingestedAt ?? "")
        : first.sort_name;
    previousCursor = encodeCursor({ s, p: first.id, f: filterFingerprint(filters), v: version, d: "before" });
  }

  return { items: page.map(rowToProjection), nextCursor: hasMore || cursorDirection === "before" ? nextCursor : null, previousCursor, hasMore, version, total };
}
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
