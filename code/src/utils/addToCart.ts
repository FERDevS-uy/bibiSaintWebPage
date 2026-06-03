import type ProductInCart from "src/types/productInCart";

function sanitizeImageUrl(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s,;]+$/g, "")
    .replace(/^['\"]+|['\"]+$/g, "");
}

function pickFirstImage(raw: unknown): string {
  if (Array.isArray(raw)) {
    const first = raw.find((value) => typeof value === "string" && value.trim());
    return typeof first === "string" ? sanitizeImageUrl(first) : "";
  }

  const value = String(raw ?? "").trim();
  if (!value) return "";

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const first = parsed.find((item) => typeof item === "string" && item.trim());
        return typeof first === "string" ? sanitizeImageUrl(first) : "";
      }
    } catch {
      // noop
    }
  }

  if (value.includes(",")) {
    const [first] = value.split(",");
    return sanitizeImageUrl(first?.trim() || "");
  }

  const urlMatches = value.match(/https?:\/\/.*?(?=https?:\/\/|$)/g);
  if (urlMatches && urlMatches.length > 0) return sanitizeImageUrl(urlMatches[0]);

  return sanitizeImageUrl(value);
}

function addToCart(
  id: string,
  name: string,
  price: string,
  qty: number = 1,
  img: string,
  selectedColorId: number | null = null,
  selectedColorName: string | null = null,
) {
  const product: ProductInCart = {
    id,
    name,
    price,
    cantidad: qty,
    img: pickFirstImage(img),
    selectedColorId,
    selectedColorName,
  };
  let carrito = [];

  try {
    carrito = JSON.parse(localStorage.getItem("carrito") || "[]");
  } catch { }
  // Si ya existe, suma cantidad
  const idx = carrito.findIndex((p: ProductInCart) => p.id === product.id);

  if (idx >= 0) {
    const productoEnCarrito = carrito[idx];
    // sin el Number(qty) lo devuelve como string
    let cant = parseInt(productoEnCarrito.cantidad, 10) + qty;
    productoEnCarrito.cantidad = cant;
    if (selectedColorId !== null) productoEnCarrito.selectedColorId = selectedColorId;
    if (selectedColorName) productoEnCarrito.selectedColorName = selectedColorName;
  } else {
    carrito.push(product);
  }
  localStorage.setItem("carrito", JSON.stringify(carrito));

  // llama a una funcion declarada en header que actualiza el contador del carrito
  window.updateCartCount && window.updateCartCount();
}

export default addToCart;
