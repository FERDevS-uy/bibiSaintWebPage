import fs from 'fs/promises';
import Papa from 'papaparse';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
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


function inferSubcategory(productName: string, categoria: string): string {
  const lower = productName.toLowerCase();
  if (categoria === "Infantil") {
    if (lower.includes("botella")) return "Botellas";
    if (lower.includes("vaso")) return "Vasos";
    if (lower.includes("lunchera")) return "Luncheras";
    if (lower.includes("pote")) return "Potes";
    if (lower.includes("paraguas")) return "Paraguas";
    if (lower.includes("cubiertos")) return "Cubiertos";
    if (lower.includes("bata")) return "Batas";
  }
  if (categoria === "Cama") {
    if (lower.includes("sábana") || lower.includes("sabana")) return "Sábanas";
    if (lower.includes("acolchado")) return "Acolchados";
    if (lower.includes("colcha")) return "Colchas";
    if (lower.includes("frazada")) return "Frazadas";
    if (lower.includes("protector")) return "Protectores";
  }
  if (categoria === "Baño" || categoria === "BAÑO" || categoria === "Baño") {
    if (lower.includes("toalla")) return "Toallas";
    if (lower.includes("alfombra")) return "Alfombras";
    if (lower.includes("bata")) return "Batas";
  }
  if (categoria === "Ropa") {
    if (lower.includes("gorro")) return "Gorros";
    if (lower.includes("buzo")) return "Buzos";
    if (lower.includes("playera")) return "Playeras";
    if (lower.includes("media")) return "Medias";
    if (lower.includes("cuello")) return "Cuellos";
  }
  if (categoria === "Hogar") {
    if (lower.includes("mesa")) return "Mesa";
    if (lower.includes("espatula")) return "Utensilios";
  }
  return "";
}

function searchSimilarity(productos: Product[]) {
  return productos.map((producto) => {
    const relacionados = productos
      .filter((p) => producto.id !== p.id)
      .filter((p) => stringSimilarity(producto.name, p.name) > THRESHOLD)
      .map((p) => p.id);

    return {
      ...producto,
      relacionados: relacionados.join(" "),
    };
  });
}

const jar = new CookieJar();
const client = wrapper(axios.create({ jar } as any));

async function login(): Promise<boolean> {
  console.log("Iniciando sesión en la tienda...");
  const form = new FormData();
  form.append('email', process.env.USER_EMAIL);
  form.append('password', process.env.USER_PASS);

  try {
    const res = await client.post(loginUrl, form, {
      headers: form.getHeaders(),
      maxRedirects: 5
    });

    if (res.status === 200) {
      console.log("Sesión iniciada con éxito. Los precios ahora son accesibles.");
      return true;
    }
  } catch (err: any) {
    console.error("Error al iniciar sesión:", err.message);
  }
  return false;
}

async function getCategories(): Promise<string[]> {
  try {
    const { data } = await client.get(baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const categoryUrls = new Set<string>();

    $('a').each((i, el) => {
      let href = $(el).attr('href');
      if (href && href.includes('route=product/category&path=')) {
        href = href.replace(/&amp;/g, '&');
        categoryUrls.add(href);
      }
    });

    return Array.from(categoryUrls).map(u => u.split('&page')[0].split('&limit')[0]);
  } catch (err) {
    console.error("Error al obtener categorías:", err);
    return [];
  }
}

async function scrapAllProducts() {
  await login();

  console.log("Obteniendo categorías principales...");
  const categories = await getCategories();
  const uniqueCategories = Array.from(new Set(categories));
  console.log(`Se encontraron ${uniqueCategories.length} categorías.`);

  const productQueue: { url: string; catName: string }[] = [];

  for (let i = 0; i < uniqueCategories.length; i++) {
    const catUrl = uniqueCategories[i];
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
        let catName = "General";

        if (breadcrumbItems.length > 0) {
          catName = breadcrumbItems[0];
        } else {
          catName = $('#content h2').first().text().trim() || 'General';
        }

        catName = catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase();

        $layouts.each((idx, el) => {
          const productHref = $(el).find('.caption h4 a').attr('href');
          if (productHref) {
            productQueue.push({ url: productHref.replace(/&amp;/g, '&'), catName });
          }
        });

      } catch (err: any) {
        console.error(`Error recogiendo enlaces en ${pageUrl}:`, err.message);
        hasNextPage = false;
      }
      page++;
      await delay(200);
    }
  }

  const uniqueQueue = Array.from(new Map(productQueue.map(item => [item.url, item])).values());
  console.log(`=== Se recorrerán lentamente ${uniqueQueue.length} páginas de productos individuales ===`);

  const allProductsMap = new Map<string, Product>();

  for (let i = 0; i < uniqueQueue.length; i++) {
    const { url, catName } = uniqueQueue[i];
    console.log(`[${i + 1}/${uniqueQueue.length}] Raspando: ${url}`);

    try {
      const { data } = await client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(data);

      let id = "";
      const productMatchId = url.match(/product_id=(\d+)/);
      if (productMatchId) id = productMatchId[1];

      if (!id) {
        const btnTxt = $('#button-cart').attr('onclick') || $('#button-cart').parent().html();
        const matchBtn = btnTxt?.match(/cart\.add\('(\d+)'/);
        if (matchBtn) id = matchBtn[1];
        else id = String(Math.floor(Math.random() * 999999));
      }

      const rawName = $('#content h1').text().trim() || "";
      const name = normalizeText(rawName);

      const htmlDesc = $('#tab-description').html() || "";
      const description = cleanDescription(htmlDesc);

      let rawPrice = $('.list-unstyled h2').first().text().trim() || $('.price-new').text().trim() || $('#content h2').first().text().trim();
      console.log(rawPrice);
      let oferta = $('.price-old').length > 0 ? "true" : "";

      let precioFinal = "";
      if (rawPrice) {
        // Extraer precio solucionando el punto de miles (ej: 3.858,50 o 3.858)
        let numStr = rawPrice.replace(/,/g, '');  // Reemplazar coma por punto decimal
        numStr = numStr.replace(/[^0-9.]/g, '');  // Dejar sólo números y punto
        const value = parseFloat(numStr);
        console.log(value);

        if (!isNaN(value)) {
          precioFinal = Math.round(value * 1.4).toString();
          console.log(precioFinal);
        }
      }

      let imagen = $('.thumbnails li:first-child a').attr('href') || $('.thumbnail').attr('href') || "";
      imagen = imagen.replace(/-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
      imagen = imagen.replace('/image/cache/catalog/', '/image/catalog/');

      const subcategorias = inferSubcategory(name, catName);

      if (id && !allProductsMap.has(id)) {
        allProductsMap.set(id, {
          id,
          relacionados: "",
          name,
          description,
          precio: precioFinal,
          imagen,
          categorias: catName,
          linkPago: "",
          subcategorias,
          oferta
        });
      }
    } catch (e: any) {
      console.error(`Error al revisar producto id ${url}:`, e.message);
    }
    await delay(300);
  }

  const resultProducts = Array.from(allProductsMap.values());

  console.log("Calculando similitud entre productos (relacionados)...");
  const parsedProducts = searchSimilarity(resultProducts);

  console.log(`Scraping finalizado. ${parsedProducts.length} productos generados.`);

  const finalCsv = Papa.unparse(parsedProducts, {
    columns: ["id", "relacionados", "name", "description", "precio", "imagen", "categorias", "linkPago", "subcategorias", "oferta"]
  });

  await fs.writeFile(csvFilePath, finalCsv);
  console.log("¡Todo guardado correctamente en productos.csv!");
}

scrapAllProducts();
