import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(testDir, "../../.github/workflows/cloudflare-deploy.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

function stepBlock(stepName: string): string {
  const start = workflow.indexOf(`      - name: ${stepName}`);
  assert.notEqual(start, -1, `workflow step not found: ${stepName}`);

  const nextStep = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, nextStep === -1 ? workflow.length : nextStep);
}

for (const stepName of [
  "Build and deploy development Worker",
  "Build and deploy to Cloudflare Workers",
]) {
  test(`${stepName} receives server-side Supabase credentials during the build`, () => {
    const block = stepBlock(stepName);

    assert.match(block, /SUPABASE_URL:\s*\$\{\{\s*secrets\.PUBLIC_SUPABASE_URL\s*\}\}/);
    assert.match(block, /SUPABASE_ANON_KEY:\s*\$\{\{\s*secrets\.PUBLIC_SUPABASE_ANON_KEY\s*\}\}/);
  });
}
