import type ProductInCart from "src/types/productInCart";
import { getMartinaVerifiedPrice } from "../client/martinaVerification";

function sanitizeImageUrl(value: string): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\s,;]+$/g, "")
    .replace(/^['\"]+|['\"]+$/g, "");
  // Reject anything that could break out of an attribute; allow http(s) or same-origin paths.
  if (/["'<>\s\\`]/u.test(cleaned)) return "";
  if (!/^(https?:)?(\/\/|\/)/u.test(cleaned)) return "";
  return cleaned;
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

async function addToCart(
  id: string,
  name: string,
  price: string,
  qty: number = 1,
  img: string,
  selectedColorId: number | null = null,
  selectedColorName: string | null = null,
  selectedColorHex: string | null = null,
) {
  // Para productos Martina el carrito usa el precio verificado oficial.
  // Reutiliza la verificación en curso (misma promesa) y cae al precio
  // sincronizado como fallback si la verificación falló o no existe.
  const baseId = String(id).split("__")[0];
  let unitPrice = price;
  if (baseId.toLowerCase().startsWith("mdt-")) {
    unitPrice = await getMartinaVerifiedPrice(id, price);
  }

  const product: ProductInCart = {
    id,
    name,
    price: unitPrice,
    cantidad: qty,
    img: pickFirstImage(img),
    selectedColorId,
    selectedColorName,
    selectedColorHex,
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
    if (selectedColorHex) productoEnCarrito.selectedColorHex = selectedColorHex;
  } else {
    carrito.push(product);
  }
  localStorage.setItem("carrito", JSON.stringify(carrito));

  // llama a una funcion declarada en header que actualiza el contador del carrito
  window.updateCartCount && window.updateCartCount();
}

export default addToCart;
