import type { APIRoute } from "astro";

export const prerender = false;

const AVAILABILITY_IN_STOCK_MARKERS = [
  "en stock",
  "disponible",
  "in stock",
];

const AVAILABILITY_OUT_STOCK_MARKERS = [
  "sin stock",
  "agotado",
  "no disponible",
  "out of stock",
  "sold out",
];

const NUVEX_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "));
}

function extractAvailabilityText(html: string): string | null {
  // Patrón directo en texto plano: <li>Disponibilidad: En Stock</li>
  const plainPattern = /disponibilidad\s*:\s*([^<\n\r]{1,120})/i;
  const plainMatch = html.match(plainPattern);
  if (plainMatch?.[1]) {
    const normalized = stripHtml(plainMatch[1]);
    if (normalized) return normalized;
  }

  // Caso típico de Nuvex/OpenCart:
  // <li><span>Disponibilidad:</span> En stock</li>
  const liPattern =
    /<li[^>]*>\s*(?:<[^>]*>)?\s*disponibilidad\s*:?\s*(?:<\/[^>]*>)?\s*([^<]{1,120})\s*<\/li>/i;
  const liMatch = html.match(liPattern);
  if (liMatch?.[1]) {
    const normalized = stripHtml(liMatch[1]);
    if (normalized) return normalized;
  }

  // Fallback para variantes con más etiquetas intermedias.
  const genericPattern = /disponibilidad\s*:?([\s\S]{0,180})/i;
  const genericMatch = html.match(genericPattern);
  if (!genericMatch?.[1]) return null;

  const chunk = genericMatch[1];
  const untilBreak = chunk.split(/<\/li>|<br\s*\/?>|\n|\r/i)[0] ?? "";
  const cleaned = stripHtml(untilBreak);
  if (!cleaned) return null;

  // Evitar devolver textos demasiado largos/no relacionados.
  return cleaned.length <= 120 ? cleaned : cleaned.slice(0, 120);
}

function detectStockFromAvailabilityText(availabilityText: string): boolean | null {
  const normalized = String(availabilityText || "").toLowerCase();
  if (!normalized) return null;

  if (AVAILABILITY_OUT_STOCK_MARKERS.some((marker) => normalized.includes(marker))) {
    return false;
  }

  if (AVAILABILITY_IN_STOCK_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  return null;
}

function detectStockFromHtml(html: string): boolean | null {
  // Solo scraping del campo explícito "Disponibilidad" del HTML de Nuvex.
  const availabilityText = extractAvailabilityText(html);
  if (!availabilityText) return null;
  return detectStockFromAvailabilityText(availabilityText);
}

export const GET: APIRoute = async ({ url }) => {
  const providerUrl = url.searchParams.get("url")?.trim();

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
  const targetUrl = new URL(parsedUrl.toString());
  targetUrl.protocol = "https:";

  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      headers: NUVEX_HEADERS,
      signal: controller.signal,
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          inStock: null,
          price: "",
          availability: null,
          source: "nuvex-web",
          message: `HTTP ${response.status}`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const html = await response.text();
    const inStock = detectStockFromHtml(html);
    const availability = extractAvailabilityText(html);

    return new Response(
      JSON.stringify({
        inStock,
        price: "",
        availability,
        source: "nuvex-web",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({
        inStock: null,
        price: "",
        availability: null,
        source: "nuvex-web",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } finally {
    clearTimeout(timeout);
  }
};
