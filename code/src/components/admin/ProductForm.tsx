import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  getDisplayCategoryName,
  getDisplaySubcategories,
} from "../../utils/categoryNormalization";
import { setPendingToast } from "./toastUtils";

interface ColorEntry {
  id: number;
  hex: string;
  name: string;
  images: string[];
  sizes?: string[];
}

interface ProductFormData {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  subcategory: string;
  en_oferta: boolean;
  active: boolean;
  auto_update_price: boolean;
  images: string[];
  colors: ColorEntry[];
  relacionados: string[];
}

async function getNextNumericId(): Promise<string> {
  try {
    const { data } = await supabase.from("products").select("id");
    if (!data) return "1";
    const nums = data
      .map((r) => parseInt(r.id, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return String(max + 1);
  } catch {
    return String(Date.now()).slice(-6);
  }
}

const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Talle único"];

function emptyForm(): ProductFormData {
  return {
    id: "",
    name: "",
    description: "",
    price: "",
    category: "",
    subcategory: "",
    en_oferta: false,
    active: true,
    auto_update_price: false,
    images: [],
    colors: [],
    relacionados: [],
  };
}

interface CategoryOption {
  name: string;
  subcategories: string[];
}

export default function ProductForm({ productId }: { productId?: string }) {
  const isEditing = Boolean(productId);
  const [form, setForm] = useState<ProductFormData>(() => emptyForm());
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [relatedSearch, setRelatedSearch] = useState("");
  const [relatedResults, setRelatedResults] = useState<Array<{ id: string; name: string }>>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [colorForm, setColorForm] = useState<ColorEntry>({
    id: 0,
    hex: "#cccccc",
    name: "",
    images: [],
    sizes: [],
  });
  const [showColorForm, setShowColorForm] = useState(false);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [colorSizeInput, setColorSizeInput] = useState("");

  useEffect(() => {
    supabase
      .from("products")
      .select("categories, img, id")
      .then(({ data, error }) => {
        if (!error && data) {
          const catMap = new Map<string, Set<string>>();
          for (const row of data) {
            const product = {
              id: row.id ?? "",
              categories: row.categories ?? { name: "", subcategories: [] },
              img: row.img ?? [],
            } as any;
            const catName = getDisplayCategoryName(product);
            if (!catName) continue;
            if (!catMap.has(catName)) catMap.set(catName, new Set());
            const subs = getDisplaySubcategories(product);
            for (const s of subs) {
              if (s) catMap.get(catName)!.add(s);
            }
          }
          const cats: CategoryOption[] = [];
          for (const [name, subs] of catMap) {
            cats.push({ name, subcategories: [...subs].sort() });
          }
          cats.sort((a, b) => a.name.localeCompare(b.name));
          setAvailableCategories(cats);
        }
        setCategoriesLoading(false);
      });
  }, []);

  useEffect(() => {
    if (isEditing) return;
    getNextNumericId().then((nextId) =>
      setForm((prev) => ({ ...prev, id: nextId }))
    );
  }, [isEditing]);

  useEffect(() => {
    if (!productId) return;
    supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setNotification({ type: "error", text: "Error al cargar producto: " + error.message });
          setLoading(false);
          return;
        }
        if (data) {
          const rawCat = (data.categories as any) ?? {};
          const mockProduct = {
            id: data.id,
            categories: rawCat,
            img: data.img ?? [],
          } as any;
          const displayCategoryName = getDisplayCategoryName(mockProduct);
          const displaySubcategories = getDisplaySubcategories(mockProduct);

          const allImgs = new Set<string>();
          if (Array.isArray(data.img)) data.img.forEach((u: string) => allImgs.add(u));
          if (Array.isArray(data.colors)) {
            data.colors.forEach((c: any) => {
              if (Array.isArray(c.images)) c.images.forEach((u: string) => allImgs.add(u));
            });
          }

          setForm({
            id: data.id,
            name: data.name ?? "",
            description: data.description ?? "",
            price: data.price ?? "",
            category: displayCategoryName,
            subcategory: displaySubcategories[0] ?? "",
            en_oferta: data.en_oferta ?? false,
            active: data.active ?? true,
            auto_update_price: data.auto_update_price ?? false,
            images: Array.from(allImgs),
            colors: Array.isArray(data.colors) ? data.colors : [],
            relacionados: Array.isArray(data.relacionados) ? data.relacionados : [],
          });
        }
        setLoading(false);
      });
  }, [productId]);

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

  const notify = useCallback((type: "ok" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const updateField = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validatePrice = useCallback((value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return "El precio es obligatorio.";
    const num = parseFloat(trimmed);
    if (Number.isNaN(num) || num <= 0) return "El precio debe ser un valor positivo.";
    return null;
  }, []);

  const handlePriceChange = (value: string) => {
    updateField("price", value);
    if (priceError) setPriceError(null);
  };

  const handlePriceBlur = () => {
    setPriceError(validatePrice(form.price));
  };

  const addRelated = (id: string) => {
    if (!form.relacionados.includes(id)) {
      updateField("relacionados", [...form.relacionados, id]);
    }
    setRelatedSearch("");
    setRelatedResults([]);
  };

  const removeRelated = (id: string) => {
    updateField("relacionados", form.relacionados.filter((r) => r !== id));
  };

  const addImage = (url: string) => {
    if (form.images.length >= 20) {
      notify("error", "Máximo 20 imágenes");
      return;
    }
    updateField("images", [...form.images, url]);
  };

  const removeImage = (idx: number) => {
    const url = form.images[idx];
    updateField("images", form.images.filter((_, i) => i !== idx));
    form.colors.forEach((c, ci) => {
      if (c.images.includes(url)) {
        const newColors = [...form.colors];
        newColors[ci] = { ...c, images: c.images.filter((u) => u !== url) };
        updateField("colors", newColors);
      }
    });
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
      notify("error", "La imagen no puede superar los 5 MB");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["jpg", "jpeg", "png", "webp"].includes(ext)) {
      notify("error", "Formato no soportado. Usá jpg, jpeg, png o webp");
      return;
    }
    setUploadingImage(true);
    const fileName = `${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, file);
    if (uploadError) {
      notify("error", "Error al subir imagen: " + uploadError.message);
      setUploadingImage(false);
      return;
    }
    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);
    if (urlData?.publicUrl) {
      addImage(urlData.publicUrl);
      notify("ok", "Imagen subida correctamente");
    }
    setUploadingImage(false);
  };

  const toggleColorImage = (url: string) => {
    setColorForm((prev) => ({
      ...prev,
      images: prev.images.includes(url)
        ? prev.images.filter((u) => u !== url)
        : [...prev.images, url],
    }));
  };

  const setColorMainImage = (url: string) => {
    setColorForm((prev) => {
      const without = prev.images.filter((u) => u !== url);
      return { ...prev, images: [url, ...without] };
    });
  };

  const toggleColorSize = (size: string) => {
    setColorForm((prev) => ({
      ...prev,
      sizes: (prev.sizes ?? []).includes(size)
        ? (prev.sizes ?? []).filter((s) => s !== size)
        : [...(prev.sizes ?? []), size],
    }));
  };

  const addCustomSize = () => {
    const s = colorSizeInput.trim().toUpperCase();
    if (!s) return;
    if ((colorForm.sizes ?? []).includes(s)) {
      setColorSizeInput("");
      return;
    }
    setColorForm((prev) => ({
      ...prev,
      sizes: [...(prev.sizes ?? []), s],
    }));
    setColorSizeInput("");
  };

  const removeColorSize = (idx: number) => {
    setColorForm((prev) => ({
      ...prev,
      sizes: (prev.sizes ?? []).filter((_, i) => i !== idx),
    }));
  };

  const startEditColor = (index: number) => {
    const color = form.colors[index];
    setColorForm({
      id: color.id,
      hex: color.hex,
      name: color.name,
      images: [...color.images],
      sizes: [...(color.sizes ?? [])],
    });
    setEditingColorIndex(index);
    setShowColorForm(true);
    setColorSizeInput("");
  };

  const addColor = () => {
    if (!colorForm.name.trim()) {
      notify("error", "El color necesita un nombre");
      return;
    }
    if (colorForm.images.length === 0) {
      notify("error", "Seleccioná al menos una imagen de la galería para este color");
      return;
    }
    const updatedColor: ColorEntry = {
      id: editingColorIndex !== null ? form.colors[editingColorIndex].id : Date.now(),
      hex: colorForm.hex,
      name: colorForm.name.trim(),
      images: [...colorForm.images],
      sizes: [...(colorForm.sizes ?? [])],
    };
    if (editingColorIndex !== null) {
      setForm((prev) => {
        const newColors = [...prev.colors];
        newColors[editingColorIndex] = updatedColor;
        return { ...prev, colors: newColors };
      });
      notify("ok", "Color actualizado correctamente");
    } else {
      setForm((prev) => ({ ...prev, colors: [...prev.colors, updatedColor] }));
    }
    setColorForm({ id: 0, hex: "#cccccc", name: "", images: [], sizes: [] });
    setShowColorForm(false);
    setEditingColorIndex(null);
    setColorSizeInput("");
  };

  const removeColor = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      colors: prev.colors.filter((_, i) => i !== idx),
    }));
  };

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setNotification(null);
    try {
      const res = await fetch(`/api/importar-martina?url=${encodeURIComponent(importUrl.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        notify("error", data.error || "Error al importar desde Martina");
        setImporting(false);
        return;
      }
      updateField("name", data.name || "");
      updateField("description", data.description || "");
      updateField("price", data.price || "");
      if (data.images && data.images.length > 0) {
        updateField("images", data.images);
      }
      if (data.colors && data.colors.length > 0) {
        updateField("colors", data.colors);
      }
      if (data.category && availableCategories.find((c) => c.name === data.category)) {
        updateField("category", data.category);
        if (
          data.subcategory &&
          availableCategories
            .find((c) => c.name === data.category)
            ?.subcategories.includes(data.subcategory)
        ) {
          updateField("subcategory", data.subcategory);
        }
      }
      notify("ok", "Producto importado desde Martina correctamente");
      setShowImport(false);
      setImportUrl("");
    } catch (err: any) {
      notify("error", "Error de conexión: " + (err?.message || "desconocido"));
    }
    setImporting(false);
  };

  const availableSubcategories =
    availableCategories.find((c) => c.name === form.category)?.subcategories ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      notify("error", "El nombre del producto es obligatorio");
      (document.getElementById("product-name") as HTMLInputElement)?.focus();
      return;
    }
    const priceErr = validatePrice(form.price);
    if (priceErr) {
      setPriceError(priceErr);
      notify("error", priceErr);
      (document.getElementById("product-price") as HTMLInputElement)?.focus();
      return;
    }
    if (!form.category) {
      notify("error", "Seleccioná una categoría para el producto");
      return;
    }
    setSaving(true);
    setNotification(null);

    const productData = {
      name: form.name,
      description: form.description,
      price: form.price || "0",
      img: form.images,
      categories: {
        name: form.category,
        subcategories: form.subcategory ? [{ name: form.subcategory, count: 0 }] : [],
      },
      relacionados: form.relacionados,
      en_oferta: form.en_oferta,
      source: "manual",
      active: form.active,
      auto_update_price: form.auto_update_price,
      colors: form.colors,
    };

    let error;
    if (isEditing) {
      const res = await supabase.from("products").update(productData).eq("id", productId);
      error = res.error;
    } else {
      const res = await supabase.from("products").insert({ id: form.id, ...productData });
      error = res.error;
    }

    setSaving(false);
    if (error) {
      notify("error", "Error al guardar: " + error.message);
    } else {
      const msg = isEditing ? "Producto actualizado correctamente" : "Producto creado correctamente";
      setPendingToast({ type: "ok", text: msg });
      setTimeout(() => {
        window.location.href = "/admin";
      }, 400);
    }
  };

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
      {/* Header */}
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
          {!isEditing && !showImport && (
            <button type="button" onClick={() => setShowImport(true)} className="admin-btn admin-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Importar de Martina
            </button>
          )}
          {!isEditing && showImport && (
            <div style={importRow}>
              <input
                type="text"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="URL o ID del producto..."
                style={importInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleImport();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="admin-btn admin-btn-primary"
              >
                {importing ? "..." : "Importar"}
              </button>
              <button
                type="button"
                onClick={() => { setShowImport(false); setImportUrl(""); }}
                style={iconBtn}
                aria-label="Cancelar importación"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            className="admin-btn admin-btn-primary"
            style={{ padding: "0.65rem 1.4rem", fontSize: "0.9rem" }}
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

      {/* Notification */}
      {notification && (
        <div role="alert" className={`admin-notif ${notification.type === "ok" ? "admin-notif-ok" : "admin-notif-error"}`}>
          <span>{notification.text}</span>
          <button onClick={() => setNotification(null)} style={notifClose} aria-label="Cerrar notificación">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* Información básica */}
      <Section title="Información básica">
        <div style={fieldGrid}>
          <div style={fieldFull}>
            <Field label="Nombre del producto *" htmlFor="product-name" error={null}>
              <input
                id="product-name"
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
                placeholder="Ej: Vestido Floreado Verano"
                className="admin-input"
              />
            </Field>
          </div>
          <div style={fieldHalf}>
            <Field label="Precio (UYU) *" htmlFor="product-price" error={priceError}>
              <input
                id="product-price"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => handlePriceChange(e.target.value)}
                onBlur={handlePriceBlur}
                placeholder="0"
                className="admin-input"
                aria-required="true"
                aria-invalid={priceError ? "true" : "false"}
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

      {/* Categoría */}
      <Section title="Categoría y estado" loading={categoriesLoading}>
        <div style={catRow}>
          <Field label="Categoría *" htmlFor="product-category" error={null}>
            <select
              id="product-category"
              value={form.category}
              onChange={(e) => { updateField("category", e.target.value); updateField("subcategory", ""); }}
              className="admin-input"
              aria-required="true"
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

      {/* Galería de imágenes */}
      <Section title={`Galería de imágenes (${form.images.length}/20)`}>
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
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} style={{ display: "none" }} disabled={uploadingImage} />
            </label>
            <button type="button" onClick={() => setShowImageUrlInput(!showImageUrlInput)} className="admin-btn admin-btn-ghost">
              {showImageUrlInput ? "Cancelar" : "Pegar URL"}
            </button>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--admin-text-secondary)", margin: 0, lineHeight: 1.4 }}>
            Las imágenes de la galería están disponibles para seleccionar en cada variante de color.
          </p>
        </div>

        {showImageUrlInput && (
          <div style={urlInputRow}>
            <input
              type="url"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              placeholder="https://ejemplo.com/imagen.jpg"
              className="admin-input"
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                if (newImageUrl.trim()) {
                  addImage(newImageUrl.trim());
                  setNewImageUrl("");
                  setShowImageUrlInput(false);
                }
              }}
              className="admin-btn admin-btn-primary"
            >
              Agregar
            </button>
          </div>
        )}

        {form.images.length > 0 ? (
          <div style={imageGrid}>
            {form.images.map((url, i) => (
              <div key={i} style={imageCard}>
                <div style={imageCardTop}>
                  <img src={url} alt={`Imagen ${i + 1}`} style={thumbStyle} />
                  <button type="button" onClick={() => removeImage(i)} style={imageRemoveBtn} aria-label="Eliminar imagen">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
                <div style={imageActions}>
                  <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} style={moveBtn} aria-label="Mover izquierda">◀</button>
                  <span style={imageIdx}>{i + 1}</span>
                  <button type="button" onClick={() => moveImage(i, 1)} disabled={i === form.images.length - 1} style={moveBtn} aria-label="Mover derecha">▶</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={emptyHint}>No hay imágenes en la galería. Subí un archivo o pegá una URL.</p>
        )}
      </Section>

      {/* Variantes de color */}
      <Section title={`Variantes de color (${form.colors.length})`}>
        {/* Existing colors */}
        {form.colors.length > 0 && (
          <div style={colorGrid}>
            {form.colors.map((c, i) => (
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
                  <button type="button" onClick={() => startEditColor(i)} style={colorEditBtn} aria-label={`Editar color ${c.name}`} title="Editar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button type="button" onClick={() => removeColor(i)} style={colorRemoveBtn} aria-label={`Eliminar color ${c.name}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add color form */}
        {!showColorForm ? (
          <button type="button" onClick={() => setShowColorForm(true)} style={addColorBtn}>
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

            {/* Color picker + name */}
            <div style={colorFormRow}>
              <div style={colorSwatchWrap}>
                <label htmlFor="color-hex" style={{ fontSize: "0.7rem", color: "var(--admin-text-secondary)", marginBottom: "0.15rem" }}>Color</label>
                <input
                  id="color-hex"
                  type="color"
                  value={colorForm.hex}
                  onChange={(e) => setColorForm((prev) => ({ ...prev, hex: e.target.value }))}
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
                    onChange={(e) => setColorForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Negro, Blanco, Rojo..."
                    className="admin-input"
                  />
                </Field>
              </div>
            </div>

            {/* Image selector from gallery */}
            <div style={{ marginTop: "1rem" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--admin-text)", margin: "0 0 0.4rem" }}>
                Imágenes para este color {colorForm.images.length > 0 && <span style={{ color: "var(--admin-text-secondary)", fontWeight: 400 }}>({colorForm.images.length} seleccionadas)</span>}
              </p>
              {form.images.length > 0 ? (
                <div style={colorImageSelectorGrid}>
                  {form.images.map((url, i) => {
                    const selected = colorForm.images.includes(url);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleColorImage(url)}
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

            {/* Selected images order */}
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
                      onClick={() => setColorMainImage(url)}
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

            {/* Size checkboxes */}
            <div style={{ marginTop: "1rem" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--admin-text)", margin: "0 0 0.4rem" }}>
                Talles disponibles
              </p>
              <div style={sizeGrid}>
                {COMMON_SIZES.map((size) => {
                  const selected = (colorForm.sizes ?? []).includes(size);
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleColorSize(size)}
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
              {/* Custom size */}
              <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.4rem", alignItems: "center" }}>
                <input
                  type="text"
                  value={colorSizeInput}
                  onChange={(e) => setColorSizeInput(e.target.value)}
                  placeholder="Otro talle (ej: 3XL, 42)"
                  className="admin-input"
                  style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem", width: 200 }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSize(); } }}
                />
                <button type="button" onClick={addCustomSize} style={miniAddBtn}>+</button>
              </div>
              {/* Selected sizes */}
              {(colorForm.sizes ?? []).length > 0 && (
                <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
                  {(colorForm.sizes ?? []).map((s, i) => (
                    <span key={i} style={chip}>
                      {s}
                      <button type="button" onClick={() => removeColorSize(i)} style={chipRemove}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={colorFormActions}>
              <button type="button" onClick={addColor} className="admin-btn admin-btn-primary">
                {editingColorIndex !== null ? "Guardar cambios" : "Agregar color"}
              </button>
              <button type="button" onClick={() => { setShowColorForm(false); setColorForm({ id: 0, hex: "#cccccc", name: "", images: [], sizes: [] }); setEditingColorIndex(null); setColorSizeInput(""); }} className="admin-btn admin-btn-ghost">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {form.colors.length === 0 && !showColorForm && (
          <p style={emptyHint}>
            No hay colores. Agregá variantes para que los clientes vean las opciones disponibles.
          </p>
        )}
      </Section>

      {/* Productos relacionados */}
      <Section title="Productos relacionados">
        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Buscar producto por nombre o ID..."
            value={relatedSearch}
            onChange={(e) => setRelatedSearch(e.target.value)}
            className="admin-input"
            aria-label="Buscar productos relacionados"
          />
          {relatedResults.length > 0 && (
            <ul style={autocompleteStyle} role="listbox">
              {relatedResults
                .filter((r) => !form.relacionados.includes(r.id))
                .map((r) => (
                  <li
                    key={r.id}
                    onClick={() => addRelated(r.id)}
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
        {form.relacionados.length > 0 && (
          <div style={chipList}>
            {form.relacionados.map((id) => (
              <span key={id} style={chip}>
                {id}
                <button type="button" onClick={() => removeRelated(id)} style={chipRemove} aria-label={`Eliminar relacionado ${id}`}>✕</button>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Bottom save */}
      <div style={bottomBar}>
        <button
          type="submit"
          disabled={saving}
          className="admin-btn admin-btn-primary"
          style={{ padding: "0.65rem 1.4rem", fontSize: "0.9rem" }}
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

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function Section({ title, children, loading }: { title: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="admin-card">
      <div style={cardHeader}>
        <h2 style={cardTitle}>{title}</h2>
        {loading && <span style={{ fontSize: "0.75rem", color: "var(--admin-text-secondary)" }}>Cargando...</span>}
      </div>
      <div style={sectionActionsInner}>{children}</div>
    </div>
  );
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {children}
      {error && (
        <p style={errorTextStyle} role="alert">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </p>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label, title }: { checked: boolean; onChange: (v: boolean) => void; label: string; title?: string }) {
  return (
    <label style={flagLabel} title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={flagInput}
      />
      <span style={flagToggleVisual} aria-hidden="true">
        <span style={flagToggleDot(checked)} />
      </span>
      <span style={flagToggleLabel}>{label}</span>
    </label>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

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

// Header
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

const iconBtn: React.CSSProperties = {
  padding: "0.4rem",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--admin-text-secondary)",
  display: "flex",
  alignItems: "center",
};

const importRow: React.CSSProperties = {
  display: "flex",
  gap: "0.4rem",
  alignItems: "center",
};

const importInput: React.CSSProperties = {
  padding: "0.5rem 0.8rem",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-sm)",
  fontSize: "0.85rem",
  width: 240,
  background: "var(--admin-surface)",
  color: "var(--admin-text)",
  fontFamily: "inherit",
  outline: "none",
};

// Notification close
const notifClose: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "inherit",
  padding: "0.15rem",
  display: "flex",
  alignItems: "center",
  opacity: 0.7,
};

// Card
const cardHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "1rem",
  flexWrap: "wrap",
  gap: "0.5rem",
};

const cardTitle: React.CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 700,
  margin: 0,
  color: "var(--admin-text)",
};

const sectionActions: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  marginBottom: "0.5rem",
};

const sectionActionsInner: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

// Field
const fieldGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1rem",
};

const fieldFull: React.CSSProperties = { width: "100%" };
const fieldHalf: React.CSSProperties = { flex: "1 1 calc(50% - 0.5rem)", minWidth: 220 };

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--admin-text-secondary)",
  marginBottom: "0.3rem",
};

const errorTextStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.3rem",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--admin-error)",
  margin: "0.35rem 0 0 0",
  lineHeight: 1.3,
};

const catRow: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  flexWrap: "wrap",
  width: "100%",
};

// Flags
const flagsRow: React.CSSProperties = {
  display: "flex",
  gap: "1.5rem",
  flexWrap: "wrap",
  marginTop: "0.75rem",
  paddingTop: "0.75rem",
  borderTop: "1px solid var(--admin-border-light)",
};

const flagLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.85rem",
  fontWeight: 500,
  cursor: "pointer",
  color: "var(--admin-text)",
  userSelect: "none",
};

const flagInput: React.CSSProperties = {
  position: "absolute",
  opacity: 0,
  width: 0,
  height: 0,
};

const flagToggleVisual: React.CSSProperties = {
  position: "relative",
  width: 36,
  height: 20,
  borderRadius: 10,
  background: "var(--admin-border)",
  transition: "background 0.2s",
  flexShrink: 0,
};

const flagToggleDot = (checked: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 2,
  left: checked ? 18 : 2,
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: checked ? "var(--admin-accent)" : "#fff",
  transition: "left 0.2s, background 0.2s",
  boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
});

const flagToggleLabel: React.CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 500,
};

// Images
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
  transition: "background 0.15s",
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
  transition: "background 0.15s",
};

const urlInputRow: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  marginTop: "0.5rem",
};

// Colors
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
  transition: "opacity 0.15s",
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
  transition: "opacity 0.15s",
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
  transition: "opacity 0.15s",
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

// Color image selector
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
  transition: "all 0.15s",
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

// Size grid
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
  transition: "all 0.15s",
  lineHeight: 1.3,
};

// Chips
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

// Autocomplete
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
  transition: "background 0.1s",
};

// Bottom
const bottomBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  paddingTop: "0.5rem",
};

// Empty hints
const emptyHint: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--admin-text-secondary)",
  textAlign: "center",
  padding: "1rem 0",
  margin: 0,
};
