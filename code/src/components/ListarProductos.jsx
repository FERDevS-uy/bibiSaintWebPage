import { useCallback, useEffect, useRef, useState } from "react";
import {
  getEntry,
  setEntry,
  clearEntry,
  abortKey,
  resetKey,
  getAbortController,
  makeSearchKey,
  getInFlightRequest,
  setInFlightRequest,
  clearInFlightRequest,
} from "../stores/results-store";
import ItemProductoBox from "./ItemProductBox.jsx";

const BASE_URL = import.meta.env.BASE_URL || "/";
const SEARCH_URL = `${BASE_URL.replace(/\/$/, "")}/api/search-products`;

// Listado de resultados de búsqueda (top-N por ranking).
// Tarea 3.5 — scalable-catalog-read-pipeline — Grupo 3.
//
// - Fetch a /api/search-products?q=...&limit=... cuando existe query.
// - Usa NanoStore indexado por key compuesto (query + sort + cursor + version)
//   para preservar estados de carga, error, vacío y reintento.
// - Deduplicación de requests en vuelo con AbortController (mismo patrón que
//   SearchInput.astro: abortar fetch previo de mismo scope antes de iniciar uno nuevo).
// - Estados: loading, error (con retry), empty.
// - `initialItems` (SSR, Fase 5): si el servidor ya renderizó resultados para
//   `query`, se usan como estado inicial y se omite el fetch del primer mount
//   (evita doble fetch). El fetch incremental sigue funcionando ante
//   searchurlchange con una query distinta.
export default function ListarProductos({
  query: initialQuery = "",
  pageSize = 10,
  initialItems = null,
  initialNextCursor = null,
  initialHasMore = false,
  initialVersion = null,
  initialTotal = null,
}) {
  const getSearchStateFromUrl = () => {
    if (typeof window === "undefined") {
      return {
        query: initialQuery || "",
        sort: null,
        cursor: null,
        version: null,
      };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      query: params.get("q") ?? "",
      sort: params.get("sort") ?? null,
      cursor: params.get("cursor") ?? null,
      version: params.get("v") ?? null,
    };
  };

  const initialSearchState = getSearchStateFromUrl();

  // ---------- Key compuesto para indexar en el NanoStore ----------
  // Incluye query, sortKey, cursor, version. Para search top-N, cursor y version son null.
  const [searchKey, setSearchKey] = useState(
    () => makeSearchKey(
      initialSearchState.query,
      initialSearchState.sort,
      initialSearchState.cursor,
      initialSearchState.version,
    ),
  );

  // ---------- Leer entrada del store para el key actual ----------
  const storeEntry = getEntry(searchKey);

  // ---------- Estado sincronizado con el store ----------
  // Usamos el store como fuente de verdad; caemos back a props/initialState si no hay entry.
  const [query, setQuery] = useState(initialSearchState.query);
  const [items, setItems] = useState(
    storeEntry?.items ?? initialItems ?? [],
  );
  const [nextCursor, setNextCursor] = useState(
    storeEntry?.nextCursor ?? initialNextCursor,
  );
  const [hasMore, setHasMore] = useState(
    storeEntry?.hasMore ?? initialHasMore,
  );
  const [version, setVersion] = useState(
    storeEntry?.version ?? initialVersion,
  );
  const [total, setTotal] = useState(
    storeEntry?.total ?? initialTotal,
  );
  const [loading, setLoading] = useState(
    storeEntry?.loading ?? false,
  );
  const [error, setError] = useState(storeEntry?.error ?? false);
  const mountedRef = useRef(false);
  const searchKeyRef = useRef(searchKey);
  const generationRef = useRef(0);
  const initialKeyRef = useRef(
    makeSearchKey(
      initialSearchState.query,
      initialSearchState.sort,
      initialSearchState.cursor,
      initialSearchState.version,
    ),
  );

  // ---------- Escuchar searchurlchange del cliente ----------
  // Sincroniza la query desde la URL y dispara un fetch con el nuevo key.
  // Abortamos cualquier fetch previo con el mismo scope para evitar duplicados.
  useEffect(() => {
    mountedRef.current = true;
    const readQueryFromURL = () => {
      const current = getSearchStateFromUrl();
      setQuery(current.query);
      const newKey = makeSearchKey(
        current.query,
        current.sort,
        current.cursor,
        current.version,
      );
      if (newKey === searchKeyRef.current) return;
      abortKey(searchKeyRef.current);
      searchKeyRef.current = newKey;
      generationRef.current += 1;
      setSearchKey(newKey);
      setError(false);
    };

    readQueryFromURL();
    window.addEventListener("searchurlchange", readQueryFromURL);
    return () => {
      window.removeEventListener("searchurlchange", readQueryFromURL);
      mountedRef.current = false;
      abortKey(searchKeyRef.current);
    };
  }, []);

  // ---------- Función de fetch con AbortController dedup ----------
  const loadSearch = useCallback(
    async (q) => {
      const key = searchKeyRef.current;
      const generation = generationRef.current;
      const requestState = getSearchStateFromUrl();
      const isCurrent = () => mountedRef.current && searchKeyRef.current === key && generationRef.current === generation;
      const cachedInFlight = getInFlightRequest(key);
      if (cachedInFlight) {
        try {
          const inflightPayload = await cachedInFlight;
          if (!isCurrent()) return;
          setItems(inflightPayload.items ?? []);
          setNextCursor(inflightPayload.nextCursor ?? null);
          setHasMore(Boolean(inflightPayload.hasMore));
          setVersion(inflightPayload.version ?? null);
          setTotal(inflightPayload.total ?? null);
          setLoading(false);
          setError(false);
        } catch {
          if (isCurrent()) {
            setLoading(false);
            setError(true);
          }
        }
        return;
      }

      // Abortar cualquier fetch previo con el mismo key antes de iniciar uno nuevo
      abortKey(key);

      // Crear nuevo controlador y registralo para este key
      const controller = getAbortController(key);
      setLoading(true);
      setError(false);
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      setVersion(null);
      setTotal(null);

      let requestPromise;
      try {
        requestPromise = (async () => {
          const params = new URLSearchParams();
          params.set("q", q);
          params.set("limit", String(pageSize));
          if (requestState.sort) params.set("sort", requestState.sort);
          if (requestState.cursor) params.set("cursor", requestState.cursor);
          if (requestState.version) params.set("v", requestState.version);
          const url = `${SEARCH_URL}?${params.toString()}`;
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          return {
            items: data.items ?? [],
            nextCursor: data.nextCursor ?? null,
            hasMore: Boolean(data.hasMore),
            version: data.version ?? null,
            total: typeof data.total === "number" ? data.total : null,
          };
        })();

        setInFlightRequest(key, requestPromise);

        const data = await requestPromise;
        if (!isCurrent() || controller.signal.aborted) return;
        setItems(data.items ?? []);
        setNextCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.hasMore));
        setVersion(data.version ?? null);
        setTotal(data.total ?? null);
        // Persistir resultado en el store para este key
        setEntry(key, {
          items: data.items ?? [],
          nextCursor: data.nextCursor ?? null,
          hasMore: Boolean(data.hasMore),
          version: data.version ?? null,
          total: data.total ?? null,
          loading: false,
          error: null,
          query: q,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // Fetch abortado por dedup — no hacer nada, el nuevo fetch ya correrá
          return;
        }
        if (!isCurrent()) return;
        setError(true);
        setEntry(key, {
          items: [], nextCursor: null, hasMore: false, version: null, total: null,
          loading: false, error: true, query: q,
        });
      } finally {
        if (requestPromise) clearInFlightRequest(key, requestPromise);
        // Remove only this request's controller; a newer request may own the key.
        resetKey(key, controller);
        // Solo resetear el controlador si el fetch terminó naturalmente (no por abort)
        // El caller puede llamar a resetKey si quiere, pero aquí solo limpiamos la bandera de loading
        if (isCurrent()) setLoading(false);
      }
    },
    [pageSize],
  );

  // ---------- Efecto principal: SSR-first + fetch ----------
  useEffect(() => {
    if (!query) {
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      setVersion(null);
      setTotal(null);
      setLoading(false);
      setError(false);
      // Clear store entry for empty query
      clearEntry(searchKey);
      return;
    }

    // SSR ya proveyó resultados para esta query → no re-fetch en el primer mount
    // (evita doble fetch). Si hay storeEntry con datos, úsalos y listo.
    const storeEntry = getEntry(searchKey);
    if (storeEntry) {
      setItems(storeEntry.items);
      setNextCursor(storeEntry.nextCursor ?? null);
      setHasMore(Boolean(storeEntry.hasMore));
      setVersion(storeEntry.version ?? null);
      setTotal(storeEntry.total ?? null);
      setLoading(false);
      setError(false);
      return;
    }

    if (searchKey === initialKeyRef.current && initialItems !== null && initialItems.length > 0) {
      setEntry(searchKey, {
        items: initialItems,
        nextCursor: initialNextCursor,
        hasMore: Boolean(initialHasMore),
        version: initialVersion,
        total: initialTotal,
        loading: false,
        error: null,
        query,
        timestamp: Date.now(),
      });
      setItems(initialItems);
      setNextCursor(initialNextCursor);
      setHasMore(Boolean(initialHasMore));
      setVersion(initialVersion);
      setTotal(initialTotal);
      setLoading(false);
      setError(false);
      return;
    }

    // Fetch incremental (o primer fetch) ante searchurlchange con query distinta
    loadSearch(query);
  }, [
    query,
    loadSearch,
    searchKey,
    initialItems,
    initialNextCursor,
    initialHasMore,
    initialVersion,
    initialTotal,
  ]);

  // ---------- Empty states ----------
  const emptyList = items.length === 0;

  const goToNextPage = () => {
    if (typeof window === "undefined" || !nextCursor) return;
    const url = new URL(window.location.href);
    url.searchParams.set("cursor", nextCursor);
    if (version) url.searchParams.set("v", version);
    window.history.pushState({}, "", url);
    window.dispatchEvent(new CustomEvent("searchurlchange"));
  };

  return (
    <section
      className={`listaProductos${emptyList && !loading && !error ? " centerBox" : ""}`}
    >
      {loading && (
        <div className="search-loading" role="status" aria-live="polite">
          <span className="search-loading__spinner" aria-hidden="true" />
          <span className="sr-only">Cargando productos</span>
        </div>
      )}

      {error && (
        <div className="search-error" role="alert">
          <p>No pudimos cargar los productos.</p>
          <button
            type="button"
            className="search-error__retry"
            onClick={() => loadSearch(query)}
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && emptyList && !query && (
        <h3 style={{ color: "gray" }}>Sin Productos</h3>
      )}
      {!loading && !error && emptyList && query && (
        <h3 style={{ color: "gray" }}>No se encontraron resultados para "{query}"</h3>
      )}

      {!loading && !error && !emptyList && (
        <>
          <ul>
            {items.map((prod, idx) => (
              <ItemProductoBox producto={prod} key={`${prod.id}-${idx}`} />
            ))}
          </ul>
          {hasMore && nextCursor && (
            <div className="search-pagination" aria-label="Paginación de búsqueda">
              <button
                type="button"
                className="search-pagination__next"
                onClick={goToNextPage}
              >
                Cargar más
              </button>
            </div>
          )}
        </>
      )}

      {/* estilos INLINE tal como los tenías en el .astro */}
      <style>
        {`
        section {
          max-width: var(--max-width-container);
          margin: auto;
          margin-bottom: 5em;
          padding-top: 1.5rem;
        }

        .listaProductos ul {
          display: flex;
          flex-wrap: wrap;
          width: 100%;
          max-width: 1000px;
          margin-inline: auto;
          padding: 0 0.4rem;
          gap: 1rem;
          justify-content: center;
          align-items: stretch;
          list-style: none;
        }

        .listaProductos ul > li {
          list-style: none;
        }

        .search-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 50vh;
          width: 100%;
          max-width: var(--max-width-container);
          margin-inline: auto;
        }

        .search-loading__spinner {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 4px solid rgba(0, 0, 0, 0.08);
          border-top-color: #c11010;
          border-right-color: #f0b13e;
          animation: search-spin 0.8s linear infinite;
        }

        @keyframes search-spin {
          to {
            transform: rotate(360deg);
          }
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
          border: 0;
        }

        .search-error {
          width: 100%;
          max-width: var(--max-width-container);
          margin-inline: auto;
          padding: 4rem 1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          text-align: center;
        }

        .search-error p {
          color: var(--principal-text-color);
          font-size: 1rem;
          font-weight: 600;
          margin: 0;
        }

        .search-error__retry {
          border: none;
          border-radius: 4px;
          background: #c11010;
          color: #fff;
          font-family: inherit;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-size: 0.8rem;
          padding: 10px 16px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .search-error__retry:hover {
          background: #b81c1c;
        }

        .search-pagination {
          display: flex;
          justify-content: center;
          padding: 2rem 1rem 0;
        }

        .search-pagination__next {
          border: none;
          border-radius: 4px;
          background: #c11010;
          color: #fff;
          font-family: inherit;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-size: 0.8rem;
          padding: 10px 16px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .search-pagination__next:hover {
          background: #b81c1c;
        }

        @media (prefers-reduced-motion: reduce) {
          .search-loading__spinner {
            animation: none;
          }
        }

        @media screen and (min-width: 1000px) {
          section {
            padding-top: 2.5rem;
          }
        }
        `}
      </style>
    </section>
  );
}
