import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getViteConfig } from "astro/config";
import { experimental_AstroContainer } from "astro/container";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PRODUCT_IMAGE_FALLBACK } from "../src/utils/productImage";

const runtimeSource = readFileSync(
  new URL("../src/components/ProductImageRuntime.astro", import.meta.url),
  "utf8",
);
const cardSource = readFileSync(
  new URL("../src/components/ItemProductoBox.astro", import.meta.url),
  "utf8",
);
let runtimeScript = "";
const runtimeStyle = runtimeSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1];
const cardStyle = cardSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1];
const buttonSource = readFileSync(
  new URL("../src/components/AddToCartButton.astro", import.meta.url),
  "utf8",
);
const buttonStyle = buttonSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1];
let cardMarkup: string[] = [];
let staticMarkup: string[] = [];
const staticFilenames = [
  "D_681743-MLU94030308302_102025-O.jpg",
  "D_622862-MLU94456963557_102025-O.jpg",
  "D_789921-MLU94457104337_102025-O.jpg",
  "D_951533-MLU94236438586_102025-O.jpg",
  "D_769680-MLU94457054137_102025-O.jpg",
  "D_918463-MLU94021925904_102025-O.jpg",
];
const sources = [
  "https://sitios-ecommerce-bkt-alondra.s3.amazonaws.com/category-fixture.jpg",
  "https://http2.mlstatic.com/category-fixture.jpg",
];
const imageFixture = readFileSync(
  new URL(
    "../public/imagenes_catalogo_webp/tal-6-bota-de-gamuza.webp",
    import.meta.url,
  ),
);

test.beforeAll(async () => {
  const require = createRequire(import.meta.resolve("astro/config"));
  const { createServer } = await import(require.resolve("vite"));
  const config = await getViteConfig(
    {
      server: { middlewareMode: true, hmr: false },
      logLevel: "error",
      cacheDir: join(tmpdir(), "bibi-category-image-vite"),
      esbuild: { jsx: "automatic" },
      ssr: { external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"] },
    },
    { configFile: false, integrations: [] },
  )({ mode: "test", command: "serve" });
  const server = await createServer(config);
  try {
    const { default: Card } = await server.ssrLoadModule(
      "/src/components/ItemProductoBox.astro",
    );
    const { default: Runtime } = await server.ssrLoadModule(
      "/src/components/ProductImageRuntime.astro",
    );
    const container = await experimental_AstroContainer.create();
    const runtimeMarkup = await container.renderToString(Runtime);
    runtimeScript = Array.from(
      runtimeMarkup.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g),
      (match) => match[1],
    ).join("\n");
    cardMarkup = await Promise.all(
      sources.map((source, index) =>
        container.renderToString(Card, {
          request: new Request("http://localhost/categories/Cama"),
          props: {
            producto: {
              id: `fixture-${index}`,
              name: `Acolchado ${index}`,
              price: "1290",
              img: [source],
              categories: { name: "Cama", subcategories: [] },
              description: "",
              colors: [],
            },
          },
        }),
      ),
    );
    const { default: Gallery } = await server.ssrLoadModule(
      "/src/components/ProductGallery.jsx",
    );
    staticMarkup = await Promise.all(staticFilenames.map(async (filename, index) => {
      const source = `https://http2.mlstatic.com/${filename}`;
      const card = await container.renderToString(Card, {
        props: {
          producto: {
            id: `static-${index}`, name: `Acolchado ${index}`, price: "1290",
            img: [source], categories: { name: "Cama", subcategories: [] },
            description: "", colors: [],
          },
        },
      });
      const gallery = renderToStaticMarkup(createElement(Gallery, {
        images: [source], name: `Acolchado ${index}`, id: `static-${index}`,
      }));
      return `${card}${gallery}`;
    }));
  } finally {
    await server.close();
  }
});

function fixture(runtimeFirst = true) {
  const script = `<script>${runtimeScript}</script>`;
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><style>${runtimeStyle}${cardStyle}${buttonStyle}</style>${runtimeFirst ? script : ""}</head><body><main style="display:flex;gap:16px">${cardMarkup.join("")}</main></body></html>`;
}

async function openFixture(page: Page, failures: number, runtimeFirst = true) {
  const counts = new Map<string, number>();
  const proxyRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/product-image")) proxyRequests.push(url);
    if (route.request().isNavigationRequest()) {
      return route.fulfill({
        contentType: "text/html",
        body: fixture(runtimeFirst),
      });
    }
    if (sources.includes(url)) {
      const attempt = (counts.get(url) || 0) + 1;
      counts.set(url, attempt);
      if (attempt <= failures) return route.abort("failed");
      return route.fulfill({ contentType: "image/webp", body: imageFixture });
    }
    return route.abort();
  });
  await page.goto("/categories/Cama", { waitUntil: "load" });
  return { counts, proxyRequests };
}

async function expectDecodedImages(page: Page) {
  for (const image of await page.locator(".card-img-link img").all()) {
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
}

test("category cards opt into recovery without proxying their source", () => {
  expect(cardSource).toContain("src={productImageSrc(p.img[0])}");
  expect(cardSource).not.toContain("data-image-retry");
  expect(cardSource).toContain("data-product-image");
});

test("successful category images remain browser-direct", async ({ page }) => {
  const { counts, proxyRequests } = await openFixture(page, 0);
  await expectDecodedImages(page);
  for (const [index, source] of sources.entries()) {
    await expect(page.locator(".card-img-link img").nth(index)).toHaveAttribute(
      "src",
      source,
    );
    expect(counts.get(source)).toBe(1);
  }
  expect(proxyRequests).toEqual([]);
});

test("permanent category failures settle on a local accessible fallback with bounded requests", async ({
  page,
}) => {
  const { counts, proxyRequests } = await openFixture(page, Infinity);
  await expectDecodedImages(page);
  for (const [index, source] of sources.entries()) {
    const image = page.locator(".card-img-link img").nth(index);
    await expect(image).toHaveAttribute("src", PRODUCT_IMAGE_FALLBACK);
    await expect(image).toHaveAttribute("alt", `Acolchado ${index}`);
    await expect(image).toHaveCSS("aspect-ratio", "1 / 1");
    await expect(image).toHaveCSS("object-fit", "contain");
    expect(counts.get(source)).toBe(1);
  }
  await page.clock.install();
  await page.addScriptTag({ content: runtimeScript });
  await page.evaluate(() => {
    document.body.dataset.imageSourceWrites = "0";
    new MutationObserver((mutations) => {
      document.body.dataset.imageSourceWrites = String(
        Number(document.body.dataset.imageSourceWrites) + mutations.length,
      );
    }).observe(document.querySelector("main")!, {
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  });
  await page.evaluate(() => {
    for (let index = 0; index < 3; index++)
      document.dispatchEvent(new Event("astro:page-load"));
    document
      .querySelectorAll("img")
      .forEach((image) => image.dispatchEvent(new Event("error")));
  });
  await page.clock.runFor(1000);
  expect(
    await page.evaluate(() => document.body.dataset.imageSourceWrites),
  ).toBe("0");
  expect([...counts.values()]).toEqual([1, 1]);
  expect(proxyRequests).toEqual([]);
});

test("category images failed before runtime installation recover without hydration", async ({
  page,
}) => {
  const { counts, proxyRequests } = await openFixture(page, 1, false);
  await expect.poll(() => [...counts.values()]).toEqual([1, 1]);
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((images: HTMLImageElement[]) =>
          images.every((image) => image.complete && image.naturalWidth === 0),
        ),
    )
    .toBe(true);
  await page.addScriptTag({
    content: runtimeScript,
  });
  await expectDecodedImages(page);
  expect([...counts.values()]).toEqual([1, 1]);
  expect(proxyRequests).toEqual([]);
});

test("Astro page-load recovers already failed images swapped into the page", async ({
  page,
}) => {
  const { counts, proxyRequests } = await openFixture(page, 0);
  await expectDecodedImages(page);
  await page.route("**/swapped.jpg", (route) => route.abort("failed"));
  await page.evaluate(async () => {
    const image = new Image();
    image.src = "https://http2.mlstatic.com/swapped.jpg";
    await image.decode().catch(() => undefined);
    image.alt = "Acolchado nuevo";
    image.setAttribute("data-product-image", "");
    document.querySelector(".card-img-link")!.replaceChildren(image);
    document.dispatchEvent(new Event("astro:page-load"));
  });
  const image = page.locator(".card-img-link img").first();
  await expect(image).toHaveAttribute("data-fallback-applied", "true");
  await expectDecodedImages(page);
  expect([...counts.values()]).toEqual([1, 1]);
  expect(proxyRequests).toEqual([]);
});

test("navigation after failure does not leave background retries", async ({
  page,
}) => {
  await page.clock.install();
  const { counts, proxyRequests } = await openFixture(page, Infinity);
  await expect(page.locator("img").first()).toHaveAttribute(
    "data-fallback-applied",
    "true",
  );
  await page.evaluate(() => document.querySelector("main")!.replaceChildren());
  await page.clock.runFor(1000);
  expect([...counts.values()]).toEqual([1, 1]);
  expect(proxyRequests).toEqual([]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`six static photos decode in category and detail with mlstatic blocked at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const forbidden: string[] = [];
    const requested = new Set<string>();
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname === "http2.mlstatic.com" || url.pathname === "/api/product-image")
        forbidden.push(request.url());
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (route.request().isNavigationRequest()) return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${runtimeStyle}${cardStyle}${buttonStyle}</style><script>${runtimeScript}</script></head><body>${staticMarkup.join("")}</body></html>`,
      });
      const filename = url.pathname.split("/").pop()!;
      if (url.origin === "http://localhost:4321" && url.pathname === `/assets/product-images/${filename}` && staticFilenames.includes(filename)) {
        requested.add(filename);
        return route.fulfill({
          contentType: "image/jpeg",
          body: readFileSync(new URL(`../public/assets/product-images/${filename}`, import.meta.url)),
        });
      }
      return route.abort("blockedbyclient");
    });
    await page.goto("/categories/Cama", { waitUntil: "load" });
    for (const [index, filename] of staticFilenames.entries()) {
      for (const selector of [".card-img-link img", ".gallery .mainImg"]) {
        const image = page.locator(selector).nth(index);
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveAttribute("src", `/assets/product-images/${filename}`);
        await expect(image).not.toHaveAttribute("data-fallback-applied");
        const decoded = await image.evaluate(async (element: HTMLImageElement) => {
          await element.decode();
          const canvas = document.createElement("canvas");
          canvas.width = element.naturalWidth;
          canvas.height = element.naturalHeight;
          const context = canvas.getContext("2d")!;
          context.drawImage(element, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const colors = new Set<number>();
          for (let offset = 0; offset < pixels.length; offset += 4)
            colors.add((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]);
          return { width: canvas.width, height: canvas.height, colors: colors.size };
        });
        expect(decoded.width).toBe(500);
        expect(decoded.height).toBe(filename.startsWith("D_918463-") ? 445 : 500);
        expect(decoded.colors).toBeGreaterThan(100);
      }
    }
    expect([...requested].sort()).toEqual([...staticFilenames].sort());
    expect(forbidden).toEqual([]);
  });

  for (const state of ["success", "failure"]) {
    test(`category ${state} preserves layout at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await openFixture(page, state === "success" ? 0 : Infinity);
      await expectDecodedImages(page);
      for (const image of await page.locator(".card-img-link img").all()) {
        const box = await image.boundingBox();
        expect(box).not.toBeNull();
        expect(Math.abs(box!.width - box!.height)).toBeLessThan(1);
        await expect(image).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const screenshot = await page.screenshot({
        path: join(tmpdir(), `bibi-category-${state}-${viewport.width}.png`),
      });
      await testInfo.attach(`${state}-${viewport.width}`, {
        body: screenshot,
        contentType: "image/png",
      });
    });
  }
}
