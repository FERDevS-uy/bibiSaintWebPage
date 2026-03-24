import type Category from "../types/categoryList";
import type Product from "../types/product";

export function countCategories(productos: Product[]): Category[] {
  if (!productos) return [];

  const categoryMap = new Map<string, Category>();
  productos.forEach(p => {
    const catName = p.categories.name;

    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, {
        name: catName,
        count: 0,
        subcategories: []
      })
    }

    const category = categoryMap.get(catName)
    if (category) category.count++;

    if (p.categories.subcategories.length > 0) {
      p.categories.subcategories.forEach(subP => {
        let sp = category?.subcategories!.find(
          s => s.name === subP.name
        )

        if (!sp) {
          sp = { name: subP.name, count: 0 }
          category?.subcategories!.push(sp)
        }

        sp.count++
      })
    }
  })

  return Array.from(categoryMap.values())
}