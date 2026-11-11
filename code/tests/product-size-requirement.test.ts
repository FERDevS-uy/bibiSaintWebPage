import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getViteConfig } from "astro/config";
import { experimental_AstroContainer } from "astro/container";
import { productRequiresSizeSelection } from "../src/utils/productSizeRequirement.ts";

let closeViteServer: (() => Promise<void>) | undefined;
let renderAddToCartButton:
  | ((product: Record<string, unknown>) => Promise<string>)
  | undefined;

before(async () => {
  const require = createRequire(import.meta.resolve("astro/config"));
  const { createServer } = await import(require.resolve("vite"));
  const config = await getViteConfig(
    {
      server: { middlewareMode: true, hmr: false },
      logLevel: "error",
      cacheDir: join(tmpdir(), "bibi-product-size-requirement-vite"),
      esbuild: { jsx: "automatic" },
      ssr: { external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"] },
    },
    { configFile: false, integrations: [] },
  )({ mode: "test", command: "serve" });
  const server = await createServer(config);
  closeViteServer = () => server.close();
  const { default: Button } = await server.ssrLoadModule(
    "/src/components/AddToCartButton.astro",
  );
  const container = await experimental_AstroContainer.create();
  renderAddToCartButton = (product) =>
    container.renderToString(Button, {
      request: new Request("http://localhost/categories/Ropa"),
      props: { producto: product, variant: "full" },
    });
});

after(async () => {
  await closeViteServer?.();
});

const collarFixture = {
  id: "1040",
  name: "Collar Estrella",
  price: "826",
  img: ["/collar-estrella.webp"],
  description: "",
  categories: {
    name: "Ropa",
    count: 0,
    subcategories: [{ name: "Mujer - Accesorios", count: 0 }],
  },
  colors: [],
};

test("does not require sizes for accessories unless size variants are loaded", () => {
  const sizedAccessory = {
    ...collarFixture,
    colors: [{ id: 1, hex: "#c89532", name: "Dorado", images: [], sizes: ["42"] }],
  };

  assert.equal(productRequiresSizeSelection(collarFixture), false);
  assert.equal(productRequiresSizeSelection(sizedAccessory), true);
});

test("renders an add-to-cart action for the size-less Collar Estrella", async () => {
  const markup = await renderAddToCartButton!(collarFixture);

  assert.match(markup, /AÑADIR AL CARRITO/);
  assert.doesNotMatch(markup, /ELEGIR TALLE/);
});

test("preserves size selection for clothing categories without explicit size variants", () => {
  const clothing = {
    id: "mdt-42633",
    categories: {
      name: "Ropa",
      count: 0,
      subcategories: [{ name: "Mujer - Remeras", count: 0 }],
    },
    colors: [],
  };

  assert.equal(productRequiresSizeSelection(clothing), true);
});
