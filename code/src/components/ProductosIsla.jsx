import React, { useEffect, useState } from "react";
import ListarProductos from "./ListarProductos.astro";
import "../styles/global.css"
export default function ListarProductosIsland({ productosIniciales, baseURL }) {
  const [query, setQuery] = useState("");
  const [productos, setProductos] = useState(productosIniciales);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get("q")?.toLowerCase() ?? "";

    if (!q) return;

    fetch("/productos.json")
      .then(res => res.json())
      .then(all => {
        const filtered = all.filter(p => p.name.toLowerCase().includes(q));
        setProductos(filtered);
      });
  }, []);

  return (
    <>
      <input
        type="text"
        placeholder="Buscar..."
        defaultValue={query}
        onChange={ev => setQuery(ev.target.value)}
      />

      <ListarProductos
        products={productos}
        baseURL={baseURL}
        totalPages={Math.ceil(productos.length / 10)}
      />
    </>
  );
}
