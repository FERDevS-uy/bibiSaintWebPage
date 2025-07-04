// scripts/fetch_productos.js
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { parse } from 'json2csv';
import { mejorarNombreProducto } from './mejorarNombreProducto.js';

const BASE_URL = 'https://api.nuvex.uy/catalog/search/?category=null&ordering=-updated_at&page=';
const OUTPUT_FILE = path.resolve(process.cwd(), 'src/data/productos.csv');

const MAX_PAGES = 2; // o lo que desees

async function fetchAllProductos() {
  let productos = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${BASE_URL}${page}&s=`);
    const json = await res.json();
    const data = json.data;

    if (!data || data.length === 0) break;
    productos = productos.concat(data);
  }

  return productos;
}

function guardarComoCSV(productos) {
  // Normaliza los campos para evitar undefined/null y usa los nombres esperados
  const normalizados = productos.map(async p => ({
    id: p.id ?? "",
    producto: await mejorarNombreProducto(p.name),
    description: p.description ?? "",
    precio: p.price ?? "",
    imagen: p.image_1?.full_size ?? "",
    categorias: Array.isArray(p.category_data)
      ? p.category_data.map(c => c.name).join(" ")
      : (p.category_data?.name ?? ""),
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
