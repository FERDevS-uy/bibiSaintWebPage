import { useEffect } from "react";
import { productCache, type ProductCacheEntry } from "./product-store";
import { hasVerifiedPrice } from "../client/martinaVerification";

interface Props {
  id: string;
  name: string;
  price: string;
  img: string;
  enOferta: boolean;
}

export function ProductHydrator({ id, name, price, img, enOferta }: Props) {
  useEffect(() => {
    // Si ya existe un precio verificado en sesión (producto Martina),
    // no sobrescribir la caché con el precio sincronizado tras la hidratación.
    if (hasVerifiedPrice(id)) return;

    const entry: ProductCacheEntry = { name, price, img, enOferta };
    const existing = productCache.get()[id];
    if (!existing || existing.price !== price) {
      productCache.setKey(id, entry);
    }
  }, [id, name, price, img, enOferta]);

  return null;
}
