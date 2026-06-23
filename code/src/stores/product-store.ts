import { persistentMap } from "@nanostores/persistent";

export interface ProductCacheEntry {
  name: string;
  price: string;
  img: string;
  enOferta: boolean;
}

export const productCache = persistentMap<ProductCacheEntry>("pc_", {
  encode: JSON.stringify,
  decode: JSON.parse,
});
