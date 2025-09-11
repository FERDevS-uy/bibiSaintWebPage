import type ProductInCart from "src/types/productInCart";
import removeToCart from "./removeToCart";
import trash from "../assets/trash.svg?raw";

export default function renderCart() {
  const storage = JSON.parse(localStorage.getItem("carrito") || "[]");
  let totalValue = 0;

  const cartList = document.getElementById("cartList") as HTMLElement;
  const subTotalSpan = document.getElementById("subtotal") as HTMLElement;
  const totalSpan = document.getElementById("total") as HTMLElement;
  const summary = document.getElementById("cartSummary") as HTMLElement;
  const empty = document.getElementById("cartEmpty") as HTMLElement;
  const productTable = document.querySelector(".cartTable") as HTMLElement;
  const copyBtn = document.getElementById("copyBtn") as HTMLElement
  const waBtn = document.getElementById("waBtn") as HTMLLinkElement;
  const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement

  /* ------------ Si no hay productos en el carrito oculta los elementos -----------*/
  if (!storage.length) {
    cartList.innerHTML = "";
    summary.classList.add("hidden");
    empty.classList.remove("hidden");
    productTable.classList.add("hidden");
    return
  }

  /* ------------ Si hay productos en el carrito muestra los elementos -----------*/
  summary.classList.remove("hidden");
  empty.classList.add("hidden");
  productTable.classList.remove("hidden");

  /* ------------------ Por cada producto renderiza una fila ------------------ */
  cartList.innerHTML = storage
    .map((p: ProductInCart) => {
      const subtotal = Number(p.price) * +p.cantidad;
      totalValue += subtotal;
      return productRow(p, subtotal);
    })
    .join("");

  /* ----------------------- Muestra los precios totales ----------------------- */
  subTotalSpan.textContent = `$${totalValue}`;
  totalSpan.textContent = `$${totalValue}`;

  /* ---------------------- Botones de cada fila de productos ---------------------- */

  // Botón quitar uno
  cartList.querySelectorAll<HTMLButtonElement>(".removeOnce").forEach((btn) => {
    btn.onclick = (e) => {
      const idx = btn.getAttribute("data-idx");
      if (idx) removeToCart(idx, true);
      renderCart();
    };
  });

  // Quitar item
  cartList.querySelectorAll<HTMLButtonElement>(".removeBtn").forEach((btn) => {
    btn.onclick = () => {
      const idx = btn.getAttribute("data-idx");
      if (idx) removeToCart(idx);
      renderCart();
    };
  });

  clearBtn.onclick = () => {
    localStorage.removeItem("carrito");
    renderCart();
    window.updateCartCount && window.updateCartCount();
  };

  // Mensaje para copiar o enviar
  const pedido = storage.map((p: ProductInCart) => `
  - ${p.name} x${p.cantidad} ($${p.price})`)
    .join(" ") + `\nTotal: $${totalValue}`;

  copyBtn.title = `Copiar: ${pedido}`
  copyBtn.onclick = () => {

    if (navigator.clipboard) {
      navigator.clipboard.writeText(pedido);

      copyBtn.textContent = "¡Copiado!";
      setTimeout(
        () => (copyBtn.textContent = "Copiar pedido"),
        1200
      );
    }
  };

  waBtn.href = `https://wa.me/59891361706?text=${encodeURIComponent("Hola, quiero pedir: " + pedido)}`;
}

const productRow = (p: ProductInCart, subtotal: number): String => {
  return `
      <tr>
        <td class="tdProduct">
          <span class="colTitle hidden">Item</span>
          <div class="cartItem">
            <div class="cartTop">
              <img src="${p.img || "/placeholder.png"}" alt="${p.name}" width="60" />
              <div class="cartName">${p.name}</div>
            </div>
          </div>
        </td>

        <td>
          <span class="colTitle hidden">Precio</span>
          $${p.price}
        </td>

        <td class="cartQty">
          <span class="colTitle hidden">Cant.</span>
          ${p.cantidad}
        </td>

        <td>
          <span class="colTitle hidden">Subtotal</span>
          $${subtotal}
        </td>

        <td class="tdActions">
          <span class="colTitle hidden">Acciones</span>

          <div>
            <button
              class="removeOnce"
              data-idx="${p.id}"
              title="Quitar uno"
              style="">
              -
            </button>

            <button
              class="iconBtn removeBtn"
              title="Quitar todo"
              data-idx="${p.id}">
              ${trash}
            </button>
          </div>
        </td>
      </tr>
    `;
}
