// Lógica de agregar al carrito

import type { ProductDetailState } from "./state.js";

/** Extrae el hex del swatch de color seleccionado actualmente */
function getSelectedColorHex(): string | null {
  const selected = document.querySelector("#colorsSelector .swatch.selected") as HTMLElement | null;
  if (!selected) return null;
  return selected.getAttribute("data-color-hex") || null;
}

export async function handleAddToCart(
  state: ProductDetailState,
  options: {
    sizesSelector: HTMLElement | null;
    sizeFeedback: HTMLElement | null;
    requiresSizeSelection: boolean;
  }
): Promise<void> {
  const { sizesSelector, sizeFeedback, requiresSizeSelection } = options;
  const addBtn = state.addBtn;

  if (!addBtn || addBtn.disabled) return;

  const qtyInput = document.getElementById("cartQty") as HTMLInputElement;
  const price = document.getElementById("productPrice") as HTMLSpanElement;
  const name = document.querySelector(".name") as HTMLHeadingElement;
  const id = addBtn.getAttribute("data-id") ?? "";
  const img = document.querySelector(".gallery .mainImg") as HTMLImageElement | null;
  const qty = parseInt(qtyInput.value, 10);

  const isClothing = Boolean(sizesSelector) && requiresSizeSelection;
  if (isClothing && !state.selectedSize) {
    if (sizeFeedback) {
      sizeFeedback.textContent = "Selecciona un talle para continuar.";
      sizeFeedback.classList.remove("hidden");
    }
    return;
  }

  // Validar contra disponibilidad si ya conocemos el stock real
  if (isClothing && state.availableSizesByColor.size > 0) {
    const setForColor =
      state.selectedColorId !== null
        ? state.availableSizesByColor.get(state.selectedColorId)
        : null;
    if (setForColor && !setForColor.has(state.selectedSize)) {
      if (sizeFeedback) {
        sizeFeedback.textContent = "Ese talle no está disponible para el color elegido.";
        sizeFeedback.classList.remove("hidden");
      }
      return;
    }
  }

  const variantSuffix = [state.selectedSize, state.selectedColorId !== null ? `c${state.selectedColorId}` : ""]
    .filter(Boolean)
    .join("_");
  const idToCart = variantSuffix ? `${id}__${variantSuffix}` : id;
  const nameToCart = state.selectedSize
    ? `${name.innerText} (Talle ${state.selectedSize})`
    : name.innerText;

  const { default: addToCart } = await import("../../utils/addToCart.ts");

  const colorHex = getSelectedColorHex();

  await addToCart(
    idToCart,
    nameToCart,
    price.innerText.replace("$", "").replace(",", "."),
    qty,
    img?.src ?? "",
    state.selectedColorId,
    state.selectedColorName,
    colorHex,
  );

  window.updateCartCount && window.updateCartCount();
  addBtn.textContent = "✓ AGREGADO!";
  addBtn.style.backgroundColor = "#388e3c";
  addBtn.style.borderColor = "#388e3c";
  setTimeout(() => {
    addBtn.textContent = "Agregar al carrito";
    addBtn.style.backgroundColor = "";
    addBtn.style.borderColor = "";
  }, 1200);
}

export function bindAddToCartListener(
  state: ProductDetailState,
  options: {
    sizesSelector: HTMLElement | null;
    sizeFeedback: HTMLElement | null;
    requiresSizeSelection: boolean;
  }
): void {
  const addBtn = state.addBtn;
  if (!addBtn) return;

  addBtn.addEventListener("click", () => handleAddToCart(state, options));
}