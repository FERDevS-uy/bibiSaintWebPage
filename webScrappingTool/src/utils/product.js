"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchSimilarity = searchSimilarity;
const string_similarity_js_1 = require("string-similarity-js");
const THRESHOLD = 0.7;
function searchSimilarity(productos) {
    return productos.map((producto) => {
        const relacionados = productos
            .filter((p) => producto.id !== p.id)
            .filter((p) => (0, string_similarity_js_1.stringSimilarity)(producto.name, p.name) > THRESHOLD)
            .map((p) => p.id);
        return Object.assign(Object.assign({}, producto), { relacionados: relacionados.join(' ') });
    });
}
