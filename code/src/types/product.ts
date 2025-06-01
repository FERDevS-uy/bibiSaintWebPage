export default interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  img: string[]; // [<imageLink>]
  categories: string[]; // [<category>]
  paymentLink: string;
}
