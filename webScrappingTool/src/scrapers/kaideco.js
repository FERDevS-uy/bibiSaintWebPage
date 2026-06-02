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
exports.scrapKaiDeco = scrapKaiDeco;
const axios_1 = __importDefault(require("axios"));
const text_1 = require("../utils/text");
const price_1 = require("../utils/price");
const KAI_JSON_URL = 'https://kaideco.uy/products.json?limit=250';
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
                const baseName = (0, text_1.normalizeText)(product.title || '');
                const colorCandidates = [product.title, ...((_b = (_a = product.variants) === null || _a === void 0 ? void 0 : _a.map((v) => v.option1 || v.title || '')) !== null && _b !== void 0 ? _b : [])].join(' ');
                const colors = (0, text_1.getUniqueColors)(colorCandidates);
                const name = (0, text_1.appendColorsToName)(baseName, colors);
                const description = (0, text_1.cleanDescription)(product.body_html || '');
                const primaryVariant = (_d = (_c = product.variants) === null || _c === void 0 ? void 0 : _c[0]) !== null && _d !== void 0 ? _d : {};
                const precio = (0, price_1.parsePrice)((_e = primaryVariant.price) !== null && _e !== void 0 ? _e : '', 1.2);
                const oferta = primaryVariant.compare_at_price ? 'true' : '';
                const imagen = (((_f = product.image) === null || _f === void 0 ? void 0 : _f.src) || ((_h = (_g = product.images) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.src) || '').replace(/\s+/g, '');
                const subcategorias = (0, text_1.inferSubcategory)(name, 'Hogar');
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
