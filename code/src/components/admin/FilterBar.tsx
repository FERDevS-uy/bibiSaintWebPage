import React from "react";
import type { FilterState } from "./hooks/useProducts";

interface FilterBarProps {
  filters: FilterState;
  displayCategories: { name: string; count: number; subcategories: { name: string; count: number }[] }[];
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onClear: () => void;
  hasFilters: boolean;
}

export default function FilterBar({
  filters,
  displayCategories,
  onFilterChange,
  onClear,
  hasFilters,
}: FilterBarProps) {
  const selectedCat = displayCategories.find((c) => c.name === filters.category);
  const subcategories = selectedCat?.subcategories ?? [];

  return (
    <div style={bar}>
      <div style={row}>
        {/* Category */}
        <div style={group}>
          <label style={label}>Categoría</label>
          <select
            value={filters.category}
            onChange={(e) => {
              onFilterChange("category", e.target.value);
              onFilterChange("subcategory", "");
            }}
            style={select}
          >
            <option value="">Todas ({displayCategories.reduce((a, c) => a + c.count, 0)})</option>
            {displayCategories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </div>

        {/* Subcategory */}
        <div style={group}>
          <label style={label}>Subcategoría</label>
          <select
            value={filters.subcategory}
            onChange={(e) => onFilterChange("subcategory", e.target.value)}
            style={select}
            disabled={!filters.category || subcategories.length === 0}
          >
            <option value="">
              {filters.category
                ? `Todas (${subcategories.length})`
                : "Primero elegí categoría"}
            </option>
            {subcategories.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div style={group}>
          <label style={label}>Estado</label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange("status", e.target.value as FilterState["status"])}
            style={select}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>

        {/* Offer */}
        <label style={checkLabel}>
          <input
            type="checkbox"
            checked={filters.offer}
            onChange={(e) => onFilterChange("offer", e.target.checked)}
            style={{ accentColor: "var(--admin-accent)", width: 16, height: 16 }}
          />
          En oferta
        </label>

        {/* Clear */}
        {hasFilters && (
          <button onClick={onClear} style={clearBtn}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

const bar: React.CSSProperties = {
  marginBottom: "1.25rem",
};

const row: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const group: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
  minWidth: 140,
};

const label: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "var(--admin-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const select: React.CSSProperties = {
  padding: "0.45rem 0.7rem",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-sm)",
  fontSize: "0.85rem",
  background: "var(--admin-surface)",
  color: "var(--admin-text)",
  fontFamily: "inherit",
  outline: "none",
  cursor: "pointer",
  transition: "border-color 0.2s",
  minWidth: 130,
};

const checkLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  fontSize: "0.85rem",
  fontWeight: 500,
  color: "var(--admin-text)",
  cursor: "pointer",
  paddingBottom: "0.45rem",
};

const clearBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.45rem 0.7rem",
  background: "none",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-sm)",
  color: "var(--admin-text-secondary)",
  fontSize: "0.8rem",
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.15s",
};
