import type Product from "../types/product";

const MARTINA_HOST = "martinaditrento.com";

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeLabel(value: string): string {
  return toTitleCase(value.trim());
}

function isMartinaProduct(product: Product): boolean {
  const fromId = product.id.toLowerCase().startsWith("mdt-");
  const fromImage = product.img.some((image) => image.includes(MARTINA_HOST));
  return fromId || fromImage;
}

function getGenderFromCategory(product: Product): "Mujer" | "Hombre" | null {
  const category = product.categories.name.trim().toUpperCase();
  if (category === "MUJER") return "Mujer";
  if (category === "HOMBRE") return "Hombre";
  return null;
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

function isTecnoProduct(product: Product): boolean {
  return /tecno|tecnologia|tecnología/i.test(product.categories.name.trim());
}

export function getDisplayCategoryName(product: Product): string {
  const gender = getGenderFromCategory(product);
  if (isMartinaProduct(product) && gender) return "Ropa";
  return toTitleCase(product.categories.name.trim());
}

export function getDisplaySubcategories(product: Product): string[] {
  const rawSubcategories = product.categories.subcategories ?? [];
  let sourceSubcategories = rawSubcategories
    .map((sub) => normalizeLabel(sub.name))
    .filter(Boolean);

  if (sourceSubcategories.length === 0 && isTecnoProduct(product)) {
    sourceSubcategories = [normalizeLabel(inferTecnoSubcategory(product.name))];
  }

  const gender = getGenderFromCategory(product);
  if (!(isMartinaProduct(product) && gender)) {
    return sourceSubcategories;
  }

  if (sourceSubcategories.length === 0) {
    return [gender];
  }

  const detailed = sourceSubcategories.map((sub) => {
    const raw = sub.replace(/^Mujer\s*-\s*|^Hombre\s*-\s*/i, "").trim();
    return `${gender} - ${normalizeLabel(raw)}`;
  });

  return Array.from(
    new Set([
      gender,
      ...detailed,
    ]),
  );
}

export function productMatchesCategory(
  product: Product,
  categoryName: string,
): boolean {
  return getDisplayCategoryName(product) === categoryName;
}

export function productMatchesSubcategory(
  product: Product,
  categoryName: string,
  subcategoryName: string,
): boolean {
  return (
    productMatchesCategory(product, categoryName) &&
    getDisplaySubcategories(product).includes(subcategoryName)
  );
}
