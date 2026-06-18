import { decryptIDs } from "@utils/encription";
import { formatPrice, parsePrice } from "@utils/price";
import { normalizeSize } from "@utils/sizes";
import { withBasePath } from "@utils/basePath";
import {
  applyProviderMarkupValue,
  fetchAlondraLive,
  fetchKaiLive,
  fetchMartinaLive,
  fetchNuvexLive,
  providerFrom,
} from "../../client/stockService";

const runtimeBasePath = (document.documentElement.dataset.basePath || "").replace(/\/+$/, "");
const productsJsonUrl = `${runtimeBasePath}/productos.json`;
const params = new URLSearchParams(window.location.search);
const encryptedId = params.get("id");
const SESSION_ID = "202605";
const COUNTRY_ID = "598";

function parseDecryptedItem(itemStr: string): {
  id: string;
  cantidad: number;
  selectedColorId: number | null;
  selectedColorName: string | null;
} | null {
  const trimmed = itemStr.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const idVal = String(parsed?.id ?? "").trim();
      const cantVal = Number(parsed?.cantidad);
      if (!idVal || Number.isNaN(cantVal)) return null;

      const colorId = Number(parsed?.selectedColorId);
      const colorIdFinal = Number.isFinite(colorId) ? colorId : null;
      const colorName =
        parsed?.selectedColorName && String(parsed.selectedColorName).trim().length > 0
          ? String(parsed.selectedColorName).trim()
          : null;

      return {
        id: idVal,
        cantidad: cantVal,
        selectedColorId: colorIdFinal,
        selectedColorName: colorName,
      };
    } catch {
      // continue
    }
  }

  const lastDashIndex = trimmed.lastIndexOf("-");
  if (lastDashIndex === -1) return null;

  const id = trimmed.slice(0, lastDashIndex).trim();
  const cantStr = trimmed.slice(lastDashIndex + 1).trim();
  const cant = Number(cantStr);

  if (!id || Number.isNaN(cant)) return null;

  return {
    id,
    cantidad: cant,
    selectedColorId: null,
    selectedColorName: null,
  };
}

function parseTokenId(tokenId: string): {
  baseId: string;
  selectedVariantToken: string | null;
  selectedColorId: number | null;
} {
  const [base, rest = ""] = tokenId.split("__");
  if (!rest) {
    return {
      baseId: base,
      selectedVariantToken: null,
      selectedColorId: null,
    };
  }

  let variant: string | null = null;
  let colorId: number | null = null;

  rest
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const colorMatch = part.match(/^c(\d+)$/i);
      if (colorMatch) {
        const cid = Number(colorMatch[1]);
        if (Number.isFinite(cid)) {
          colorId = cid;
        }
        return;
      }
      if (!variant) {
        variant = part;
      }
    });

  return {
    baseId: base,
    selectedVariantToken: variant,
    selectedColorId: colorId,
  };
}

function isMeasurement(str: string): boolean {
  const upper = str.toUpperCase().trim();
  return /(\d+\s*[Xx]\s*\d+)/.test(upper) || /(\d+\s*(CM|MM|M|L|LT|PZA|PZAS|UN|U))/i.test(upper) || /^[A-Z]-\d+$/i.test(upper);
}

function parseVariantInfo(
  product: any,
  selectedVariantToken: string | null
): {
  selectedSize: string | null;
  variantBadgeText: string | null;
} {
  if (!selectedVariantToken) {
    return {
      selectedSize: null,
      variantBadgeText: null,
    };
  }

  const upper = selectedVariantToken.trim().toUpperCase();
  if (!upper) {
    return {
      selectedSize: null,
      variantBadgeText: null,
    };
  }

  const normalized = normalizeSize(upper);
  if (normalized) {
    return {
      selectedSize: normalized,
      variantBadgeText: `Talle ${normalized}`,
    };
  }

  if (isMeasurement(upper)) {
    return {
      selectedSize: null,
      variantBadgeText: `Medida ${upper}`,
    };
  }

  return {
    selectedSize: null,
    variantBadgeText: `Variante ${upper}`,
  };
}

async function fetchProductsJson(): Promise<any[]> {
  const candidates = [`${productsJsonUrl}`, "/productos.json", "productos.json"];

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // continue
    }
  }

  throw new Error("No se pudo obtener productos.json en ninguna ruta.");
}

window.addEventListener("DOMContentLoaded", async () => {
  const tokenId = encryptedId || localStorage.getItem("lastPedidoToken");

  if (tokenId) {
    try {
      const decrypted = decryptIDs(tokenId, "elias").map(parseDecryptedItem).filter((item) => item !== null);

      if (decrypted.length === 0) {
        throw new Error("El enlace de pedido no tiene productos validos.");
      }

      const products = await fetchProductsJson();

      const orderItems = decrypted
        .map((decItem) => {
          const parsed = parseTokenId(decItem.id);
          const found = products.find((p) => p.id === parsed.baseId);

          if (!found) return null;

          const variantInfo = parseVariantInfo(found, parsed.selectedVariantToken);

          return {
            ...found,
            cantidad: decItem.cantidad,
            requestedId: decItem.id,
            baseId: parsed.baseId,
            selectedSize: variantInfo.selectedSize,
            variantBadgeText: variantInfo.variantBadgeText,
            selectedColorId:
              decItem.selectedColorId !== null && decItem.selectedColorId !== undefined
                ? decItem.selectedColorId
                : parsed.selectedColorId,
            selectedColorName:
              decItem.selectedColorName && decItem.selectedColorName.trim().length > 0
                ? decItem.selectedColorName.trim()
                : null ??
                  (parsed.selectedColorId !== null ? found.colors?.find((c: any) => c.id === parsed.selectedColorId)?.name ?? `ID ${parsed.selectedColorId}` : null) ??
                  (decItem.selectedColorId !== null && decItem.selectedColorId !== undefined ? `ID ${decItem.selectedColorId}` : null),
            providerLink: found.paymentLink?.[0]?.url ?? "",
            currentUnitPrice: parsePrice(found.price),
          };
        })
        .filter((item) => item !== null);

      renderPedido(orderItems);
      setupCheckButtons(orderItems);
    } catch (error) {
      console.error(error);
      const container = document.getElementById("result__container");
      if (container) {
        container.innerHTML = '<p class="pedido-message">No se pudo cargar el pedido. El enlace parece invalido o incompleto. Genera uno nuevo desde el carrito e intenta nuevamente.</p>';
      }
    }
  } else {
    const container = document.getElementById("result__container");
    if (container) {
      container.innerHTML = '<p class="pedido-message">No hay id de pedido en la URL. Generá uno desde el carrito o abrí un enlace de pedido.</p>';
    }
  }
});

function renderPedido(items: any[]) {
  const container = document.getElementById("result__container");
  const total = items.reduce((sum, item) => sum + item.currentUnitPrice * item.cantidad, 0);

  console.log(items);

  const itemsHtml = items
    .map((item, idx) => {
      const rowKey = String(idx);
      const subtotal = item.currentUnitPrice * item.cantidad;
      const subtotalFormatted = formatPrice(subtotal);

      const badgeClass = item.variantBadgeText?.startsWith("Talle ") ? "pedido-size-badge" : "pedido-variant-badge";
      const variantBadge = item.variantBadgeText ? `<span class="${badgeClass}">${item.variantBadgeText}</span>` : "";

      const colorBadge =
        item.selectedColorId !== null
          ? `<span class="pedido-color-badge">Color ${item.selectedColorName ?? `ID ${item.selectedColorId}`}</span>`
          : "";

      return `
<div class="pedido-item" data-row-key="${rowKey}" data-cantidad="${item.cantidad}" data-unit-price="${item.currentUnitPrice}">
  <img src="${item.img[0]}" alt="${item.name}" loading="lazy" />
  <div class="pedido-item-info">
    <span class="pedido-item-name">${item.name}</span>
    <span id="pedidoStock_${rowKey}" class="pedido-stock-badge pending">Pendiente</span>
    ${variantBadge}
    ${colorBadge}
    <span class="pedido-item-price">$<span id="pedidoUnit_${rowKey}">${formatPrice(item.currentUnitPrice)}</span> c/u</span>
    <div class="pedido-check-row">
      <button
        type="button"
        class="pedido-check-btn"
        data-row-key="${rowKey}"
      >
        Verificar stock y precio
      </button>
    </div>
    <p id="pedidoStatus_${rowKey}" class="pedido-check-status">Pendiente de verificación.</p>
  </div>
  <div class="pedido-qty-wrap">
    <span class="pedido-qty">${item.cantidad}</span>
  </div>
  <div class="pedido-subtotal">$<span id="pedidoSubtotal_${rowKey}" class="pedido-subtotal-value">${subtotalFormatted}</span></div>
</div>`;
    })
    .join("");

  container!.innerHTML = `
<div class="pedido-list">
  <div class="pedido-list-header">
    <span></span>
    <span>Producto</span>
    <span style="text-align:center">Cant.</span>
    <span style="text-align:right">Subtotal</span>
  </div>
  ${itemsHtml}
</div>

<div class="pedido-total-box">
  <div class="pedido-total-inner">
    <div class="pedido-total-row">
      <span>${items.length} ${items.length === 1 ? "producto" : "productos"}</span>
      <span>${items.reduce((sum, item) => sum + item.cantidad, 0)} unidades</span>
    </div>
    <div class="pedido-total-row main">
      <span>Total</span>
      <span>$<span id="pedidoTotalValue">${formatPrice(total)}</span></span>
    </div>
  </div>
</div>`;
}

function updateTotalPrice() {
  const totalElement = document.getElementById("pedidoTotalValue");
  if (!totalElement) return;

  let newTotal = 0;
  document.querySelectorAll(".pedido-item[data-row-key]").forEach((row) => {
    const cantidad = Number((row as HTMLElement).dataset.cantidad || "0");
    const unitPrice = Number((row as HTMLElement).dataset.unitPrice || "0");
    newTotal += unitPrice * cantidad;
  });

  totalElement.textContent = formatPrice(newTotal);
}

function updateRowPrice(rowKey: string, newPrice: number) {
  const row = document.querySelector(`.pedido-item[data-row-key="${rowKey}"]`);
  const unitPriceSpan = document.getElementById(`pedidoUnit_${rowKey}`);
  const subtotalSpan = document.getElementById(`pedidoSubtotal_${rowKey}`);

  if (!row || !unitPriceSpan || !subtotalSpan) return;

  const cantidad = Number((row as HTMLElement).dataset.cantidad || "0");
  (row as HTMLElement).dataset.unitPrice = String(newPrice);
  unitPriceSpan.textContent = formatPrice(newPrice);
  subtotalSpan.textContent = formatPrice(newPrice * cantidad);

  updateTotalPrice();
}

function updateStockBadge(rowKey: string, status: string, badgeText: string) {
  const badge = document.getElementById(`pedidoStock_${rowKey}`);
  if (badge) {
    badge.textContent = badgeText;
    badge.classList.remove("pending", "ok", "error");
    badge.classList.add(status);
  }
}

function updateStatusMessage(rowKey: string, message: string, type: "neutral" | "ok" | "error" = "neutral") {
  const msgElement = document.getElementById(`pedidoStatus_${rowKey}`);
  if (msgElement) {
    msgElement.textContent = message;
    msgElement.classList.remove("ok", "error");
    if (type === "ok") msgElement.classList.add("ok");
    if (type === "error") msgElement.classList.add("error");
  }
}

function setupCheckButtons(orderItems: any[]) {
  const itemsMap = new Map(orderItems.map((item, idx) => [String(idx), item]));

  const checkBtns = Array.from(document.querySelectorAll(".pedido-check-btn"));

  checkBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      checkStockForRow(btn as HTMLButtonElement, itemsMap);
    });
  });

  (async () => {
    for (const btn of checkBtns) {
      await checkStockForRow(btn as HTMLButtonElement, itemsMap, true);
    }
  })();
}

async function checkStockForRow(btn: HTMLButtonElement, itemsMap: Map<string, any>, isAutomatic: boolean = false) {
  const rowKey = btn.dataset.rowKey || "";
  const item = itemsMap.get(rowKey);

  if (!rowKey || !item) return;

  const originalText = btn.textContent || "Verificar stock y precio";
  btn.disabled = true;
  btn.textContent = "Verificando...";

  updateStatusMessage(rowKey, "Consultando proveedor en vivo...");
  updateStockBadge(rowKey, "pending", "Pendiente");

  try {
    const provider = providerFrom(item.baseId, item.providerLink || "");

    if (provider === "martina") {
      const result = await fetchMartinaLive(item.baseId, SESSION_ID, COUNTRY_ID);
      const newPrice = applyProviderMarkupValue(result?.price, provider);

      if (newPrice > 0) {
        item.currentUnitPrice = newPrice;
        updateRowPrice(rowKey, newPrice);
      }

      if (!result || result.colors.length === 0) {
        updateStockBadge(rowKey, "error", "Sin stock");
        updateStatusMessage(rowKey, "Este producto no tiene stock activo en Martina.", "error");
        return;
      }

      let availableSizes = result.sizes || [];
      if (item.selectedColorId !== null) {
        const colorObj = result.colors.find((c: any) => c.id === item.selectedColorId);
        if (!colorObj) {
          updateStockBadge(rowKey, "error", "Sin stock");
          updateStatusMessage(rowKey, "El color elegido ya no está disponible.", "error");
          return;
        }
        availableSizes = colorObj.sizes || [];
      }

      if (item.selectedSize && availableSizes.length > 0 && !availableSizes.includes(item.selectedSize)) {
        updateStockBadge(rowKey, "error", "Sin stock");
        updateStatusMessage(rowKey, `Sin stock para talle ${item.selectedSize}.`, "error");
        return;
      }

      const hasStock = availableSizes.length > 0;
      updateStockBadge(rowKey, hasStock ? "ok" : "error", hasStock ? "En stock" : "Sin stock");
      updateStatusMessage(rowKey, "Stock y precio actualizados desde Martina.", hasStock ? "ok" : "error");
      return;
    }

    if (provider === "kaideco") {
      const result = await fetchKaiLive(item.providerLink);
      const newPrice = applyProviderMarkupValue(result?.price, provider);

      if (newPrice > 0) {
        item.currentUnitPrice = newPrice;
        updateRowPrice(rowKey, newPrice);
      }

      const availableSizes = Array.isArray(result?.sizes) ? result.sizes : [];
      if (item.selectedSize && availableSizes.length > 0 && !availableSizes.includes(item.selectedSize)) {
        updateStockBadge(rowKey, "error", "Sin stock");
        updateStatusMessage(rowKey, `Sin stock para talle ${item.selectedSize}.`, "error");
        return;
      }

      const inStock = result?.inStock === null ? true : !!result?.inStock;
      updateStockBadge(rowKey, inStock ? "ok" : "error", inStock ? "En stock" : "Sin stock");
      updateStatusMessage(rowKey, "Stock y precio actualizados desde Kai Deco.", inStock ? "ok" : "error");
      return;
    }

    if (provider === "nuvex") {
      const result = await fetchNuvexLive(item.providerLink);

      if (result?.inStock === true) {
        updateStockBadge(rowKey, "ok", "Disponible");
        updateStatusMessage(rowKey, "Stock verificado en Nuvex. El precio se mantiene según catálogo.", "ok");
        return;
      }

      if (result?.inStock === false) {
        updateStockBadge(rowKey, "error", "Sin stock");
        updateStatusMessage(rowKey, "Sin stock en Nuvex. El precio se mantiene según catálogo.", "error");
        return;
      }

      if (result?.source === "nuvex-static-no-api") {
        updateStockBadge(rowKey, "pending", "A confirmar");
        updateStatusMessage(
          rowKey,
          "En GitHub Pages no se puede verificar Nuvex en vivo (hosting estático + CORS). Se mantiene stock de catálogo."
        );
        return;
      }

      updateStockBadge(rowKey, "pending", "A confirmar");
      updateStatusMessage(rowKey, "Ten presente que puede ser que este producto no este disponible.");
      return;
    }

    if (provider === "alondra") {
      const result = await fetchAlondraLive(item.baseId);
      const newPrice = applyProviderMarkupValue(result?.price, provider);

      if (newPrice > 0) {
        item.currentUnitPrice = newPrice;
        updateRowPrice(rowKey, newPrice);
      }

      if (result?.inStock === true) {
        updateStockBadge(rowKey, "ok", "Disponible");
        updateStatusMessage(rowKey, "Stock y precio actualizados desde Alondra.", "ok");
        return;
      }

      if (result?.inStock === false) {
        updateStockBadge(rowKey, "error", "Sin stock");
        updateStatusMessage(rowKey, "Sin stock en Alondra. Precio actualizado si estuvo disponible.", "error");
        return;
      }

      updateStockBadge(rowKey, "pending", "A confirmar");
      updateStatusMessage(rowKey, "No se pudo confirmar stock en Alondra. Precio actualizado si hubo respuesta.");
      return;
    }

    updateStockBadge(rowKey, "pending", "A confirmar");
    updateStatusMessage(rowKey, "No se pudo verificar en vivo este proveedor. Se mantiene catálogo.");
  } catch (error) {
    console.error(error);
    updateStockBadge(rowKey, "error", "Error");
    updateStatusMessage(rowKey, "No se pudo verificar ahora. Se mantiene información del catálogo.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
