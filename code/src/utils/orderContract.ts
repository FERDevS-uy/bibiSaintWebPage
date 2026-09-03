import { parsePrice } from "./price.ts";

export const MAX_ORDER_LINES = 100;
export const MAX_ORDER_QUANTITY = 100_000;
export const MAX_ORDER_ID_BYTES = 160;
export const MAX_ORDER_PRICE_BYTES = 128;
export const MAX_ORDER_COLOR_ID = Number.MAX_SAFE_INTEGER;
export const MAX_ORDER_COLOR_NAME_BYTES = 128;

export interface PedidoItemSnapshot {
  id: string;
  cantidad: number;
  price: string | null;
  selectedColorId: number | null;
  selectedColorName: string | null;
}

export interface PedidoSnapshotV2 {
  version: 2;
  items: PedidoItemSnapshot[];
  total: number;
  lineCount: number;
  unitCount: number;
}

export interface PedidoItemInput {
  id?: unknown;
  cantidad?: unknown;
  price?: unknown;
  selectedColorId?: unknown;
  selectedColorName?: unknown;
}

const textEncoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

function assertFieldLength(value: string, maxBytes: number, fieldName: string): void {
  if (utf8ByteLength(value) > maxBytes) {
    throw new Error(`${fieldName} supera el límite permitido`);
  }
}

function normalizeItem(input: PedidoItemInput): PedidoItemSnapshot {
  const id = String(input?.id ?? "").trim();
  if (!id) throw new Error("El pedido contiene un producto sin id");
  assertFieldLength(id, MAX_ORDER_ID_BYTES, "El id del producto");

  const cantidad = Number(input?.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > MAX_ORDER_QUANTITY) {
    throw new Error("La cantidad del pedido no es válida");
  }

  let price: string | null = null;
  if (input?.price !== undefined && input.price !== null) {
    price = String(input.price);
    assertFieldLength(price, MAX_ORDER_PRICE_BYTES, "El precio del producto");
  }

  let selectedColorId: number | null = null;
  if (input?.selectedColorId !== undefined && input.selectedColorId !== null && input.selectedColorId !== "") {
    selectedColorId = Number(input.selectedColorId);
    if (!Number.isSafeInteger(selectedColorId) || selectedColorId < 0 || selectedColorId > MAX_ORDER_COLOR_ID) {
      throw new Error("El color del pedido no es válido");
    }
  }

  let selectedColorName: string | null = null;
  if (input?.selectedColorName !== undefined && input.selectedColorName !== null) {
    selectedColorName = String(input.selectedColorName);
    assertFieldLength(selectedColorName, MAX_ORDER_COLOR_NAME_BYTES, "El nombre del color");
  }

  return { id, cantidad, price, selectedColorId, selectedColorName };
}

export function normalizeOrderItems(items: readonly PedidoItemInput[]): PedidoItemSnapshot[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("El pedido no tiene productos");
  }
  if (items.length > MAX_ORDER_LINES) {
    throw new Error(`El pedido supera el máximo de ${MAX_ORDER_LINES} productos`);
  }
  return items.map((item) => normalizeItem(item));
}

export function createOrderSnapshot(items: readonly PedidoItemInput[]): PedidoSnapshotV2 {
  const normalizedItems = normalizeOrderItems(items);
  const total = normalizedItems.reduce(
    (sum, item) => sum + parsePrice(item.price ?? "") * item.cantidad,
    0,
  );
  const unitCount = normalizedItems.reduce((sum, item) => sum + item.cantidad, 0);

  if (!Number.isFinite(unitCount)) {
    throw new Error("El total de unidades del pedido no es válido");
  }

  return {
    version: 2,
    items: normalizedItems,
    total,
    lineCount: normalizedItems.length,
    unitCount,
  };
}
