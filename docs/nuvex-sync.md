# Nuvex Sync desde el panel admin — secretos y despliegue

El sync de Nuvex desde el panel admin hace login contra Nuvex **exclusivamente
server-side**. Las credenciales nunca llegan al navegador, al CSV ni al repo.

## Variables (server-only)

| Variable | Scope | Notas |
|----------|-------|-------|
| `NUVEX_USER_EMAIL` | Cloudflare runtime + GitHub Environment | Cuenta Nuvex usada para el scraping |
| `NUVEX_USER_PASS` | Cloudflare runtime + GitHub Environment | Password de la cuenta Nuvex |
| `NUVEX_SYNC_APPLY_ENABLED` | Cloudflare runtime | `"true"` habilita el apply; si no, solo preview (fail-closed) |
| `SYNC_PREVIEW_SECRET` | Cloudflare runtime | Ya usada por Martina; se reutiliza para firmar los previews de Nuvex |

Ninguna de estas variables es `PUBLIC_*`; no deben exponerse al frontend.

## Cloudflare Worker

El worker es `bibisaintwebpage`. Las variables se setean con `wrangler secret put`:

```bash
pnpm --dir code exec wrangler secret put NUVEX_USER_EMAIL --name bibisaintwebpage
pnpm --dir code exec wrangler secret put NUVEX_USER_PASS --name bibisaintwebpage
pnpm --dir code exec wrangler secret put NUVEX_SYNC_APPLY_ENABLED --name bibisaintwebpage
pnpm --dir code exec wrangler secret put SYNC_PREVIEW_SECRET --name bibisaintwebpage
```

## GitHub Environment `production`

Para el workflow `catalog-sync` (y cualquier job que necesite scrapear Nuvex):

- `NUVEX_USER_EMAIL`
- `NUVEX_USER_PASS`

Se configuran como **secrets** del GitHub Environment `production` (nunca como
variables públicas ni en el repo).

## Local

En `code/.env` (ignorado por Git):

```env
NUVEX_USER_EMAIL="tu-email"
NUVEX_USER_PASS="tu-password"
NUVEX_SYNC_APPLY_ENABLED="false"
SYNC_PREVIEW_SECRET="secreto-largo-local"
```

En `webScrappingTool/.env` si vas a probar el scraper CLI por separado:

```env
NUVEX_USER_EMAIL="tu-email"
NUVEX_USER_PASS="tu-password"
```

## Notas de seguridad

- Se usan únicamente `NUVEX_USER_EMAIL` / `NUVEX_USER_PASS` (se eliminó el
  fallback genérico `USER_EMAIL` / `USER_PASS`).
- No se inyectan secretos en jobs de GitHub que no ejecutan el scraper.
- No se imprime ni commitea ninguna variable de entorno.
