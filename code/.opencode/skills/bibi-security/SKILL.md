---
name: bibi-security
description: Project-specific security controls for Bibi Saint. Load when auditing or changing admin APIs, auth, RLS, origin checks, provider integrations, or abuse protections.
---

# Bibi Security

Use this skill for Bibi-specific security behavior. It complements Gentle reviewers (`review-risk`, `review-reliability`, `review-resilience`) with concrete project controls.

## Integración con Gentle AI

Esta skill aporta contexto y controles específicos de Bibi Saint. Las revisiones genéricas se ejecutan mediante las lentes globales `review-risk`, `review-reliability` y `review-resilience`, con `review-refuter` y `review-validator` cuando el flujo nativo los solicite. No duplica la política global ni funciona como un agente.

## Load This Skill When

- You modify admin pages or admin APIs under `code/src/pages/admin/` or `code/src/pages/api/admin/`.
- You change Supabase auth/session/write flows.
- You touch server-side provider integrations, especially Nuvex flows.
- You update middleware-level abuse protections, CSP, or request validation.

## Project Paths

- `code/src/pages/admin/`
- `code/src/pages/api/admin/`
- `code/src/components/admin/`
- `code/src/server/adminWhitelist.ts`
- `code/src/server/security/origin.ts`
- `code/src/server/providers/nuvexSync.ts`
- `code/src/server/providers/nuvex/security.ts`
- `code/src/middleware.ts`
- `code/supabase/migrations/002_security_hardening.sql`
- `code/supabase/migrations/004_nuvex_sync.sql`

## Security Invariants

- Keep mass-assignment protection enforced through writable-column whitelisting (`pickWritable`).
- Keep trusted origin/referrer checks enforced for admin write surfaces.
- Preserve RLS boundaries and avoid widening public access.
- Keep service role usage server-side only; never expose privileged credentials to client code.
- Preserve one-shot/TTL semantics for Nuvex preview/apply tokenized actions.

## Threat Areas to Check

- CSRF and cross-origin abuse on admin mutation endpoints.
- XSS sinks (`innerHTML`, `set:html`, `dangerouslySetInnerHTML`) in admin/user-facing flows.
- SSRF and outbound fetch hardening in provider clients/parsers.
- Rate limiting and endpoint-specific abuse controls in middleware.
- Storage/table hardening assumptions introduced by migrations.

## Assessment Discipline

- Do not claim a protection is in place without direct evidence in code, configuration, or runtime behavior.
- Prioritize issues by exploitability and impact first, not by checklist order.
- When evidence is incomplete or ambiguous, mark findings explicitly as `Needs validation`.
- Prefer minimal, targeted fixes first; avoid broad refactors unless needed to close the risk.

## Cloudflare and Secrets Rules

- Keep runtime secrets only in server-side env vars and worker secret stores.
- Do not move credentials to client-bundled `PUBLIC_*` surfaces.
- Preserve security headers and restrictive defaults from middleware unless intentionally revised.

## Verification Checklist

- Admin authn/authz still blocks unauthorized writes.
- Origin/referrer validation still protects admin mutation routes.
- Nuvex preview/apply flow keeps TTL, actor-bound, and one-shot constraints.
- RLS and storage hardening behavior remains intact after changes.
- Rate limits still match endpoint risk levels.
