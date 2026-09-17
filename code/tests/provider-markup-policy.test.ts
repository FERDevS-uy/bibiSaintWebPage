import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  buildEditableMarkupRows,
  isEditableMarkupProvider,
  resolveProviderMarkups,
} from "../src/server/providers/markupPolicy.ts";

const require = createRequire(import.meta.url);
const { alondraApiPrice } =
  require("../../webScrappingTool/src/scrapers/alondra.js") as {
    alondraApiPrice(rawPrice: string | number): string;
  };

test("resolveProviderMarkups: Alondra permanece en 1 aunque la DB tenga un override mayor", () => {
  const markups = resolveProviderMarkups([
    { provider_key: "alondra", markup: 1.8 },
    { provider_key: "nuvex", markup: 1.4 },
  ]);

  assert.equal(markups.alondra, 1);
  assert.equal(markups.nuvex, 1.4);
  assert.equal(markups.kaideco, 1.2);
});

test("buildEditableMarkupRows: rechaza Alondra y permite proveedores soportados", () => {
  assert.deepEqual(buildEditableMarkupRows({ alondra: 1.8 }), {
    error: "Alondra no admite markup: su API ya devuelve precios aumentados",
  });

  assert.deepEqual(buildEditableMarkupRows({ martina: 1.15, nuvex: "1.4" }), {
    rows: [
      { provider_key: "martina", markup: 1.15 },
      { provider_key: "nuvex", markup: 1.4 },
    ],
  });
});

test("isEditableMarkupProvider: estrecha solo proveedores editables", () => {
  assert.equal(isEditableMarkupProvider("nuvex"), true);
  assert.equal(isEditableMarkupProvider("alondra"), false);
  assert.equal(isEditableMarkupProvider(undefined), false);
});

test("alondraApiPrice: no aplica multiplicador extra aunque MARKUP_ALONDRA exista", () => {
  const previous = process.env.MARKUP_ALONDRA;
  try {
    process.env.MARKUP_ALONDRA = "1.8";
    assert.equal(alondraApiPrice("1.000"), "1.000");
  } finally {
    if (previous === undefined) delete process.env.MARKUP_ALONDRA;
    else process.env.MARKUP_ALONDRA = previous;
  }
});
