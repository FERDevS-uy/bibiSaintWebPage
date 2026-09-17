import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { LookupOptions } from "node:dns";

const source = ts.createSourceFile(
  "utils.ts",
  readFileSync(new URL("../src/server/providers/utils.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const transportNames = new Set([
  "martinaFetch",
  "MARTINA_HOST",
  "MARTINA_HEADERS",
]);
const transportSource = source.statements
  .filter((statement) =>
    ts.isFunctionDeclaration(statement)
      ? transportNames.has(statement.name?.text ?? "")
      : ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            transportNames.has(declaration.name.text),
        ),
  )
  .map((statement) => statement.getText(source))
  .join("\n");
const compiled = ts.transpileModule(transportSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

type LookupResult = string | Array<{ address: string; family: number }>;
type LookupCallback = (
  error: Error | null,
  result?: LookupResult,
  family?: number,
) => void;
type TransportOptions = {
  lookup?: (hostname: string, options: LookupOptions, callback: LookupCallback) => void;
  rejectUnauthorized?: boolean;
};

async function captureTransport({
  dev = true,
  node = true,
  url = "https://pol21.martinaditrento.com/catalog",
  resolveError = null as Error | null,
  addresses = ["192.0.2.10", "192.0.2.11"],
  fallback = (_hostname: string, _options: LookupOptions, _callback: LookupCallback) => {
    assert.fail("Unexpected DNS lookup fallback");
  },
} = {}) {
  let options: TransportOptions | undefined;
  const resolvedHosts: string[] = [];
  const fetchedUrls: string[] = [];
  const exports: { martinaFetch?: (url: string) => Promise<unknown> } = {};
  const dns = {
    resolve(hostname: string, callback: (error: Error | null, addresses: string[]) => void) {
      resolvedHosts.push(hostname);
      callback(resolveError, addresses);
    },
    lookup: fallback,
  };
  const https = {
    get(_url: string, requestOptions: TransportOptions, callback: (response: EventEmitter) => void) {
      options = requestOptions;
      const request = new EventEmitter();
      queueMicrotask(() => {
        const response = Object.assign(new EventEmitter(), { statusCode: 200 });
        callback(response);
        response.emit("data", Buffer.from('{"ok":true}'));
        response.emit("end");
      });
      return request;
    },
  };
  runInNewContext(compiled, {
    exports,
    isNode: node,
    isDevRuntime: dev,
    URL,
    Buffer,
    fetchJson: async (requestedUrl: string) => {
      fetchedUrls.push(requestedUrl);
      return { ok: true };
    },
    require(specifier: string) {
      if (specifier === "node:dns") return dns;
      if (specifier === "node:https") return https;
      assert.fail(`Unexpected import: ${specifier}`);
    },
  });
  assert.equal(typeof exports.martinaFetch, "function");
  assert.equal((await exports.martinaFetch!(url) as { ok: boolean }).ok, true);
  return { options, resolvedHosts, fetchedUrls };
}

test("Martina lookup returns address records for all=true", async () => {
  const { options, resolvedHosts } = await captureTransport();
  assert.equal(typeof options?.lookup, "function");
  assert.equal(options?.rejectUnauthorized, false);
  let calls = 0;
  options!.lookup!("pol21.martinaditrento.com", { all: true }, (...args) => {
    calls++;
    assert.equal(args.length, 2);
    assert.deepEqual(structuredClone(args), [null, [
      { address: "192.0.2.10", family: 4 },
      { address: "192.0.2.11", family: 4 },
    ]]);
  });
  assert.equal(calls, 1);
  assert.deepEqual(resolvedHosts, ["pol21.martinaditrento.com"]);
});

for (const lookupOptions of [{ all: false }, {}]) {
  test(`Martina lookup returns one address for ${JSON.stringify(lookupOptions)}`, async () => {
    const { options } = await captureTransport();
    let calls = 0;
    options!.lookup!("pol21.martinaditrento.com", lookupOptions, (...args) => {
      calls++;
      assert.deepEqual(args, [null, "192.0.2.10", 4]);
    });
    assert.equal(calls, 1);
  });
}

for (const resolveError of [new Error("DNS resolution failed"), null]) {
  for (const all of [true, false]) {
    test(`Martina DNS fallback preserves options and callback: error=${!!resolveError}, all=${all}`, async () => {
      const lookupOptions: LookupOptions = { all, family: 0, hints: 32, verbatim: true };
      const fallbackError = new Error("Fallback failed");
      const callback: LookupCallback = (error) => assert.equal(error, fallbackError);
      let calls = 0;
      const { options } = await captureTransport({
        resolveError,
        addresses: [],
        fallback(hostname, receivedOptions, receivedCallback) {
          calls++;
          assert.equal(hostname, "pol21.martinaditrento.com");
          assert.equal(receivedOptions, lookupOptions);
          assert.equal(receivedCallback, callback);
          receivedCallback(fallbackError);
        },
      });
      options!.lookup!("pol21.martinaditrento.com", lookupOptions, callback);
      assert.equal(calls, 1);
    });
  }
}

for (const settings of [
  { dev: false },
  { url: "https://other.example/catalog" },
  { url: "https://pol21.martinaditrento.com.other.example/catalog" },
]) {
  test(`Martina workaround remains host/dev scoped: ${JSON.stringify(settings)}`, async () => {
    const { options, resolvedHosts } = await captureTransport(settings);
    assert.ok(options);
    assert.equal(Object.hasOwn(options, "lookup"), false);
    assert.equal(options.rejectUnauthorized, undefined);
    assert.deepEqual(resolvedHosts, []);
  });
}

test("Martina non-Node runtime retains the fetch path", async () => {
  const { options, resolvedHosts, fetchedUrls } = await captureTransport({ node: false });
  assert.equal(options, undefined);
  assert.deepEqual(resolvedHosts, []);
  assert.deepEqual(fetchedUrls, ["https://pol21.martinaditrento.com/catalog"]);
});