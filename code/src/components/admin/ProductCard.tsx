import React from "react";
import { getDisplayCategoryName, getDisplaySubcategories } from "../../utils/categoryNormalization";
import type { AdminProduct } from "./hooks/useProducts";

interface ProductCardProps {
  product: AdminProduct;
  index: number;
  onToggleActive: (id: string, current: boolean) => void;
}

const ProductCard = React.memo(function ProductCard({ product, index, onToggleActive }: ProductCardProps) {
  const p = product;
  const displayCat = getDisplayCategoryName(p);
  const displaySubs = getDisplaySubcategories(p);

  return (
    <div
      className="admin-card admin-card-hover"
      style={{
        opacity: p.active ? 1 : 0.45,
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.65rem",
        animation: `slideUp 0.3s ease ${index * 30}ms both`,
      }}
    >
      {/* Top: thumbnail + info */}
      <div style={top}>
        <div style={thumb}>
          {p.img?.[0] ? (
            <img src={p.img[0]} alt="" style={thumbImg} />
          ) : (
            <div style={thumbPlaceholder}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
          )}
        </div>
        <div style={info}>
          <div style={idRow}>
            <span style={idText}>{p.id}</span>
            {p.source === "scraper" && <span className="admin-chip">Scraper</span>}
            {p.en_oferta && <span style={offerBadge}>Oferta</span>}
          </div>
          <p style={name}>{p.name}</p>
          {/* Category breadcrumb */}
          <div style={breadcrumb}>
            <span style={breadcrumbItem}>{displayCat}</span>
            {displaySubs.length > 0 && (
              <>
                <span style={breadcrumbSep}>›</span>
                <span style={breadcrumbItem}>{displaySubs[0]}</span>
                {displaySubs.length > 1 && (
                  <span style={breadcrumbMore}>+{displaySubs.length - 1}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Meta: price + date */}
      <div style={meta}>
        <span style={price}>$ {p.price}</span>
        <span style={date}>{new Date(p.updated_at).toLocaleDateString("es-UY")}</span>
      </div>

      {/* Actions */}
      <div style={actions}>
        <a href={`/admin/productos/${p.id}`} className="admin-btn admin-btn-ghost" style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </a>
        <button
          onClick={() => onToggleActive(p.id, p.active)}
          className={`admin-btn ${p.active ? "admin-btn-danger" : "admin-btn-secondary"}`}
          style={{ flex: 1, justifyContent: "center" }}
          aria-label={p.active ? `Desactivar ${p.name}` : `Activar ${p.name}`}
        >
          {p.active ? "Desactivar" : "Activar"}
        </button>
      </div>
    </div>
  );
});

export default ProductCard;

const top: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "flex-start",
};

const thumb: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 8,
  overflow: "hidden",
  flexShrink: 0,
};

const thumbImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const thumbPlaceholder: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--admin-border-light)",
  color: "var(--admin-text-secondary)",
};

const info: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const idRow: React.CSSProperties = {
  display: "flex",
  gap: "0.35rem",
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: "0.15rem",
};

const idText: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--admin-text-secondary)",
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  fontWeight: 600,
};

const offerBadge: React.CSSProperties = {
  fontSize: "0.6rem",
  background: "var(--admin-offer-bg)",
  color: "var(--admin-offer-text)",
  padding: "0.1rem 0.35rem",
  borderRadius: 4,
  fontWeight: 600,
};

const name: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 600,
  margin: 0,
  lineHeight: 1.3,
  color: "var(--admin-text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const breadcrumb: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.3rem",
  marginTop: "0.2rem",
  flexWrap: "wrap",
};

const breadcrumbItem: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--admin-chip-text)",
  background: "var(--admin-chip-bg)",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontWeight: 500,
};

const breadcrumbSep: React.CSSProperties = {
  fontSize: "0.65rem",
  color: "var(--admin-text-secondary)",
  opacity: 0.5,
};

const breadcrumbMore: React.CSSProperties = {
  fontSize: "0.65rem",
  color: "var(--admin-text-secondary)",
};

const meta: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const price: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
  color: "var(--admin-accent)",
  fontVariantNumeric: "tabular-nums",
};

const date: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--admin-text-secondary)",
};

const actions: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
};
