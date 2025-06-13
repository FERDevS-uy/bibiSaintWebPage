// scripts/fetch_productos.js
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { parse } from 'json2csv';
import { mejorarNombreProducto } from './mejorarNombreProducto.js';

const BASE_URL = 'https://pol21.martinaditrento.com/mdt-services/resources/store/product?countryId=598&code=202506&productLineId=3325&category=HOMBRE';
const OUTPUT_FILE = path.resolve(process.cwd(), 'src/data/productos2.csv');

const MAX_PAGES = 1; // o lo que desees

async function fetchAllProductos() {
  let productos = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch("https://pol21.martinaditrento.com/mdt-services/resources/store/product?countryId=598&code=202506&productLineId=3325&category=HOMBRE", {
      "headers": {
        "accept": "application/json, text/plain, */*",
        "accept-language": "es-ar",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Google Chrome\";v=\"137\", \"Chromium\";v=\"137\", \"Not/A)Brand\";v=\"24\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "Referer": "https://tienda.martinaditrento.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      },
      "body": null,
      "method": "GET"
    });
    const json = await res.json();
    const data = json.data;

    if (!data || data.length === 0) break;
    productos = productos.concat(data);
  }

  return productos;
}

function guardarComoCSV(productos) {
  // Normaliza los campos para evitar undefined/null y usa los nombres esperados
  const normalizados = productos.map( p => ({
    id: p.id ?? "",
    producto: p.name,
    description: p.description ?? "",
    precio: p.price ?? "",
    imagen: p.mainImage,
    categorias: Array.isArray(p.productLine)
      ? p.productLine.map(c => c.name).join(" ")
      : (p.productLine?.name ?? ""),
    linkPago: "" // O genera el link si tienes la lógica
  }));

  const fields = [
    'id',
    'producto',
    'description',
    'precio',
    'imagen',
    'categorias',
    'linkPago'
  ];
  const opts = { fields, defaultValue: '' };
  const csv = parse(normalizados, opts);
  fs.writeFileSync(OUTPUT_FILE, csv);
  console.log(`✅ Guardado ${productos.length} productos en ${OUTPUT_FILE}`);
}

(async () => {
  try {
    const productos = await fetchAllProductos();
    guardarComoCSV(productos);
  } catch (err) {
    console.error('❌ Error al obtener productos:', err);
  }
})();
