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
const form_data_1 = __importDefault(require("form-data"));
const text_1 = require("../utils/text");
const price_1 = require("../utils/price");
const delay_1 = require("../utils/delay");
const baseUrl = "https://nuvex.uy/index.php?route=common/home";
const loginUrl = "https://nuvex.uy/index.php?route=account/login";
const jar = new tough_cookie_1.CookieJar();
const client = (0, axios_cookiejar_support_1.wrapper)(axios_1.default.create({ jar }));
let tlsRelaxedEnabled = false;
function isTlsCertError(err) {
    var _a;
    const code = (err === null || err === void 0 ? void 0 : err.code) || ((_a = err === null || err === void 0 ? void 0 : err.cause) === null || _a === void 0 ? void 0 : _a.code);
    return [
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        'SELF_SIGNED_CERT_IN_CHAIN',
        'DEPTH_ZERO_SELF_SIGNED_CERT',
    ].includes(String(code));
}
function runWithTlsFallback(executor, contextLabel) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield executor();
        }
        catch (err) {
            if (!isTlsCertError(err))
                throw err;
            if (!tlsRelaxedEnabled) {
                console.warn(`[Nuvex] Certificado TLS no verificable en ${contextLabel}. Activando modo TLS relajado para esta ejecucion.`);
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
                tlsRelaxedEnabled = true;
            }
            return executor();
        }
    });
}
function resolveNuvexCredentials() {
    const email = process.env.USER_EMAIL || process.env.NUVEX_USER_EMAIL || '';
    const password = process.env.USER_PASS || process.env.NUVEX_USER_PASS || '';
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
function extractNuvexColorsAndImages($) {
    const optionValues = $('#input-option103 option')
        .map((_, el) => {
        const value = Number($(el).attr('value'));
        const parsed = parseNuvexOptionText($(el).text());
        if (!parsed)
            return null;
        return {
            id: Number.isFinite(value) ? value : null,
            code: parsed.code,
            name: toTitleCase(parsed.color),
        };
    })
        .get()
        .filter(Boolean);
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
    if (optionValues.length === 0) {
        return {
            serializedColors: '',
            allImages: uniqueThumbs,
            colorNamesForTitle: [],
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
        };
    });
    const allImages = Array.from(new Set([
        ...colorsWithImages.flatMap((c) => c.images),
        ...uniqueThumbs,
    ]));
    return {
        serializedColors: JSON.stringify(colorsWithImages),
        allImages,
        colorNamesForTitle: colorsWithImages.map((c) => c.name),
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
        const form = new form_data_1.default();
        form.append('email', email);
        form.append('password', password);
        try {
            const res = yield runWithTlsFallback(() => client.post(loginUrl, form, {
                headers: form.getHeaders(),
                maxRedirects: 5,
            }), 'login');
            if (res.status === 200) {
                console.log('Sesión iniciada con éxito. Los precios ahora son accesibles.');
                return true;
            }
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
                headers: { 'User-Agent': 'Mozilla/5.0' },
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
                        headers: { 'User-Agent': 'Mozilla/5.0' },
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
                        if (productHref)
                            productQueue.push({ url: productHref.replace(/&amp;/g, '&'), catName });
                    });
                }
                catch (err) {
                    console.error(`Error recogiendo enlaces en ${catUrl} página ${page}:`, err.message);
                    break;
                }
                page++;
                yield (0, delay_1.delay)(50);
            }
        }
        const uniqueQueue = Array.from(new Map(productQueue.map((item) => [item.url, item])).values());
        console.log(`=== Se recorrerán lentamente ${uniqueQueue.length} páginas de productos individuales de Nuvex ===`);
        const allProductsMap = new Map();
        // Procesar productos en paralelo por lotes de 10
        const BATCH_SIZE = 10;
        for (let i = 0; i < uniqueQueue.length; i += BATCH_SIZE) {
            const batch = uniqueQueue.slice(i, i + BATCH_SIZE);
            yield Promise.all(batch.map((_a, j_1) => __awaiter(this, [_a, j_1], void 0, function* ({ url, catName }, j) {
                const idx = i + j;
                console.log(`[${idx + 1}/${uniqueQueue.length}] Raspando Nuvex: ${url}`);
                try {
                    const { data } = yield runWithTlsFallback(() => client.get(url, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
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
                        precioFinal = (0, price_1.parsePrice)(rawPrice, 1.4);
                    }
                    const extractedColors = extractNuvexColorsAndImages($);
                    const fallbackImage = normalizeNuvexImageUrl($('.thumbnails li:first-child a').attr('href') || $('.thumbnail').attr('href') || '');
                    const images = extractedColors.allImages.length > 0
                        ? extractedColors.allImages
                        : (fallbackImage ? [fallbackImage] : []);
                    const colors = (0, text_1.getUniqueColors)(`${name} ${extractedColors.colorNamesForTitle.join(' ')}`);
                    const finalName = (0, text_1.appendColorsToName)(name, colors);
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
            yield (0, delay_1.delay)(80);
        }
        return Array.from(allProductsMap.values());
    });
}
