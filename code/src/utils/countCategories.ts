import type CategoryList from "../types/categoryList";
import type Product from "../types/product";

export function countCategories(productos: Product[]): CategoryList[] {
  const catCount: Record<string, { count: number; subcategories: Record<string, number> }> = {};
  if (!productos) return [];
  productos.forEach((p) => {
    p.categories.forEach((c, idx) => {
      if (!catCount[c]) catCount[c] = { count: 0, subcategories: {} };
      catCount[c].count += 1;

      // Si el producto tiene subcategorías, agrégalas
      if (p.subcategories && p.subcategories.length > 0) {
        p.subcategories.forEach((sub) => {
          catCount[c].subcategories[sub] = (catCount[c].subcategories[sub] || 0) + 1;
        });
      }
    });
  });

  return Object.entries(catCount).map(([name, data]) => ({
    name,
    count: data.count,
    subcategories: Object.entries(data.subcategories).map(([subName, count]) => ({
      name: subName,
      count,
    })),
  }));
}