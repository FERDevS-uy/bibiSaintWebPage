# Selected safe agent and storefront commits

## Goal
Commit only the user-selected agent definitions and storefront README/config/test group, without touching unrelated dirty files.

## Tasks
- [x] Add root `.agents/` to `.gitignore`; security-audit and commit only safe `.github/agents/*.agent.md` files with that ignore rule.
- [x] Verify `README.md`, `wrangler.jsonc`, and `storefront-layout-source.test.ts` as a coherent separate work unit.
- [ ] Commit only the requested paths in separate Conventional Commits; exclude deleted task docs and all unrelated changes.

## User constraints
- Never include `.agents/` assets in commits; ignore them.
- `.github/agents/*.agent.md` may be committed only after a security/privacy audit.
- Do not commit `odd/tasks/kai-deco-catalog-pagination.md` or other deleted task records.
- Preserve all other unrequested dirty and untracked work, including Supabase MCP/migration files.

## Evidence
- Read-only audit of four agent files found no credentials, PII, internal endpoints/IDs, security-weakening or exfiltration instructions; workflow paths are disclosed.
- Focused `storefront-layout-source.test.ts`: 2/2 passed after aligning its assertions with existing source.
- `git diff --check` for `.gitignore`: clean; test whitespace check clean.
- Secret review of README/Wrangler diff found no credentials; Worker token is documented as a runtime secret, and zone ID is a non-secret identifier.
- Commit identities pending.
