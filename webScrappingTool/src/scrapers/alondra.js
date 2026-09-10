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
exports.scrapAlondraProducts = scrapAlondraProducts;
exports.alondraApiPrice = alondraApiPrice;
const axios_1 = __importDefault(require("axios"));
const text_1 = require("../utils/text");
const price_1 = require("../utils/price");
const ALONDRA_API_BASE = 'https://alondra-ecommerce-be.sitios.uy/api';
const ALONDRA_CATALOGO_URL = 'https://alondra.com.uy/catalogo';
function extractId(value) {
    if (!value)
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value === 'object') {
        if (typeof value.$oid === 'string')
            return value.$oid;
        if (typeof value.id === 'string')
            return value.id;
    }
    return String(value);
}
function normalizeToken(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}
function findRootCategory(categoryId, categoriesById) {
    const visited = new Set();
    let current = categoriesById.get(categoryId);
    while (current) {
        if (visited.has(current.id))
            break;
        visited.add(current.id);
        if (!current.parentId)
            return { id: current.id, name: current.name };
        current = categoriesById.get(current.parentId);
    }
    return null;
}
function isDecorAllowed(categoryName, productName) {
    const combined = `${categoryName} ${productName}`;
    const normalized = normalizeToken(combined);
    return normalized.includes('cortina') || normalized.includes('alfombra');
}
function mapRootToInternalCategory(rootName) {
    const normalized = normalizeToken(rootName);
    if (normalized.includes('bano'))
        return 'Baño';
    if (normalized.includes('dormitorio'))
        return 'Cama';
    if (normalized.includes('cocina'))
        return 'Hogar';
    return 'Hogar';
}
function pickDescription(customFields) {
    if (!customFields || typeof customFields !== 'object')
        return '';
    const candidates = ['description', 'descripcion', 'detail', 'detalle', 'info'];
    for (const key of candidates) {
        const value = customFields[key];
        if (typeof value === 'string' && value.trim())
            return value;
    }
    return '';
}
/** Alondra's API already returns increased prices; never apply another markup. */
function alondraApiPrice(rawPrice) {
    return (0, price_1.parsePrice)(rawPrice, 1);
}
function scrapAlondraProducts() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Iniciando scraping de Alondra...');
        try {
            const categoriesRaw = yield axios_1.default
                .get(`${ALONDRA_API_BASE}/categories`, { timeout: 20000 })
                .then((res) => res.data);
            const categoriesById = new Map();
            (Array.isArray(categoriesRaw) ? categoriesRaw : []).forEach((category) => {
                const id = extractId(category._id || category.id);
                if (!id)
                    return;
                categoriesById.set(id, {
                    id,
                    name: String(category.name || '').trim(),
                    parentId: extractId(category.parent_id || category.parentId),
                });
            });
            const limit = 100;
            const products = [];
            for (let page = 1; page <= 100; page++) {
                const batch = yield axios_1.default
                    .get(`${ALONDRA_API_BASE}/products`, {
                    params: { limit, page },
                    timeout: 25000,
                })
                    .then((res) => res.data);
                if (!Array.isArray(batch) || batch.length === 0)
                    break;
                products.push(...batch);
                if (batch.length < limit)
                    break;
            }
            console.log(`Alondra: se descargaron ${products.length} productos brutos.`);
            const filteredProducts = products.filter((product) => {
                if (product.listed === false)
                    return false;
                const categoryIds = Array.isArray(product.category_ids)
                    ? product.category_ids.map((id) => extractId(id)).filter(Boolean)
                    : [];
                const productName = String(product.name || '');
                return categoryIds.some((categoryId) => {
                    const category = categoriesById.get(categoryId);
                    if (!category)
                        return false;
                    const root = findRootCategory(category.id, categoriesById);
                    const rootName = normalizeToken((root === null || root === void 0 ? void 0 : root.name) || category.name);
                    if (rootName.includes('bano'))
                        return true;
                    if (rootName.includes('dormitorio'))
                        return true;
                    if (rootName.includes('cocina'))
                        return true;
                    if (rootName.includes('decoracion'))
                        return isDecorAllowed(category.name, productName);
                    return false;
                });
            });
            console.log(`Alondra: ${filteredProducts.length} productos luego del filtro de categorías.`);
            return filteredProducts.map((product) => {
                var _a, _b, _c, _d, _e, _f;
                const id = extractId(product._id || product.id);
                const name = (0, text_1.normalizeText)(String(product.name || '').trim());
                const categoryIds = Array.isArray(product.category_ids)
                    ? product.category_ids.map((value) => extractId(value)).filter(Boolean)
                    : [];
                const matchedCategories = categoryIds
                    .map((categoryId) => categoriesById.get(categoryId))
                    .filter((category) => Boolean(category));
                const root = matchedCategories
                    .map((category) => findRootCategory(category.id, categoriesById))
                    .find(Boolean);
                const categoria = mapRootToInternalCategory((root === null || root === void 0 ? void 0 : root.name) || ((_a = matchedCategories[0]) === null || _a === void 0 ? void 0 : _a.name) || 'Hogar');
                const explicitSubcategory = matchedCategories
                    .map((category) => category.name)
                    .find((categoryName) => !!categoryName && categoryName !== (root === null || root === void 0 ? void 0 : root.name));
                const subcategorias = explicitSubcategory || (0, text_1.inferSubcategory)(name, categoria);
                const rawDescription = pickDescription(product.custom_fields);
                const description = (0, text_1.cleanDescription)(rawDescription);
                const rawBasePrice = (_c = (_b = product.new_price) !== null && _b !== void 0 ? _b : product.price) !== null && _c !== void 0 ? _c : 0;
                const precio = alondraApiPrice(String(rawBasePrice));
                const numericBase = Number((_e = product.price) !== null && _e !== void 0 ? _e : 0);
                const numericNew = Number((_f = product.new_price) !== null && _f !== void 0 ? _f : Number.NaN);
                const oferta = Number.isFinite(numericNew) && Number.isFinite(numericBase) && numericNew < numericBase
                    ? 'true'
                    : '';
                const imagen = Array.isArray(product.pictures)
                    ? product.pictures.filter(Boolean).join(' ')
                    : '';
                return {
                    id: `alo-${id || name.toLowerCase().replace(/\s+/g, '-')}`,
                    relacionados: '',
                    name,
                    description,
                    precio,
                    imagen,
                    categorias: categoria,
                    linkPago: ALONDRA_CATALOGO_URL,
                    subcategorias,
                    oferta,
                };
            });
        }
        catch (error) {
            console.error('Error al scrapear Alondra:', (error === null || error === void 0 ? void 0 : error.message) || error);
            return [];
        }
    });
}
