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

import type { CatalogCardProjection, CatalogPageRequest } from "./contracts.ts";
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

// ---------------------------------------------------------------------------
// Tipos de ayuda
// ---------------------------------------------------------------------------

/** Request de página con el filtro opcional `enOferta` (no está en el contrato base). */
export interface CatalogQueryRequest extends CatalogPageRequest {
  enOferta?: boolean;
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
export function buildCursorCondition(decoded: DecodedCursor): CursorCondition {
  const pid = quoteText(decoded.productId);

  if (decoded.priceValue !== undefined) {
    const price = decoded.priceValue;
    const sortName = quoteText(decoded.sortValue);
    return {
      orderBy: "numeric_price ASC, sort_name ASC, product_id ASC",
      orFilter:
        `numeric_price.gt.${price},` +
        `and(numeric_price.eq.${price},sort_name.gt.${sortName}),` +
        `and(numeric_price.eq.${price},sort_name.eq.${sortName},product_id.gt.${pid})`,
    };
  }

  if (decoded.ingestedAt !== undefined) {
    const ts = quoteText(decoded.ingestedAt);
    return {
      orderBy: "ingested_at DESC, product_id ASC",
      orFilter: `ingested_at.lt.${ts},and(ingested_at.eq.${ts},product_id.gt.${pid})`,
    };
  }

  const sortName = quoteText(decoded.sortValue);
  return {
    orderBy: "sort_name ASC, product_id ASC",
    orFilter: `sort_name.gt.${sortName},and(sort_name.eq.${sortName},product_id.gt.${pid})`,
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

function rowToProjection(row: CatalogRow): CatalogCardProjection {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    originalPrice: row.originalPrice == null ? undefined : Number(row.originalPrice),
    imageUrl: row.imageUrl,
    enOferta: Boolean(row.enOferta),
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
  options?: { includeTotal?: boolean },
): Promise<{
  items: CatalogCardProjection[];
  nextCursor: string | null;
  hasMore: boolean;
  version: string;
    total: number;
}> {
  // La ruta read model solo se ejecuta si la bandera está activa.
  if (resolveCatalogReadPath(env) !== "readmodel") {
    throw new CatalogError(
      "UPSTREAM_ERROR",
      "El read model de catálogo no está habilitado",
    );
  }

  const req = request as CatalogQueryRequest;
  const limit = clampPageSize(request.pageSize);

  // 1) Iniciar la lectura de versión sin bloquear la consulta principal. En la
  // primera página no hay cursor que validar, así que versión, filas y COUNT
  // pueden viajar a Supabase en el mismo round-trip lógico.
  const versionPromise: Promise<string> = (async () => {
    try {
      const { data, error } = await supabase
        .from("catalog_version")
        .select("version")
        .eq("id", 1)
        .single();
      if (error) {
        throw new CatalogError("UPSTREAM_ERROR", "Error al leer la versión del catálogo");
      }
      return String(data?.version ?? 0);
    } catch (err) {
      if (err instanceof CatalogError) throw err;
      throw new CatalogError("UPSTREAM_ERROR", "Error inesperado al leer la versión del catálogo");
    }
  })();

  let version = "";

  // 2) Determinar ORDER BY y decodificar/validar el cursor.
  const orderBy = buildOrderByClause(request.sort);
  const filters = buildFilterRecord(req);

  let decoded: DecodedCursor | null = null;
  if (request.cursor) {
    // Las páginas posteriores sí deben validar la versión antes de aplicar el
    // keyset; esta espera no afecta la navegación normal entre categorías.
    version = await versionPromise;
    let payload: CursorPayload;
    try {
      payload = decodeCursor(request.cursor);
    } catch (err) {
      if (err instanceof CatalogError) throw err;
      throw new CatalogError("INVALID_CURSOR", "Cursor inválido");
    }
    // Valida fingerprint (FILTER_MISMATCH) y versión (VERSION_MISMATCH → 409).
    decoded = decodeCursorForOrder(payload, orderBy, filters, version);
  }

  // 3) Construir la consulta sobre catalog_products (nunca products).
  //
  // FUENTE DE VERDAD de `category`/`subcategory`:
  // - En el read model, estos valores ya vienen normalizados y persistidos por
  //   el trigger `catalog_products_trigger_fn()` (migraciones 007 y 010), que
  //   replica en SQL la lógica de `src/utils/categoryNormalization.ts`.
  // - Para el path LEGACY (CSV / derivación runtime), la fuente de verdad es
  //   `categoryNormalization.ts` (`getDisplayCategoryName` /
  //   `getDisplaySubcategories` / `inferTecnoSubcategory`).
  // - DRIFT RISK: si cambiás la normalización en JS, actualizá también el CASE
  //   SQL del trigger; de lo contrario el read model y el path legacy divergen.
  const includeTotal = options?.includeTotal !== false;
  const countWithRows = includeTotal && !request.cursor;
  let query = supabase
    .from("catalog_products")
    .select(SELECT_COLUMNS, countWithRows ? { count: "exact" } : undefined)
    .eq("active", true);

  if (req.category) query = query.eq("category", req.category);
  if (req.subcategory) {
    const filter = resolveSubcategoryFilter(req.category ?? "", req.subcategory);
    if (filter.kind === "group") {
      query = query.or(
        `subcategory.eq."${filter.value}",subcategory.like."${filter.value} - %"`,
      );
    } else {
      query = query.eq("subcategory", filter.value);
    }
  }
  if (req.query) query = query.ilike("name", `%${escapeLike(req.query)}%`);
  if (req.enOferta === true) query = query.eq("en_oferta", true);

  // 4) ORDER BY (multi-columna: encadenar .order() por columna).
  if (orderBy === "numeric_price ASC, sort_name ASC, product_id ASC") {
    query = query
      .order("numeric_price", { ascending: true })
      .order("sort_name", { ascending: true })
      .order("product_id", { ascending: true });
  } else if (orderBy === "ingested_at DESC, product_id ASC") {
    query = query
      .order("ingested_at", { ascending: false })
      .order("product_id", { ascending: true });
  } else {
    query = query.order("sort_name", { ascending: true }).order("product_id", { ascending: true });
  }

  // 5) Condición de cursor keyset (nunca OFFSET).
  if (decoded) {
    const condition = buildCursorCondition(decoded);
    query = query.or(condition.orFilter);
  }

  // 6/7) Ejecutar la página (limit + 1) y el COUNT en paralelo. Ambas
  // consultas son independientes; serializarlas añadía un round-trip completo
  // a Supabase en cada navegación SSR.
  const rowsPromise = query.limit(limit + 1);

  // COUNT(*) sobre el MISMO filtro/universo del keyset (sin cursor) para
  //    exponer un `total` consistente en todas las páginas (riesgo R2).
  //    Nunca carga el catálogo completo: es un COUNT con head:true.
  let total = 0;
  let rowsResult: { data: unknown; error: unknown; count?: number | null };
  if (includeTotal && request.cursor) {
    try {
      let countQuery = supabase
        .from("catalog_products")
        .select("product_id", { count: "exact", head: true })
        .eq("active", true);
      if (req.category) countQuery = countQuery.eq("category", req.category);
       if (req.subcategory) {
         const filter = resolveSubcategoryFilter(req.category ?? "", req.subcategory);
         if (filter.kind === "group") {
           countQuery = countQuery.or(
             `subcategory.eq."${filter.value}",subcategory.like."${filter.value} - %"`,
           );
         } else {
           countQuery = countQuery.eq("subcategory", filter.value);
         }
       }
      if (req.query) countQuery = countQuery.ilike("name", `%${escapeLike(req.query)}%`);
      if (req.enOferta === true) countQuery = countQuery.eq("en_oferta", true);
      const [resolvedRows, countResult] = await Promise.all([rowsPromise, countQuery]);
      rowsResult = resolvedRows;
      const { count, error: countError } = countResult;
      if (countError) {
        throw new CatalogError("UPSTREAM_ERROR", "Error upstream al contar el catálogo");
      }
      total = Number(count ?? 0);
    } catch (err) {
      if (err instanceof CatalogError) throw err;
      throw new CatalogError("UPSTREAM_ERROR", "Error inesperado al contar el catálogo");
    }
  } else {
    // Primera página: el mismo SELECT devuelve filas + Content-Range exacto.
    // La versión corre en paralelo, eliminando dos esperas seriales del SSR.
    const [resolvedRows, resolvedVersion] = await Promise.all([rowsPromise, versionPromise]);
    rowsResult = resolvedRows;
    version = resolvedVersion;
    if (includeTotal) total = Number(rowsResult.count ?? 0);
  }

  const { data: rows, error } = rowsResult;
  if (error) {
    throw new CatalogError("UPSTREAM_ERROR", "Error upstream al consultar el catálogo");
  }

  const all = (rows ?? []) as CatalogRow[];
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;
  if (!includeTotal) {
    // En rutas sin paginador/total visible (ej. Home) evitamos COUNT exacto.
    total = page.length;
  }

  // 8) Construir nextCursor desde el último elemento de la página (si hasMore).
  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1];
    const s =
      orderBy === "numeric_price ASC, sort_name ASC, product_id ASC"
        ? encodePriceSort(Number(last.price), last.sort_name)
        : orderBy === "ingested_at DESC, product_id ASC"
          ? String(last.ingestedAt ?? "")
          : last.sort_name;
    const payload: CursorPayload = {
      s,
      p: last.id,
      f: filterFingerprint(filters),
      v: version,
    };
    nextCursor = encodeCursor(payload);
  }

  return {
    items: page.map(rowToProjection),
    nextCursor,
    hasMore,
    version,
    total,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
