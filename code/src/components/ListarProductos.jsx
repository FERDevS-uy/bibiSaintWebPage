import { useEffect, useState } from "react";
import ItemProductoBox from "./ItemProductBox.jsx";
import NavPag from "./NavPag.jsx";

export default function ListarProductos({ pageSize = 10 }) {
  const [productos, setProductos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");

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

  // ✅ paginación
  const startIndex = (page - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const emptyList = paginated.length === 0;

  return (
    <section className={`listaProductos${emptyList ? " centerBox" : ""}`}>
      {emptyList && <h3 style={{ color: "gray" }}>Sin Productos</h3>}

      {!emptyList && (
        <>
          <ul>
            {paginated.map((prod) => (
              <ItemProductoBox producto={prod} key={prod.id} />
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
        }

        .listaProductos ul {
          list-style: none;
          padding: 0 10px;
        }

        @media screen and (min-width: 1000px) {
          .listaProductos ul {
            display: flex;
            flex-wrap: wrap;
            gap: 2em;
            justify-content: center;
          }
        }
        `}
      </style>
    </section>
  );
}
