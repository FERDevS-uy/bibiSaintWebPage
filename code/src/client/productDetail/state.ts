// Estado compartido del detalle de producto (single source of truth para el script)

export interface ProductDetailState {
  // Referencias DOM
  addBtn: HTMLButtonElement | null;
  sizesSelector: HTMLElement | null;
  sizesBlock: HTMLElement | null;
  sizeFeedback: HTMLElement | null;
  colorsBlockRoot: HTMLElement | null;
  checkStockBtn: HTMLButtonElement | null;
  statusEl: HTMLParagraphElement | null;
  stockBadge: HTMLSpanElement | null;
  priceEl: HTMLSpanElement | null;
  originalPriceEl: HTMLSpanElement | null;
  colorsSelector: HTMLElement | null;
  colorNameEl: HTMLElement | null;

  // Flags de configuración
  colorSelectionDisabled: boolean;
  requiresSizeSelection: boolean;

  // Estado de selección
  selectedSize: string;
  selectedColorId: number | null;
  selectedColorName: string | null;

  // Disponibilidad por color
  availableSizesByColor: Map<number, Set<string>>;
}

export function createInitialState(): ProductDetailState {
  return {
    addBtn: null,
    sizesSelector: null,
    sizesBlock: null,
    sizeFeedback: null,
    colorsBlockRoot: null,
    checkStockBtn: null,
    statusEl: null,
    stockBadge: null,
    priceEl: null,
    originalPriceEl: null,
    colorsSelector: null,
    colorNameEl: null,
    colorSelectionDisabled: false,
    requiresSizeSelection: false,
    selectedSize: "",
    selectedColorId: null,
    selectedColorName: null,
    availableSizesByColor: new Map(),
  };
}

export function bindDOMElements(state: ProductDetailState): void {
  state.addBtn = document.getElementById("addToCartBtn") as HTMLButtonElement | null;
  state.sizesSelector = document.getElementById("sizesSelector");
  state.sizesBlock = document.getElementById("sizesBlock");
  state.sizeFeedback = document.getElementById("sizeFeedback");
  state.colorsBlockRoot = document.getElementById("colorsBlock") as HTMLElement | null;
  state.checkStockBtn = document.getElementById("checkStockBtn") as HTMLButtonElement | null;
  state.statusEl = document.getElementById("stockCheckStatus") as HTMLParagraphElement | null;
  state.stockBadge = document.getElementById("stockBadge") as HTMLSpanElement | null;
  state.priceEl = document.getElementById("productPrice") as HTMLSpanElement | null;
  state.originalPriceEl = document.getElementById("productOriginalPrice") as HTMLSpanElement | null;
  state.colorsSelector = document.getElementById("colorsSelector");
  state.colorNameEl = document.getElementById("colorName");

  state.colorSelectionDisabled = state.colorsBlockRoot?.dataset.disableSelection === "true";
  if (state.colorSelectionDisabled && state.colorsBlockRoot) {
    state.colorsBlockRoot.classList.add("hidden");
  }

  state.requiresSizeSelection = Boolean(
    state.sizesSelector && state.sizesBlock && !state.sizesBlock.classList.contains("hidden"),
  );
}