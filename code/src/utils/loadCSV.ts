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
    id: row.id,
    producto: row.producto,
    precio: row.precio,
    imagen: row.imagen,
    categorias: row.categorias?.split(" ").map((c: string) => c.trim()) || [],
  }));
}
