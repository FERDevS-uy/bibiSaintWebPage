import { useEffect, useRef } from "react";
import { productImageSrc, PRODUCT_IMAGE_FALLBACK } from "../utils/productImage";

export default function ProductImage({ src, onError, ...props }) {
  const imageRef = useRef(null);
  const reportedImageRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const source = productImageSrc(src);

  function reportFailure(image) {
    if (reportedImageRef.current !== image) {
      reportedImageRef.current = image;
      onErrorRef.current?.();
    }
  }

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    // The SSR image may have failed before React attached its handlers.
    if (
      image.dataset.fallbackApplied === "true" ||
      source === PRODUCT_IMAGE_FALLBACK ||
      (image.complete && image.naturalWidth === 0)
    )
      reportFailure(image);
  }, [source]);

  return (
    <img
      key={source}
      {...props}
      ref={imageRef}
      src={source}
      data-product-image=""
      // The head listener may settle this SSR image before React hydrates it.
      suppressHydrationWarning
      onError={(event) => reportFailure(event.currentTarget)}
    />
  );
}
