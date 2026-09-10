# Storefront Resilience Specification

## Purpose

Keep optional storefront enhancements from masking source failures or making transient settings errors sticky.

## Requirements

### Requirement: Successful-only markup cache

Markup settings SHALL be written to cache only after a successful provider response. A provider error SHALL NOT cache defaults or refresh a success entry with defaults for the cache TTL; when no valid cached success exists, the next request SHALL be able to retry the provider.

#### Scenario: Provider failure does not poison cache

- **GIVEN** no valid cached markup settings exist
- **WHEN** the settings provider fails
- **THEN** the request uses the documented fallback/error behavior and no default value is cached as a successful result

#### Scenario: Successful settings remain reusable

- **GIVEN** the provider returns valid settings
- **WHEN** the settings are read again within the configured TTL
- **THEN** the successful settings may be served from cache without another provider call

### Requirement: Graceful optional and upstream failures

A related-product failure SHALL degrade only the related section and SHALL NOT fail an otherwise valid product page. A primary product missing from the source SHALL return 404, while an upstream or database failure SHALL preserve a non-404 temporary error for retry.

#### Scenario: Related products unavailable

- **GIVEN** the primary product is valid and the related-product lookup fails
- **WHEN** the product page renders
- **THEN** the page remains successful and renders an empty or omitted related section

#### Scenario: Primary source failure classification

- **GIVEN** a product detail request
- **WHEN** the source confirms absence, or instead reports an upstream failure
- **THEN** absence returns 404 and the upstream failure returns a bounded non-404 temporary response

### Requirement: Focused regression coverage

The change SHALL include automated regressions for successful-only markup caching, optional related-product degradation, and distinct missing-versus-upstream responses.

#### Scenario: Resilience regressions run

- **GIVEN** the focused regression command is executed
- **WHEN** the resilience tests complete
- **THEN** each listed behavior is asserted without requiring a full-catalog fixture or external deployment
