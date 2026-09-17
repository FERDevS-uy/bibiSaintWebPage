// Proveedor Martina

import { fetchMartinaProductPrice } from "../../martinaVerification.js";
import { normalizeOfferOriginalPrice } from "../../../utils/price.js";
import { applyMarkupToPrice, getRuntimeMarkup } from "./providerUtils.js";
import type { LiveStockContext, ProviderResult } from "./types.js";

export async function fetchMartinaLive(productId: string): Promise<ProviderResult> {
  const res = await fetchMartinaProductPrice(productId);
  if (!res) throw new Error("No se pudo verificar el precio oficial");
  return res as ProviderResult;
}

export async function handleMartina(data: ProviderResult, context: LiveStockContext): Promise<void> {
  const colors = data?.colors ?? [];
  if (typeof data?.inStock !== "boolean" || (data.inStock && colors.length === 0)) {
    setStatus("No se pudo verificar la disponibilidad. Intente nuevamente.", "error");
    return;
  }
  const { checkStockBtn, statusEl, stockBadge, priceEl, originalPriceEl, setSizeRequirement, renderNormalizedSizes, renderColors, applyColorSelection, colorsBlock, sizesSelector, sizeFeedback } = context;
  const availableSizesByColor = context.state.availableSizesByColor;

  const markup = (await getRuntimeMarkup()).martina;
  const nextPrice = applyMarkupToPrice(data?.price, markup);
  if (nextPrice) {
    priceEl.textContent = `$${nextPrice}`;
  }

  // Precio original tachado + precio vigente destacado cuando hay descuento
  if (data?.isDiscount && data.originalPrice) {
    const nextOriginal = applyMarkupToPrice(data.originalPrice, markup);
    const validOriginal = normalizeOfferOriginalPrice(nextOriginal, nextPrice);
    if (originalPriceEl && validOriginal !== null) {
      originalPriceEl.textContent = `$${validOriginal.toLocaleString("es-UY")}`;
      originalPriceEl.classList.remove("hidden");
      priceEl.classList.add("price--offer");
    } else {
      originalPriceEl?.classList.add("hidden");
      priceEl.classList.remove("price--offer");
    }
  } else {
    originalPriceEl?.classList.add("hidden");
    priceEl.classList.remove("price--offer");
  }

  if (data.inStock === false) {
    stockBadge.textContent = "Sin stock";
    stockBadge.style.background = "#a33a3a";
    availableSizesByColor.clear();
    context.state.selectedColorId = null;
    if (sizesSelector) {
      sizesSelector.querySelectorAll<HTMLButtonElement>(".size").forEach((btn) => {
        btn.classList.add("unavailable");
        btn.classList.remove("selected");
        btn.disabled = true;
      });
    }
    if (colorsBlock) colorsBlock.classList.add("hidden");
    setStatus("Este producto puede no tener stock disponible en el proveedor.", "error");
    return;
  }

  stockBadge.textContent = "En Stock";
  stockBadge.style.background = "#27ae60";

  availableSizesByColor.clear();
  colors.forEach((c) => {
    availableSizesByColor.set(c.id, new Set(c.sizes));
  });

  const allRawSizes = colors.flatMap((c) => c.rawSizes || []);
  const allNormalizedSizes = colors.flatMap((c) => c.sizes || []);
  const { hasExplicitNoSize } = await import("../sizeNorm.js");
  const shouldSkipSize = allNormalizedSizes.length === 0 && hasExplicitNoSize(allRawSizes);
  setSizeRequirement(!shouldSkipSize);

  renderColors(colors);

  // seleccionar primer color y aplicar sus talles
  const firstColor = colors[0];
  context.state.selectedColorId = firstColor.id;
  if (!shouldSkipSize) {
    applyColorSelection(firstColor.id);
  }

  setStatus("Actualizado desde martina.", "ok");
}

function setStatus(message: string, tone: "ok" | "error" | "neutral" = "neutral"): void {
  const statusEl = document.getElementById("stockCheckStatus") as HTMLParagraphElement | null;
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("is-ok", "is-error");
  if (tone === "ok") statusEl.classList.add("is-ok");
  if (tone === "error") statusEl.classList.add("is-error");
}