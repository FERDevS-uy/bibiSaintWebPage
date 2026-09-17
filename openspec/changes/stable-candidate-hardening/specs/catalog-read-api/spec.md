# Delta for Catalog Read API

## MODIFIED Requirements

### Requirement: Lectura paginada de productos

The public API SHALL return at most the requested page size within configured limits and SHALL support opaque cursors for forward and backward navigation. Ordering SHALL remain stable and deterministic through an order key and tie-breaker; a navigation response SHALL keep its URL, cursor metadata, and rendered products mutually consistent. (Previously: The API supported a cursor only to continue after the last item.)

#### Scenario: Primera página

- **GIVEN** a category request without a cursor
- **WHEN** the first page is requested
- **THEN** the response contains only the bounded first page, `hasMore`, and a continuation cursor when more results exist

#### Scenario: Página siguiente

- **GIVEN** a stable logical snapshot and a page loaded with its continuation metadata
- **WHEN** the client advances one page
- **THEN** the response continues after the represented element without duplicates or skipped items

#### Scenario: Navegación hacia atrás

- **GIVEN** a page reached through a valid continuation cursor
- **WHEN** the client requests the previous page, including after a reload
- **THEN** the previous URL, cursor state, and products match the original page under the same snapshot

#### Scenario: Cursor inválido

- **GIVEN** a malformed, expired, or filter-incompatible cursor
- **WHEN** the API receives it
- **THEN** it returns a client error and never falls back to an unbounded query

### Requirement: Fallback seguro y acotado

A read-model failure SHALL produce an observable bounded temporary error, while a missing product SHALL remain a 404. An upstream or database failure SHALL use a non-404 error that permits retry. CSV fallback SHALL remain disabled by default and SHALL NOT activate automatically or scan the full catalog in a public production request. (Previously: A read-model failure could return an explicitly limited fallback without requiring distinct missing-product and upstream-error semantics.)

#### Scenario: Read model no disponible

- **GIVEN** the read model cannot be queried
- **WHEN** a public catalog API receives the request
- **THEN** it returns an observable bounded temporary error without executing an unbounded JavaScript scan

#### Scenario: Producto ausente

- **GIVEN** a product lookup request
- **WHEN** the source confirms no matching product
- **THEN** the API returns 404

#### Scenario: Fallo upstream

- **GIVEN** a product lookup request
- **WHEN** the source cannot be reached or reports an upstream failure
- **THEN** the API returns a bounded non-404 temporary error that permits retry

#### Scenario: Fallback CSV explícito

- **GIVEN** an operator sets `ENABLE_CSV_FALLBACK=true` in an authorized environment
- **WHEN** a public catalog request is handled
- **THEN** any fallback remains explicitly bounded and observable, and a transient Supabase failure does not trigger a full CSV scan
