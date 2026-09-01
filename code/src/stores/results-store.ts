import { map } from "nanostores";

// ---------- Types ----------

export interface ResultsStoreEntry {
  items: SearchResultItem[];
  nextCursor: string | null;
  hasMore: boolean;
  version: string | null;
  total: number | null;
  loading: boolean;
  error: boolean | null;
  query: string;
  timestamp: number;
}

export interface SearchResultItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  imageUrl: string;
  img: string[];
  enOferta: boolean;
  category: string;
  subcategory?: string;
}

export interface SearchResultsPayload {
  items: SearchResultItem[];
  nextCursor: string | null;
  hasMore: boolean;
  version: string | null;
  total: number | null;
}

/** Maximum age for an in-memory search result. */
export const RESULTS_CACHE_TTL_MS = 5 * 60 * 1000;

/** Maximum number of cached search result entries. */
export const RESULTS_CACHE_MAX_ENTRIES = 50;

// ---------- Initial state ----------

const initialEntry: ResultsStoreEntry = {
  items: [],
  nextCursor: null,
  hasMore: false,
  version: null,
  total: null,
  loading: false,
  error: null,
  query: "",
  timestamp: Date.now(),
};

// ---------- Composite key ----------

/**
 * Creates a composite key from search parameters:
 * query + sortKey + cursor + version (any can be null for top-N search).
 * The key is used to index entries in the NanoStore map.
 */
export function makeSearchKey(
  query: string,
  sortKey: string | null = null,
  cursor: string | null = null,
  version: string | null = null,
): string {
  return `${query}\0${sortKey}\0${cursor}\0${version}`;
}

// ---------- Reactive NanoStore (in-memory, NOT persistent) ----------

/**
 * NanoStore indexado por key compuesto (query + sort + cursor + version).
 * Cada entry tiene: items, loading, error, query, timestamp.
 * Se usa `map` de nanostores (en memoria, no persiste a localStorage).
 */
export const resultsStore = map<Record<string, ResultsStoreEntry>>({});

// ---------- In-flight requests dedup ----------

const inFlightRequests = new Map<string, Promise<SearchResultsPayload>>();

function isInFlight(key: string): boolean {
  return inFlightRequests.has(key);
}

function deleteEntry(key: string): void {
  const currentEntries = resultsStore.get();
  if (!(key in currentEntries)) return;

  const { [key]: _removed, ...remainingEntries } = currentEntries;
  resultsStore.set(remainingEntries);
}

function isExpired(entry: ResultsStoreEntry, now: number): boolean {
  return now - entry.timestamp >= RESULTS_CACHE_TTL_MS;
}

function evictExpiredEntries(now: number): void {
  for (const [key, entry] of Object.entries(resultsStore.get())) {
    if (isExpired(entry, now) && !isInFlight(key)) {
      deleteEntry(key);
    }
  }
}

function evictOldestEntries(): void {
  const entries = Object.entries(resultsStore.get());
  if (entries.length <= RESULTS_CACHE_MAX_ENTRIES) return;

  const removableEntries = entries
    .filter(([key]) => !isInFlight(key))
    .sort(([, first], [, second]) => first.timestamp - second.timestamp);

  let entriesToRemove = entries.length - RESULTS_CACHE_MAX_ENTRIES;
  for (const [key] of removableEntries) {
    if (entriesToRemove === 0) break;
    deleteEntry(key);
    entriesToRemove -= 1;
  }
}

// ---------- Public API: read / write / clean ----------

/**
 * Guarda/actualiza una entrada en el store para el key dado.
 * Sobrescribe el entry existente; si no existe, lo crea.
 */
export function setEntry(
  key: string,
  entry: Omit<ResultsStoreEntry, "timestamp"> & { timestamp?: number },
): void {
  const now = Date.now();
  evictExpiredEntries(now);
  resultsStore.setKey(key, {
    ...entry,
    timestamp: entry.timestamp ?? now,
  });
  evictOldestEntries();
}

/**
 * Lee la entry actual para un key dado. Retorna undefined si no hay entry.
 */
export function getEntry(key: string): ResultsStoreEntry | undefined {
  const entry = resultsStore.get()[key];
  if (!entry) return undefined;

  if (isExpired(entry, Date.now())) {
    deleteEntry(key);
    return undefined;
  }

  return entry;
}

/**
 * Limpia/resetea la entry para un key dado, dejando el estado inicial.
 */
export function clearEntry(key: string): void {
  resultsStore.setKey(key, { ...initialEntry });
}

// ---------- Deduplication via AbortController ----------

/**
 * Map de controladores AbortController activos, indexados por key de búsqueda.
 * Usado para abortar fetches previos idénticos (mismo scope).
 */
const activeControllers = new Map<string, AbortController>();

/**
 * Obtiene (o crea) un AbortController activo para el key dado.
 * El caller debe señalar el `AbortController.signal` en el fetch.
 */
export function getAbortController(key: string): AbortController {
  const current = activeControllers.get(key);
  if (!current || current.signal.aborted) {
    const controller = new AbortController();
    activeControllers.set(key, controller);
  }
  return activeControllers.get(key) as AbortController;
}

/**
 * Aborta el controlador activo para el key dado y lo remueve del map.
 * Llámalo antes de iniciar un nuevo fetch con el mismo scope para evitar
   fetches concurrentes duplicados.
 */
export function abortKey(key: string): void {
  const controller = activeControllers.get(key);
  if (controller) {
    controller.abort();
    activeControllers.delete(key);
  }
}

/**
 * Resetea (remueve) el controlador activo para el key dado,
 * sin abortar. Útil después de que el fetch terminó con éxito o error.
 */
export function resetKey(key: string, controller?: AbortController): void {
  if (!controller || activeControllers.get(key) === controller) {
    activeControllers.delete(key);
  }
}

export function getInFlightRequest(key: string): Promise<SearchResultsPayload> | undefined {
  return inFlightRequests.get(key);
}

export function setInFlightRequest(
  key: string,
  promise: Promise<SearchResultsPayload>,
): void {
  inFlightRequests.set(key, promise);
}

export function clearInFlightRequest(
  key: string,
  promise?: Promise<SearchResultsPayload>,
): void {
  if (!promise || inFlightRequests.get(key) === promise) {
    inFlightRequests.delete(key);
  }
}
