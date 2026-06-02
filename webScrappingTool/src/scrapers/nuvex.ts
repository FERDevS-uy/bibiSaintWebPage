import axios from 'axios';
import * as cheerio from 'cheerio';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import FormData from 'form-data';
import { normalizeText, cleanDescription, inferSubcategory } from '../utils/text';
import { parsePrice } from '../utils/price';
import { delay } from '../utils/delay';
import { Product } from '../utils/product';

const baseUrl = "https://nuvex.uy/index.php?route=common/home";
const loginUrl = "https://nuvex.uy/index.php?route=account/login";

const jar = new CookieJar();
const client = wrapper(axios.create({ jar } as any));
let tlsRelaxedEnabled = false;

function isTlsCertError(err: any): boolean {
  const code = err?.code || err?.cause?.code;
  return [
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
  ].includes(String(code));
}

async function runWithTlsFallback<T>(
  executor: () => Promise<T>,
  contextLabel: string,
): Promise<T> {
  try {
    return await executor();
  } catch (err: any) {
    if (!isTlsCertError(err)) throw err;

    if (!tlsRelaxedEnabled) {
      console.warn(
        `[Nuvex] Certificado TLS no verificable en ${contextLabel}. Activando modo TLS relajado para esta ejecucion.`,
      );
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      tlsRelaxedEnabled = true;
    }

    return executor();
  }
}

function resolveNuvexCredentials() {
  const email = process.env.USER_EMAIL || process.env.NUVEX_USER_EMAIL || '';
  const password = process.env.USER_PASS || process.env.NUVEX_USER_PASS || '';
  return { email, password };
}

function normalizeNuvexImageUrl(url: string): string {
  const clean = String(url || '').trim().replace(/&amp;/g, '&');
  if (!clean) return '';
  return clean
    .replace(/-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i, '.$1')
    .replace('/image/cache/catalog/', '/image/catalog/');
}

function stripAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseNuvexOptionText(rawText: string): { code: string; color: string } | null {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!text || text.includes('Selecciona')) return null;

  const withCode = text.match(/^(\d{6,})\s+(.+)$/);
  if (withCode) {
    const code = withCode[1].trim();
    const color = withCode[2].trim();
    if (!color) return null;
    return { code, color };
  }

  return { code: '', color: text };
}

function toTitleCase(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    .trim();
}

function colorHexFromName(name: string): string {
  const lower = stripAccents(String(name || '').toLowerCase());
  if (lower.includes('blanco') || lower.includes('marfil') || lower.includes('crema') || lower.includes('beige')) return '#f0ede3';
  if (lower.includes('negro')) return '#1a1a1a';
  if (lower.includes('gris') || lower.includes('plata')) return '#9e9e9e';
  if (lower.includes('azul') || lower.includes('marino') || lower.includes('celeste')) return '#2f6fa3';
  if (lower.includes('rosa') || lower.includes('fucsia')) return '#e27ca7';
  if (lower.includes('rojo') || lower.includes('bordo') || lower.includes('vino')) return '#b43a3a';
  if (lower.includes('verde') || lower.includes('oliva')) return '#4f7b4f';
  if (lower.includes('amarillo') || lower.includes('mostaza') || lower.includes('dorado')) return '#c9a227';
  if (lower.includes('marron') || lower.includes('cafe')) return '#8a5a3b';
  if (lower.includes('naranja') || lower.includes('terracota')) return '#d97745';
  return '#cccccc';
}

function extractNuvexColorsAndImages($: cheerio.CheerioAPI) {
  const thumbnailUrls = $('.thumbnails li')
    .map((_, li) => {
      const a = $(li).find('a').first();
      const img = $(li).find('img').first();
      return normalizeNuvexImageUrl(
        a.attr('href') ||
        a.attr('data-image') ||
        a.attr('data-zoom-image') ||
        img.attr('src') ||
        '',
      );
    })
    .get()
    .filter(Boolean);

  const uniqueThumbs = Array.from(new Set(thumbnailUrls));

  const parseOptionSet = (selector: cheerio.Cheerio<any>) =>
    selector
      .find('option')
      .map((_, el) => {
        const value = Number($(el).attr('value'));
        const parsed = parseNuvexOptionText($(el).text());
        if (!parsed) return null;
        return {
          id: Number.isFinite(value) ? value : null,
          code: parsed.code,
          name: toTitleCase(parsed.color),
        };
      })
      .get()
      .filter(Boolean) as Array<{ id: number | null; code: string; name: string }>;

  const preferredSelect = $('#input-option103').first();
  const candidateSelects = preferredSelect.length > 0
    ? [preferredSelect]
    : $('select[id^="input-option"]').toArray().map((el) => $(el));

  let optionValues: Array<{ id: number | null; code: string; name: string }> = [];
  let bestScore = -1;

  for (const selectEl of candidateSelects) {
    const parsedOptions = parseOptionSet(selectEl);
    if (parsedOptions.length < 2) continue;

    // Priorizar el selector cuyas opciones se pueden asociar a miniaturas por código.
    const matchesByCode = parsedOptions.filter((opt) => opt.code && uniqueThumbs.some((u) => u.includes(opt.code))).length;
    const score = matchesByCode * 10 + parsedOptions.length;

    if (score > bestScore) {
      bestScore = score;
      optionValues = parsedOptions;
    }
  }

  if (optionValues.length === 0) {
    return {
      serializedColors: '',
      allImages: uniqueThumbs,
    };
  }

  const usedImages = new Set<string>();
  const colorsWithImages = optionValues.map((opt, idx) => {
    let matched = '';

    if (opt.code) {
      matched = uniqueThumbs.find((u) => !usedImages.has(u) && u.includes(opt.code)) || '';
    }

    if (!matched) {
      const normalizedColor = stripAccents(opt.name.toLowerCase());
      matched =
        uniqueThumbs.find((u) => {
          if (usedImages.has(u)) return false;
          let decoded = '';
          try {
            decoded = decodeURIComponent(u);
          } catch {
            decoded = u;
          }
          const normalizedUrl = stripAccents(decoded.toLowerCase());
          return normalizedUrl.includes(normalizedColor);
        }) || '';
    }

    if (matched) usedImages.add(matched);

    return {
      id: opt.id ?? idx + 1,
      hex: colorHexFromName(opt.name),
      name: opt.name,
      images: matched ? [matched] : [],
    };
  });

  const allImages = Array.from(
    new Set([
      ...colorsWithImages.flatMap((c) => c.images),
      ...uniqueThumbs,
    ]),
  );

  return {
    serializedColors: JSON.stringify(colorsWithImages),
    allImages,
  };
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
    const res = await runWithTlsFallback(
      () =>
        client.post(loginUrl, form, {
          headers: form.getHeaders(),
          maxRedirects: 5,
        }),
      'login',
    );
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
    const { data } = await runWithTlsFallback(
      () =>
        client.get(baseUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }),
      'categorias',
    );
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
  if (uniqueCategories.length === 0) {
    throw new Error(
      'Nuvex devolvió 0 categorías. Revisa credenciales USER_EMAIL/USER_PASS (o NUVEX_USER_EMAIL/NUVEX_USER_PASS) y conectividad TLS.',
    );
  }
  const productQueue: { url: string; catName: string }[] = [];
  for (const catUrl of uniqueCategories) {
    console.log(`Buscando enlaces de productos en: ${catUrl}`);
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage) {
      const pageUrl = `${catUrl}&page=${page}&limit=1000`;
      try {
        const { data } = await runWithTlsFallback(
          () =>
            client.get(pageUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
            }),
          `categoria page=${page}`,
        );
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
        const { data } = await runWithTlsFallback(
          () =>
            client.get(url, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
            }),
          `producto ${url}`,
        );
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
          precioFinal = parsePrice(rawPrice, 1.4);
        }
        const extractedColors = extractNuvexColorsAndImages($);

        const fallbackImage = normalizeNuvexImageUrl(
          $('.thumbnails li:first-child a').attr('href') || $('.thumbnail').attr('href') || '',
        );
        const images = extractedColors.allImages.length > 0
          ? extractedColors.allImages
          : (fallbackImage ? [fallbackImage] : []);

        const finalName = name;
        const subcategorias = inferSubcategory(finalName, catName);
        if (id && !allProductsMap.has(id)) {
          allProductsMap.set(id, {
            id,
            relacionados: '',
            name: finalName,
            description,
            precio: precioFinal,
            imagen: images.join(' '),
            categorias: catName,
            linkPago: url,
            subcategorias,
            oferta,
            colores: extractedColors.serializedColors,
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
