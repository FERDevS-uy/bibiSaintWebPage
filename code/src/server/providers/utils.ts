export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeText(text: string): string {
  if (!text) return "";
  return text.replace(/\*/g, " x ").replace(/\s+/g, " ").trim();
}

export function formatPriceNumber(n: number): string {
  if (!isFinite(n)) return "";
  const absValue = Math.abs(n);
  const baseInteger = Math.trunc(absValue);
  const decimalPart = absValue - baseInteger;
  const roundedInteger = decimalPart + 1e-9 >= 0.6 ? baseInteger + 1 : baseInteger;
  const integerPart = n < 0 ? -roundedInteger : roundedInteger;
  return integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parsePrice(value: string | number, multiplier = 1): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  let normalized = raw.replace(/\s+/g, "");
  normalized = normalized.replace(/[^0-9,.-]/g, "");

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    if (lastDot > lastComma) {
      normalized = normalized.replace(/,/g, "");
      if (normalized.endsWith(".00")) normalized = normalized.slice(0, -3);
    } else {
      normalized = normalized.replace(/\./g, "");
      normalized = normalized.replace(/,/g, ".");
      if (normalized.endsWith(".00")) normalized = normalized.slice(0, -3);
    }
  } else if (hasComma) {
    const commaIndex = normalized.lastIndexOf(",");
    const decimals = normalized.length - commaIndex - 1;
    if (decimals === 3) {
      return normalized.replace(/,/g, ".");
    }
    normalized = normalized.replace(/,/g, ".");
    if (normalized.endsWith(".00")) normalized = normalized.slice(0, -3);
  } else if (hasDot) {
    const dotIndex = normalized.lastIndexOf(".");
    const decimals = normalized.length - dotIndex - 1;
    if (decimals === 3) {
      return normalized;
    }
    if (normalized.endsWith(".00")) normalized = normalized.slice(0, -3);
  }

  const valueNumber = parseFloat(normalized);
  if (Number.isNaN(valueNumber)) return "";
  const adjusted = valueNumber * (Number.isFinite(multiplier) ? multiplier : 1);
  return formatPriceNumber(adjusted);
}

export function cleanDescription(html: string): string {
  if (!html) return "";

  let text = html
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<\/p>/gi, ". ")
    .replace(/<\/li>/gi, ". ")
    .replace(/<\/div>/gi, ". ");

  text = text.replace(/<[^>]*>?/gm, " ");

  text = text
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ");

  text = text.replace(/\$\s?[\d.,]+/g, "");
  text = text.replace(/\*/g, " x ");

  text = text
    .replace(/^\s*cod\s*(?:or|art|ref)?\s*:\s*[^.]{0,220}\.?\s*/i, "")
    .replace(/^\s*codigo\s*(?:or|art|ref)?\s*:\s*[^.]{0,220}\.?\s*/i, "");
  text = text.replace(/\bcod\s*(?:or|art|ref)?\s*:\s*[^.]{0,220}\.?/gi, " ");

  text = text
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+\./g, ".")
    .replace(/\.{2,}/g, ".")
    .trim();

  text = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  text = text.replace(/(?:\.\s+)([a-z])/g, (_, letter) => ". " + letter.toUpperCase());

  return text;
}

export function getUniqueColors(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const dictionary: Record<string, string[]> = {
    rojo: ["rojo", "rojizo", "bordó", "vino", "carmesí", "burdeos"],
    azul: ["azul", "azulado", "celeste", "turquesa", "marino", "jean"],
    negro: ["negro", "oscuro", "carbón", "grafito"],
    blanco: ["blanco", "marfil", "beige", "crema", "manteca", "perla"],
    verde: ["verde", "oliva", "esmeralda", "pasto", "militar"],
    amarillo: ["amarillo", "dorado", "mostaza"],
    gris: ["gris", "plata"],
    rosa: ["rosa", "rosado", "fucsia", "salmon"],
    marron: ["marrón", "marron", "café", "cafe"],
    naranja: ["naranja", "terracota"],
    lila: ["lila", "violeta", "morado"],
  };
  const matched: string[] = [];
  Object.entries(dictionary).forEach(([baseColor, variations]) => {
    const found = variations.some((v) => new RegExp(`\\b${v}\\b`, "i").test(lower));
    if (found) matched.push(baseColor);
  });
  return [...new Set(matched)];
}

export function appendColorsToName(name: string, colors: string[]): string {
  const uniqueColors = [...new Set(colors.map((c) => c.trim()).filter(Boolean))];
  if (uniqueColors.length === 0) return name;
  const suffix = uniqueColors.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(" ");
  if (name.toLowerCase().includes(suffix.toLowerCase())) return name;
  return `${name} ${suffix}`.trim();
}

export function inferSubcategory(productName: string, categoria: string): string {
  const lower = (productName || "").toLowerCase();

  if (categoria === "Infantil") {
    if (/\b(botella|biberon|mamadera)\b/.test(lower)) return "Botellas";
    if (/\b(vaso|taza)\b/.test(lower)) return "Vasos";
    if (/\b(lunchera|lonchera)\b/.test(lower)) return "Luncheras";
    if (/\b(pote|recipiente)\b/.test(lower)) return "Potes";
    if (/\b(paraguas|sombrilla)\b/.test(lower)) return "Paraguas";
    if (/\b(cubiertos|cuchar|tenedor|cuchillo)\b/.test(lower)) return "Cubiertos";
    if (/\b(bata|batita)\b/.test(lower)) return "Batas";
  }

  if (categoria === "Cama") {
    if (/\b(sábana|sabana|sabanas|sábana)\b/.test(lower)) return "Sábanas";
    if (/\b(acolchad|acolchado|n[oó]rdico|acolchad[oa]s)\b/.test(lower)) return "Acolchados";
    if (/\b(colcha|colchas)\b/.test(lower)) return "Colchas";
    if (/\b(frazada|fraza|franela)\b/.test(lower)) return "Frazadas";
    if (/\b(protector|protectores|funda|almohad)\b/.test(lower)) return "Protectores";
  }

  if (categoria === "Baño" || categoria === "BAÑO") {
    if (/\b(toalla|toall[oó]n)\b/.test(lower)) return "Toallas";
    if (/\b(alfombra|tapete)\b/.test(lower)) return "Alfombras";
    if (/\b(bata|bata de ba[oó]o)\b/.test(lower)) return "Batas";
  }

  if (categoria === "Ropa") {
    if (/\b(gorro|gorros)\b/.test(lower)) return "Gorros";
    if (/\b(buzo|buzos|sweater|sudadera|cardigan|chaqueta|campera)\b/.test(lower)) return "Buzos";
    if (/\b(playera|remera|camiseta|t[- ]?shirt|polo)\b/.test(lower)) return "Playeras";
    if (/\b(media|medias|calcetin|calcetines)\b/.test(lower)) return "Medias";
    if (/\b(cuello|bufanda|pañuelo)\b/.test(lower)) return "Cuellos";
    if (/\b(pantalon|pants|jean|jeans|pantalones)\b/.test(lower)) return "Pantalones";
    if (/\b(camisa|camisas|blusa)\b/.test(lower)) return "Camisas";
    if (/\b(vestido|vestidos)\b/.test(lower)) return "Vestidos";
    if (/\b(falda|faldas)\b/.test(lower)) return "Faldas";
  }

  if (categoria === "Hogar") {
    if (/\b(mesa|mesita|mesas)\b/.test(lower)) return "Mesa";
    if (/\b(almohad|almohada|almohadas)\b/.test(lower)) return "Almohadas";
    if (/\b(coj[ií]n|cojin|cojines)\b/.test(lower)) return "Cojines";
    if (/\b(cama|somier|colch[oó]n)\b/.test(lower)) return "Cama";
    if (/\b(utensili|espatula|cuchar|cuchara|tenedor|vajilla|vajill?a)\b/.test(lower)) return "Utensilios";
    if (/\b(l[áa]mpara|lampara|luz)\b/.test(lower)) return "Lámparas";
    if (/\b(silla|sillas|taburete)\b/.test(lower)) return "Sillas";
    if (/\b(estanter|estante|biblioteca)\b/.test(lower)) return "Estantes";
  }

  return "";
}

const isNode = typeof process !== "undefined" && !!process.versions?.node;

export async function fetchJson(url: string, timeoutMs = 25000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function martinaFetch(url: string, timeoutMs = 30000): Promise<any> {
  if (!isNode) {
    return fetchJson(url, timeoutMs);
  }

  const https = await import("node:https");
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          accept: "application/json, text/plain, */*",
          Referer: "https://tienda.martinaditrento.com/",
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e: any) {
            reject(new Error(`JSON parse error: ${e?.message}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    });
  });
}

export interface ProductRow {
  id: string;
  name: string;
  description: string;
  price: string;
  img: string[];
  categories: { name: string; count: number; subcategories: Array<{ name: string; count: number }> };
  payment_link: Array<{ id: string; url: string }>;
  relacionados: string[];
  en_oferta: boolean;
  colors?: Array<{ id: number; hex: string; name: string; images: string[]; sizes?: string[] }>;
  source: string;
  active: boolean;
  auto_update_price: boolean;
  external_id: string;
}
