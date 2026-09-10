"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapNuvexProducts = scrapNuvexProducts;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const axios_cookiejar_support_1 = require("axios-cookiejar-support");
const tough_cookie_1 = require("tough-cookie");
const text_1 = require("../utils/text");
const price_1 = require("../utils/price");
const delay_1 = require("../utils/delay");
const baseUrl = "https://nuvex.uy/index.php?route=common/home";
const loginUrl = "https://nuvex.uy/index.php?route=account/login";
const accountUrl = "https://nuvex.uy/index.php?route=account/account";
const jar = new tough_cookie_1.CookieJar();
const client = (0, axios_cookiejar_support_1.wrapper)(axios_1.default.create({ jar }));
const browserHeaders = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};
// NOTA DE SEGURIDAD: no se desactiva la verificación de certificados TLS.
// Ante un certificado inválido, la petición falla de forma cerrada.
function runWithTlsFallback(executor, _contextLabel) {
    return __awaiter(this, void 0, void 0, function* () {
        return executor();
    });
}
function resolveNuvexCredentials() {
    const email = process.env.NUVEX_USER_EMAIL || '';
    const password = process.env.NUVEX_USER_PASS || '';
    return { email, password };
}
function normalizeNuvexImageUrl(url) {
    const clean = String(url || '').trim().replace(/&amp;/g, '&');
    if (!clean)
        return '';
    return clean
        .replace(/-\d+x\d+\.(jpg|jpeg|png|webp|gif)$/i, '.$1')
        .replace('/image/cache/catalog/', '/image/catalog/');
}
// Anti-SSRF: solo permite https://nuvex.uy (y subdominios), sin IPs privadas ni
// puertos no estándar. Todo scraping de Nuvex debe pasar por acá.
const NUVEX_HOST = 'nuvex.uy';
function isValidNuvexUrl(raw) {
    try {
        const u = new URL(String(raw || '').trim());
        if (u.protocol !== 'https:')
            return false;
        const host = u.hostname.toLowerCase();
        if (host !== NUVEX_HOST && !host.endsWith('.' + NUVEX_HOST))
            return false;
        if (u.port && u.port !== '443')
            return false;
        if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host))
            return false;
        return true;
    }
    catch (_a) {
        return false;
    }
}
function nuvexAbsolute(url, base = 'https://' + NUVEX_HOST + '/') {
    if (!url)
        return '';
    try {
        const abs = new URL(String(url).trim(), base).toString();
        return isValidNuvexUrl(abs) ? abs : '';
    }
    catch (_a) {
        return '';
    }
}
const MAX_NUVEX_PRODUCTS = 2000;
function stripAccents(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}
function parseNuvexOptionText(rawText) {
    const text = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!text || text.includes('Selecciona'))
        return null;
    const withCode = text.match(/^(\d{6,})\s+(.+)$/);
    if (withCode) {
        const code = withCode[1].trim();
        const color = withCode[2].trim();
        if (!color)
            return null;
        return { code, color };
    }
    return { code: '', color: text };
}
function toTitleCase(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/\b\p{L}/gu, (c) => c.toUpperCase())
        .trim();
}
function colorHexFromName(name) {
    const lower = stripAccents(String(name || '').toLowerCase());
    if (lower.includes('blanco') || lower.includes('marfil') || lower.includes('crema') || lower.includes('beige'))
        return '#f0ede3';
    if (lower.includes('negro'))
        return '#1a1a1a';
    if (lower.includes('gris') || lower.includes('plata'))
        return '#9e9e9e';
    if (lower.includes('azul') || lower.includes('marino') || lower.includes('celeste'))
        return '#2f6fa3';
    if (lower.includes('rosa') || lower.includes('fucsia'))
        return '#e27ca7';
    if (lower.includes('rojo') || lower.includes('bordo') || lower.includes('vino'))
        return '#b43a3a';
    if (lower.includes('verde') || lower.includes('oliva'))
        return '#4f7b4f';
    if (lower.includes('amarillo') || lower.includes('mostaza') || lower.includes('dorado'))
        return '#c9a227';
    if (lower.includes('marron') || lower.includes('cafe'))
        return '#8a5a3b';
    if (lower.includes('naranja') || lower.includes('terracota'))
        return '#d97745';
    return '#cccccc';
}
const NUVEX_CANONICAL_SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
function normalizeLegacySize(raw) {
    const token = String(raw || '').trim().toUpperCase();
    if (!token)
        return null;
    const map = {
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
function extractNuvexSizeHint(rawColorName) {
    const match = String(rawColorName || '').toUpperCase().match(/\b(XXXL|XXL|XL|XS|GG|XG|G|M|P|S|L)\b/);
    if (!match)
        return null;
    return normalizeLegacySize(match[1]);
}
function cleanNuvexColorName(rawColorName) {
    const cleaned = String(rawColorName || '')
        .replace(/\b(XXXL|XXL|XL|XS|GG|XG|G|M|P|S|L)\b/gi, ' ')
        .replace(/\b\d{6,}\b/g, ' ')
        .replace(/[\s_-]{2,}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return toTitleCase(cleaned);
}
function colorGroupingKey(name) {
    return stripAccents(String(name || '').toLowerCase())
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
function extractNuvexColorsAndImages($) {
    const thumbnailUrls = $('.thumbnails li')
        .map((_, li) => {
        const a = $(li).find('a').first();
        const img = $(li).find('img').first();
        return normalizeNuvexImageUrl(a.attr('href') ||
            a.attr('data-image') ||
            a.attr('data-zoom-image') ||
            img.attr('src') ||
            '');
    })
        .get()
        .filter(Boolean);
    const uniqueThumbs = Array.from(new Set(thumbnailUrls));
    const parseOptionSet = (selector) => selector
        .find('option')
        .map((_, el) => {
        const value = Number($(el).attr('value'));
        const parsed = parseNuvexOptionText($(el).text());
        if (!parsed)
            return null;
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
        .filter(Boolean);
    const preferredSelect = $('#input-option103').first();
    const candidateSelects = preferredSelect.length > 0
        ? [preferredSelect]
        : $('select[id^="input-option"]').toArray().map((el) => $(el));
    let optionValues = [];
    let bestScore = -1;
    for (const selectEl of candidateSelects) {
        const parsedOptions = parseOptionSet(selectEl);
        if (parsedOptions.length < 2)
            continue;
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
    const usedImages = new Set();
    const colorsWithImages = optionValues.map((opt, idx) => {
        var _a;
        let matched = '';
        if (opt.code) {
            matched = uniqueThumbs.find((u) => !usedImages.has(u) && u.includes(opt.code)) || '';
        }
        if (!matched) {
            const normalizedColor = stripAccents(opt.name.toLowerCase());
            matched =
                uniqueThumbs.find((u) => {
                    if (usedImages.has(u))
                        return false;
                    let decoded = '';
                    try {
                        decoded = decodeURIComponent(u);
                    }
                    catch (_a) {
                        decoded = u;
                    }
                    const normalizedUrl = stripAccents(decoded.toLowerCase());
                    return normalizedUrl.includes(normalizedColor);
                }) || '';
        }
        if (matched)
            usedImages.add(matched);
        return {
            id: (_a = opt.id) !== null && _a !== void 0 ? _a : idx + 1,
            hex: colorHexFromName(opt.name),
            name: opt.name,
            images: matched ? [matched] : [],
            sizes: opt.sizeHint ? [opt.sizeHint] : [],
        };
    });
    // Unificar colores repetidos (ej: Terracota P/M/G -> Terracota con varios talles).
    const groupedByColor = new Map();
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
        return Object.assign(Object.assign({}, entry), { sizes: orderedSizes });
    });
    const allImages = Array.from(new Set([
        ...groupedColors.flatMap((c) => c.images),
        ...uniqueThumbs,
    ]));
    return {
        serializedColors: JSON.stringify(groupedColors),
        allImages,
    };
}
function login() {
    return __awaiter(this, void 0, void 0, function* () {
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
            yield runWithTlsFallback(() => client.get(loginUrl, {
                headers: browserHeaders,
                maxRedirects: 5,
            }), 'login preflight');
            yield runWithTlsFallback(() => client.post(loginUrl, form, {
                headers: Object.assign(Object.assign({}, browserHeaders), { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://nuvex.uy', Referer: loginUrl }),
                maxRedirects: 5,
            }), 'login');
            const accountRes = yield runWithTlsFallback(() => client.get(accountUrl, {
                headers: browserHeaders,
                maxRedirects: 5,
            }), 'login verify');
            const accountHtml = String(accountRes.data || '');
            const isAuthenticated = /route=account\/logout|route=account\/edit/i.test(accountHtml) &&
                !/route=account\/login/i.test(accountHtml);
            if (isAuthenticated) {
                console.log('Sesión iniciada con éxito. Los precios ahora son accesibles.');
                return true;
            }
            console.warn('Nuvex respondió al login, pero no dejó sesión activa. Revisa credenciales o cambios en el formulario.');
        }
        catch (err) {
            console.error('Error al iniciar sesión:', err.message);
        }
        return false;
    });
}
function getCategories() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data } = yield runWithTlsFallback(() => client.get(baseUrl, {
                headers: browserHeaders,
            }), 'categorias');
            const $ = cheerio.load(data);
            const categoryUrls = new Set();
            $('a').each((_, el) => {
                let href = $(el).attr('href');
                if (href && href.includes('route=product/category&path=')) {
                    href = href.replace(/&amp;/g, '&');
                    categoryUrls.add(href);
                }
            });
            return Array.from(categoryUrls).map((u) => u.split('&page')[0].split('&limit')[0]);
        }
        catch (err) {
            console.error('Error al obtener categorías:', err);
            return [];
        }
    });
}
function scrapNuvexProducts() {
    return __awaiter(this, void 0, void 0, function* () {
        // Aislamiento de sesión por ejecución: limpia cookies previas para no
        // reutilizar sesiones entre corridas (evita cookies viejas/contaminadas).
        try {
            yield jar.removeAllCookies();
        }
        catch (_a) {
            /* noop */
        }
        const requestTimeoutMs = Math.max(5000, Number.parseInt(String(process.env.NUVEX_REQUEST_TIMEOUT_MS || '15000'), 10) || 15000);
        const batchSize = Math.max(1, Number.parseInt(String(process.env.NUVEX_BATCH_SIZE || '12'), 10) || 12);
        const batchPauseMs = Math.max(0, Number.parseInt(String(process.env.NUVEX_BATCH_PAUSE_MS || '20'), 10) || 20);
        const pagePauseMs = Math.max(0, Number.parseInt(String(process.env.NUVEX_PAGE_PAUSE_MS || '20'), 10) || 20);
        console.log(`[Nuvex] Performance profile: batch=${batchSize}, pause(batch)=${batchPauseMs}ms, pause(page)=${pagePauseMs}ms, timeout=${requestTimeoutMs}ms`);
        const loggedIn = yield login();
        if (!loggedIn) {
            console.warn('No se pudo iniciar sesión en Nuvex. El scraping se intentará, pero algunos datos pueden faltar.');
        }
        console.log('Obteniendo categorías principales de Nuvex...');
        const categories = yield getCategories();
        const uniqueCategories = Array.from(new Set(categories));
        console.log(`Se encontraron ${uniqueCategories.length} categorías en Nuvex.`);
        if (uniqueCategories.length === 0) {
            throw new Error('Nuvex devolvió 0 categorías. Revisa credenciales USER_EMAIL/USER_PASS (o NUVEX_USER_EMAIL/NUVEX_USER_PASS) y conectividad TLS.');
        }
        const productQueue = [];
        for (const catUrl of uniqueCategories) {
            console.log(`Buscando enlaces de productos en: ${catUrl}`);
            let page = 1;
            let hasNextPage = true;
            while (hasNextPage) {
                const pageUrl = `${catUrl}&page=${page}&limit=1000`;
                try {
                    const { data } = yield runWithTlsFallback(() => client.get(pageUrl, {
                        headers: browserHeaders,
                        timeout: requestTimeoutMs,
                    }), `categoria page=${page}`);
                    const $ = cheerio.load(data);
                    const $layouts = $('.product-layout');
                    if ($layouts.length === 0) {
                        hasNextPage = false;
                        break;
                    }
                    const breadcrumbItems = $('.breadcrumb li:not(:first-child) a').map((_, el) => $(el).text().trim()).get();
                    let catName = 'General';
                    if (breadcrumbItems.length > 0)
                        catName = breadcrumbItems[0];
                    else
                        catName = $('#content h2').first().text().trim() || 'General';
                    catName = catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase();
                    $layouts.each((_, el) => {
                        const productHref = $(el).find('.caption h4 a').attr('href');
                        if (productHref) {
                            const abs = nuvexAbsolute(productHref.replace(/&amp;/g, '&'));
                            if (abs)
                                productQueue.push({ url: abs, catName });
                        }
                    });
                }
                catch (err) {
                    console.error(`Error recogiendo enlaces en ${catUrl} página ${page}:`, err.message);
                    break;
                }
                page++;
                if (pagePauseMs > 0)
                    yield (0, delay_1.delay)(pagePauseMs);
            }
        }
        const uniqueQueue = Array.from(new Map(productQueue.map((item) => [item.url, item])).values())
            .filter((item) => isValidNuvexUrl(item.url))
            .slice(0, MAX_NUVEX_PRODUCTS);
        console.log(`=== Se recorrerán ${uniqueQueue.length} páginas de productos individuales de Nuvex ===`);
        const allProductsMap = new Map();
        // Procesar productos en paralelo por lotes configurables
        for (let i = 0; i < uniqueQueue.length; i += batchSize) {
            const batch = uniqueQueue.slice(i, i + batchSize);
            yield Promise.all(batch.map((_a, j_1) => __awaiter(this, [_a, j_1], void 0, function* ({ url, catName }, j) {
                var _b;
                const idx = i + j;
                console.log(`[${idx + 1}/${uniqueQueue.length}] Raspando Nuvex: ${url}`);
                try {
                    const { data } = yield runWithTlsFallback(() => client.get(url, {
                        headers: browserHeaders,
                        timeout: requestTimeoutMs,
                    }), `producto ${url}`);
                    const $ = cheerio.load(data);
                    let id = '';
                    const productMatchId = url.match(/product_id=(\d+)/);
                    if (productMatchId)
                        id = productMatchId[1];
                    if (!id) {
                        const btnTxt = $('#button-cart').attr('onclick') || $('#button-cart').parent().html();
                        const matchBtn = btnTxt === null || btnTxt === void 0 ? void 0 : btnTxt.match(/cart\.add\('(\d+)'/);
                        if (matchBtn)
                            id = matchBtn[1];
                        else
                            id = String(Math.floor(Math.random() * 999999));
                    }
                    const rawName = $('#content h1').text().trim() || '';
                    const name = (0, text_1.normalizeText)(rawName);
                    const htmlDesc = $('#tab-description').html() || '';
                    const description = (0, text_1.cleanDescription)(htmlDesc);
                    let rawPrice = $('.list-unstyled h2').first().text().trim() || $('.price-new').text().trim() || $('#content h2').first().text().trim();
                    let oferta = $('.price-old').length > 0 ? 'true' : '';
                    let precioFinal = '';
                    if (rawPrice) {
                        precioFinal = (0, price_1.parsePrice)(rawPrice, Number((_b = process.env.MARKUP_NUVEX) !== null && _b !== void 0 ? _b : 1.4));
                    }
                    const extractedColors = extractNuvexColorsAndImages($);
                    const fallbackImage = normalizeNuvexImageUrl($('.thumbnails li:first-child a').attr('href') || $('.thumbnail').attr('href') || '');
                    const images = extractedColors.allImages.length > 0
                        ? extractedColors.allImages
                        : (fallbackImage ? [fallbackImage] : []);
                    const finalName = name;
                    const subcategorias = (0, text_1.inferSubcategory)(finalName, catName);
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
                }
                catch (e) {
                    console.error(`Error al revisar producto id ${url}:`, e.message);
                }
            })));
            if (batchPauseMs > 0)
                yield (0, delay_1.delay)(batchPauseMs);
        }
        return Array.from(allProductsMap.values());
    });
}
