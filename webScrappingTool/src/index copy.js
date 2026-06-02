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
const promises_1 = __importDefault(require("fs/promises"));
const papaparse_1 = __importDefault(require("papaparse"));
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const string_similarity_js_1 = require("string-similarity-js");
const axios_cookiejar_support_1 = require("axios-cookiejar-support");
const tough_cookie_1 = require("tough-cookie");
const form_data_1 = __importDefault(require("form-data"));
const dotenv_1 = __importDefault(require("dotenv"));
const csvFilePath = path_1.default.resolve(__dirname, '../../code/src/data/productos.csv');
const baseUrl = "https://nuvex.uy/index.php?route=common/home";
const loginUrl = "https://nuvex.uy/index.php?route=account/login";
const THRESHOLD = 0.7;
dotenv_1.default.config();
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function normalizeText(text) {
    if (!text)
        return "";
    return text.replace(/\*/g, ' x ').replace(/\s+/g, ' ').trim();
}
function cleanDescription(html) {
    if (!html)
        return "";
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
function getUniqueColors(text) {
    if (!text)
        return [];
    const lower = text.toLowerCase();
    const dictionary = {
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
    const matched = [];
    Object.entries(dictionary).forEach(([baseColor, variations]) => {
        const found = variations.some((v) => new RegExp(`\\b${v}\\b`, 'i').test(lower));
        if (found)
            matched.push(baseColor);
    });
    return [...new Set(matched)];
}
function appendColorsToName(name, colors) {
    const uniqueColors = [...new Set(colors.map((c) => c.trim()).filter(Boolean))];
    if (uniqueColors.length === 0)
        return name;
    const suffix = uniqueColors.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' ');
    if (name.toLowerCase().includes(suffix.toLowerCase()))
        return name;
    return `${name} ${suffix}`.trim();
}
function inferSubcategory(productName, categoria) {
    const lower = (productName || '').toLowerCase();
    // Infantil
    if (categoria === 'Infantil') {
        if (/\b(botella|biberon|mamadera)\b/.test(lower))
            return 'Botellas';
        if (/\b(vaso|taza)\b/.test(lower))
            return 'Vasos';
        if (/\b(lunchera|lonchera)\b/.test(lower))
            return 'Luncheras';
        if (/\b(pote|recipiente)\b/.test(lower))
            return 'Potes';
        if (/\b(paraguas|sombrilla)\b/.test(lower))
            return 'Paraguas';
        if (/\b(cubiertos|cuchar|tenedor|cuchillo)\b/.test(lower))
            return 'Cubiertos';
        if (/\b(bata|batita)\b/.test(lower))
            return 'Batas';
    }
    // Cama
    if (categoria === 'Cama') {
        if (/\b(sábana|sabana|sabanas|sábana)\b/.test(lower))
            return 'Sábanas';
        if (/\b(acolchad|acolchado|n[oó]rdico|acolchad[oa]s)\b/.test(lower))
            return 'Acolchados';
        if (/\b(colcha|colchas)\b/.test(lower))
            return 'Colchas';
        if (/\b(frazada|fraza|franela)\b/.test(lower))
            return 'Frazadas';
        if (/\b(protector|protectores|funda|almohad)\b/.test(lower))
            return 'Protectores';
    }
    // Baño
    if (categoria === 'Baño' || categoria === 'BAÑO') {
        if (/\b(toalla|toall[oó]n)\b/.test(lower))
            return 'Toallas';
        if (/\b(alfombra|tapete)\b/.test(lower))
            return 'Alfombras';
        if (/\b(bata|bata de ba[oó]o)\b/.test(lower))
            return 'Batas';
    }
    // Ropa
    if (categoria === 'Ropa') {
        if (/\b(gorro|gorros)\b/.test(lower))
            return 'Gorros';
        if (/\b(buzo|buzos|sweater|sudadera|cardigan|chaqueta|campera)\b/.test(lower))
            return 'Buzos';
        if (/\b(playera|remera|camiseta|t[- ]?shirt|polo)\b/.test(lower))
            return 'Playeras';
        if (/\b(media|medias|calcetin|calcetines)\b/.test(lower))
            return 'Medias';
        if (/\b(cuello|bufanda|pañuelo)\b/.test(lower))
            return 'Cuellos';
        if (/\b(pantalon|pants|jean|jeans|pantalones)\b/.test(lower))
            return 'Pantalones';
        if (/\b(camisa|camisas|blusa)\b/.test(lower))
            return 'Camisas';
        if (/\b(vestido|vestidos)\b/.test(lower))
            return 'Vestidos';
        if (/\b(falda|faldas)\b/.test(lower))
            return 'Faldas';
    }
    // Hogar
    if (categoria === 'Hogar') {
        if (/\b(mesa|mesita|mesas)\b/.test(lower))
            return 'Mesa';
        if (/\b(almohad|almohada|almohadas)\b/.test(lower))
            return 'Almohadas';
        if (/\b(coj[ií]n|cojin|cojines)\b/.test(lower))
            return 'Cojines';
        if (/\b(cama|somier|colch[oó]n)\b/.test(lower))
            return 'Cama';
        if (/\b(utensili|espatula|cuchar|cuchara|tenedor|vajilla|vajill?a)\b/.test(lower))
            return 'Utensilios';
        if (/\b(l[áa]mpara|lampara|luz)\b/.test(lower))
            return 'Lámparas';
        if (/\b(silla|sillas|taburete)\b/.test(lower))
            return 'Sillas';
        if (/\b(estanter|estante|biblioteca)\b/.test(lower))
            return 'Estantes';
    }
    return '';
}
function formatPriceNumber(n) {
    if (!isFinite(n))
        return '';
    const integerPart = Math.trunc(n);
    return integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function parsePrice(value) {
    if (value === null || value === undefined)
        return '';
    const raw = String(value).trim();
    if (!raw)
        return '';
    let normalized = raw.replace(/\s+/g, '');
    normalized = normalized.replace(/[^0-9,.-]/g, '');
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');
    if (hasComma && hasDot) {
        const lastComma = normalized.lastIndexOf(',');
        const lastDot = normalized.lastIndexOf('.');
        if (lastDot > lastComma) {
            // Ejemplo: 3,399.00 -> coma miles, punto decimal
            normalized = normalized.replace(/,/g, '');
            if (normalized.endsWith('.00'))
                normalized = normalized.slice(0, -3);
        }
        else {
            // Ejemplo: 3.399,00 -> punto miles, coma decimal
            normalized = normalized.replace(/\./g, '');
            normalized = normalized.replace(/,/g, '.');
            if (normalized.endsWith('.00'))
                normalized = normalized.slice(0, -3);
        }
    }
    else if (hasComma) {
        const commaIndex = normalized.lastIndexOf(',');
        const decimals = normalized.length - commaIndex - 1;
        if (decimals === 3) {
            // 2,699 -> separador de miles
            return normalized.replace(/,/g, '.');
        }
        normalized = normalized.replace(/,/g, '.');
        if (normalized.endsWith('.00'))
            normalized = normalized.slice(0, -3);
    }
    else if (hasDot) {
        const dotIndex = normalized.lastIndexOf('.');
        const decimals = normalized.length - dotIndex - 1;
        if (decimals === 3) {
            // 2.699 -> separador de miles
            return normalized;
        }
        if (normalized.endsWith('.00'))
            normalized = normalized.slice(0, -3);
    }
    const valueNumber = parseFloat(normalized);
    if (Number.isNaN(valueNumber))
        return '';
    return formatPriceNumber(valueNumber);
}
function searchSimilarity(productos) {
    return productos.map((producto) => {
        const relacionados = productos
            .filter((p) => producto.id !== p.id)
            .filter((p) => (0, string_similarity_js_1.stringSimilarity)(producto.name, p.name) > THRESHOLD)
            .map((p) => p.id);
        return Object.assign(Object.assign({}, producto), { relacionados: relacionados.join(' ') });
    });
}
const jar = new tough_cookie_1.CookieJar();
const client = (0, axios_cookiejar_support_1.wrapper)(axios_1.default.create({ jar }));
const httpsAgent = new https_1.default.Agent({ rejectUnauthorized: false });
const KAI_JSON_URL = 'https://kaideco.uy/products.json?limit=250';
const MARTINA_PRODUCT_URL = 'https://pol21.martinaditrento.com/mdt-services/resources/store/product?countryId=598&code=202506';
const MARTINA_IMAGE_BASE = 'https://pol21.martinaditrento.com/images/products/md/';
function resolveNuvexCredentials() {
    const email = process.env.USER_EMAIL || process.env.NUVEX_USER_EMAIL || '';
    const password = process.env.USER_PASS || process.env.NUVEX_USER_PASS || '';
    return { email, password };
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
            const res = yield client.post(loginUrl, form, {
                headers: form.getHeaders(),
                maxRedirects: 5,
            });
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
            const { data } = yield client.get(baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
        const productQueue = [];
        for (const catUrl of uniqueCategories) {
            console.log(`Buscando enlaces de productos en: ${catUrl}`);
            let page = 1;
            let hasNextPage = true;
            while (hasNextPage) {
                const pageUrl = `${catUrl}&page=${page}&limit=1000`;
                try {
                    const { data } = yield client.get(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
                yield delay(50);
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
                    const { data } = yield client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
                }
                catch (e) {
                    console.error(`Error al revisar producto id ${url}:`, e.message);
                }
            })));
            // Delay pequeño entre lotes para evitar bloqueo
            yield delay(80);
        }
        return Array.from(allProductsMap.values());
    });
}
function scrapKaiDeco() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('Iniciando scraping de Kai Deco...');
        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                Accept: 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'es-ES,es;q=0.9',
                Referer: 'https://kaideco.uy/',
                'X-Requested-With': 'XMLHttpRequest',
            };
            const { data } = yield axios_1.default.get(KAI_JSON_URL, { headers });
            const products = (_a = data === null || data === void 0 ? void 0 : data.products) !== null && _a !== void 0 ? _a : [];
            console.log(`Kai Deco: se encontraron ${products.length} productos.`);
            return products.map((product) => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                const baseName = normalizeText(product.title || '');
                const colorCandidates = [product.title, ...((_b = (_a = product.variants) === null || _a === void 0 ? void 0 : _a.map((v) => v.option1 || v.title || '')) !== null && _b !== void 0 ? _b : [])].join(' ');
                const colors = getUniqueColors(colorCandidates);
                const name = appendColorsToName(baseName, colors);
                const description = cleanDescription(product.body_html || '');
                const primaryVariant = (_d = (_c = product.variants) === null || _c === void 0 ? void 0 : _c[0]) !== null && _d !== void 0 ? _d : {};
                const precio = parsePrice((_e = primaryVariant.price) !== null && _e !== void 0 ? _e : '');
                const oferta = primaryVariant.compare_at_price ? 'true' : '';
                const imagen = (((_f = product.image) === null || _f === void 0 ? void 0 : _f.src) || ((_h = (_g = product.images) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.src) || '').replace(/\s+/g, '');
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
        }
        catch (err) {
            console.error('Error al scrapear Kai Deco:', err.message);
            return [];
        }
    });
}
function getMartinaColors(variation) {
    if (!variation)
        return [];
    if (variation.id === 'color' && Array.isArray(variation.variationValues)) {
        return variation.variationValues.map((item) => String(item.description || '')).filter(Boolean);
    }
    if (Array.isArray(variation.variationValues)) {
        return variation.variationValues.flatMap((item) => getMartinaColors(item.variation));
    }
    return [];
}
/**
 * Recorre el árbol de variation del API de Martina y extrae los nodos de tipo "color".
 * Retorna [{id, hex, name, sizes: []}] por cada color encontrado.
 */
function extractMartinaColorNodes(variation) {
    if (!variation)
        return [];
    if (variation.id === 'color' && Array.isArray(variation.variationValues)) {
        return variation.variationValues.map((c) => {
            var _a, _b, _c;
            const sizes = Array.isArray((_a = c === null || c === void 0 ? void 0 : c.variation) === null || _a === void 0 ? void 0 : _a.variationValues)
                ? c.variation.variationValues
                    .map((sz) => { var _a; return String((_a = sz === null || sz === void 0 ? void 0 : sz.description) !== null && _a !== void 0 ? _a : '').trim(); })
                    .filter(Boolean)
                : [];
            return {
                id: Number(c === null || c === void 0 ? void 0 : c.id),
                hex: String((_b = c === null || c === void 0 ? void 0 : c.colorHex) !== null && _b !== void 0 ? _b : '').trim() || '#cccccc',
                name: String((_c = c === null || c === void 0 ? void 0 : c.description) !== null && _c !== void 0 ? _c : '').trim(),
                sizes,
            };
        });
    }
    if (Array.isArray(variation.variationValues)) {
        return variation.variationValues.flatMap((item) => extractMartinaColorNodes(item.variation));
    }
    return [];
}
/**
 * Agrupa filenames de images por colorId según el patrón "{code}_{colorId}_*".
 */
function groupMartinaImagesByColor(images, code) {
    const grouped = {};
    images.forEach((filename) => {
        const m = filename.match(new RegExp(`^${code}_(\\d+)_`));
        if (!m)
            return;
        const colorId = m[1];
        if (!grouped[colorId])
            grouped[colorId] = [];
        grouped[colorId].push(`${MARTINA_IMAGE_BASE}${filename}`);
    });
    return grouped;
}
function scrapMartinaDiTrento() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('Iniciando scraping de Martina di Trento...');
        try {
            const headers = {
                accept: 'application/json, text/plain, */*',
                Referer: 'https://tienda.martinaditrento.com/',
            };
            const { data } = yield axios_1.default.get(MARTINA_PRODUCT_URL, {
                headers,
                httpsAgent,
                timeout: 30000,
            });
            const products = (_a = data === null || data === void 0 ? void 0 : data.data) !== null && _a !== void 0 ? _a : [];
            console.log(`Martina di Trento: se encontraron ${products.length} items (cada color cuenta separado).`);
            // Agrupar por code (un mismo "Adriano Boxer" trae N items, uno por color)
            const byCode = new Map();
            products.forEach((p) => {
                var _a, _b;
                const code = String((_b = (_a = p === null || p === void 0 ? void 0 : p.code) !== null && _a !== void 0 ? _a : p === null || p === void 0 ? void 0 : p.id) !== null && _b !== void 0 ? _b : '').trim();
                if (!code)
                    return;
                if (!byCode.has(code))
                    byCode.set(code, []);
                byCode.get(code).push(p);
            });
            console.log(`Martina di Trento: ${byCode.size} productos únicos (agrupados por code).`);
            const result = [];
            byCode.forEach((entries, code) => {
                var _a, _b, _c, _d, _e, _f, _g;
                const first = entries[0];
                const name = normalizeText((first === null || first === void 0 ? void 0 : first.name) || '');
                const description = cleanDescription([first === null || first === void 0 ? void 0 : first.description, first === null || first === void 0 ? void 0 : first.description2, first === null || first === void 0 ? void 0 : first.description3]
                    .filter(Boolean)
                    .join(' '));
                const precio = parsePrice((_a = first === null || first === void 0 ? void 0 : first.price) !== null && _a !== void 0 ? _a : '');
                const oferta = (first === null || first === void 0 ? void 0 : first.price1) && parseFloat(String(first.price1)) > parseFloat(String((_b = first.price) !== null && _b !== void 0 ? _b : 0))
                    ? 'true'
                    : '';
                const categoryName = String(((_d = (_c = first === null || first === void 0 ? void 0 : first.productLine) === null || _c === void 0 ? void 0 : _c.parent) === null || _d === void 0 ? void 0 : _d.name) || ((_e = first === null || first === void 0 ? void 0 : first.productLine) === null || _e === void 0 ? void 0 : _e.name) || 'Ropa');
                const subcategoria = String(((_f = first === null || first === void 0 ? void 0 : first.productLine) === null || _f === void 0 ? void 0 : _f.name) || '');
                // Unión de colores extraídos del árbol de variaciones de todos los items
                const colorById = new Map();
                entries.forEach((entry) => {
                    const colorNodes = extractMartinaColorNodes(entry === null || entry === void 0 ? void 0 : entry.variation);
                    const imagesByColor = groupMartinaImagesByColor(Array.isArray(entry === null || entry === void 0 ? void 0 : entry.images) ? entry.images : [], code);
                    colorNodes.forEach((c) => {
                        if (!Number.isFinite(c.id))
                            return;
                        if (!colorById.has(c.id)) {
                            colorById.set(c.id, Object.assign(Object.assign({}, c), { images: imagesByColor[String(c.id)] || [] }));
                        }
                        else {
                            const existing = colorById.get(c.id);
                            // mergear sizes
                            const merged = new Set([...existing.sizes, ...c.sizes]);
                            existing.sizes = Array.from(merged);
                            // mergear images
                            const extra = imagesByColor[String(c.id)] || [];
                            const seen = new Set(existing.images);
                            extra.forEach((img) => {
                                if (!seen.has(img)) {
                                    existing.images.push(img);
                                    seen.add(img);
                                }
                            });
                        }
                    });
                });
                const colors = Array.from(colorById.values());
                // Lista plana de TODAS las imágenes (ordenadas: por color, en el orden del color array)
                const allImages = [];
                const seenImg = new Set();
                colors.forEach((c) => {
                    c.images.forEach((img) => {
                        if (!seenImg.has(img)) {
                            allImages.push(img);
                            seenImg.add(img);
                        }
                    });
                });
                // Si no encontramos imágenes por color (fallback), usar mainImage del primero
                if (allImages.length === 0 && (first === null || first === void 0 ? void 0 : first.mainImage)) {
                    allImages.push(`${MARTINA_IMAGE_BASE}${first.mainImage}`);
                }
                // Colores con datos mínimos para el CSV (omito sizes/images pesados si quieres,
                // pero el usuario pidió tener colores con sus fotos => incluimos todo).
                const coloresSerialized = JSON.stringify(colors.map((c) => ({
                    id: c.id,
                    hex: c.hex,
                    name: c.name,
                    images: c.images,
                })));
                const subcategorias = subcategoria && subcategoria !== categoryName ? subcategoria : '';
                const providerId = String((_g = first === null || first === void 0 ? void 0 : first.id) !== null && _g !== void 0 ? _g : code).trim();
                result.push({
                    id: `mdt-${providerId}`,
                    relacionados: '',
                    name, // limpio, sin sufijo de color
                    description,
                    precio,
                    imagen: allImages.join(' '), // separado por espacio igual que el resto
                    categorias: categoryName,
                    linkPago: '',
                    subcategorias,
                    oferta,
                    colores: coloresSerialized,
                });
            });
            return result;
        }
        catch (err) {
            console.error('Error al scrapear Martina di Trento:', err.message);
            return [];
        }
    });
}
function scrapAllProducts() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('=== Iniciando scraping unificado de Nuvex, Kai Deco y Martina di Trento ===');
        const [nuvexProducts, kaiProducts, martinaProducts] = yield Promise.all([
            scrapNuvexProducts(),
            scrapKaiDeco(),
            scrapMartinaDiTrento(),
        ]);
        const allProducts = [...nuvexProducts, ...kaiProducts, ...martinaProducts];
        console.log(`Total de productos unificados antes de similitud: ${allProducts.length}`);
        const parsedProducts = searchSimilarity(allProducts);
        console.log(`Scraping finalizado. ${parsedProducts.length} productos generados.`);
        const finalCsv = papaparse_1.default.unparse(parsedProducts, {
            columns: ['id', 'relacionados', 'name', 'description', 'precio', 'imagen', 'categorias', 'linkPago', 'subcategorias', 'oferta', 'colores'],
        });
        yield promises_1.default.writeFile(csvFilePath, finalCsv);
        console.log('¡Todo guardado correctamente en productos.csv!');
    });
}
scrapAllProducts();
