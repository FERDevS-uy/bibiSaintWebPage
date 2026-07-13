import { useEffect, useState, useCallback, useRef } from "react";
import {
  getNextId,
  getCategories,
  getProduct,
  searchProducts,
  uploadImage as uploadImageApi,
  createProduct,
  updateProduct,
} from "../../../utils/adminApi";
import type { CategoryOption } from "../../../utils/adminApi";
import {
  getDisplayCategoryName,
  getDisplaySubcategories,
} from "../../../utils/categoryNormalization";
import { setPendingToast } from "../toastUtils";

export interface ColorEntry {
  id: number;
  hex: string;
  name: string;
  images: string[];
  sizes?: string[];
}

export interface ProductFormData {
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

export const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Talle único"];

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

export function useProductForm(productId?: string) {
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
  const [priceError, setPriceError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);

  // Color form state
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

  // Load categories
  useEffect(() => {
    (async () => {
      try {
        const cats = await getCategories();
        setAvailableCategories(cats);
        setCategoriesLoading(false);
      } catch {
        setCategoriesLoading(false);
      }
    })();
  }, []);

  // Auto-assign ID for new products
  useEffect(() => {
    if (isEditing) return;
    getNextId()
      .then((nextId) => setForm((prev) => ({ ...prev, id: nextId })))
      .catch(() => {
        const fallback = String(Date.now()).slice(-6);
        setForm((prev) => ({ ...prev, id: fallback }));
      });
  }, [isEditing]);

  // Load existing product data
  useEffect(() => {
    if (!productId) return;
    (async () => {
      try {
        const data = await getProduct(productId);

        const rawCat = (data.categories as any) ?? {};
        const mockProduct = {
          id: data.id,
          name: data.name ?? "",
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

        setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  }, [productId]);

  // Related products search
  useEffect(() => {
    if (relatedSearch.length < 2) {
      setRelatedResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const term = relatedSearch.trim();
      if (term.length < 2) {
        setRelatedResults([]);
        return;
      }
      try {
        const results = await searchProducts(term);
        setRelatedResults(results);
      } catch {
        setRelatedResults([]);
      }
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
    const newColors = form.colors.map((c) =>
      c.images.includes(url) ? { ...c, images: c.images.filter((u) => u !== url) } : c,
    );
    updateField("images", form.images.filter((_, i) => i !== idx));
    updateField("colors", newColors);
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
    try {
      const url = await uploadImageApi(file);
      addImage(url);
      notify("ok", "Imagen subida correctamente");
    } catch (e: any) {
      notify("error", "Error al subir imagen: " + (e?.message || "Error desconocido"));
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

  const availableSubcategories: string[] =
    availableCategories.find((c) => c.name === form.category)?.subcategories.map((s) => s.name) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      notify("error", "El nombre del producto es obligatorio");
      nameInputRef.current?.focus();
      return;
    }
    const priceErr = validatePrice(form.price);
    if (priceErr) {
      setPriceError(priceErr);
      notify("error", priceErr);
      priceInputRef.current?.focus();
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

    try {
      if (isEditing) {
        await updateProduct(productId!, productData);
      } else {
        await createProduct(form.id, productData);
      }
      const msg = isEditing ? "Producto actualizado correctamente" : "Producto creado correctamente";
      setPendingToast({ type: "ok", text: msg });
      setTimeout(() => {
        window.location.href = "/admin";
      }, 400);
    } catch (e: any) {
      notify("error", "Error al guardar: " + (e?.message || "Error desconocido"));
    }

    setSaving(false);
  };

  return {
    form,
    isEditing,
    loading,
    saving,
    notification,
    setNotification,
    priceError,
    availableCategories,
    categoriesLoading,
    availableSubcategories,

    // Image gallery
    newImageUrl, setNewImageUrl,
    showImageUrlInput, setShowImageUrlInput,
    uploadingImage,
    addImage,
    removeImage,
    moveImage,
    handleImageUpload,

    // Color form
    colorForm, setColorForm,
    showColorForm, setShowColorForm,
    editingColorIndex, setEditingColorIndex,
    colorSizeInput, setColorSizeInput,
    toggleColorImage,
    setColorMainImage,
    toggleColorSize,
    addCustomSize,
    removeColorSize,
    startEditColor,
    addColor,
    removeColor,

    // Related
    relatedSearch, setRelatedSearch,
    relatedResults,
    addRelated,
    removeRelated,

    // Fields
    updateField,
    handlePriceChange,
    handlePriceBlur,
    validatePrice,
    handleSubmit,
    nameInputRef,
    priceInputRef,
  };
}
