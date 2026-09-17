# Bibi Saint — Copilot Instructions

## Project

Bibi Saint is a footwear e-commerce application. The app lives in `code/` and uses Astro 5 SSR on Cloudflare Workers, React islands, and Supabase. Provider scrapers live in `webScrappingTool/`; planning material lives in `openspec/` and `sdd/`.

## Architecture and validation

- Keep SSR enabled (`output: "server"`). Dynamic pages must remain server-rendered; do not introduce `getStaticPaths` for them.
- The public catalog reads exclusively from the Supabase read model; a read-model outage must remain observable rather than silently serving stale CSV data.
- The admin is a React SPA under `code/src/pages/admin/`; sensitive writes remain server-side and use the existing whitelist, trusted-origin validation, and RLS model.
- Client navigation must use `astro:page-load`, never `DOMContentLoaded`.
- Work from `code/` for app commands: `pnpm build`, `pnpm test`, and `pnpm test:unit`. Run the narrowest relevant check before reporting a change.
- TypeScript is strict. Prefer Astro for SSR, CSS modules/scoped CSS, and the existing aliases (`@components`, `@layouts`, `@utils`, `@server`, `@stores`).

## Repository rules

- Read the nearest `AGENTS.md` before changing files; it is the source of truth when this file is less specific.
- Never commit secrets. Do not commit or push unless the user explicitly asks; inspect `git status` and `git diff` first.
- Do not perform remote operations, deployments, or use ambient credentials unless the user explicitly authorizes the destination, operation, and credential/session.
- Reply to the user in Spanish unless they use another language.

## Local Gentle AI policy

This repository's authored policy lives in `.github/instructions/gentle-ai.instructions.md`. Its workspace-scoped Gentle AI assets live under `.copilot/` and `Library/Application Support/Code/User/`; do not move them to user-level Copilot directories. Do not install, enable, update, or configure Gentle AI globally for Copilot or the host machine. If the repository-local `gentle-ai` command is unavailable, report that fact and continue with the normal repository workflow; do not run a global install as a workaround.
