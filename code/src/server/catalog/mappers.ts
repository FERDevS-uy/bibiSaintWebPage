// src/server/catalog/mappers.ts
// Mapper único de proyección de catálogo → tarjeta de producto legacy.
// Fase 4 — scalable-catalog-read-pipeline.
//
// Reemplaza las 8 copias de `toCardProduct` que vivían en las páginas SSR.
// El shape de salida es el `Product` legacy que consumen ListarProductos /
// ItemProductoBox / ProductCarousel: price como string, img como array,
// categories con count 0 y subcategories vacías (la tarjeta no los usa).

import type Product from "../../types/product";
import type { CatalogCardProjection } from "./contracts.ts";

/**
 * Convierte una proyección del catálogo (read model o legacy normalizada)
 * a la tarjeta de producto legacy. Tipado estricto: sin `any`.
 */
export function toCardProduct(p: CatalogCardProjection): Product {
  return {
    id: p.id,
    name: p.name,
    description: "",
    price: String(p.price),
    img: [p.imageUrl],
    categories: {
      name: p.category,
      count: 0,
      subcategories: p.subcategory
        ? p.subcategory.split("|").map((name) => ({ name, count: 0 }))
        : [],
    },
    paymentLink: [],
    relacionados: [],
    enOferta: p.enOferta ?? false,
    originalPrice: p.originalPrice == null ? null : String(p.originalPrice),
  };
}
