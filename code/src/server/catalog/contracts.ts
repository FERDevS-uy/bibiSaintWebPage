// src/server/catalog/contracts.ts
// Contratos TypeScript/HTTP del pipeline de lectura de catálogo (read model).
// Módulo puro: sin I/O, sin dependencias, compatible con Node >= 20 y Workers.
// Tarea 1.2 — scalable-catalog-read-pipeline.
//
// El cursor es opaco: codifica { s: sortName, p: productId, f: filterFingerprint,
// v: version } en base64url de JSON. El servidor valida tamaño, versión y
// fingerprint antes de construir la condición tuple de keyset (design.md).

export type CatalogErrorCode =
  | "INVALID_CURSOR"
  | "INVALID_PAGE_SIZE"
  | "VERSION_MISMATCH"
  | "FILTER_MISMATCH"
  | "PAGE_BOOTSTRAP_LIMIT"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR";

/** Error tipado del pipeline de lectura de catálogo. */
export class CatalogError extends Error {
  readonly code: CatalogErrorCode;

  constructor(code: CatalogErrorCode, message: string) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
  }
}

/** Proyección mínima de tarjeta de producto (grilla). */
export interface CatalogCardProjection {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl: string;
  enOferta: boolean;
  category: string;
  subcategory?: string;
}

/** Request de página de catálogo (listados, categorías, ofertas, búsqueda). */
export type CursorDirection = "after" | "before";

export interface CatalogPageRequest {
  category?: string;
  subcategory?: string;
  query?: string;
  sort: string;
  cursor?: string;
  pageSize?: number;
}

/** Respuesta paginada con cursor opaco y versión del snapshot lógico. */
export interface CatalogPageResponse {
  items: CatalogCardProjection[];
  nextCursor: string | null;
  hasMore: boolean;
  previousCursor: string | null;
  version: string;
  /** Total de productos activos que cumplen el MISMO filtro/universo del keyset
   *  (COUNT(*) sobre el filtro, sin cursor). Consistente en todas las páginas. */
  total: number;
}

/** Payload interno del cursor opaco. */
export interface CursorPayload {
  /** Clave de orden (sort_name o numeric_price). */
  s: string;
  /** Desempate: product_id. Nunca omitirlo en keyset (evita saltos entre páginas). */
  p: string;
  /** Fingerprint de los filtros activos de la consulta. */
  f: string;
  /** Versión del catálogo en la que se generó el cursor. */
  v: string;
  /** Absent cursors retain forward compatibility. */
  d?: CursorDirection;
}

// ---------------------------------------------------------------------------
// base64url (Unicode-safe, sin dependencias; TextEncoder/TextDecoder existen
// en Node >= 20 y en Cloudflare Workers).
// ---------------------------------------------------------------------------

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    out += B64_ALPHABET.charAt(b0 >> 2);
    out += B64_ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
    if (i + 1 < bytes.length) out += B64_ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6));
    if (i + 2 < bytes.length) out += B64_ALPHABET.charAt(b2 & 0x3f);
  }
  return out;
}

function base64UrlToBytes(raw: string): Uint8Array {
  const clean = raw.replace(/=+$/, "");
  if (clean.length === 0 || !/^[A-Za-z0-9_-]+$/.test(clean)) {
    throw new Error("invalid base64url");
  }
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let j = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const val = B64_ALPHABET.indexOf(clean.charAt(i));
    if (val === -1) throw new Error("invalid base64url");
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[j] = (buffer >> bits) & 0xff;
      j += 1;
    }
  }
  return bytes.slice(0, j);
}

// ---------------------------------------------------------------------------
// Cursor opaco
// ---------------------------------------------------------------------------

/** Codifica el payload del cursor en base64url de JSON. */
export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify({
    s: payload.s,
    p: payload.p,
    f: payload.f,
    v: payload.v,
    ...(payload.d ? { d: payload.d } : {}),
  });
  return bytesToBase64Url(new TextEncoder().encode(json));
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.s === "string" &&
    o.s.length > 0 &&
    typeof o.p === "string" &&
    o.p.length > 0 &&
    typeof o.f === "string" &&
    o.f.length > 0 &&
    typeof o.v === "string" &&
    o.v.length > 0 &&
    (o.d === undefined || o.d === "after" || o.d === "before")
  );
}

/**
 * Decodifica un cursor opaco.
 * Lanza `CatalogError` con código `INVALID_CURSOR` ante base64url inválido,
 * JSON inválido o campos faltantes/vacíos.
 */
export function decodeCursor(raw: string): CursorPayload {
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(raw);
  } catch {
    throw new CatalogError("INVALID_CURSOR", "Cursor malformado: base64url inválido");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new CatalogError("INVALID_CURSOR", "Cursor malformado: JSON inválido");
  }
  if (!isCursorPayload(parsed)) {
    throw new CatalogError("INVALID_CURSOR", "Cursor malformado: campos faltantes o vacíos");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Fingerprint de filtros
// ---------------------------------------------------------------------------

/**
 * Fingerprint determinista de filtros: claves ordenadas, valores normalizados
 * (trim + lowercase), hash djb2 en hex de 8 chars. Sin dependencias.
 * Los valores `undefined` se excluyen (equivale a no aplicar el filtro).
 */
export function filterFingerprint(filters: Record<string, string | undefined>): string {
  const entries: Array<[string, string]> = [];
  for (const key of Object.keys(filters)) {
    const value = filters[key];
    if (value === undefined) continue;
    entries.push([key, value.trim().toLowerCase()]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  let hash = 5381;
  for (const [key, value] of entries) {
    const chunk = `${key}=${value};`;
    for (let i = 0; i < chunk.length; i++) {
      hash = ((hash << 5) + hash + chunk.charCodeAt(i)) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Tamaño de página
// ---------------------------------------------------------------------------

/**
 * Acota el tamaño de página solicitado: NaN/0/negativos/undefined → default,
 * valores sobre el máximo → máximo. Devuelve siempre un entero.
 */
export function clampPageSize(requested: number | undefined, max = 48, def = 12): number {
  if (requested === undefined) return def;
  if (typeof requested !== "number" || !Number.isFinite(requested)) return def;
  if (requested <= 0) return def;
  if (requested > max) return max;
  return Math.floor(requested);
}

// ---------------------------------------------------------------------------
// Compatibilidad de cursor con filtros y versión
// ---------------------------------------------------------------------------

/**
 * Valida que un cursor decodificado sea compatible con los filtros y la versión
 * actuales. Lanza `FILTER_MISMATCH` si el fingerprint no coincide y
 * `VERSION_MISMATCH` si la versión del cursor difiere de la actual.
 */
export function assertCursorCompatible(
  payload: CursorPayload,
  filters: Record<string, string | undefined>,
  currentVersion: string,
): void {
  const expected = filterFingerprint(filters);
  if (payload.f !== expected) {
    throw new CatalogError(
      "FILTER_MISMATCH",
      "El cursor no corresponde a los filtros actuales de la consulta",
    );
  }
  if (payload.v !== currentVersion) {
    throw new CatalogError(
      "VERSION_MISMATCH",
      "El cursor corresponde a una versión anterior del catálogo",
    );
  }
}