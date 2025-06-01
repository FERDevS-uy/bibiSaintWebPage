import type { PaymentMethod } from "./paymentMethod";

export default interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  img: string[]; // [<imageLink>]
  categories: string[]; // [<category>]
  paymentLink: PaymentMethod[]; // [<id>=<link>] (ej: ws="https://wa.me/..." mp="https://mpago...")
}
