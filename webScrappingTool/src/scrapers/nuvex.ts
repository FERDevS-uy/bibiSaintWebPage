import axios from 'axios';
import * as cheerio from 'cheerio';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { normalizeText, cleanDescription, inferSubcategory } from '../utils/text';
import { parsePrice } from '../utils/price';
import { delay } from '../utils/delay';
import { Product } from '../utils/product';

const baseUrl = "https://nuvex.uy/index.php?route=common/home";
const loginUrl = "https://nuvex.uy/index.php?route=account/login";
const accountUrl = "https://nuvex.uy/index.php?route=account/account";

const jar = new CookieJar();
const client = wrapper(axios.create({ jar } as any));
let tlsRelaxedEnabled = false;

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

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

const NUVEX_CANONICAL_SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

function normalizeLegacySize(raw: string): string | null {
  const token = String(raw || '').trim().toUpperCase();
  if (!token) return null;
  const map: Record<string, string> = {
    XS: 'XS',
    S: 'S',
    P: 'S',
    M: 'M',
    L: 'L',
    G: 'L',
    XL: 'XL',
    XG: 'XL',
    GG: 'XL',
    XXL: 'XXL',
    XXXL: 'XXXL',
  };
  return map[token] || null;
}

function extractNuvexSizeHint(rawColorName: string): string | null {
  const match = String(rawColorName || '').toUpperCase().match(/\b(XXXL|XXL|XL|XS|GG|XG|G|M|P|S|L)\b/);
  if (!match) return null;
  return normalizeLegacySize(match[1]);
}

function cleanNuvexColorName(rawColorName: string): string {
  const cleaned = String(rawColorName || '')
    .replace(/\b(XXXL|XXL|XL|XS|GG|XG|G|M|P|S|L)\b/gi, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/[\s_-]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return toTitleCase(cleaned);
}

function colorGroupingKey(name: string): string {
  return stripAccents(String(name || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
        const sizeHint = extractNuvexSizeHint(parsed.color);
        const cleanedColor = cleanNuvexColorName(parsed.color);
        const finalColorName = cleanedColor || toTitleCase(parsed.color);
        return {
          id: Number.isFinite(value) ? value : null,
          code: parsed.code,
          name: finalColorName,
          sizeHint,
        };
      })
      .get()
      .filter(Boolean) as Array<{ id: number | null; code: string; name: string; sizeHint: string | null }>;

  const preferredSelect = $('#input-option103').first();
  const candidateSelects = preferredSelect.length > 0
    ? [preferredSelect]
    : $('select[id^="input-option"]').toArray().map((el) => $(el));

  let optionValues: Array<{ id: number | null; code: string; name: string; sizeHint: string | null }> = [];
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
      sizes: opt.sizeHint ? [opt.sizeHint] : [],
    };
  });

  // Unificar colores repetidos (ej: Terracota P/M/G -> Terracota con varios talles).
  const groupedByColor = new Map<
    string,
    { id: number; hex: string; name: string; images: string[]; sizes: string[] }
  >();

  colorsWithImages.forEach((entry, idx) => {
    const key = colorGroupingKey(entry.name) || `color-${idx + 1}`;
    const existing = groupedByColor.get(key);
    if (!existing) {
      groupedByColor.set(key, {
        id: entry.id,
        hex: entry.hex,
        name: entry.name,
        images: [...entry.images],
        sizes: [...entry.sizes],
      });
      return;
    }

    const imageSet = new Set(existing.images);
    entry.images.forEach((imageUrl) => {
      if (!imageSet.has(imageUrl)) {
        existing.images.push(imageUrl);
        imageSet.add(imageUrl);
      }
    });

    const sizeSet = new Set(existing.sizes);
    entry.sizes.forEach((size) => {
      if (!sizeSet.has(size)) {
        existing.sizes.push(size);
        sizeSet.add(size);
      }
    });
  });

  const groupedColors = Array.from(groupedByColor.values()).map((entry) => {
    const orderedSizes = NUVEX_CANONICAL_SIZE_ORDER.filter((size) => entry.sizes.includes(size));
    return {
      ...entry,
      sizes: orderedSizes,
    };
  });

  const allImages = Array.from(
    new Set([
      ...groupedColors.flatMap((c) => c.images),
      ...uniqueThumbs,
    ]),
  );

  return {
    serializedColors: JSON.stringify(groupedColors),
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
  const form = new URLSearchParams();
  form.set('email', email);
  form.set('password', password);

  try {
    await runWithTlsFallback(
      () =>
        client.get(loginUrl, {
          headers: browserHeaders,
          maxRedirects: 5,
        }),
      'login preflight',
    );

    await runWithTlsFallback(
      () =>
        client.post(loginUrl, form, {
          headers: {
            ...browserHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: 'https://nuvex.uy',
            Referer: loginUrl,
          },
          maxRedirects: 5,
        }),
      'login',
    );

    const accountRes = await runWithTlsFallback(
      () =>
        client.get(accountUrl, {
          headers: browserHeaders,
          maxRedirects: 5,
        }),
      'login verify',
    );

    const accountHtml = String(accountRes.data || '');
    const isAuthenticated =
      /route=account\/logout|route=account\/edit/i.test(accountHtml) &&
      !/route=account\/login/i.test(accountHtml);

    if (isAuthenticated) {
      console.log('Sesión iniciada con éxito. Los precios ahora son accesibles.');
      return true;
    }

    console.warn('Nuvex respondió al login, pero no dejó sesión activa. Revisa credenciales o cambios en el formulario.');
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
          headers: browserHeaders,
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
  const requestTimeoutMs = Math.max(
    5000,
    Number.parseInt(String(process.env.NUVEX_REQUEST_TIMEOUT_MS || '15000'), 10) || 15000,
  );
  const batchSize = Math.max(
    1,
    Number.parseInt(String(process.env.NUVEX_BATCH_SIZE || '12'), 10) || 12,
  );
  const batchPauseMs = Math.max(
    0,
    Number.parseInt(String(process.env.NUVEX_BATCH_PAUSE_MS || '20'), 10) || 20,
  );
  const pagePauseMs = Math.max(
    0,
    Number.parseInt(String(process.env.NUVEX_PAGE_PAUSE_MS || '20'), 10) || 20,
  );

  console.log(
    `[Nuvex] Performance profile: batch=${batchSize}, pause(batch)=${batchPauseMs}ms, pause(page)=${pagePauseMs}ms, timeout=${requestTimeoutMs}ms`,
  );

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
              headers: browserHeaders,
              timeout: requestTimeoutMs,
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
      if (pagePauseMs > 0) await delay(pagePauseMs);
    }
  }
  const uniqueQueue = Array.from(new Map(productQueue.map((item) => [item.url, item])).values());
  console.log(`=== Se recorrerán ${uniqueQueue.length} páginas de productos individuales de Nuvex ===`);
  const allProductsMap = new Map<string, Product>();
  // Procesar productos en paralelo por lotes configurables
  for (let i = 0; i < uniqueQueue.length; i += batchSize) {
    const batch = uniqueQueue.slice(i, i + batchSize);
    await Promise.all(batch.map(async ({ url, catName }, j) => {
      const idx = i + j;
      console.log(`[${idx + 1}/${uniqueQueue.length}] Raspando Nuvex: ${url}`);
      try {
        const { data } = await runWithTlsFallback(
          () =>
            client.get(url, {
              headers: browserHeaders,
              timeout: requestTimeoutMs,
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
    if (batchPauseMs > 0) await delay(batchPauseMs);
  }
  return Array.from(allProductsMap.values());
}
