import axios from 'axios';
import * as cheerio from 'cheerio';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import FormData from 'form-data';
import { normalizeText, cleanDescription, getUniqueColors, appendColorsToName, inferSubcategory } from '../utils/text';
import { parsePrice } from '../utils/price';
import { delay } from '../utils/delay';
import { Product } from '../utils/product';

const baseUrl = "https://nuvex.uy/index.php?route=common/home";
const loginUrl = "https://nuvex.uy/index.php?route=account/login";

const jar = new CookieJar();
const client = wrapper(axios.create({ jar } as any));

function resolveNuvexCredentials() {
  const email = process.env.USER_EMAIL || process.env.NUVEX_USER_EMAIL || '';
  const password = process.env.USER_PASS || process.env.NUVEX_USER_PASS || '';
  return { email, password };
}

async function login(): Promise<boolean> {
  const { email, password } = resolveNuvexCredentials();
  if (!email || !password) {
    console.warn('Advertencia: faltan credenciales de Nuvex. Define USER_EMAIL/USER_PASS o NUVEX_USER_EMAIL/NUVEX_USER_PASS. Se omitirá el login de Nuvex.');
    return false;
  }

  console.log('Iniciando sesión en la tienda...');
  const form = new FormData();
  form.append('email', email);
  form.append('password', password);

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

export async function scrapNuvexProducts(): Promise<Product[]> {
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
      await delay(50);
    }
  }
  const uniqueQueue = Array.from(new Map(productQueue.map((item) => [item.url, item])).values());
  console.log(`=== Se recorrerán lentamente ${uniqueQueue.length} páginas de productos individuales de Nuvex ===`);
  const allProductsMap = new Map<string, Product>();
  // Procesar productos en paralelo por lotes de 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < uniqueQueue.length; i += BATCH_SIZE) {
    const batch = uniqueQueue.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async ({ url, catName }, j) => {
      const idx = i + j;
      console.log(`[${idx + 1}/${uniqueQueue.length}] Raspando Nuvex: ${url}`);
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
          precioFinal = parsePrice(rawPrice);
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
    }));
    await delay(80);
  }
  return Array.from(allProductsMap.values());
}
