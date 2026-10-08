import { test } from "node:test";
import * as ts from "typescript";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeFeaturedProductIds } from "../src/server/featuredProducts.ts";
import { hasTrustedOrigin } from "../src/server/security/origin.ts";
const endpointSource = readFileSync(new URL("../src/pages/api/admin/featured-products.ts", import.meta.url), "utf8");
import { confirmFeaturedRemoval, requestFeaturedRemoval, toggleFeaturedSelection } from "../src/components/admin/featuredSelection.ts";

const productListSource = readFileSync(new URL("../src/components/admin/ProductList.tsx", import.meta.url), "utf8");

test("featured products PUT requires trusted origin before parsing or initializing the database", () => {
  assert.match(endpointSource, /hasTrustedOrigin/);
  assert.match(endpointSource, /if \(!hasTrustedOrigin\(request\)\) return json\(\{ error: "Origen no autorizado" \}, 403\);/);
  const putBody = endpointSource.slice(endpointSource.indexOf("export const PUT"));
  assert.ok(putBody.indexOf("hasTrustedOrigin(request)") < putBody.indexOf("request.json()"));
  assert.ok(putBody.indexOf("hasTrustedOrigin(request)") < putBody.indexOf("getSupabaseAdmin()"));
  const request = (headers: Record<string, string>) => new Request("https://shop.example/api/admin/featured-products", { headers });
  assert.equal(hasTrustedOrigin(request({ origin: "https://shop.example" })), true);
  assert.equal(hasTrustedOrigin(request({ referer: "https://shop.example/admin" })), true);
  assert.equal(hasTrustedOrigin(request({ origin: "https://attacker.example" })), false);
  assert.equal(hasTrustedOrigin(request({})), false);
});

const compileTsx = (source: string) => ts.transpileModule(source, {
  fileName: "ProductList.tsx",
  reportDiagnostics: true,
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
  },
});

const errorDiagnostics = (diagnostics: readonly ts.Diagnostic[]) => diagnostics.filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]) => ts.formatDiagnosticsWithColorAndContext(
  diagnostics,
  {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => "\n",
  },
);

test("ProductList compiles as TSX and calls the imported removal helper without shadowing", () => {
  assert.match(productListSource, /import \{ confirmFeaturedRemoval as removeConfirmedFeatured,/);
  assert.match(productListSource, /setSelectedFeatured\(\(current\) => removeConfirmedFeatured\(current, pendingFeaturedRemoval\.id\)\)/);
  const errors = errorDiagnostics(compileTsx(productListSource).diagnostics ?? []);
  assert.equal(errors.length, 0, formatDiagnostics(errors));
});

test("TSX compilation reports an error for a missing JSX closing brace", () => {
  const errors = errorDiagnostics(compileTsx("const broken = <div>{value</div>;").diagnostics ?? []);
  assert.ok(errors.length > 0, `expected TypeScript to report the malformed JSX brace:\n${formatDiagnostics(errors)}`);
});

test("featured removal request, cancellation, and confirmation preserve latest selection safely", () => {
  const selected = ["sku-a", "sku-b", "sku-c"];
  const pending = requestFeaturedRemoval(selected, "sku-b");
  assert.deepEqual(selected, ["sku-a", "sku-b", "sku-c"]);
  assert.equal(pending, "sku-b"); // Closing/canceling leaves selection untouched.
  assert.deepEqual(confirmFeaturedRemoval(selected, pending), ["sku-a", "sku-c"]);
  assert.deepEqual(confirmFeaturedRemoval(["sku-a", "sku-c", "sku-d"], pending), ["sku-a", "sku-c", "sku-d"]);
  assert.equal(requestFeaturedRemoval(selected, "missing"), null);
});

test("both removal entry points share confirmation and additions remain immediate with an eight-item cap", () => {
  assert.match(productListSource, /onClick=\{\(\) => requestFeaturedRemoval\(id\)\}/);
  assert.match(productListSource, /onChange=\{\(\) => chosen \? requestFeaturedRemoval\(product\.id\) : toggleFeatured\(product\.id\)\}/);
  assert.deepEqual(toggleFeaturedSelection(["sku-a"], "sku-b"), ["sku-a", "sku-b"]);
  assert.deepEqual(toggleFeaturedSelection(Array.from({ length: 8 }, (_, index) => `sku-${index}`), "sku-x"), Array.from({ length: 8 }, (_, index) => `sku-${index}`));
});

test("featured suggestions use the roomy scrollable result surface with clear item state", () => {
  assert.match(productListSource, /className="featured-panel__results"[\s\S]*?suggestions\.map/);
  assert.doesNotMatch(productListSource, /className="v1-results"/);
  assert.match(productListSource, /featured-panel__results[^{]*\{[^}]*overflow-y:\s*auto/);
  assert.match(productListSource, /aria-label=\{`Seleccionar \$\{product\.name\}`\}/);
});

test("featured product IDs are deduplicated and keep editorial order", () => {
  assert.deepEqual(normalizeFeaturedProductIds(["sku-b", " sku-a ", "sku-b"]), ["sku-b", "sku-a"]);
});

test("featured product IDs reject malformed entries instead of silently persisting a partial selection", () => {
  assert.throws(() => normalizeFeaturedProductIds(["sku-a", 4]));
  assert.throws(() => normalizeFeaturedProductIds(["sku-a", "../unsafe"]));
});

test("featured product ID payload rejects non-arrays and excessive selections", () => {
  assert.throws(() => normalizeFeaturedProductIds("sku-a"));
  assert.throws(() => normalizeFeaturedProductIds(Array.from({ length: 21 }, (_, i) => `sku-${i}`)));
});

test("selected featured products use a full-width responsive grid and compact readable rows", () => {
  assert.match(productListSource, /\.featured-selection-grid[^{]*\{[^}]*grid-template-columns:\s*1fr[^}]*width:\s*100%/);
  assert.match(productListSource, /@container[^{}]*\{[\s\S]*?\.featured-selection-grid[^{}]*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)/);
  assert.match(productListSource, /\.featured-selection-row[^{}]*\{[^}]*min-width:\s*0/);
  assert.match(productListSource, /\.featured-selection-image[^{}]*\{[^}]*44px/);
  assert.match(productListSource, /\.featured-selection-row[^{}]*\{[^}]*grid-template-columns:\s*44px\s+minmax\(0,\s*1fr\)/);
  assert.match(productListSource, /\.featured-selection-name[^{}]*\{[^}]*min-width:\s*0[^}]*font-size:\s*0\.9rem/);
  assert.match(productListSource, /\.featured-selection-control[^{}]*\{[^}]*min-height:\s*3[2-6]px/);
  assert.match(productListSource, /className="featured-selection-grid"[\s\S]*?className="featured-selection-row"[\s\S]*?className="featured-selection-name"/);
});

test("featured suggestions panel uses a collapsed native disclosure and retains content in its body", () => {
  assert.match(productListSource, /<details className="featured-panel__disclosure">[\s\S]*?<summary className="featured-panel__summary">[\s\S]*?<h2 id="featured-v1-title" className="v1-title">Sugerencias de productos destacados<\/h2>/);
  assert.doesNotMatch(productListSource, /<details[^>]*\bopen\b/);
  assert.match(productListSource, /<details className="featured-panel__disclosure">[\s\S]*?<div className="featured-panel__body">[\s\S]*?selectedFeatured\.map/);
  assert.doesNotMatch(productListSource, /featured-panel__body[^{}]*\{[^}]*display:\s*none/);
  assert.match(productListSource, /className="featured-panel__body"[\s\S]*?onClick=\{loadSuggestions\}/);
});

test("saved featured selection UI renders independently of suggestion results", () => {
  assert.match(productListSource, /className="featured-panel__summary"[\s\S]*?Sugerencias de productos destacados[\s\S]*?Elegí hasta 8 productos y ordenalos como querés que aparezcan en la tienda\./);
  assert.match(productListSource, /role="status"[\s\S]*?Cargando selección editorial/);
  assert.match(productListSource, /role="alert"[\s\S]*?featuredErrorStyle/);
  assert.match(productListSource, /featuredSuccess/);
  assert.match(productListSource, /aria-label="Orden de productos destacados"[\s\S]*?Selección actual[\s\S]*?selectedFeatured\.length/);
  assert.match(productListSource, /selectedFeatured\.map[\s\S]*?suggestions\.find[\s\S]*?selectedFeaturedDetails/);
  assert.match(productListSource, /moveFeatured\(index, -1\)[\s\S]*?moveFeatured\(index, 1\)[\s\S]*?requestFeaturedRemoval\(id\)/);
});
