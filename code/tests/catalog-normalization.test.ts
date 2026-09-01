// Unit tests for JavaScript catalog normalization.
// SQL materialization is intentionally left to integration coverage in 6.2.
// Run with: pnpm run test:unit (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import type Product from "../src/types/product.ts";
import {
  getDisplayCategoryName,
  getDisplaySubcategories,
  productMatchesCategory,
  productMatchesSubcategory,
  resolveSubcategoryFilter,
  toTitleCase,
} from "../src/utils/categoryNormalization.ts";

function product(
  id: string,
  name: string,
  category: string,
  subcategories: string[] = [],
  img: string[] = [],
): Product {
  return {
    id,
    name,
    description: "",
    price: "0",
    img,
    categories: {
      name: category,
      count: 0,
      subcategories: subcategories.map((subcategory) => ({ name: subcategory, count: 0 })),
    },
    paymentLink: [],
    relacionados: [],
    enOferta: false,
  };
}

test("toTitleCase: normalizes word casing while preserving accents", () => {
  const cases = [
    { name: "lowercase words", input: "bota de mujer", expected: "Bota De Mujer" },
    { name: "accented words", input: "niña otoño", expected: "Niña Otoño" },
    { name: "repeated spaces", input: "audio  portátil", expected: "Audio Portátil" },
  ];

  for (const testCase of cases) {
    assert.equal(toTitleCase(testCase.input), testCase.expected, testCase.name);
  }
});

test("getDisplayCategoryName: trims and title-cases non-Martina categories", () => {
  const cases = [
    { category: "  calZado  ", expected: "Calzado" },
    { category: "  tecnología ", expected: "Tecnología" },
  ];

  for (const testCase of cases) {
    assert.equal(
      getDisplayCategoryName(product("local-1", "Producto", testCase.category)),
      testCase.expected,
      testCase.category,
    );
  }
});

test("getDisplayCategoryName: Martina gender categories normalize to Ropa", () => {
  const cases = [
    { id: "mdt-mujer", category: " mujer ", image: "", expected: "Ropa" },
    { id: "local-hombre", category: "HOMBRE", image: "https://martinaditrento.com/item.jpg", expected: "Ropa" },
  ];

  for (const testCase of cases) {
    assert.equal(
      getDisplayCategoryName(product(testCase.id, "Calzado", testCase.category, [], testCase.image ? [testCase.image] : [])),
      testCase.expected,
      testCase.id,
    );
  }
});

test("getDisplaySubcategories: Martina prefixes detailed subcategories with gender", () => {
  const cases = [
    {
      name: "removes an existing Mujer prefix",
      product: product("mdt-1", "Vestido", "Mujer", ["Mujer - vestidos", "  zapatos  "]),
      expected: ["Mujer", "Mujer - Vestidos", "Mujer - Zapatos"],
    },
    {
      name: "replaces an existing Hombre prefix",
      product: product("mdt-2", "Bota", "Hombre", ["Hombre - botas"]),
      expected: ["Hombre", "Hombre - Botas"],
    },
  ];

  for (const testCase of cases) {
    assert.deepEqual(getDisplaySubcategories(testCase.product), testCase.expected, testCase.name);
  }
});

test("getDisplaySubcategories: infers representative Tecno subcategories", () => {
  const cases = [
    { name: "Audio", productName: "Aurícular inalámbrico", expected: "Audio" },
    { name: "Cables", productName: "Cable USB tipo C", expected: "Cables Y Conectividad" },
    { name: "Iluminación", productName: "Lámpara LED", expected: "Iluminacion" },
    { name: "fallback", productName: "Organizador de escritorio", expected: "Accesorios" },
  ];

  for (const testCase of cases) {
    assert.deepEqual(
      getDisplaySubcategories(product(`tecno-${testCase.name}`, testCase.productName, "Tecnología")),
      [testCase.expected],
      testCase.name,
    );
  }
});

test("normalization: equivalent inputs produce stable category and subcategory results", () => {
  const first = product("tecno-a", "  AURICULARES  ", " TECNOLOGÍA ");
  const equivalent = product("tecno-b", "auriculares", "tecnología");

  assert.equal(getDisplayCategoryName(first), getDisplayCategoryName(equivalent));
  assert.deepEqual(getDisplaySubcategories(first), getDisplaySubcategories(equivalent));
  assert.deepEqual(getDisplaySubcategories(first), ["Audio"]);
});

test("product matching: public predicates use normalized display values", () => {
  const item = product("mdt-match", "Bota", " mujer ", ["Mujer - botas"]);

  assert.equal(productMatchesCategory(item, "Ropa"), true);
  assert.equal(productMatchesSubcategory(item, "Ropa", "Mujer - Botas"), true);
  assert.equal(productMatchesSubcategory(item, "Calzado", "Mujer - Botas"), false);
});

test("subcategory groups: only Ropa gender parents include exact and prefixed children", () => {
  assert.deepEqual(resolveSubcategoryFilter("Ropa", "Hombre"), {
    kind: "group",
    category: "Ropa",
    value: "Hombre",
  });
  assert.deepEqual(resolveSubcategoryFilter("Ropa", "Hombre - Remeras"), {
    kind: "exact",
    category: "Ropa",
    value: "Hombre - Remeras",
  });
  assert.deepEqual(resolveSubcategoryFilter("Calzado", "Hombre"), {
    kind: "exact",
    category: "Calzado",
    value: "Hombre",
  });

  assert.equal(productMatchesSubcategory(product("parent", "Parent", "Ropa", ["Hombre"]), "Ropa", "Hombre"), true);
  assert.equal(productMatchesSubcategory(product("child", "Child", "Ropa", ["Hombre - Remeras"]), "Ropa", "Hombre"), true);
  assert.equal(productMatchesSubcategory(product("other", "Other", "Ropa", ["Mujer - Remeras"]), "Ropa", "Hombre"), false);
  assert.equal(productMatchesSubcategory(product("concrete", "Concrete", "Ropa", ["Hombre - Remeras"]), "Ropa", "Hombre - Remeras"), true);
});
