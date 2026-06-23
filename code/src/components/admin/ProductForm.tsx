import React from "react";
import { useProductForm } from "./hooks/useProductForm";
import { Section, Field, Toggle } from "./FormSection";
import ImageGallery from "./ImageGallery";
import ColorVariants from "./ColorVariants";
import RelatedProducts from "./RelatedProducts";
import Modal from "./Modal";

export default function ProductForm({ productId }: { productId?: string }) {
  const {
    form, isEditing, loading, saving, notification, setNotification,
    priceError, availableCategories, categoriesLoading, availableSubcategories,
    newImageUrl, setNewImageUrl, showImageUrlInput, setShowImageUrlInput,
    uploadingImage, addImage, removeImage, moveImage, handleImageUpload,
    colorForm, setColorForm, showColorForm, setShowColorForm,
    editingColorIndex, setEditingColorIndex, colorSizeInput, setColorSizeInput,
    toggleColorImage, setColorMainImage, toggleColorSize, addCustomSize, removeColorSize,
    startEditColor, addColor, removeColor,
    relatedSearch, setRelatedSearch, relatedResults, addRelated, removeRelated,
    updateField, handlePriceChange, handlePriceBlur, handleSubmit,
    nameInputRef, priceInputRef,
  } = useProductForm(productId);

  if (loading) {
    return (
      <div style={loadingWrap}>
        <div className="admin-skeleton" style={{ height: 14, width: 300 }} />
        <div className="admin-skeleton" style={{ height: 100, width: "100%" }} />
        <div className="admin-skeleton" style={{ height: 100, width: "100%" }} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={formStyle}>
      <div style={headerBar}>
        <div>
          <h1 style={titleStyle}>
            {isEditing ? `Editar: ${form.id}` : "Nuevo producto"}
          </h1>
          <p style={subtitleStyle}>
            {isEditing
              ? "Modificá los datos del producto"
              : "Completá los datos para crear un nuevo producto"}
          </p>
        </div>
        <div style={headerActions}>
          <button
            type="submit"
            disabled={saving}
            className="admin-btn admin-btn-primary"
          >
            {saving ? (
              <>
                <span style={btnSpinner} />
                Guardando...
              </>
            ) : isEditing ? (
              "Guardar cambios"
            ) : (
              "Crear producto"
            )}
          </button>
        </div>
      </div>

      {notification && (
        <Modal
          open={!!notification}
          onClose={() => setNotification(null)}
          type={notification.type}
          title={notification.type === "ok" ? "Éxito" : "Error"}
        >
          {notification.text}
        </Modal>
      )}

      <Section title="Información básica">
        <div style={fieldGrid}>
          <div style={fieldFull}>
            <Field label="Nombre del producto *" htmlFor="product-name" error={null}>
              <input
                id="product-name"
                ref={nameInputRef}
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
                aria-required="true"
                placeholder="Ej: Vestido Floreado Verano"
                className="admin-input"
              />
            </Field>
          </div>
          <div style={fieldHalf}>
            <Field label="Precio (UYU) *" htmlFor="product-price" error={priceError}>
              <input
                id="product-price"
                ref={priceInputRef}
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => handlePriceChange(e.target.value)}
                onBlur={handlePriceBlur}
                required
                aria-required="true"
                aria-invalid={!!priceError}
                placeholder="0"
                className="admin-input"
              />
            </Field>
          </div>
          <div style={fieldFull}>
            <Field label="Descripción" htmlFor="product-desc" error={null}>
              <textarea
                id="product-desc"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={4}
                placeholder="Descripción del producto..."
                className="admin-input"
                style={{ resize: "vertical", minHeight: 80 }}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Categoría y estado" loading={categoriesLoading}>
        <div style={catRow}>
          <Field label="Categoría *" htmlFor="product-category" error={null}>
            <select
              id="product-category"
              value={form.category}
              onChange={(e) => { updateField("category", e.target.value); updateField("subcategory", ""); }}
              required
              aria-required="true"
              className="admin-input"
            >
              <option value="">-- Seleccionar --</option>
              {availableCategories.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Subcategoría" htmlFor="product-subcategory" error={null}>
            <select
              id="product-subcategory"
              value={form.subcategory}
              onChange={(e) => updateField("subcategory", e.target.value)}
              className="admin-input"
              disabled={!form.category || availableSubcategories.length === 0}
            >
              <option value="">
                {form.category ? "-- Seleccionar --" : "-- Primero elegí categoría --"}
              </option>
              {availableSubcategories.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <div style={flagsRow}>
          <Toggle checked={form.en_oferta} onChange={(v) => updateField("en_oferta", v)} label="En oferta" />
          <Toggle checked={form.active} onChange={(v) => updateField("active", v)} label="Activo" />
          <Toggle
            checked={form.auto_update_price}
            onChange={(v) => updateField("auto_update_price", v)}
            label="Auto-actualizar precio"
            title="Actualiza automáticamente el precio desde el proveedor"
          />
        </div>
      </Section>

      <Section title={`Galería de imágenes (${form.images.length}/20)`}>
        <ImageGallery
          images={form.images}
          uploadingImage={uploadingImage}
          showUrlInput={showImageUrlInput}
          urlValue={newImageUrl}
          onAddUrl={addImage}
          onRemove={removeImage}
          onMove={moveImage}
          onUpload={handleImageUpload}
          onToggleUrlInput={() => setShowImageUrlInput((v) => !v)}
          onUrlChange={setNewImageUrl}
          onUrlCancel={() => { setNewImageUrl(""); setShowImageUrlInput(false); }}
        />
      </Section>

      <Section title={`Variantes de color (${form.colors.length})`}>
        <ColorVariants
          colors={form.colors}
          galleryImages={form.images}
          colorForm={colorForm}
          showColorForm={showColorForm}
          editingColorIndex={editingColorIndex}
          colorSizeInput={colorSizeInput}
          onStartEdit={startEditColor}
          onRemove={removeColor}
          onShowForm={() => setShowColorForm(true)}
          onHideForm={() => { setShowColorForm(false); setColorForm({ id: 0, hex: "#cccccc", name: "", images: [], sizes: [] }); setEditingColorIndex(null); setColorSizeInput(""); }}
          onColorFormChange={setColorForm}
          onToggleImage={toggleColorImage}
          onSetMainImage={setColorMainImage}
          onToggleSize={toggleColorSize}
          onAddCustomSize={addCustomSize}
          onRemoveSize={removeColorSize}
          onSizeInputChange={setColorSizeInput}
          onSaveColor={addColor}
        />
      </Section>

      <Section title="Productos relacionados">
        <RelatedProducts
          relacionados={form.relacionados}
          relatedSearch={relatedSearch}
          relatedResults={relatedResults}
          onSearchChange={setRelatedSearch}
          onAdd={addRelated}
          onRemove={removeRelated}
        />
      </Section>

      <div style={bottomBar}>
        <button
          type="submit"
          disabled={saving}
          className="admin-btn admin-btn-primary"
        >
          {saving ? (
            <>
              <span style={btnSpinner} />
              Guardando...
            </>
          ) : isEditing ? (
            "Guardar cambios"
          ) : (
            "Crear producto"
          )}
        </button>
      </div>
    </form>
  );
}

const formStyle: React.CSSProperties = {
  maxWidth: 860,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
  animation: "slideUp 0.3s ease",
};

const loadingWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
  padding: "2rem",
  maxWidth: 860,
  margin: "0 auto",
};

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

const headerBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  flexWrap: "wrap",
};

const headerActions: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--admin-font-serif)",
  fontSize: "1.5rem",
  fontWeight: 400,
  margin: 0,
  color: "var(--admin-text)",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--admin-text-secondary)",
  margin: "0.2rem 0 0 0",
};

const fieldGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1rem",
};

const fieldFull: React.CSSProperties = { width: "100%" };
const fieldHalf: React.CSSProperties = { flex: "1 1 calc(50% - 0.5rem)", minWidth: 220 };

const catRow: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  flexWrap: "wrap",
  width: "100%",
};

const flagsRow: React.CSSProperties = {
  display: "flex",
  gap: "1.5rem",
  flexWrap: "wrap",
  marginTop: "0.75rem",
  paddingTop: "0.75rem",
  borderTop: "1px solid var(--admin-border-light)",
};

const bottomBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  paddingTop: "0.5rem",
};
