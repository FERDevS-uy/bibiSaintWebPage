import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const guard = path.resolve(
  testDirectory,
  "../scripts/ensure-deploy-branch.mjs",
);

function runGuard(target: string, branch: string) {
  return spawnSync(process.execPath, [guard, target], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_REF_NAME: branch },
  });
}

test("deploy branch guard permits development deployment only from dev", () => {
  const permitted = runGuard("development", "dev");
  assert.equal(permitted.status, 0, permitted.stderr);

  const rejected = runGuard("development", "main");
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Allowed branch: dev/);
});

test("deploy branch guard permits production deployment from impladmin and main", () => {
  for (const branch of ["impladmin", "main"]) {
    const permitted = runGuard("production", branch);
    assert.equal(permitted.status, 0, permitted.stderr);
  }

  const rejected = runGuard("production", "dev");
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Allowed branches: impladmin, main/);
});
