import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: /category-image-runtime\.spec\.ts$/,
  webServer: undefined,
});