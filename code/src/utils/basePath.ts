const KNOWN_ROUTE_SEGMENTS = new Set([
  "about",
  "api",
  "carrito",
  "categories",
  "ofertas",
  "page",
  "pedido",
  "producto",
  "search",
]);

function normalizePathname(pathname: string): string {
  const value = String(pathname || "/").trim();
  if (!value || value === "/") return "/";
  return value.replace(/\/+$/, "") || "/";
}

export function detectBasePath(pathname?: string): string {
  const currentPath = normalizePathname(
    pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
  );

  if (currentPath === "/") return "";

  const segments = currentPath.split("/").filter(Boolean);
  const routeIndex = segments.findIndex((segment) => KNOWN_ROUTE_SEGMENTS.has(segment));

  if (routeIndex === -1) return "";
  if (routeIndex === 0) return "";

  return `/${segments.slice(0, routeIndex).join("/")}`;
}

export function withBasePath(targetPath: string, pathnameOrBase?: string): string {
  const basePath = detectBasePath(pathnameOrBase).replace(/\/+$/, "");
  const normalizedTarget = String(targetPath || "")
    .trim()
    .replace(/^\/+/, "");

  if (!normalizedTarget) return basePath || "/";
  return `${basePath}/${normalizedTarget}`;
}