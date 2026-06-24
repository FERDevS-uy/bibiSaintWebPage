import { useEffect } from "react";
import { productCache, type ProductCacheEntry } from "./product-store";

interface ProductData {
  id: string;
  name: string;
  price: string;
  img: string;
  enOferta: boolean;
}

interface Props {
  products: ProductData[];
}

export function ProductListHydrator({ products }: Props) {
  useEffect(() => {
    const seen = new Set<string>();
    products.forEach((p) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      const entry: ProductCacheEntry = {
        name: p.name,
        price: p.price,
        img: p.img,
        enOferta: p.enOferta,
      };
      const existing = productCache.get()[p.id];
      if (!existing || existing.price !== p.price) {
        productCache.setKey(p.id, entry);
      }
    });
  }, [products]);

  return null;
}
