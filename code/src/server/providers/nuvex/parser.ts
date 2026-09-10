// parser.ts
// Parser puro del HTML de detalle de Nuvex (OpenCart). Sin dependencias externas
// (sin cheerio) para poder correr en el Worker. Extrae los campos necesarios para
// construir un ProductRow normalizado.
import { parsePrice } from "../utils.ts";
import { isValidNuvexImageUrl } from "./security.ts";
import { DEFAULT_PROVIDER_MARKUP } from "../../../config/providerMargins.ts";

export interface NuvexColor {
  id: number;
  hex: string;
  name: string;
  images: string[];
  sizes: string[];
}

export interface NuvexProductDraft {
  id: string; // product_id numérico
  name: string;
  description: string;
  /** Precio final (con markup) formateado; vacío si no se pudo obtener. */
  price: string;
  /** Precio de oferta (sin markup) tal como lo expone Nuvex; vacío si no hay. */
  offerPriceRaw: string;
  /** Precio original de Nuvex (sin markup); vacío si no hay oferta. */
  originalPriceRaw: string;
  /** true si Nuvex marca descuento (.price-old presente). */
  hasOffer: boolean;
  images: string[];
  colors: NuvexColor[];
  categoryName: string;
  linkPago: string;
}

// Pure-sync parser: uses the shared default markup (1.4). Runtime DB overrides
// (provider_catalog_settings.markup) are applied at the collection layer
// (nuvexSync.ts -> draftToProductRow), not inside this parser.
const NUVEX_MARKUP = DEFAULT_PROVIDER_MARKUP.nuvex;

const CANONICAL_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? m[1].trim() : "";
}

function toTitleCase(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/(^|[\s-])([a-záéíóúñ])/g, (_s, sp, c) => sp + c.toUpperCase())
    .trim();
}

function colorHexFromName(name: string): string {
  const lower = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/(blanco|marfil|crema|beige)/.test(lower)) return "#f0ede3";
  if (/negro/.test(lower)) return "#1a1a1a";
  if (/(gris|plata)/.test(lower)) return "#9e9e9e";
  if (/(azul|marino|celeste)/.test(lower)) return "#2f6fa3";
  if (/(rosa|fucsia)/.test(lower)) return "#e27ca7";
  if (/(rojo|bordo|vino)/.test(lower)) return "#b43a3a";
  if (/(verde|oliva)/.test(lower)) return "#4f7b4f";
  if (/(amarillo|mostaza|dorado)/.test(lower)) return "#c9a227";
  if (/(marron|cafe)/.test(lower)) return "#8a5a3b";
  if (/(naranja|terracota)/.test(lower)) return "#d97745";
  return "#cccccc";
}

function normalizeLegacySize(token: string): string | null {
  const t = String(token || "").trim().toUpperCase();
  const map: Record<string, string> = {
    XS: "XS", S: "S", P: "S", M: "M", L: "L", G: "L",
    XL: "XL", XG: "XL", GG: "XL", XXL: "XXL", XXXL: "XXXL",
  };
  return map[t] || null;
}

function extractSizeHint(colorName: string): string | null {
  const m = String(colorName || "").toUpperCase().match(/\b(XXXL|XXL|XL|XS|GG|XG|G|M|P|S|L)\b/);
  return m ? normalizeLegacySize(m[1]) : null;
}

function cleanColorName(raw: string): string {
  const cleaned = String(raw || "")
    .replace(/\b(XXXL|XXL|XL|XS|GG|XG|G|M|P|S|L)\b/gi, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/[\s_-]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return toTitleCase(cleaned);
}

function groupKey(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Extrae las opciones de color/talle del HTML de un <select> de Nuvex. */
function parseColorOptions(selectHtml: string): Array<{ code: string; name: string; sizeHint: string | null }> {
  const out: Array<{ code: string; name: string; sizeHint: string | null }> = [];
  for (const m of selectHtml.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)) {
    const text = stripHtml(m[2]).replace(/\s+/g, " ").trim();
    if (!text || /selecciona/i.test(text)) continue;
    const withCode = text.match(/^(\d{6,})\s+(.+)$/);
    if (withCode) {
      const code = withCode[1].trim();
      const color = withCode[2].trim();
      if (!color) continue;
      const sizeHint = extractSizeHint(color);
      out.push({ code, name: cleanColorName(color) || toTitleCase(color), sizeHint });
    } else {
      const sizeHint = extractSizeHint(text);
      out.push({ code: "", name: cleanColorName(text) || toTitleCase(text), sizeHint });
    }
  }
  return out;
}

export function parseNuvexProductHtml(html: string, url: string, categoryName: string): NuvexProductDraft | null {
  const idMatch = url.match(/product_id=(\d+)/);
  const id = idMatch ? idMatch[1] : "";

  const name = stripHtml(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i));
  if (!id && !name) return null;

  // Descripción: div#tab-description
  const descMatch = html.match(/id="tab-description"[\s\S]*?>([\s\S]*?)<\/div>/i);
  const description = stripHtml(descMatch ? descMatch[1] : "").slice(0, 4000);

  // Precios
  const priceNew = stripHtml(firstMatch(html, /class="price-new"[^>]*>([\s\S]*?)<\/[^>]+>/i));
  const priceOld = stripHtml(firstMatch(html, /class="price-old"[^>]*>([\s\S]*?)<\/[^>]+>/i));
  // Precio normal: primer <h2> dentro de un ul.list-unstyled (estructura OpenCart)
  const h2InList = firstMatch(html, /<ul class="list-unstyled">[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const h2Content = stripHtml(firstMatch(html, /<h2[^>]*>([\s\S]*?)<\/h2>/i));

  const hasOffer = /class="price-old"/.test(html);
  const rawPrice = priceNew || h2InList || h2Content || "";
  const offerRaw = priceOld;

  // Precio final con markup. Si rawPrice está vacío, price queda vacío (precio faltante).
  const price = rawPrice ? parsePrice(rawPrice, NUVEX_MARKUP) : "";

  // Imágenes
  const images: string[] = [];
  for (const m of html.matchAll(/<a class="thumbnail"[^>]*href="([^"]+)"/gi)) {
    const img = decodeNuvexImageUrl(m[1]);
    if (img && isValidNuvexImageUrl(img)) images.push(img);
  }
  // fallback: primer thumbnails li a href
  if (images.length === 0) {
    const fb = firstMatch(html, /<li><a class="thumbnail"[^>]*href="([^"]+)"/i);
    const img = decodeNuvexImageUrl(fb);
    if (img && isValidNuvexImageUrl(img)) images.push(img);
  }

  // Colores: prefiere #input-option103, sino select[id^=input-option]
  const preferred = html.match(/<select[^>]*id="input-option103"[^>]*>([\s\S]*?)<\/select>/i);
  const selectHtml = preferred
    ? preferred[1]
    : (html.match(/<select[^>]*id="input-option\d+"[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "");

  const options = parseColorOptions(selectHtml);
  const usedImages = new Set<string>();
  const grouped = new Map<string, NuvexColor>();

  options.forEach((opt, idx) => {
    let matched = "";
    if (opt.code) {
      matched = images.find((u) => !usedImages.has(u) && u.includes(opt.code)) || "";
    }
    if (!matched) {
      const norm = String(opt.name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      matched =
        images.find((u) => {
          if (usedImages.has(u)) return false;
          let decoded = "";
          try {
            decoded = decodeURIComponent(u);
          } catch {
            decoded = u;
          }
          return String(decoded)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .includes(norm);
        }) || "";
    }
    if (matched) usedImages.add(matched);

    const key = groupKey(opt.name) || `color-${idx + 1}`;
    const existing = grouped.get(key);
    if (existing) {
      if (matched && !existing.images.includes(matched)) existing.images.push(matched);
      if (opt.sizeHint && !existing.sizes.includes(opt.sizeHint)) existing.sizes.push(opt.sizeHint);
    } else {
      grouped.set(key, {
        id: idx + 1,
        hex: colorHexFromName(opt.name),
        name: opt.name,
        images: matched ? [matched] : [],
        sizes: opt.sizeHint ? [opt.sizeHint] : [],
      });
    }
  });

  const colors = Array.from(grouped.values()).map((c) => ({
    ...c,
    sizes: CANONICAL_SIZES.filter((s) => c.sizes.includes(s)),
  }));

  const allImages = Array.from(new Set([...colors.flatMap((c) => c.images), ...images]));

  return {
    id,
    name,
    description,
    price,
    offerPriceRaw: offerRaw,
    originalPriceRaw: hasOffer ? offerRaw : "",
    hasOffer,
    images: allImages,
    colors,
    categoryName: categoryName || "General",
    linkPago: url,
  };
}

function decodeNuvexImageUrl(url: string): string {
  const clean = String(url || "").trim().replace(/&amp;/g, "&");
  if (!clean) return "";
  return clean
    .replace(/-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i, ".$1")
    .replace("/image/cache/catalog/", "/image/catalog/");
}
