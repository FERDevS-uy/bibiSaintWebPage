// @ts-check
import { defineConfig } from "astro/config";
import icon from "astro-icon";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";

// Hosting: Cloudflare Pages (SSR). El sitio sigue siendo mayormente estático
// (cada página opta-in con `export const prerender = true`); solo las
// Server Islands (precios/stock dinámicos, etc.) corren en runtime SSR.
//
// Variable PUBLIC_SITE_URL permite override en CI/preview; el base sigue
// siendo el path actual para no romper enlaces existentes.
const repositoryName = "/bibiSaintWebPage";
const url = process.env.PUBLIC_SITE_URL || `https://ferdevs-uy.github.io${repositoryName}/`;

export default defineConfig({
  site: url,
  base: repositoryName,
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
