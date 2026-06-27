import type ProductInCart from "src/types/productInCart";
import removeToCart from "./removeToCart";
import addToCart from "./addToCart";
import trash from "../assets/trash.svg?raw";
import { decryptIDs, encryptIDs } from "./encription";
import { withBasePath } from "./basePath";
import { formatPrice, parsePrice } from "./price";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CART_IMAGE_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23f3f3f3'/%3E%3Crect x='18' y='18' width='84' height='84' rx='8' fill='%23e5e5e5'/%3E%3Cpath d='M37 78l16-17 13 12 17-20 12 25H37z' fill='%23c8c8c8'/%3E%3Ccircle cx='47' cy='46' r='7' fill='%23cfcfcf'/%3E%3C/svg%3E";

function sanitizeImageUrl(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s,;]+$/g, "")
    .replace(/^['\"]+|['\"]+$/g, "");
}

function normalizeCartImage(raw: unknown): string {
  if (Array.isArray(raw)) {
    const first = raw.find((value) => typeof value === "string" && value.trim());
    return typeof first === "string" ? sanitizeImageUrl(first) : CART_IMAGE_FALLBACK;
  }

  const value = String(raw ?? "").trim();
  if (!value) return CART_IMAGE_FALLBACK;

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const first = parsed.find((item) => typeof item === "string" && item.trim());
        if (typeof first === "string") return sanitizeImageUrl(first);
      }
    } catch {
      // noop
    }
  }

  if (value.includes(",")) {
    const [first] = value.split(",");
    const normalized = sanitizeImageUrl(first || "");
    if (normalized) return normalized;
  }

  const urlMatches = value.match(/https?:\/\/.*?(?=https?:\/\/|$)/g);
  if (urlMatches && urlMatches.length > 0) return sanitizeImageUrl(urlMatches[0]);

  return sanitizeImageUrl(value) || CART_IMAGE_FALLBACK;
}

function parseColorFromVariantId(rawId: string): number | null {
  const [, variantPart = ""] = String(rawId || "").split("__");
  if (!variantPart) return null;
  for (const token of variantPart.split("_")) {
    const match = token.trim().match(/^c(\d+)$/i);
    if (!match) continue;
    const id = Number(match[1]);
    if (Number.isFinite(id)) return id;
  }
  return null;
}

function getBaseProductId(rawId: string): string {
  const [baseId = ""] = String(rawId || "").split("__");
  return baseId;
}

function serializePedidoItem(product: ProductInCart): string {
  const colorId = product.selectedColorId ?? parseColorFromVariantId(product.id);
  const payload = {
    id: product.id,
    cantidad: Number(product.cantidad) || 1,
    selectedColorId: colorId,
    selectedColorName: product.selectedColorName || null,
  };
  return JSON.stringify(payload);
}

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
            addToCart(
              product.id,
              product.name,
              product.price,
              1,
              product.img,
              product.selectedColorId ?? null,
              product.selectedColorName ?? null,
            );
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


  const encryption = encryptIDs(storage.map((p: ProductInCart) => serializePedidoItem(p)), "elias")
  localStorage.setItem("lastPedidoToken", encryption);
  const pedidoPath = withBasePath("/pedido");
  const pedidoUrl = `${window.location.origin}${pedidoPath}?id=${encryption}`;

  // Mensaje para copiar o enviar
  const pedido = storage.map((p: ProductInCart) => `
  - ${p.name} x${p.cantidad} ($${formatPrice(parsePrice(p.price))})`)
    .join(" ") + `\nTotal: $${formatPrice(totalValue)}\n${pedidoUrl}`;

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
  const colorIdFromVariant = parseColorFromVariantId(p.id);
  const productId = getBaseProductId(p.id);
  const productHref = withBasePath(`/producto/${productId}`);
  const colorLabel = escapeHtml(p.selectedColorName || (colorIdFromVariant !== null ? `ID ${colorIdFromVariant}` : ""));
  const imgSrc = normalizeCartImage(p.img);
  const colorMeta = colorLabel
    ? `<div class="cartMeta"><span class="metaLabel">Color</span><span class="metaValue">${colorLabel}</span></div>`
    : "";

  const safeName = escapeHtml(p.name);
  const safeId = escapeHtml(p.id);

  return `
      <tr>
        <td class="tdRemove">
           <button class="removeBtn" title="Quitar todo" data-idx="${safeId}">X</button>
        </td>

        <td class="tdImg">
            <a href="${productHref}" class="cartThumbLink" title="Ver producto ${safeName}">
              <img src="${imgSrc}" alt="${safeName}" width="60" onerror="this.onerror=null;this.src='${CART_IMAGE_FALLBACK}'" />
            </a>
        </td>

        <td class="tdDesc">
           <div class="cartName">${safeName}</div>
            ${colorMeta}
           <div class="cartMeta">
             <span class="metaLabel">Precio</span>
             <span class="metaValue">$${formattedUnitPrice}</span>
           </div>
           <div class="cartMeta cartMetaQty">
             <span class="metaLabel">Cantidad</span>
             <div class="qtyControls">
              <button class="qtyBtn removeOnce" data-idx="${safeId}">-</button>
                <span class="qtyValue">${p.cantidad}</span>
                <button class="qtyBtn addOnce" data-idx="${safeId}">+</button>
              </div>
            </div>
            <div class="cartMeta">
              <span class="metaLabel">Subtotal</span>
              <span class="metaValue subtotalValue">$${formattedSubtotal}</span>
            </div>
         </td>

         <td class="tdQty">
            <div class="qtyControls">
              <button class="qtyBtn removeOnce" data-idx="${safeId}">-</button>
              <span class="qtyValue">${p.cantidad}</span>
              <button class="qtyBtn addOnce" data-idx="${safeId}">+</button>
           </div>
        </td>

        <td class="tdSubtotal">
           <span class="price">$${formattedSubtotal}</span>
        </td>
      </tr>
    `;
}
