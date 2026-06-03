import type Category from "./categoryList";
import type { PaymentMethod } from "./paymentMethod";

export interface ProductColor {
  id: number;
  hex: string;
  name: string;
  images: string[];
  sizes?: string[];
}

export default interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  img: string[]; // [<imageLink>]
  categories: Category; // [<category>]
  paymentLink: PaymentMethod[]; // [<id>=<link>] (ej: ws="https://wa.me/..." mp="https://mpago...")
  relacionados: string[],
  enOferta: Boolean,
  /** Colores disponibles cuando el proveedor los expone (ej: Martina di Trento). */
  colors?: ProductColor[];
}
