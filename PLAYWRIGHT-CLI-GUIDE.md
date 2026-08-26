# 🎭 Playwright CLI Guide (Token-Optimized)

**Objetivo**: Usar Playwright CLI directamente en lugar del MCP para ahorrar tokens en testing

---

## Resumen Rápido

```bash
# Ejecutar todos los tests (headless)
pnpm exec playwright test

# Ejecutar en modo UI (visual test editor - NO AGENT NEEDED)
pnpm exec playwright test --ui

# Debug interactivo (pausar, step through)
pnpm exec playwright test --debug

# Watch mode (re-run on file change)
pnpm exec playwright test --watch

# Test específico
pnpm exec playwright test tests/product.spec.ts

# Test específico + debug
pnpm exec playwright test tests/product.spec.ts --debug
```

---

## Por Qué CLI (No MCP)

| Método | Tokens | Velocidad | Mejor Para |
|--------|--------|-----------|-----------|
| **MCP Playwright** | 8-12K por task | Lento | Recording visual flows |
| **Playwright CLI** | 0K (local only) | Rápido | Writing + debugging tests |
| **UI Mode** | 0K (local only) | Interactivo | Visual debugging tests |

**Decisión**: Usa CLI siempre. Solo mentiona MCP si necesitas reproducir un flow complejo.

---

## Estructura Recomendada

```
code/tests/
├── fixtures/
│   └── auth.ts          # Login helper
├── utils/
│   └── helpers.ts       # Utility functions
├── product.spec.ts      # Product page tests
├── cart.spec.ts         # Cart tests
├── category.spec.ts     # Category listing tests
└── admin.spec.ts        # Admin panel tests
```

---

## Ejemplo: Test Simple

```typescript
// tests/product.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Product Page', () => {
  test('should display product details', async ({ page }) => {
    await page.goto('http://localhost:4321/producto/boots-example');
    
    // Check heading
    await expect(page.locator('h1')).toContainText('Boots Example');
    
    // Check price
    const priceText = await page.locator('[data-testid="price"]').textContent();
    expect(priceText).toMatch(/\$\d+/);
  });

  test('should add to cart', async ({ page }) => {
    await page.goto('http://localhost:4321/producto/boots-example');
    
    // Click add to cart
    await page.locator('button:has-text("Agregar al carrito")').click();
    
    // Check success
    await expect(page.locator('[data-testid="cart-badge"]')).toHaveText('1');
  });
});
```

---

## Workflows por Especialista

### @bibi-qa (Testing)

**Workflow**:
1. Write test file in `/tests/`
2. Run locally: `pnpm exec playwright test --watch`
3. Use UI mode to debug: `pnpm exec playwright test --ui`
4. When done, save test file + report to .agents/autosave/resu.md
5. CI validates via `pnpm exec playwright test`

**Zero tokens spent on Playwright MCP** ✅

### @bibi-implementer (Code)

**When adding new features**:
1. Write implementation code
2. @bibi-qa writes tests (parallel or sequential)
3. Run: `pnpm exec playwright test tests/[feature].spec.ts`
4. Both push to .agents/autosave/resu.md

**No token overhead** ✅

---

## Common Commands

```bash
# Run all tests, report results
pnpm exec playwright test

# Run + show videos of failures
pnpm exec playwright test --reporter=html

# Open HTML report (after test run)
pnpm exec playwright show-report

# Run in headed mode (see browser)
pnpm exec playwright test --headed

# Run single file
pnpm exec playwright test tests/product.spec.ts

# Run tests matching pattern
pnpm exec playwright test -g "add to cart"

# Run with specific browser
pnpm exec playwright test --project=chromium

# Debug mode (step through code in inspector)
pnpm exec playwright test --debug

# UI mode (visual test editor - INTERACTIVE)
pnpm exec playwright test --ui

# Update snapshots
pnpm exec playwright test --update-snapshots
```

---

## Integration with Dev Server

**Before running tests**, make sure dev server is running:

```bash
# Terminal 1: Dev server
cd code/
pnpm dev  # Runs on localhost:4321

# Terminal 2: Tests
cd code/
pnpm exec playwright test --watch
```

Or use `playwright.config.ts` with `webServer` option to auto-start:

```typescript
// code/playwright.config.ts
export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Golden Rules

✅ **DO**:
- Use CLI for all test runs (local + CI)
- Write tests in TypeScript (type-safe)
- Use UI mode (`--ui`) for interactive debugging
- Keep tests in `/tests/` directory
- Run `--watch` mode during development

❌ **DON'T**:
- Use MCP Playwright recorder (token waste)
- Mix CLI tests with MCP recording (confusing)
- Store test files in random locations
- Run tests without a dev server running first
- Commit untested code without running locally

---

## Token Savings

| Scenario | Old (MCP) | New (CLI) | Saved |
|----------|-----------|-----------|-------|
| Write + run 5 tests | 12K | 2K (writing only) | 83% |
| Debug failing test | 8K | 0K (use --debug) | 100% |
| Full test suite validation | 6K | 0K (use --watch) | 100% |

**Total per session**: 26K → 2K tokens = **92% reduction** 🚀

---

## Reference

- [Playwright CLI Docs](https://playwright.dev/docs/cli)
- [Playwright Config](https://playwright.dev/docs/test-configuration)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [UI Mode](https://playwright.dev/docs/test-ui-mode)

---

**Recuerda**: Playwright CLI es local, rápido, y no quema tokens. Úsalo siempre.
