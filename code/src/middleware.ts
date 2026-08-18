import { defineMiddleware } from "astro/middleware";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 180;
const CLEANUP_INTERVAL = 120_000;

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    `connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com https://pol21.martinaditrento.com`,
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

const hits = new Map<string, { count: number; resetAt: number }>();

let lastCleanup = Date.now();

function getRatePolicy(path: string): { bucket: string; maxRequests: number; windowMs: number } {
  if (path === "/api/admin/providers/sync") {
    return { bucket: "api-admin-sync", maxRequests: 10, windowMs: 3_600_000 };
  }
  if (path === "/api/contact") {
    return { bucket: "api-contact", maxRequests: 8, windowMs: 60_000 };
  }
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    return { bucket: "admin", maxRequests: 60, windowMs: 60_000 };
  }
  return { bucket: "default", maxRequests: DEFAULT_MAX_REQUESTS, windowMs: DEFAULT_WINDOW_MS };
}

function withSecurityHeaders(response: Response): Response {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

function getIp(request: Request): string {
  const cf = (request as any).cf as Record<string, string> | undefined;
  if (cf?.ip) return cf.ip;
  const connectingIp = request.headers.get("cf-connecting-ip");
  if (connectingIp) return connectingIp;
  return "unknown";
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  if (path.startsWith("/_astro") || path.startsWith("/assets")) {
    return withSecurityHeaders(await next());
  }

  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    for (const [key, val] of hits) {
      if (now > val.resetAt) hits.delete(key);
    }
    lastCleanup = now;
  }

  const ip = getIp(ctx.request);
  const policy = getRatePolicy(path);
  const hitKey = `${ip}:${policy.bucket}`;

  const entry = hits.get(hitKey);
  if (!entry || now > entry.resetAt) {
    hits.set(hitKey, { count: 1, resetAt: now + policy.windowMs });
    return withSecurityHeaders(await next());
  }

  entry.count++;
  if (entry.count > policy.maxRequests) {
    return withSecurityHeaders(new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta de nuevo más tarde." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    }));
  }

  return withSecurityHeaders(await next());
});
