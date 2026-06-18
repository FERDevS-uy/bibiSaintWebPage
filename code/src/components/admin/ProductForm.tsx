import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

interface ProductFormData {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  subcategory: string;
  en_oferta: boolean;
  source: "manual" | "scraper";
  active: boolean;
  auto_update_price: boolean;
  external_id: string;
  images: string[];
  colors: { id: number; hex: string; name: string; images: string[]; sizes?: string[] }[];
  relacionados: string[];
  payment_links: { id: string; url: string }[];
}

const emptyForm: ProductFormData = {
  id: "",
  name: "",
  description: "",
  price: "",
  category: "",
  subcategory: "",
  en_oferta: false,
  source: "manual",
  active: true,
  auto_update_price: false,
  external_id: "",
  images: [],
  colors: [],
  relacionados: [],
  payment_links: [],
};

export default function ProductForm({ productId }: { productId?: string }) {
  const isEditing = Boolean(productId);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [relatedSearch, setRelatedSearch] = useState("");
  const [relatedResults, setRelatedResults] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!productId) return;

    supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setMessage({ type: "error", text: "Error al cargar producto: " + error.message });
          setLoading(false);
          return;
        }
        if (data) {
          const cat = (data.categories as any) ?? {};
          setForm({
            id: data.id,
            name: data.name ?? "",
            description: data.description ?? "",
            price: data.price ?? "",
            category: cat.name ?? "",
            subcategory: Array.isArray(cat.subcategories)
              ? cat.subcategories.map((s: any) => s.name).join(" | ")
              : "",
            en_oferta: data.en_oferta ?? false,
            source: data.source ?? "manual",
            active: data.active ?? true,
            auto_update_price: data.auto_update_price ?? false,
            external_id: data.external_id ?? "",
            images: Array.isArray(data.img) ? data.img : [],
            colors: Array.isArray(data.colors) ? data.colors : [],
            relacionados: Array.isArray(data.relacionados) ? data.relacionados : [],
            payment_links: Array.isArray(data.payment_link) ? data.payment_link : [],
          });
        }
        setLoading(false);
      });
  }, [productId]);

  // Autocomplete for related products
  useEffect(() => {
    if (relatedSearch.length < 2) {
      setRelatedResults([]);
      return;
    }

    const timer = setTimeout(() => {
      supabase
        .from("products")
        .select("id, name")
        .or(`name.ilike.%${relatedSearch}%,id.ilike.%${relatedSearch}%`)
        .eq("active", true)
        .limit(10)
        .then(({ data }) => setRelatedResults(data ?? []));
    }, 250);

    return () => clearTimeout(timer);
  }, [relatedSearch]);

  const updateField = <K extends keyof ProductFormData>(
    key: K,
    value: ProductFormData[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const addRelated = (id: string) => {
    if (!form.relacionados.includes(id)) {
      updateField("relacionados", [...form.relacionados, id]);
    }
    setRelatedSearch("");
    setRelatedResults([]);
  };

  const removeRelated = (id: string) => {
    updateField(
      "relacionados",
      form.relacionados.filter((r) => r !== id),
    );
  };

  const addImage = (url: string) => {
    updateField("images", [...form.images, url]);
  };

  const removeImage = (idx: number) => {
    updateField(
      "images",
      form.images.filter((_, i) => i !== idx),
    );
  };

  const moveImage = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= form.images.length) return;
    const imgs = [...form.images];
    [imgs[idx], imgs[newIdx]] = [imgs[newIdx], imgs[idx]];
    updateField("images", imgs);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "La imagen no puede superar los 5 MB" });
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["jpg", "jpeg", "png", "webp"].includes(ext)) {
      setMessage({ type: "error", text: "Formato no soportado. Usá jpg, jpeg, png o webp" });
      return;
    }

    const fileName = `${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, file);

    if (uploadError) {
      setMessage({ type: "error", text: "Error al subir imagen: " + uploadError.message });
      return;
    }

    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    if (urlData?.publicUrl) {
      addImage(urlData.publicUrl);
      setMessage({ type: "ok", text: "Imagen subida correctamente" });
    }
  };

  const handleImageUrl = () => {
    const url = prompt("Pegá la URL de la imagen:");
    if (url && url.trim()) addImage(url.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const productData = {
      name: form.name,
      description: form.description,
      price: form.price,
      img: form.images,
      categories: {
        name: form.category,
        subcategories: form.subcategory
          ? form.subcategory.split("|").map((s) => ({ name: s.trim(), count: 0 }))
          : [],
      },
      payment_link: form.payment_links,
      relacionados: form.relacionados,
      en_oferta: form.en_oferta,
      source: form.source,
      active: form.active,
      auto_update_price: form.auto_update_price,
      external_id: form.external_id || null,
      colors: form.colors,
    };

    let error;
    if (isEditing) {
      const res = await supabase
        .from("products")
        .update(productData)
        .eq("id", productId);
      error = res.error;
    } else {
      const res = await supabase.from("products").insert({
        id: form.id,
        ...productData,
      });
      error = res.error;
    }

    setSaving(false);

    if (error) {
      setMessage({ type: "error", text: "Error al guardar: " + error.message });
    } else {
      setMessage({ type: "ok", text: isEditing ? "Producto actualizado" : "Producto creado" });
    }
  };

  if (loading) return <p>Cargando formulario...</p>;

  const relatedNames = form.relacionados;

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <h1 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: "1.5rem" }}>
        {isEditing ? `Editar: ${form.id}` : "Nuevo producto"}
      </h1>

      {message && (
        <p
          style={{
            padding: "0.6rem 1rem",
            borderRadius: 6,
            background: message.type === "ok" ? "#e8f5e9" : "#fdecea",
            color: message.type === "ok" ? "#2e7d32" : "#d32f2f",
            fontWeight: 600,
            fontSize: "0.85rem",
          }}
        >
          {message.text}
        </p>
      )}

      <div style={fieldGrid}>
        <div style={fieldHalf}>
          <label style={labelStyle}>
            ID *
            <input
              type="text"
              value={form.id}
              onChange={(e) => updateField("id", e.target.value)}
              required
              disabled={isEditing}
              style={inputStyle}
            />
          </label>
        </div>
        <div style={fieldHalf}>
          <label style={labelStyle}>
            Precio (UYU)
            <input
              type="text"
              value={form.price}
              onChange={(e) => updateField("price", e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        <div style={fieldFull}>
          <label style={labelStyle}>
            Nombre *
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              required
              style={inputStyle}
            />
          </label>
        </div>

        <div style={fieldFull}>
          <label style={labelStyle}>
            Descripción
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={4}
              style={inputStyle}
            />
          </label>
        </div>

        <div style={fieldHalf}>
          <label style={labelStyle}>
            Categoría
            <input
              type="text"
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              placeholder="Ej: Hogar, Deco, Ropa..."
              style={inputStyle}
            />
          </label>
        </div>
        <div style={fieldHalf}>
          <label style={labelStyle}>
            Subcategorías
            <input
              type="text"
              value={form.subcategory}
              onChange={(e) => updateField("subcategory", e.target.value)}
              placeholder="Separadas por |"
              style={inputStyle}
            />
          </label>
        </div>

        <div style={fieldHalf}>
          <label style={labelStyle}>
            Source
            <select
              value={form.source}
              onChange={(e) => updateField("source", e.target.value as "manual" | "scraper")}
              style={inputStyle}
            >
              <option value="manual">Manual</option>
              <option value="scraper">Scraper</option>
            </select>
          </label>
        </div>
        <div style={fieldHalf}>
          <label style={labelStyle}>
            External ID (scraper)
            <input
              type="text"
              value={form.external_id}
              onChange={(e) => updateField("external_id", e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>
      </div>

      {/* Flags */}
      <div style={flagsStyle}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={form.en_oferta}
            onChange={(e) => updateField("en_oferta", e.target.checked)}
          />
          En oferta
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => updateField("active", e.target.checked)}
          />
          Activo
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={form.auto_update_price}
            onChange={(e) => updateField("auto_update_price", e.target.checked)}
          />
          Auto-actualizar precio desde scraper
        </label>
      </div>

      {/* Images */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Imágenes ({form.images.length}/10)</h2>
        <div style={imageGrid}>
          {form.images.map((url, i) => (
            <div key={i} style={imageCardStyle}>
              <img src={url} alt="" style={thumbStyle} />
              <div style={imageActions}>
                <button
                  type="button"
                  onClick={() => moveImage(i, -1)}
                  disabled={i === 0}
                  style={smallBtn}
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(i, 1)}
                  disabled={i === form.images.length - 1}
                  style={smallBtn}
                >
                  ▶
                </button>
                <button type="button" onClick={() => removeImage(i)} style={{ ...smallBtn, color: "#d32f2f" }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          {form.images.length < 10 && (
            <div style={addImageBox}>
              <label style={uploadLabel}>
                Subir archivo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  style={{ display: "none" }}
                />
              </label>
              <button type="button" onClick={handleImageUrl} style={urlBtn}>
                Pegar URL
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Related products */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Productos relacionados</h2>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Buscar producto por nombre o ID (mín. 2 caracteres)"
            value={relatedSearch}
            onChange={(e) => setRelatedSearch(e.target.value)}
            style={inputStyle}
          />
          {relatedResults.length > 0 && (
            <ul style={autocompleteStyle}>
              {relatedResults
                .filter((r) => !form.relacionados.includes(r.id))
                .map((r) => (
                  <li
                    key={r.id}
                    onClick={() => addRelated(r.id)}
                    style={autocompleteItem}
                  >
                    <strong>{r.id}</strong> — {r.name}
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div style={relatedChips}>
          {form.relacionados.map((id) => (
            <span key={id} style={chipStyle}>
              {id}
              <button
                type="button"
                onClick={() => removeRelated(id)}
                style={chipRemove}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Save */}
      <button type="submit" disabled={saving} style={saveBtn}>
        {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear producto"}
      </button>
    </form>
  );
}

// Styles
const formStyle: React.CSSProperties = {
  maxWidth: 800,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const fieldGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1rem",
};

const fieldFull: React.CSSProperties = { width: "100%" };
const fieldHalf: React.CSSProperties = { flex: "1 1 calc(50% - 0.5rem)", minWidth: 200 };

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  color: "#333",
};

const inputStyle: React.CSSProperties = {
  padding: "0.6rem 0.8rem",
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: "0.95rem",
  width: "100%",
};

const flagsStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.5rem",
  flexWrap: "wrap",
  padding: "0.5rem 0",
};

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  fontSize: "0.9rem",
  fontWeight: 500,
  cursor: "pointer",
};

const sectionStyle: React.CSSProperties = {
  borderTop: "1px solid #eee",
  paddingTop: "1rem",
  marginTop: "0.5rem",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
  marginBottom: "0.8rem",
};

const imageGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.8rem",
};

const imageCardStyle: React.CSSProperties = {
  width: 120,
  background: "#fff",
  borderRadius: 8,
  overflow: "hidden",
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
};

const thumbStyle: React.CSSProperties = {
  width: "100%",
  height: 100,
  objectFit: "cover",
  display: "block",
};

const imageActions: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: "0.3rem",
  padding: "0.3rem",
};

const smallBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "0.85rem",
  padding: "0.2rem 0.4rem",
};

const addImageBox: React.CSSProperties = {
  width: 120,
  height: 130,
  border: "2px dashed #ddd",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
};

const uploadLabel: React.CSSProperties = {
  padding: "0.3rem 0.6rem",
  background: "#f0f0f0",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 600,
};

const urlBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#1565c0",
  cursor: "pointer",
  fontSize: "0.8rem",
  textDecoration: "underline",
};

const autocompleteStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid #ddd",
  borderTop: "none",
  borderRadius: "0 0 8px 8px",
  listStyle: "none",
  margin: 0,
  padding: 0,
  zIndex: 10,
  maxHeight: 200,
  overflowY: "auto",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

const autocompleteItem: React.CSSProperties = {
  padding: "0.5rem 0.8rem",
  cursor: "pointer",
  fontSize: "0.85rem",
  borderBottom: "1px solid #f5f5f5",
};

const relatedChips: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
  marginTop: "0.5rem",
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.3rem 0.6rem",
  background: "#e3f2fd",
  borderRadius: 6,
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#1565c0",
};

const chipRemove: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#1565c0",
  fontSize: "0.8rem",
  padding: 0,
};

const saveBtn: React.CSSProperties = {
  padding: "0.8rem 2rem",
  background: "#d32f2f",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: "1rem",
  fontWeight: 700,
  cursor: "pointer",
  alignSelf: "flex-start",
  marginTop: "1rem",
};
