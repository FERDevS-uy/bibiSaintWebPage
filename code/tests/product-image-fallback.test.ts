import assert from "node:assert/strict";
import test from "node:test";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  productImageSrc,
  PRODUCT_IMAGE_FALLBACK,
} from "../src/utils/productImage.ts";

const original =
  "https://pol21.martinaditrento.com/images/products/md/126110_0_1.jpg";

const staticFilenames = [
  "D_681743-MLU94030308302_102025-O.jpg",
  "D_622862-MLU94456963557_102025-O.jpg",
  "D_789921-MLU94457104337_102025-O.jpg",
  "D_951533-MLU94236438586_102025-O.jpg",
  "D_769680-MLU94457054137_102025-O.jpg",
  "D_918463-MLU94021925904_102025-O.jpg",
];

test("productImageSrc uses static copies only for the six exact originals", () => {
  for (const filename of staticFilenames) {
    const source = `https://http2.mlstatic.com/${filename}`;
    const local = `/assets/product-images/${filename}`;
    assert.equal(productImageSrc(source), local);
    assert.equal(productImageSrc(` ${source} `), local);
    assert.equal(productImageSrc(local), local);
    for (const other of [
      `${source}?version=2`,
      source.replace("http2.mlstatic.com", "cdn.example.com"),
      source.replace("-O.jpg", "-F.jpg"),
      source.replace("http2", "HTTP2"),
    ]) {
      assert.equal(productImageSrc(other), new URL(other).href);
    }
  }
  const unrelated = "https://http2.mlstatic.com/category-fixture.jpg";
  assert.equal(productImageSrc(unrelated), unrelated);
});

test("all six static overrides are real, nonblank JPEG assets", async () => {
  const directory = new URL("../public/assets/product-images/", import.meta.url);
  assert.deepEqual((await readdir(directory)).sort(), [...staticFilenames].sort());
  for (const filename of staticFilenames) {
    const image = sharp(fileURLToPath(new URL(filename, directory)));
    const metadata = await image.metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 500);
    assert.equal(metadata.height, filename.startsWith("D_918463-") ? 445 : 500);
    const statistics = await image.stats();
    assert.ok(statistics.channels.some((channel) => channel.stdev > 5));
  }
});

test("productImageSrc returns normalized direct HTTPS and local assets", () => {
  for (const [input, expected] of [
    [original, original],
    [`  ${original}  `, original],
    ["https://cdn.example/a shoe.jpg", "https://cdn.example/a%20shoe.jpg"],
    [
      "https://nuvex.uy/image/catalog/CAMP 4/photo.jpg",
      "https://nuvex.uy/image/catalog/CAMP%204/photo.jpg",
    ],
    ["HTTPS://CDN.EXAMPLE/a.jpg", "https://cdn.example/a.jpg"],
    ["/assets/a shoe.webp", "/assets/a%20shoe.webp"],
    ["/images/shoe.png?v=2", "/images/shoe.png?v=2"],
  ]) {
    assert.equal(productImageSrc(input), expected);
    assert.ok(!productImageSrc(input).startsWith("/api/product-image"));
  }
});

test("productImageSrc rejects invalid and unsafe inputs", () => {
  for (const input of [
    undefined,
    null,
    42,
    {},
    "",
    "  ",
    "http://example.com/shoe.jpg",
    "javascript:alert(1)",
    "data:image/svg+xml,unsafe",
    "//example.com/a.jpg",
    "https://",
    "https://user:password@example.com/a.jpg",
    "https://example.com/a.jpg#fragment",
    "https://example.com/a\n.jpg",
    "/\\example.com/a.jpg",
    "/api/product-image?url=test",
    "/assets/..//example.com/a.jpg",
    "https:////example.com/a.jpg",
  ]) {
    assert.equal(productImageSrc(input), PRODUCT_IMAGE_FALLBACK);
  }
});
