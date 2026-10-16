import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("desktop navigation distributes category and main links across its row", () => {
  const source = readFileSync(
    new URL("../src/layouts/Header.astro", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /\.itemsBox \.categoryList\s*\{[^}]*justify-content:\s*space-between/s,
  );
  assert.match(source, /\.itemsBox \.categoryList\s*\{[^}]*gap:\s*0/s);
});

test("footer retains its centered brand, column sizing, spacing, and mobile social alignment", () => {
  const source = readFileSync(
    new URL("../src/layouts/Footer.astro", import.meta.url),
    "utf8",
  );
  assert.match(source, /<p>Bibi's - Donde cada<\/p>\s*<p>elección tiene alma<\/p>/);
  assert.match(source, /\.col1 p\s*\{[^}]*text-align:\s*center/s);
  assert.match(source, /\.col1 p\s*\{[^}]*margin:\s*0/s);
  assert.match(source, /\.col1 p\s*\{[^}]*transform:\s*translateX\(12px\)/s);
  assert.match(source, /\.col1\s*\{[^}]*align-items:\s*center/s);
  assert.match(source, /\.footerContainer\.desktop\s*\{[^}]*width:\s*calc\(100% - 2rem\)/s);
  assert.match(source, /\.footerContainer\.desktop\s*\{[^}]*max-width:\s*1130px/s);
  assert.match(source, /\.footerContainer\.desktop\s*\{[^}]*grid-template-columns:\s*1\.35fr 0\.8fr 1fr 1fr/s);
  assert.match(source, /\.payments-list\s*\{[^}]*gap:\s*0\.8rem/s);
  assert.match(source, /\.col3\s*\{[^}]*padding-left:\s*0\.5rem/s);
  assert.match(source, /\.col4\s*\{[^}]*gap:\s*0\.5rem/s);
  assert.match(source, /\.col4\s*\{[^}]*padding-left:\s*clamp\(0\.5rem, 1\.5vw, 1rem\)/s);
  assert.match(
    source,
    /\.footerContainer\.mobile \.social_medias\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*space-between/s,
  );
});
