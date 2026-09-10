# Catalog Runtime Consumers Specification

## Purpose

Define the canonical catalog contract for Astro Cloudflare Worker consumers while the legacy CSV/read-path is retired without changing public routes or payload shapes.

## Requirements

### Requirement: Canonical Worker consumer contract

Worker catalog consumers MUST read from the canonical transactional read model and MUST NOT select, import, or invoke a CSV loader. Product detail MUST use the full transactional Product contract, distinct from reduced card/list projections, while listings and search retain bounded projections.

#### Scenario: Listing and search request

- GIVEN a Worker request for a category, offer, pagination, or search result
- WHEN the consumer loads catalog data
- THEN it uses the canonical bounded read API and preserves the existing public route and payload contract

#### Scenario: Product detail request

- GIVEN an active product detail route
- WHEN the page loads its product
- THEN it receives the full transactional Product contract and does not substitute a reduced card projection or CSV record

### Requirement: Safe degraded navigation

Sidebar and header category consumers MUST remain safe when canonical category data is unavailable. They MUST render a stable degraded navigation state without an unbounded scan, fabricated categories, or a runtime CSV fallback, and MUST emit structured observability for the failure.

#### Scenario: Canonical categories unavailable

- GIVEN the canonical category read fails or times out
- WHEN sidebar or header categories are rendered
- THEN the navigation shell remains usable with an empty or explicitly degraded category state and no CSV load attempt

#### Scenario: Degraded read is observed

- GIVEN a sidebar or header read enters the degraded path
- WHEN the failure is recorded
- THEN telemetry identifies the consumer, canonical source, bounded error class, and request correlation without exposing product data or secrets

### Requirement: Canonical test fixtures

Unit and E2E fixtures MUST exercise canonical catalog sources. Playwright configuration MUST NOT enable CSV fallback, and the test suite MUST prove that runtime consumers have no CSV-loader imports or request-reachable CSV paths.

#### Scenario: Tests run without legacy enablement

- GIVEN the normal unit and Playwright test commands
- WHEN tests execute with no CSV fallback flag
- THEN catalog, navigation, and detail fixtures pass through canonical sources

#### Scenario: Runtime dependency scan

- GIVEN the Worker runtime source and test configuration
- WHEN dependency and import checks run
- THEN no runtime catalog consumer imports a CSV loader and no Playwright fixture enables CSV fallback

### Requirement: Evidence-gated deletion and rollback

Legacy selectors, branches, flags, and runtime telemetry MAY be deleted only after an agreed production observation window reports zero selector decisions and zero runtime CSV load attempts, plus smoke/acceptance checks for listing, search, detail, sidebar, header, and degraded reads. Rollback MUST restore a known-good Worker deployment; toggling the retired flag is not rollback.

#### Scenario: Deletion gate passes

- GIVEN the zero-use window and all required smoke/acceptance checks pass
- WHEN retirement is approved
- THEN legacy runtime code may be removed while public routes and payloads remain unchanged

#### Scenario: Gate or smoke check fails

- GIVEN telemetry is nonzero or a required smoke/acceptance check fails
- WHEN retirement is evaluated
- THEN deletion is blocked and recovery uses the last known-good Worker deployment

### Requirement: Operational CSV boundary

CSV support MUST remain available for scrapers, migration, catalog-sync, and GitHub Pages workflows, but those operational paths MUST NOT become request-time Worker catalog consumers.

#### Scenario: Operational job continues

- GIVEN a scraper, migration, catalog-sync, or GitHub Pages job needs CSV
- WHEN that job runs after Worker retirement
- THEN its CSV input/output behavior remains available and unchanged while the Worker runtime stays canonical-only
