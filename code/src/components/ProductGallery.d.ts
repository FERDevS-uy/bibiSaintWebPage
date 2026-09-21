declare module "@components/ProductGallery.jsx" {
  import type { ComponentType } from "react";
  const ProductGallery: ComponentType<{
    images?: string[];
    name?: string;
    description?: string;
    id?: string;
    categoryName?: string;
    subcategoryNames?: string[];
  }>;
  export default ProductGallery;
}
