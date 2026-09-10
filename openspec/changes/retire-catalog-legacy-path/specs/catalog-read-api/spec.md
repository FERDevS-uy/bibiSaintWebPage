# Delta for Catalog Read API

## MODIFIED Requirements

### Requirement: Fallback seguro y acotado

Canonical public catalog reads MUST use the bounded read model as their only Worker-runtime source. A read-model failure MUST produce an observable, bounded temporary error; consumers MAY render an explicitly degraded state, but the Worker MUST NOT select, import, or invoke a CSV fallback. No public production request SHALL download or scan the full catalog, and the retired fallback flag SHALL NOT restore runtime behavior. (Previously: The read model could use an explicitly enabled, bounded CSV fallback outside the production default.)

#### Scenario: Read model unavailable

- GIVEN the canonical read model cannot be queried
- WHEN a public catalog API receives the request
- THEN it returns an observable temporary error or bounded degraded response without executing a CSV load or full JavaScript scan

#### Scenario: Fallback CSV explicitly configured

- GIVEN an operator sets ENABLE_CSV_FALLBACK=true in any runtime environment
- WHEN a Worker catalog request is handled after retirement
- THEN the flag is ignored or rejected as retired, the canonical-only contract remains enforced, and structured telemetry records the attempted legacy configuration

#### Scenario: Runtime loader proof

- GIVEN the Worker runtime source, tests, and build inputs
- WHEN import and dependency checks run before deletion
- THEN no request-reachable catalog path imports a CSV loader and no test enables CSV fallback
