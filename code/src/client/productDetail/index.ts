// Orquestador principal del detalle de producto - punto de entrada único

import type { ProductDetailState } from "./state.js";
import { createInitialState, bindDOMElements } from "./state.js";
import { normalizeSize, normalizeSizes, hasExplicitNoSize, CANONICAL_ORDER } from "./sizeNorm.js";
import { cleanColorLabel, extractNuvexSizeFromColorName, extractDescriptionSizes, applyColorSelection, renderColors } from "./colorSelection.js";
import { renderNormalizedSizes, markUnavailableSizes, applySelectedColorAvailability, inferSizesFromFallback } from "./sizesAvailability.js";
import { handleAddToCart, bindAddToCartListener } from "./productCart.js";
import { executeLiveCheck, getProviderHandler, resolveProvider, liveStockRegistry } from "./liveStock/index.js";
import { fetchMartinaLive } from "./liveStock/martina.js";

// Re-export para compatibilidad con código legacy que pueda necesitarlo
export { normalizeSize, normalizeSizes, hasExplicitNoSize, CANONICAL_ORDER } from "./sizeNorm.js";
export { cleanColorLabel, extractNuvexSizeFromColorName, extractDescriptionSizes } from "./colorSelection.js";
export { renderNormalizedSizes, markUnavailableSizes } from "./sizesAvailability.js";

function setStatus(statusEl: HTMLParagraphElement | null, message: string, tone: "ok" | "error" | "neutral" = "neutral"): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("is-ok", "is-error");
  if (tone === "ok") statusEl.classList.add("is-ok");
  if (tone === "error") statusEl.classList.add("is-error");
}

function clearSelectedSize(state: ProductDetailState, sizesSelector: HTMLElement | null): void {
  state.selectedSize = "";
  if (!sizesSelector) return;
  sizesSelector.querySelectorAll<HTMLButtonElement>(".size").forEach((btn) => btn.classList.remove("selected"));
}

function setSizeRequirement(state: ProductDetailState, required: boolean, sizesBlock: HTMLElement | null, sizesSelector: HTMLElement | null, sizeFeedback: HTMLElement | null): void {
  state.requiresSizeSelection = required;
  if (!sizesBlock || !sizesSelector) return;
  sizesBlock.classList.toggle("hidden", !required);
  if (!required) {
    clearSelectedSize(state, sizesSelector);
    sizeFeedback?.classList.add("hidden");
    sizesSelector.querySelectorAll<HTMLButtonElement>(".size").forEach((btn) => {
      btn.classList.remove("unavailable", "selected");
      btn.disabled = false;
    });
  }
}

export async function initProductDetail(): Promise<void> {
  const state = createInitialState();
  bindDOMElements(state);

  const addBtn = state.addBtn;
  if (!addBtn || addBtn.dataset.bound === "true") return;
  addBtn.dataset.bound = "true";

  const {
    sizesSelector,
    sizesBlock,
    sizeFeedback,
    colorsBlockRoot,
    checkStockBtn,
    statusEl,
    stockBadge,
    priceEl,
    originalPriceEl,
    colorsSelector,
    colorNameEl,
    colorSelectionDisabled,
    requiresSizeSelection,
  } = state;

  // Sincronizar disponibilidad del botón con badge de stock
  const syncAddToCartAvailability = () => {
    if (!stockBadge) return;
    const stockText = (stockBadge.textContent || "").trim().toLowerCase();
    const isOutOfStock = stockText === "sin stock";
    if (addBtn) {
      addBtn.disabled = isOutOfStock;
      addBtn.classList.toggle("is-disabled", isOutOfStock);
      addBtn.setAttribute("aria-disabled", isOutOfStock ? "true" : "false");
    }
  };

  if (stockBadge) {
    syncAddToCartAvailability();
    const stockBadgeObserver = new MutationObserver(() => {
      syncAddToCartAvailability();
    });
    stockBadgeObserver.observe(stockBadge, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Bind click en talles
  if (sizesSelector) {
    sizesSelector.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest(".size") as HTMLButtonElement | null;
      if (!button) return;
      if (button.classList.contains("unavailable") || button.disabled) return;

      state.selectedSize = button.dataset.size || "";
      sizesSelector?.querySelectorAll<HTMLButtonElement>(".size").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      sizeFeedback?.classList.add("hidden");
    });
  }

  // Bind add to cart
  bindAddToCartListener(state, { sizesSelector, sizeFeedback, requiresSizeSelection: state.requiresSizeSelection });

  // Fallback de colores para proveedores sin verificación en vivo (ej: Nuvex)
  if (!checkStockBtn && !colorSelectionDisabled && colorsSelector) {
    if (colorsSelector.dataset.bound === "true") return;
    colorsSelector.dataset.bound = "true";

    state.availableSizesByColor.clear();
    colorsSelector.querySelectorAll<HTMLButtonElement>(".swatch").forEach((sw) => {
      const cid = Number(sw.dataset.colorId);
      if (!Number.isFinite(cid)) return;
      const rawName = sw.dataset.colorName || "";
      const cleanedName = cleanColorLabel(rawName);
      if (cleanedName) sw.dataset.colorName = cleanedName;
      let hasSizesFromPayload = false;
      try {
        const parsedSizes = JSON.parse(sw.dataset.colorSizes || "[]");
        if (Array.isArray(parsedSizes)) {
          parsedSizes
            .map((sizeToken) => normalizeSize(String(sizeToken || "")))
            .filter((size): size is string => Boolean(size))
            .forEach((size) => {
              if (!state.availableSizesByColor.has(cid)) {
                state.availableSizesByColor.set(cid, new Set<string>());
              }
              state.availableSizesByColor.get(cid)?.add(size);
              hasSizesFromPayload = true;
            });
        }
      } catch {
        hasSizesFromPayload = false;
      }
      const hintedSize = extractNuvexSizeFromColorName(rawName);
      if (!hasSizesFromPayload && hintedSize) {
        if (!state.availableSizesByColor.has(cid)) {
          state.availableSizesByColor.set(cid, new Set<string>());
        }
        state.availableSizesByColor.get(cid)?.add(hintedSize);
      }
    });

    const applySelectedColorAvailabilityWrapper = () => {
      applySelectedColorAvailability(state, { sizesSelector, requiresSizeSelection: state.requiresSizeSelection });
    };

    // Aplicar disponibilidad del primer color al cargar
    const firstSw = colorsSelector.querySelector<HTMLButtonElement>(".swatch");
    if (firstSw) {
      const cid = Number(firstSw.dataset.colorId);
      if (Number.isFinite(cid)) {
        state.selectedColorId = cid;
        applySelectedColorAvailabilityWrapper();
      }
    }

    const selectColorWrapper = (sw: HTMLButtonElement) => {
      const cid = Number(sw.dataset.colorId);
      if (!Number.isFinite(cid)) return;
      applyColorSelection(state, cid, {
        colorsSelector,
        colorNameEl,
        sizesSelector,
        sizeFeedback,
        stockBadge,
        requiresSizeSelection: state.requiresSizeSelection,
      });
      applySelectedColorAvailabilityWrapper();
      clearSelectedSize(state, sizesSelector);
      sizeFeedback?.classList.add("hidden");
    };

    colorsSelector.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const sw = target.closest(".swatch") as HTMLButtonElement | null;
      if (!sw) return;
      selectColorWrapper(sw);
    });

    const firstSwatch = colorsSelector.querySelector<HTMLButtonElement>(".swatch");
    if (firstSwatch) selectColorWrapper(firstSwatch);

    const descriptionSource =
      (document.querySelector(".desc-content") as HTMLElement | null)?.textContent ||
      (document.querySelector(".description-box") as HTMLElement | null)?.textContent ||
      "";

    inferSizesFromFallback(state, {
      colorsSelector,
      descriptionSource,
      sizesSelector,
      requiresSizeSelection: state.requiresSizeSelection,
      setSizeRequirement: (req) => setSizeRequirement(state, req, sizesBlock, sizesSelector, sizeFeedback),
      renderNormalizedSizesForFallback: (sizes) => renderNormalizedSizes(sizesSelector, sizes, state),
      applySelectedColorAvailability: applySelectedColorAvailabilityWrapper,
    });
  }

  // Verificación en vivo
  if (checkStockBtn && statusEl && stockBadge && priceEl) {
    const providerLink = checkStockBtn.dataset.providerLink ?? "";

    const liveContext = {
      state,
      checkStockBtn,
      statusEl,
      stockBadge,
      priceEl,
      originalPriceEl,
      sizesSelector,
      colorsBlock: document.getElementById("colorsBlock"),
      colorsSelector,
      colorNameEl,
      sizeFeedback,
      setSizeRequirement: (req) => setSizeRequirement(state, req, sizesBlock, sizesSelector, sizeFeedback),
      renderNormalizedSizes: (sizes) => renderNormalizedSizes(sizesSelector, sizes, state),
      markUnavailableSizes: (set) => markUnavailableSizes(sizesSelector, set),
      applyColorSelection: (colorId) => applyColorSelection(state, colorId, {
        colorsSelector,
        colorNameEl,
        sizesSelector,
        sizeFeedback,
        stockBadge,
        requiresSizeSelection: state.requiresSizeSelection,
      }),
      renderColors: (colors) => renderColors(state, colors, {
        colorsSelector,
        colorsBlock: document.getElementById("colorsBlock")!,
        colorSelectionDisabled,
      }),
      providerLink,
    };

    checkStockBtn.addEventListener("click", async () => {
      const productId = checkStockBtn.dataset.productId ?? "";
      if (!productId) return;
      await executeLiveCheck(productId, providerLink, liveContext);
    });

    // Bind click en colores (live check path) — event delegation en colorsSelector
    if (colorsSelector && !colorSelectionDisabled) {
      colorsSelector.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const sw = target.closest(".swatch") as HTMLButtonElement | null;
        if (!sw) return;
        const colorId = Number(sw.dataset.colorId);
        if (!Number.isFinite(colorId)) return;
        liveContext.applyColorSelection(colorId);
      });
    }

    // Auto-verificar al cargar la página
    const autoProvider = resolveProvider(checkStockBtn.dataset.productId ?? "", providerLink);
    if (
      autoProvider === "martina"
      || autoProvider === "kaideco"
      || autoProvider === "nuvex"
      || autoProvider === "alondra"
    ) {
      const trigger = () => checkStockBtn.click();
      const w = window as any;
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(trigger, { timeout: 1500 });
      } else {
        w.setTimeout(trigger, 300);
      }
    }
  }

  // Si no hay swatches pre-renderizados y es producto Martina, inferir colores desde las imágenes
  const firstSwatch = colorsSelector?.querySelector<HTMLButtonElement>(".swatch");
  if (!firstSwatch) {
    try {
      const addBtnEl = document.getElementById("addToCartBtn");
      const productIdAttr = addBtnEl?.getAttribute("data-id") || "";
      if (productIdAttr.toLowerCase().startsWith("mdt-")) {
        const imagesDataEl = document.getElementById("productImagesData");
        const raw = imagesDataEl?.getAttribute("data-images") || "[]";
        const parsedImgs = JSON.parse(raw);
        const imgs: string[] = Array.isArray(parsedImgs)
          ? parsedImgs.filter((value): value is string => typeof value === "string")
          : [];
        const grouped = new Map();
        imgs.forEach((u) => {
          try {
            const fname = u.split("/").pop() || "";
            const m = fname.match(/^[0-9]+_(\d+)_\d+\.[a-zA-Z]{3,4}$/);
            const colorId = m ? Number(m[1]) : null;
            const key = colorId !== null && Number.isFinite(colorId) ? String(colorId) : "0";
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(u);
          } catch {
            // ignore
          }
        });

        const inferredColors = Array.from(grouped.entries())
          .filter(([k]) => k !== undefined)
          .map(([k, arr]) => ({ id: Number(k), hex: "#cccccc", name: `Color ${k}`, images: arr }));

        if (inferredColors.length > 0) {
          renderColors(state, inferredColors, {
            colorsSelector,
            colorsBlock: document.getElementById("colorsBlock")!,
            colorSelectionDisabled,
          });
          const first = inferredColors[0];
          state.selectedColorId = first.id;
          applyColorSelection(state, first.id, {
            colorsSelector,
            colorNameEl,
            sizesSelector,
            sizeFeedback,
            stockBadge,
            requiresSizeSelection: state.requiresSizeSelection,
          });
        }
      }
    } catch {
      /* noop */
    }
  }

  // Solo para Nuvex enviamos set inicial manual a la galería
  const globalProductId = addBtn?.getAttribute("data-id") || "";
  const globalPidLower = globalProductId.toLowerCase();
  const globalIsNuvex =
    !globalPidLower.startsWith("mdt-")
    && !globalPidLower.startsWith("kai-")
    && !globalPidLower.startsWith("alo-");

  if (globalIsNuvex) {
    try {
      const imagesDataEl = document.getElementById("productImagesData");
      if (imagesDataEl) {
        const raw = imagesDataEl.getAttribute("data-images") || "[]";
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          window.dispatchEvent(
            new CustomEvent("product:image-set", {
              detail: { images: parsed.filter(Boolean) },
            }),
          );
        }
      }
    } catch {
      /* noop */
    }

    setTimeout(() => {
      try {
        const imagesDataEl = document.getElementById("productImagesData");
        if (!imagesDataEl) return;
        const raw = imagesDataEl.getAttribute("data-images") || "[]";
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          window.dispatchEvent(
            new CustomEvent("product:image-set", {
              detail: { images: parsed.filter(Boolean) },
            }),
          );
        }
      } catch {
        /* noop */
      }
    }, 350);
  }
}