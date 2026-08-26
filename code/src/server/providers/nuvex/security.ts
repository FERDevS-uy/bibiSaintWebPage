// security.ts
// Validación de URLs y límites de recursos para el scraping de Nuvex (anti-SSRF).
// Todo el scraping de Nuvex debe pasar por estos validadores; no se hace fetch
// server-side de URLs arbitrarias provenientes del cliente.

export const NUVEX_HOST = "nuvex.uy";
const NUVEX_IMAGE_HOSTS = new Set<string>([NUVEX_HOST]);

export const NUVEX_LIMITS = {
  maxCategories: 50,
  maxPagesPerCategory: 20,
  maxProducts: 2000,
  maxBytesPerResponse: 2 * 1024 * 1024, // 2 MB
  concurrency: 4,
  deadlineMs: 90_000, // deadline total del preview
  requestTimeoutMs: 15_000,
  absentDropThreshold: 0.5, // si >50% de productos conocidos aparecen ausentes, abortar
  maxDeactivations: 100, // límite de desactivaciones por apply
  maxPreviewItems: 300, // límite de items en el plan
};

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return h === NUVEX_HOST || h.endsWith(`.${NUVEX_HOST}`);
}

function isPrivateOrReserved(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || // IPv4 literal
    h.startsWith("10.") ||
    h.startsWith("127.") ||
    h.startsWith("192.168.") ||
    /^169\.254\./.test(h) ||
    h.startsWith("172.") && /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/** URL válida para navegación de Nuvex (host, https, sin IP privada, sin puerto no estándar). */
export function isValidNuvexUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (!hostAllowed(u.hostname)) return false;
  if (isPrivateOrReserved(u.hostname)) return false;
  if (u.port && u.port !== "443") return false;
  return true;
}

/** URL válida para imágenes de Nuvex (host de imágenes + https). */
export function isValidNuvexImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (!NUVEX_IMAGE_HOSTS.has(u.hostname.toLowerCase())) return false;
  if (isPrivateOrReserved(u.hostname)) return false;
  if (u.port && u.port !== "443") return false;
  return true;
}

/** Construye una URL absoluta de Nuvex a partir de un path relativo (solo si el host resultante es nuvex.uy). */
export function nuvexAbsolute(url: string, base = `https://${NUVEX_HOST}/`): string {
  if (!url) return "";
  const u = new URL(String(url).trim(), base);
  // El home de Nuvex expone links en http:// (que redirigen a https). Forzamos https
  // solo para hosts permitidos; el validador sigue exigiendo https para todo lo demás.
  if (u.protocol === "http:" && hostAllowed(u.hostname)) {
    u.protocol = "https:";
  }
  return isValidNuvexUrl(u.toString()) ? u.toString() : "";
}
