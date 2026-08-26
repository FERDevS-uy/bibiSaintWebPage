import { useCallback, useEffect, useMemo, useState } from "react";
import ItemProductoBox from "./ItemProductBox.jsx";
import NavPag from "./NavPag.jsx";
import { parsePrice } from "../utils/price";

const BASE_URL = import.meta.env.BASE_URL || "/";
const PRODUCTS_JSON_URL = `${BASE_URL.replace(/\/$/, "")}/productos.json`;

const SORT_OPTIONS = [
  { value: "default", label: "Más Vendidos" },
  { value: "price-asc", label: "Precio: menor a mayor" },
  { value: "price-desc", label: "Precio: mayor a menor" },
  { value: "name-asc", label: "Nombre: A - Z" },
  { value: "name-desc", label: "Nombre: Z - A" },
];

export default function ListarProductos({ pageSize = 10 }) {
  const [productos, setProductos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("default");
  const [sortOpen, setSortOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ✅ leer query param del cliente
  useEffect(() => {
    const readQueryFromURL = () => {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q")?.toLowerCase() ?? "";
      setQuery(q);
    };
    readQueryFromURL();
    window.addEventListener("searchurlchange", readQueryFromURL);
    return () => window.removeEventListener("searchurlchange", readQueryFromURL);
  }, []);

  // ✅ cargar JSON (función reutilizable para el reintento)
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(PRODUCTS_JSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProductos(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // ✅ filtrar por búsqueda
  useEffect(() => {
    const result = query
      ? productos.filter((p) =>
          p.name.toLowerCase().includes(query.toLowerCase())
        )
      : productos;

    setFiltered(result);
    setPage(1);
  }, [query, productos]);

  // ✅ ordenar
  const sorted = useMemo(() => {
    if (sort === "default") return filtered;
    const copy = [...filtered];
    switch (sort) {
      case "price-asc":
        copy.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
        break;
      case "price-desc":
        copy.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
        break;
      case "name-asc":
        copy.sort((a, b) => a.name.localeCompare(b.name, "es"));
        break;
      case "name-desc":
        copy.sort((a, b) => b.name.localeCompare(a.name, "es"));
        break;
      default:
        break;
    }
    return copy;
  }, [filtered, sort]);

  // ✅ paginación
  const startIndex = (page - 1) * pageSize;
  const paginated = sorted.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const emptyList = paginated.length === 0;
  const currentSortLabel =
    SORT_OPTIONS.find((opt) => opt.value === sort)?.label ?? "Más Vendidos";

  const handleSortSelect = (value) => {
    setSort(value);
    setSortOpen(false);
    setPage(1);
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
          <button type="button" className="search-error__retry" onClick={loadCatalog}>
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
          <div className="products-toolbar">
            <button
              type="button"
              className="products-sort-trigger"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((v) => !v)}
            >
              <span className="products-sort-current">{currentSortLabel}</span>
              <svg
                className="products-sort-icon"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M9 18L9 9" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                <path d="M5.5 14.2L9 18L12.5 14.2" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 10L19 19" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                <path d="M15.5 13.8L19 10L22.5 13.8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {sortOpen && (
              <ul className="products-sort-menu" role="listbox">
                {SORT_OPTIONS.map((opt) => (
                  <li key={opt.value}>
                    <button
                      type="button"
                      className="products-sort-option"
                      onClick={() => handleSortSelect(opt.value)}
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul>
            {paginated.map((prod, idx) => (
              <ItemProductoBox
                producto={prod}
                key={`${prod.id}-${startIndex + idx}`}
              />
            ))}
          </ul>

          {totalPages !== 1 && (
            <NavPag
              actualPage={page}
              totalPages={totalPages}
              onChangePage={(newPage) => setPage(newPage)}
            />
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
