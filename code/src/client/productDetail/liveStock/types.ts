// Tipos para el sistema de verificación en vivo (OCP)

export type Provider = "martina" | "kaideco" | "nuvex" | "alondra" | "unknown";

export interface ProviderResult {
  provider: Provider;
  price: string;
  inStock: boolean | null;
  colors?: Array<{ id: number; name: string; hex: string; sizes: string[]; images?: string[]; rawSizes?: string[] }>;
  sizes?: string[];
  source?: string;
  isDiscount?: boolean;
  originalPrice?: string;
}

export interface LiveStockContext {
  state: import("./state.js").ProductDetailState;
  checkStockBtn: HTMLButtonElement;
  statusEl: HTMLParagraphElement;
  stockBadge: HTMLSpanElement;
  priceEl: HTMLSpanElement;
  originalPriceEl: HTMLSpanElement;
  sizesSelector: HTMLElement | null;
  colorsBlock: HTMLElement | null;
  colorsSelector: HTMLElement | null;
  colorNameEl: HTMLElement | null;
  sizeFeedback: HTMLElement | null;
  setSizeRequirement: (required: boolean) => void;
  renderNormalizedSizes: (sizes: string[]) => void;
  markUnavailableSizes: (availableSet: Set<string>) => void;
  applyColorSelection: (colorId: number) => void;
  renderColors: (colors: ProviderResult["colors"]) => void;
  providerLink: string;
}

export type ProviderChecker = (productId: string, context: LiveStockContext) => Promise<ProviderResult>;