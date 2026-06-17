# Deploy a Cloudflare Pages

> Esta guía es solo de referencia: el sitio sigue funcionando en GitHub Pages
> (caería en el `slot="fallback"` y se vería el precio del CSV). Cloudflare
> Pages se necesita para que se ejecuten los **Server Islands** (`LivePrice`)
> y se vean precios/stock en vivo desde los proveedores.

## 1. Adapter & runtime

- Adapter: [`@astrojs/cloudflare@^12.6.13`](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
- `astro.config.mjs`:
  - `output: "server"`
  - `adapter: cloudflare({ imageService: "passthrough" })` (Sharp no corre en
    Workers; las imágenes se sirven tal cual)
  - `vite.ssr.external: ["nodemailer"]` para que `contact.ts` no se rompa al
    bundlear (nodemailer es Node-only).
- Cada página `.astro` estática lleva `export const prerender = true;` para que
  el HTML se prerenderice en build y solo los componentes con `server:defer`
  se ejecuten en el Worker.

## 2. Variables de entorno

Configurar en **Cloudflare Pages → Settings → Environment variables**
(Production y Preview):

| Variable                     | Ejemplo                                            | Uso                          |
| ---------------------------- | -------------------------------------------------- | ---------------------------- |
| `PUBLIC_SITE_URL`            | `https://bibisaint.com.uy/`                        | `site` en `astro.config.mjs` |
| `PUBLIC_MARTINA_CODE`        | `202605`                                           | API Martina                  |
| `PUBLIC_MARTINA_COUNTRY_ID`  | `598`                                              | API Martina                  |
| `PUBLIC_ENABLE_STOCK_CHECK`  | `true`                                             | Activa botón verificar stock |
| `EMAIL_USER`, `EMAIL_PASS`   | (solo si vas a usar el endpoint `contact.ts`)      | Contact form                 |

## 3. Cloudflare Pages — settings de build

- **Framework preset**: `Astro`
- **Build command**: `pnpm build`
- **Build output directory**: `dist`
- **Root directory**: `code`
- **Node version**: `20`
- **Package manager**: pnpm (ya está en `pnpm-workspace.yaml`)

## 4. Verificación local

```bash
# Build
pnpm build

# Preview con el runtime de Cloudflare (workerd)
pnpm exec wrangler pages dev dist --compatibility-date=2026-06-01
```

Las rutas deberían responder:

- `/bibiSaintWebPage/` → HTML prerenderizado con muchos `<!--server-island-...-->`
- `/bibiSaintWebPage/_server-islands/LivePrice` → 200 con precio + stock

## 5. Hostings alternativos (GitHub Pages)

El sitio sigue compilando como sitio mayormente estático. En GitHub Pages
los Server Islands no se ejecutan: el HTML estático muestra siempre el
contenido del `slot="fallback"` (precio del CSV), lo mismo que se veía
antes de esta migración. No rompe nada — simplemente no hay precios en vivo.

Para volver atrás temporalmente:

1. Cambiar `output: "server"` → `output: "static"`
2. Quitar `adapter: cloudflare(...)` del config
3. Quitar `vite.ssr.external`
4. Borrar `<LivePrice ... server:defer>` de `ProductCarousel.astro` y
   `ItemProductoBox.astro` (o quitar solo el `server:defer` para que
   se inline en el HTML estático con el precio del proveedor obtenido
   en build time).

## 6. Notas operativas

- **Timeout por proveedor**: 6s. Si el proveedor tarda más, el island
  cae al precio CSV silenciosamente.
- **Política Nuvex**: solo se consulta stock en vivo, el precio queda
  con el del CSV (ver `provider-runtime-rules.md`).
- **Cache**: por ahora cada request al island consulta al proveedor.
  Si la carga se vuelve un problema, agregar `Cache-Control` en el
  `Response` del island o usar `Astro.locals.runtime.caches` (KV).
- **GitHub Action de deploy**: el workflow actual a GitHub Pages se
  puede mantener; el adapter Cloudflare convive con el output estático
  (las páginas con `prerender = true` siguen siendo HTML).
