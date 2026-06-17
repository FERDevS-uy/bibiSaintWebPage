// @ts-check
import { defineConfig } from "astro/config";
import icon from "astro-icon";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";

// Hosting: Cloudflare Workers (SSR + Static Assets). El sitio es mayormente
// estático (cada página opta-in con `export const prerender = true`); solo las
// Server Islands (precios/stock dinámicos, etc.) corren en runtime SSR.
//
// PUBLIC_SITE_URL permite override desde el entorno de Cloudflare. En CF el
// sitio queda en la raíz del worker (sin prefijo de path).
const url = process.env.PUBLIC_SITE_URL || "https://bibisaintwebpage.pages.dev/";

export default defineConfig({
  site: url,
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
  }),
  integrations: [icon(), react()],
  vite: {
    ssr: {
      // Evitar que paquetes pensados para Node arruinen el bundle de Workers.
      external: ["nodemailer"],
    },
  },
});
