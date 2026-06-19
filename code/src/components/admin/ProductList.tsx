import React from "react";
import { useProducts } from "./hooks/useProducts";
import { useDebounce } from "./hooks/useDebounce";
import { usePendingToast } from "./toastUtils";
import FilterBar from "./FilterBar";
import Pagination from "./Pagination";
import ProductCard from "./ProductCard";

export default function ProductList() {
  const { toast: pendingToast, dismiss: dismissToast } = usePendingToast();
  const {
    products,
    totalCount,
    loading,
    page,
    setPage,
    totalPages,
    filters,
    updateFilter,
    clearFilters,
    toggleActive,
    displayCategories,
    hasFilters,
  } = useProducts();

  // Debounce search input
  const [searchInput, setSearchInput] = React.useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync debounced value to filter
  React.useEffect(() => {
    updateFilter("search", debouncedSearch);
  }, [debouncedSearch, updateFilter]);

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={pageTitle}>Productos</h1>
          <p style={pageSub}>
            {totalCount} resultado{totalCount !== 1 ? "s" : ""}
            {totalPages > 1 && ` · Página ${page + 1} de ${totalPages}`}
          </p>
        </div>
        <div style={headerRight}>
          <a href="/admin/productos/nuevo" className="admin-btn admin-btn-primary" style={{ textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo producto
          </a>
          <div style={searchWrap}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--admin-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Buscar por nombre o ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={searchInputStyle}
              aria-label="Buscar productos"
            />
          </div>
        </div>
      </div>

      {/* Pending toast from redirect */}
      {pendingToast && (
        <div
          role="alert"
          className={`admin-notif ${pendingToast.type === "ok" ? "admin-notif-ok" : "admin-notif-error"}`}
          style={{ marginBottom: "1rem" }}
        >
          <span>{pendingToast.text}</span>
          <button onClick={dismissToast} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0.15rem", display: "flex", alignItems: "center", opacity: 0.7 }} aria-label="Cerrar notificación">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* Filters */}
      <FilterBar
        filters={filters}
        displayCategories={displayCategories}
        onFilterChange={updateFilter}
        onClear={clearFilters}
        hasFilters={hasFilters}
      />

      {/* Loading skeleton */}
      {loading && products.length === 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.85rem" }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ background: "var(--admin-surface)", borderRadius: "var(--admin-radius)", padding: "1.25rem", boxShadow: "var(--admin-shadow)" }}>
              <div className="admin-skeleton" style={{ height: 12, width: "50%", marginBottom: "0.5rem" }} />
              <div className="admin-skeleton" style={{ height: 10, width: "80%", marginBottom: "0.5rem" }} />
              <div className="admin-skeleton" style={{ height: 14, width: "30%" }} />
            </div>
          ))}
        </div>
      )}

      {/* Product grid */}
      {!loading || products.length > 0 ? (
        <div style={gridStyle}>
          {products.map((p, idx) => (
            <ProductCard
              key={p.id}
              product={p}
              index={idx}
              onToggleActive={toggleActive}
            />
          ))}
        </div>
      ) : null}

      {/* Empty state */}
      {!loading && products.length === 0 && (
        <div style={emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--admin-text-secondary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p style={{ margin: "0.5rem 0 0", color: "var(--admin-text-secondary)", fontSize: "0.9rem" }}>
            {hasFilters || searchInput ? "No se encontraron productos con esos filtros." : "No hay productos todavía."}
          </p>
          {(hasFilters || searchInput) && (
            <button
              onClick={() => { clearFilters(); setSearchInput(""); }}
              className="admin-btn admin-btn-ghost"
              style={{ marginTop: "0.75rem" }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

const wrap: React.CSSProperties = {
  animation: "slideUp 0.3s ease",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "1rem",
  flexWrap: "wrap",
  gap: "1rem",
};

const headerRight: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  alignItems: "center",
  flexWrap: "wrap",
};

const pageTitle: React.CSSProperties = {
  fontFamily: "var(--admin-font-serif)",
  fontSize: "1.6rem",
  fontWeight: 400,
  margin: 0,
  color: "var(--admin-text)",
  lineHeight: 1.2,
};

const pageSub: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--admin-text-secondary)",
  margin: "0.15rem 0 0 0",
};

const searchWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.55rem 0.85rem",
  background: "var(--admin-surface)",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-sm)",
  boxShadow: "var(--admin-shadow-sm)",
  width: "100%",
  maxWidth: 280,
  transition: "border-color 0.2s, box-shadow 0.2s",
};

const searchInputStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  outline: "none",
  fontSize: "0.9rem",
  color: "var(--admin-text)",
  width: "100%",
  fontFamily: "inherit",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "0.85rem",
};

const emptyState: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "4rem 2rem",
  textAlign: "center",
};
