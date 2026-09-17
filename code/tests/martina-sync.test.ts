import { fixtures, memoryClient } from "./helpers/provider-fixtures.mjs";
import assert from "node:assert/strict";
import { test, beforeEach, mock } from "node:test";

for (const method of ["info", "log", "warn", "error"] as const)
  mock.method(console, method, () => {});

const { syncMartina, fetchMartinaProductById } =
  await import("../src/server/providers/martina.ts");
const {
  generatePreview,
  applyMartinaSync,
  SupabaseProductRepository,
  buildPlan,
  signPreview,
} = await import("../src/server/providers/martinaSync.ts");
const { previewAllProviders, syncAllProviders } =
  await import("../src/server/providers/sync.ts");
const {
  isMartinaManaged,
  verifyAbsentMartinaProducts,
  readActiveMartinaProducts,
  MARTINA_ABSENT_LIMIT,
} = await import("../src/server/providers/martinaReconciliation.ts");
const { parseCampaign } =
  await import("../src/server/providers/martinaCampaign.ts");
const { GET } = await import("../src/pages/api/martina/product-price.ts");

const campaign = () => ({
  data: {
    code: "202609",
    validFrom: "2020-01-01",
    validTill: "2099-01-01",
    countryId: "598",
    audit: { enabled: true },
  },
});
const entry = (id = "1", sizes = ["UNICO"]) => ({
  id,
  name: "Fixture",
  code: "100",
  price: "100",
  images: [],
  variation: {
    id: "tipoVenta",
    variationValues: [
      {
        id: 2,
        variation: {
          id: "color",
          variationValues: [
            {
              id: 10,
              description: "Black",
              variation: {
                id: "size",
                variationValues: sizes.map((description, index) => ({ id: index + 1, description })),
              },
            },
          ],
        },
      },
    ],
  },
});
const existing = (id = "1", extra = {}) => ({
  id: `mdt-${id}`,
  external_id: id,
  name: "Manual title",
  source: "scraper",
  active: true,
  price: "100",
  original_price: null,
  en_oferta: false,
  colors: [],
  auto_update_price: false,
  temporary_price: null,
  description: "Manual description",
  categories: { name: "Ropa", count: 0, subcategories: [] },
  ...extra,
});
let catalog: any[];
let targeted: any[] | Error;
let config: ReturnType<typeof campaign>;
let requests: URL[];

beforeEach(() => {
  process.env.SYNC_PREVIEW_SECRET = "local-fixture-only-not-a-credential";
  process.env.MARTINA_SYNC_APPLY_ENABLED = "true";
  catalog = [entry("2")];
  targeted = [];
  config = campaign();
  requests = [];
  fixtures.client = memoryClient([existing()]);
  fixtures.otherProducts = [];
  fixtures.invalidations = 0;
  fixtures.transport = async (raw: string) => {
    const url = new URL(raw);
    requests.push(url);
    if (url.pathname.endsWith("config")) return structuredClone(config);
    if (url.searchParams.has("productId")) {
      if (targeted instanceof Error) throw targeted;
      return structuredClone(targeted);
    }
    return structuredClone(catalog);
  };
});

test("live endpoint preserves valid empty response and raw size availability", async () => {
  for (const sizes of [null, [], ["UNICO"], ["ÚNICO"], ["35", "46"]]) {
    targeted = sizes === null ? [] : [entry("1", sizes)];
    const response = await GET({
      request: new Request("http://fixture/api?productId=mdt-1"),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).inStock, Boolean(sizes?.length));
  }
});

test("transport, malformed payload and wrong identity never become false stock", async () => {
  for (const value of [new Error("fixture timeout"), [{}], [entry("9")]]) {
    targeted = value;
    await assert.rejects(fetchMartinaProductById("1", "202609"));
    const response = await GET({
      request: new Request("http://fixture/api?productId=1"),
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).inStock, undefined);
  }
});

test("Martina flags supplier Complemento as discrepant with image and applies only the chosen per-item category", async () => {
  const wrongCategory = { name: "Complemento", count: 0, subcategories: [] };
  fixtures.client = memoryClient([existing("1", { categories: wrongCategory })]);
  catalog = [{
    ...entry("1"),
    productLine: { parent: { name: "Complemento" }, name: "Accesorios" },
    images: ["100_10_1.jpg"],
  }];

  const collected = await syncMartina();
  assert.deepEqual(collected.products[0].categories, {
    name: "Ropa",
    count: 0,
    subcategories: [{ name: "Accesorios", count: 0 }],
  });

  // Without a per-item choice the row is flagged discrepant and exposes its
  // photo for the decision; no destination is forced by this path.
  const preview = await generatePreview();
  assert.equal(preview.summary.update, 1);
  assert.equal(preview.plan[0].reason, "Reclasificar categoría");
  assert.equal(preview.plan[0].needsCategoryDecision, true);
  assert.equal(preview.plan[0].image, "https://pol21.martinaditrento.com/images/products/md/100_10_1.jpg");
  assert.deepEqual(fixtures.client.writes, []);

  // The admin picks Ropa for this row: signed into the token, applied after revalidation.
  const chosen = await generatePreview({ "mdt-1": "Ropa" });
  assert.equal((await applyMartinaSync(chosen.token)).ok, true);
  assert.deepEqual(fixtures.client.rows.get("mdt-1").categories, collected.products[0].categories);
  assert.deepEqual(fixtures.client.writes, [{
    type: "update",
    changes: { categories: collected.products[0].categories },
  }]);
});

test("per-item override applies a chosen existing category keeping supplier subcategories", async () => {
  const wrongCategory = { name: "Complemento", count: 0, subcategories: [] };
  fixtures.client = memoryClient([existing("1", { categories: wrongCategory })]);
  catalog = [{
    ...entry("1"),
    productLine: { parent: { name: "Complemento" }, name: "Accesorios" },
    images: ["100_10_1.jpg"],
  }];

  const preview = await generatePreview({ "mdt-1": "Calzado" });
  assert.equal(preview.plan[0].needsCategoryDecision, true);
  assert.equal((await applyMartinaSync(preview.token)).ok, true);
  assert.deepEqual(fixtures.client.rows.get("mdt-1").categories, {
    name: "Calzado",
    count: 0,
    subcategories: [{ name: "Accesorios", count: 0 }],
  });
});

test("tampered per-item override token is rejected before fetch or writes", async () => {
  const wrongCategory = { name: "Complemento", count: 0, subcategories: [] };
  fixtures.client = memoryClient([existing("1", { categories: wrongCategory })]);
  catalog = [{
    ...entry("1"),
    productLine: { parent: { name: "Complemento" }, name: "Accesorios" },
  }];
  const preview = await generatePreview({ "mdt-1": "Ropa" });
  const [body, signature] = preview.token.split(".");
  const tampered = `${body}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  requests = [];
  const result = await applyMartinaSync(tampered);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
  assert.deepEqual(requests, []);
  assert.deepEqual(fixtures.client.writes, []);
  assert.deepEqual(fixtures.client.rows.get("mdt-1").categories, wrongCategory);
});

test("override on a non-discrepant row is rejected without writes", async () => {
  catalog = [entry("1")];
  const base = await generatePreview();
  assert.equal(base.plan.length, 1);
  assert.equal(base.plan[0].action, "unchanged");
  assert.equal(base.plan[0].needsCategoryDecision, false);
  // A signed token carrying an override for an unchanged row: preview
  // generation and apply both fail closed.
  await assert.rejects(generatePreview({ "mdt-1": "Ropa" }), /discrepante/);
  const token = await signPreview({
    exp: base.expiresAt,
    campaignCode: base.campaign.code,
    planHash: base.hash,
    categoryOverrides: { "mdt-1": "Ropa" },
  }, process.env.SYNC_PREVIEW_SECRET!);
  const result = await applyMartinaSync(token);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
  assert.deepEqual(fixtures.client.writes, []);
  assert.deepEqual(fixtures.client.rows.get("mdt-1"), existing());
});

test("plan items carry the first supplier image and null when the supplier exposes none", async () => {
  fixtures.client = memoryClient([]);
  catalog = [{ ...entry("1"), images: ["100_10_1.jpg", "100_10_2.jpg"] }, entry("2")];
  const preview = await generatePreview();
  assert.equal(preview.summary.create, 2);
  const withPhoto = preview.plan.find((item) => item.id === "mdt-1");
  const withoutPhoto = preview.plan.find((item) => item.id === "mdt-2");
  assert.equal(withPhoto?.image, "https://pol21.martinaditrento.com/images/products/md/100_10_1.jpg");
  assert.equal(withoutPhoto?.image, null);
  assert.equal(withPhoto?.needsCategoryDecision, false);
});

test("one campaign snapshot groups distinct IDs and keeps raw selectable sizes", async () => {
  catalog = [entry("1"), entry("2", ["46"])];
  const result = await syncMartina();
  assert.deepEqual(
    result.products.map((product) => product.id),
    ["mdt-1", "mdt-2"],
  );
  assert.deepEqual(result.products[1].colors?.[0].sizes, ["46"]);
  assert.equal(
    requests.filter((url) => url.pathname.endsWith("config")).length,
    1,
  );
  assert.ok(
    requests
      .filter((url) => url.pathname.endsWith("product"))
      .every((url) => url.searchParams.get("code") === "202609"),
  );
});

test("partial collection failure fails preview closed with zero writes", async () => {
  fixtures.transport = async (raw: string) => {
    const url = new URL(raw);
    if (url.pathname.endsWith("config")) return config;
    if (url.searchParams.get("productLineId") === "3324")
      throw new Error("Partial line failure");
    return url.searchParams.has("productLineId") ? [entry("2")] : [];
  };
  await assert.rejects(generatePreview(), /Partial line failure/);
  const general = await previewAllProviders();
  assert.equal(
    general.results.find((result) => result.provider === "Martina")?.status,
    "error",
  );
  assert.equal(fixtures.client.writes.length, 0);
});

test("malformed collection cannot approve missing product deactivation", async () => {
  catalog = [{}];
  await assert.rejects(generatePreview(), /incompleto|inválido/);
  assert.equal(fixtures.client.writes.length, 0);
});

test("bulk rejects ambiguous, errored and paginated envelopes with zero writes", async () => {
  for (const payload of [
    { data: [entry("2")], hasMore: true },
    { products: [entry("2")], pagination: { total: 2, page: 1 } },
    { result: [], next: "page-2" },
    { data: [], total: 1 },
    { data: [], errors: ["upstream failure"] },
    { data: [], status: 503 },
    { data: [], success: "false" },
    { data: [], products: [entry("2")] },
  ]) {
    fixtures.transport = async (raw: string) => new URL(raw).pathname.endsWith("config") ? config : payload;
    await assert.rejects(generatePreview(), /incompleto|inválid/);
    assert.equal((await previewAllProviders()).results[0].status, "error");
    assert.deepEqual(fixtures.client.writes, []);
    assert.deepEqual(fixtures.client.rows.get("mdt-1"), existing());
  }
});

test("bulk accepts a single collection envelope without ambiguous metadata", async () => {
  for (const payload of [
    { data: [entry("2")] },
    { products: [entry("2")], success: true },
    { result: [entry("2")], error: null },
    { result: [entry("2")], error: false },
    { data: [entry("2")], status: "ok" },
    { data: [entry("2")], errors: {} },
  ]) {
    fixtures.transport = async (raw: string) => new URL(raw).pathname.endsWith("config") ? config : payload;
    assert.equal((await syncMartina()).count, 1);
  }
});

test("bulk accepts the recorded successful Martina envelope for each collection key", async () => {
  for (const collectionKey of ["data", "products", "result"]) {
    const payload = { status: "ok", errors: {}, [collectionKey]: [entry("2")] };
    fixtures.transport = async (raw: string) => new URL(raw).pathname.endsWith("config") ? config : payload;
    const result = await syncMartina();
    assert.equal(result.count, 1);
    assert.deepEqual(result.products.map((product) => product.id), ["mdt-2"]);
  }
});

for (const stage of ["bulk", "first-line", "second-line"] as const) {
  test(`${stage} failure rejects previews and signed revalidation without mass deactivation`, async () => {
    const rows = [...Array.from({ length: 25 }, (_, index) => existing(String(index + 100))), existing("2")];
    fixtures.client = memoryClient(rows);
    const present = { ...entry("2"), images: ["100_10_1.jpg"] };
    for (const failure of [
      new Error("Fixture network failure"),
      {},
      [null],
      [present, {}],
      [{ ...present, error: "upstream failure" }],
      [{ ...present, success: false }],
      { data: [present], hasMore: true },
      { data: [present], pagination: { total: 2 } },
      { data: [], error: "upstream failure" },
      { data: [], success: false },
      { status: "failed", errors: {}, data: [present] },
      { status: null, errors: {}, data: [present] },
      { status: 503, errors: {}, data: [present] },
      { status: "ok", errors: { upstream: "failure" }, data: [present] },
      { status: "ok", errors: null, data: [present] },
      { status: "ok", errors: [], data: [present] },
      { status: "ok", errors: ["upstream failure"], data: [present] },
      { status: "ok", errors: "failure", data: [present] },
      { status: "ok", errors: false, data: [present] },
      { status: "ok", errors: {}, data: [present], hasMore: true },
      { status: "ok", errors: {}, data: [present], pagination: { total: 2 } },
      { status: "ok", errors: {}, data: [present], products: [present] },
    ]) {
      fixtures.transport = async (raw: string) => new URL(raw).pathname.endsWith("config") ? config : [present];
      const own = await generatePreview();
      const general = await previewAllProviders();
      assert.equal(own.summary.deactivate, 25);
      assert.equal(general.totalDeactivations, 25);
      fixtures.transport = async (raw: string) => {
        const url = new URL(raw);
        if (url.pathname.endsWith("config")) return config;
        const line = url.searchParams.get("productLineId");
        if (stage !== "bulk" && !line) return [];
        if ((stage === "first-line" && line === "3324") || (stage === "second-line" && line === "3325")) return [present];
        if (failure instanceof Error) throw failure;
        return failure;
      };
      await assert.rejects(generatePreview());
      assert.equal((await previewAllProviders()).results[0].status, "error");
      await assert.rejects(applyMartinaSync(own.token));
      assert.equal((await syncAllProviders(general.token)).results[0].status, "error");
      assert.deepEqual(fixtures.client.writes, []);
      assert.deepEqual([...fixtures.client.rows.values()], rows);
    }
  });
}

for (const flow of ["own", "general"] as const) {
  test(`${flow} rejects tampered signatures before fetch or writes`, async () => {
    const preview = flow === "own" ? await generatePreview() : await previewAllProviders();
    const [body, signature] = preview.token.split(".");
    const tampered = `${body}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    requests = [];
    if (flow === "own") {
      const result = await applyMartinaSync(tampered);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.status, 403);
    } else await assert.rejects(syncAllProviders(tampered), /Firma inválida/);
    assert.deepEqual(requests, []);
    assert.deepEqual(fixtures.client.writes, []);
    assert.deepEqual(fixtures.client.rows.get("mdt-1"), existing());
  });
}

test("own valid signatures cannot bypass campaign or plan hash matching", async () => {
  const preview = await generatePreview();
  for (const mismatch of ["campaign", "hash"]) {
    const token = await signPreview({
      exp: preview.expiresAt,
      campaignCode: mismatch === "campaign" ? "202608" : preview.campaign.code,
      planHash: mismatch === "hash" ? "different-plan" : preview.hash,
    }, process.env.SYNC_PREVIEW_SECRET!);
    const result = await applyMartinaSync(token);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
    assert.deepEqual(fixtures.client.writes, []);
  }
});

test("empty catalog during signed revalidation fails closed in both flows", async () => {
  const own = await generatePreview();
  const general = await previewAllProviders();
  catalog = [];
  await assert.rejects(applyMartinaSync(own.token), /vacío sin evidencia de exhaustividad/);
  assert.equal((await syncAllProviders(general.token)).results[0].status, "error");
  assert.deepEqual(fixtures.client.writes, []);
  assert.deepEqual(fixtures.client.rows.get("mdt-1"), existing());
});

test("own signed preview proposes REINA mdt-40850 deactivation and only confirmed apply writes", async () => {
  const reina = existing("40850", { name: "REINA" });
  fixtures.client = memoryClient([reina, existing("2")]);
  fixtures.transport = async (raw: string) => {
    const url = new URL(raw);
    requests.push(url);
    return url.pathname.endsWith("config") ? config : { status: "ok", errors: {}, data: catalog };
  };
  const preview = await generatePreview();
  assert.equal(preview.summary.deactivate, 1);
  assert.equal(preview.summary.availabilityChanges, 1);
  assert.equal(preview.summary.unknown, 0);
  assert.equal(
    preview.plan.find((item) => item.id === reina.id)?.action,
    "deactivate",
  );
  assert.equal(preview.plan.find((item) => item.id === reina.id)?.availability, "unavailable");
  assert.equal(preview.plan.find((item) => item.id === reina.id)?.reason, "Sin stock: no figura en el catálogo actual");
  assert.equal(fixtures.client.writes.length, 0);
  assert.deepEqual(fixtures.client.rows.get(reina.id), reina);
  const result = await applyMartinaSync(preview.token);
  assert.equal(result.ok, true);
  assert.deepEqual(
    fixtures.client.rows.get(reina.id),
    { ...reina, active: false },
  );
  assert.deepEqual(fixtures.client.writes, [{ type: "update", changes: { active: false } }]);
  assert.equal(requests.filter((url) => url.searchParams.has("productId")).length, 0);
});

test("general signed preview proposes REINA mdt-40850 deactivation and only confirmed apply writes", async () => {
  const reina = existing("40850", { name: "REINA" });
  fixtures.client = memoryClient([reina, existing("2")]);
  fixtures.transport = async (raw: string) => {
    const url = new URL(raw);
    requests.push(url);
    return url.pathname.endsWith("config") ? config : { status: "ok", errors: {}, data: catalog };
  };
  const preview = await previewAllProviders();
  assert.equal(preview.totalDeactivations, 1);
  assert.equal(preview.totalAvailabilityChanges, 1);
  assert.equal(preview.results[0].unknown, 0);
  assert.equal(
    preview.results[0].stockPlan?.find((item) => item.id === reina.id)?.action,
    "deactivate",
  );
  assert.equal(preview.results[0].stockPlan?.find((item) => item.id === reina.id)?.availability, "unavailable");
  assert.equal(preview.results[0].stockPlan?.find((item) => item.id === reina.id)?.reason, "Sin stock: no figura en el catálogo actual");
  assert.equal(fixtures.client.writes.length, 0);
  assert.deepEqual(fixtures.client.rows.get(reina.id), reina);
  const result = await syncAllProviders(preview.token);
  assert.equal(result.totalErrors, 0);
  assert.deepEqual(fixtures.client.rows.get(reina.id), { ...reina, active: false });
  assert.deepEqual(fixtures.client.writes, [{ type: "update", changes: { active: false } }]);
  assert.equal(requests.filter((url) => url.searchParams.has("productId")).length, 0);
  assert.equal(fixtures.invalidations, 1);
});

for (const state of ["available", "unavailable", "unknown"] as const) {
  test(`bulk absence deactivates regardless of hypothetical ${state} detail in both flows`, async () => {
    targeted = state === "available" ? [entry()] : state === "unavailable" ? [] : new Error("Offline fixture");
    const preview = await generatePreview();
    assert.equal(preview.summary.deactivate, 1);
    assert.equal(preview.summary.unknown, 0);
    assert.equal((await applyMartinaSync(preview.token)).ok, true);
    assert.deepEqual(fixtures.client.rows.get("mdt-1"), existing("1", { active: false }));
    fixtures.client = memoryClient([existing()]);
    const general = await previewAllProviders();
    assert.equal(general.totalDeactivations, 1);
    assert.equal((await syncAllProviders(general.token)).totalErrors, 0);
    assert.deepEqual(fixtures.client.rows.get("mdt-1"), existing("1", { active: false }));
    assert.deepEqual(fixtures.client.writes.filter((write) => write.type === "update"), [{ type: "update", changes: { active: false } }]);
    assert.equal(requests.filter((url) => url.searchParams.has("productId")).length, 0);
  });
}

for (const drift of ["campaign", "baseline", "stock", "absence", "new-product-colors"] as const) {
  test(`${drift} drift invalidates both signed confirmations before writes`, async () => {
    if (drift === "stock") catalog = [entry("1"), entry("2")];
    const own = await generatePreview();
    const general = await previewAllProviders();
    if (drift === "campaign") config.data.code = "202610";
    if (drift === "baseline") fixtures.client.rows.get("mdt-1").price = "999";
    if (drift === "stock") catalog = [entry("1", []), entry("2")];
    if (drift === "absence") catalog = [entry("1"), entry("2")];
    if (drift === "new-product-colors") catalog = [entry("2", ["46"])];
    const result = await applyMartinaSync(own.token);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
    const applied = await syncAllProviders(general.token);
    assert.equal(
      applied.results.find((item) => item.provider === "Martina")?.status,
      "error",
    );
    assert.equal(fixtures.client.writes.length, 0);
  });
}

for (const flow of ["own", "general"] as const) {
  for (const present of [true, false]) {
    test(`${flow} confirmation ignores existing color metadata drift when stock is unchanged, present=${present}`, async () => {
      const row = existing("1", { auto_update_price: true });
      fixtures.client = memoryClient([row]);
      catalog = present ? [{ ...entry(), price: "200" }] : [entry("2")];
      targeted = [entry()];
      const preview = flow === "own" ? await generatePreview() : await previewAllProviders();
      const changed = { ...entry("1", ["46"]), price: "200" };
      changed.variation.variationValues[0].variation.variationValues[0].description = "Renamed";
      if (present) catalog = [changed];
      else targeted = [changed];
      const localColors = [{ id: "local", name: "Local color", sizes: ["S"] }];
      fixtures.client.rows.get(row.id).colors = localColors;
      if (flow === "own") assert.equal((await applyMartinaSync(preview.token)).ok, true);
      else assert.equal((await syncAllProviders(preview.token)).totalErrors, 0);
      assert.deepEqual(fixtures.client.rows.get(row.id).colors, localColors);
      assert.equal(fixtures.client.rows.get(row.id).price, present ? "200" : "100");
      assert.ok(fixtures.client.writes.filter((write) => write.type === "update").every((write) => !("colors" in write.changes)));
    });
  }
  test(`${flow} confirmation rejects incoming stock drift before writes`, async () => {
    catalog = [entry("1")];
    const preview = flow === "own" ? await generatePreview() : await previewAllProviders();
    catalog = [entry("1", [])];
    if (flow === "own") {
      const result = await applyMartinaSync(preview.token);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.status, 409);
    } else assert.equal((await syncAllProviders(preview.token)).results[0].status, "error");
    assert.equal(fixtures.client.writes.length, 0);
  });
}

for (const level of ["top", "sale", "color"] as const) {
  test(`unknown ${level} bulk schema fails both previews closed without deactivation`, async () => {
    const invalid = entry();
    const node = level === "top" ? invalid : level === "sale"
      ? invalid.variation.variationValues[0]
      : invalid.variation.variationValues[0].variation.variationValues[0];
    node.variation.id = "unexpected-schema";
    node.variation.variationValues = [];
    for (const entries of [[invalid], [entry(), invalid], [invalid, entry()]]) {
      catalog = entries;
      await assert.rejects(generatePreview(), /incompleto|inválido/);
      assert.equal((await previewAllProviders()).results[0].status, "error");
      assert.deepEqual(fixtures.client.rows.get("mdt-1"), existing());
      assert.deepEqual(fixtures.client.writes, []);
    }
    catalog = [entry("2"), invalid];
    await assert.rejects(generatePreview(), /incompleto|inválido/);
    assert.equal((await previewAllProviders()).results[0].status, "error");
  });
}

test("more than 20 absences propose deactivation without lookups or detail budget calls", async () => {
  const rows = Array.from({ length: MARTINA_ABSENT_LIMIT + 5 }, (_, index) =>
    existing(String(index + 1)),
  );
  let calls = 0;
  let budgetCalls = 0;
  const observations = await verifyAbsentMartinaProducts(
    [],
    new Map(rows.map((row) => [row.id, row])),
    "202609",
    async () => {
      calls++;
      return [];
    },
    () => {
      budgetCalls++;
      return true;
    },
  );
  assert.equal(calls, 0);
  assert.equal(budgetCalls, 0);
  assert.deepEqual([...observations.keys()], rows.map((row) => row.id).sort());
  assert.ok([...observations.values()].every((observation) =>
    observation.availability === "unavailable" && observation.reason === "Sin stock: no figura en el catálogo actual"));
  const plan = await buildPlan(
    [],
    new Map(rows.map((row) => [row.id, row])),
    "202609",
    observations,
  );
  assert.equal(plan.summary.deactivate, rows.length);
  assert.equal(plan.summary.unknown, 0);
  assert.deepEqual(plan.mutations, [...rows].sort((left, right) => left.id.localeCompare(right.id)).map((row) => ({ id: row.id, previous: row, changes: { active: false } })));
});

test("empty bulk and both empty fallback lines cannot establish an exhaustive empty snapshot", async () => {
  const rows = Array.from({ length: 25 }, (_, index) => existing(String(index + 1)));
  fixtures.client = memoryClient(rows);
  catalog = [];
  targeted = [];
  await assert.rejects(syncMartina(), /vacío sin evidencia de exhaustividad/);
  assert.deepEqual(requests.filter((url) => url.searchParams.has("productLineId")).map((url) => url.searchParams.get("productLineId")), ["3325", "3324"]);
  await assert.rejects(generatePreview(), /vacío sin evidencia de exhaustividad/);
  assert.equal((await previewAllProviders()).results[0].status, "error");
  assert.deepEqual([...fixtures.client.rows.values()], rows);
  assert.deepEqual(fixtures.client.writes, []);
  assert.equal(requests.filter((url) => url.searchParams.has("productId")).length, 0);
});

for (const flow of ["own", "general"] as const) {
  test(`${flow} signed preview and apply deactivate more than 20 absences without detail requests`, async () => {
    const rows = Array.from({ length: 25 }, (_, index) => existing(String(index + 1)));
    const present = existing("999");
    fixtures.client = memoryClient([...rows, present]);
    catalog = [entry("999")];
    targeted = [];
    const preview = flow === "own" ? await generatePreview() : await previewAllProviders();
    const summary = "summary" in preview ? preview.summary : preview.results[0];
    const items = "plan" in preview ? preview.plan : preview.results[0].stockPlan!;
    assert.equal(summary.unknown, 0);
    assert.equal(summary.availabilityChanges, rows.length);
    const absents = items.filter((item) => item.id !== present.id);
    assert.equal(absents.length, rows.length);
    assert.ok(absents.every((item) => item.action === "deactivate" && item.reason === "Sin stock: no figura en el catálogo actual"));
    assert.deepEqual(fixtures.client.writes, []);
    targeted = [entry()];
    if (flow === "own") assert.equal((await applyMartinaSync(preview.token)).ok, true);
    else assert.equal((await syncAllProviders(preview.token)).totalErrors, 0);
    assert.deepEqual([...fixtures.client.rows.values()], [...rows.map((row) => ({ ...row, active: false })), present]);
    assert.deepEqual(fixtures.client.writes, rows.map(() => ({ type: "update", changes: { active: false } })));
    assert.equal(requests.filter((url) => url.searchParams.has("productId")).length, 0);
  });
}

for (const incomingCount of [20, 12]) {
  test(`snapshot keeps ${incomingCount} image enrichments without detail lookups for 20 absences in both flows`, async () => {
    const incomingIds = Array.from({ length: incomingCount }, (_, index) => String(index + 100)).sort();
    const absentRows = Array.from({ length: 20 }, (_, index) => existing(String(index + 1)));
    const absentIds = absentRows.map((row) => row.external_id).sort();
    const expectedIds = incomingIds;
    fixtures.transport = async (raw: string) => {
      const url = new URL(raw);
      requests.push(url);
      if (url.pathname.endsWith("config")) return campaign();
      if (url.searchParams.has("productId")) return [];
      if (url.searchParams.get("productLineId") === "3325")
        return incomingIds.toReversed().map((id) => entry(id));
      return [];
    };
    const assertBudget = () => {
      assert.deepEqual(requests.filter((url) => url.searchParams.has("productId")).map((url) => url.searchParams.get("productId")), expectedIds);
    };
    for (const flow of ["own", "general"]) {
      fixtures.client = memoryClient(absentRows);
      requests = [];
      const preview = flow === "own" ? await generatePreview() : await previewAllProviders();
      assertBudget();
      const summary = "summary" in preview ? preview.summary : preview.results[0];
      const items = "plan" in preview ? preview.plan : preview.results[0].stockPlan!;
      assert.equal(summary.unknown, 0);
      assert.equal(summary.availabilityChanges, absentRows.length);
      assert.equal(items.filter((item) => item.action === "deactivate" && item.reason === "Sin stock: no figura en el catálogo actual").length, absentRows.length);
      requests = [];
      if (flow === "own") assert.equal((await applyMartinaSync(preview.token)).ok, true);
      else assert.equal((await syncAllProviders(preview.token)).totalErrors, 0);
      assertBudget();
      for (const id of absentIds)
        assert.deepEqual(fixtures.client.rows.get(`mdt-${id}`), existing(id, { active: false }));
      assert.deepEqual(fixtures.client.writes.filter((write) => write.type === "update"), absentRows.map(() => ({ type: "update", changes: { active: false } })));
    }
  });
}

for (const changePrice of [true, false]) {
  test(`price change ${changePrice} never synchronizes colors or sizes in either flow`, async () => {
    const row = existing("1", { auto_update_price: true });
    catalog = [entry("1", ["46"])];
    catalog[0].price = changePrice ? "200" : "100";
    fixtures.client = memoryClient([row]);
    const own = await generatePreview();
    const general = await previewAllProviders();
    assert.equal(own.summary.update, Number(changePrice));
    assert.equal(own.summary.priceChanges, Number(changePrice));
    assert.equal(own.summary.availabilityChanges, 0);
    assert.equal(general.totalPriceChanges, Number(changePrice));
    assert.equal(general.totalAvailabilityChanges, 0);
    assert.deepEqual(general.results[0].stockPlan, changePrice ? own.plan : []);
    assert.equal(own.plan[0].priceChanged, changePrice);
    assert.equal(own.plan[0].availabilityChanged, false);
    assert.equal(own.plan[0].action, changePrice ? "update" : "unchanged");
    assert.doesNotMatch(own.plan[0].reason, /colores|talles/);
    assert.equal(own.plan[0].reason.includes("precio"), changePrice);
    assert.equal((await applyMartinaSync(own.token)).ok, true);
    assert.equal(fixtures.client.writes.length, Number(changePrice));
    assert.ok(fixtures.client.writes.every((write) => !("colors" in write.changes)));
    const ownRow = structuredClone(fixtures.client.rows.get("mdt-1"));
    fixtures.client = memoryClient([row]);
    assert.equal((await syncAllProviders(general.token)).totalErrors, 0);
    assert.equal(fixtures.client.writes.length, Number(changePrice));
    assert.ok(fixtures.client.writes.every((write) => !("colors" in write.changes)));
    assert.deepEqual(fixtures.client.rows.get("mdt-1"), ownRow);
    assert.equal(ownRow.price, changePrice ? "200" : "100");
    assert.deepEqual(ownRow.colors, row.colors);
  });
}

test("Martina ownership depends only on the numeric local ID", () => {
  for (const source of ["scraper", "manual", null, "other-provider"]) {
    for (const external_id of [null, "outdated-id", "100"]) {
      assert.equal(isMartinaManaged(existing("41650", { source, external_id })), true);
    }
  }
  for (const id of ["41650", "kai-41650", "MDT-41650", "mdt-", "mdt-code", "mdt-41650-extra", "mdt-41.650"]) {
    assert.equal(isMartinaManaged(existing("41650", { id })), false, id);
  }
});

test("absent observations use local IDs without lookups and exclude inactive or invalid IDs", async () => {
  const rows = [
    existing("41650", { source: "manual", external_id: "100" }),
    existing("41651", { source: null, external_id: null }),
    existing("41652", { source: "other-provider", external_id: "outdated-id" }),
    existing("41653", { active: false }),
    existing("41654", { id: "kai-41654" }),
    existing("41655", { id: "mdt-code" }),
    existing("41656"),
  ];
  const calls: string[] = [];
  const observations = await verifyAbsentMartinaProducts(
    [existing("41656")],
    new Map(rows.map((row) => [row.id, row])),
    "202609",
    async (productId, campaignCode) => {
      calls.push(productId);
      assert.equal(campaignCode, "202609");
      return [entry(productId)];
    },
  );
  assert.deepEqual(calls, []);
  assert.deepEqual([...observations.keys()], ["mdt-41650", "mdt-41651", "mdt-41652"]);
  assert.ok([...observations.values()].every((observation) => observation.availability === "unavailable" && observation.reason === "Sin stock: no figura en el catálogo actual"));
});

test("active ownership read is paginated and filters by active and ID, not metadata", async () => {
  const rows = Array.from({ length: 501 }, (_, index) =>
    existing(String(index + 1)),
  );
  const metadataRows = ["scraper", "manual", null, "other-provider"].flatMap((source, sourceIndex) =>
    [null, "outdated-id", "100"].map((external_id, externalIndex) =>
      existing(String(900 + sourceIndex * 3 + externalIndex), { source, external_id }),
    ),
  );
  const client = memoryClient([
    ...rows,
    ...metadataRows,
    existing("950", { active: false }),
    existing("951", { id: "kai-951" }),
    existing("952", { id: "mdt-code" }),
    existing("953", { id: "mdt-953-extra" }),
  ]);
  const conditions: unknown[][] = [];
  const from = client.from.bind(client);
  client.from = (...args) => {
    const query = from(...args);
    for (const method of ["eq", "like"] as const) {
      const original = query[method].bind(query);
      query[method] = (field, value) => {
        conditions.push([method, field, value]);
        return original(field, value);
      };
    }
    return query;
  };
  const result = await readActiveMartinaProducts(client);
  assert.deepEqual([...result.keys()].sort(), [...rows, ...metadataRows].map((row) => row.id).sort());
  assert.deepEqual(conditions, [
    ["eq", "active", true], ["like", "id", "mdt-%"],
    ["eq", "active", true], ["like", "id", "mdt-%"],
  ]);
  assert.deepEqual(client.ranges, [
    [0, 499],
    [500, 999],
  ]);
});

for (const flow of ["own", "general"] as const) {
  for (const state of ["present", "absent-available", "absent-unavailable"] as const) {
    test(`${flow} ${state} reconciles local Martina IDs without rewriting metadata or bypassing protections`, async () => {
      const rows = [
        existing("41650", { name: "JON SHORT", source: "manual", external_id: "100", auto_update_price: true }),
        existing("41651", { source: null, external_id: null }),
        existing("41652", { source: "other-provider", external_id: "outdated-id", auto_update_price: true, temporary_price: "150", price: "150" }),
        existing("41653", { source: "manual", external_id: null, active: false, auto_update_price: true }),
        existing("41654", { id: "kai-41654" }),
        existing("41655", { id: "mdt-code" }),
        existing("999"),
      ];
      fixtures.client = memoryClient(rows);
      catalog = state === "present" ? rows.slice(0, 4).map((row) => ({ ...entry(row.id.slice(4)), price: "200" })).concat(entry("999")) : [entry("999")];
      fixtures.transport = async (raw: string) => {
        const url = new URL(raw);
        requests.push(url);
        if (url.pathname.endsWith("config")) return structuredClone(config);
        const productId = url.searchParams.get("productId");
        if (productId) return state === "absent-unavailable" ? [] : [{ ...entry(productId), price: "200" }];
        return structuredClone(catalog);
      };
      const preview = flow === "own" ? await generatePreview() : await previewAllProviders();
      const summary = "summary" in preview ? preview.summary : preview.results[0];
      assert.equal(summary.unknown, 0);
      assert.equal(summary.priceChanges, Number(state === "present"));
      assert.equal(summary.availabilityChanges, state === "present" ? 0 : 3);
      assert.equal(fixtures.client.writes.length, 0);
      assert.deepEqual([...fixtures.client.rows.values()], rows);
      const expectedLookups: string[] = [];
      const lookupIds = () => requests.filter((url) => url.searchParams.has("productId")).map((url) => url.searchParams.get("productId"));
      assert.deepEqual(lookupIds(), expectedLookups);
      requests = [];
      if (flow === "own") assert.equal((await applyMartinaSync(preview.token)).ok, true);
      else assert.equal((await syncAllProviders(preview.token)).totalErrors, 0);
      assert.deepEqual(lookupIds(), expectedLookups);
      for (const row of rows) {
        const changes = state === "present" && row.id === "mdt-41650" ? { price: "200" }
          : state !== "present" && rows.slice(0, 3).includes(row) ? { active: false } : {};
        assert.deepEqual(fixtures.client.rows.get(row.id), { ...row, ...changes });
      }
      assert.deepEqual(fixtures.client.writes, state === "present" ? [{ type: "update", changes: { price: "200" } }]
        : rows.slice(0, 3).map(() => ({ type: "update", changes: { active: false } })));
    });
  }
}

test("colors and manual fields remain unchanged and inactive policy survives", async () => {
  catalog = [entry("1"), entry("2"), entry("3")];
  fixtures.client = memoryClient([
    existing("1", { temporary_price: "100" }),
    existing("2", { active: false }),
    existing("3", { source: "manual" }),
  ]);
  const preview = await generatePreview();
  assert.equal(preview.summary.update, 0);
  assert.equal(preview.summary.availabilityChanges, 0);
  assert.equal(preview.summary.unknown, 0);
  await applyMartinaSync(preview.token);
  assert.deepEqual(fixtures.client.rows.get("mdt-1").colors, []);
  assert.equal(fixtures.client.writes.length, 0);
  assert.equal(
    fixtures.client.rows.get("mdt-1").description,
    "Manual description",
  );
  assert.equal(fixtures.client.rows.get("mdt-1").temporary_price, "100");
  assert.equal(fixtures.client.rows.get("mdt-2").active, false);
  assert.deepEqual(
    fixtures.client.rows.get("mdt-3"),
    existing("3", { source: "manual" }),
  );
});

test("conditional write refuses an active baseline changed after revalidation", async () => {
  const row = existing();
  const plan = await buildPlan(
    [],
    new Map([[row.id, row]]),
    "202609",
    new Map([[row.id, { availability: "unavailable", reason: "Fixture" }]]),
  );
  fixtures.client.rows.get(row.id).temporary_price = "999";
  assert.deepEqual(
    await new SupabaseProductRepository("Martina").applyMartinaPlan(plan),
    { upserted: 0, errors: 1 },
  );
  assert.equal(fixtures.client.writes.length, 0);
});

test("non-Martina repository retains existing price-only behavior", async () => {
  const row = existing("1");
  const samePrice = { ...row, colors: [{ id: 2 }], name: "Changed" } as any;
  assert.deepEqual(
    await new SupabaseProductRepository("Kai Deco").upsert([samePrice]),
    { upserted: 0, errors: 0 },
  );
  assert.equal(fixtures.client.writes.length, 0);
});

test("campaign parser rejects impossible dates and sync rejects expired campaign", async () => {
  const invalid = campaign();
  invalid.data.validFrom = "2026-02-31";
  assert.throws(() => parseCampaign(invalid));
  config.data.validTill = "2021-01-01";
  await assert.rejects(
    syncMartina(undefined, new Date("2026-09-14")),
    /no vigente/,
  );
});

test("stock client returns unknown on HTTP and network errors without replacing last result", async () => {
  const { fetchMartinaLive } = await import("../src/client/stockService.ts");
  const { getLastMartinaResult } =
    await import("../src/client/martinaVerification.ts");
  const previousFetch = globalThis.fetch;
  (globalThis as any).window = {
    location: { origin: "http://fixture" },
    setTimeout,
    clearTimeout,
  };
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ price: "100", inStock: true, colors: [], sizes: [] }),
      );
    assert.equal((await fetchMartinaLive("mdt-123")).inStock, true);
    for (const failure of [
      async () => new Response("error", { status: 502 }),
      async () => {
        throw new Error("Network fixture");
      },
    ]) {
      globalThis.fetch = failure;
      assert.equal((await fetchMartinaLive("mdt-123")).inStock, null);
      assert.equal(getLastMartinaResult("mdt-123")?.inStock, true);
    }
  } finally {
    globalThis.fetch = previousFetch;
    delete (globalThis as any).window;
  }
});

test("product detail distinguishes unavailable from unknown even with color metadata", async () => {
  const { handleMartina } =
    await import("../src/client/productDetail/liveStock/martina.ts");
  const badge = { textContent: "Existing stock", style: {} };
  const status = { textContent: "", classList: { remove() {}, add() {} } };
  (globalThis as any).document = { getElementById: () => status };
  const context = {
    stockBadge: badge,
    priceEl: { textContent: "100", classList: { remove() {} } },
    state: { availableSizesByColor: new Map(), selectedColorId: null },
  } as any;
  try {
    await handleMartina({ inStock: null } as any, context);
    assert.equal(badge.textContent, "Existing stock");
    assert.match(status.textContent, /No se pudo verificar/);
    await handleMartina(
      { inStock: false, colors: [{ id: 10, sizes: [] }] } as any,
      context,
    );
    assert.equal(badge.textContent, "Sin stock");
  } finally {
    delete (globalThis as any).document;
  }
});

test("own preview endpoint never truncates reviewed deactivations or unknowns", async () => {
  const { POST } =
    await import("../src/pages/api/admin/providers/martina/preview.ts");
  fixtures.client = memoryClient(
    Array.from({ length: 205 }, (_, index) => existing(String(index + 100))),
  );
  const response = await POST({
    request: new Request("http://fixture/preview", { method: "POST" }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.summary.deactivate, 205);
  assert.equal(payload.summary.unknown, 0);
  assert.equal(
    payload.plan.filter((item: any) => item.action === "deactivate").length,
    205,
  );
  assert.ok(payload.plan.filter((item: any) => item.action === "deactivate").every((item: any) => item.reason === "Sin stock: no figura en el catálogo actual"));
  assert.equal(requests.filter((url) => url.searchParams.has("productId")).length, 0);
  assert.equal(payload.truncated, false);
  assert.equal(fixtures.client.writes.length, 0);
});

for (const noColors of [true, false]) {
  test(`no selectable variant deactivates only the product after confirmation in both flows, noColors=${noColors}`, async () => {
    for (const flow of ["own", "general"]) {
      fixtures.client = memoryClient([existing()]);
      catalog = [entry("1", [])];
      if (noColors) catalog[0].variation.variationValues[0].variation.variationValues = [];
      const preview = flow === "own" ? await generatePreview() : await previewAllProviders();
      const summary = "summary" in preview ? preview.summary : preview.results[0];
      assert.equal(summary.availabilityChanges, 1);
      assert.equal(summary.priceChanges, 0);
      const plan = "plan" in preview ? preview.plan : preview.results[0].stockPlan!;
      assert.equal(plan[0].action, "deactivate");
      assert.equal(plan[0].availabilityChanged, true);
      assert.equal(fixtures.client.writes.length, 0);
      assert.equal(fixtures.client.rows.get("mdt-1").active, true);
      assert.equal(requests.filter((url) => url.searchParams.has("productId")).length, 0);
      if (flow === "own") assert.equal((await applyMartinaSync(preview.token)).ok, true);
      else assert.equal((await syncAllProviders(preview.token)).totalErrors, 0);
      assert.deepEqual(fixtures.client.rows.get("mdt-1"), existing("1", { active: false }));
      assert.deepEqual(fixtures.client.writes, [{ type: "update", changes: { active: false } }]);
    }
  });
}

test("sync panel counts stock deactivations once without variant-change copy", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/components/admin/ProvidersPanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\+ syncPreview\.totalAvailabilityChanges/);
  assert.doesNotMatch(source, /colores\/talles/);
  assert.equal(source.match(/syncPreview\.totalNew \+ syncPreview\.totalPriceChanges \+ syncPreview\.totalDeactivations/g)?.length, 3);
  assert.match(source, /bajas por stock/);
});

test("automatic prices update only when enabled and not manually overridden", async () => {
  catalog = [entry("1")];
  catalog[0].price = "200";
  fixtures.client = memoryClient([existing("1", { auto_update_price: true })]);
  const preview = await generatePreview();
  await applyMartinaSync(preview.token);
  assert.equal(fixtures.client.rows.get("mdt-1").price, "200");
  fixtures.client = memoryClient([
    existing("1", {
      auto_update_price: true,
      temporary_price: "150",
      price: "150",
    }),
  ]);
  const manual = await generatePreview();
  await applyMartinaSync(manual.token);
  assert.equal(fixtures.client.rows.get("mdt-1").price, "150");
});

test("signed plan does not depend on absent lookup completion order", async () => {
  const rows = [existing("1"), existing("2")];
  const baseline = new Map(rows.map((row) => [row.id, row]));
  const observations = rows.map(
    (row) =>
      [
        row.id,
        { availability: "unavailable" as const, reason: "Fixture" },
      ] as const,
  );
  const first = await buildPlan([], baseline, "202609", new Map(observations));
  const reversed = await buildPlan(
    [],
    baseline,
    "202609",
    new Map([...observations].reverse()),
  );
  assert.equal(first.hash, reversed.hash);
});
