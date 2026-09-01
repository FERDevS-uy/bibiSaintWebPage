import { expect, test } from "@playwright/test";

test("la imagen principal del producto se carga de inmediato", async ({ page }) => {
  await page.goto("/producto/tal-7");

  const image = page.locator(".gallery .mainImg");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("loading", "eager");
  await expect(image).toHaveAttribute("fetchpriority", "high");
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
    .toBe(true);
});
