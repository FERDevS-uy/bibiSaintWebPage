import { useEffect, useState } from "react";
import { productCache, type ProductCacheEntry } from "./product-store";
import { supabase } from "../lib/supabaseClient";

export function useProduct(id: string) {
  const [product, setProduct] = useState<ProductCacheEntry | null | "loading">("loading");

  useEffect(() => {
    const cached = productCache.get()[id];
    if (cached) {
      setProduct(cached);
      return;
    }

    supabase
      .from("products")
      .select("name, price, img, en_oferta")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) {
          const entry: ProductCacheEntry = {
            name: data.name,
            price: String(data.price ?? ""),
            img: Array.isArray(data.img) ? data.img[0] : String(data.img ?? ""),
            enOferta: Boolean(data.en_oferta),
          };
          productCache.setKey(id, entry);
          setProduct(entry);
        } else {
          setProduct(null);
        }
      });
  }, [id]);

  return product;
}
