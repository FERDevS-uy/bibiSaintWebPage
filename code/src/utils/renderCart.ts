import type ProductInCart from "src/types/productInCart";
import removeToCart from "./removeToCart";
import addToCart from "./addToCart";
import trash from "../assets/trash.svg?raw";
import { decryptIDs, encryptIDs } from "./encription";
import { withBasePath } from "./basePath";
import { createOrderSnapshot } from "./orderContract";
import { encodeOrderTokenV2, encodeOrderTokenV3 } from "./orderToken";
import { formatPrice, parsePrice } from "./price";

let renderGeneration = 0;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CART_IMAGE_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23f3f3f3'/%3E%3Crect x='18' y='18' width='84' height='84' rx='8' fill='%23e5e5e5'/%3E%3Cpath d='M37 78l16-17 13 12 17-20 12 25H37z' fill='%23c8c8c8'/%3E%3Ccircle cx='47' cy='46' r='7' fill='%23cfcfcf'/%3E%3C/svg%3E";

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

function normalizeCartImage(raw: unknown): string {
  if (Array.isArray(raw)) {
    const first = raw.find((value) => typeof value === "string" && value.trim());
    return typeof first === "string" ? sanitizeImageUrl(first) || CART_IMAGE_FALLBACK : CART_IMAGE_FALLBACK;
  }

  const value = String(raw ?? "").trim();
  if (!value) return CART_IMAGE_FALLBACK;

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const first = parsed.find((item) => typeof item === "string" && item.trim());
        if (typeof first === "string") return sanitizeImageUrl(first) || CART_IMAGE_FALLBACK;
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
  if (urlMatches && urlMatches.length > 0) return sanitizeImageUrl(urlMatches[0]) || CART_IMAGE_FALLBACK;

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
    price: product.price ?? null,
  };
  return JSON.stringify(payload);
}

function orderItemInput(product: ProductInCart) {
  return {
    id: product.id,
    cantidad: product.cantidad,
    selectedColorId: product.selectedColorId ?? parseColorFromVariantId(product.id),
    selectedColorName: product.selectedColorName || null,
    price: product.price ?? null,
  };
}

export default async function renderCart() {
  const generation = ++renderGeneration;
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

  // Compression is asynchronous. Remove the old link immediately so a stale
  // render can never leave a clickable order URL while the new one is pending.
  waBtn.removeAttribute("href");
  waBtn.setAttribute("aria-disabled", "true");
  waBtn.setAttribute("aria-busy", "true");

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
    btn.onclick = async (e) => {
      const idx = btn.getAttribute("data-idx");
      if (idx) {
        // Find product to get details for re-adding
        const product = storage.find((p: ProductInCart) => p.id === idx);
        if (product) {
            await addToCart(
              product.id,
              product.name,
              product.price,
              1,
              product.img,
              product.selectedColorId ?? null,
              product.selectedColorName ?? null,
              product.selectedColorHex ?? null,
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


  // Keep the legacy token in localStorage for existing consumers. The link sent
  // to WhatsApp uses v3/v2 whenever it can be generated safely.
  let encryption = "";
  try {
    encryption = encryptIDs(storage.map((p: ProductInCart) => serializePedidoItem(p)), "elias");
    localStorage.setItem("lastPedidoToken", encryption);
  } catch {
    // The compact link below can still work if only the legacy serializer fails.
  }

  const pedidoPath = withBasePath("/pedido");
  let compactSnapshot: ReturnType<typeof createOrderSnapshot> | null = null;
  let v2Token: string | null = null;
  try {
    compactSnapshot = createOrderSnapshot(storage.map((p: ProductInCart) => orderItemInput(p)));
    v2Token = encodeOrderTokenV2(compactSnapshot);
  } catch {
    // v3/v2 are optional compact representations; the legacy token remains the
    // final safe fallback and is already prepared above.
  }

  const lineCount = compactSnapshot?.lineCount ?? storage.length;
  const unitCount = compactSnapshot?.unitCount ?? storage.reduce((sum, p: ProductInCart) => sum + Number(p.cantidad), 0);

  const buildPedidoMessage = (pedidoUrl: string): string =>
    `Hola, quiero hacer un pedido.\n\n${lineCount} productos · ${unitCount} unidades\nTotal: $${formatPrice(totalValue)}\nVer pedido: ${pedidoUrl}`;

  const applyPedidoLink = (pedidoUrl: string): void => {
    if (generation !== renderGeneration) return;
    const pedido = buildPedidoMessage(pedidoUrl);

    // Copy func logic kept but button is hidden in UI
    copyBtn.title = `Copiar: ${pedido}`;
    copyBtn.onclick = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(pedido);
    };

    waBtn.href = `https://wa.me/59891361706?text=${encodeURIComponent(pedido)}`;
    waBtn.removeAttribute("aria-disabled");
    waBtn.removeAttribute("aria-busy");
  };

  const ensureLegacyToken = (): string | null => {
    if (encryption) return encryption;
    try {
      encryption = encryptIDs(storage.map((p: ProductInCart) => serializePedidoItem(p)), "elias");
      localStorage.setItem("lastPedidoToken", encryption);
      return encryption;
    } catch {
      return null;
    }
  };

  const preparePedidoLink = async (): Promise<void> => {
    let selectedQuery = "";
    let selectedToken: string | null = null;

    if (compactSnapshot) {
      try {
        const v3Token = await encodeOrderTokenV3(compactSnapshot);
        if (generation !== renderGeneration) return;
        if (!v2Token || v3Token.length < v2Token.length) {
          selectedQuery = "p";
          selectedToken = v3Token;
        }
      } catch {
        // CompressionStream may be unavailable; use v2 or legacy below.
      }
    }

    if (generation !== renderGeneration) return;
    if (!selectedToken && v2Token) {
      selectedQuery = "p";
      selectedToken = v2Token;
    }
    if (!selectedToken) {
      const legacyToken = ensureLegacyToken();
      if (legacyToken) {
        selectedQuery = "id";
        selectedToken = legacyToken;
      }
    }

    if (generation !== renderGeneration || !selectedToken) return;
    applyPedidoLink(`${window.location.origin}${pedidoPath}?${selectedQuery}=${selectedToken}`);
  };

  // Existing callers intentionally do not need to await renderCart().
  void preparePedidoLink();
}

const productRow = (p: ProductInCart, subtotal: number): String => {
  const formattedUnitPrice = formatPrice(parsePrice(p.price));
  const formattedSubtotal = formatPrice(subtotal);
  const colorIdFromVariant = parseColorFromVariantId(p.id);
  const productId = getBaseProductId(p.id);
  const productHref = withBasePath(`/producto/${productId}`);
  const colorLabel = escapeHtml(p.selectedColorName || (colorIdFromVariant !== null ? `ID ${colorIdFromVariant}` : ""));
  const colorHex = p.selectedColorHex || "#cccccc";
  const imgSrc = normalizeCartImage(p.img);

  const colorSwatch = colorLabel
    ? `<div class="cartColor">
        <span class="cartColorSwatch" style="background-color:${escapeHtml(colorHex)}"></span>
        <span class="cartColorName">${colorLabel}</span>
      </div>`
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
            ${colorSwatch}
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
