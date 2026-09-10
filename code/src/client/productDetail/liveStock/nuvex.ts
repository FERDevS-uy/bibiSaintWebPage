// Proveedor Nuvex

import { applyProviderMarkup } from "./providerUtils.js";
import type { LiveStockContext, ProviderResult } from "./types.js";

export async function fetchNuvexLive(providerUrl: string): Promise<ProviderResult> {
  if (!providerUrl || !providerUrl.toLowerCase().includes("nuvex.uy")) {
    return {
      provider: "nuvex",
      price: "",
      inStock: null,
      source: "nuvex-web",
    };
  }

  const endpointPath = `${String(document.documentElement.dataset.basePath || "").replace(/\/+$/, "")}/api/provider-nuvex`;
  const endpoint = new URL(endpointPath, window.location.origin);
  endpoint.searchParams.set("url", providerUrl);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(endpoint.toString(), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        provider: "nuvex",
        price: "",
        inStock: null,
        source: response.status === 404 ? "nuvex-static-no-api" : "nuvex-web",
      };
    }

    const payload = await response.json();
    return {
      provider: "nuvex",
      price: String(payload?.price ?? "").trim(),
      inStock: typeof payload?.inStock === "boolean" ? payload.inStock : null,
      source: String(payload?.source ?? "nuvex-web"),
    };
  } catch {
    return {
      provider: "nuvex",
      price: "",
      inStock: null,
      source: "nuvex-static-no-api",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function handleNuvex(data: ProviderResult, context: LiveStockContext): Promise<void> {
  const { checkStockBtn, statusEl, stockBadge, setSizeRequirement } = context;

  if (data?.inStock === true) {
    stockBadge.textContent = "En Stock";
    stockBadge.style.background = "#27ae60";
    setStatus("Stock verificado en Nuvex. El precio se mantiene según catálogo.", "ok");
  } else if (data?.inStock === false) {
    stockBadge.textContent = "Sin stock";
    stockBadge.style.background = "#a33a3a";
    setStatus("Sin stock en Nuvex. El precio se mantiene según catálogo.", "error");
  } else if (data?.source === "nuvex-static-no-api") {
    setStatus("Consultar con vendedor.");
  } else {
    setStatus("Ten presente que puede ser que este producto no este disponible.");
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