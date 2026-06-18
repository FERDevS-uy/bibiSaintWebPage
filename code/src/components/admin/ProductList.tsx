import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

interface Product {
  id: string;
  name: string;
  price: string;
  en_oferta: boolean;
  active: boolean;
  source: string;
  updated_at: string;
}

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("products")
      .select("id, name, price, en_oferta, active, source, updated_at")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("Error loading products:", error);
        else setProducts(data ?? []);
        setLoading(false);
      });
  }, []);

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("products")
      .update({ active: !current })
      .eq("id", id);

    if (error) {
      alert("Error al actualizar: " + error.message);
      return;
    }

    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !current } : p)),
    );
  };

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <p>Cargando productos...</p>;

  return (
    <div>
      <div style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800 }}>
          Productos
        </h1>
        <input
          type="text"
          placeholder="Buscar por nombre o ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={searchStyle}
        />
      </div>

      <div style={gridStyle}>
        {filtered.map((p) => (
          <div key={p.id} style={{ ...cardStyle, opacity: p.active ? 1 : 0.4 }}>
            <div style={cardHeader}>
              <span style={idStyle}>{p.id}</span>
              {p.source === "scraper" && <span style={scraperBadge}>Scraper</span>}
              {p.en_oferta && <span style={offerBadge}>Oferta</span>}
            </div>
            <p style={nameStyle}>{p.name}</p>
            <p style={priceStyle}>${p.price}</p>
            <p style={dateStyle}>
              Actualizado: {new Date(p.updated_at).toLocaleDateString("es-UY")}
            </p>
            <div style={actionsStyle}>
              <a href={`/admin/productos/${p.id}`} style={editBtn}>
                Editar
              </a>
              <button
                onClick={() => toggleActive(p.id, p.active)}
                style={p.active ? deactivateBtn : activateBtn}
              >
                {p.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p style={{ textAlign: "center", color: "#999", marginTop: "3rem" }}>
          No se encontraron productos.
        </p>
      )}
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "1.5rem",
  flexWrap: "wrap",
  gap: "1rem",
};

const searchStyle: React.CSSProperties = {
  padding: "0.6rem 1rem",
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: "0.95rem",
  width: "100%",
  maxWidth: 320,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "1rem",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: "1rem",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  transition: "opacity 0.2s",
};

const cardHeader: React.CSSProperties = {
  display: "flex",
  gap: "0.4rem",
  alignItems: "center",
  flexWrap: "wrap",
};

const idStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#999",
  fontFamily: "monospace",
};

const scraperBadge: React.CSSProperties = {
  fontSize: "0.7rem",
  background: "#e8f5e9",
  color: "#2e7d32",
  padding: "0.15rem 0.45rem",
  borderRadius: 4,
  fontWeight: 600,
};

const offerBadge: React.CSSProperties = {
  fontSize: "0.7rem",
  background: "#fff3e0",
  color: "#e65100",
  padding: "0.15rem 0.45rem",
  borderRadius: 4,
  fontWeight: 600,
};

const nameStyle: React.CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 600,
  margin: 0,
  lineHeight: 1.3,
};

const priceStyle: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 700,
  color: "#d32f2f",
  margin: 0,
};

const dateStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#aaa",
  margin: 0,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginTop: "0.5rem",
};

const editBtn: React.CSSProperties = {
  flex: 1,
  textAlign: "center",
  padding: "0.4rem",
  background: "#f0f0f0",
  color: "#333",
  textDecoration: "none",
  borderRadius: 6,
  fontSize: "0.85rem",
  fontWeight: 600,
};

const deactivateBtn: React.CSSProperties = {
  flex: 1,
  padding: "0.4rem",
  background: "#fdecea",
  color: "#d32f2f",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: 600,
};

const activateBtn: React.CSSProperties = {
  flex: 1,
  padding: "0.4rem",
  background: "#e8f5e9",
  color: "#2e7d32",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: 600,
};
