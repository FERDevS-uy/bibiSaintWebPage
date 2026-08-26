# Bibi Saint — Copilot Orchestration Harness

## Quick Reference

```
┌─────────────────────────────────────────────────────────┐
│ COORDINATOR DECISION TREE                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Request → Is it about visual/UX/animation?              │
│    YES → @bibi-designer + load design-taste skills    │
│    NO  → Next question                                  │
│                                                          │
│       → Is it about code/features/bugs?                 │
│    YES → @bibi-implementer + full codebase context     │
│    NO  → Next question                                  │
│                                                          │
│       → Is it about testing/validation?                 │
│    YES → @bibi-qa + runtime-validation skill           │
│    NO  → Next question                                  │
│                                                          │
│       → Is it about database/schema/RLS?                │
│    YES → @bibi-dba + supabase-postgres-best-practices  │
│    NO  → Uncertain → Ask for clarification             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Context Management Per Agent

### 🎨 Designer Context (Minimal)
```
Load: Design skills only
Skip: Backend code, database schema, implementation details
Include: Design system, color palette, existing UI patterns
Keep: Visual consistency rules, brand guidelines
```

### 💻 Implementer Context (Full)
```
Load: Full codebase context, architecture
Skip: Detailed design specs (link to design output)
Include: AGENTS.md (architecture), tsconfig, build config
Keep: API contracts, data models, deployment architecture
```

### 🧪 QA Context (Focused)
```
Load: runtime-validation skill, test examples
Skip: Non-test code, design philosophy
Include: Test file locations, existing test patterns
Keep: Deployment config, environment setup
```

### 📊 DBA Context (Ultra-Narrow)
```
Load: supabase-postgres-best-practices skill
Skip: Frontend code, UI components
Include: Migration files, RLS policies, schema
Keep: Performance requirements, data integrity rules
```

## Token Optimization Decisions

### ✅ These SAVE tokens:
1. **Route early**: Don't load full context if one agent handles it
2. **Specialist skills only**: Designer doesn't need DBA skill
3. **File excerpts**: Pass line ranges, not entire files
4. **Reuse context**: Same specialist across multiple tasks in conversation
5. **Direct mentions**: `@bibi-implementer` skips coordinator overhead

### ❌ These WASTE tokens:
1. Monolithic agent handling 3 disciplines
2. Loading all 11 skills upfront
3. Passing 10KB files when 200B excerpt suffices
4. Coordinator re-analyzing every message
5. Asking one agent to learn full stack context

## Multi-Task Integration Pattern

When ONE REQUEST needs MULTIPLE specialists:

```
User: "Rediseña el flujo de checkout Y arregla el bug del carrito"

Coordinator:
1. Parse: 2 tasks (design + implementation)
2. Route designer: "Spec the checkout flow visually"
3. Route implementer: "Fix bug + implement new checkout"
4. Wait for both outputs
5. Integrate: 
   - Designer output → CSS + component structure
   - Implementer output → TypeScript + server logic
   - Result: One coherent checkout feature
```

## When Task Spans Disciplines

Example: "El carrito no guarda datos entre pestañas"

1. **Initial diagnosis** (QA): Bug is localStorage not syncing
2. **Root cause** (Implementer): `renderCart.ts` missing storage listener
3. **Integration test** (QA): Verify multi-tab sync works
4. **Final validation**: Deploy to staging

→ Route: QA → Implementer → QA (not monolithic)

## Rules for Each Agent Role

### Coordinator MUST
- [ ] Analyze before routing
- [ ] Pass minimal context to specialists
- [ ] Confirm specialist has what they need
- [ ] Integrate outputs without re-running work
- [ ] Track which specialist owns what

### Designer MUST
- [ ] Load design-taste + image-gen skills
- [ ] Output: Figma spec OR design document OR images
- [ ] NOT write production code
- [ ] Provide clear CSS/Astro implementation notes
- [ ] Flag accessibility issues

### Implementer MUST
- [ ] Load full architecture context
- [ ] Output: Working code + tests
- [ ] Follow design spec from Designer
- [ ] NOT re-design (defer to Designer)
- [ ] Optimize for performance & bundle size

### QA MUST
- [ ] Load runtime-validation skill
- [ ] Output: Test suite + validation report
- [ ] Verify across browsers & devices
- [ ] NOT write feature code (defer to Implementer)
- [ ] Confirm design intent is met

### DBA MUST
- [ ] Load Postgres best practices skill
- [ ] Output: Migration + tests + performance analysis
- [ ] Maintain RLS security model
- [ ] NOT write application code
- [ ] Document all schema changes

## Conversation State

Track across messages:
```json
{
  "current_agents": ["@bibi-designer"],
  "active_specialists": {
    "designer": "working on checkout redesign",
    "implementer": "idle",
    "qa": "idle",
    "dba": "idle"
  },
  "context_loaded": ["design-taste-frontend", "imagegen-frontend-web"],
  "reuse_next": ["designer context", "checkout files"]
}
```

**Action**: On NEXT request, reuse designer context if related to checkout

## Example: Full Workflow

**User**: "Necesito un nuevo panel de administrador de pedidos"

**Coordinator decides**:
- Complexity: HIGH (UI + backend + tests)
- Route: Designer → Implementer → QA

**Step 1 - Designer** (20 min, 8K tokens)
- Load: `design-taste-frontend`, `imagegen-frontend-web`
- Output: 3 design images (list view, detail view, bulk actions)
- Writes: CSS structure, component blueprint, accessibility notes
- Saves: Implementer doesn't re-design

**Step 2 - Implementer** (40 min, 20K tokens)
- Load: Full codebase, designer output (linked)
- Takes: Design CSS + blueprint
- Writes: React components, admin API endpoints, server logic
- Tests: Unit tests for main logic
- Saves: QA has working code to validate

**Step 3 - QA** (15 min, 10K tokens)
- Load: runtime-validation skill, test examples
- Takes: Implementer code
- Writes: E2E tests (Playwright), edge case tests
- Tests: Multi-user concurrent access, permission matrix
- Output: QA report + test suite

**Total**: 38K tokens vs. 60K+ for monolithic agent

---

## When to Break This Pattern

1. **Trivial requests** (< 5 min): Skip coordinator, go direct
   ```
   "Cambia el color del botón a rojo" → Just implement
   ```

2. **Emergency fix**: Implementer handles alone
   ```
   "¿Por qué no cargan los productos?" → Quick debug
   ```

3. **One-discipline tasks**: No routing needed
   ```
   "Crea un test para la búsqueda" → QA directly
   ```

---

**Version**: 1.0  
**Effective**: 2026-08-22  
**Token Baseline**: ~15-40K per feature (vs. 50K+ monolithic)  
**Target**: 30-40% reduction in token consumption
