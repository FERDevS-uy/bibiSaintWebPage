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
    img: d.imagen.split(/\s+/),
    paymentLink: d.linkPago.split(/\s+/)
      .map((lp, i) => ({ id: `${i}`, url: lp })),
    enOferta: d.oferta.toLowerCase() === "true" ? true : false,
    relacionados: d.relacionados.split(/\s+/),
    categories: {
      name: d.categorias,
      count: 0,
      subcategories: d.subcategorias.trim() != ""
        ? d.subcategorias.split(/\s+/)
          .map(subC => ({ name: subC, count: 0 }))
        : []
    }
  }))


  return data;
}
