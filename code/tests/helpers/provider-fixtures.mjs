import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const fixtures = {
  transport: async () => {
    throw new Error("Unconfigured fixture request");
  },
  client: null,
  otherProducts: [],
  invalidations: 0,
};
globalThis.__providerFixtures = fixtures;
globalThis.fetch = async () => {
  throw new Error("External fetch blocked in fixtures");
};

const root = new URL("../../src/", import.meta.url);
const overrides = {
  "server/supabase.ts":
    "export const getSupabaseAdmin = () => globalThis.__providerFixtures.client; export const getSupabase = getSupabaseAdmin;",
  "server/products.ts":
    "export const invalidateAllProductCaches = () => { globalThis.__providerFixtures.invalidations++; };",
  "server/catalog/edgeCache.ts":
    "export const bumpCatalogVersion = async () => {};",
  "server/providers/kaideco.ts":
    "export const syncKaiDeco = async () => ({products:globalThis.__providerFixtures.otherProducts,count:globalThis.__providerFixtures.otherProducts.length});",
  "server/providers/alondra.ts":
    "export const syncAlondra = async () => ({products:[],count:0});",
  "server/auth.ts": "export const verifyAdmin = async () => true;",
  "server/security/origin.ts": "export const hasTrustedOrigin = () => true;",
  "client/productDetail/liveStock/providerUtils.ts":
    "export const getRuntimeMarkup = async () => ({martina:1}); export const applyMarkupToPrice = value => value;",
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const alias = specifier.startsWith("@server/")
      ? specifier.replace("@server/", "server/")
      : specifier.startsWith("@utils/")
        ? specifier.replace("@utils/", "utils/")
        : null;
    if (
      alias ||
      (specifier.startsWith(".") && context.parentURL?.startsWith(root.href))
    ) {
      const url = new URL(alias ?? specifier, alias ? root : context.parentURL);
      const candidates = [
        url.href,
        `${url.href}.ts`,
        url.href.replace(/\.js$/, ".ts"),
      ];
      for (const candidate of candidates) {
        if (existsSync(new URL(candidate)))
          return { url: candidate, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(root.href) || !url.endsWith(".ts"))
      return nextLoad(url, context);
    const relative = url.slice(root.href.length);
    let source = overrides[relative] ?? readFileSync(new URL(url), "utf8");
    if (relative === "server/providers/utils.ts") {
      source = source
        .replace(
          "export async function martinaFetch(",
          "async function unusedTransport(",
        )
        .replace("export function delay(", "function unusedDelay(");
      source +=
        "\nexport const martinaFetch = (...args) => globalThis.__providerFixtures.transport(...args); export const delay = async () => {};";
    }
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(source, {
        fileName: fileURLToPath(url),
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText,
    };
  },
});

export function memoryClient(initial = []) {
  const rows = new Map(initial.map((row) => [row.id, structuredClone(row)]));
  const writes = [];
  const ranges = [];
  return {
    rows,
    writes,
    ranges,
    from() {
      const predicates = [];
      let range;
      let operation;
      const chain = {
        select() {
          return chain;
        },
        eq(field, value) {
          predicates.push((row) =>
            typeof row[field] === "object" && row[field] !== null
              ? JSON.stringify(row[field]) === value
              : row[field] === value,
          );
          return chain;
        },
        is(field, value) {
          predicates.push((row) => (row[field] ?? null) === value);
          return chain;
        },
        in(field, values) {
          predicates.push((row) => values.includes(row[field]));
          return chain;
        },
        like(field, pattern) {
          predicates.push((row) =>
            row[field]?.startsWith(pattern.replace(/%$/, "")),
          );
          return chain;
        },
        order() {
          return chain;
        },
        range(start, end) {
          ranges.push([start, end]);
          range = [start, end];
          return chain;
        },
        update(changes) {
          operation = { type: "update", changes };
          return chain;
        },
        insert(changes) {
          operation = { type: "insert", changes };
          return chain;
        },
        upsert(changes) {
          operation = { type: "upsert", changes };
          return chain;
        },
        then(resolve, reject) {
          try {
            let selected = [...rows.values()]
              .sort((left, right) => left.id.localeCompare(right.id))
              .filter((row) => predicates.every((predicate) => predicate(row)));
            if (range) selected = selected.slice(range[0], range[1] + 1);
            if (operation?.type === "update") {
              for (const row of selected)
                rows.set(row.id, { ...row, ...operation.changes });
              if (selected.length) writes.push(operation);
            } else if (operation) {
              const incoming = Array.isArray(operation.changes)
                ? operation.changes
                : [operation.changes];
              if (
                operation.type === "insert" &&
                incoming.some((row) => rows.has(row.id))
              )
                return resolve({ data: null, error: { message: "Duplicate" } });
              for (const row of incoming)
                rows.set(row.id, { ...rows.get(row.id), ...row });
              selected = incoming;
              writes.push(operation);
            }
            return resolve({ data: structuredClone(selected), error: null });
          } catch (error) {
            return reject(error);
          }
        },
      };
      return chain;
    },
  };
}
