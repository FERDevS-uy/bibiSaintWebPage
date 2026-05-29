import { useEffect, useMemo, useState } from "react";
import ItemProductoBox from "./ItemProductBox.jsx";
import NavPag from "./NavPag.jsx";

const SORT_OPTIONS = [
  { value: "default", label: "Más Vendidos" },
  { value: "price-asc", label: "Precio: menor a mayor" },
  { value: "price-desc", label: "Precio: mayor a menor" },
  { value: "name-asc", label: "Nombre: A - Z" },
  { value: "name-desc", label: "Nombre: Z - A" },
];

function parsePrice(value) {
  if (value === undefined || value === null) return 0;
  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

export default function ListarProductos({ pageSize = 10 }) {
  const [productos, setProductos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("default");
  const [sortOpen, setSortOpen] = useState(false);

  // ✅ obtener query param del cliente
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q")?.toLowerCase() ?? "";
    setQuery(q);
  }, []);

  // ✅ cargar JSON
  useEffect(() => {
    fetch("/productos.json")
      .then((res) => res.json())
      .then((data) => setProductos(data));
  }, []);

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
    <section className={`listaProductos${emptyList ? " centerBox" : ""}`}>
      {emptyList && <h3 style={{ color: "gray" }}>Sin Productos</h3>}

      {!emptyList && (
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
