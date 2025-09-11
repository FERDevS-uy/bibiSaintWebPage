import type ProductInCart from "src/types/productInCart";

function addToCart(
  id: string,
  name: string,
  price: string,
  qty: number = 1,
  img: string
) {
  const product: ProductInCart = {
    id,
    name,
    price,
    cantidad: qty,
    img,
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
  } else {
    carrito.push(product);
  }
  localStorage.setItem("carrito", JSON.stringify(carrito));

  // llama a una funcion declarada en header que actualiza el contador del carrito
  window.updateCartCount && window.updateCartCount();
}

export default addToCart;
