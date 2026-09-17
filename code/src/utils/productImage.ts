export const PRODUCT_IMAGE_FALLBACK =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="#f3f4f6"/><g fill="#9ca3af"><circle cx="250" cy="248" r="64"/><path d="M116 448l110-118 86 90 56-58 156 86v52H116z"/></g><text x="320" y="566" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#4b5563">No se pudo cargar la imagen</text></svg>',
  );

const LOCAL_PRODUCT_IMAGES = new Map([
  ["https://http2.mlstatic.com/D_681743-MLU94030308302_102025-O.jpg", "/assets/product-images/D_681743-MLU94030308302_102025-O.jpg"],
  ["https://http2.mlstatic.com/D_622862-MLU94456963557_102025-O.jpg", "/assets/product-images/D_622862-MLU94456963557_102025-O.jpg"],
  ["https://http2.mlstatic.com/D_789921-MLU94457104337_102025-O.jpg", "/assets/product-images/D_789921-MLU94457104337_102025-O.jpg"],
  ["https://http2.mlstatic.com/D_951533-MLU94236438586_102025-O.jpg", "/assets/product-images/D_951533-MLU94236438586_102025-O.jpg"],
  ["https://http2.mlstatic.com/D_769680-MLU94457054137_102025-O.jpg", "/assets/product-images/D_769680-MLU94457054137_102025-O.jpg"],
  ["https://http2.mlstatic.com/D_918463-MLU94021925904_102025-O.jpg", "/assets/product-images/D_918463-MLU94021925904_102025-O.jpg"],
]);

export function productImageSrc(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw))
    return PRODUCT_IMAGE_FALLBACK;
  try {
    const local = raw.startsWith("/") && !raw.startsWith("//");
    if (!local && !/^https:\/\/[^/?#]/i.test(raw))
      return PRODUCT_IMAGE_FALLBACK;
    const url = new URL(raw, "https://local.invalid");
    if (url.username || url.password || url.hash) return PRODUCT_IMAGE_FALLBACK;
    if (local) {
      if (
        url.pathname.startsWith("//") ||
        url.pathname === "/api/product-image"
      )
        return PRODUCT_IMAGE_FALLBACK;
      return url.pathname + url.search;
    }
    return LOCAL_PRODUCT_IMAGES.get(raw) ?? url.href;
  } catch {
    return PRODUCT_IMAGE_FALLBACK;
  }
}
