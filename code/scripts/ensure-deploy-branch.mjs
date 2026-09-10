import { execFileSync } from "node:child_process";

const allowedBranches = {
  development: ["dev"],
  production: ["impladmin", "main"],
};

function currentBranch() {
  const githubBranch = process.env.GITHUB_REF_NAME?.trim();
  if (githubBranch) return githubBranch;

  try {
    return execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const target = process.argv[2];
const allowed = allowedBranches[target];
if (!allowed) {
  console.error(`Unknown deployment target: ${target || "(missing)"}.`);
  process.exit(2);
}

const branch = currentBranch();
if (!allowed.includes(branch)) {
  console.error(
    `Refusing ${target} deployment from ${branch || "a detached HEAD"}. Allowed branch${allowed.length === 1 ? "" : "es"}: ${allowed.join(", ")}.`,
  );
  process.exit(1);
}

console.log(`Branch guard passed for ${target} deployment on ${branch}.`);
