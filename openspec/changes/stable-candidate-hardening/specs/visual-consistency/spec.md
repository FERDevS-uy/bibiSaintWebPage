# Delta for Visual Consistency

## ADDED Requirements

### Requirement: Visible focus for cart actions

Product-card cart actions SHALL expose a visible `:focus-visible` indicator with sufficient contrast when reached by keyboard, without removing the existing pointer interaction.

#### Scenario: Keyboard focus is visible

- **GIVEN** a product card is rendered
- **WHEN** a keyboard user tabs to its cart action
- **THEN** a visible focus indicator identifies the focused control and remains within the card bounds

### Requirement: Programmatic labels for About controls

Every user-editable control on the About form SHALL have a visible label programmatically associated with its control; placeholder text SHALL NOT be the sole label.

#### Scenario: About form labels

- **GIVEN** the About form is rendered
- **WHEN** accessibility inspection resolves each input and textarea
- **THEN** each control has one associated visible label and the association remains valid after hydration

### Requirement: Bounded optional visual polish

Optional CSS or image polish MAY be included only when it is bounded and visually lossless: invalid declarations SHALL be corrected without changing intended appearance, and image optimization SHALL preserve dimensions and rendered fidelity with a measurable bounded reduction.

#### Scenario: Polish is skipped when unsafe

- **GIVEN** a proposed CSS or image optimization cannot prove visual equivalence
- **WHEN** the change is prepared
- **THEN** the optional polish is omitted and functional/accessibility fixes remain unaffected

### Requirement: Focused UI regression coverage

The change SHALL include focused automated checks for backward pagination rendering, cart-action focus visibility, About label associations, and the supported responsive breakpoints.

#### Scenario: UI regression suite

- **GIVEN** the focused UI regression command is executed
- **WHEN** the checks complete at mobile and desktop viewport sizes
- **THEN** navigation state, focus visibility, labels, and breakpoint-specific layout assertions pass without unrelated snapshot churn
