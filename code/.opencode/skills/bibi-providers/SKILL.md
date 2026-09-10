---
name: bibi-providers
description: Project-specific provider ingestion and live-price rules for Bibi Saint. Load when changing scrapers, provider transport/parsing, catalog sync, CSV fallback, or live price behavior.
---

# Bibi Providers

Use this skill for Bibi-specific provider pipelines and runtime price flows.

## Load This Skill When

- You edit `../webScrappingTool/` scraper code.
- You update provider parsing/transport for Martina, Kai, Alondra, or Nuvex.
- You change CSV catalog sync or fallback behavior.
- You modify server-side live price providers, markup, or timeout handling.
- You touch Nuvex admin preview/apply integration.

## Project Paths

- `../webScrappingTool/src/scrapers/`
- `../webScrappingTool/src/`
- `../webScrappingTool/package.json`
- `code/src/data/productos.csv`
- `code/src/server/providers/`
- `code/src/server/providers/nuvex/`
- `code/src/server/providers/nuvexSync.ts`
- `code/src/server/livePrice.ts`
- `code/src/utils/loadProducts.ts`

## Provider Scope

- Providers in scope: Martina, Kai, Alondra, Nuvex.
- Keep parser output stable enough for downstream catalog and pricing consumers.
- Preserve CSV fallback behavior used when primary data-source paths fail.

## Runtime and Transport Rules

- Keep provider fetch logic worker-friendly.
- Preserve anti-SSRF guardrails and outbound request limits in provider code.
- Respect provider-specific rate limits and pacing requirements to avoid throttling or bans.
- Keep provider credentials server-side only.
- Respect timeout and resilience behavior in live price fetch flows.
- Preserve markup application rules in live price responses.
- Avoid unnecessary heavy dependencies in Worker runtime paths (for example, do not introduce Cheerio where lightweight parsing is sufficient).

## Nuvex-Specific Invariants

- Preserve server-side login and credential handling.
- Preserve preview/apply separation with revalidation on apply.
- Preserve signed-preview constraints (TTL/one-shot/actor binding) already enforced in project flow.

## Verification Commands

- Run catalog sync verification after scraper changes: `pnpm run providers:sync` (from `code/`).
- Run relevant tests for provider and catalog behavior after parser/transport changes.

## Cross-Skill Guidance

- Use this skill with `bibi-security` when provider changes affect token handling, origin checks, or SSRF exposure.
