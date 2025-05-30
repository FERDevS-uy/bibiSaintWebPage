import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type Producto from "../types/producto";

export function cargarProductos(): Producto[] {
  const csvPath = path.resolve("src/data/productos.csv");
  const file = fs.readFileSync(csvPath, "utf8");

  const resultado = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
  });

  return (resultado.data as any[]).map((row) => ({
    id: row.id.trim(),
    producto: row.producto.trim(),
    precio: row.precio.trim(),
    imagen: row.imagen.trim(),
    categorias:
      row.categorias
        ?.trim()
        .split(" ")
        .map((c: string) => c.trim()) || [],
    linkPago: row.linkPago.trim(),
  }));
}
