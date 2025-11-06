// @ts-check
import { defineConfig } from "astro/config";
import icon from "astro-icon";
import react from "@astrojs/react";

const repositoryName = "/bibiSaintWebPage"; // 👈 nombre exacto del repo
const url = `https://ferdevs-uy.github.io${repositoryName}/`;

export default defineConfig({
  site: url,
  base: repositoryName,
  integrations: [icon(), react()],
});
