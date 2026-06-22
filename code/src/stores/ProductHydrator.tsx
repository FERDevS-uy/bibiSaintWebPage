import { useEffect } from "react";
import { productCache, type ProductCacheEntry } from "./product-store";

interface Props {
  id: string;
  name: string;
  price: string;
  img: string;
  enOferta: boolean;
}

export function ProductHydrator({ id, name, price, img, enOferta }: Props) {
  useEffect(() => {
    const entry: ProductCacheEntry = { name, price, img, enOferta };
    const existing = productCache.get()[id];
    if (!existing || existing.price !== price) {
      productCache.setKey(id, entry);
    }
  }, [id, name, price, img, enOferta]);

  return null;
}
