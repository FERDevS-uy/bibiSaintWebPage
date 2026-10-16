# Bibi Saint storefront

Astro SSR + React admin interface backed by Supabase and deployed to Cloudflare Workers.

## Featured product suggestions

The admin product page includes **✨ Obtener sugerencias**. Cloudflare Analytics is queried only after an administrator explicitly clicks this button; the browser calls the authenticated `/api/admin/featured-suggestions` route and never receives the Cloudflare credential. Configure these values in the Worker runtime (Cloudflare dashboard or `wrangler secret put`):

- `CLOUDFLARE_API_TOKEN`: API token with permission to read the zone analytics data.
- `CLOUDFLARE_ZONE_ID`: zone identifier for this storefront.

The endpoint queries `httpRequestsAdaptiveGroups` for the trailing 30 days, groups product detail paths (`/producto/{id}`), and ranks them by Cloudflare's `sum.visits` metric for eyeball traffic. This is Cloudflare edge-reported traffic, not unique or verified people. Adaptive Analytics may sample traffic, and availability/query limits depend on the account, zone, token permissions, and Cloudflare retention. The application does not make live Analytics requests until an admin clicks the button. Missing credentials are reported in the admin interface.

Admins can select up to eight products and change their display order. That editorial selection is stored separately in `featured_products` by incremental migration `017_featured_products.sql`; apply the migration before deploying this feature. The storefront uses the selected active catalog products for `¡Destacados!`; an empty or unavailable editorial selection retains the existing catalog fallback.
