import type ProductInCart from "src/types/productInCart";
import removeToCart from "./removeToCart";
import addToCart from "./addToCart";
import trash from "../assets/trash.svg?raw";
import { decryptIDs, encryptIDs } from "./encription";
import { config } from "src/config";
import { formatPrice, parsePrice } from "./price";

export default function renderCart() {
  const storage = JSON.parse(localStorage.getItem("carrito") || "[]");
  let totalValue = 0;

  const cartList = document.getElementById("cartList") as HTMLElement;
  const totalSpan = document.getElementById("total") as HTMLElement;
  const summary = document.getElementById("cartSummary") as HTMLElement;
  const empty = document.getElementById("cartEmpty") as HTMLElement;
  const productTable = document.getElementById("cartTable") as HTMLElement;
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
      const unitPrice = parsePrice(p.price);
      const subtotal = unitPrice * +p.cantidad;
      totalValue += subtotal;
      return productRow(p, subtotal);
    })
    .join("");

  /* ----------------------- Muestra los precios totales ----------------------- */
  totalSpan.textContent = `$${formatPrice(totalValue)}`;

  /* ---------------------- Botones de cada fila de productos ---------------------- */

  // Botón quitar uno
  cartList.querySelectorAll<HTMLButtonElement>(".removeOnce").forEach((btn) => {
    btn.onclick = (e) => {
      const idx = btn.getAttribute("data-idx");
      if (idx) removeToCart(idx, true);
      renderCart();
    };
  });

  // Botón agregar uno (+)
  cartList.querySelectorAll<HTMLButtonElement>(".addOnce").forEach((btn) => {
    btn.onclick = (e) => {
      const idx = btn.getAttribute("data-idx");
      if (idx) {
        // Find product to get details for re-adding
        const product = storage.find((p: ProductInCart) => p.id === idx);
        if (product) {
            addToCart(product.id, product.name, product.price, 1, product.img);
            renderCart();
        }
      }
    };
  });

  // Quitar item (X)
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


  const encryption = encryptIDs(storage.map((p: ProductInCart) => `${p.id}-${p.cantidad}`), "elias")
  localStorage.setItem("lastPedidoToken", encryption);

  // Mensaje para copiar o enviar
  const pedido = storage.map((p: ProductInCart) => `
  - ${p.name} x${p.cantidad} ($${formatPrice(parsePrice(p.price))})`)
    .join(" ") + `\nTotal: $${formatPrice(totalValue)}\n${config.site}pedido?id=${encryption}`;

  // Copy func logic kept but button is hidden in UI
  copyBtn.title = `Copiar: ${pedido}`
  copyBtn.onclick = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(pedido);
    }
  };

  waBtn.href = `https://wa.me/59891361706?text=${encodeURIComponent("Hola, quiero pedir: " + pedido)}`;
}

const productRow = (p: ProductInCart, subtotal: number): String => {
  const formattedUnitPrice = formatPrice(parsePrice(p.price));
  const formattedSubtotal = formatPrice(subtotal);

  return `
      <tr>
        <td class="tdRemove">
           <button class="removeBtn" title="Quitar todo" data-idx="${p.id}">X</button>
        </td>

        <td class="tdImg">
           <img src="${p.img || "/placeholder.png"}" alt="${p.name}" width="60" />
        </td>

        <td class="tdDesc">
           <div class="cartName">${p.name}</div>
           <div class="cartMeta">
             <span class="metaLabel">Precio</span>
             <span class="metaValue">$${formattedUnitPrice}</span>
           </div>
           <div class="cartMeta cartMetaQty">
             <span class="metaLabel">Cantidad</span>
             <div class="qtyControls">
               <button class="qtyBtn removeOnce" data-idx="${p.id}">-</button>
               <span class="qtyValue">${p.cantidad}</span>
               <button class="qtyBtn addOnce" data-idx="${p.id}">+</button>
             </div>
           </div>
           <div class="cartMeta">
             <span class="metaLabel">Subtotal</span>
             <span class="metaValue subtotalValue">$${formattedSubtotal}</span>
           </div>
        </td>

        <td class="tdQty">
           <div class="qtyControls">
             <button class="qtyBtn removeOnce" data-idx="${p.id}">-</button>
             <span class="qtyValue">${p.cantidad}</span>
             <button class="qtyBtn addOnce" data-idx="${p.id}">+</button>
           </div>
        </td>

        <td class="tdSubtotal">
           <span class="price">$${formattedSubtotal}</span>
        </td>
      </tr>
    `;
}
