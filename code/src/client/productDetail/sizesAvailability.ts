// Renderizado y gestión de disponibilidad de talles

import type { ProductDetailState } from "./state.js";
import { normalizeSizes, CANONICAL_ORDER } from "./sizeNorm.js";
import { extractDescriptionSizes } from "./colorSelection.js";

export function renderNormalizedSizes(
  sizesSelector: HTMLElement | null,
  sizes: string[],
  state: ProductDetailState
): void {
  if (!sizesSelector || sizes.length === 0) return;

  sizesSelector.innerHTML = "";
  sizes.forEach((size) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "size";
    button.dataset.size = size;
    button.textContent = size;
    sizesSelector.appendChild(button);
  });
  clearSelectedSize(state, sizesSelector);
}

export function markUnavailableSizes(sizesSelector: HTMLElement | null, availableSet: Set<string>): void {
  if (!sizesSelector) return;
  sizesSelector.querySelectorAll<HTMLButtonElement>(".size").forEach((btn) => {
    const sz = btn.dataset.size || "";
    const isAvailable = availableSet.has(sz);
    btn.classList.toggle("unavailable", !isAvailable);
    btn.disabled = !isAvailable;
    if (!isAvailable) btn.classList.remove("selected");
  });
}

export function applySelectedColorAvailability(
  state: ProductDetailState,
  options: {
    sizesSelector: HTMLElement | null;
    requiresSizeSelection: boolean;
  }
): void {
  const { sizesSelector, requiresSizeSelection } = options;
  if (!sizesSelector || !requiresSizeSelection) return;
  if (state.selectedColorId === null) return;

  const availableForColor = state.availableSizesByColor.get(state.selectedColorId);
  if (!availableForColor || availableForColor.size === 0) {
    sizesSelector.querySelectorAll<HTMLButtonElement>(".size").forEach((btn) => {
      btn.classList.remove("unavailable");
      btn.disabled = false;
    });
    return;
  }
  markUnavailableSizes(sizesSelector, availableForColor);
}

export function inferSizesFromFallback(
  state: ProductDetailState,
  options: {
    colorsSelector: HTMLElement | null;
    descriptionSource: string;
    sizesSelector: HTMLElement | null;
    requiresSizeSelection: boolean;
    setSizeRequirement: (required: boolean) => void;
    renderNormalizedSizesForFallback: (sizes: string[]) => void;
    applySelectedColorAvailability: () => void;
  }
): void {
  const { colorsSelector, descriptionSource, sizesSelector, requiresSizeSelection, setSizeRequirement, renderNormalizedSizesForFallback, applySelectedColorAvailability } = options;

  const descriptionSizes = extractDescriptionSizes(descriptionSource);
  const colorHintSizes = new Set<string>();
  state.availableSizesByColor.forEach((set) => {
    set.forEach((size) => colorHintSizes.add(size));
  });

  const inferredSizes =
    descriptionSizes.length > 1
      ? descriptionSizes
      : CANONICAL_ORDER.filter((size) => colorHintSizes.has(size));
  const hasSelectableSizes = inferredSizes.length > 1;

  setSizeRequirement(hasSelectableSizes);
  if (hasSelectableSizes) {
    renderNormalizedSizesForFallback(inferredSizes);
    applySelectedColorAvailability();
  }
}

function clearSelectedSize(state: ProductDetailState, sizesSelector: HTMLElement | null): void {
  state.selectedSize = "";
  if (!sizesSelector) return;
  sizesSelector.querySelectorAll<HTMLButtonElement>(".size").forEach((btn) => btn.classList.remove("selected"));
}