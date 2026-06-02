import type { APIRoute } from "astro";

const OUT_OF_STOCK_MARKERS = [
  "sin stock",
  "agotado",
  "no disponible",
  "out of stock",
  "sold out",
  "producto no encontrado",
];

const IN_STOCK_MARKERS = [
  "agregar al carrito",
  "añadir al carrito",
  "add to cart",
  "comprar",
  "disponible",
  "in stock",
];

function detectStockFromHtml(html: string): boolean | null {
  const text = html.toLowerCase();

  if (OUT_OF_STOCK_MARKERS.some((marker) => text.includes(marker))) {
    return false;
  }

  if (IN_STOCK_MARKERS.some((marker) => text.includes(marker))) {
    return true;
  }

  return null;
}

function formatPriceNumber(raw: number): string {
  const rounded = Math.trunc(raw);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseNuvexPrice(html: string): string {
  const patterns = [
    /product:price:amount["'][^>]*content=["']([\d.,]+)["']/i,
    /itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i,
    /class=["'][^"']*price[^"']*["'][^>]*>\s*\$?\s*([\d.,]+)\s*</i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;

    const normalized = String(match[1]).replace(/\./g, "").replace(",", ".").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && parsed > 0) {
      return formatPriceNumber(parsed);
    }
  }

  return "";
}

export const GET: APIRoute = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const providerUrl = requestUrl.searchParams.get("url")?.trim();

  if (!providerUrl) {
    return new Response(
      JSON.stringify({ error: "Missing url parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(providerUrl);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid url parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!parsedUrl.hostname.toLowerCase().includes("nuvex.uy")) {
    return new Response(
      JSON.stringify({ error: "Only nuvex.uy urls are allowed" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          inStock: false,
          price: "",
          source: "nuvex-web",
          message: `HTTP ${response.status}`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const html = await response.text();
    const inStock = detectStockFromHtml(html);
    const price = parseNuvexPrice(html);

    return new Response(
      JSON.stringify({
        inStock,
        price,
        source: "nuvex-web",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({
        inStock: null,
        price: "",
        source: "nuvex-web",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } finally {
    clearTimeout(timeout);
  }
};
