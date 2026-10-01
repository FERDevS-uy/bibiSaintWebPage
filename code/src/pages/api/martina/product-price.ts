// GET /api/martina/product-price?productId=...
// Verificación oficial del precio de un producto Martina (público).
//  - Solo usa `productId`; ignora cualquier `code`/`countryId` del visitante.
//  - Resuelve la campaña vigente desde ecommerce/config en el servidor.
//  - No toca Supabase: únicamente consulta a Martina.
import { fetchMartinaConfig, fetchMartinaProductById, extractMartinaColorDetails } from "@server/providers/martina";
import { parseCampaign } from "@server/providers/martinaCampaign";
import { normalizeProductPrice } from "@server/providers/martinaNormalizer";
import { normalizeSizes } from "@utils/sizes";
import { evaluateMartinaAvailability } from "@server/providers/martinaAvailability";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const rawId = (url.searchParams.get("productId") || "").trim();
  const numeric = rawId.replace(/^mdt-/i, "").trim();

  if (!rawId || !/^\d+$/.test(numeric)) {
    return json({ error: "productId inválido" }, 400);
  }

  try {
    const configRaw = await fetchMartinaConfig("598");
    const configPayload = configRaw && typeof configRaw === "object" && configRaw.data && typeof configRaw.data === "object"
      ? configRaw.data
      : configRaw;
    const campaignCode = String(configPayload?.code ?? "").trim();
    if (!/^\d{6}$/.test(campaignCode)) {
      throw new Error("Código de campaña de Martina inválido; no se puede consultar el producto.");
    }
    let campaignMetadataWarning: string | null = null;
    try {
      parseCampaign(configRaw);
    } catch (error) {
      campaignMetadataWarning = error instanceof Error ? error.message : "Metadatos de campaña inválidos";
    }

    const entries = await fetchMartinaProductById(numeric, campaignCode, "598");
    const availability = evaluateMartinaAvailability(entries);
    if (availability === "unknown") throw new Error("Disponibilidad de Martina desconocida");

    if (entries.length === 0) {
      return json({
        price: "",
        originalPrice: null,
        isDiscount: false,
        inStock: false,
        colors: [],
        sizes: [],
        campaignCode,
        campaignMetadataWarning,
      });
    }

    const first = entries[0];
    const { price, originalPrice, enOferta } = normalizeProductPrice(
      first?.price ?? "",
      first?.price1 ?? "",
    );

    const colors = extractMartinaColorDetails(entries);
    const allSizes = normalizeSizes(colors.flatMap((c) => c.rawSizes));
    const inStock = availability === "available";

    return json({
      price,
      originalPrice,
      isDiscount: enOferta,
      inStock,
      colors,
      sizes: allSizes,
      campaignCode,
      campaignMetadataWarning,
    });
  } catch (e: any) {
    console.error("martina product-price error:", e?.message || e);
    return json({ error: e?.message || "Error al consultar Martina" }, 502);
  }
}
