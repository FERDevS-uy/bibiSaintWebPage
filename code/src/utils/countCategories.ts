import type CategoryList from "../types/categoryList";
import type Product from "../types/product";

export function countCategories(productos: Product[]): CategoryList[] {
  const catCount: Record<string, number> = {};
  productos.forEach((p) => {
    p.categories.forEach((c) => {
      catCount[c] = (catCount[c] || 0) + 1;
    });
  });

  return Object.entries(catCount).map(([name, count]) => ({
    name,
    count,
  }));
}
