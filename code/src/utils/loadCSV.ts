import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type Product from "../types/product";

interface csvData {
  id: string;
  name: string;
  description: string;
  precio: string;
  imagen: string;
  categorias: string;
  subcategorias: string
  linkPago: string;
  relacionados: string;
  oferta: string,
}

export function cargarProductos(): Product[] {
  const csvPath = path.resolve("src/data/productos.csv");
  const file = fs.readFileSync(csvPath, "utf8");

  const res = Papa.parse<csvData>(file, {
    header: true,
    skipEmptyLines: true,
  })

  if (res.errors.length > 0) {
    console.error(res.errors);
    throw new Error("Error al parsear CSV")
  }

  const data: Product[] = res.data.map(d => ({
    id: d.id.trim(),
    name: d.name.trim(),
    description: d.description.trim(),
    price: d.precio.trim(),
    img: d.imagen.trim() ? d.imagen.trim().split(/\s+/) : [],
    paymentLink: d.linkPago.trim() ? d.linkPago.trim().split(/\s+/)
      .map((lp, i) => ({ id: `${i}`, url: lp })) : [],
    enOferta: d.oferta.toLowerCase() === "true" ? true : false,
    relacionados: d.relacionados.trim() ? d.relacionados.split(/\s+/) : [],
    categories: {
      name: d.categorias.trim(),
      count: 0,
      subcategories: d.subcategorias.trim() !== ""
        ? d.subcategorias.split(/\|/).map(subC => ({ name: subC.trim(), count: 0 }))
        : []
    }
  }))


  return data;
}
