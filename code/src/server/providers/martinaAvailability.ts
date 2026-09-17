export type MartinaAvailability = "available" | "unavailable" | "unknown";

export function parseMartinaProducts(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (
      (payload as Record<string, unknown>).error ||
      (payload as Record<string, unknown>).success === false
    ) {
      throw new Error("Respuesta de productos Martina inválida");
    }
    for (const key of ["data", "products", "result"] as const) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  throw new Error("Respuesta de productos Martina inválida");
}

export function evaluateMartinaAvailability(
  entries: unknown[],
): MartinaAvailability {
  let available = false;
  for (const entry of entries) {
    if (!/^\d+$/.test(String((entry as any)?.id ?? (entry as any)?.productId ?? "")) || (entry as any)?.variation?.id !== "tipoVenta")
      return "unknown";
    const sales = (entry as any)?.variation?.variationValues;
    if (!Array.isArray(sales)) return "unknown";
    for (const sale of sales) {
      if (!/^\d+$/.test(String(sale?.id ?? "")) || sale?.variation?.id !== "color")
        return "unknown";
      const colors = sale?.variation?.variationValues;
      if (!Array.isArray(colors)) return "unknown";
      for (const color of colors) {
        if (!/^\d+$/.test(String(color?.id ?? "")) || color?.variation?.id !== "size")
          return "unknown";
        const sizes = color?.variation?.variationValues;
        if (!Array.isArray(sizes)) return "unknown";
        for (const size of sizes) {
          if (!/^\d+$/.test(String(size?.id ?? "")) || typeof size?.description !== "string" || !size.description.trim())
            return "unknown";
          available = true;
        }
      }
    }
  }
  return available ? "available" : "unavailable";
}
