import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type Product from "../types/product";

export function cargarProductos(): Product[] {
  const csvPath = path.resolve("src/data/productos.csv");
  const file = fs.readFileSync(csvPath, "utf8");

  const resultado = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
  });

  return (resultado.data as any[]).map((row) => ({
    id: row.id.trim(),
    name: row.producto.trim(),
    price: row.precio.trim(),
    img: row.imagen.trim(),
    categories:
      row.categorias
        ?.trim()
        .split(" ")
        .map((c: string) => c.trim()) || [],
    paymentLink: row.linkPago.trim(),
  }));
}
