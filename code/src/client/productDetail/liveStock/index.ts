// Registro de proveedores (Open/Closed: agregar proveedores sin tocar el flujo central)

import type { Provider, ProviderResult, LiveStockContext } from "./types.js";
import { fetchMartinaLive, handleMartina } from "./martina.js";
import { fetchKaiLive, handleKai } from "./kai.js";
import { fetchNuvexLive, handleNuvex } from "./nuvex.js";
import { fetchAlondraLive, handleAlondra } from "./alondra.js";
import { providerFrom } from "./providerUtils.js";

export interface ProviderHandler {
  provider: Provider;
  fetch: (idOrUrl: string) => Promise<ProviderResult>;
  handle: (data: ProviderResult, context: LiveStockContext) => Promise<void>;
}

export const liveStockRegistry: Record<Provider, ProviderHandler> = {
  martina: {
    provider: "martina",
    fetch: fetchMartinaLive,
    handle: handleMartina,
  },
  kaideco: {
    provider: "kaideco",
    fetch: fetchKaiLive,
    handle: handleKai,
  },
  nuvex: {
    provider: "nuvex",
    fetch: fetchNuvexLive,
    handle: handleNuvex,
  },
  alondra: {
    provider: "alondra",
    fetch: fetchAlondraLive,
    handle: handleAlondra,
  },
  unknown: {
    provider: "unknown",
    fetch: async () => ({
      provider: "unknown",
      price: "",
      inStock: null,
    }),
    handle: async (_data, context) => {
      setStatus(context, "Este proveedor no soporta verificación en vivo desde esta página.", "error");
    },
  },
};

export function getProviderHandler(provider: Provider): ProviderHandler {
  return liveStockRegistry[provider] ?? liveStockRegistry.unknown;
}

export function resolveProvider(productId: string, providerLink: string): Provider {
  return providerFrom(productId, providerLink);
}

export async function executeLiveCheck(
  productId: string,
  providerLink: string,
  context: LiveStockContext
): Promise<void> {
  const provider = resolveProvider(productId, providerLink);
  const handler = getProviderHandler(provider);

  const originalText = context.checkStockBtn.textContent;
  context.checkStockBtn.disabled = true;
  context.checkStockBtn.classList.add("is-loading");
  context.checkStockBtn.textContent = "Verificando...";
  setStatus(context, "Consultando proveedor en vivo...");

  try {
    const data = await handler.fetch(provider === "martina" || provider === "alondra" ? productId : providerLink);
    await handler.handle(data, context);
  } catch (error) {
    setStatus(context, "No se pudo verificar ahora. Se mantiene información estática.", "error");
  } finally {
    context.checkStockBtn.disabled = false;
    context.checkStockBtn.classList.remove("is-loading");
    context.checkStockBtn.textContent = originalText || "Verificar stock y precio";
  }
}

function setStatus(context: LiveStockContext, message: string, tone: "ok" | "error" | "neutral" = "neutral"): void {
  context.statusEl.textContent = message;
  context.statusEl.classList.remove("is-ok", "is-error");
  if (tone === "ok") context.statusEl.classList.add("is-ok");
  if (tone === "error") context.statusEl.classList.add("is-error");
}