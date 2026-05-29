declare module "@components/ProductGallery.jsx" {
  import type { ComponentType } from "react";
  const ProductGallery: ComponentType<{
    images?: string[];
    name?: string;
  }>;
  export default ProductGallery;
}
