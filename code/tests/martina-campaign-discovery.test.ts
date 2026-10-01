import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtures } from "./helpers/provider-fixtures.mjs";

const { fetchMartinaConfig } = await import("../src/server/providers/martina.ts");

const ambiguous = { errors: { general: "VARIAS CONFIGURACIONES VIGENTES" }, status: "error" };

test("discovers September after the October config request is ambiguous", async () => {
  const calls: URL[] = [];
  fixtures.transport = async (raw: string) => {
    const url = new URL(raw);
    calls.push(url);
    if (!url.searchParams.has("code")) return ambiguous;
    return { status: "ok", data: { code: "202609", countryId: "598", validFrom: "2026-09-18T00:00:00", validTo: null, audit: { enabled: true } } };
  };
  const result = await fetchMartinaConfig("598", new Date("2026-10-02T12:00:00Z"));
  assert.equal(result.data.code, "202609");
  assert.ok(calls.some((url) => url.searchParams.get("code") === "202610"));
  assert.ok(calls.some((url) => url.searchParams.get("code") === "202609"));
});

test("rejects each unusable candidate response", async () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const invalidCandidates = [
    { status: "error", data: { code: "202609", countryId: "598", validFrom: "2026-09-01", validTo: null, audit: { enabled: true } } },
    { status: "ok", data: { code: "209901", countryId: "598", validFrom: "2026-09-01", validTo: null, audit: { enabled: true } } },
    { status: "ok", data: { code: "202609", countryId: "999", validFrom: "2026-09-01", validTo: null, audit: { enabled: true } } },
    { status: "ok", data: { code: "202609", countryId: "598", validFrom: "2026-09-01", validTo: null, audit: { enabled: false } } },
    { status: "ok", data: { code: "202609", countryId: "598", validFrom: "2026-09-21", validTo: null, audit: { enabled: true } } },
    { status: "ok", data: { code: "202609", countryId: "598", validFrom: "2026-09-01", validTo: "2026-09-19", audit: { enabled: true } } },
    { status: "ok", data: { code: "202609", countryId: "598", validFrom: "2026-02-31", validTo: null, audit: { enabled: true } } },
    { status: "ok", data: { code: "202609", countryId: "598", validFrom: "2026-09-21", validTo: "2026-09-01", audit: { enabled: true } } },
  ];
  for (const invalid of invalidCandidates) {
    fixtures.transport = async (raw: string) => {
      const url = new URL(raw);
      return url.searchParams.has("code") ? invalid : ambiguous;
    };
    await assert.rejects(fetchMartinaConfig("598", now));
  }
});
