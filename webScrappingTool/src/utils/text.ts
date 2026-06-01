export function normalizeText(text: string): string {
  if (!text) return "";
  return text.replace(/\*/g, ' x ').replace(/\s+/g, ' ').trim();
}

export function cleanDescription(html: string): string {
  if (!html) return "";

  // Reemplazamos saltos de línea y listas con punto y espacio
  let text = html.replace(/<br\s*\/?>/gi, '. ')
    .replace(/<\/p>/gi, '. ')
    .replace(/<\/li>/gi, '. ')
    .replace(/<\/div>/gi, '. ');

  // Removemos cualquier etiqueta HTML restante
  text = text.replace(/<[^>]*>?/gm, ' ');

  // Eliminamos cualquier precio ($ seguido de numeros y comas/puntos)
  text = text.replace(/\$\s?[\d.,]+/g, '');

  // Reemplazamos asteriscos por x
  text = text.replace(/\*/g, ' x ');

  // Limpiamos los espacios y los multipuntos
  text = text.replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+\./g, '.')
    .trim();

  // Hacemos que la primer letra de cada oración sea mayúscula (Sentence Case)
  text = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

  text = text.replace(/(?:\.\s+)([a-z])/g, function (_, letter) {
    return ". " + letter.toUpperCase();
  });

  return text;
}

export function getUniqueColors(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const dictionary: Record<string, string[]> = {
    rojo: ['rojo', 'rojizo', 'bordó', 'vino', 'carmesí', 'burdeos'],
    azul: ['azul', 'azulado', 'celeste', 'turquesa', 'marino', 'jean'],
    negro: ['negro', 'oscuro', 'carbón', 'grafito'],
    blanco: ['blanco', 'marfil', 'beige', 'crema', 'manteca', 'perla'],
    verde: ['verde', 'oliva', 'esmeralda', 'pasto', 'militar'],
    amarillo: ['amarillo', 'dorado', 'mostaza'],
    gris: ['gris', 'plata'],
    rosa: ['rosa', 'rosado', 'fucsia', 'salmon'],
    marron: ['marrón', 'marron', 'café', 'cafe'],
    naranja: ['naranja', 'terracota'],
    lila: ['lila', 'violeta', 'morado'],
  };
  const matched: string[] = [];
  Object.entries(dictionary).forEach(([baseColor, variations]) => {
    const found = variations.some((v) => new RegExp(`\\b${v}\\b`, 'i').test(lower));
    if (found) matched.push(baseColor);
  });
  return [...new Set(matched)];
}

export function appendColorsToName(name: string, colors: string[]): string {
  const uniqueColors = [...new Set(colors.map((c) => c.trim()).filter(Boolean))];
  if (uniqueColors.length === 0) return name;
  const suffix = uniqueColors.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' ');
  if (name.toLowerCase().includes(suffix.toLowerCase())) return name;
  return `${name} ${suffix}`.trim();
}

export function inferSubcategory(productName: string, categoria: string): string {
  const lower = (productName || '').toLowerCase();
  // Infantil
  if (categoria === 'Infantil') {
    if (/\b(botella|biberon|mamadera)\b/.test(lower)) return 'Botellas';
    if (/\b(vaso|taza)\b/.test(lower)) return 'Vasos';
    if (/\b(lunchera|lonchera)\b/.test(lower)) return 'Luncheras';
    if (/\b(pote|recipiente)\b/.test(lower)) return 'Potes';
    if (/\b(paraguas|sombrilla)\b/.test(lower)) return 'Paraguas';
    if (/\b(cubiertos|cuchar|tenedor|cuchillo)\b/.test(lower)) return 'Cubiertos';
    if (/\b(bata|batita)\b/.test(lower)) return 'Batas';
  }

  // Cama
  if (categoria === 'Cama') {
    if (/\b(sábana|sabana|sabanas|sábana)\b/.test(lower)) return 'Sábanas';
    if (/\b(acolchad|acolchado|n[oó]rdico|acolchad[oa]s)\b/.test(lower)) return 'Acolchados';
    if (/\b(colcha|colchas)\b/.test(lower)) return 'Colchas';
    if (/\b(frazada|fraza|franela)\b/.test(lower)) return 'Frazadas';
    if (/\b(protector|protectores|funda|almohad)\b/.test(lower)) return 'Protectores';
  }

  // Baño
  if (categoria === 'Baño' || categoria === 'BAÑO') {
    if (/\b(toalla|toall[oó]n)\b/.test(lower)) return 'Toallas';
    if (/\b(alfombra|tapete)\b/.test(lower)) return 'Alfombras';
    if (/\b(bata|bata de ba[oó]o)\b/.test(lower)) return 'Batas';
  }

  // Ropa
  if (categoria === 'Ropa') {
    if (/\b(gorro|gorros)\b/.test(lower)) return 'Gorros';
    if (/\b(buzo|buzos|sweater|sudadera|cardigan|chaqueta|campera)\b/.test(lower)) return 'Buzos';
    if (/\b(playera|remera|camiseta|t[- ]?shirt|polo)\b/.test(lower)) return 'Playeras';
    if (/\b(media|medias|calcetin|calcetines)\b/.test(lower)) return 'Medias';
    if (/\b(cuello|bufanda|pañuelo)\b/.test(lower)) return 'Cuellos';
    if (/\b(pantalon|pants|jean|jeans|pantalones)\b/.test(lower)) return 'Pantalones';
    if (/\b(camisa|camisas|blusa)\b/.test(lower)) return 'Camisas';
    if (/\b(vestido|vestidos)\b/.test(lower)) return 'Vestidos';
    if (/\b(falda|faldas)\b/.test(lower)) return 'Faldas';
  }

  // Hogar
  if (categoria === 'Hogar') {
    if (/\b(mesa|mesita|mesas)\b/.test(lower)) return 'Mesa';
    if (/\b(almohad|almohada|almohadas)\b/.test(lower)) return 'Almohadas';
    if (/\b(coj[ií]n|cojin|cojines)\b/.test(lower)) return 'Cojines';
    if (/\b(cama|somier|colch[oó]n)\b/.test(lower)) return 'Cama';
    if (/\b(utensili|espatula|cuchar|cuchara|tenedor|vajilla|vajill?a)\b/.test(lower)) return 'Utensilios';
    if (/\b(l[áa]mpara|lampara|luz)\b/.test(lower)) return 'Lámparas';
    if (/\b(silla|sillas|taburete)\b/.test(lower)) return 'Sillas';
    if (/\b(estanter|estante|biblioteca)\b/.test(lower)) return 'Estantes';
  }

  return '';
}
