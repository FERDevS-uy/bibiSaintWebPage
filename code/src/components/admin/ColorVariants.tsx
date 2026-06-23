import React from "react";
import { Field } from "./FormSection";
import { COMMON_SIZES, type ColorEntry } from "./hooks/useProductForm";

interface ColorVariantsProps {
  colors: ColorEntry[];
  galleryImages: string[];
  colorForm: ColorEntry;
  showColorForm: boolean;
  editingColorIndex: number | null;
  colorSizeInput: string;
  onStartEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onShowForm: () => void;
  onHideForm: () => void;
  onColorFormChange: (value: ColorEntry) => void;
  onToggleImage: (url: string) => void;
  onSetMainImage: (url: string) => void;
  onToggleSize: (size: string) => void;
  onAddCustomSize: () => void;
  onRemoveSize: (idx: number) => void;
  onSizeInputChange: (val: string) => void;
  onSaveColor: () => void;
}

export default function ColorVariants({
  colors,
  galleryImages,
  colorForm,
  showColorForm,
  editingColorIndex,
  colorSizeInput,
  onStartEdit,
  onRemove,
  onShowForm,
  onHideForm,
  onColorFormChange,
  onToggleImage,
  onSetMainImage,
  onToggleSize,
  onAddCustomSize,
  onRemoveSize,
  onSizeInputChange,
  onSaveColor,
}: ColorVariantsProps) {
  return (
    <>
      {colors.length > 0 && (
        <div style={colorGrid}>
          {colors.map((c, i) => (
            <div key={c.id} style={colorCard}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, minWidth: 0 }}>
                <div style={{ ...colorDot, background: c.hex }} />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: "0.9rem", color: "var(--admin-text)", display: "block" }}>{c.name}</strong>
                  <span style={{ fontSize: "0.75rem", color: "var(--admin-text-secondary)", display: "block" }}>
                    {c.hex}
                    {c.images.length > 0 && ` · ${c.images.length} img`}
                    {c.sizes && c.sizes.length > 0 && ` · Talles: ${c.sizes.join(", ")}`}
                  </span>
                </div>
              </div>
              {c.images.length > 0 && (
                <div style={{ display: "flex", gap: 2, marginRight: "0.5rem" }}>
                  {c.images.slice(0, 3).map((url, j) => (
                    <img
                      key={j}
                      src={url}
                      alt=""
                      style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", border: j === 0 ? "2px solid var(--admin-accent)" : "1px solid var(--admin-border)" }}
                    />
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button type="button" onClick={() => onStartEdit(i)} style={colorEditBtn} aria-label={`Editar color ${c.name}`} title="Editar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button type="button" onClick={() => onRemove(i)} style={colorRemoveBtn} aria-label={`Eliminar color ${c.name}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showColorForm ? (
        <button type="button" onClick={onShowForm} style={addColorBtn}>
          + Agregar color
        </button>
      ) : (
        <div style={colorFormCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
            <p style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0, color: "var(--admin-text)" }}>
              {editingColorIndex !== null ? `Editar: ${colorForm.name || "variante de color"}` : "Nueva variante de color"}
            </p>
            {editingColorIndex !== null && (
              <span style={{ fontSize: "0.75rem", color: "var(--admin-text-secondary)" }}>
                ID: {colorForm.id}
              </span>
            )}
          </div>

          <div style={colorFormRow}>
            <div style={colorSwatchWrap}>
              <label htmlFor="color-hex" style={{ fontSize: "0.7rem", color: "var(--admin-text-secondary)", marginBottom: "0.15rem" }}>Color</label>
              <input
                id="color-hex"
                type="color"
                value={colorForm.hex}
                onChange={(e) => onColorFormChange({ ...colorForm, hex: e.target.value })}
                style={colorPicker}
              />
              <span style={colorHexLabel}>{colorForm.hex}</span>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Field label="Nombre del color" htmlFor="color-name" error={null}>
                <input
                  id="color-name"
                  type="text"
                  value={colorForm.name}
                  onChange={(e) => onColorFormChange({ ...colorForm, name: e.target.value })}
                  placeholder="Ej: Negro, Blanco, Rojo..."
                  className="admin-input"
                />
              </Field>
            </div>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--admin-text)", margin: "0 0 0.4rem" }}>
              Imágenes para este color {colorForm.images.length > 0 && <span style={{ color: "var(--admin-text-secondary)", fontWeight: 400 }}>({colorForm.images.length} seleccionadas)</span>}
            </p>
            {galleryImages.length > 0 ? (
              <div style={colorImageSelectorGrid}>
                {galleryImages.map((url, i) => {
                  const selected = colorForm.images.includes(url);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onToggleImage(url)}
                      style={{
                        ...colorImageSelectorItem,
                        borderColor: selected ? "var(--admin-accent)" : "var(--admin-border)",
                        boxShadow: selected ? "0 0 0 2px var(--admin-accent-subtle)" : "none",
                        opacity: selected ? 1 : 0.65,
                      }}
                      aria-label={`${selected ? "Quitar" : "Agregar"} imagen ${i + 1}`}
                      aria-pressed={selected}
                      title={selected ? "Click para quitar" : "Click para agregar"}
                    >
                      <img src={url} alt={`Imagen ${i + 1}`} style={colorSelectorThumb} />
                      {selected && <span style={colorSelectorCheck}>✓</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: "0.8rem", color: "var(--admin-text-secondary)", fontStyle: "italic" }}>
                No hay imágenes en la galería. Subí imágenes primero.
              </p>
            )}
          </div>

          {colorForm.images.length > 0 && (
            <div style={{ marginTop: "0.6rem" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--admin-text-secondary)", margin: "0 0 0.3rem" }}>
                Imágenes seleccionadas <span style={{ fontWeight: 400 }}>(primera = principal)</span>
              </p>
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                {colorForm.images.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSetMainImage(url)}
                    style={colorSelectedThumbWrap}
                    title={i === 0 ? "Principal" : "Click para hacer principal"}
                    aria-label={i === 0 ? "Imagen principal" : `Hacer imagen ${i + 1} principal`}
                  >
                    <img src={url} alt="" style={colorSelectedThumb} />
                    {i === 0 && (
                      <span style={mainBadge} aria-label="Principal">★</span>
                    )}
                    {i > 0 && (
                      <span style={makeMainHint}>↑</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: "1rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--admin-text)", margin: "0 0 0.4rem" }}>
              Talles disponibles
            </p>
            <div className="admin-color-sizes" style={sizeGrid}>
              {COMMON_SIZES.map((size) => {
                const selected = (colorForm.sizes ?? []).includes(size);
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onToggleSize(size)}
                    style={{
                      ...sizeChip,
                      background: selected ? "var(--admin-accent)" : "var(--admin-border-light)",
                      color: selected ? "#fff" : "var(--admin-text)",
                      borderColor: selected ? "var(--admin-accent)" : "var(--admin-border)",
                    }}
                    aria-pressed={selected}
                    aria-label={`Talle ${size}${selected ? " (seleccionado)" : ""}`}
                  >
                    {selected && <span style={{ marginRight: "0.2rem" }}>✓</span>}
                    {size}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.4rem", alignItems: "center" }}>
              <input
                type="text"
                value={colorSizeInput}
                onChange={(e) => onSizeInputChange(e.target.value)}
                placeholder="Otro talle (ej: 3XL, 42)"
                className="admin-input"
                style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem", width: 200 }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddCustomSize(); } }}
              />
              <button type="button" onClick={onAddCustomSize} style={miniAddBtn}>+</button>
            </div>
            {(colorForm.sizes ?? []).length > 0 && (
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
                {(colorForm.sizes ?? []).map((s, i) => (
                  <span key={i} style={chip}>
                    {s}
                    <button type="button" onClick={() => onRemoveSize(i)} style={chipRemove}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={colorFormActions}>
            <button type="button" onClick={onSaveColor} className="admin-btn admin-btn-primary">
              {editingColorIndex !== null ? "Guardar cambios" : "Agregar color"}
            </button>
            <button type="button" onClick={onHideForm} className="admin-btn admin-btn-ghost">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {colors.length === 0 && !showColorForm && (
        <p style={emptyHint}>
          No hay colores. Agregá variantes para que los clientes vean las opciones disponibles.
        </p>
      )}
    </>
  );
}

const colorGrid: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const colorCard: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.7rem 1rem",
  background: "var(--admin-bg)",
  borderRadius: "var(--admin-radius-sm)",
  border: "1px solid var(--admin-border-light)",
  gap: "0.5rem",
};

const colorDot: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "2px solid var(--admin-surface)",
  boxShadow: "0 0 0 1px var(--admin-border)",
  flexShrink: 0,
};

const colorEditBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--admin-accent)",
  padding: "0.3rem",
  display: "flex",
  alignItems: "center",
  opacity: 0.7,
  flexShrink: 0,
};

const colorRemoveBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--admin-text-secondary)",
  padding: "0.3rem",
  display: "flex",
  alignItems: "center",
  opacity: 0.6,
  flexShrink: 0,
};

const addColorBtn: React.CSSProperties = {
  padding: "0.4rem 0.8rem",
  background: "var(--admin-success-bg)",
  color: "var(--admin-success)",
  border: "none",
  borderRadius: "var(--admin-radius-sm)",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 600,
  fontFamily: "inherit",
  alignSelf: "flex-start",
};

const colorFormCard: React.CSSProperties = {
  background: "var(--admin-bg)",
  borderRadius: "var(--admin-radius-sm)",
  padding: "1.2rem",
  border: "1px solid var(--admin-border-light)",
};

const colorFormRow: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const colorSwatchWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.2rem",
};

const colorPicker: React.CSSProperties = {
  width: 48,
  height: 48,
  border: "none",
  borderRadius: "var(--admin-radius-sm)",
  cursor: "pointer",
  padding: 0,
  background: "none",
};

const colorHexLabel: React.CSSProperties = {
  fontSize: "0.65rem",
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  color: "var(--admin-text-secondary)",
};

const colorFormActions: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginTop: "1rem",
  paddingTop: "1rem",
  borderTop: "1px solid var(--admin-border-light)",
};

const colorImageSelectorGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
};

const colorImageSelectorItem: React.CSSProperties = {
  position: "relative",
  width: 68,
  height: 68,
  borderRadius: "var(--admin-radius-sm)",
  overflow: "hidden",
  cursor: "pointer",
  border: "2px solid var(--admin-border)",
  padding: 0,
  background: "none",
};

const colorSelectorThumb: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const colorSelectorCheck: React.CSSProperties = {
  position: "absolute",
  top: 2,
  right: 2,
  width: 18,
  height: 18,
  background: "var(--admin-accent)",
  color: "#fff",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.65rem",
  fontWeight: 700,
  lineHeight: 1,
};

const colorSelectedThumbWrap: React.CSSProperties = {
  position: "relative",
  width: 52,
  height: 52,
  borderRadius: "var(--admin-radius-sm)",
  overflow: "hidden",
  cursor: "pointer",
  border: "2px solid var(--admin-border)",
  padding: 0,
  background: "none",
};

const colorSelectedThumb: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const mainBadge: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  fontSize: "0.75rem",
  color: "#f5c542",
  textShadow: "0 1px 3px rgba(0,0,0,0.5)",
  lineHeight: 1,
  padding: "1px",
};

const makeMainHint: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  right: 0,
  fontSize: "0.65rem",
  color: "#fff",
  background: "rgba(0,0,0,0.4)",
  borderRadius: "3px 0 0 0",
  padding: "1px 3px",
  lineHeight: 1,
};

const sizeGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
};

const sizeChip: React.CSSProperties = {
  padding: "0.35rem 0.7rem",
  borderRadius: "var(--admin-radius-sm)",
  border: "1px solid var(--admin-border)",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 600,
  fontFamily: "inherit",
  lineHeight: 1.3,
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

const miniAddBtn: React.CSSProperties = {
  padding: "0.35rem 0.6rem",
  background: "var(--admin-info)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--admin-radius-sm)",
  cursor: "pointer",
  fontSize: "1rem",
  fontWeight: 700,
  lineHeight: 1,
};

const emptyHint: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--admin-text-secondary)",
  textAlign: "center",
  padding: "1rem 0",
  margin: 0,
};
