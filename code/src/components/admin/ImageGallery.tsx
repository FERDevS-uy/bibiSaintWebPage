import React from "react";

interface ImageGalleryProps {
  images: string[];
  uploadingImage: boolean;
  showUrlInput: boolean;
  urlValue: string;
  onAddUrl: (url: string) => void;
  onRemove: (idx: number) => void;
  onMove: (idx: number, direction: -1 | 1) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleUrlInput: () => void;
  onUrlChange: (val: string) => void;
  onUrlCancel: () => void;
}

const ImageGallery = React.memo(function ImageGallery({
  images,
  uploadingImage,
  showUrlInput,
  urlValue,
  onAddUrl,
  onRemove,
  onMove,
  onUpload,
  onToggleUrlInput,
  onUrlChange,
  onUrlCancel,
}: ImageGalleryProps) {
  return (
    <>
      <div style={sectionActions}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <label style={uploadBtn}>
            {uploadingImage ? (
              <>
                <span style={btnSpinner} />
                Subiendo...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Subir archivo
              </>
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} style={{ display: "none" }} disabled={uploadingImage} />
          </label>
          <button type="button" onClick={onToggleUrlInput} className="admin-btn admin-btn-ghost">
            {showUrlInput ? "Cancelar" : "Pegar URL"}
          </button>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--admin-text-secondary)", margin: 0, lineHeight: 1.4 }}>
          Las imágenes de la galería están disponibles para seleccionar en cada variante de color.
        </p>
      </div>

      {showUrlInput && (
        <div style={urlInputRow}>
          <input
            type="url"
            value={urlValue}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://ejemplo.com/imagen.jpg"
            className="admin-input"
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              if (urlValue.trim()) {
                onAddUrl(urlValue.trim());
                onUrlCancel();
              }
            }}
            className="admin-btn admin-btn-primary"
          >
            Agregar
          </button>
        </div>
      )}

      {images.length > 0 ? (
        <div className="admin-gallery-grid" style={imageGrid}>
          {images.map((url, i) => (
            <div key={url} style={imageCard}>
              <div style={imageCardTop}>
                <img src={url} alt={`Imagen ${i + 1}`} style={thumbStyle} />
                <button type="button" onClick={() => onRemove(i)} style={imageRemoveBtn} aria-label="Eliminar imagen">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
              <div style={imageActions}>
                <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} style={moveBtn} aria-label="Mover izquierda">◀</button>
                <span style={imageIdx}>{i + 1}</span>
                <button type="button" onClick={() => onMove(i, 1)} disabled={i === images.length - 1} style={moveBtn} aria-label="Mover derecha">▶</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={emptyHint}>No hay imágenes en la galería. Subí un archivo o pegá una URL.</p>
      )}
    </>
  );
});

export default ImageGallery;

const btnSpinner: React.CSSProperties = {
  display: "inline-block",
  width: 14,
  height: 14,
  border: "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "var(--admin-surface)",
  borderRadius: "50%",
  animation: "spin 0.7s linear infinite",
  marginRight: "0.4rem",
  verticalAlign: "middle",
};

const sectionActions: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  marginBottom: "0.5rem",
};

const imageGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
};

const imageCard: React.CSSProperties = {
  width: 130,
  background: "var(--admin-border-light)",
  borderRadius: "var(--admin-radius-sm)",
  overflow: "hidden",
  border: "1px solid var(--admin-border)",
};

const imageCardTop: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 110,
  overflow: "hidden",
};

const thumbStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const imageRemoveBtn: React.CSSProperties = {
  position: "absolute",
  top: 4,
  right: 4,
  width: 24,
  height: 24,
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  border: "none",
  borderRadius: "50%",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const imageActions: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.3rem",
};

const moveBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "0.75rem",
  padding: "0.2rem 0.4rem",
  color: "var(--admin-text-secondary)",
};

const imageIdx: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "var(--admin-text-secondary)",
  minWidth: 16,
  textAlign: "center",
};

const uploadBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.4rem 0.8rem",
  background: "var(--admin-border)",
  borderRadius: "var(--admin-radius-sm)",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--admin-text)",
  border: "none",
  fontFamily: "inherit",
};

const urlInputRow: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginTop: "0.5rem",
};

const emptyHint: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--admin-text-secondary)",
  textAlign: "center",
  padding: "1rem 0",
  margin: 0,
};
