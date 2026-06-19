import React from "react";

interface RelatedProduct {
  id: string;
  name: string;
}

interface RelatedProductsProps {
  relacionados: string[];
  relatedSearch: string;
  relatedResults: RelatedProduct[];
  onSearchChange: (val: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}

const RelatedProducts = React.memo(function RelatedProducts({
  relacionados,
  relatedSearch,
  relatedResults,
  onSearchChange,
  onAdd,
  onRemove,
}: RelatedProductsProps) {
  return (
    <>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder="Buscar producto por nombre o ID..."
          value={relatedSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          className="admin-input"
          aria-label="Buscar productos relacionados"
        />
        {relatedResults.length > 0 && (
          <ul style={autocompleteStyle} role="listbox">
            {relatedResults
              .filter((r) => !relacionados.includes(r.id))
              .map((r) => (
                <li
                  key={r.id}
                  onClick={() => onAdd(r.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(r.id); } }}
                  tabIndex={0}
                  role="option"
                  aria-selected={false}
                  style={autocompleteItem}
                >
                  <strong>{r.id}</strong> — {r.name}
                </li>
              ))}
          </ul>
        )}
      </div>
      {relacionados.length > 0 && (
        <div style={chipList}>
          {relacionados.map((id) => (
            <span key={id} style={chip}>
              {id}
              <button type="button" onClick={() => onRemove(id)} style={chipRemove} aria-label={`Eliminar relacionado ${id}`}>✕</button>
            </span>
          ))}
        </div>
      )}
    </>
  );
});

export default RelatedProducts;

const autocompleteStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  background: "var(--admin-surface)",
  border: "1px solid var(--admin-border)",
  borderTop: "none",
  borderRadius: "0 0 var(--admin-radius-sm) var(--admin-radius-sm)",
  listStyle: "none",
  margin: 0,
  padding: "0.25rem 0",
  zIndex: 10,
  maxHeight: 200,
  overflowY: "auto",
  boxShadow: "var(--admin-shadow-lg)",
};

const autocompleteItem: React.CSSProperties = {
  padding: "0.45rem 0.8rem",
  cursor: "pointer",
  fontSize: "0.85rem",
  color: "var(--admin-text)",
};

const chipList: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
  marginTop: "0.5rem",
};

const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.25rem 0.5rem",
  background: "var(--admin-chip-bg)",
  borderRadius: "var(--admin-radius-sm)",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--admin-chip-text)",
};

const chipRemove: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "inherit",
  fontSize: "0.8rem",
  padding: 0,
  lineHeight: 1,
  opacity: 0.6,
};
