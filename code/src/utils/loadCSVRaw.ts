import type Product from "../types/product";
import { parseCsvContent } from "./loadCSV";

import baseCsv from "../data/productos.csv?raw";
import catalogoCsv from "../data/productos_catalogo.csv?raw";

let cached: Product[] | null = null;

export function cargarProductosDesdeRaw(): Product[] {
  if (cached) return cached;

  const productosBase = parseCsvContent(baseCsv);
  const productosCatalogo = parseCsvContent(catalogoCsv);

  cached = [...productosBase, ...productosCatalogo];
  return cached;
}
