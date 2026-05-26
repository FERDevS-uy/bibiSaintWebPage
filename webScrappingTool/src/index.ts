import fs from 'fs/promises';
import Papa from 'papaparse';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import https from 'https';
import { stringSimilarity } from 'string-similarity-js';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import FormData from 'form-data';
import dotenv from "dotenv";

const csvFilePath = path.resolve(__dirname, '../../code/src/data/productos.csv');
const baseUrl = "https://nuvex.uy/index.php?route=common/home";
const loginUrl = "https://nuvex.uy/index.php?route=account/login";
const THRESHOLD = 0.7;

dotenv.config();
export default interface Product {
  id: string;
  relacionados: string | string[];
  name: string;
  description: string;
  precio: string;
  imagen: string;
  categorias: string;
  linkPago: string;
  subcategorias: string;
  oferta: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeText(text: string): string {
  if (!text) return "";
  return text.replace(/\*/g, ' x ').replace(/\s+/g, ' ').trim();
}

function cleanDescription(html: string): string {
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


function getUniqueColors(text: string): string[] {
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

function appendColorsToName(name: string, colors: string[]): string {
  const uniqueColors = [...new Set(colors.map((c) => c.trim()).filter(Boolean))];
  if (uniqueColors.length === 0) return name;
  const suffix = uniqueColors.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' ');
  if (name.toLowerCase().includes(suffix.toLowerCase())) return name;
  return `${name} ${suffix}`.trim();
}

function inferSubcategory(productName: string, categoria: string): string {
  const lower = productName.toLowerCase();
  if (categoria === 'Infantil') {
    if (lower.includes('botella')) return 'Botellas';
    if (lower.includes('vaso')) return 'Vasos';
    if (lower.includes('lunchera')) return 'Luncheras';
    if (lower.includes('pote')) return 'Potes';
    if (lower.includes('paraguas')) return 'Paraguas';
    if (lower.includes('cubiertos')) return 'Cubiertos';
    if (lower.includes('bata')) return 'Batas';
  }
  if (categoria === 'Cama') {
    if (lower.includes('sábana') || lower.includes('sabana')) return 'Sábanas';
    if (lower.includes('acolchado')) return 'Acolchados';
    if (lower.includes('colcha')) return 'Colchas';
    if (lower.includes('frazada')) return 'Frazadas';
    if (lower.includes('protector')) return 'Protectores';
  }
  if (categoria === 'Baño' || categoria === 'BAÑO') {
    if (lower.includes('toalla')) return 'Toallas';
    if (lower.includes('alfombra')) return 'Alfombras';
    if (lower.includes('bata')) return 'Batas';
  }
  if (categoria === 'Ropa') {
    if (lower.includes('gorro')) return 'Gorros';
    if (lower.includes('buzo')) return 'Buzos';
    if (lower.includes('playera') || lower.includes('remera')) return 'Playeras';
    if (lower.includes('media')) return 'Medias';
    if (lower.includes('cuello')) return 'Cuellos';
    if (lower.includes('pantalon') || lower.includes('pants') || lower.includes('jean')) return 'Pantalones';
    if (lower.includes('camisa') || lower.includes('camiseta')) return 'Camisas';
    if (lower.includes('vestido')) return 'Vestidos';
    if (lower.includes('falda')) return 'Faldas';
  }
  if (categoria === 'Hogar') {
    if (lower.includes('mesa')) return 'Mesa';
    if (lower.includes('almohad') || lower.includes('almohada')) return 'Almohadas';
    if (lower.includes('cojín') || lower.includes('cojin')) return 'Cojines';
    if (lower.includes('cama')) return 'Cama';
    if (lower.includes('utensilio') || lower.includes('espatula') || lower.includes('cuchar')) return 'Utensilios';
    if (lower.includes('lámpara') || lower.includes('lampara')) return 'Lámparas';
    if (lower.includes('silla')) return 'Sillas';
    if (lower.includes('estanter')) return 'Estantes';
  }
  return '';
}

function parsePrice(value: string | number): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  let normalized = raw.replace(/\s+/g, '');
  normalized = normalized.replace(/[^0-9,.-]/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '');
    normalized = normalized.replace(/,/g, '.');
  } else if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replace(/,/g, '.');
  }
  const valueNumber = parseFloat(normalized);
  if (Number.isNaN(valueNumber)) return '';
  return Math.round(valueNumber).toString();
}

function searchSimilarity(productos: Product[]) {
  return productos.map((producto) => {
    const relacionados = productos
      .filter((p) => producto.id !== p.id)
      .filter((p) => stringSimilarity(producto.name, p.name) > THRESHOLD)
      .map((p) => p.id);
    return {
      ...producto,
      relacionados: relacionados.join(' '),
    };
  });
}

const jar = new CookieJar();
const client = wrapper(axios.create({ jar } as any));
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const KAI_JSON_URL = 'https://kaideco.uy/products.json?limit=250';
const MARTINA_PRODUCT_URL = 'https://pol21.martinaditrento.com/mdt-services/resources/store/product?countryId=598&code=202506';
const MARTINA_IMAGE_BASE = 'https://pol21.martinaditrento.com/images/products/md/';

async function login(): Promise<boolean> {
  if (!process.env.USER_EMAIL || !process.env.USER_PASS) {
    console.warn('Advertencia: USER_EMAIL o USER_PASS no encontrado en el entorno. Se omitirá el login de Nuvex.');
    return false;
  }

  console.log('Iniciando sesión en la tienda...');
  const form = new FormData();
  form.append('email', process.env.USER_EMAIL);
  form.append('password', process.env.USER_PASS);

  try {
    const res = await client.post(loginUrl, form, {
      headers: form.getHeaders(),
      maxRedirects: 5,
    });
    if (res.status === 200) {
      console.log('Sesión iniciada con éxito. Los precios ahora son accesibles.');
      return true;
    }
  } catch (err: any) {
    console.error('Error al iniciar sesión:', err.message);
  }
  return false;
}

async function getCategories(): Promise<string[]> {
  try {
    const { data } = await client.get(baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const categoryUrls = new Set<string>();
    $('a').each((_, el) => {
      let href = $(el).attr('href');
      if (href && href.includes('route=product/category&path=')) {
        href = href.replace(/&amp;/g, '&');
        categoryUrls.add(href);
      }
    });
    return Array.from(categoryUrls).map((u) => u.split('&page')[0].split('&limit')[0]);
  } catch (err) {
    console.error('Error al obtener categorías:', err);
    return [];
  }
}

async function scrapNuvexProducts(): Promise<Product[]> {
  const loggedIn = await login();
  if (!loggedIn) {
    console.warn('No se pudo iniciar sesión en Nuvex. El scraping se intentará, pero algunos datos pueden faltar.');
  }
  console.log('Obteniendo categorías principales de Nuvex...');
  const categories = await getCategories();
  const uniqueCategories = Array.from(new Set(categories));
  console.log(`Se encontraron ${uniqueCategories.length} categorías en Nuvex.`);
  const productQueue: { url: string; catName: string }[] = [];
  for (const catUrl of uniqueCategories) {
    console.log(`Buscando enlaces de productos en: ${catUrl}`);
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage) {
      const pageUrl = `${catUrl}&page=${page}&limit=1000`;
      try {
        const { data } = await client.get(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        const $layouts = $('.product-layout');
        if ($layouts.length === 0) {
          hasNextPage = false;
          break;
        }
        const breadcrumbItems = $('.breadcrumb li:not(:first-child) a').map((_, el) => $(el).text().trim()).get();
        let catName = 'General';
        if (breadcrumbItems.length > 0) catName = breadcrumbItems[0];
        else catName = $('#content h2').first().text().trim() || 'General';
        catName = catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase();
        $layouts.each((_, el) => {
          const productHref = $(el).find('.caption h4 a').attr('href');
          if (productHref) productQueue.push({ url: productHref.replace(/&amp;/g, '&'), catName });
        });
      } catch (err: any) {
        console.error(`Error recogiendo enlaces en ${catUrl} página ${page}:`, err.message);
        break;
      }
      page++;
      await delay(200);
    }
  }
  const uniqueQueue = Array.from(new Map(productQueue.map((item) => [item.url, item])).values());
  console.log(`=== Se recorrerán lentamente ${uniqueQueue.length} páginas de productos individuales de Nuvex ===`);
  const allProductsMap = new Map<string, Product>();
  for (let i = 0; i < uniqueQueue.length; i++) {
    const { url, catName } = uniqueQueue[i];
    console.log(`[${i + 1}/${uniqueQueue.length}] Raspando Nuvex: ${url}`);
    try {
      const { data } = await client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(data);
      let id = '';
      const productMatchId = url.match(/product_id=(\d+)/);
      if (productMatchId) id = productMatchId[1];
      if (!id) {
        const btnTxt = $('#button-cart').attr('onclick') || $('#button-cart').parent().html();
        const matchBtn = btnTxt?.match(/cart\.add\('(\d+)'/);
        if (matchBtn) id = matchBtn[1];
        else id = String(Math.floor(Math.random() * 999999));
      }
      const rawName = $('#content h1').text().trim() || '';
      const name = normalizeText(rawName);
      const htmlDesc = $('#tab-description').html() || '';
      const description = cleanDescription(htmlDesc);
      let rawPrice = $('.list-unstyled h2').first().text().trim() || $('.price-new').text().trim() || $('#content h2').first().text().trim();
      let oferta = $('.price-old').length > 0 ? 'true' : '';
      let precioFinal = '';
      if (rawPrice) {
        let numStr = rawPrice.replace(/\s+/g, '');
        numStr = numStr.replace(/[^0-9,.-]/g, '');
        if (numStr.includes(',') && numStr.includes('.')) {
          numStr = numStr.replace(/\./g, '');
          numStr = numStr.replace(/,/g, '.');
        } else if (numStr.includes(',') && !numStr.includes('.')) {
          numStr = numStr.replace(/,/g, '.');
        }
        const value = parseFloat(numStr);
        if (!Number.isNaN(value)) precioFinal = Math.round(value * 1.4).toString();
      }
      let imagen = $('.thumbnails li:first-child a').attr('href') || $('.thumbnail').attr('href') || '';
      imagen = imagen.replace(/-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
      imagen = imagen.replace('/image/cache/catalog/', '/image/catalog/');
      const colors = getUniqueColors(name);
      const finalName = appendColorsToName(name, colors);
      const subcategorias = inferSubcategory(finalName, catName);
      if (id && !allProductsMap.has(id)) {
        allProductsMap.set(id, {
          id,
          relacionados: '',
          name: finalName,
          description,
          precio: precioFinal,
          imagen,
          categorias: catName,
          linkPago: url,
          subcategorias,
          oferta,
        });
      }
    } catch (e: any) {
      console.error(`Error al revisar producto id ${url}:`, e.message);
    }
    await delay(300);
  }
  return Array.from(allProductsMap.values());
}

async function scrapKaiDeco(): Promise<Product[]> {
  console.log('Iniciando scraping de Kai Deco...');
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'es-ES,es;q=0.9',
      Referer: 'https://kaideco.uy/',
      'X-Requested-With': 'XMLHttpRequest',
    };
    const { data } = await axios.get(KAI_JSON_URL, { headers });
    const products = data?.products ?? [];
    console.log(`Kai Deco: se encontraron ${products.length} productos.`);
    return products.map((product: any) => {
      const baseName = normalizeText(product.title || '');
      const colorCandidates = [product.title, ...(product.variants?.map((v: any) => v.option1 || v.title || '') ?? [])].join(' ');
      const colors = getUniqueColors(colorCandidates);
      const name = appendColorsToName(baseName, colors);
      const description = cleanDescription(product.body_html || '');
      const primaryVariant = product.variants?.[0] ?? {};
      const precio = parsePrice(primaryVariant.price ?? '');
      const oferta = primaryVariant.compare_at_price ? 'true' : '';
      const imagen = (product.image?.src || product.images?.[0]?.src || '').replace(/\s+/g, '');
      const subcategorias = inferSubcategory(name, 'Hogar');
      return {
        id: `kai-${product.id}`,
        relacionados: '',
        name,
        description,
        precio,
        imagen,
        categorias: 'Hogar',
        linkPago: product.handle ? `https://kaideco.uy/products/${product.handle}` : '',
        subcategorias,
        oferta,
      };
    });
  } catch (err: any) {
    console.error('Error al scrapear Kai Deco:', err.message);
    return [];
  }
}

function getMartinaColors(variation: any): string[] {
  if (!variation) return [];
  if (variation.id === 'color' && Array.isArray(variation.variationValues)) {
    return variation.variationValues.map((item: any) => String(item.description || '')).filter(Boolean);
  }
  if (Array.isArray(variation.variationValues)) {
    return variation.variationValues.flatMap((item: any) => getMartinaColors(item.variation));
  }
  return [];
}

async function scrapMartinaDiTrento(): Promise<Product[]> {
  console.log('Iniciando scraping de Martina di Trento...');
  try {
    const headers = {
      accept: 'application/json, text/plain, */*',
      Referer: 'https://tienda.martinaditrento.com/',
    };
    const { data } = await axios.get(MARTINA_PRODUCT_URL, {
      headers,
      httpsAgent,
      timeout: 30000,
    });
    const products = data?.data ?? [];
    console.log(`Martina di Trento: se encontraron ${products.length} productos.`);
    return products.map((product: any) => {
      const baseName = normalizeText(product.name || '');
      const colorCandidates = [baseName, product.description, product.description2, product.description3].filter(Boolean).join(' ');
      const variationColors = getMartinaColors(product.variation);
      const colors = [...new Set([...getUniqueColors(colorCandidates), ...variationColors])];
      const name = appendColorsToName(baseName, colors);
      const description = cleanDescription([product.description, product.description2, product.description3].filter(Boolean).join(' '));
      const precio = parsePrice(product.price ?? '');
      const oferta = product.price1 && parseFloat(String(product.price1)) > parseFloat(String(product.price ?? 0)) ? 'true' : '';
      const image = product.mainImage ? `${MARTINA_IMAGE_BASE}${product.mainImage}` : '';
      const categoryName = String(product.productLine?.parent?.name || product.productLine?.name || 'Ropa');
      const subcategoria = String(product.productLine?.name || '');
      return {
        id: `mdt-${product.id}`,
        relacionados: '',
        name,
        description,
        precio,
        imagen: image,
        categorias: categoryName,
        linkPago: '',
        subcategorias: subcategoria !== categoryName ? subcategoria : '',
        oferta,
      };
    });
  } catch (err: any) {
    console.error('Error al scrapear Martina di Trento:', err.message);
    return [];
  }
}

async function scrapAllProducts() {
  console.log('=== Iniciando scraping unificado de Nuvex, Kai Deco y Martina di Trento ===');
  const [nuvexProducts, kaiProducts, martinaProducts] = await Promise.all([
    scrapNuvexProducts(),
    scrapKaiDeco(),
    scrapMartinaDiTrento(),
  ]);
  const allProducts = [...nuvexProducts, ...kaiProducts, ...martinaProducts];
  console.log(`Total de productos unificados antes de similitud: ${allProducts.length}`);
  const parsedProducts = searchSimilarity(allProducts);
  console.log(`Scraping finalizado. ${parsedProducts.length} productos generados.`);
  const finalCsv = Papa.unparse(parsedProducts, {
    columns: ['id', 'relacionados', 'name', 'description', 'precio', 'imagen', 'categorias', 'linkPago', 'subcategorias', 'oferta'],
  });
  await fs.writeFile(csvFilePath, finalCsv);
  console.log('¡Todo guardado correctamente en productos.csv!');
}

scrapAllProducts();
