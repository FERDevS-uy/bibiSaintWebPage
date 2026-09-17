# Proposal: Stable Candidate Hardening

## Intent

Harden candidate `c915f1f` against base `3805d5d` by fixing release-blocking navigation, bounded-data, resilience, and accessibility defects. Baseline: 138 unit tests pass, Playwright discovers 65 tests, and shared `.vite` permissions block `astro check`.

## Scope

### Must-Fix Release Blockers
- Keep previous-page URLs, cursor state, and rendered products consistent.
- Replace `/pedido` full-catalog enrichment with an ID-bounded lookup.
- Cache successful markup settings only; Supabase errors must not cache defaults for five minutes.
- Degrade related-product failures without failing product pages; preserve upstream errors as non-404 responses.
- Restore visible keyboard focus for product-card cart actions and associate labels with About form controls.
- Add focused pagination, resilience, and responsive UI regressions.

### Optional Polish
- Correct invalid `font-weight: 600,` CSS.
- Optimize `code/src/assets/colibri-404.png` only when bounded and visually lossless.
- Apply evidence-backed responsive refinements.

### Not Included
- Architecture rewrites, migrations, redesign, deployment, and unrelated cleanup.

## Capabilities

### New Capabilities
- `order-product-enrichment`: Resolve order product data through bounded ID requests.
- `storefront-resilience`: Define cache failure behavior and optional dependency degradation.

### Modified Capabilities
- `catalog-read-api`: Add consistent backward cursor navigation and distinguish upstream failures from missing products.
- `visual-consistency`: Require cart-action focus, About labels, and verified responsive behavior.

## Approach

Extend existing catalog contracts and query boundaries. Reuse the `focus-visible` pattern in `code/.opencode/autosave/resu.md`. Route backend work to `@bibi-implementer` and UI work to `@bibi-designer`; converge through regressions.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `code/src/server/catalog/`, `code/src/server/products.ts` | Modified | Cursor, lookup, error contracts |
| `code/src/server/providers/markupSettings.ts` | Modified | Trustworthy cache writes |
| `code/src/pages/pedido.astro`, `code/src/pages/producto/[id].astro` | Modified | Enrichment and degradation |
| `code/src/components/`, `code/src/pages/about.astro` | Modified | Accessible UI polish |
| `code/tests/` | Modified | Unit and Playwright regressions |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cursor and URL diverge | Medium | Test forward/back sequences and reloads |
| Errors mask outages | Medium | Separate 404, upstream, and optional failures |
| Asset loses quality | Low | Compare dimensions and rendering |

## Rollback Plan

Revert by work unit; restore the original asset if visual verification fails.

## Dependencies

- Existing catalog APIs and Supabase client.
- Resolve the `.vite` permission issue before claiming `astro check` passes.

## Success Criteria

- [ ] Previous navigation preserves matching URL, cursor, and products.
- [ ] `/pedido` fetches only requested product IDs.
- [ ] Supabase failures remain retryable; related failures do not break product pages.
- [ ] Upstream failures are not reported as 404s.
- [ ] Keyboard focus and About labels meet WCAG 2.1 AA.
- [ ] Focused regressions pass; `astro check` is rerun after unblocking.
