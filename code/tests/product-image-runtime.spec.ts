import { test, expect } from "@playwright/test";

const productPath = "/producto/alo-68b1e991b8dd439aaddfb304";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

let proxyRequests: string[];
test.beforeEach(async ({ page }) => {
  proxyRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/product-image")
      proxyRequests.push(request.url());
  });
  await page.route("**/*", (route) =>
    route.request().resourceType() === "image"
      ? route.fulfill({ contentType: "image/png", body: png })
      : route.fallback(),
  );
});

test.afterEach(() => {
  expect(proxyRequests).toEqual([]);
});

test("SSR detail handles real image failure while all hydration scripts are blocked", async ({
  page,
}) => {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") return route.abort();
    if (
      route.request().resourceType() === "image" &&
      !route.request().url().startsWith("data:")
    )
      return route.fulfill({ status: 502, body: "Image unavailable" });
    return route.continue();
  });
  await page.goto(productPath, { waitUntil: "domcontentloaded" });
  const image = page.locator(".gallery .mainImg");
  await expect(image).toHaveAttribute("data-fallback-applied", "true");
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(image).toHaveAttribute("src", /^data:image\/svg/);
  await expect(page.locator(".gallery")).not.toContainText(
    "producto no esta disponible",
  );
});

for (const { path, selector } of [
  { path: "/", selector: ".carousel-img" },
  { path: "/categories/Cama", selector: ".card-img-link img" },
  { path: productPath, selector: ".gallery .mainImg" },
]) {
  test(`photos remain visible without JavaScript on ${path}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/product-image")
        proxyRequests.push(request.url());
    });
    await page.route("**/*", (route) =>
      route.request().resourceType() === "image"
        ? route.fulfill({ status: 200, contentType: "image/png", body: png })
        : route.continue(),
    );
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const image = page.locator(selector).first();
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await expect(image).toHaveCSS("opacity", "1");
    await expect(image).toBeVisible();
    await context.close();
  });
}

test("home and category-to-detail navigation never request the image proxy", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".carousel-img").first()).toBeVisible();
  await page.goto("/categories/Cama", { waitUntil: "domcontentloaded" });
  await page.locator(".card-img-link").first().click();
  await expect(page).toHaveURL(/\/producto\//);
  const image = page.locator(".gallery .mainImg");
  await expect
    .poll(() =>
      image.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(image).not.toHaveAttribute("data-fallback-applied");
});

test("React observes a settled SSR failure and recovers after an image-set change", async ({
  page,
}) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await scriptsReady;
    if (route.request().resourceType() === "image") {
      if (route.request().url().includes("126110_0_1.jpg"))
        return route.abort("failed");
      return route.fulfill({ contentType: "image/png", body: png });
    }
    return route.continue();
  });
  try {
    await page.goto("/producto/mdt-42302", { waitUntil: "commit" });
    const image = page.locator(".gallery .mainImg");
    const island = page
      .locator("astro-island")
      .filter({ has: page.locator(".gallery") });
    await expect(image).toHaveAttribute("data-fallback-applied", "true");
    await expect(image).toHaveAttribute("src", /^data:image\/svg/);
    await expect(island).toHaveAttribute("ssr", "");
    releaseScripts();
    await expect(island).not.toHaveAttribute("ssr");
    await expect(page.locator(".gallery-unavailable")).toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("product:image-set", {
          detail: { images: ["https://http2.mlstatic.com/new-source.jpg"] },
        }),
      ),
    );
    await expect(image).toHaveAttribute(
      "src",
      "https://http2.mlstatic.com/new-source.jpg",
    );
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBe(1);
    await expect(image).not.toHaveAttribute("data-fallback-applied");
  } finally {
    releaseScripts();
  }
});

test("hydrated gallery advances past an error and resets correctly for a color image set", async ({
  page,
}) => {
  await page.route("https://http2.mlstatic.com/broken.jpg", (route) =>
    route.fulfill({ status: 502, body: "unavailable" }),
  );
  await page.goto(productPath, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() =>
      page.locator(".gallery").evaluate((gallery) => {
        const island = gallery.closest("astro-island");
        return Boolean(island && !island.hasAttribute("ssr"));
      }),
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("product:image-set", {
        detail: {
          images: [
            "https://http2.mlstatic.com/broken.jpg",
            "https://http2.mlstatic.com/working.jpg",
          ],
        },
      }),
    ),
  );
  await expect(page.locator(".gallery .mainImg")).toHaveAttribute(
    "src",
    /working.jpg/,
  );
  await expect
    .poll(() =>
      page
        .locator(".gallery .mainImg")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("product:image-set", {
        detail: { images: ["https://http2.mlstatic.com/new-color.jpg"] },
      }),
    ),
  );
  await expect(page.locator(".gallery .mainImg")).toHaveAttribute(
    "src",
    /new-color.jpg/,
  );
  await expect(page.locator(".gallery .mainImg")).not.toHaveAttribute(
    "data-fallback-applied",
    "true",
  );
});

test("an original loaded before hydration stays usable after React takes over", async ({
  page,
}) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await scriptsReady;
    if (route.request().resourceType() === "image") {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: png,
      });
    }
    return route.continue();
  });
  try {
    await page.goto("/producto/mdt-42302", { waitUntil: "commit" });
    const image = page.locator(".gallery .mainImg");
    await expect(image).not.toHaveAttribute("data-original-attempted");
    await expect(image).toHaveAttribute(
      "src",
      "https://pol21.martinaditrento.com/images/products/md/126110_0_1.jpg",
    );
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1);
    await expect(
      page.locator("astro-island").filter({ has: image }),
    ).toHaveAttribute("ssr", "");
    releaseScripts();
    await expect(
      page.locator("astro-island").filter({ has: image }),
    ).not.toHaveAttribute("ssr");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(image).not.toHaveAttribute("data-fallback-applied");
    await expect(image).toHaveAttribute(
      "src",
      /^https:\/\/pol21\.martinaditrento\.com\//,
    );
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1);
  } finally {
    releaseScripts();
  }
});

test("hydrated gallery reports a direct failure without retrying and recovers on a new source", async ({
  page,
}) => {
  const attempts: string[] = [];
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "image") {
      const url = route.request().url();
      if (url.includes("retry-failure.jpg")) {
        attempts.push(url);
        return route.fulfill({ status: 502, body: "unavailable" });
      }
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: png,
      });
    }
    return route.continue();
  });
  await page.goto(productPath, { waitUntil: "domcontentloaded" });
  await expect(
    page.locator("astro-island").filter({ has: page.locator(".gallery") }),
  ).not.toHaveAttribute("ssr");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  for (const filename of [
    "retry-success.jpg",
    "retry-failure.jpg",
    "new-color.jpg",
  ]) {
    await page.evaluate(
      (filename) =>
        window.dispatchEvent(
          new CustomEvent("product:image-set", {
            detail: { images: [`https://http2.mlstatic.com/${filename}`] },
          }),
        ),
      filename,
    );
    if (filename === "retry-failure.jpg") {
      await expect(page.locator(".gallery-unavailable")).toBeVisible();
      expect(attempts).toEqual([
        "https://http2.mlstatic.com/retry-failure.jpg",
      ]);
    } else {
      const image = page.locator(".gallery .mainImg");
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBe(1);
      await expect(image).not.toHaveAttribute("data-fallback-applied");
      if (filename === "retry-success.jpg")
        await expect(image).toHaveAttribute(
          "src",
          "https://http2.mlstatic.com/retry-success.jpg",
        );
      else await expect(image).not.toHaveAttribute("data-original-attempted");
    }
  }
  expect(attempts).toHaveLength(1);
  await expect(page.locator(".gallery")).not.toContainText(
    "producto no esta disponible",
  );
});
