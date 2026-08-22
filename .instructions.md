# Bibi Saint — Copilot Instructions

## Core Principles

- **Token Efficiency First**: Multi-agent orchestration with a coordinator routing to specialists
- **Spanish Communication**: Responder siempre en español
- **No Slop**: Anti-generic design, premium quality output
- **Semantic Alignment**: Mantener coherencia visual y arquitectónica en todo el proyecto

## System Architecture

This workspace uses a **coordinator-specialist** agent pattern:
- **Coordinator Agent** (`@bibi-coordinator`): Analyzes requests, routes to specialists
- **Specialist Agents**: Frontend Designer, Implementation Engineer, QA/Testing, Database Expert
- **Skills**: Domain knowledge modules (design, animations, Supabase, etc.)

## When to Route Tasks

### 🎨 Frontend Design Tasks
Route to `@bibi-designer` if task includes:
- UI/UX design, layout, typography, colors
- Design system decisions
- Visual hierarchy, responsiveness
- Animation/motion effects
- Accessibility review

**Token savings**: Designer uses image-gen skills + design-taste, skips backend context

### 💻 Implementation Tasks  
Route to `@bibi-implementer` if task includes:
- Code changes, refactoring, new features
- Astro components, TypeScript, CSS
- API integration, server logic
- Database migrations (with Supabase skill)

**Token savings**: Implementer focuses on code, skips design philosophy

### 🧪 Testing & Validation Tasks
Route to `@bibi-qa` if task includes:
- Test writing (Playwright, integration tests)
- Bug reproduction, debugging
- Performance validation
- Deployment verification

### 📊 Database & Schema Tasks
Route to `@bibi-dba` if task includes:
- Supabase migrations, RLS policies
- Schema design, indexes, queries
- Data integrity, performance tuning

**Token savings**: DBA uses Postgres best practices skill, focuses narrowly

## Coordinator Responsibilities

When a request comes in, the **Coordinator** must:

1. **Analyze complexity**: Is this multi-discipline? Can it be handled by one specialist?
2. **Route efficiently**: Pick ONE primary agent + optional dependencies
3. **Provide context**: Pass only relevant AGENTS.md + skills to downstream agents
4. **Avoid redundancy**: Don't pass full codebase to every agent
5. **Verify handoff**: Confirm specialist has what they need before handing off
6. **Integrate results**: Combine specialist outputs into final deliverable

## Token Optimization Rules

### ✅ DO
- Use `@mention` to route tasks (agents have focused context)
- Load skills ONLY when needed (e.g., supabase-postgres-best-practices for schema work)
- Pass file excerpts, not entire files
- Reuse specialist context across similar tasks in same conversation

### ❌ DON'T
- Load all skills upfront
- Pass entire AGENTS.md to every agent (coordinator only)
- Ask one agent to be full-stack (violates specialist principle)
- Copy-paste code between agents without explicit routing

## Project Context (Always Available)

**Stack**: Astro 5 SSR + Cloudflare Workers + Supabase + React Islands
**Root**: `/Users/franccesco.giordano/Documents/proyectos personales/bibiSaintWebPage`
**App Root**: `code/` (all source code lives here)
**Deploy**: GitHub Actions → Cloudflare Workers
**Design System**: Red gradient hero, beige/tan background, yellow accents

## Communication Style

- **Spanish first** (user preference)
- **Concise**: Skip unnecessary preamble
- **Action-oriented**: "Aquí está hecho" not "Voy a hacer"
- **Show work**: Explain token-saving decisions when coordinating

---

**Last Updated**: 2026-08-22  
**Coordinator Agent**: `@bibi-coordinator`  
**Skill Cleanup**: Removed 8 irrelevant skills (see AGENTS.md)
