// client.ts
// Cliente de sesión de Nuvex (login + catálogo + detalle) usando fetch (Worker/Node).
// - CookieJar por ejecución (nunca global): evita compartir sesiones entre requests.
// - TLS estricto: NO desactiva la verificación de certificados (fail-closed).
// - Validación de URLs anti-SSRF + límites globales con deadline/AbortController.
import {
  NUVEX_LIMITS,
  isValidNuvexUrl,
  isValidNuvexImageUrl,
  nuvexAbsolute,
} from "./security.ts";
import type { NuvexProductDraft } from "./parser.ts";
import { parseNuvexProductHtml } from "./parser.ts";

export interface NuvexCategory {
  url: string;
  name: string;
}

export interface NuvexCatalog {
  products: NuvexProductDraft[];
  categories: NuvexCategory[];
}

export interface NuvexSessionOptions {
  email: string;
  password: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  deadlineMs?: number;
}

const DEFAULT_BASE = "https://nuvex.uy/";

/** Simple store de cookies por ejecución. */
class CookieJar {
  private cookies = new Map<string, string>();
  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }
  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  absorb(setCookieHeader: string | null): void {
    if (!setCookieHeader) return;
    for (const part of setCookieHeader.split(",")) {
      const seg = part.split(";")[0].trim();
      const idx = seg.indexOf("=");
      if (idx > 0) {
        this.set(seg.slice(0, idx), seg.slice(idx + 1));
      }
    }
  }
}

function browserHeaders(jar: CookieJar): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "Mozilla/5.0",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9",
  };
  const cookie = jar.header();
  if (cookie) h.Cookie = cookie;
  return h;
}

/** Descarta la redirección a un host no permitido (anti-SSRF): sigue solo dentro de nuvex.uy. */
function safeRedirect(res: Response): string | null {
  const loc = res.headers.get("location");
  if (!loc) return null;
  const abs = nuvexAbsolute(loc, DEFAULT_BASE);
  return abs || null;
}

export class NuvexClient {
  private jar = new CookieJar();
  private readonly base: string;
  private readonly email: string;
  private readonly password: string;
  private readonly requestTimeoutMs: number;
  private readonly deadlineMs: number;

  constructor(opts: NuvexSessionOptions) {
    this.base = opts.baseUrl || DEFAULT_BASE;
    this.email = opts.email;
    this.password = opts.password;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? NUVEX_LIMITS.requestTimeoutMs;
    this.deadlineMs = opts.deadlineMs ?? NUVEX_LIMITS.deadlineMs;
  }

  private async request(
    url: string,
    init: RequestInit = {},
    deadline: AbortSignal,
    redirectDepth = 0,
  ): Promise<Response> {
    if (!isValidNuvexUrl(url)) {
      throw new Error(`URL no permitida: ${url}`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const onAbort = () => controller.abort();
    deadline.addEventListener("abort", onAbort);

    try {
      const headers: Record<string, string> = {
        ...browserHeaders(this.jar),
        ...(init.headers as Record<string, string>),
      };
      const res = await fetch(url, {
        ...init,
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      // Absorber cookies de sesión de TODAS las respuestas (login, redirecciones, etc.).
      this.jar.absorb(res.headers.get("set-cookie"));

      if (res.status >= 300 && res.status < 400) {
        const next = safeRedirect(res);
        if (next && redirectDepth < 5) {
          return this.request(next, init, deadline, redirectDepth + 1);
        }
        throw new Error(`Redirección no permitida desde ${url}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
      deadline.removeEventListener("abort", onAbort);
    }
  }

  private async html(url: string, deadline: AbortSignal): Promise<string> {
    const res = await this.request(url, { method: "GET" }, deadline);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > NUVEX_LIMITS.maxBytesPerResponse) {
      throw new Error(`Respuesta demasiado grande desde ${url}`);
    }
    const text = new TextDecoder("utf-8").decode(buf);
    return text;
  }

  async login(): Promise<boolean> {
    const deadline = new AbortController().signal;
    const loginUrl = nuvexAbsolute(
      "index.php?route=account/login",
      this.base,
    ) as string;
    const accountUrl = nuvexAbsolute(
      "index.php?route=account/account",
      this.base,
    ) as string;

    await this.html(loginUrl, deadline);

    const form = new URLSearchParams();
    form.set("email", this.email);
    form.set("password", this.password);

    const res = await this.request(
      loginUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://nuvex.uy",
          Referer: loginUrl,
        },
        body: form.toString(),
      },
      deadline,
    );
    res.body?.cancel().catch(() => {});

    const accountHtml = await this.html(accountUrl, deadline);
    const isAuth =
      /route=account\/logout|route=account\/edit/i.test(accountHtml) &&
      !/route=account\/login/i.test(accountHtml);
    return isAuth;
  }

  async getCategories(): Promise<NuvexCategory[]> {
    const deadline = new AbortController().signal;
    const home = this.base;
    const html = await this.html(home, deadline);
    const urls = new Set<string>();
    const names = new Set<string>();
    for (const m of html.matchAll(/href="([^"]*route=product\/category(?:&amp;|&)path=[^"]*)"/gi)) {
      const raw = m[1].replace(/&amp;/g, "&");
      const clean = raw.split("&page")[0].split("&limit")[0];
      const abs = nuvexAbsolute(clean, this.base);
      if (abs) urls.add(abs);
    }
    // nombre aproximado de categoría desde el href: /path=N
    for (const u of urls) {
      const m = u.match(/path=(\d+)/);
      names.add(m ? `Cat${m[1]}` : u);
    }
    const arr = Array.from(urls)
      .slice(0, NUVEX_LIMITS.maxCategories)
      .map((url) => ({ url, name: "" }));
    // rellenar nombre desde el HTML del home por matching simple
    for (const item of arr) {
      const m = item.url.match(/path=(\d+)/);
      const label = m ? this.extractCategoryLabel(html, m[1]) : "";
      item.name = label || `Categoría ${m?.[1] || ""}`.trim();
    }
    return arr;
  }

  private extractCategoryLabel(homeHtml: string, pathId: string): string {
    // Busca <a href="...path=ID...">Texto</a>
    const re = new RegExp(
      `href="[^"]*route=product\\/category(?:&amp;|&)path=${pathId}[^"]*"[^>]*>([^<]*)</a>`,
      "i",
    );
    const m = homeHtml.match(re);
    return m ? m[1].trim() : "";
  }

  async discoverProductUrls(): Promise<Array<{ url: string; catName: string }>> {
    const deadline = new AbortController().signal;
    const categories = await this.getCategories();
    const queue: Array<{ url: string; catName: string }> = [];
    for (const cat of categories) {
      let page = 1;
      let hasNext = true;
      while (hasNext && page <= NUVEX_LIMITS.maxPagesPerCategory) {
        const pageUrl = `${cat.url}&page=${page}&limit=1000`;
        let html: string;
        try {
          html = await this.html(pageUrl, deadline);
        } catch (e) {
          hasNext = false;
          break;
        }
        if (!/<div class="product-layout/.test(html)) {
          hasNext = false;
          break;
        }
        let found = 0;
        for (const m of html.matchAll(/href="([^"]*route=product\/product(?:&amp;|&)[^"]*)"/gi)) {
          const raw = m[1].replace(/&amp;/g, "&");
          const abs = nuvexAbsolute(raw.split("&limit")[0], this.base);
          if (abs) {
            queue.push({ url: abs, catName: cat.name || "General" });
            found++;
          }
        }
        if (found === 0) hasNext = false;
        page++;
      }
    }
    // dedupe por URL
    const seen = new Set<string>();
    const unique: Array<{ url: string; catName: string }> = [];
    for (const p of queue) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      unique.push(p);
      if (unique.length >= NUVEX_LIMITS.maxProducts) break;
    }
    return unique;
  }

  async fetchProduct(url: string, catName: string): Promise<NuvexProductDraft | null> {
    const deadline = new AbortController().signal;
    const html = await this.html(url, deadline);
    return parseNuvexProductHtml(html, url, catName);
  }
}
