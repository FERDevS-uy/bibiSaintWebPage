// @ts-check
import { defineConfig } from "astro/config";

const repositoryName = "/template-static-ecommerce";
const configData = {
  site: `https://ferdevs-uy.github.io${repositoryName}/`,
  base: repositoryName,
};
const config = { ...configData, pageTitle: "Static Ecommerce title" };
export { config };

// https://astro.build/config
export default defineConfig(configData);
