// Selección de color y sincronización de galería/disponibilidad

import type { ProductDetailState } from "./state.js";
import { normalizeSize, CANONICAL_ORDER } from "./sizeNorm.js";

export function cleanColorLabel(raw: string): string {
  return String(raw || "")
    .replace(/\b(XXXL|XXL|XL|XS|GG|XG|G|M|P|S|L)\b/gi, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/[\s_-]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractNuvexSizeFromColorName(raw: string): string | null {
  const token = String(raw || "").toUpperCase();
  const match = token.match(/\b(XXXL|XXL|XL|XS|GG|XG|G|M|P|S|L)\b/);
  if (!match) return null;
  return normalizeSize(match[1]);
}

export function extractDescriptionSizes(rawText: string): string[] {
  const found = new Set<string>();
  const source = String(rawText || "");
  const tallaRegex = /\btalle\s*[:\-]?\s*([a-zA-Z]{1,4}|\d{1,3})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = tallaRegex.exec(source)) !== null) {
    const normalized = normalizeSize(m[1]);
    if (normalized) found.add(normalized);
  }
  return CANONICAL_ORDER.filter((size) => found.has(size));
}

interface ColorOption {
  id: number;
  hex: string;
  name: string;
  sizes?: string[];
  images?: string[];
  rawSizes?: string[];
}

export function applyColorSelection(
  state: ProductDetailState,
  colorId: number,
  options: {
    colorsSelector: HTMLElement | null;
    colorNameEl: HTMLElement | null;
    sizesSelector: HTMLElement | null;
    sizeFeedback: HTMLElement | null;
    stockBadge: HTMLElement | null;
    requiresSizeSelection: boolean;
  }
): void {
  const { colorsSelector, colorNameEl, sizesSelector, sizeFeedback, stockBadge, requiresSizeSelection } = options;

  state.selectedColorId = colorId;
  const set = state.availableSizesByColor.get(colorId) ?? new Set<string>();

  // Marcar talles disponibles/no disponibles
  markUnavailableSizes(sizesSelector, set);
  clearSelectedSize(state, sizesSelector);
  sizeFeedback?.classList.add("hidden");

  // Edge case: color sin talles → "Sin stock"
  if (requiresSizeSelection) {
    if (set.size === 0) {
      if (stockBadge) {
        stockBadge.textContent = "Sin stock";
        (stockBadge as HTMLElement).style.background = "#a33a3a";
      }
      if (sizesSelector) {
        sizesSelector.querySelectorAll<HTMLButtonElement>(".size").forEach((btn) => {
          btn.classList.add("unavailable");
          btn.classList.remove("selected");
          btn.disabled = true;
        });
      }
      if (sizeFeedback) {
        sizeFeedback.textContent = "Este color no tiene talles disponibles.";
        sizeFeedback.classList.remove("hidden");
      }
    } else {
      // Color con talles → restaurar estado previo
      if (stockBadge) {
        stockBadge.textContent = "En Stock";
        (stockBadge as HTMLElement).style.background = "#27ae60";
      }
      if (sizeFeedback) sizeFeedback.classList.add("hidden");
    }
  }

  // Marcar swatch seleccionado y actualizar nombre
  let selectedImages: string[] = [];
  if (colorsSelector) {
    colorsSelector.querySelectorAll<HTMLButtonElement>(".swatch").forEach((sw) => {
      const isMatch = Number(sw.dataset.colorId) === colorId;
      sw.classList.toggle("selected", isMatch);
      if (isMatch) {
        const cleanedName = cleanColorLabel(sw.dataset.colorName || "");
        state.selectedColorName = cleanedName || sw.dataset.colorName || null;
        if (colorNameEl) colorNameEl.textContent = state.selectedColorName || "";
        try {
          const raw = sw.dataset.colorImages;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) selectedImages = parsed.filter(Boolean);
          }
        } catch {
          selectedImages = [];
        }
      }
    });
  }

  // Cambiar la galería si tenemos imágenes del color seleccionado
  if (selectedImages.length > 0) {
    window.dispatchEvent(
      new CustomEvent("product:image-set", {
        detail: { images: selectedImages },
      }),
    );
  }
}

export function renderColors(
  state: ProductDetailState,
  colors: ColorOption[],
  options: {
    colorsSelector: HTMLElement | null;
    colorsBlock: HTMLElement | null;
    colorSelectionDisabled: boolean;
  }
): void {
  const { colorsSelector, colorsBlock, colorSelectionDisabled } = options;

  if (colorSelectionDisabled) {
    if (colorsBlock) colorsBlock.classList.add("hidden");
    return;
  }
  if (!colorsSelector || !colorsBlock) return;

  // Indexar imágenes previas server-rendered (por id) para preservarlas
  const prevImagesById = new Map<number, string>();
  colorsSelector.querySelectorAll<HTMLButtonElement>(".swatch").forEach((sw) => {
    const cid = Number(sw.dataset.colorId);
    const raw = sw.dataset.colorImages;
    if (Number.isFinite(cid) && raw) prevImagesById.set(cid, raw);
  });

  colorsSelector.innerHTML = "";
  colors.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.style.backgroundColor = c.hex || "#cccccc";
    btn.dataset.colorId = String(c.id);
    btn.dataset.colorName = c.name;
    btn.dataset.colorHex = c.hex || "#cccccc";
    btn.dataset.colorSizes = JSON.stringify(Array.isArray(c.sizes) ? c.sizes : []);
    const imagesAttr = prevImagesById.get(c.id);
    if (imagesAttr) btn.dataset.colorImages = imagesAttr;
    btn.title = c.name;
    btn.setAttribute("aria-label", c.name);
    colorsSelector.appendChild(btn);
  });
  colorsBlock.classList.remove("hidden");
}

function markUnavailableSizes(sizesSelector: HTMLElement | null, availableSet: Set<string>): void {
  if (!sizesSelector) return;
  sizesSelector.querySelectorAll<HTMLButtonElement>(".size").forEach((btn) => {
    const sz = btn.dataset.size || "";
    const isAvailable = availableSet.has(sz);
    btn.classList.toggle("unavailable", !isAvailable);
    btn.disabled = !isAvailable;
    if (!isAvailable) btn.classList.remove("selected");
  });
}

function clearSelectedSize(state: ProductDetailState, sizesSelector: HTMLElement | null): void {
  state.selectedSize = "";
  if (!sizesSelector) return;
  sizesSelector.querySelectorAll<HTMLButtonElement>(".size").forEach((btn) => btn.classList.remove("selected"));
}