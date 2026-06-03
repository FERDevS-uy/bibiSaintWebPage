import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type Product from "../types/product";
import type { ProductColor } from "../types/product";

interface csvData {
  id: string;
  name: string;
  description: string;
  precio: string;
  imagen: string;
  categorias: string;
  subcategorias: string
  linkPago: string;
  relacionados: string;
  oferta: string,
  colores?: string,
}

function inferTecnoSubcategory(productName: string): string {
  const normalized = productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/(parlante|speaker|auricular|audio|mic|microfono|headset)/i.test(normalized)) return "Audio";
  if (/(cable|usb|tipo c|type c|hdmi|adaptador|conector|hub|cargador)/i.test(normalized)) return "Cables y Conectividad";
  if (/(aro de luz|ring|lampara|led|luz)/i.test(normalized)) return "Iluminacion";
  if (/(camara|smart|domotica|sensor|wifi|enchufe inteligente)/i.test(normalized)) return "Smart Home";
  if (/(soporte|holder|base|tripode|trípode)/i.test(normalized)) return "Soportes";
  if (/(gadget|reloj|smartwatch|teclado|mouse|raton|ratón)/i.test(normalized)) return "Gadgets";
  return "Accesorios";
}

function parseSubcategories(rawSubcategories: string, category: string, productName: string) {
  const trimmed = String(rawSubcategories ?? "").trim();
  if (trimmed) {
    return trimmed.split(/\|/).map((subC) => ({ name: subC.trim(), count: 0 }));
  }

  const isTecno = /tecno|tecnologia|tecnología/i.test(String(category ?? ""));
  if (!isTecno) return [];

  const inferred = inferTecnoSubcategory(productName);
  return [{ name: inferred, count: 0 }];
}

function parseImageList(raw: string | undefined): string[] {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [];

  // Soporta URLs separadas por espacios incluso cuando cada URL contiene espacios sin encodear.
  const urlMatches = trimmed.match(/https?:\/\/.*?(?=https?:\/\/|$)/g);
  if (urlMatches && urlMatches.length > 0) {
    return urlMatches.map((u) => u.trim()).filter(Boolean);
  }

  return trimmed.split(/\s+/).filter(Boolean);
}

function inferColorsFromImages(images: string[]): ProductColor[] | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined;

  const map = new Map<string, ProductColor>();
  const COLOR_RULES: Array<{ name: string; hex: string; re: RegExp }> = [
    { name: "Blanco", hex: "#f0ede3", re: /blanco|white/i },
    { name: "Marfil", hex: "#efe7d1", re: /marfil|ivory/i },
    { name: "Negro", hex: "#1a1a1a", re: /negro|black/i },
    { name: "Gris Claro", hex: "#bdbdbd", re: /gris\s*claro|gris\s*claro|grafite|graphite|gris/i },
    { name: "Celeste", hex: "#8dc6e8", re: /celeste|light\s*blue/i },
    { name: "Azul", hex: "#2f6fa3", re: /azul|blue/i },
    { name: "Rosa Claro", hex: "#f1b6c8", re: /rosa\s*claro|pink\s*light/i },
    { name: "Rosa Oscuro", hex: "#cd5c86", re: /rosa\s*oscuro|fucsia|magenta|pink/i },
    { name: "Verde", hex: "#5e8f5e", re: /verde|green/i },
    { name: "Mostaza", hex: "#c9a227", re: /mostaza|mustard|amarillo|yellow/i },
  ];

  images.forEach((url, idx) => {
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      decoded = url;
    }

    const normalized = decoded
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, " ")
      .replace(/[_-]+/g, " ")
      .toLowerCase();

    const match = COLOR_RULES.find((rule) => rule.re.test(normalized));
    if (!match) return;

    const key = match.name;
    const current = map.get(key);
    if (current) {
      current.images.push(url);
      return;
    }

    map.set(key, {
      id: idx + 1,
      name: match.name,
      hex: match.hex,
      images: [url],
    });
  });

  const inferred = Array.from(map.values());
  return inferred.length > 0 ? inferred : undefined;
}

function parseColors(raw: string | undefined, images: string[]): ProductColor[] | undefined {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return inferColorsFromImages(images);
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return inferColorsFromImages(images);
    const normalized = parsed
      .filter((c) => c && typeof c === "object")
      .map((c: any) => ({
        id: Number(c.id),
        hex: String(c.hex ?? "#cccccc"),
        name: String(c.name ?? ""),
        images: Array.isArray(c.images) ? c.images.map((i: any) => String(i)) : [],
        sizes: Array.isArray(c.sizes) ? c.sizes.map((s: any) => String(s).toUpperCase()) : undefined,
      }))
      .filter((c) => Number.isFinite(c.id) && c.name);

    return normalized.length > 0 ? normalized : inferColorsFromImages(images);
  } catch {
    return inferColorsFromImages(images);
  }
}

export function cargarProductos(): Product[] {
  const csvPath = path.resolve("src/data/productos.csv");
  const file = fs.readFileSync(csvPath, "utf8");

  const res = Papa.parse<csvData>(file, {
    header: true,
    skipEmptyLines: true,
  })

  if (res.errors.length > 0) {
    console.error(res.errors);
    throw new Error("Error al parsear CSV")
  }

  const data: Product[] = res.data.map(d => {
    const images = parseImageList(d.imagen);
    const paymentLinks = parseImageList(d.linkPago)
      .map((lp, i) => ({ id: `${i}`, url: lp }));

    return {
      id: d.id.trim(),
      name: d.name.trim(),
      description: d.description.trim(),
      price: d.precio.trim(),
      img: images,
      paymentLink: paymentLinks,
      enOferta: d.oferta.toLowerCase() === "true" ? true : false,
      relacionados: d.relacionados.trim() ? d.relacionados.split(/\s+/) : [],
      categories: {
        name: d.categorias.trim(),
        count: 0,
        subcategories: parseSubcategories(d.subcategorias, d.categorias, d.name),
      },
      colors: parseColors(d.colores, images),
    };
  })


  return data;
}
