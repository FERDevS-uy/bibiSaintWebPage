// scripts/fetch_productos.js
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { parse } from "json2csv";
import { stringSimilarity } from "string-similarity-js";

const BASE_URL =
  "https://api.nuvex.uy/catalog/search/?category=null&ordering=-updated_at&page=";
const OUTPUT_FILE = path.resolve(process.cwd(), "src/data/productos.csv");
const THRESHOLD = 0.7;
const MAX_PAGES = 10; // o lo que desees

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

function inferSubcategory(productName, categoria) {
  const lower = productName.toLowerCase();
  console.log(lower)
  if (categoria === "Infantil") {
    if (lower.includes("botella")) return "Botellas";
    if (lower.includes("vaso")) return "Vasos";
    if (lower.includes("lunchera")) return "Luncheras";
    if (lower.includes("pote")) return "Potes";
    if (lower.includes("paraguas")) return "Paraguas";
    if (lower.includes("cubiertos")) return "Cubiertos";
    if (lower.includes("bata")) return "Batas";
  }
  if (categoria === "Cama") {
    if (lower.includes("sábana")) return "Sábanas";
    if (lower.includes("acolchado")) return "Acolchados";
    if (lower.includes("colcha")) return "Colchas";
    if (lower.includes("frazada")) return "Frazadas";
    if (lower.includes("protector")) return "Protectores";
  }
  if (categoria === "Baño") {
    if (lower.includes("toalla")) return "Toallas";
    if (lower.includes("alfombra")) return "Alfombras";
    if (lower.includes("bata")) return "Batas";
  }
  if (categoria === "Ropa") {
    if (lower.includes("gorro")) return "Gorros";
    if (lower.includes("buzo")) return "Buzos";
    if (lower.includes("playera")) return "Playeras";
    if (lower.includes("media")) return "Medias";
    if (lower.includes("cuello")) return "Cuellos";
  }
  if (categoria === "Hogar") {
    if (lower.includes("mesa")) return "Mesa";
    if (lower.includes("espatula")) return "Utensilios";
  }
  return "";
}

async function guardarComoCSV(productos) {
  // Normaliza los campos para evitar undefined/null y usa los nombres esperados
  const normalizados = searchSimilarity(
    productos.map((p) => ({
      id: p.id ?? "",
      name: p.name.replace(/[\r\n]+/gm, " "),
      description: p.description.replace(/[\r\n]+/gm, " ") ?? "",
      precio: p.price ?? "",
      imagen: p.image_1?.full_size ?? "",
      categorias: Array.isArray(p.category_data)
        ? p.category_data.map((c) => c.name).join(" ")
        : p.category_data?.name ?? "",
      linkPago: "",
      relacionados: [],
      subcategorias: inferSubcategory(
        p.name.replace(/[\r\n]+/gm, " "),
        Array.isArray(p.category_data)
          ? p.category_data.map((c) => c.name).join(" ")
          : p.category_data?.name ?? ""
      ),
    }))
  );

  const fields = [
    "id",
    "relacionados",
    "name",
    "description",
    "precio",
    "imagen",
    "categorias",
    "linkPago",
    "subcategorias"
  ];
  const opts = { fields, defaultValue: "" };

  const csv = parse(normalizados, opts);
  fs.writeFileSync(OUTPUT_FILE, csv);
  console.log(`✅ Guardado ${productos.length} productos en ${OUTPUT_FILE}`);
}

/**
 * Busca productos con un nombre 70% parecido y genera una lista en cada producto con los resultados
 */
function searchSimilarity(productos) {
  return productos.map((producto) => {
    const relacionados = productos
      .filter((p) => producto.id !== p.id)
      .filter((p) => stringSimilarity(producto.name, p.name) > THRESHOLD)
      .map((p) => p.id);

    return {
      ...producto,
      relacionados,
    };
  });
}

(async () => {
  try {
    const productos = await fetchAllProductos();
    guardarComoCSV(productos);
  } catch (err) {
    console.error("❌ Error al obtener productos:", err);
  }
})();
