// tests/legacy-telemetry.test.ts
// TDD — Tarea 5.6: telemetría del camino legacy O(n) del catálogo.
// Se ejecutan con: pnpm run test:unit (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recordLegacyFallback,
  getLegacyFallbackCount,
  resetLegacyTelemetry,
} from "../src/server/catalog/legacyTelemetry.ts";

// ---------------------------------------------------------------------------
// Contador
// ---------------------------------------------------------------------------

test("recordLegacyFallback: incrementa el contador por cada ejecución", () => {
  resetLegacyTelemetry();
  assert.equal(getLegacyFallbackCount(), 0);
  recordLegacyFallback({ route: "sidebar", category: "Tecno", reason: "legacy-path" });
  recordLegacyFallback({ route: "header", category: "all", reason: "supabase-empty" });
  recordLegacyFallback({ route: "sidebar", category: "Ropa", reason: "supabase-error" });
  assert.equal(getLegacyFallbackCount(), 3);
});

test("resetLegacyTelemetry: deja el contador en cero", () => {
  recordLegacyFallback({ route: "sidebar", category: "Tecno", reason: "legacy-path" });
  resetLegacyTelemetry();
  assert.equal(getLegacyFallbackCount(), 0);
});

// ---------------------------------------------------------------------------
// Formato del log
// ---------------------------------------------------------------------------

test("log: formato EXACTO [catalog:legacy-fallback] route=... category=... reason=...", () => {
  resetLegacyTelemetry();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => {
    warnings.push(msg);
  };
  try {
    recordLegacyFallback({ route: "sidebar", category: "Tecno", reason: "legacy-path" });
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(warnings, [
    "[catalog:legacy-fallback] route=sidebar category=Tecno reason=legacy-path",
  ]);
});

test("log: propaga route, category y reason para sidebar y header", () => {
  resetLegacyTelemetry();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => {
    warnings.push(msg);
  };
  try {
    recordLegacyFallback({ route: "sidebar", category: "Ropa", reason: "supabase-error" });
    recordLegacyFallback({ route: "header", category: "all", reason: "supabase-empty" });
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(warnings, [
    "[catalog:legacy-fallback] route=sidebar category=Ropa reason=supabase-error",
    "[catalog:legacy-fallback] route=header category=all reason=supabase-empty",
  ]);
  assert.equal(getLegacyFallbackCount(), 2);
});

// ---------------------------------------------------------------------------
// Sin PII
// ---------------------------------------------------------------------------

test("log: nunca incluye IP, email, user-agent ni query strings", () => {
  resetLegacyTelemetry();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => {
    warnings.push(msg);
  };
  try {
    recordLegacyFallback({ route: "header", category: "all", reason: "supabase-empty" });
  } finally {
    console.warn = originalWarn;
  }
  const line = warnings[0] ?? "";
  assert.doesNotMatch(line, /@/); // sin emails
  assert.doesNotMatch(line, /\d{1,3}(\.\d{1,3}){3}/); // sin IPs
  assert.doesNotMatch(line, /user-agent/i);
  assert.doesNotMatch(line, /\?[a-z_]+=/i); // sin query strings de usuario
});

test("log: categoría con control chars/newlines se sanitiza a una sola línea", () => {
  resetLegacyTelemetry();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => {
    warnings.push(msg);
  };
  try {
    recordLegacyFallback({
      route: "sidebar",
      category: "Tecno\nX-Injected: 1",
      reason: "legacy-path",
    });
  } finally {
    console.warn = originalWarn;
  }
  // El newline se neutraliza a espacio: el log queda en UNA línea y el
  // formato key=value se conserva (sin inyección de líneas/logs falsos).
  assert.deepEqual(warnings, [
    "[catalog:legacy-fallback] route=sidebar category=Tecno X-Injected: 1 reason=legacy-path",
  ]);
});

// ---------------------------------------------------------------------------
// Razones válidas
// ---------------------------------------------------------------------------

test("recordLegacyFallback: razón inválida lanza TypeError", () => {
  resetLegacyTelemetry();
  assert.throws(
    () =>
      recordLegacyFallback({
        route: "sidebar",
        category: "Tecno",
        reason: "no-existe" as never,
      }),
    TypeError,
  );
});

test("recordLegacyFallback: un fallo del logger no interrumpe el camino legacy", () => {
  resetLegacyTelemetry();
  const originalWarn = console.warn;
  console.warn = () => {
    throw new Error("logger unavailable");
  };

  try {
    assert.doesNotThrow(() => {
      recordLegacyFallback({
        route: "sidebar",
        category: "Tecno",
        reason: "supabase-error",
      });
    });
    assert.equal(getLegacyFallbackCount(), 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("CSV fallback telemetry records bounded lifecycle events without request data", () => {
  resetLegacyTelemetry();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message: string) => warnings.push(message);
  try {
    recordLegacyFallback({ route: "catalog", category: "all", reason: "csv_fallback_attempt" });
    recordLegacyFallback({ route: "catalog", category: "all", reason: "csv_fallback_success", rowCount: 12 });
    recordLegacyFallback({ route: "catalog", category: "all", reason: "csv_fallback_limit", rowCount: 513 });
    recordLegacyFallback({ route: "catalog", category: "all", reason: "csv_fallback_error" });
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(warnings, [
    "[catalog:legacy-fallback] route=catalog category=all reason=csv_fallback_attempt",
    "[catalog:legacy-fallback] route=catalog category=all reason=csv_fallback_success row_count=12",
    "[catalog:legacy-fallback] route=catalog category=all reason=csv_fallback_limit row_count=513",
    "[catalog:legacy-fallback] route=catalog category=all reason=csv_fallback_error",
  ]);
});
