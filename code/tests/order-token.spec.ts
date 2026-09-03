import assert from "node:assert/strict";
import { test } from "node:test";
import { encryptIDs } from "../src/utils/encription.ts";
import {
  decodeOrderTokenV2,
  decodeOrderTokenV3,
  encodeOrderTokenV2,
  encodeOrderTokenV3,
  isOrderTokenV3,
  MAX_ORDER_TOKEN_LENGTH,
} from "../src/utils/orderToken.ts";

test("order token v2 round-trips variants, colors, prices and Unicode", () => {
  const items = [
    {
      id: "kai-123__M_c7",
      cantidad: 2,
      price: "1.234,50",
      selectedColorId: 7,
      selectedColorName: "Azul ñandú 💙",
    },
    {
      id: "mdt-árbol__XXL_c42",
      cantidad: 1,
      price: "200.50",
      selectedColorId: null,
      selectedColorName: null,
    },
  ];

  const token = encodeOrderTokenV2(items);
  assert.match(token, /^v2_[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeOrderTokenV2(token).items, items);
});

test("order token v2 is materially shorter than the legacy JSON token", () => {
  const items = Array.from({ length: 20 }, (_, index) => ({
    id: `producto-${index}__M_c${index + 1}`,
    cantidad: (index % 3) + 1,
    price: `${100 + index}.50`,
    selectedColorId: index + 1,
    selectedColorName: `Color ${index}`,
  }));

  const compact = encodeOrderTokenV2(items);
  const legacy = encryptIDs(items.map((item) => JSON.stringify(item)), "elias");
  assert.ok(compact.length < legacy.length, `${compact.length} should be shorter than ${legacy.length}`);
  assert.ok(compact.length < 1600, `compact token unexpectedly long: ${compact.length}`);
});

test("order token v2 rejects malformed, unknown-version, truncated and oversized payloads", () => {
  assert.throws(() => decodeOrderTokenV2("v3_AA"), /malformado|compatible/);
  assert.throws(() => decodeOrderTokenV2("v2_%%%"), /malformado/);

  const valid = encodeOrderTokenV2([{ id: "x", cantidad: 1, price: "10", selectedColorId: null, selectedColorName: null }]);
  assert.throws(() => decodeOrderTokenV2(valid.slice(0, -1)), /malformado|incompleto/);
  const overLimit = `v2_${"A".repeat(MAX_ORDER_TOKEN_LENGTH)}`;
  assert.ok(overLimit.length > MAX_ORDER_TOKEN_LENGTH);
  assert.throws(() => decodeOrderTokenV2(overLimit), /malformado/);
  assert.throws(() => encodeOrderTokenV2(Array.from({ length: 101 }, () => ({ id: "x", cantidad: 1, price: "10" }))), /máximo/);
  assert.throws(() => encodeOrderTokenV2([{ id: "x", cantidad: 0, price: "10" }]), /cantidad/);
  assert.throws(() => encodeOrderTokenV2([{ id: "x".repeat(161), cantidad: 1, price: "10" }]), /id/);
  assert.throws(() => encodeOrderTokenV2([{ id: "x", cantidad: 1, price: "10", selectedColorName: "ñ".repeat(129) }]), /color/);
});

test("order token v3 round-trips variants, colors, decimals and Unicode", async () => {
  const items = [
    {
      id: "kai-123__M_c7",
      cantidad: 2,
      price: "1.234,50",
      selectedColorId: 7,
      selectedColorName: "Azul ñandú 💙",
    },
    {
      id: "mdt-árbol__XXL_c42",
      cantidad: 1,
      price: "200.50",
      selectedColorId: null,
      selectedColorName: null,
    },
  ];

  const token = await encodeOrderTokenV3(items);
  assert.match(token, /^v3_[A-Za-z0-9_-]+$/);
  assert.equal(isOrderTokenV3(token), true);
  assert.deepEqual((await decodeOrderTokenV3(token)).items, items);
});

test("order token v3 is significantly shorter for 15 lines and 115 units", async () => {
  const items = Array.from({ length: 15 }, (_, index) => ({
    id: `producto-proveedor-${index}__M_c${(index % 5) + 1}`,
    cantidad: index === 14 ? 10 : index % 2 ? 8 : 7,
    price: "1.234,50",
    selectedColorId: (index % 5) + 1,
    selectedColorName: `Color ${(index % 5) + 1}`,
  }));

  assert.equal(items.reduce((sum, item) => sum + item.cantidad, 0), 115);
  const v2 = encodeOrderTokenV2(items);
  const v3 = await encodeOrderTokenV3(items);
  assert.ok(v3.length < v2.length * 0.5, `${v3.length} should be less than half of ${v2.length}`);
  assert.ok(v3.length < MAX_ORDER_TOKEN_LENGTH);
});

test("order token v3 rejects corrupt, truncated and over-limit tokens safely", async () => {
  const token = await encodeOrderTokenV3([
    { id: "producto", cantidad: 1, price: "10.50", selectedColorId: null, selectedColorName: null },
  ]);

  const corrupt = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  await assert.rejects(() => decodeOrderTokenV3(corrupt), /gzip|malformado|incompleto/);
  await assert.rejects(() => decodeOrderTokenV3(token.slice(0, -1)), /gzip|malformado|incompleto/);

  const overLimit = `v3_${"A".repeat(MAX_ORDER_TOKEN_LENGTH)}`;
  await assert.rejects(() => decodeOrderTokenV3(overLimit), /malformado/);
});
