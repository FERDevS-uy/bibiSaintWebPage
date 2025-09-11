import type ProductInCart from "src/types/productInCart";

export default function removeToCart(id: string, one: boolean = false): ProductInCart[] {
    const carrito = JSON.parse(localStorage.getItem("carrito") || "[]");

    const prod = carrito.find((p: ProductInCart) => p.id === id)
    if (!prod) throw new Error("Producto no encontrado en el carrito");

    if (one && prod.cantidad > 1) {
        const nuevoCarrito = carrito.map((p: ProductInCart) => {
            if (p.id === id) {
                return { ...p, cantidad: p.cantidad - 1 };
            }
            return p;
        });

        localStorage.setItem("carrito", JSON.stringify(nuevoCarrito));
        window.updateCartCount && window.updateCartCount();
        return nuevoCarrito;
    }

    const nuevoCarrito = carrito.filter((p: ProductInCart) => p.id !== id);

    localStorage.setItem("carrito", JSON.stringify(nuevoCarrito));
    window.updateCartCount && window.updateCartCount();
    return nuevoCarrito;
}