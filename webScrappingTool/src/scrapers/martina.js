"use strict";
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
exports.scrapMartinaDiTrento = scrapMartinaDiTrento;
const axios_1 = __importDefault(require("axios"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const text_1 = require("../utils/text");
const price_1 = require("../utils/price");
const delay_1 = require("../utils/delay");
const MARTINA_STORE_PRODUCT_BASE = 'https://pol21.martinaditrento.com/mdt-services/resources/store/product';
const MARTINA_CONFIG_URL = 'https://pol21.martinaditrento.com/mdt-services/resources/ecommerce/config';
const MARTINA_IMAGE_BASE = 'https://pol21.martinaditrento.com/images/products/md/';
const httpsAgent = new https_1.default.Agent({ rejectUnauthorized: false });
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
        var _a, _b;
        console.log('Iniciando scraping de Martina di Trento...');
        try {
            const headers = { accept: 'application/json, text/plain, */*', Referer: 'https://tienda.martinaditrento.com/' };
            const countryId = '598';
            // intentar descubrir códigos de campaña desde el endpoint de config
            function fetchMartinaConfig(country) {
                return __awaiter(this, void 0, void 0, function* () {
                    try {
                        const { data } = yield axios_1.default.get(`${MARTINA_CONFIG_URL}?countryId=${country}`, {
                            headers,
                            httpsAgent,
                            timeout: 20000,
                        });
                        const payload = data && data.data ? data.data : data || {};
                        // heurística: buscar arreglos con objetos que tengan la propiedad "code"
                        const found = new Set();
                        const walk = (obj) => {
                            if (!obj || typeof obj !== 'object')
                                return;
                            if (Array.isArray(obj)) {
                                // si es un array de objetos con 'code'
                                const sample = obj.find((it) => it && (it.code || it.codigo || (it === null || it === void 0 ? void 0 : it.id)));
                                if (sample && (sample.code || sample.codigo)) {
                                    obj.forEach((it) => {
                                        const c = it.code || it.codigo || (it.id && String(it.id));
                                        if (c)
                                            found.add(String(c));
                                    });
                                    return;
                                }
                                for (const item of obj)
                                    walk(item);
                                return;
                            }
                            for (const k of Object.keys(obj)) {
                                const val = obj[k];
                                if (k.toLowerCase().includes('campaign') && Array.isArray(val)) {
                                    val.forEach((it) => {
                                        const c = it.code || it.codigo || (it.id && String(it.id));
                                        if (c)
                                            found.add(String(c));
                                    });
                                }
                                walk(val);
                            }
                        };
                        walk(payload);
                        return Array.from(found);
                    }
                    catch (e) {
                        console.warn('No se pudo obtener config de Martina:', e.message || e);
                        return [];
                    }
                });
            }
            function fetchStoreProductForCode(country, code) {
                return __awaiter(this, void 0, void 0, function* () {
                    const url = `${MARTINA_STORE_PRODUCT_BASE}?countryId=${country}&code=${encodeURIComponent(code)}`;
                    console.log(url);
                    try {
                        const { data } = yield axios_1.default.get(url, { headers, httpsAgent, timeout: 30000 });
                        // intentar varios lugares comunes del payload
                        if (!data)
                            return [];
                        if (Array.isArray(data))
                            return data;
                        if (Array.isArray(data.data))
                            return data.data;
                        if (Array.isArray(data.products))
                            return data.products;
                        if (Array.isArray(data.result))
                            return data.result;
                        // si viene dentro de un objeto profundo, buscar el primer array de objetos
                        const walkFindArray = (o) => {
                            if (!o || typeof o !== 'object')
                                return null;
                            if (Array.isArray(o) && o.length > 0 && typeof o[0] === 'object')
                                return o;
                            for (const k of Object.keys(o)) {
                                const res = walkFindArray(o[k]);
                                if (res)
                                    return res;
                            }
                            return null;
                        };
                        const fallback = walkFindArray(data);
                        return fallback || [];
                    }
                    catch (e) {
                        console.warn(`Error consultando store/product code=${code}:`, e.message || e);
                        return [];
                    }
                });
            }
            // Consulta el endpoint de store/product usando productLineId + category (catálogo por línea)
            function fetchStoreProductByProductLine(country, code, productLineId, category) {
                return __awaiter(this, void 0, void 0, function* () {
                    const url = `${MARTINA_STORE_PRODUCT_BASE}?countryId=${country}&code=${encodeURIComponent(String(code))}&productLineId=${encodeURIComponent(String(productLineId))}&category=${encodeURIComponent(String(category || ''))}`;
                    try {
                        const { data } = yield axios_1.default.get(url, { headers, httpsAgent, timeout: 30000 });
                        if (!data)
                            return [];
                        if (Array.isArray(data))
                            return data;
                        if (Array.isArray(data.data))
                            return data.data;
                        if (Array.isArray(data.products))
                            return data.products;
                        if (Array.isArray(data.result))
                            return data.result;
                        const walkFindArray = (o) => {
                            if (!o || typeof o !== 'object')
                                return null;
                            if (Array.isArray(o) && o.length > 0 && typeof o[0] === 'object')
                                return o;
                            for (const k of Object.keys(o)) {
                                const res = walkFindArray(o[k]);
                                if (res)
                                    return res;
                            }
                            return null;
                        };
                        const fallback = walkFindArray(data);
                        return fallback || [];
                    }
                    catch (e) {
                        console.warn(`Error consultando store/product by productLine=${productLineId} category=${category}:`, e.message || e);
                        return [];
                    }
                });
            }
            // concurrency y whitelist
            const country = countryId;
            let codes = [];
            try {
                codes = yield fetchMartinaConfig(country);
            }
            catch (e) {
                codes = [];
            }
            // permitir lista blanca por env (coma-separada)
            const whitelistRaw = process.env.MARTINA_CODE_WHITELIST || '';
            const whitelist = whitelistRaw.split(',').map((s) => s.trim()).filter(Boolean);
            if (whitelist.length > 0) {
                codes = codes.filter((c) => whitelist.includes(c));
            }
            const allFetchedItems = [];
            // helper: intentar extraer código real desde filenames de imagen
            const detectCodeFromEntry = (entry) => {
                if (!entry || typeof entry !== 'object')
                    return null;
                if (entry.code)
                    return String(entry.code);
                if (entry.codigo)
                    return String(entry.codigo);
                if (entry.productCode)
                    return String(entry.productCode);
                if (Array.isArray(entry.images)) {
                    for (const im of entry.images) {
                        const fname = String(im || '');
                        const m = fname.match(/^(\d+)_/);
                        if (m)
                            return m[1];
                        const m2 = fname.match(/(?:\/)?(\d+)_\d+_\d+/);
                        if (m2)
                            return m2[1];
                    }
                }
                return null;
            };
            if (codes.length > 0) {
                console.log(`Martina: se detectaron ${codes.length} codes para country=${country}: ${codes.join(', ')}`);
                const concurrency = Math.max(1, parseInt(String(process.env.MARTINA_CONCURRENCY || '3'), 10));
                const batches = [];
                for (let i = 0; i < codes.length; i += concurrency)
                    batches.push(codes.slice(i, i + concurrency));
                for (const batch of batches) {
                    const results = yield Promise.all(batch.map((code) => fetchStoreProductForCode(country, code)));
                    results.forEach((arr, idx) => {
                        if (!Array.isArray(arr))
                            return;
                        // anotar code en cada item para referencia
                        const code = batch[idx];
                        arr.forEach((it) => {
                            if (it && typeof it === 'object')
                                it.code = it.code || code;
                            allFetchedItems.push(it);
                        });
                    });
                    // pequeña pausa entre batches
                    yield (0, delay_1.delay)(150 + Math.floor(Math.random() * 200));
                }
            }
            else {
                // Fallback robusto: usar los endpoints de catálogo por productLine (HOMBRE/MUJER)
                const codeToUse = process.env.PUBLIC_MARTINA_CODE || '202605';
                const productLineEnv = process.env.MARTINA_PRODUCT_LINE_LIST || '';
                let productLines = [];
                if (productLineEnv) {
                    // formato esperado: '3325:HOMBRE,3324:MUJER'
                    productLines = productLineEnv.split(',').map((pair) => {
                        const [pl, cat] = pair.split(':').map((s) => s.trim());
                        return { productLineId: pl || '', category: cat || '' };
                    }).filter((p) => p.productLineId);
                }
                if (productLines.length === 0) {
                    productLines = [
                        { productLineId: '3325', category: 'HOMBRE' },
                        { productLineId: '3324', category: 'MUJER' },
                    ];
                }
                console.log(`Martina: no se detectaron codes, consultando catálogos por productLine usando code=${codeToUse}`);
                const concurrencyPL = Math.max(1, parseInt(String(process.env.MARTINA_CONCURRENCY || '3'), 10));
                // iterar productLines (normalmente 2) y recolectar resultados
                for (const pl of productLines) {
                    try {
                        const arr = yield fetchStoreProductByProductLine(country, codeToUse, pl.productLineId, pl.category);
                        if (!Array.isArray(arr))
                            continue;
                        arr.forEach((it) => {
                            if (it && typeof it === 'object') {
                                const detected = detectCodeFromEntry(it);
                                if (!it.code && detected)
                                    it.code = detected;
                                it.code = it.code || codeToUse;
                                it.productLineId = pl.productLineId;
                                allFetchedItems.push(it);
                            }
                        });
                    }
                    catch (err) {
                        console.warn('Error consultando productLine', pl, err && err.message ? err.message : err);
                    }
                    yield (0, delay_1.delay)(150 + Math.floor(Math.random() * 200));
                }
            }
            console.log(`Martina di Trento: se recuperaron ${allFetchedItems.length} items desde los endpoints.`);
            // Agrupar por code (un mismo "Adriano Boxer" trae N items, uno por color)
            const byCode = new Map();
            allFetchedItems.forEach((p) => {
                var _a, _b;
                const code = String((_b = (_a = p === null || p === void 0 ? void 0 : p.code) !== null && _a !== void 0 ? _a : p === null || p === void 0 ? void 0 : p.id) !== null && _b !== void 0 ? _b : '').trim();
                if (!code)
                    return;
                if (!byCode.has(code))
                    byCode.set(code, []);
                byCode.get(code).push(p);
            });
            console.log(`Martina di Trento: ${byCode.size} productos únicos (agrupados por code).`);
            // Guardar respuestas crudas por code para inspección
            const rawDir = path_1.default.resolve(__dirname, '../../data/martina_raw');
            try {
                yield promises_1.default.mkdir(rawDir, { recursive: true });
                yield promises_1.default.writeFile(path_1.default.resolve(rawDir, 'allFetchedItems.json'), JSON.stringify(allFetchedItems, null, 2));
                for (const [c, arr] of byCode.entries()) {
                    try {
                        yield promises_1.default.writeFile(path_1.default.resolve(rawDir, `${c}.json`), JSON.stringify(arr, null, 2));
                    }
                    catch (err) {
                        console.warn(`No se pudo guardar raw ${c}:`, err.message || err);
                    }
                }
                // generar mapping productId -> code/productLineId para uso en runtime
                try {
                    const productMap = {};
                    // Mapear TODOS los providerIds disponibles por cada code (no solo el primero)
                    for (const [c, arr] of byCode.entries()) {
                        for (const entry of arr) {
                            // intentar obtener id del proveedor desde distintas propiedades
                            const candidateId = (entry && ((_b = (_a = entry.id) !== null && _a !== void 0 ? _a : entry.productId) !== null && _b !== void 0 ? _b : (entry.product && entry.product.id))) || '';
                            const providerId = String(candidateId || c).trim();
                            if (!providerId)
                                continue;
                            if (!productMap[providerId])
                                productMap[providerId] = { code: c };
                            else
                                productMap[providerId].code = productMap[providerId].code || c;
                            if (entry === null || entry === void 0 ? void 0 : entry.productLineId)
                                productMap[providerId].productLineId = String(entry.productLineId);
                            else if ((entry === null || entry === void 0 ? void 0 : entry.productLine) && typeof entry.productLine === 'object' && entry.productLine.id)
                                productMap[providerId].productLineId = String(entry.productLine.id);
                        }
                    }
                    // NOTA: No mergeamos archivos raw de runs anteriores porque introduce
                    //       productIds de campañas viejas/descontinuadas que ya no tienen stock.
                    yield promises_1.default.writeFile(path_1.default.resolve(rawDir, 'map.json'), JSON.stringify(productMap, null, 2));
                }
                catch (err) {
                    console.warn('No se pudo guardar map.json:', err.message || err);
                }
            }
            catch (err) {
                console.warn('No se pudo crear directorio raw:', err.message || err);
            }
            const result = [];
            byCode.forEach((entries, code) => {
                var _a, _b, _c, _d, _e, _f, _g;
                const first = entries[0];
                const name = (0, text_1.normalizeText)((first === null || first === void 0 ? void 0 : first.name) || '');
                const description = (0, text_1.cleanDescription)([first === null || first === void 0 ? void 0 : first.description, first === null || first === void 0 ? void 0 : first.description2, first === null || first === void 0 ? void 0 : first.description3]
                    .filter(Boolean)
                    .join(' '));
                const precio = (0, price_1.parsePrice)((_a = first === null || first === void 0 ? void 0 : first.price) !== null && _a !== void 0 ? _a : '', 1);
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
                // Filtro anti-descontinuados: si no hay ningún color con variación registrada,
                // el producto viene de una campaña vieja sin stock activo → omitir.
                if (colors.length === 0) {
                    console.log(`Martina: omitiendo producto sin colores activos (posible descontinuado): code=${code}, id=${first === null || first === void 0 ? void 0 : first.id}`);
                    return;
                }
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
                // Colores con datos mínimos para el CSV
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
