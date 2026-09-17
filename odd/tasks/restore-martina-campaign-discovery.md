# Restore Martina campaign discovery

## Objective
Restore automatic discovery of Martina's active campaign so previews and the Martina-only price/stock endpoint can reach the upstream catalog.

## Problem and Why
Martina's configuration endpoint returns `SIN CONFIGURACION` with only `countryId=598`; an authorized live probe verified it returns a valid campaign when the seller context `sellerCode=U20371400` is supplied.

## Authorized Scope
- Add the seller context to the Martina configuration request.
- Add focused regression coverage for the generated configuration URL.
- Let the Martina-only price/stock endpoint query a discovered campaign before its validFrom, matching the upstream storefront.
- Let the read-only Martina preview query a discovered campaign before its validFrom, while keeping apply blocked.
- Preserve existing Martina parent categories (such as MUJER) when they are valid, while retaining explicit handling for non-public parents.
- Compare category names semantically so casing alone does not create a manual assignment.
- Keep already categorized Martina products in their existing internal category, even when Martina sends a non-public external parent/category.
- For new Martina products with an unrecognized external category, require a destination subcategory under Mujer or Hombre only.
- Run the focused Martina provider tests.

## Constraints
- Preserve automatic campaign discovery and validity enforcement.
- Do not hard-code a campaign code.
- Do not change unrelated provider behavior.
- Keep apply synchronization protected by campaign validity.

## TDD
Disabled/unmanaged: no project or session TDD configuration was found. Runner: `pnpm test:unit` (focused file invocation used for this task).

## Acceptance Criteria
- [x] `fetchMartinaConfig()` includes `countryId=598` and `sellerCode=U20371400`.
- [x] Existing preview and product-price paths keep deriving the campaign from configuration.
- [x] Focused Martina tests pass.
- [x] The Martina-only price/stock endpoint queries a future campaign; apply synchronization still enforces validity.
- [x] The read-only Martina preview queries a future campaign; apply remains blocked by campaign validity.
- [x] Existing valid Martina parent categories do not create manual assignments; non-public parent categories still follow the discrepancy path.
- [x] Existing Martina products retain their internal category; external categories do not trigger reassignment decisions.
- [x] New Martina products with unrecognized external categories can be assigned only to an existing Mujer/Hombre subcategory.

## Tasks
- [x] MCD-1 Add seller context to Martina config discovery and regression-test the URL.
- [x] MCD-7 Add seller context to every Martina catalog request used by preview.
- [x] MCD-2 Permit Martina-only price/stock lookup before campaign activation without weakening preview validation.
- [x] MCD-3 Permit read-only preview before campaign activation without permitting apply.
- [x] MCD-4 Preserve valid Martina parent categories and compare category names semantically.
- [x] MCD-5 Preserve existing internal categories for Martina products.
- [x] MCD-6 Restrict new-product Martina category assignment to Mujer/Hombre subcategories.

## Progress and Evidence
- RED observed: the focused test failed because the configuration URL omitted `sellerCode`.
- GREEN observed: `node --experimental-strip-types --test tests/martina-sync.test.ts` passed 68/68 for MCD-1 and 69/69 after MCD-2 and 70/70 after MCD-3 and 71/71 after MCD-4 and MCD-5.
- `git diff --check` passed.
- Local Astro validation: `GET /api/martina/product-price?productId=43311` reached campaign validation and returned `502 {"error":"Campaña Martina no vigente"}`. This proved configuration discovery succeeds before MCD-2.
- MCD-2 local validation: `GET /api/martina/product-price?productId=43311` returned 200 with price `690`, `inStock: true`, color NEGRO, sizes M/L/XL/XXL, and campaign `202609` before campaign activation. Apply retains its separate validity guard in `syncMartina()`.
- MCD-3 test validation: read-only preview succeeds for a future campaign and exposes `vigente: false`; apply rejects that same signed preview as not vigente.
- MCD-4 test validation: a stored `MUJER → ROPA INTERIOR` product with Martina parent `MUJER → ROPA INTERIOR` remains unchanged despite casing.
- MCD-5 test validation: an existing internal `Carteras` product remains unchanged when Martina reports `Complemento → Accesorios`; category overrides for existing Martina products are rejected.
- MCD-6 test validation: a new `Complemento → Accesorios` product requires a decision, accepts only a current `Ropa > Mujer/Hombre` subcategory, and rejects a non-existent destination; new `MUJER`/`HOMBRE` products need no decision. The UI and preview/apply APIs obtain the allowed destinations from the current internal taxonomy and revalidate them on apply. Focused test suite passed 73/73.
- Follow-up discovery: the working browser request includes `sellerCode=U20371400` on `store/product`, while the code previously included it only on `ecommerce/config`. The preview's catalog calls therefore lacked the required seller context.
- MCD-7 test validation: all product catalog request shapes (campaign, product line, and product detail) now include `sellerCode=U20371400`; the focused suite passed 73/73.

## Next Step
Commit the MCD-7 follow-up, then deploy only with explicit Cloudflare-session authorization.
