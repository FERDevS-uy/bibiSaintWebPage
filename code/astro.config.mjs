// @ts-check
import { defineConfig } from "astro/config";

const repositoryName = "/template-static-ecommerce";
const url = `https://ferdevs-uy.github.io${repositoryName}/`;

// https://astro.build/config
export default defineConfig({
  site: url,
});
