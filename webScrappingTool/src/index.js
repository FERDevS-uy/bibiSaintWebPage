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
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const papaparse_1 = __importDefault(require("papaparse"));
const dotenv_1 = __importDefault(require("dotenv"));
const nuvex_1 = require("./scrapers/nuvex");
const kaideco_1 = require("./scrapers/kaideco");
const martina_1 = require("./scrapers/martina");
const product_1 = require("./utils/product");
const string_similarity_js_1 = require("string-similarity-js");
dotenv_1.default.config();
const csvFilePath = path_1.default.resolve(__dirname, '../../code/src/data/productos.csv');
function compareWithCopy(newProducts) {
    return __awaiter(this, void 0, void 0, function* () {
        const copyCsvPath = path_1.default.resolve(__dirname, '../../code/src/data/productos copy.csv');
        try {
            const content = yield promises_1.default.readFile(copyCsvPath, 'utf-8');
            const parsed = papaparse_1.default.parse(content, { header: true, skipEmptyLines: true });
            const copyArr = Array.isArray(parsed.data) ? parsed.data : [];
            if (copyArr.length === 0) {
                console.warn('CSV de copia vacío o no encontrado en:', copyCsvPath);
                return;
            }
            const threshold = 0.85;
            const matchedNew = [];
            const unmatchedNew = [];
            const copyMatchedFlags = new Array(copyArr.length).fill(false);
            for (const p of newProducts) {
                let bestScore = 0;
                let bestIdx = -1;
                for (let i = 0; i < copyArr.length; i++) {
                    const cpName = String(copyArr[i].name || copyArr[i]['name'] || '');
                    const s = (0, string_similarity_js_1.stringSimilarity)(p.name, cpName);
                    if (s > bestScore) {
                        bestScore = s;
                        bestIdx = i;
                    }
                }
                if (bestScore >= threshold && bestIdx !== -1) {
                    matchedNew.push({ newId: p.id, copyIndex: bestIdx, score: bestScore });
                    copyMatchedFlags[bestIdx] = true;
                }
                else {
                    unmatchedNew.push(p);
                }
            }
            const missingInNew = copyArr.filter((_cp, idx) => !copyMatchedFlags[idx]);
            const report = {
                totalNew: newProducts.length,
                totalCopy: copyArr.length,
                matched: matchedNew.length,
                unmatchedNew: unmatchedNew.length,
                missingInNew: missingInNew.length,
                unmatchedSample: unmatchedNew.slice(0, 30).map((p) => ({ id: p.id, name: p.name })),
                missingSample: missingInNew.slice(0, 30).map((cp) => ({ id: cp.id, name: cp.name || cp['name'] })),
            };
            const rawDir = path_1.default.resolve(__dirname, '../../data/martina_raw');
            try {
                yield promises_1.default.mkdir(rawDir, { recursive: true });
                yield promises_1.default.writeFile(path_1.default.resolve(rawDir, 'compare_report.json'), JSON.stringify(report, null, 2));
                console.log('Comparación completa:', `matched ${report.matched}, unmatched new ${report.unmatchedNew}, missing in new ${report.missingInNew}. Report guardado en ${path_1.default.resolve(rawDir, 'compare_report.json')}`);
            }
            catch (err) {
                console.warn('No se pudo guardar informe de comparación:', err.message || err);
            }
        }
        catch (err) {
            console.warn('No se pudo leer o parsear CSV copia:', err.message || err);
        }
    });
}
function scrapAllProducts() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('=== Iniciando scraping unificado de Nuvex, Kai Deco y Martina di Trento ===');
        const [nuvexProducts, kaiProducts, martinaProducts] = yield Promise.all([
            (0, nuvex_1.scrapNuvexProducts)(),
            (0, kaideco_1.scrapKaiDeco)(),
            (0, martina_1.scrapMartinaDiTrento)(),
        ]);
        const allProducts = [...nuvexProducts, ...kaiProducts, ...martinaProducts];
        console.log(`Total de productos unificados antes de similitud: ${allProducts.length}`);
        const parsedProducts = (0, product_1.searchSimilarity)(allProducts);
        console.log(`Scraping finalizado. ${parsedProducts.length} productos generados.`);
        const finalCsv = papaparse_1.default.unparse(parsedProducts, {
            columns: ['id', 'relacionados', 'name', 'description', 'precio', 'imagen', 'categorias', 'linkPago', 'subcategorias', 'oferta', 'colores'],
        });
        yield promises_1.default.writeFile(csvFilePath, finalCsv);
        console.log('¡Todo guardado correctamente en productos.csv!');
        try {
            yield compareWithCopy(parsedProducts);
        }
        catch (e) {
            console.warn('Error durante comparación con CSV copia:', e.message || e);
        }
    });
}
// Permitir ejecutar solo Martina para pruebas rápidas con `ONLY_MARTINA=1`
if (process.env.ONLY_MARTINA === '1' || process.env.ONLY_MARTINA === 'true') {
    (() => __awaiter(void 0, void 0, void 0, function* () {
        console.log('=== Ejecutando SOLO Martina di Trento ===');
        const martinaProducts = yield (0, martina_1.scrapMartinaDiTrento)();
        const parsedProducts = (0, product_1.searchSimilarity)(martinaProducts);
        console.log(`Martina-only: ${parsedProducts.length} productos generados.`);
        const finalCsv = papaparse_1.default.unparse(parsedProducts, {
            columns: ['id', 'relacionados', 'name', 'description', 'precio', 'imagen', 'categorias', 'linkPago', 'subcategorias', 'oferta', 'colores'],
        });
        try {
            yield promises_1.default.writeFile(csvFilePath, finalCsv);
            console.log('Martina-only CSV guardado en', csvFilePath);
        }
        catch (e) {
            console.warn('No se pudo guardar CSV Martina-only:', e.message || e);
        }
        try {
            yield compareWithCopy(parsedProducts);
        }
        catch (e) {
            console.warn('Error durante compareWithCopy:', e.message || e);
        }
    }))();
}
else {
    scrapAllProducts();
}
