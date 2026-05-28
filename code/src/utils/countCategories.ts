import type Category from "../types/categoryList";
import type Product from "../types/product";
import {
  getDisplayCategoryName,
  getDisplaySubcategories,
} from "./categoryNormalization";

export function countCategories(productos: Product[]): Category[] {
  if (!productos) return [];

  const categoryMap = new Map<string, Category>();
  productos.forEach(p => {
    const catName = getDisplayCategoryName(p);

    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, {
        name: catName,
        count: 0,
        subcategories: []
      })
    }

    const category = categoryMap.get(catName)
    if (category) category.count++;

    const displaySubcategories = getDisplaySubcategories(p);
    if (displaySubcategories.length > 0) {
      displaySubcategories.forEach((subName) => {
        let sp = category?.subcategories!.find(
          s => s.name === subName
        )

        if (!sp) {
          sp = { name: subName, count: 0 }
          category?.subcategories!.push(sp)
        }

        sp.count++
      })
    }
  })

  return Array.from(categoryMap.values())
}