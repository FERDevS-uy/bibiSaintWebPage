# Bibi Saint — Core Principles

## Principios core

- **Token Efficiency First**: usar la ruta mínima suficiente y reservar modelos caros para revisión/escalación.
- **Spanish Communication**: responder siempre en español.
- **No Slop**: anti-generic design, premium quality output.
- **Semantic Alignment**: mantener coherencia visual y arquitectónica.

## Pipeline agéntico v4

Roles:

- `coordinator`: clasifica y rutea. No explora ni implementa.
- `locator`: ubica targets read-only.
- `diagnostic`: confirma causa cuando realmente hace falta.
- `expert`: planner senior solo por escalación.
- `implementer`: único editor de producción.
- `qa`: verificación mecánica/evidencia con modelo barato.
- `reviewer`: firma semántica final con modelo fuerte para cambios no triviales.
- ramas excepcionales: `security`, `dba`, `provider-scraper`.

Rutas:

```text
FAST_KNOWN:     implementer → qa
FAST_LOCATE:    locator → implementer → qa
PRE_DIAGNOSED:  implementer → qa → reviewer
NORMAL:         locator → diagnostic → implementer → qa → reviewer
COMPLEX:        locator → diagnostic → expert → implementer → qa → reviewer
```

Regla de oro: **gratis hace el trabajo repetitivo; Luna entra solo donde aporta juicio final o resolución difícil**.

## Modelos

La única fuente de modelos es `code/.opencode/opencode.json`.

## Reglas operativas

1. `steps` reales configurados por agente.
2. No duplicar diagnóstico ya entregado por el usuario.
3. Escritura secuencial: un solo editor.
4. Máximo 2 ciclos de corrección.
5. QA proporcional al riesgo; reviewer no rediagnostica.
6. `git commit`/`git push` solo con autorización explícita.
7. Contexto narrow: handoffs compactos, no dumps del repo.

## Contexto del proyecto

**Stack**: Astro 5 SSR + Cloudflare Workers + Supabase + React Islands  
**Root**: `/Users/franccesco.giordano/Documents/proyectos personales/bibiSaintWebPage`  
**App Root**: `code/`  
**Deploy**: GitHub Actions → Cloudflare Workers  
**Design System**: Red gradient hero, beige/tan background, yellow accents

## Estilo

- Español.
- Conciso.
- Action-oriented.

**Last Updated**: 2026-09-03
**System**: Free-first adaptive pipeline + senior review gate
