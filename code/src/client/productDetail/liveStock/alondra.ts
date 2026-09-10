// Proveedor Alondra

import { applyMarkupToPrice, getRuntimeMarkup } from "./providerUtils.js";
import type { LiveStockContext, ProviderResult } from "./types.js";

export async function fetchAlondraLive(productId: string): Promise<ProviderResult> {
  const alondraId = String(productId || "").replace(/^alo-/i, "").trim();
  if (!alondraId) {
    return {
      provider: "alondra",
      price: "",
      inStock: null,
    };
  }

  const endpoint = `https://alondra-ecommerce-be.sitios.uy/api/products/${encodeURIComponent(alondraId)}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        provider: "alondra",
        price: "",
        inStock: null,
      };
    }

    const payload = await response.json();
    const product = Array.isArray(payload) ? payload[0] : payload;
    const rawPrice = product?.new_price ?? product?.price ?? "";
    const inStock =
      typeof product?.listed === "boolean"
        ? product.listed
        : typeof product?.in_stock === "boolean"
          ? product.in_stock
          : typeof product?.stock === "number"
            ? product.stock > 0
            : typeof product?.quantity === "number"
              ? product.quantity > 0
              : null;

    return {
      provider: "alondra",
      price: String(rawPrice ?? "").trim(),
      inStock,
    };
  } catch {
    return {
      provider: "alondra",
      price: "",
      inStock: null,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function handleAlondra(data: ProviderResult, context: LiveStockContext): Promise<void> {
  const { checkStockBtn, statusEl, stockBadge } = context;

  const markup = (await getRuntimeMarkup()).alondra;
  const nextPrice = applyMarkupToPrice(data?.price, markup);
  if (nextPrice) {
    context.priceEl.textContent = `$${nextPrice}`;
  }

  if (data?.inStock === true) {
    stockBadge.textContent = "En Stock";
    stockBadge.style.background = "#27ae60";
    setStatus("Stock y precio actualizados desde Alondra.", "ok");
  } else if (data?.inStock === false) {
    stockBadge.textContent = "Sin stock";
    stockBadge.style.background = "#a33a3a";
    setStatus("Sin stock en Alondra. Precio actualizado si estuvo disponible.", "error");
  } else {
    setStatus("No se pudo confirmar stock en Alondra. Precio actualizado si hubo respuesta.");
  }
}

function setStatus(message: string, tone: "ok" | "error" | "neutral" = "neutral"): void {
  const statusEl = document.getElementById("stockCheckStatus") as HTMLParagraphElement | null;
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("is-ok", "is-error");
  if (tone === "ok") statusEl.classList.add("is-ok");
  if (tone === "error") statusEl.classList.add("is-error");
}