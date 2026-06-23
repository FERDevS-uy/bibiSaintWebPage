import { defineMiddleware } from "astro/middleware";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 300;
const CLEANUP_INTERVAL = 120_000;

const hits = new Map<string, { count: number; resetAt: number }>();

let lastCleanup = Date.now();

function getIp(request: Request): string {
  const cf = (request as any).cf as Record<string, string> | undefined;
  if (cf?.ip) return cf.ip;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export const onRequest = defineMiddleware((ctx, next) => {
  const path = ctx.url.pathname;
  if (path.startsWith("/admin") || path.startsWith("/_astro") || path.startsWith("/assets")) {
    return next();
  }

  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    for (const [key, val] of hits) {
      if (now > val.resetAt) hits.delete(key);
    }
    lastCleanup = now;
  }

  const ip = getIp(ctx.request);
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  return next();
});
