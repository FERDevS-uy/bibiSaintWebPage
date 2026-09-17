import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMartinaAvailability,
  parseMartinaProducts,
} from "../src/server/providers/martinaAvailability.ts";

const entriesWithSizes = (sizes: string[]) => [
  {
    id: 1,
    variation: {
      id: "tipoVenta",
      variationValues: [
        {
          id: 2,
          variation: {
            id: "color",
            variationValues: [
              {
                id: 1,
                variation: {
                  id: "size",
                  variationValues: sizes.map((description, index) => ({
                    id: index + 1,
                    description,
                  })),
                },
              },
            ],
          },
        },
      ],
    },
  },
];

test("Martina uses selectable raw sizes, not apparel display normalization", () => {
  for (const sizes of [["UNICO"], ["ÚNICO"], ["35", "46"], ["S"]]) {
    assert.equal(
      evaluateMartinaAvailability(entriesWithSizes(sizes)),
      "available",
    );
  }
});

test("Martina valid empty collections, no colors and no selectable sizes are unavailable", () => {
  assert.equal(evaluateMartinaAvailability([]), "unavailable");
  const noColors = entriesWithSizes([]);
  noColors[0].variation.variationValues[0].variation.variationValues = [];
  assert.equal(evaluateMartinaAvailability(noColors), "unavailable");
  assert.equal(
    evaluateMartinaAvailability(entriesWithSizes([])),
    "unavailable",
  );
});

test("Martina malformed entries are unknown, including mixed valid and malformed entries", () => {
  for (const entries of [
    [null],
    [{}],
    [{ variation: {} }],
    [...entriesWithSizes(["S"]), {}],
  ]) {
    assert.equal(evaluateMartinaAvailability(entries), "unknown");
  }
});

test("Martina accepts explicit product arrays but rejects malformed envelopes", () => {
  for (const payload of [[], { data: [] }, { products: [] }, { result: [] }]) {
    assert.deepEqual(parseMartinaProducts(payload), []);
  }
  for (const payload of [
    null,
    {},
    { error: "timeout" },
    { error: "timeout", data: [] },
    { success: false, data: [] },
    { data: {} },
    { arbitrary: [] },
  ]) {
    assert.throws(() => parseMartinaProducts(payload), /inválida/);
  }
});

test("unknown discriminants or missing identities fail closed, including mixed entries", () => {
  for (const level of ["top", "sale", "color", "product-id", "sale-id", "color-id", "size-id"]) {
    const invalid: any = entriesWithSizes(["UNICO"])[0];
    const sale = invalid.variation.variationValues[0];
    const color = sale.variation.variationValues[0];
    if (level === "top") invalid.variation = { id: "unexpected-schema", variationValues: [] };
    if (level === "sale") sale.variation = { id: "unexpected-schema", variationValues: [] };
    if (level === "color") color.variation = { id: "unexpected-schema", variationValues: [] };
    if (level === "product-id") delete invalid.id;
    if (level === "sale-id") delete sale.id;
    if (level === "color-id") delete color.id;
    if (level === "size-id") delete color.variation.variationValues[0].id;
    assert.equal(evaluateMartinaAvailability([invalid]), "unknown", level);
    assert.equal(evaluateMartinaAvailability([...entriesWithSizes(["UNICO"]), invalid]), "unknown", level);
    assert.equal(evaluateMartinaAvailability([invalid, ...entriesWithSizes(["UNICO"])]), "unknown", level);
  }
});
