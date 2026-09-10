// Proveedor Kai (kaideco.uy)

import { extractKaiRawSizes, applyMarkupToPrice, formatKaiPrice, getRuntimeMarkup } from "./providerUtils.js";
import type { LiveStockContext, ProviderResult } from "./types.js";

export async function fetchKaiLive(providerUrl: string): Promise<ProviderResult> {
  const productUrl = new URL(providerUrl);
  const segments = productUrl.pathname.split("/").filter(Boolean);
  const productsIndex = segments.findIndex((segment) => segment === "products");
  const handle = productsIndex >= 0 ? segments[productsIndex + 1] : "";

  if (!handle) {
    throw new Error("No se pudo detectar handle de Kai");
  }

  const endpoint = `https://kaideco.uy/products/${handle}.js`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const product = await response.json();
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const firstVariant = variants[0] ?? null;
    const rawSizes = extractKaiRawSizes(product);

    const { normalizeSizes } = await import("../sizeNorm.js");
    return {
      provider: "kaideco",
      price: formatKaiPrice(firstVariant?.price ?? product?.price),
      inStock: variants.length > 0 ? variants.some((variant: any) => Boolean(variant?.available)) : null,
      sizes: normalizeSizes(rawSizes),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function handleKai(data: ProviderResult, context: LiveStockContext): Promise<void> {
  const { checkStockBtn, statusEl, stockBadge, priceEl, setSizeRequirement, renderNormalizedSizes, markUnavailableSizes, sizeFeedback } = context;
  const availableSizesByColor = context.state.availableSizesByColor;

  const markup = (await getRuntimeMarkup()).kaideco;
  const nextPrice = applyMarkupToPrice(data?.price, markup);
  if (nextPrice) {
    priceEl.textContent = `$${nextPrice}`;
  }

  if (data?.inStock === true) {
    stockBadge.textContent = "En Stock";
    stockBadge.style.background = "#27ae60";
  } else if (data?.inStock === false) {
    stockBadge.textContent = "Sin stock";
    stockBadge.style.background = "#a33a3a";
  }

  const normalizedSizes = Array.isArray(data?.sizes) ? data.sizes.filter(Boolean) : [];

  if (normalizedSizes.length > 0) {
    setSizeRequirement(true);
    renderNormalizedSizes(normalizedSizes);
    availableSizesByColor.clear();
    availableSizesByColor.set(-1, new Set(normalizedSizes));
    context.state.selectedColorId = -1;
    markUnavailableSizes(new Set(normalizedSizes));
  } else {
    setSizeRequirement(false);
  }

  setStatus("Actualizado desde kaideco.", "ok");
}

function setStatus(message: string, tone: "ok" | "error" | "neutral" = "neutral"): void {
  const statusEl = document.getElementById("stockCheckStatus") as HTMLParagraphElement | null;
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("is-ok", "is-error");
  if (tone === "ok") statusEl.classList.add("is-ok");
  if (tone === "error") statusEl.classList.add("is-error");
}