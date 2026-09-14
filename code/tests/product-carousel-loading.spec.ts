import { test, expect } from "@playwright/test";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

test.describe("ProductCarousel image loading", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/*", (route) =>
      route.request().resourceType() === "image"
        ? route.fulfill({ contentType: "image/png", body: png })
        : route.continue(),
    );
  });
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });

  test("keeps a layout-stable skeleton until load and replaces only real image errors", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(".carousel-container"),
      ).every((container) => container.dataset.carouselInitialized === "true"),
    );
    await expect
      .poll(() =>
        page
          .locator(".carousel-img")
          .first()
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);

    await page
      .locator(".carousel-img-wrapper")
      .first()
      .evaluate((wrapper) => {
        wrapper.setAttribute("data-image-state", "loading");
      });
    await expect(page.locator(".carousel-img-skeleton").first()).toHaveCSS(
      "opacity",
      "1",
    );
    const beforeLoad = await page
      .locator(".carousel-img-wrapper")
      .first()
      .evaluate((wrapper) => {
        const image = wrapper.querySelector("img") as HTMLImageElement;
        return {
          skeletonOpacity: getComputedStyle(
            wrapper.querySelector(".carousel-img-skeleton")!,
          ).opacity,
          imageOpacity: getComputedStyle(image).opacity,
          aspectRatio: getComputedStyle(wrapper.closest(".carousel-img-link")!)
            .aspectRatio,
        };
      });
    expect(beforeLoad).toEqual({
      skeletonOpacity: "1",
      imageOpacity: "1",
      aspectRatio: "1 / 1",
    });

    await page
      .locator(".carousel-img-wrapper")
      .first()
      .evaluate((wrapper) => {
        const image = wrapper.querySelector("img") as HTMLImageElement;
        image.dispatchEvent(new Event("load"));
      });
    await expect(page.locator(".carousel-img-wrapper").first()).toHaveAttribute(
      "data-image-state",
      "loaded",
    );

    let failures = 0;
    await page.route(
      "https://http2.mlstatic.com/carousel-error.jpg",
      (route) => {
        failures++;
        return route.abort("failed");
      },
    );
    await page
      .locator(".carousel-img-wrapper")
      .first()
      .evaluate((wrapper) => {
        wrapper.setAttribute("data-image-state", "loading");
        const image = wrapper.querySelector("img") as HTMLImageElement;
        image.src = "https://http2.mlstatic.com/carousel-error.jpg";
      });
    await expect(page.locator(".carousel-img-wrapper").first()).toHaveAttribute(
      "data-image-state",
      "loaded",
    );
    await expect(page.locator(".carousel-img").first()).toHaveClass(
      /is-fallback/,
    );
    expect(failures).toBe(1);
  });

  test("promotes only the first four images when each carousel nears the viewport", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelectorAll(".carousel-container").length === 3,
    );

    const initial = await page
      .locator(".carousel-container")
      .nth(1)
      .locator(".carousel-img")
      .evaluateAll((images) =>
        images.map((image) => (image as HTMLImageElement).loading),
      );
    expect(initial.slice(0, 4)).toEqual(["lazy", "lazy", "lazy", "lazy"]);

    await page.locator(".carousel-container").nth(1).scrollIntoViewIfNeeded();
    await expect
      .poll(async () =>
        page
          .locator(".carousel-container")
          .nth(1)
          .locator(".carousel-img")
          .evaluateAll((images) =>
            images
              .slice(0, 4)
              .map((image) => (image as HTMLImageElement).loading),
          ),
      )
      .toEqual(["eager", "eager", "eager", "eager"]);

    const afterPromotion = await page
      .locator(".carousel-container")
      .nth(1)
      .locator(".carousel-img")
      .evaluateAll((images) =>
        images.map((image) => (image as HTMLImageElement).loading),
      );
    expect(afterPromotion.slice(4)).toEqual(
      afterPromotion.slice(4).map(() => "lazy"),
    );
  });
});
