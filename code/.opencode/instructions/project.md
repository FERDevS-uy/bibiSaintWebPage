# Bibi Saint — Core Principles

## Principios core

- **Token Efficiency First**: pipeline agéntico donde el modelo caro solo se usa cuando aporta valor.
- **Spanish Communication**: responder siempre en español.
- **No Slop**: anti-generic design, premium quality output.
- **Semantic Alignment**: mantener coherencia visual y arquitectónica en todo el proyecto.

## Pipeline agéntico

Este workspace usa el pipeline **DISCOVER → DIAGNOSE → PLAN → IMPLEMENT → VERIFY**:

- `coordinator` (router ligero): clasifica y delega en orden. No explora ni implementa.
- `locator`: localiza archivos/líneas/símbolos (barato, read-only).
- `diagnostic`: causa probable + decisión `DIRECT` / `ESCALATE_TO_EXPERT` (intermedio, read-only).
- `expert`: planner de escalación, produce contrato ejecutable (caro, solo cuando diagnostic lo decide).
- `implementer`: aplica el contrato (único editor de producción).
- `qa`: verifica con evidencia (solo tests/evidencia).
- Ramas excepcionales: `security` (read-only), `dba`, `provider-scraper`.

Ruta simple: `coordinator → locator → diagnostic → implementer → qa`
Ruta compleja: `coordinator → locator → diagnostic → expert → implementer → qa`

## Cuándo delegar

- **Bug/feature normal** → pipeline simple.
- **Complejo/incierto/alto riesgo/ambigüedad visual** → pipeline con `expert`.
- **Database/schema/RLS** → pipeline con `dba`.
- **Scrapers/transporte** → pipeline con `provider-scraper`.
- **Auditoría de seguridad** → `security` directo.

Regla de oro: **barato localiza → intermedio diagnostica → caro solo escala → intermedio ejecuta → intermedio verifica.**

## Modelos

Los modelos viven solo en `code/.opencode/opencode.json` (`agent.<name>.model`), desacoplados de los roles. Para cambiar un modelo, se edita `opencode.json`, no los agentes.

## Reglas operativas

1. Presupuestos de `steps` estrictos por agente. Si un agente se agota sin progreso → escala o termina.
2. Escritura secuencial: un solo agente edita a la vez.
3. Máximo 2 ciclos de QA. Retry sin evidencia nueva prohibido.
4. QA independiente con evidencia obligatoria para UI (viewport exacto + screenshot + interacción).
5. El coordinator solo delega; no implementa.
6. `git commit`/`git push` únicamente con autorización explícita del usuario.
7. Contexto narrow: pasar extractos y handoffs, no el repo completo.

## Contexto del proyecto

**Stack**: Astro 5 SSR + Cloudflare Workers + Supabase + React Islands
**Root**: `/Users/franccesco.giordano/Documents/proyectos personales/bibiSaintWebPage`
**App Root**: `code/` (all source code lives here)
**Deploy**: GitHub Actions → Cloudflare Workers
**Design System**: Red gradient hero, beige/tan background, yellow accents

## Estilo de comunicación

- **Spanish first** (preferencia del usuario).
- **Conciso**: sin preámbulos innecesarios.
- **Action-oriented**: "Aquí está hecho" no "Voy a hacer".

---

**Last Updated**: 2026-08-26
**System**: Pipeline DISCOVER → DIAGNOSE → PLAN → IMPLEMENT → VERIFY