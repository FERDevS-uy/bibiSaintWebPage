import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type Product from "../types/product";
import { parsePaymentMethodToObject } from "./parsePaymentMethodToObject";

export function cargarProductos(): Product[] {
  const csvPath = path.resolve("src/data/productos.csv");
  const file = fs.readFileSync(csvPath, "utf8");

  const resultado = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
  });

  return (resultado.data as any[]).map((row) => ({
    id: row.id?.trim(),
    name: row.producto?.trim(),
    description: row.description?.trim(),
    price: row.precio?.trim(),
    img:
      row.imagen
        ?.trim()
        .split(" ")
        .map((i: string) => i.trim()) || [],
    categories:
      row.categorias
        ?.trim()
        .split(" ")
        .map((c: string) => c.trim()) || [],
    paymentLink: parsePaymentMethodToObject(
      row.linkPago?.trim(),
      row.producto?.trim()
    ),
  }));
}
